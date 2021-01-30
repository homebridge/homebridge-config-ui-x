import * as path from 'path';
import * as fs from 'fs-extra';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { AuthModule } from '../../src/core/auth/auth.module';
import { ServerModule } from '../../src/modules/server/server.module';
import { ServerService } from '../../src/modules/server/server.service';
import { ConfigService, HomebridgeConfig } from '../../src/core/config/config.service';

describe('ServerController (e2e)', () => {
  let app: NestFastifyApplication;

  let authFilePath: string;
  let secretsFilePath: string;
  let accessoriesPath: string;
  let persistPath: string;
  let authorization: string;
  let configService: ConfigService;
  let serverService: ServerService;

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = path.resolve(__dirname, '../../');
    process.env.UIX_STORAGE_PATH = path.resolve(__dirname, '../', '.homebridge');
    process.env.UIX_CONFIG_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'config.json');

    authFilePath = path.resolve(process.env.UIX_STORAGE_PATH, 'auth.json');
    secretsFilePath = path.resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets');
    accessoriesPath = path.resolve(process.env.UIX_STORAGE_PATH, 'accessories');
    persistPath = path.resolve(process.env.UIX_STORAGE_PATH, 'persist');

    // setup test config
    await fs.copy(path.resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH);

    // setup test auth file
    await fs.copy(path.resolve(__dirname, '../mocks', 'auth.json'), authFilePath);
    await fs.copy(path.resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ServerModule, AuthModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    serverService = await app.get(ServerService);
    configService = await app.get(ConfigService);
  });

  beforeEach(async () => {
    configService.serviceMode = false;

    // get auth token before each test
    authorization = 'bearer ' + (await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })).json().access_token;

    // ensure it's clean
    await fs.remove(persistPath);
    await fs.remove(accessoriesPath);

    // copy mock accessories and persist
    await fs.copy(path.resolve(__dirname, '../mocks', 'persist'), persistPath, { recursive: true });
    await fs.copy(path.resolve(__dirname, '../mocks', 'accessories'), accessoriesPath, { recursive: true });
  });

  it('PUT /server/restart', async () => {
    const mockRestartServer = jest.fn();
    serverService.restartServer = mockRestartServer;

    const res = await app.inject({
      method: 'PUT',
      path: '/server/restart',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(mockRestartServer).toHaveBeenCalled();
  });

  it('GET /server/qrcode.svg', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/server/qrcode.svg',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.headers['content-type']).toEqual('image/svg+xml');
  });

  it('GET /server/pairing', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/server/pairing',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toEqual({
      displayName: 'Homebridge Test',
      isPaired: false,
      pincode: '874-99-441',
      setupCode: 'X-HM://0024X0Z3L1FAP',
    });
  });

  it('GET /server/pairing (not ready)', async () => {
    // remove the persist folder
    await fs.remove(persistPath);

    const res = await app.inject({
      method: 'GET',
      path: '/server/pairing',
      headers: {
        authorization,
      },
    });

    // should return 503 - Service Unavailable
    expect(res.statusCode).toEqual(503);
  });

  it('PUT /server/reset-homebridge-accessory', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/server/reset-homebridge-accessory',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);

    // check the persist and accessories folders were removed
    expect(await fs.pathExists(persistPath)).toEqual(false);
    expect(await fs.pathExists(accessoriesPath)).toEqual(false);
  });

  it('PUT /server/reset-cached-accessories (service mode enabled)', async () => {
    // enable service mode
    configService.serviceMode = true;

    const res = await app.inject({
      method: 'PUT',
      path: '/server/reset-cached-accessories',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
  });

  it('PUT /server/reset-cached-accessories (service mode disabed)', async () => {
    // enable service mode
    configService.serviceMode = false;

    const res = await app.inject({
      method: 'PUT',
      path: '/server/reset-cached-accessories',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(400);
  });

  it('GET /server/cached-accessories', async () => {
    // enable service mode
    configService.serviceMode = true;

    const res = await app.inject({
      method: 'GET',
      path: '/server/cached-accessories',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toHaveLength(1);
  });

  it('DELETE /server/cached-accessories/:uuid (valid uuid)', async () => {
    // enable service mode
    configService.serviceMode = true;

    // sanity check to ensure one cached accessory is preset
    let cachedAccessories = await fs.readJson(path.resolve(accessoriesPath, 'cachedAccessories'));
    expect(cachedAccessories).toHaveLength(1);

    const listener = (event, callback) => {
      if (event === 'deleteSingleCachedAccessory') {
        callback();
      }
    };

    process.addListener('message', listener);

    const res = await app.inject({
      method: 'DELETE',
      path: `/server/cached-accessories/${cachedAccessories[0].UUID}`,
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(204);
    process.removeListener('message', listener);

    // check the cached accessory was removed
    cachedAccessories = await fs.readJson(path.resolve(accessoriesPath, 'cachedAccessories'));
    expect(cachedAccessories).toHaveLength(0);
  });

  it('DELETE /server/cached-accessories/:uuid (invalid uuid)', async () => {
    // enable service mode
    configService.serviceMode = true;

    // sanity check to ensure one cached accessory is preset
    let cachedAccessories = await fs.readJson(path.resolve(accessoriesPath, 'cachedAccessories'));
    expect(cachedAccessories).toHaveLength(1);

    const listener = (event, callback) => {
      if (event === 'deleteSingleCachedAccessory') {
        callback();
      }
    };
    process.addListener('message', listener);

    const res = await app.inject({
      method: 'DELETE',
      path: '/server/cached-accessories/xxxxxxxx',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(404);
    process.removeListener('message', listener);

    // check the cached accessory was not removed
    cachedAccessories = await fs.readJson(path.resolve(accessoriesPath, 'cachedAccessories'));
    expect(cachedAccessories).toHaveLength(1);
  });

  it('GET /server/pairings', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/server/pairings',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toHaveLength(1);
  });

  it('GET /server/pairings/:deviceId', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/server/pairings/67E41F0EA05D',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()._setupCode).toBeDefined();
    expect(res.json()._isPaired).toEqual(false);
    expect(res.json()._username).toEqual('67:E4:1F:0E:A0:5D');
  });

  it('DELETE /server/pairings/:deviceId', async () => {
    const res = await app.inject({
      method: 'DELETE',
      path: '/server/pairings/67E41F0EA05D',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(204);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /server/network-interfaces/system', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/server/network-interfaces/system',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.json())).toEqual(true);
  });

  it('GET /server/network-interfaces/bridge', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/server/network-interfaces/bridge',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.json())).toEqual(true);
  });

  it('PUT /server/network-interfaces/bridge', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/server/network-interfaces/bridge',
      headers: {
        authorization,
      },
      payload: {
        adapters: ['en0'],
      },
    });

    expect(res.statusCode).toEqual(200);

    // check the value was saved
    const config = await fs.readJson(configService.configPath);
    expect(config.bridge.bind).toEqual(['en0']);
  });

  it('PUT /server/network-interfaces/bridge (no adapters)', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/server/network-interfaces/bridge',
      headers: {
        authorization,
      },
      payload: {
        adapters: [],
      },
    });

    expect(res.statusCode).toEqual(200);

    // check the value was saved
    const config = await fs.readJson(configService.configPath);
    expect(config.bridge.bind).toBeUndefined();
  });

  it('PUT /server/network-interfaces/bridge (bad payload)', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/server/network-interfaces/bridge',
      headers: {
        authorization,
      },
      payload: {
        adapters: 'en0',
      },
    });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toContain('adapters must be an array');
  });

  it('GET /server/mdns-advertiser (not set - default true)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/server/mdns-advertiser',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toEqual({ legacyAdvertiser: true });
  });

  it('GET /server/mdns-advertiser (set to false)', async () => {
    const config: HomebridgeConfig = await fs.readJson(configService.configPath);
    config.mdns = { legacyAdvertiser: false };
    await fs.writeJson(configService.configPath, config);

    const res = await app.inject({
      method: 'GET',
      path: '/server/mdns-advertiser',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.json()).toEqual({ legacyAdvertiser: false });
  });

  it('PUT /server/mdns-advertiser (true)', async () => {
    const initialConfig: HomebridgeConfig = await fs.readJson(configService.configPath);
    delete initialConfig.mdns;
    await fs.writeJson(configService.configPath, initialConfig);

    const res = await app.inject({
      method: 'PUT',
      path: '/server/mdns-advertiser',
      headers: {
        authorization,
      },
      payload: {
        legacyAdvertiser: true,
      },
    });

    expect(res.statusCode).toEqual(200);

    // check the value was saved
    const config = await fs.readJson(configService.configPath);
    expect(config.mdns?.legacyAdvertiser).toEqual(true);
  });

  it('PUT /server/mdns-advertiser (false)', async () => {
    const initialConfig: HomebridgeConfig = await fs.readJson(configService.configPath);
    delete initialConfig.mdns;
    await fs.writeJson(configService.configPath, initialConfig);

    const res = await app.inject({
      method: 'PUT',
      path: '/server/mdns-advertiser',
      headers: {
        authorization,
      },
      payload: {
        legacyAdvertiser: false,
      },
    });

    expect(res.statusCode).toEqual(200);

    // check the value was saved
    const config = await fs.readJson(configService.configPath);
    expect(config.mdns?.legacyAdvertiser).toEqual(false);
  });

  it('GET /server/port/new', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/server/port/new',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(typeof res.json().port).toEqual('number');
    expect(res.json().port).toBeGreaterThanOrEqual(30000);
    expect(res.json().port).toBeLessThanOrEqual(60000);
  });
});
