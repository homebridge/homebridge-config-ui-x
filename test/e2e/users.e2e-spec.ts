import * as path from 'path';
import * as fs from 'fs-extra';
import { authenticator } from 'otplib';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { UsersModule } from '../../src/modules/users/users.module';
import { UserDto, UserUpdatePasswordDto, UserActivateOtpDto, UserDeactivateOtpDto } from '../../src/modules/users/users.dto';

describe('UsersController (e2e)', () => {
  let app: NestFastifyApplication;

  let authFilePath: string;
  let secretsFilePath: string;
  let authorization: string;

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = path.resolve(__dirname, '../../');
    process.env.UIX_STORAGE_PATH = path.resolve(__dirname, '../', '.homebridge');
    process.env.UIX_CONFIG_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'config.json');

    authFilePath = path.resolve(process.env.UIX_STORAGE_PATH, 'auth.json');
    secretsFilePath = path.resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets');

    // setup test config
    await fs.copy(path.resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH);

    // setup test auth file
    await fs.copy(path.resolve(__dirname, '../mocks', 'auth.json'), authFilePath);
    await fs.copy(path.resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [UsersModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(async () => {
    // get auth token before each test
    authorization = 'bearer ' + (await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })).json().access_token;
  });

  afterEach(async () => {
    // restore auth.json after each test
    await fs.copy(path.resolve(__dirname, '../mocks', 'auth.json'), authFilePath);
  });

  it('GET /users (with auth token)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/users',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toHaveLength(1);
  });

  it('GET /users (without auth token)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/users',
    });

    expect(res.statusCode).toEqual(401);
  });

  it('POST /users', async () => {
    const payload: UserDto = {
      name: 'Tester',
      username: 'test',
      password: 'test',
      admin: false,
    };

    const res = await app.inject({
      method: 'POST',
      path: '/users',
      headers: {
        authorization,
      },
      payload,
    });

    expect(res.statusCode).toEqual(201);

    expect(res.json()).toEqual({
      id: 2,
      name: 'Tester',
      username: 'test',
      admin: false,
      otpActive: false,
    });

    // check the user was saved to the auth.json file
    expect(await fs.readJson(authFilePath)).toHaveLength(2);
  });

  it('PATCH /users/:userId', async () => {
    const payload: UserDto = {
      name: 'New Name',
      username: 'admin',
      admin: true,
    };

    const res = await app.inject({
      method: 'PATCH',
      path: '/users/1',
      headers: {
        authorization,
      },
      payload,
    });

    expect(res.statusCode).toEqual(200);

    expect(res.json()).toEqual({
      id: 1,
      name: 'New Name',
      username: 'admin',
      admin: true,
      otpActive: false,
    });

    expect((await fs.readJson(authFilePath))[0].name).toEqual('New Name');
  });

  it('PATCH /users/:userId (change username)', async () => {
    const payload: UserDto = {
      name: 'New Name',
      username: 'newUsername',
      admin: true,
    };

    const res = await app.inject({
      method: 'PATCH',
      path: '/users/1',
      headers: {
        authorization,
      },
      payload,
    });

    expect(res.statusCode).toEqual(200);

    expect(res.json()).toEqual({
      id: 1,
      name: 'New Name',
      username: 'newUsername',
      admin: true,
      otpActive: false,
    });

    expect((await fs.readJson(authFilePath))[0].name).toEqual('New Name');
    expect((await fs.readJson(authFilePath))[0].username).toEqual('newUsername');
  });

  it('PATCH /users/:userId (change username - conflict)', async () => {
    const payload: UserDto = {
      name: 'Tester',
      username: 'test',
      password: 'test',
      admin: false,
    };

    // create a new user
    const newUser: UserDto = (await app.inject({
      method: 'POST',
      path: '/users',
      headers: {
        authorization,
      },
      payload,
    })).json();

    const res = await app.inject({
      method: 'PATCH',
      path: `/users/${newUser.id}`,
      headers: {
        authorization,
      },
      payload: {
        username: 'admin', // try change to existing username
      },
    });

    expect(res.statusCode).toEqual(409);
    expect(res.json().message).toContain('already exists');
  });

  it('DELETE /users/:userId', async () => {
    const payload: UserDto = {
      name: 'Tester',
      username: 'test',
      password: 'test',
      admin: false,
    };

    // create a new user
    const newUser: UserDto = (await app.inject({
      method: 'POST',
      path: '/users',
      headers: {
        authorization,
      },
      payload,
    })).json();

    // check the user was saved to the auth.json file as a sanity check
    expect(await fs.readJson(authFilePath)).toHaveLength(2);

    // delete the user
    const res = await app.inject({
      method: 'DELETE',
      path: `/users/${newUser.id}`,
      headers: {
        authorization,
      },
      payload,
    });

    expect(res.statusCode).toEqual(200);

    // check the user was deleted from the auth.json file
    expect(await fs.readJson(authFilePath)).toHaveLength(1);
  });

  it('DELETE /users/:userId (do not allow deletion of only admin)', async () => {
    // create a new non-admin user
    const payload: UserDto = {
      name: 'Tester',
      username: 'test',
      password: 'test',
      admin: false,
    };

    await app.inject({
      method: 'POST',
      path: '/users',
      headers: {
        authorization,
      },
      payload,
    });

    // check the user was saved to the auth.json file as a sanity check
    expect(await fs.readJson(authFilePath)).toHaveLength(2);

    // delete user #1 (admin)
    const res = await app.inject({
      method: 'DELETE',
      path: '/users/1',
      headers: {
        authorization,
      },
      payload,
    });

    expect(res.statusCode).toEqual(400);
    expect(res.json().message).toContain('Cannot delete only admin user');
  });

  it('POST /users/change-password', async () => {
    const payload: UserUpdatePasswordDto = {
      currentPassword: 'admin',
      newPassword: 'newpassword',
    };

    const res = await app.inject({
      method: 'POST',
      path: '/users/change-password',
      headers: {
        authorization,
      },
      payload,
    });

    expect(res.statusCode).toEqual(201);

    // check the new password works
    const testLoginWithNewPassword = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'newpassword',
      },
    });

    expect(testLoginWithNewPassword.statusCode).toEqual(201);

    // check the old password is rejected
    const testLoginWithOldPassword = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    });

    expect(testLoginWithOldPassword.statusCode).toEqual(403);
  });

  it('POST /users/otp/setup', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/users/otp/setup',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(201);
    expect(res.json()).toHaveProperty('otpauth');

    const authFile: UserDto[] = await fs.readJson(authFilePath);
    expect(authFile[0].otpSecret).toBeTruthy();
    expect(authFile[0].otpActive).toBeFalsy();
  });

  it('POST /users/otp/activate', async () => {
    // prepare the user for activation
    await app.inject({
      method: 'POST',
      path: '/users/otp/setup',
      headers: {
        authorization,
      },
    });

    let authFile: UserDto[] = await fs.readJson(authFilePath);
    const otpSecret = authFile[0].otpSecret;
    const code = authenticator.generate(otpSecret);
    const payload: UserActivateOtpDto = {
      code,
    };

    const res = await app.inject({
      method: 'POST',
      path: '/users/otp/activate',
      headers: {
        authorization,
      },
      payload,
    });

    expect(res.statusCode).toEqual(201);

    // check otp was activated
    authFile = await fs.readJson(authFilePath);
    expect(authFile[0].otpActive).toEqual(true);

    // check logins now prompt for otp
    const testLoginWithoutOtp = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    });

    expect(testLoginWithoutOtp.statusCode).toEqual(412);
    expect(testLoginWithoutOtp.json().message).toEqual('2FA Code Required');

    // generate a otp to test a login with
    const otp = authenticator.generate(otpSecret);

    // check logins pass with valid otp
    const testLoginWithOtp = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
        otp,
      },
    });

    expect(testLoginWithOtp.statusCode).toEqual(201);

    // check subsequent logins with the same otp token are rejected
    const testLoginWithOtpReplay = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
        otp,
      },
    });

    expect(testLoginWithOtpReplay.statusCode).toEqual(412);
    expect(testLoginWithoutOtp.json().message).toEqual('2FA Code Required');
  });

  it('POST /users/otp/deactivate (valid password)', async () => {
    let authFile: UserDto[] = await fs.readJson(authFilePath);

    authFile[0].otpActive = true;
    authFile[0].otpSecret = 'blah';

    await fs.writeJson(authFilePath, authFile);

    const payload: UserDeactivateOtpDto = {
      password: 'admin',
    };

    const res = await app.inject({
      method: 'POST',
      path: '/users/otp/deactivate',
      headers: {
        authorization,
      },
      payload,
    });

    expect(res.statusCode).toEqual(201);

    authFile = await fs.readJson(authFilePath);
    expect(authFile[0].otpActive).toBeFalsy();
    expect(authFile[0]).not.toHaveProperty('otpSecret');
  });

  it('POST /users/otp/deactivate (invalid password)', async () => {
    let authFile: UserDto[] = await fs.readJson(authFilePath);

    authFile[0].otpActive = true;
    authFile[0].otpSecret = 'blah';

    await fs.writeJson(authFilePath, authFile);

    const payload: UserDeactivateOtpDto = {
      password: 'not-the-password',
    };

    const res = await app.inject({
      method: 'POST',
      path: '/users/otp/deactivate',
      headers: {
        authorization,
      },
      payload,
    });

    expect(res.statusCode).toEqual(403);

    authFile = await fs.readJson(authFilePath);
    expect(authFile[0].otpActive).toEqual(true);
    expect(authFile[0].otpSecret).toBeTruthy();
  });

  afterAll(async () => {
    await app.close();
  });
});
