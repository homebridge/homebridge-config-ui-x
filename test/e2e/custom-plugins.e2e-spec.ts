import * as path from 'path';
import * as fs from 'fs-extra';
import { ValidationPipe, HttpService } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication, } from '@nestjs/platform-fastify';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { AuthModule } from '../../src/core/auth/auth.module';
import { CustomPluginsModule } from '../../src/modules/custom-plugins/custom-plugins.module';

describe('CustomPluginsController (e2e)', () => {
  let app: NestFastifyApplication;
  let httpService: HttpService;

  let authFilePath: string;
  let secretsFilePath: string;
  let authorization: string;

  beforeAll(async () => {
    jest.resetAllMocks();

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
      imports: [CustomPluginsModule, AuthModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    httpService = app.get(HttpService);
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

  it('GET /plugins/custom-plugins/homebridge-hue/dump-file (dump file exists)', async () => {
    await fs.writeJson(path.resolve(process.env.UIX_STORAGE_PATH, 'homebridge-hue.json.gz'), {});

    const res = await app.inject({
      method: 'GET',
      path: '/plugins/custom-plugins/homebridge-hue/dump-file',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(200);
  });

  it('GET /plugins/custom-plugins/homebridge-hue/dump-file (dump file missing)', async () => {
    await fs.remove(path.resolve(process.env.UIX_STORAGE_PATH, 'homebridge-hue.json.gz'));

    const res = await app.inject({
      method: 'GET',
      path: '/plugins/custom-plugins/homebridge-hue/dump-file',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(404);
  });

  it('POST /plugins/custom-plugins/homebridge-ring/exchange-credentials (2fa not required)', async () => {
    const data = {
      access_token: 'access_token_mock',
      refresh_token: 'refresh_token_mock',
      expires_in: 3600,
      scope: 'client',
      token_type: 'Bearer'
    };

    const response: AxiosResponse<any> = {
      data,
      headers: {},
      config: { url: 'https://oauth.ring.com/oauth/token' },
      status: 200,
      statusText: 'OK',
    };

    jest.spyOn(httpService, 'post')
      .mockImplementationOnce(() => of(response));

    const res = await app.inject({
      method: 'POST',
      path: '/plugins/custom-plugins/homebridge-ring/exchange-credentials',
      headers: {
        authorization,
      },
      payload: {
        email: 'test@test.com',
        password: 'test'
      }
    });

    expect(res.statusCode).toEqual(201);
    expect(res.json()).toEqual(data);
  });

  it('POST /plugins/custom-plugins/homebridge-ring/exchange-credentials (2fa required)', async () => {
    const data = {
      email: '**************',
      next_time_in_secs: 60,
      phone: '**************'
    };

    const response = {
      code: '412',
      response: {
        data,
        headers: {},
        config: { url: 'https://oauth.ring.com/oauth/token' },
        status: 412,
        statusText: '412 Precondition Failed',
      },
      payload: {
        email: 'test@test.com',
        password: 'test'
      }
    };

    jest.spyOn(httpService, 'post')
      .mockImplementationOnce(() => throwError(response));

    const res = await app.inject({
      method: 'POST',
      path: '/plugins/custom-plugins/homebridge-ring/exchange-credentials',
      headers: {
        authorization,
      },
      payload: {
        email: 'test@test.com',
        password: 'test'
      }
    });

    expect(res.statusCode).toEqual(412);
    expect(res.json()).toEqual(data);
  });

  afterAll(async () => {
    await app.close();
  });
});