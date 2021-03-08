import * as path from 'path';
import * as fs from 'fs-extra';
import axios, { AxiosResponse, AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import { ValidationPipe, HttpService } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { StatusModule } from '../../src/modules/status/status.module';
import { AuthModule } from '../../src/core/auth/auth.module';

describe('StatusController (e2e)', () => {
  let app: NestFastifyApplication;
  let httpService: HttpService;

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

    // create httpService instance
    httpService = new HttpService(axios.create({}));

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [StatusModule, AuthModule],
    }).overrideProvider(HttpService).useValue(httpService).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(async () => {
    jest.resetAllMocks();

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

  it('GET /status/cpu', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/status/cpu',
      headers: {
        authorization,
      },
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
      },
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
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toHaveProperty('time');
    expect(res.json()).toHaveProperty('processUptime');
  });

  it('GET /status/homebridge (homebridge up)', async () => {
    const response: AxiosResponse<any> = {
      data: {},
      headers: {},
      config: { url: 'http://localhost:51826' },
      status: 404,
      statusText: 'Not Found',
    };

    jest.spyOn(httpService, 'get')
      .mockImplementationOnce(() => of(response));

    const res = await app.inject({
      method: 'GET',
      path: '/status/homebridge',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toEqual({ status: 'up' });
  });

  it('GET /status/homebridge (homebridge down)', async () => {
    const response: AxiosError<any> = {
      name: 'Connection Error',
      message: 'Connection Error',
      toJSON: () => { return {}; },
      isAxiosError: true,
      code: null,
      response: null,
      config: { url: 'http://localhost:51826' },
    };

    jest.spyOn(httpService, 'get')
      .mockImplementationOnce(() => throwError(response));

    const res = await app.inject({
      method: 'GET',
      path: '/status/homebridge',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toEqual({ status: 'down' });
  });

  it('GET /status/server-information', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/status/server-information',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toHaveProperty('serviceUser');
    expect(res.json().homebridgeConfigJsonPath).toEqual(process.env.UIX_CONFIG_PATH);
    expect(res.json().homebridgeStoragePath).toEqual(process.env.UIX_STORAGE_PATH);
  });

  it('GET /status/nodejs', async () => {
    const data = [
      {
        'version': 'v14.8.0',
        'lts': false,
      },
      {
        'version': 'v12.18.0',
        'lts': 'Erbium',
      },
    ];

    const response: AxiosResponse<any> = {
      data,
      headers: {},
      config: { url: 'https://nodejs.org/dist/index.json' },
      status: 200,
      statusText: 'OK',
    };

    jest.spyOn(httpService, 'get')
      .mockImplementationOnce(() => of(response));

    const res = await app.inject({
      method: 'GET',
      path: '/status/nodejs',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json().currentVersion).toEqual(process.version);
    expect(res.json().latestVersion).toEqual('v12.18.0');
  });

  afterAll(async () => {
    await app.close();
  });
});
