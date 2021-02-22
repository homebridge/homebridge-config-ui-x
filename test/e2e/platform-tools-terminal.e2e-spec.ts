import * as path from 'path';
import * as fs from 'fs-extra';
import { EventEmitter } from 'events';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import type { IPty } from 'node-pty-prebuilt-multiarch';

import { ConfigService } from '../../src/core/config/config.service';
import { TerminalModule } from '../../src/modules/platform-tools/terminal/terminal.module';
import { WsEventEmitter } from '../../src/modules/platform-tools/terminal/terminal.service';
import { TerminalGateway } from '../../src/modules/platform-tools/terminal/terminal.gateway';
import { NodePtyService } from '../../src/core/node-pty/node-pty.service';

// create mock websocket client
class MockWsEventEmmiter extends EventEmitter implements WsEventEmitter {
  constructor() {
    super();
  }

  disconnect = jest.fn();
}

describe('PlatformToolsTerminal (e2e)', () => {
  let app: NestFastifyApplication;

  let authFilePath: string;
  let secretsFilePath: string;

  let configService: ConfigService;
  let terminalGateway: TerminalGateway;
  let nodePtyService: NodePtyService;
  let client: WsEventEmitter;

  const size = { cols: 80, rows: 24 };

  const mockTerm = {
    onData: jest.fn() as IPty['onData'],
    onExit: jest.fn() as IPty['onExit'],
    kill: jest.fn() as IPty['kill'],
    write: jest.fn() as IPty['write'],
    resize: jest.fn() as IPty['resize'],
  } as IPty;

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
      imports: [TerminalModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    configService = app.get(ConfigService);
    terminalGateway = app.get(TerminalGateway);
    nodePtyService = app.get(NodePtyService);
  });

  beforeEach(async () => {
    jest.resetAllMocks();

    // create client
    client = new MockWsEventEmmiter();

    jest.spyOn(client, 'emit');
    jest.spyOn(client, 'on');
    jest.spyOn(nodePtyService, 'spawn')
      .mockImplementationOnce(() => {
        return mockTerm;
      });

    configService.enableTerminalAccess = true;
  });

  afterEach(async () => {
    client.emit('disconnect');
  });

  it('ON /platform-tools/terminal/start-session (terminal access not enabled)', async () => {
    configService.enableTerminalAccess = false;

    terminalGateway.startTerminalSession(client, size);

    expect(client.disconnect).toHaveBeenCalled();
    expect(nodePtyService.spawn).not.toHaveBeenCalled();
  });

  it('ON /platform-tools/terminal/start-session', async () => {
    terminalGateway.startTerminalSession(client, size);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(nodePtyService.spawn).toHaveBeenCalled();
  });

  it('ON /platform-tools/terminal/start-session (cleanup)', async () => {
    terminalGateway.startTerminalSession(client, size);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(nodePtyService.spawn).toHaveBeenCalled();

    // check initial listeners
    expect(client.listenerCount('stdin')).toEqual(1);
    expect(client.listenerCount('resize')).toEqual(1);
    expect(client.listenerCount('end')).toEqual(1);
    expect(client.listenerCount('disconnect')).toEqual(1);

    // end the session
    client.emit('end');

    // check the listeners were removed
    expect(client.listenerCount('stdin')).toEqual(0);
    expect(client.listenerCount('resize')).toEqual(0);
    expect(client.listenerCount('end')).toEqual(0);
    expect(client.listenerCount('disconnect')).toEqual(0);

    // check the terminal was exited
    expect(mockTerm.onExit).toHaveBeenCalled();
    expect(mockTerm.kill).toHaveBeenCalled();
  });

  it('ON /platform-tools/terminal/start-session (stdin)', async () => {
    terminalGateway.startTerminalSession(client, size);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(nodePtyService.spawn).toHaveBeenCalled();

    // send stdin
    client.emit('stdin', 'help');
    expect(mockTerm.write).toHaveBeenCalledWith('help');
  });

  it('ON /platform-tools/terminal/start-session (resize)', async () => {
    terminalGateway.startTerminalSession(client, size);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(nodePtyService.spawn).toHaveBeenCalled();

    // send stdin
    client.emit('resize', { cols: 20, rows: 25 });
    expect(mockTerm.resize).toHaveBeenCalledWith(20, 25);
  });

  afterAll(async () => {
    await app.close();
  });
});
