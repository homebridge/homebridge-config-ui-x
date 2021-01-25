import * as path from 'path';
import * as fs from 'fs-extra';
import * as dayjs from 'dayjs';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

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
  let pluginsPath: string;

  let schedulerService: SchedulerService;
  let configEditorService: ConfigEditorService;

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = path.resolve(__dirname, '../../');
    process.env.UIX_STORAGE_PATH = path.resolve(__dirname, '../', '.homebridge');
    process.env.UIX_CONFIG_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'config.json');
    process.env.UIX_CUSTOM_PLUGIN_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'plugins/node_modules');

    authFilePath = path.resolve(process.env.UIX_STORAGE_PATH, 'auth.json');
    secretsFilePath = path.resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets');
    configFilePath = process.env.UIX_CONFIG_PATH;
    backupFilePath = path.resolve(process.env.UIX_STORAGE_PATH, 'backups', 'config-backups');
    pluginsPath = process.env.UIX_CUSTOM_PLUGIN_PATH;

    // setup test config
    await fs.copy(path.resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH);

    // setup test auth file
    await fs.copy(path.resolve(__dirname, '../mocks', 'auth.json'), authFilePath);
    await fs.copy(path.resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath);

    // copy test plugins
    await fs.remove(pluginsPath);
    await fs.copy(path.resolve(__dirname, '../mocks', 'plugins'), pluginsPath, { recursive: true });

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
        password: 'admin',
      },
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
      },
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

  it('POST /config-editor (convert bridge.port to number)', async () => {
    const currentConfig = await fs.readJson(configFilePath);

    currentConfig.bridge.port = '12345';

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
    expect(typeof savedConfig.bridge.port).toEqual('number');
    expect(savedConfig.bridge.port).toEqual(12345);
  });

  it('POST /config-editor (correct bridge.port if invalid value is provided)', async () => {
    const currentConfig = await fs.readJson(configFilePath);

    currentConfig.bridge.port = {
      not: 'valid',
    };

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
    expect(typeof savedConfig.bridge.port).toEqual('number');
    expect(savedConfig.bridge.port).toBeGreaterThanOrEqual(51000);
    expect(savedConfig.bridge.port).toBeLessThanOrEqual(52000);
  });

  it('POST /config-editor (accept bridge.port if a valid value is provided)', async () => {
    const currentConfig = await fs.readJson(configFilePath);

    currentConfig.bridge.port = 8080;

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
    expect(savedConfig.bridge.port).toEqual(8080);
  });

  it('POST /config-editor (correct bridge.port if port is out of range)', async () => {
    const currentConfig = await fs.readJson(configFilePath);

    currentConfig.bridge.port = 1000000000;

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
    expect(typeof savedConfig.bridge.port).toEqual('number');
    expect(savedConfig.bridge.port).toBeGreaterThanOrEqual(51000);
    expect(savedConfig.bridge.port).toBeLessThanOrEqual(52000);
  });

  it('POST /config-editor (correct bridge.username if an invalid value is provided)', async () => {
    const currentConfig = await fs.readJson(configFilePath);
    const originalUsername = currentConfig.bridge.username;

    currentConfig.bridge.username = 'blah blah';

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
    expect(savedConfig.bridge.username).toEqual(originalUsername);
  });

  it('POST /config-editor (accept bridge.username if valid value is provided)', async () => {
    const currentConfig = await fs.readJson(configFilePath);

    currentConfig.bridge.username = '0E:B8:2B:20:76:08';

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
    expect(savedConfig.bridge.username).toEqual('0E:B8:2B:20:76:08');
  });

  it('POST /config-editor (correct bridge.pin if an invalid value is provided)', async () => {
    const currentConfig = await fs.readJson(configFilePath);
    const originalPin = currentConfig.bridge.pin;

    currentConfig.bridge.pin = 'blah blah';

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
    expect(savedConfig.bridge.pin).toEqual(originalPin);
  });

  it('POST /config-editor (accept bridge.pin if a valid value is provided)', async () => {
    const currentConfig = await fs.readJson(configFilePath);

    currentConfig.bridge.pin = '111-11-111';

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
    expect(savedConfig.bridge.pin).toEqual('111-11-111');
  });

  it('POST /config-editor (correct bridge.name if an invalid value is provided)', async () => {
    const currentConfig = await fs.readJson(configFilePath);

    currentConfig.bridge.name = 12345;

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
    expect(typeof savedConfig.bridge.name).toEqual('string');
    expect(savedConfig.bridge.name).toContain('Homebridge');
  });

  it('POST /config-editor (accept bridge.name if a valid value is provided)', async () => {
    const currentConfig = await fs.readJson(configFilePath);

    currentConfig.bridge.name = 'Homebridge Test!';

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
    expect(savedConfig.bridge.name).toEqual('Homebridge Test!');
  });

  it('POST /config-editor (remove plugins array if empty)', async () => {
    const currentConfig = await fs.readJson(configFilePath);

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
    expect(savedConfig.plugins).toBeUndefined();
  });

  it('POST /config-editor (do not remove plugins array if not empty)', async () => {
    const currentConfig = await fs.readJson(configFilePath);

    currentConfig.plugins = [
      'homebridge-mock-plugin',
    ];

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
    expect(savedConfig.plugins).toEqual(currentConfig.plugins);
  });

  it('POST /config-editor (rewrite platforms & accessories as arrays)', async () => {
    const currentConfig = await fs.readJson(configFilePath);

    currentConfig.accessories = 'not an array';
    currentConfig.platforms = 'not an array';

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
    expect(Array.isArray(savedConfig.platforms)).toEqual(true);
    expect(Array.isArray(savedConfig.accessories)).toEqual(true);
    expect(savedConfig.platforms).toHaveLength(0);
    expect(savedConfig.accessories).toHaveLength(0);
  });

  it('POST /config-editor (remove config.mdns if not valid object)', async () => {
    const currentConfig = await fs.readJson(configFilePath);
    currentConfig.mdns = 'blah';

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
    expect(savedConfig.mdns).toBeUndefined();
  });

  it('POST /config-editor (retain config.mdns if valid object)', async () => {
    const currentConfig = await fs.readJson(configFilePath);
    currentConfig.mdns = {
      legacyAdvertiser: false,
    };

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
    expect(savedConfig.mdns).toEqual({
      legacyAdvertiser: false,
    });
  });

  it('POST /config-editor (correct config.mdns if non-boolean is passed)', async () => {
    const currentConfig = await fs.readJson(configFilePath);
    currentConfig.mdns = {
      legacyAdvertiser: 'some value',
    };

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
    expect(savedConfig.mdns).toEqual({
      legacyAdvertiser: false,
    });
  });

  it('GET /config-editor/plugin/:pluginName', async () => {
    const currentConfig: HomebridgeConfig = await fs.readJson(configFilePath);

    currentConfig.platforms = [
      {
        platform: 'not it',
      },
      {
        platform: 'ExampleHomebridgePlugin',
      },
      {
        platform: 'another not it',
      },
    ];

    await fs.writeJson(configFilePath, currentConfig);

    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);

    // it should only return the ExampleHomebridgePlugin config
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].platform).toEqual('ExampleHomebridgePlugin');
  });

  it('GET /config-editor/plugin/:pluginName (no config)', async () => {
    const currentConfig: HomebridgeConfig = await fs.readJson(configFilePath);

    currentConfig.platforms = [];

    await fs.writeJson(configFilePath, currentConfig);

    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
      payload: {},
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toHaveLength(0);
  });

  it('GET /config-editor/plugin/:pluginName (plugin not found)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/plugin/homebridge-fake-example-plugin',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(404);
  });

  it('POST /config-editor/plugin/:pluginName', async () => {
    // empty platforms
    const currentConfig: HomebridgeConfig = await fs.readJson(configFilePath);
    currentConfig.platforms = [];
    await fs.writeJson(configFilePath, currentConfig);

    const mockConfig = [
      {
        platform: 'ExampleHomebridgePlugin',
      },
    ];

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
      payload: mockConfig,
    });

    expect(res.statusCode).toEqual(201);

    const updatedConfig: HomebridgeConfig = await fs.readJson(configFilePath);
    expect(updatedConfig.platforms).toHaveLength(1);
    expect(updatedConfig.platforms).toEqual(mockConfig);
  });

  it('POST /config-editor/plugin/:pluginName (retain index position)', async () => {
    // empty platforms
    const currentConfig: HomebridgeConfig = await fs.readJson(configFilePath);
    currentConfig.platforms = [
      {
        platform: 'not it 0 ',
      },
      {
        platform: 'not it 1',
      },
      {
        platform: 'ExampleHomebridgePlugin',
      },
      {
        platform: 'not it 3',
      },
    ];
    await fs.writeJson(configFilePath, currentConfig);

    const mockConfig = [
      {
        platform: 'ExampleHomebridgePlugin',
      },
    ];

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
      payload: mockConfig,
    });

    expect(res.statusCode).toEqual(201);

    const updatedConfig: HomebridgeConfig = await fs.readJson(configFilePath);
    expect(updatedConfig.platforms).toHaveLength(4);
    expect(updatedConfig.platforms[2]).toEqual(mockConfig[0]);
  });

  it('POST /config-editor/plugin/:pluginName (remove config)', async () => {
    // empty platforms
    const currentConfig: HomebridgeConfig = await fs.readJson(configFilePath);
    currentConfig.platforms = [
      {
        platform: 'not it 0 ',
      },
      {
        platform: 'not it 1',
      },
      {
        platform: 'ExampleHomebridgePlugin',
      },
      {
        platform: 'not it 3',
      },
    ];
    await fs.writeJson(configFilePath, currentConfig);

    const mockConfig = [];

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
      payload: mockConfig,
    });

    expect(res.statusCode).toEqual(201);

    const updatedConfig: HomebridgeConfig = await fs.readJson(configFilePath);
    expect(updatedConfig.platforms).toHaveLength(3);
  });

  it('POST /config-editor/plugin/:pluginName (set alias)', async () => {
    // empty platforms
    const currentConfig: HomebridgeConfig = await fs.readJson(configFilePath);
    currentConfig.platforms = [];
    await fs.writeJson(configFilePath, currentConfig);

    const mockConfig = [
      {
        name: 'test',
        testing: true,
      },
    ];

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
      payload: mockConfig,
    });

    expect(res.statusCode).toEqual(201);

    const updatedConfig: HomebridgeConfig = await fs.readJson(configFilePath);
    expect(updatedConfig.platforms).toHaveLength(1);
    expect(updatedConfig.platforms[0].platform).toEqual('ExampleHomebridgePlugin');
  });

  it('POST /config-editor/plugin/:pluginName (enforce array body)', async () => {
    const mockConfig = {
      name: 'test',
      testing: true,
    };

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
      payload: mockConfig,
    });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toContain('Plugin Config must be an array.');
  });

  it('POST /config-editor/plugin/:pluginName (ensure block is object and not array)', async () => {
    const mockConfig = [
      [
        {
          name: 'test',
          testing: true,
        },
      ],
    ];

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
      payload: mockConfig,
    });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toContain('Plugin config must be an array of objects.');
  });

  it('PUT /config-editor/plugin/:pluginName/disable', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/plugin/homebridge-mock-plugin/disable',
      headers: {
        authorization,
      },
      payload: {},
    });

    expect(res.statusCode).toEqual(200);

    const config: HomebridgeConfig = await fs.readJson(configFilePath);
    expect(Array.isArray(config.disabledPlugins)).toEqual(true);
    expect(config.disabledPlugins).toContainEqual('homebridge-mock-plugin');
  });

  it('PUT /config-editor/plugin/:pluginName/disable (self)', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/plugin/homebridge-config-ui-x/disable',
      headers: {
        authorization,
      },
      payload: {},
    });

    expect(res.statusCode).toEqual(400);
  });

  it('PUT /config-editor/plugin/:pluginName/enable', async () => {
    const initialConfig: HomebridgeConfig = await fs.readJson(configFilePath);
    initialConfig.disabledPlugins = [
      'homebridge-mock-plugin',
      'homebridge-example-plugin',
    ];
    await fs.writeJson(configFilePath, initialConfig);

    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/plugin/homebridge-mock-plugin/enable',
      headers: {
        authorization,
      },
      payload: {},
    });

    expect(res.statusCode).toEqual(200);

    const config: HomebridgeConfig = await fs.readJson(configFilePath);
    expect(Array.isArray(config.disabledPlugins)).toEqual(true);
    expect(config.disabledPlugins).toHaveLength(1);
    expect(config.disabledPlugins).not.toContainEqual('homebridge-mock-plugin');
    expect(config.disabledPlugins).toContainEqual('homebridge-example-plugin');
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
