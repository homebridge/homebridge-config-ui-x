import * as path from 'path';
import * as request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { FastifyAdapter, NestFastifyApplication, } from '@nestjs/platform-fastify';

/**
 * This is an initial e2e test.
 * It's main purpose is to make sure the app actually starts up correctly, rather
 * than a full featured test suite at this stage.
 */
describe('AppController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = path.resolve(__dirname, '../');
    process.env.UIX_CONFIG_PATH = path.resolve(__dirname, '.homebridge', 'config.json');
    process.env.UIX_STORAGE_PATH = path.resolve(__dirname, '.homebridge');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  it('/ (GET)', async () => {
    const res = await request(app.getHttpServer())
      .get('/');

    expect(res.status).toEqual(200);
    expect(res.text).toEqual('Hello World!');
  });

  it('/auth/settings (GET)', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/settings');

    expect(res.status).toEqual(200);
    expect(res.body.env.homebridgeInstanceName).toEqual('Homebridge Test');
  });

  afterAll(async () => {
    await app.close();
  });
});