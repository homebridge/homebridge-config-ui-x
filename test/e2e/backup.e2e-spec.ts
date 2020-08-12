import * as path from 'path';
import * as fs from 'fs-extra';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication, } from '@nestjs/platform-fastify';
import { AuthModule } from '../../src/core/auth/auth.module';
import { BackupModule } from '../../src/modules/backup/backup.module';
import { BackupService } from '../../src/modules/backup/backup.service';

describe('BackupController (e2e)', () => {
  let app: NestFastifyApplication;

  let authFilePath: string;
  let secretsFilePath: string;
  let authorization: string;
  let backupService: BackupService;
  let postBackupRestoreRestartFn;

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
      imports: [BackupModule, AuthModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    backupService = app.get(BackupService);
  });

  beforeEach(async () => {
    // mock functions
    postBackupRestoreRestartFn = jest.fn();
    backupService.postBackupRestoreRestart = postBackupRestoreRestartFn;

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

  it('GET /backup/download', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/backup/download',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(200);
    expect(res.headers['content-type']).toEqual('application/octet-stream');
  });

  it('GET /backup/restart', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/backup/restart',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(200);
    expect(postBackupRestoreRestartFn).toBeCalled();
  });

  afterAll(async () => {
    await app.close();
  });
});