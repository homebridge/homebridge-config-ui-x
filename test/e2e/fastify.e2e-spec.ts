import * as path from 'path';
import * as fs from 'fs-extra';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { fastify } from 'fastify';
import fastifyMultipart from 'fastify-multipart';

import { AppModule } from '../../src/app.module';

describe('FastifyOptions (e2e)', () => {
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

    // setup test auth file
    await fs.copy(path.resolve(__dirname, '../mocks', 'auth.json'), authFilePath);
    await fs.copy(path.resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // setup fastify
    const server = fastify({
      logger: {
        prettyPrint: true,
      },
    });

    const fAdapter = new FastifyAdapter(server);

    fAdapter.register(fastifyMultipart, {
      limits: {
        files: 1,
      },
    });

    app = moduleFixture.createNestApplication<NestFastifyApplication>(fAdapter);

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('GET /', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/',
    });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual('Hello World!');
  });

  afterAll(async () => {
    await app.close();
  });
});
