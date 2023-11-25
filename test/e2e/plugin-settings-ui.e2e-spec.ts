import { resolve } from 'path';
import { HttpService } from '@nestjs/axios';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import {
  copy,
  ensureDir,
  remove,
  writeFile,
} from 'fs-extra';
import { AuthModule } from '../../src/core/auth/auth.module';
import { PluginsSettingsUiModule } from '../../src/modules/custom-plugins/plugins-settings-ui/plugins-settings-ui.module';

describe('PluginsSettingsUiController (e2e)', () => {
  let app: NestFastifyApplication;
  let httpService: HttpService;

  let authFilePath: string;
  let secretsFilePath: string;
  let pluginsPath: string;

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../');
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge');
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json');
    process.env.UIX_CUSTOM_PLUGIN_PATH = resolve(process.env.UIX_STORAGE_PATH, 'plugins/node_modules');

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json');
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets');
    pluginsPath = process.env.UIX_CUSTOM_PLUGIN_PATH;

    // setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH);

    // setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath);
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath);

    await remove(pluginsPath);
    await copy(resolve(__dirname, '../mocks', 'plugins'), pluginsPath);

    // create httpService instance
    httpService = new HttpService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PluginsSettingsUiModule, AuthModule],
    }).overrideProvider(HttpService).useValue(httpService).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    await ensureDir(resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public'));
    await writeFile(resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public/index.html'), '<h1>Hello World</h1>');
  });

  beforeEach(async () => {
    jest.resetAllMocks();
  });

  it('GET /plugins/settings-ui/:plugin-name/', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/settings-ui/homebridge-mock-plugin/',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Hello World');
    expect(res.body).toContain('homebridge-mock-plugin');
  });

  it('GET /plugins/settings-ui/:plugin-name/index.html', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/settings-ui/homebridge-mock-plugin/index.html',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Hello World');
    expect(res.body).toContain('homebridge-mock-plugin');
  });

  it('GET /plugins/settings-ui/:plugin-name/index.html (set origin)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: `plugins/settings-ui/homebridge-mock-plugin/index.html?origin=${encodeURIComponent('http://example.com')}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('http://example.com/assets/plugin-ui-utils/ui.js');
  });

  it('GET /plugins/settings-ui/:plugin-name/index.html (no custom ui for plugin)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/settings-ui/homebridge-mock-plugin-two/index.html',
    });

    expect(res.statusCode).toBe(404);
  });

  afterAll(async () => {
    await app.close();
  });
});
