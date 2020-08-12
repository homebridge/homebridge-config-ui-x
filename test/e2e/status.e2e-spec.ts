import * as path from 'path';
import * as fs from 'fs-extra';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication, } from '@nestjs/platform-fastify';
import { StatusModule } from '../../src/modules/status/status.module';
import { AuthModule } from '../../src/core/auth/auth.module';

describe('StatusController (e2e)', () => {
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
      imports: [StatusModule, AuthModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
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
        password: 'admin'
      }
    })).json().access_token;
  });

  it('GET /status/cpu', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/status/cpu',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toHaveProperty('cpuLoadHistory');
    expect(res.json()).toHaveProperty('cpuTemperature');
    expect(res.json()).toHaveProperty('currentLoad');
  });

  it('GET /status/ram', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/status/ram',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toHaveProperty('mem');
    expect(res.json()).toHaveProperty('memoryUsageHistory');
  });

  it('GET /status/uptime', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/status/uptime',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toHaveProperty('time');
    expect(res.json()).toHaveProperty('processUptime');
  });

  it('GET /status/homebridge', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/status/homebridge',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toHaveProperty('status');
  });

  it('GET /status/server-information', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/status/server-information',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toHaveProperty('serviceUser');
    expect(res.json().homebridgeConfigJsonPath).toEqual(process.env.UIX_CONFIG_PATH);
    expect(res.json().homebridgeStoragePath).toEqual(process.env.UIX_STORAGE_PATH);
  });

  it('GET /status/nodejs', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/status/nodejs',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json().currentVersion).toEqual(process.version);
  });

  afterAll(async () => {
    await app.close();
  });
});