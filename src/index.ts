import 'source-map-support/register';

import * as http from 'http';
import * as path from 'path';
import * as child_process from 'child_process';
import * as commander from 'commander';

let homebridge;

export = (api) => {
  homebridge = api;
  homebridge.registerPlatform('homebridge-config-ui-x', 'config', HomebridgeConfigUi);
  homebridge.registerPlatform('homebridge-config-ui-x', 'config-fork', HomebridgeConfigUiFork);
  return HomebridgeConfigUi;
};

class HomebridgeConfigUi {
  private hb;
  private server;

  constructor(log, config) {
    // bootstrap the server
    this.bootstrap(log, config);
  }

  async bootstrap(log, config) {
    // import hb
    const module = await import('./hb');
    this.hb = module.hb;

    // initial setup
    this.hb.homebridge = homebridge;
    this.hb.init(log, config);

    // ensure auth.json is setup correctly
    const { users } = await import('./users');
    await users.setupAuthFile();

    // load config.json into memory
    await this.hb.refreshHomebridgeConfig();

    // dynamically load modules so app is only loaded if plugin is enabled
    const { ExpressServer } = await import('./app');
    const { WSS } = await import('./wss');

    const app = new ExpressServer().app;

    this.server = http.createServer(app);

    // attach websocker server to the express server
    this.hb.wss = new WSS(this.server);

    this.server.listen(this.hb.port);
    this.server.on('error', this.onServerError.bind(this));
    this.server.on('listening', this.onServerListening.bind(this));
  }

  onServerListening() {
    const addr = this.server.address();
    const bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
    const msg = 'Console is listening on ' + bind + '.';
    this.hb.log(msg);
  }

  onServerError(error) {
    if (error.syscall !== 'listen') {
      throw error;
    }

    const bind = typeof this.hb.port === 'string' ? 'Pipe ' + this.hb.port : 'Port ' + this.hb.port;

    switch (error.code) {
      case 'EACCES':
        console.error(bind + ' requires elevated privileges');
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(bind + ' is already in use');
        process.exit(1);
        break;
      default:
        throw error;
    }
  }

  accessories(callback) {
    const accessories = [];
    callback(accessories);
  }
}

/**
 * Run plugin as a seperate node.js process
 */
class HomebridgeConfigUiFork {
  constructor(log, config) {

    const setup = {
      serverVersion: homebridge.serverVersion,
      homebridge: {
        configPath: homebridge.user.configPath(),
        storagePath: homebridge.user.storagePath()
      },
      config: config
    };

    commander
      .allowUnknownOption()
      .option('-P, --plugin-path [path]', '', (p) => config.pluginPath = p)
      .option('-I, --insecure', '', () => config.homebridgeInsecure = true)
      .parse(process.argv);

    const ui = child_process.fork(path.resolve(__dirname, 'fork'));

    ui.on('message', (message) => {
      if (message === 'ready') {
        ui.send(setup);
      }
    });

    ui.on('close', () => {
      process.exit(1);
    });
  }

  accessories(callback) {
    const accessories = [];
    callback(accessories);
  }
}
