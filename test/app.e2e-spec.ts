import * as path from 'path';
import * as fs from 'fs-extra';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { FastifyAdapter, NestFastifyApplication, } from '@nestjs/platform-fastify';

describe('AppController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = path.resolve(__dirname, '../');
    process.env.UIX_CONFIG_PATH = path.resolve(__dirname, '.homebridge', 'config.json');
    process.env.UIX_STORAGE_PATH = path.resolve(__dirname, '.homebridge');

    // setup test config
    await fs.copy(path.resolve(process.env.UIX_STORAGE_PATH, 'config.test.json'), process.env.UIX_CONFIG_PATH);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  it('GET /', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/'
    });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual('Hello World!');
  });

  afterAll(async () => {
    await app.close();
  });
});