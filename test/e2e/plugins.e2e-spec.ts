import * as path from 'path';
import * as fs from 'fs-extra';
import axios, { AxiosResponse } from 'axios';
import { ValidationPipe, HttpService } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication, } from '@nestjs/platform-fastify';
import { of } from 'rxjs';
import { AuthModule } from '../../src/core/auth/auth.module';
import { PluginsModule } from '../../src/modules/plugins/plugins.module';
import { HomebridgePlugin } from '../../src/modules/plugins/types';

describe('PluginController (e2e)', () => {
  let app: NestFastifyApplication;
  let httpService: HttpService;

  let authFilePath: string;
  let secretsFilePath: string;
  let pluginsPath: string;
  let authorization: string;

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = path.resolve(__dirname, '../../');
    process.env.UIX_STORAGE_PATH = path.resolve(__dirname, '../', '.homebridge');
    process.env.UIX_CONFIG_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'config.json');
    process.env.UIX_CUSTOM_PLUGIN_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'plugins');

    authFilePath = path.resolve(process.env.UIX_STORAGE_PATH, 'auth.json');
    secretsFilePath = path.resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets');
    pluginsPath = process.env.UIX_CUSTOM_PLUGIN_PATH;

    // setup test config
    await fs.copy(path.resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH);

    // setup test auth file
    await fs.copy(path.resolve(__dirname, '../mocks', 'auth.json'), authFilePath);
    await fs.copy(path.resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath);

    await fs.remove(pluginsPath);
    await fs.copy(path.resolve(__dirname, '../mocks', 'plugins'), pluginsPath, { recursive: true });

    // create httpService instance
    httpService = new HttpService(axios.create({}));

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PluginsModule, AuthModule],
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
        password: 'admin'
      }
    })).json().access_token;
  });

  it('GET /plugins', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json().length).toBeGreaterThan(0);

    const mockPlugin: HomebridgePlugin = res.json().find(x => x.name === 'homebridge-mock-plugin');

    expect(mockPlugin).toBeTruthy();
    expect(mockPlugin.settingsSchema).toEqual(true);
  });

  it('GET /plugins/search/:query (keyword)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/search/google',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json().length).toBeGreaterThan(0);
    expect(res.json().find(x => x.name === 'homebridge-gsh')).toBeTruthy();
  });

  it('GET /plugins/search/:query (exact plugin name)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/search/homebridge-daikin-esp8266',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json().find(x => x.name === 'homebridge-daikin-esp8266')).toBeTruthy();
  });


  it('GET /plugins/config-schema/:plugin-name', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/config-schema/homebridge-mock-plugin',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(200);
  });

  it('GET /plugins/changelog/:plugin-name', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/changelog/homebridge-mock-plugin',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(200);
  });

  it('GET /plugins/release/:plugin-name', async () => {
    const data = {
      name: 'v1.0.0',
      body: 'Hello!'
    };

    const response: AxiosResponse<any> = {
      data,
      headers: {},
      config: { url: 'https://api.github.com/repos/oznu/homebridge-config-ui-x/releases/latest' },
      status: 200,
      statusText: 'OK',
    };

    jest.spyOn(httpService, 'get')
      .mockImplementationOnce(() => of(response));

    const res = await app.inject({
      method: 'GET',
      path: '/plugins/release/homebridge-config-ui-x',
      headers: {
        authorization,
      }
    });

    expect(res.json()).toEqual({ name: data.name, changelog: data.body });
    expect(res.statusCode).toEqual(200);
  });

  afterAll(async () => {
    await app.close();
  });
});