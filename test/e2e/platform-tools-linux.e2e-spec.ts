import * as path from 'path';
import * as fs from 'fs-extra';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { AuthModule } from '../../src/core/auth/auth.module';
import { LinuxModule } from '../../src/modules/platform-tools/linux/linux.module';
import { LinuxService } from '../../src/modules/platform-tools/linux/linux.service';

describe('PlatformToolsLinux (e2e)', () => {
  let app: NestFastifyApplication;

  let authFilePath: string;
  let secretsFilePath: string;
  let authorization: string;
  let restartHostFn;
  let shutdownHostFn;
  let linuxService: LinuxService;

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
      imports: [LinuxModule, AuthModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    linuxService = app.get(LinuxService);
  });

  beforeEach(async () => {
    // setup mock functions
    restartHostFn = jest.fn();
    shutdownHostFn = jest.fn();
    linuxService.restartHost = restartHostFn;
    linuxService.shutdownHost = shutdownHostFn;

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

  it('GET /platform-tools/linux/restart-host', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/linux/restart-host',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(restartHostFn).toHaveBeenCalled();
  });

  it('GET /platform-tools/linux/shutdown-host', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/linux/shutdown-host',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(shutdownHostFn).toHaveBeenCalled();
  });

  afterAll(async () => {
    await app.close();
  });
});
