import { EventEmitter } from 'events';
import { join, resolve } from 'path';
import fastifyMultipart from '@fastify/multipart';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import * as dayjs from 'dayjs';
import * as FormData from 'form-data';
import {
  copy,
  emptyDir,
  ensureDir,
  pathExists,
  readFile,
  readJson,
  readdir,
  remove,
  writeFile,
  writeJson,
  emptyDirSync,
} from 'fs-extra';
import { AuthModule } from '../../src/core/auth/auth.module';
import { ConfigService } from '../../src/core/config/config.service';
import { SchedulerService } from '../../src/core/scheduler/scheduler.service';
import { BackupGateway } from '../../src/modules/backup/backup.gateway';
import { BackupModule } from '../../src/modules/backup/backup.module';
import { BackupService } from '../../src/modules/backup/backup.service';
import { PluginsService } from '../../src/modules/plugins/plugins.service';

describe('BackupController (e2e)', () => {
  let app: NestFastifyApplication;

  let authFilePath: string;
  let secretsFilePath: string;
  let authorization: string;
  let tempBackupPath: string;
  let instanceBackupPath: string;
  let customInstanceBackupPath: string;
  let largeFilePath: string;

  let configService: ConfigService;
  let backupService: BackupService;
  let backupGateway: BackupGateway;
  let pluginsService: PluginsService;
  let schedulerService: SchedulerService;
  let postBackupRestoreRestartFn: jest.Mock;

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../');
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge');
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json');
    process.env.UIX_CUSTOM_PLUGIN_PATH = resolve(process.env.UIX_STORAGE_PATH, 'plugins/node_modules');

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json');
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets');
    tempBackupPath = resolve(process.env.UIX_STORAGE_PATH, 'backup.tar.gz');
    instanceBackupPath = resolve(process.env.UIX_STORAGE_PATH, 'backups/instance-backups');
    customInstanceBackupPath = resolve(process.env.UIX_STORAGE_PATH, 'backups/instance-backups-custom');
    largeFilePath = resolve(process.env.UIX_STORAGE_PATH, "largefile/largefile.txt");

    // setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH);

    // setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath);
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath);

    emptyDirSync(resolve(process.env.UIX_STORAGE_PATH, "largefile"));

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
    configService = app.get(ConfigService);
    schedulerService = app.get(SchedulerService);
  });

  beforeEach(async () => {
    // mock functions
    postBackupRestoreRestartFn = jest.fn();
    backupService.postBackupRestoreRestart = postBackupRestoreRestartFn;

    // restore default settings
    delete configService.ui.scheduledBackupPath;
    delete configService.ui.scheduledBackupDisable;
    configService.instanceBackupPath = instanceBackupPath;

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

  it('should schedule a job to backup instance', async () => {
    expect(schedulerService.scheduledJobs).toHaveProperty('instance-backup');
  });

  it('should not schedule a job to backup instance if scheduled backups are disabled', async () => {
    // disable scheduled backups
    configService.ui.scheduledBackupDisable = true;

    // remove the job create on app creation
    schedulerService.cancelJob('instance-backup');

    // sanity check
    expect(schedulerService.scheduledJobs).not.toHaveProperty('instance-backup');

    // run the scheduler creation function
    backupService.scheduleInstanceBackups();

    // still should not have a job
    expect(schedulerService.scheduledJobs).not.toHaveProperty('instance-backup');
  });

  it('should remove scheduled instance backups older than 7 days', async () => {
    // empty the instance backup path
    await remove(configService.instanceBackupPath);
    await ensureDir(configService.instanceBackupPath);

    // create some fake backups
    const backupDates = [
      dayjs().subtract(10, 'day').toDate(),
      dayjs().subtract(9, 'day').toDate(),
      dayjs().subtract(8, 'day').toDate(),
      dayjs().subtract(7, 'day').toDate(),
      dayjs().subtract(6, 'day').toDate(),
      dayjs().subtract(5, 'day').toDate(),
      dayjs().subtract(4, 'day').toDate(),
      dayjs().subtract(3, 'day').toDate(),
      dayjs().subtract(2, 'day').toDate(),
      dayjs().subtract(1, 'day').toDate(),
    ];

    const instanceId = configService.homebridgeConfig.bridge.username.replace(/:/g, '');

    for (const fakeBackupDate of backupDates) {
      const backupFileName = `homebridge-backup-${instanceId}.${fakeBackupDate.getTime().toString()}.tar.gz`;
      await writeFile(resolve(configService.instanceBackupPath, backupFileName), 'xyz');
    }

    // do a sanity check beforehand
    const backupsBeforeCleanup = await readdir(configService.instanceBackupPath);
    expect(backupsBeforeCleanup).toHaveLength(10);

    // run backup job
    await backupService.runScheduledBackupJob();

    // there should only be 7 backups on disk
    const backupsAfterJob = await readdir(configService.instanceBackupPath);
    expect(backupsAfterJob).toHaveLength(7);
  });

  it('saves scheduled backups to the custom path if set and exists', async () => {
    // cleanup
    await remove(customInstanceBackupPath);

    configService.ui.scheduledBackupPath = customInstanceBackupPath;
    configService.instanceBackupPath = customInstanceBackupPath;

    // ensure the directory exists, custom backup paths are not automatically created
    await ensureDir(customInstanceBackupPath);

    // run backup job
    await backupService.runScheduledBackupJob();

    const backups = await readdir(customInstanceBackupPath);

    expect(backups).toHaveLength(1);
  });

  it('throws an error if the custom scheduled backup path does not exist', async () => {
    // cleanup
    await remove(customInstanceBackupPath);

    configService.ui.scheduledBackupPath = customInstanceBackupPath;
    configService.instanceBackupPath = customInstanceBackupPath;

    await expect(backupService.ensureScheduledBackupPath()).rejects.toThrow('Custom instance backup path does not exists');
  });

  it('creates the non-custom scheduled backup path if it does not exist', async () => {
    // cleanup
    await remove(instanceBackupPath);

    await backupService.ensureScheduledBackupPath();

    expect(await pathExists(instanceBackupPath)).toBe(true);
  });

  it('GET /backup/download', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/backup/download',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
  });

  it.only('POST /backup/restore small backup', async () => {
    // get a new backup
    const downloadBackup = await app.inject({
      method: 'GET',
      path: '/backup/download',
      headers: {
        authorization,
      },
    });

    // save the backup to disk
    await writeFile(tempBackupPath, downloadBackup.rawPayload);

    // create multipart form
    const payload = new FormData();
    payload.append('backup.tar.gz', await readFile(tempBackupPath));

    const headers = payload.getHeaders();
    headers.authorization = authorization;

    const res = await app.inject({
      method: 'POST',
      path: '/backup/restore',
      headers,
      payload,
    });

    expect(res.statusCode).toBe(201);

    await new Promise((r) => setTimeout(r, 100));

    // check the backup contains the required files
    const restoreDirectory = (backupService as any).restoreDirectory;
    const pluginsJson = join(restoreDirectory, 'plugins.json');
    const infoJson = join(restoreDirectory, 'info.json');

    expect(await pathExists(pluginsJson)).toBe(true);
    expect(await pathExists(infoJson)).toBe(true);

    // mark the "homebridge-mock-plugin" dummy plugin as public, so we can test the mock install
    const installedPlugins = (await readJson(pluginsJson)).map((x) => {
      x.publicPackage = true;
      return x;
    });
    await writeJson(pluginsJson, installedPlugins);

    // create some mocks
    const client = new EventEmitter();

    jest.spyOn(client, 'emit');

    jest.spyOn(pluginsService, 'managePlugin')
      .mockImplementation(async () => {
        return true;
      });

    // start restore
    await backupGateway.doRestore(client);

    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Restoring backup'));
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Restore Complete'));
    expect(pluginsService.managePlugin).toHaveBeenCalledWith('install', expect.objectContaining({ name: 'homebridge-mock-plugin', version: expect.anything() }), client);

    // ensure the temp restore directory was removed
    expect(await pathExists(restoreDirectory)).toBe(false);
  });

  // https://github.com/homebridge/homebridge-config-ui-x/issues/1856

  it.only('POST /backup/restore large backup', async () => {

    const fs = require("fs");
    emptyDirSync(resolve(process.env.UIX_STORAGE_PATH, "largefile"));

    const createEmptyFileOfSize = (fileName, size) => {
      return new Promise((resolve, reject) => {
        var fh = fs.openSync(fileName, 'w');
        fs.writeSync(fh, 'ok', Math.max(0, size - 2));
        fs.closeSync(fh);
        resolve(true);
      });
    };

    for (var i = 0; i < 90; i++) {
      await createEmptyFileOfSize(largeFilePath + i, 9000000);
    }

    // get a new backup
    const downloadBackup = await app.inject({
      method: 'GET',
      path: '/backup/download',
      headers: {
        authorization,
      },
    });

    // save the backup to disk
    await writeFile(tempBackupPath, downloadBackup.rawPayload);

    // create multipart form
    const payload = new FormData();
    payload.append('backup.tar.gz', await readFile(tempBackupPath));

    const headers = payload.getHeaders();
    headers.authorization = authorization;

    const res = await app.inject({
      method: 'POST',
      path: '/backup/restore',
      headers,
      payload,
    });

    expect(res.statusCode).toBe(201);

    await new Promise((r) => setTimeout(r, 100));

    // check the backup contains the required files
    const restoreDirectory = (backupService as any).restoreDirectory;
    const pluginsJson = join(restoreDirectory, 'plugins.json');
    const infoJson = join(restoreDirectory, 'info.json');

    expect(await pathExists(pluginsJson)).toBe(true);
    expect(await pathExists(infoJson)).toBe(true);

    // mark the "homebridge-mock-plugin" dummy plugin as public, so we can test the mock install
    const installedPlugins = (await readJson(pluginsJson)).map((x) => {
      x.publicPackage = true;
      return x;
    });
    await writeJson(pluginsJson, installedPlugins);

    // create some mocks
    const client = new EventEmitter();

    jest.spyOn(client, 'emit');

    jest.spyOn(pluginsService, 'managePlugin')
      .mockImplementation(async () => {
        return true;
      });

    // start restore
    await backupGateway.doRestore(client);

    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Restoring backup'));
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Restore Complete'));
    expect(pluginsService.managePlugin).toHaveBeenCalledWith('install', expect.objectContaining({ name: 'homebridge-mock-plugin', version: expect.anything() }), client);

    // ensure the temp restore directory was removed
    expect(await pathExists(restoreDirectory)).toBe(false);
  });

  it('GET /backup/restart', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/backup/restart',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(postBackupRestoreRestartFn).toHaveBeenCalled();
  });

  it('GET /backup/scheduled-backups (path missing)', async () => {
    // empty the instance backup path
    await remove(configService.instanceBackupPath);

    const res = await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(0);

    // the path should have been re-created
    expect(await pathExists(configService.instanceBackupPath)).toBe(true);
  });

  it('GET /backup/scheduled-backups', async () => {
    // empty the instance backup path
    await emptyDir(configService.instanceBackupPath);

    // run the scheduled backup job
    await backupService.runScheduledBackupJob();

    const res = await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0]).toHaveProperty('id');
    expect(res.json()[0]).toHaveProperty('fileName');
    expect(res.json()[0]).toHaveProperty('timestamp');
  });

  it('GET /backup/scheduled-backups/:backupId', async () => {
    const scheduledBackups = (await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups',
      headers: {
        authorization,
      },
    })).json();

    const res = await app.inject({
      method: 'GET',
      path: `/backup/scheduled-backups/${scheduledBackups[0].id}`,
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
  });

  it('GET /backup/scheduled-backups/:backupId (not found)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups/xxxxxxxxxxxx',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).not.toBe('application/octet-stream');
  });

  it('GET /backup/scheduled-backups/next', async () => {
    // run the scheduler creation function (to make sure it's enabled after previous tests)
    backupService.scheduleInstanceBackups();

    const res = await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups/next',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('next');
    expect(res.json().next).not.toBe(false);
    expect(dayjs(res.json().next).isValid()).toBe(true);
  });

  it('GET /backup/scheduled-backups/next (backups disabled)', async () => {
    // disable scheduled backups
    configService.ui.scheduledBackupDisable = true;

    const res = await app.inject({
      method: 'GET',
      path: '/backup/scheduled-backups/next',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('next');
    expect(res.json().next).toBe(false);
  });

  afterAll(async () => {
    schedulerService.scheduledJobs['instance-backup']?.cancel();
    await app.close();
  });
});
