import * as path from 'path';
import * as fs from 'fs-extra';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { AuthModule } from '../../src/core/auth/auth.module';
import { ConfigService } from '../../src/core/config/config.service';

describe('AuthController (e2e)', () => {
  let app: NestFastifyApplication;

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
      imports: [AuthModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // wait for initial auth to be setup
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterEach(async () => {
    // restore auth mode after each test
    const configService: ConfigService = app.get(ConfigService);
    configService.ui.auth = 'form';
  });

  it('should create auth.json and .uix-secrets on launch', async () => {
    expect(await fs.pathExists(authFilePath)).toEqual(true);
    expect(await fs.pathExists(secretsFilePath)).toEqual(true);
  });

  it('POST /auth/login (valid login)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    });

    expect(res.statusCode).toEqual(201);
    expect(res.json()).toHaveProperty('access_token');
  });

  it('POST /auth/login (invalid login)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'not-the-real-password',
      },
    });

    expect(res.statusCode).toEqual(403);
    expect(res.json()).not.toHaveProperty('access_token');
  });

  it('POST /auth/login (missing password)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
      },
    });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toContain('password should not be null or undefined');
    expect(res.json()).not.toHaveProperty('access_token');
  });

  it('POST /auth/login (missing username)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        password: 'admin',
      },
    });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toContain('username should not be null or undefined');
    expect(res.json()).not.toHaveProperty('access_token');
  });

  it('POST /auth/noauth (auth enabled)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/auth/noauth',
    });

    expect(res.statusCode).toEqual(401);
    expect(res.json()).not.toHaveProperty('access_token');
  });

  it('POST /auth/noauth (auth disabled)', async () => {
    // set auth mode to none
    const configService: ConfigService = app.get(ConfigService);
    configService.ui.auth = 'none';

    const res = await app.inject({
      method: 'POST',
      path: '/auth/noauth',
    });

    expect(res.statusCode).toEqual(201);
    expect(res.json()).toHaveProperty('access_token');
  });

  it('GET /auth/check (valid token)', async () => {
    const accessToken = (await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })).json().access_token;

    const res = await app.inject({
      method: 'GET',
      path: '/auth/check',
      headers: {
        authorization: `bearer ${accessToken}`,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json().status).toEqual('OK');
  });

  it('GET /auth/check (invalid token)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/auth/check',
      headers: {
        authorization: 'bearer xxxxxxxx',
      },
    });

    expect(res.statusCode).toEqual(401);
  });

  it('GET /auth/settings', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/auth/settings',
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json().env.homebridgeInstanceName).toEqual('Homebridge Test');
  });

  afterAll(async () => {
    await app.close();
  });
});
