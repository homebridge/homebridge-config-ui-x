import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import { EventEmitter } from 'events';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { LogModule } from '../../src/modules/log/log.module';
import { LogGateway } from '../../src/modules/log/log.gateway';
import { LogService } from '../../src/modules/log/log.service';
import { ConfigService } from '../../src/core/config/config.service';

describe('LogGateway (e2e)', () => {
  let app: NestFastifyApplication;

  let authFilePath: string;
  let secretsFilePath: string;
  let logFilePath: string;

  let configService: ConfigService;
  let logGateway: LogGateway;
  let logService: LogService;
  let client: EventEmitter;

  const size = { cols: 80, rows: 24 };

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = path.resolve(__dirname, '../../');
    process.env.UIX_STORAGE_PATH = path.resolve(__dirname, '../', '.homebridge');
    process.env.UIX_CONFIG_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'config.json');

    authFilePath = path.resolve(process.env.UIX_STORAGE_PATH, 'auth.json');
    secretsFilePath = path.resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets');
    logFilePath = path.resolve(process.env.UIX_STORAGE_PATH, 'homebridge.log');

    // setup test config
    await fs.copy(path.resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH);

    // setup test auth file
    await fs.copy(path.resolve(__dirname, '../mocks', 'auth.json'), authFilePath);
    await fs.copy(path.resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [LogModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    configService = app.get(ConfigService);
    logService = app.get(LogService);
    logGateway = app.get(LogGateway);
  });

  beforeEach(async () => {
    if (client) {
      client.emit('disconnect');
    }

    jest.resetAllMocks();

    // create sample data
    const sampleLogData = ['line 1', 'line 2', 'line 3'].join('\n');
    await fs.writeFile(logFilePath, sampleLogData);

    // create client
    client = new EventEmitter();

    jest.spyOn(client, 'emit');
    jest.spyOn(client, 'on');

    // unset log mode between each test
    configService.ui.sudo = false;
    configService.ui.log = undefined;
    logService.setLogMethod();
  });

  it('ON /log/tail-log (native)', async () => {
    // set log mode to native
    configService.ui.log = { method: 'native', path: logFilePath };
    logService.setLogMethod();

    // check the log command is correct
    expect((logService as any).useNative).toEqual(true);
    expect((logService as any).command).not.toBeDefined();

    logGateway.connect(client, size);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('line 1'));
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('line 2'));
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('line 3'));
  });

  it('ON /log/tail-log (tail)', async () => {
    // this test will not run on windows
    if (os.platform() === 'win32') {
      return;
    }

    // set log mode to file
    configService.ui.log = { method: 'file', path: logFilePath };
    logService.setLogMethod();

    // check the log command is correct
    expect((logService as any).useNative).toEqual(false);
    expect((logService as any).command).toEqual(['tail', '-n', '500', '-f', logFilePath]);

    logGateway.connect(client, size);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('line 1'));
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('line 2'));
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('line 3'));
  });

  it('ON /log/tail-log (tail - with sudo)', async () => {
    // this test will not run on windows
    if (os.platform() === 'win32') {
      return;
    }

    // set log mode to file and enable sudo
    configService.ui.sudo = true;
    configService.ui.log = { method: 'file', path: logFilePath };
    logService.setLogMethod();

    // check the log command is correct
    expect((logService as any).useNative).toEqual(false);
    expect((logService as any).command).toEqual(['sudo', '-n', 'tail', '-n', '500', '-f', logFilePath]);
  });

  it('ON /log/tail-log (systemd)', async () => {
    // this test will not run on windows
    if (os.platform() === 'win32') {
      return;
    }

    // set log mode to systemd
    configService.ui.log = { method: 'systemd' };
    logService.setLogMethod();

    // check the log command is correct
    expect((logService as any).useNative).toEqual(false);
    expect((logService as any).command).toEqual(['journalctl', '-o', 'cat', '-n', '500', '-f', '-u', 'homebridge']);
  });

  it('ON /log/tail-log (systemd - with sudo)', async () => {
    // this test will not run on windows
    if (os.platform() === 'win32') {
      return;
    }

    // set log mode to systemd
    configService.ui.sudo = true;
    configService.ui.log = { method: 'systemd' };
    logService.setLogMethod();

    // check the log command is correct
    expect((logService as any).useNative).toEqual(false);
    expect((logService as any).command).toEqual(['sudo', '-n', 'journalctl', '-o', 'cat', '-n', '500', '-f', '-u', 'homebridge']);
  });

  it('ON /log/tail-log (powershell)', async () => {
    // this test will only run on Windows
    if (os.platform() !== 'win32') {
      return;
    }

    // set log mode to file
    configService.ui.log = { method: 'file', path: logFilePath };
    logService.setLogMethod();

    // check the log command is correct
    expect((logService as any).useNative).toEqual(false);
    expect((logService as any).command).toEqual(['powershell.exe', '-command', `Get-Content -Path '${logFilePath}' -Wait -Tail 200`]);

    logGateway.connect(client, size);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('line 1'));
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('line 2'));
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('line 3'));
  });

  it('ON /log/tail-log (cleans up connections)', async () => {
    // set log mode to native
    configService.ui.log = { method: 'native', path: logFilePath };
    logService.setLogMethod();

    logGateway.connect(client, size);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // ensure the log is working
    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('line 1'));

    // initial listeners
    expect((logService as any).nativeTail.listenerCount('line')).toEqual(1);
    expect(client.listenerCount('disconnect')).toEqual(1);
    expect(client.listenerCount('end')).toEqual(1);

    // emit disconnect
    client.emit('disconnect');

    await new Promise((resolve) => setTimeout(resolve, 100));

    // ensure listeners have been removed
    expect((logService as any).nativeTail.listenerCount('line')).toEqual(0);
    expect(client.listenerCount('disconnect')).toEqual(0);
    expect(client.listenerCount('end')).toEqual(0);
  });

  it('ON /log/tail-log (not configured)', async () => {
    logGateway.connect(client, size);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(client.emit).toHaveBeenCalledWith('stdout', expect.stringContaining('Cannot show logs.'));
  });

  afterAll(async () => {
    await app.close();
  });
});
