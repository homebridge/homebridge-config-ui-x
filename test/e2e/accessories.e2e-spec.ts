import * as path from 'path';
import * as fs from 'fs-extra';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { AuthModule } from '../../src/core/auth/auth.module';
import { AccessoriesModule } from '../../src/modules/accessories/accessories.module';
import { ConfigService } from '../../src/core/config/config.service';
import { AccessoriesService } from '../../src/modules/accessories/accessories.service';

describe('AccessoriesController (e2e)', () => {
  let app: NestFastifyApplication;

  let configService: ConfigService;
  let accessoriesService: AccessoriesService;

  let authFilePath: string;
  let secretsFilePath: string;
  let authorization: string;

  const refreshCharacteristics = jest.fn();
  const getCharacteristic = jest.fn();
  const setValue = jest.fn();

  const booleanCharacteristic = {
    setValue,
    'type': 'On',
    'value': true,
    'format': 'bool',
    'canWrite': true,
  };

  const intCharacteristic = {
    setValue,
    'type': 'Active',
    'value': 1,
    'format': 'uint8',
    'maxValue': 1,
    'minValue': 0,
    'canWrite': true,
  };

  const floatCharacteristic = {
    setValue,
    'type': 'TargetTemperature',
    'value': 1,
    'format': 'float',
    'maxValue': 100,
    'minValue': 18,
    'canWrite': true,
  };

  const mockedServices = [
    {
      refreshCharacteristics,
      getCharacteristic,
      'serviceCharacteristics': [
        booleanCharacteristic,
        intCharacteristic,
        floatCharacteristic,
      ],
      'uniqueId': 'c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
    },
  ];

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

    // enable insecure mode for this test suite.
    configService = new ConfigService();
    configService.homebridgeInsecureMode = true;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AccessoriesModule, AuthModule],
    }).overrideProvider(ConfigService).useValue(configService).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    accessoriesService = app.get(AccessoriesService);
  });

  beforeEach(async () => {
    jest.resetAllMocks();

    // enable insecure mode
    configService.homebridgeInsecureMode = true;

    // setup mocks
    jest.spyOn(accessoriesService.hapClient, 'getAllServices')
      .mockResolvedValue(mockedServices as any);

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

  it('GET /accessories (insecure mode enabled)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/accessories',
      headers: {
        authorization,
      },
    });

    expect(jest.spyOn(accessoriesService.hapClient, 'getAllServices')).toHaveBeenCalled();
    expect(res.statusCode).toEqual(200);
    expect(res.json()).toHaveLength(1);
  });

  it('GET /accessories (insecure mode disabled)', async () => {
    configService.homebridgeInsecureMode = false;

    const res = await app.inject({
      method: 'GET',
      path: '/accessories',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(400);
  });

  it('GET /accessories/layout', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/accessories/layout',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
  });

  it('GET /accessories/:uniqueId (valid unique id)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(200);
    expect(refreshCharacteristics).toHaveBeenCalledTimes(1);
  });

  it('GET /accessories/:uniqueId (invalid unique id)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/accessories/xxxx',
      headers: {
        authorization,
      },
    });

    expect(res.statusCode).toEqual(400);
  });

  it('PUT /accessories/:uniqueId (boolean - valid)', async () => {
    getCharacteristic.mockReturnValueOnce(booleanCharacteristic);

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'On',
        value: 'true',
      },
    });

    expect(getCharacteristic).toHaveBeenCalled();
    expect(setValue).toHaveBeenCalledWith(true);
    expect(res.statusCode).toEqual(200);
  });

  it('PUT /accessories/:uniqueId (boolean - invalid)', async () => {
    getCharacteristic.mockReturnValueOnce(booleanCharacteristic);

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'On',
        value: 'not a boolean',
      },
    });

    expect(getCharacteristic).toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
    expect(res.statusCode).toEqual(400);
  });

  it('PUT /accessories/:uniqueId (int - valid)', async () => {
    getCharacteristic.mockReturnValueOnce(intCharacteristic);

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'Active',
        value: 1,
      },
    });

    expect(getCharacteristic).toHaveBeenCalled();
    expect(setValue).toHaveBeenCalledWith(1);
    expect(res.statusCode).toEqual(200);
  });

  it('PUT /accessories/:uniqueId (int - out of range)', async () => {
    getCharacteristic.mockReturnValueOnce(intCharacteristic);

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'Active',
        value: 22,
      },
    });

    expect(getCharacteristic).toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
    expect(res.statusCode).toEqual(400);
  });

  it('PUT /accessories/:uniqueId (float - valid)', async () => {
    getCharacteristic.mockReturnValueOnce(floatCharacteristic);

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'TargetTemperature',
        value: '22.5',
      },
    });

    expect(getCharacteristic).toHaveBeenCalled();
    expect(setValue).toHaveBeenCalledWith(22.5);
    expect(res.statusCode).toEqual(200);
  });

  it('PUT /accessories/:uniqueId (float - out of range)', async () => {
    getCharacteristic.mockReturnValueOnce(floatCharacteristic);

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'TargetTemperature',
        value: '12.6',
      },
    });

    expect(getCharacteristic).toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
    expect(res.statusCode).toEqual(400);
  });

  it('PUT /accessories/:uniqueId (invalid characteristic type)', async () => {
    getCharacteristic.mockReturnValueOnce(null);

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'NotReal',
        value: '12.6',
      },
    });

    expect(getCharacteristic).toHaveBeenCalledWith('NotReal');
    expect(setValue).not.toHaveBeenCalled();
    expect(res.statusCode).toEqual(400);
  });

  it('PUT /accessories/:uniqueId (missing characteristic type)', async () => {
    getCharacteristic.mockReturnValueOnce(null);

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        value: '12.6',
      },
    });

    expect(getCharacteristic).not.toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
    expect(res.statusCode).toEqual(400);
    expect(res.body).toContain('characteristicType should not be null or undefined');
  });

  it('PUT /accessories/:uniqueId (missing value)', async () => {
    getCharacteristic.mockReturnValueOnce(null);

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'TargetTemperature',
      },
    });

    expect(getCharacteristic).not.toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
    expect(res.statusCode).toEqual(400);
    expect(res.body).toContain('value should not be null or undefined');
  });

  afterAll(async () => {
    await app.close();
  });
});
