import * as path from 'path';
import * as fs from 'fs-extra';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { ConfigService } from '../../src/core/config/config.service';
import { SetupWizardModule } from '../../src/modules/setup-wizard/setup-wizard.module';
import { UserDto } from '../../src/modules/users/users.dto';

describe('SetupWizard (e2e)', () => {
  let app: NestFastifyApplication;

  let configService: ConfigService;

  let authFilePath: string;
  let secretsFilePath: string;

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = path.resolve(__dirname, '../../');
    process.env.UIX_STORAGE_PATH = path.resolve(__dirname, '../', '.homebridge');
    process.env.UIX_CONFIG_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'config.json');

    authFilePath = path.resolve(process.env.UIX_STORAGE_PATH, 'auth.json');
    secretsFilePath = path.resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets');

    // setup test config
    await fs.copy(path.resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH);

    // remove any existing auth / secret files
    await fs.remove(authFilePath);
    await fs.remove(secretsFilePath);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [SetupWizardModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    configService = app.get(ConfigService);
  });

  beforeEach(async () => {
    // remove auth file
    await fs.remove(authFilePath);
    configService.setupWizardComplete = false;
  });

  it('POST /create-first-user', async () => {
    const payload: UserDto = {
      name: 'Tester',
      username: 'test',
      password: 'test',
      admin: true,
    };

    const res = await app.inject({
      method: 'POST',
      path: '/setup-wizard/create-first-user',
      payload,
    });

    expect(res.statusCode).toBe(201);

    expect(res.json()).toEqual({
      id: 1,
      name: 'Tester',
      username: 'test',
      admin: true,
      otpActive: false,
    });

    // check the user was saved to the auth.json file
    expect(await fs.readJson(authFilePath)).toHaveLength(1);
  });

  it('POST /create-first-user (always create first user as admin)', async () => {
    const payload: UserDto = {
      name: 'Tester',
      username: 'test',
      password: 'test',
      admin: false,
    };

    const res = await app.inject({
      method: 'POST',
      path: '/setup-wizard/create-first-user',
      payload,
    });

    expect(res.statusCode).toBe(201);

    expect(res.json()).toEqual({
      id: 1,
      name: 'Tester',
      username: 'test',
      admin: true,
      otpActive: false,
    });

    // check the user was saved to the auth.json file
    expect(await fs.readJson(authFilePath)).toHaveLength(1);
  });

  it('POST /create-first-user (rejects if password is missing)', async () => {
    const payload: UserDto = {
      name: 'Tester',
      username: 'test',
      admin: false,
    };

    const res = await app.inject({
      method: 'POST',
      path: '/setup-wizard/create-first-user',
      payload,
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /create-first-user (flags first run setup wizard as complete when called)', async () => {
    const payload: UserDto = {
      name: 'Tester',
      username: 'test',
      password: 'test',
      admin: true,
    };

    const res = await app.inject({
      method: 'POST',
      path: '/setup-wizard/create-first-user',
      payload,
    });

    expect(res.statusCode).toBe(201);
    expect(configService.setupWizardComplete).toBe(true);
  });

  it('POST /create-first-user (rejects if setup wizard complete)', async () => {
    configService.setupWizardComplete = true;

    const payload: UserDto = {
      name: 'Tester',
      username: 'test',
      password: 'test',
      admin: false,
    };

    const res = await app.inject({
      method: 'POST',
      path: '/setup-wizard/create-first-user',
      payload,
    });

    expect(res.statusCode).toBe(403);
  });

  it('GET /get-setup-wizard-token', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/setup-wizard/get-setup-wizard-token',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('access_token');
    expect(res.json()).toHaveProperty('expires_in');
    expect(res.json().expires_in).toBe(300);
  });

  it('GET /get-setup-wizard-token (rejects if setup wizard complete)', async () => {
    configService.setupWizardComplete = true;

    const res = await app.inject({
      method: 'GET',
      path: '/setup-wizard/get-setup-wizard-token',
    });

    expect(res.statusCode).toBe(403);
  });

  afterAll(async () => {
    await app.close();
  });
});
