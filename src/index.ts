import 'source-map-support/register';

import * as path from 'path';
import * as child_process from 'child_process';
import * as commander from 'commander';

let homebridge;

export = (api) => {
  homebridge = api;
  homebridge.registerPlatform('homebridge-config-ui-x', 'config', HomebridgeConfigUiFork);
};

/**
 * Run plugin as a seperate node.js process
 */
class HomebridgeConfigUiFork {
  constructor(log, config) {

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

    const ui = child_process.fork(path.resolve(__dirname, 'fork'));

    log(`Spawning homebridge-config-ui-x with PID`, ui.pid);

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
