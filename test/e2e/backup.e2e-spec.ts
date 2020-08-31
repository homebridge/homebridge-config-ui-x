import * as path from 'path';
import * as fs from 'fs-extra';
import { EventEmitter } from 'events';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication, } from '@nestjs/platform-fastify';
import * as fastifyMultipart from 'fastify-multipart';
import * as FormData from 'form-data';

import { AuthModule } from '../../src/core/auth/auth.module';
import { BackupModule } from '../../src/modules/backup/backup.module';
import { BackupService } from '../../src/modules/backup/backup.service';
import { BackupGateway } from '../../src/modules/backup/backup.gateway';
import { PluginsService } from '../../src/modules/plugins/plugins.service';

describe('BackupController (e2e)', () => {
  let app: NestFastifyApplication;

  let authFilePath: string;
  let secretsFilePath: string;
  let authorization: string;
  let tempBackupPath: string;

  let backupService: BackupService;
  let backupGateway: BackupGateway;
  let pluginsService: PluginsService;
  let postBackupRestoreRestartFn;

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = path.resolve(__dirname, '../../');
    process.env.UIX_STORAGE_PATH = path.resolve(__dirname, '../', '.homebridge');
    process.env.UIX_CONFIG_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'config.json');
    process.env.UIX_CUSTOM_PLUGIN_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'plugins/node_modules');

    authFilePath = path.resolve(process.env.UIX_STORAGE_PATH, 'auth.json');
    secretsFilePath = path.resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets');
    tempBackupPath = path.resolve(process.env.UIX_STORAGE_PATH, 'backup.tar.gz');

    // setup test config
    await fs.copy(path.resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH);

    // setup test auth file
    await fs.copy(path.resolve(__dirname, '../mocks', 'auth.json'), authFilePath);
    await fs.copy(path.resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [BackupModule, AuthModule],
    }).compile();

    const fAdapter = new FastifyAdapter();

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

    backupService = app.get(BackupService);
    backupGateway = app.get(BackupGateway);
    pluginsService = app.get(PluginsService);
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

  it('POST /backup/restore', async () => {
    // get a new backup
    const downloadBackup = await app.inject({
      method: 'GET',
      path: '/backup/download',
      headers: {
        authorization,
      }
    });

    // save the backup to disk
    await fs.writeFile(tempBackupPath, downloadBackup.rawPayload);

    // create multi-part form
    const payload = new FormData();
    payload.append('backup.tar.gz', await fs.readFile(tempBackupPath));

    const headers = payload.getHeaders();
    headers.authorization = authorization;

    const res = await app.inject({
      method: 'POST',
      path: '/backup/restore',
      headers,
      payload,
    });

    expect(res.statusCode).toEqual(200);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // check the backup contains the required files
    const restoreDirectory = (backupService as any).restoreDirectory;
    const pluginsJson = path.join(restoreDirectory, 'plugins.json');
    const infoJson = path.join(restoreDirectory, 'info.json');

    expect(await fs.pathExists(pluginsJson)).toEqual(true);
    expect(await fs.pathExists(infoJson)).toEqual(true);

    // mark the "homebridge-mock-plugin" dummy plugin as public so we can test the mock install
    const installedPlugins = (await fs.readJson(pluginsJson)).map(x => {
      x.publicPackage = true;
      return x;
    });
    await fs.writeJson(pluginsJson, installedPlugins);

    // create some mocks
    const client = new EventEmitter();

    jest.spyOn(client, 'emit');

    jest.spyOn(pluginsService, 'installPlugin')
      .mockImplementation(async () => {
        return true;
      });

    // start restore
    await backupGateway.doRestore(client);

    expect(client.emit).toBeCalledWith('stdout', expect.stringContaining('Restoring backup'));
    expect(client.emit).toBeCalledWith('stdout', expect.stringContaining('Restore Complete'));
    expect(pluginsService.installPlugin).toBeCalledWith('homebridge-mock-plugin', client);
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