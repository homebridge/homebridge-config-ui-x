import * as path from 'path';
import * as fs from 'fs-extra';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { AuthModule } from '../../src/core/auth/auth.module';
import { DockerService } from '../../src/modules/platform-tools/docker/docker.service';
import { DockerModule } from '../../src/modules/platform-tools/docker/docker.module';

describe('PlatformToolsDocker (e2e)', () => {
  let app: NestFastifyApplication;

  let authFilePath: string;
  let secretsFilePath: string;
  let startupFilePath: string;
  let authorization: string;
  let restartDockerContainerFn;
  let dockerService: DockerService;

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = path.resolve(__dirname, '../../');
    process.env.UIX_STORAGE_PATH = path.resolve(__dirname, '../', '.homebridge');
    process.env.UIX_CONFIG_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'config.json');

    authFilePath = path.resolve(process.env.UIX_STORAGE_PATH, 'auth.json');
    secretsFilePath = path.resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets');
    startupFilePath = path.resolve(process.env.UIX_STORAGE_PATH, 'startup.sh');

    // setup test config
    await fs.copy(path.resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH);

    // setup test auth file
    await fs.copy(path.resolve(__dirname, '../mocks', 'auth.json'), authFilePath);
    await fs.copy(path.resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [DockerModule, AuthModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    dockerService = app.get(DockerService);
  });

  beforeEach(async () => {
    // setup mock functions
    restartDockerContainerFn = jest.fn();
    dockerService.restartDockerContainer = restartDockerContainerFn;

    // restore startup.sh
    await fs.copy(path.resolve(__dirname, '../mocks', 'startup.sh'), startupFilePath);

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

  it('GET /platform-tools/docker/startup-script', async () => {
    const startupScript = await fs.readFile(startupFilePath, 'utf8');

    const res = await app.inject({
      method: 'GET',
      path: '/platform-tools/docker/startup-script',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json().script).toEqual(startupScript);
  });

  it('PUT /platform-tools/docker/startup-script', async () => {
    const startupScript = 'Hello World!';

    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/docker/startup-script',
      headers: {
        authorization,
      },
      payload: {
        script: startupScript,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(await fs.readFile(startupFilePath, 'utf8')).toEqual(startupScript);
  });

  it('GET /platform-tools/docker/restart-container', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/docker/restart-container',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(restartDockerContainerFn).toHaveBeenCalled();
  });

  afterAll(async () => {
    await app.close();
  });
});
