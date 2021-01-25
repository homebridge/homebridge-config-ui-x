import * as path from 'path';
import * as fs from 'fs-extra';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { AuthModule } from '../../src/core/auth/auth.module';
import { HbServiceModule } from '../../src/modules/platform-tools/hb-service/hb-service.module';
import { ConfigService } from '../../src/core/config/config.service';

describe('PlatformToolsHbService (e2e)', () => {
  let app: NestFastifyApplication;

  let authFilePath: string;
  let secretsFilePath: string;
  let envFilePath: string;
  let logFilePath: string;
  let authorization: string;
  let configService: ConfigService;

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = path.resolve(__dirname, '../../');
    process.env.UIX_STORAGE_PATH = path.resolve(__dirname, '../', '.homebridge');
    process.env.UIX_CONFIG_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'config.json');

    authFilePath = path.resolve(process.env.UIX_STORAGE_PATH, 'auth.json');
    secretsFilePath = path.resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets');
    envFilePath = path.resolve(process.env.UIX_STORAGE_PATH, '.uix-hb-service-homebridge-startup.json');
    logFilePath = path.resolve(process.env.UIX_STORAGE_PATH, 'homebridge.log');

    // setup test config
    await fs.copy(path.resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH);

    // setup test auth file
    await fs.copy(path.resolve(__dirname, '../mocks', 'auth.json'), authFilePath);
    await fs.copy(path.resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HbServiceModule, AuthModule],
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
    // restore hb-service env file
    await fs.copy(path.resolve(__dirname, '../mocks', '.uix-hb-service-homebridge-startup.json'), envFilePath);

    // ensure restart required flag is cleared
    configService.hbServiceUiRestartRequired = false;

    // enable service mode
    configService.serviceMode = true;
    configService.ui.log = {
      method: 'file',
      path: logFilePath,
    };

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

  it('GET /platform-tools/hb-service/homebridge-startup-settings (env file exists)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/platform-tools/hb-service/homebridge-startup-settings',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
  });

  it('GET /platform-tools/hb-service/homebridge-startup-settings (env file does not exist)', async () => {
    await fs.remove(envFilePath);

    const res = await app.inject({
      method: 'GET',
      path: '/platform-tools/hb-service/homebridge-startup-settings',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
  });

  it('PUT /platform-tools/hb-service/homebridge-startup-settings', async () => {
    const payload = {
      'HOMEBRIDGE_DEBUG': true,
      'HOMEBRIDGE_KEEP_ORPHANS': true,
      'HOMEBRIDGE_INSECURE': false,
      'ENV_DEBUG': '*',
      'ENV_NODE_OPTIONS': '--inspect',
    };

    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/hb-service/homebridge-startup-settings',
      headers: {
        authorization,
      },
      payload,
    });

    expect(res.statusCode).toEqual(200);

    const envFile = await fs.readJson(envFilePath);
    expect(envFile.debugMode).toEqual(true);
    expect(envFile.keepOrphans).toEqual(true);
    expect(envFile.insecureMode).toEqual(false);
    expect(envFile.env.DEBUG).toEqual('*');
    expect(envFile.env.NODE_OPTIONS).toEqual('--inspect');

    // the restart flag should be set
    expect(configService.hbServiceUiRestartRequired).toEqual(true);
  });

  it('PUT /platform-tools/hb-service/set-full-service-restart-flag', async () => {
    // sanity check
    expect(configService.hbServiceUiRestartRequired).toEqual(false);

    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/hb-service/set-full-service-restart-flag',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(configService.hbServiceUiRestartRequired).toEqual(true);
  });

  it('GET /platform-tools/hb-service/log/download', async () => {
    // write some data to the log file
    const sampleLogData = ['line 1', 'line 2', 'line 3'].join('\n');
    await fs.writeFile(logFilePath, sampleLogData);

    const res = await app.inject({
      method: 'GET',
      path: '/platform-tools/hb-service/log/download?colour=no',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual(sampleLogData);
  });

  it('GET /platform-tools/hb-service/log/download (with colour)', async () => {
    // write some data to the log file
    const sampleLogData = ['line 1', 'line 2', 'line 3'].join('\n');
    await fs.writeFile(logFilePath, sampleLogData);

    const res = await app.inject({
      method: 'GET',
      path: '/platform-tools/hb-service/log/download?colour=yes',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual(sampleLogData);
  });

  it('PUT /platform-tools/hb-service/log/truncate', async () => {
    // write some data to the log file
    const sampleLogData = ['line 1', 'line 2', 'line 3'].join('\n');
    await fs.writeFile(logFilePath, sampleLogData);

    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/hb-service/log/truncate',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(await fs.readFile(logFilePath, 'utf8')).toEqual('');
  });

  afterAll(async () => {
    await app.close();
  });
});
