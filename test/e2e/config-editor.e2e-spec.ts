import * as path from 'path';
import * as fs from 'fs-extra';
import * as dayjs from 'dayjs';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication, } from '@nestjs/platform-fastify';

import { AuthModule } from '../../src/core/auth/auth.module';
import { ConfigEditorModule } from '../../src/modules/config-editor/config-editor.module';
import { HomebridgeConfig } from '../../src/core/config/config.service';
import { SchedulerService } from '../../src/core/scheduler/scheduler.service';
import { ConfigEditorService } from '../../src/modules/config-editor/config-editor.service';

describe('ConfigEditorController (e2e)', () => {
  let app: NestFastifyApplication;

  let authFilePath: string;
  let secretsFilePath: string;
  let configFilePath: string;
  let authorization: string;
  let backupFilePath: string;

  let schedulerService: SchedulerService;
  let configEditorService: ConfigEditorService;

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = path.resolve(__dirname, '../../');
    process.env.UIX_STORAGE_PATH = path.resolve(__dirname, '../', '.homebridge');
    process.env.UIX_CONFIG_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'config.json');

    authFilePath = path.resolve(process.env.UIX_STORAGE_PATH, 'auth.json');
    secretsFilePath = path.resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets');
    configFilePath = process.env.UIX_CONFIG_PATH;
    backupFilePath = path.resolve(process.env.UIX_STORAGE_PATH, 'backups', 'config-backups');

    // setup test config
    await fs.copy(path.resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH);

    // setup test auth file
    await fs.copy(path.resolve(__dirname, '../mocks', 'auth.json'), authFilePath);
    await fs.copy(path.resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigEditorModule, AuthModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    schedulerService = app.get(SchedulerService);
    configEditorService = app.get(ConfigEditorService);

    // wait for initial paths to be setup
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  beforeEach(async () => {
    // get auth token before each test
    authorization = 'bearer ' + (await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin'
      }
    })).json().access_token;

    // restore the default config before each test
    await fs.copy(path.resolve(__dirname, '../mocks', 'config.json'), configFilePath);
  });

  it('should create the config.json backup path', async () => {
    expect(await fs.pathExists(backupFilePath)).toEqual(true);
  });

  it('should schedule a job to remove old config.json backups', async () => {
    expect(schedulerService.scheduledJobs).toHaveProperty('cleanup-config-backups');
  });

  it('should remove config.json backups older than 60 days', async () => {
    // empty the instance backup path
    await fs.ensureDir(backupFilePath);
    await fs.emptyDir(backupFilePath);

    // create some fake backups
    const backupDates = [
      dayjs().subtract(600, 'day').toDate(),
      dayjs().subtract(90, 'day').toDate(),
      dayjs().subtract(80, 'day').toDate(),
      dayjs().subtract(70, 'day').toDate(),
      dayjs().subtract(65, 'day').toDate(),
      dayjs().subtract(60, 'day').toDate(),
      dayjs().subtract(20, 'day').toDate(),
      dayjs().subtract(10, 'day').toDate(),
      dayjs().subtract(6, 'day').toDate(),
      dayjs().subtract(5, 'day').toDate(),
      dayjs().subtract(0, 'day').toDate(),
    ];

    for (const fakeBackupDate of backupDates) {
      const backupFileName = `config.json.${fakeBackupDate.getTime().toString()}`;
      await fs.writeFile(path.resolve(backupFilePath, backupFileName), 'xyz');
    }

    // do a sanity check before hand
    const backupsBeforeCleanup = await fs.readdir(backupFilePath);
    expect(backupsBeforeCleanup).toHaveLength(11);

    // run cleanup job
    await configEditorService.cleanupConfigBackups();

    // there should only be 5 backups on disk now
    const backupsAfterJob = await fs.readdir(backupFilePath);
    expect(backupsAfterJob).toHaveLength(5);

    // empty the directory again
    await fs.emptyDir(backupFilePath);
  });

  it('GET /config-editor', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/config-editor',
      headers: {
        authorization,
      }
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toEqual(await fs.readJson(configFilePath));
  });

  it('POST /config-editor (valid config)', async () => {
    const currentConfig: HomebridgeConfig = await fs.readJson(configFilePath);

    currentConfig.bridge.name = 'Changed Name';

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    });

    expect(res.statusCode).toEqual(201);

    // check the updates were saved to disk
    expect(currentConfig).toEqual(await fs.readJson(configFilePath));
  });

  it('POST /config-editor (missing required attributes)', async () => {
    const currentConfig: HomebridgeConfig = await fs.readJson(configFilePath);

    delete currentConfig.bridge;
    delete currentConfig.accessories;
    delete currentConfig.platforms;

    currentConfig.plugins = [];

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    });

    expect(res.statusCode).toEqual(201);

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await fs.readJson(configFilePath);
    expect(savedConfig).toHaveProperty('bridge');
    expect(savedConfig.platforms).toHaveLength(0);
    expect(savedConfig.accessories).toHaveLength(0);
    expect(savedConfig).not.toHaveProperty('plugins');
  });

  it('GET /config-editor/backups', async () => {
    const backupCount = (await fs.readdir(backupFilePath)).length;

    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/backups',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toHaveLength(backupCount);
  });

  it('GET /config-editor/backups/:backupId', async () => {
    const availableBackups = (await app.inject({
      method: 'GET',
      path: '/config-editor/backups',
      headers: {
        authorization,
      },
    })).json();

    expect(availableBackups.length).toBeGreaterThan(0);

    const res = await app.inject({
      method: 'GET',
      path: `/config-editor/backups/${availableBackups[0].id}`,
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
  });

  it('DELETE /config-editor/backups', async () => {
    const originalbackupCount = (await fs.readdir(backupFilePath)).length;
    expect(originalbackupCount).toBeGreaterThan(0);

    const res = await app.inject({
      method: 'DELETE',
      path: '/config-editor/backups',
      headers: {
        authorization,
      },
    });

    const newbackupCount = (await fs.readdir(backupFilePath)).length;

    expect(newbackupCount).toEqual(0);
    expect(res.statusCode).toEqual(200);
  });


  afterAll(async () => {
    await app.close();
  });
});