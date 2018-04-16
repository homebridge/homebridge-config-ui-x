import 'source-map-support/register';

import * as path from 'path';
import * as child_process from 'child_process';
import * as commander from 'commander';

let homebridge;

export = (api) => {
  homebridge = api;
  homebridge.registerPlatform('homebridge-config-ui-x', 'config', HomebridgeConfigUi);
};

class HomebridgeConfigUi {
  log;

  constructor(log, config) {
    this.log = log;

    const setup = {
      homebridgeVersion: homebridge.serverVersion,
      configPath: homebridge.user.configPath(),
      storagePath: homebridge.user.storagePath(),
      config: config
    };

    commander
      .allowUnknownOption()
      .option('-P, --plugin-path [path]', '', (p) => config.pluginPath = p)
      .option('-I, --insecure', '', () => config.homebridgeInsecure = true)
      .parse(process.argv);

    if (config.noFork) {
      this.noFork(setup);
    } else {
      this.fork(setup);
    }
  }

  /**
   * Run plugin as a seperate node.js process
   */
  fork(setup) {
    const ui = child_process.fork(path.resolve(__dirname, 'bin/fork'));

    this.log(`Spawning homebridge-config-ui-x with PID`, ui.pid);

    ui.on('message', (message) => {
      if (message === 'ready') {
        ui.send('ping');
        ui.send(setup);
      }
    });

    ui.on('close', () => {
      process.exit(1);
    });

    setInterval(() => {
      ui.send('ping');
    }, 15000);
  }

  /**
   * Run plugin in the main homebridge process
   */
  async noFork(setup) {
    const { UiServer } = await import('./server');
    return new UiServer(setup);
  }

  accessories(callback) {
    const accessories = [];
    callback(accessories);
  }
}
