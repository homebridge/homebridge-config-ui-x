/**
 * Homebridge Entry Point
 */

import * as path from 'path';
import * as child_process from 'child_process';
import * as commander from 'commander';
import * as semver from 'semver';

let homebridge;

export = (api) => {
  homebridge = api;
  homebridge.registerPlatform('homebridge-config-ui-x', 'config', HomebridgeConfigUi);
};

class HomebridgeConfigUi {
  log;

  constructor(log, config) {
    this.log = log;

    process.env.UIX_CONFIG_PATH = homebridge.user.configPath();
    process.env.UIX_STORAGE_PATH = homebridge.user.storagePath();
    process.env.UIX_PLUGIN_NAME = config.name || 'homebridge-config-ui-x';

    commander
      .allowUnknownOption()
      .option('-P, --plugin-path [path]', '', (p) => process.env.UIX_CUSTOM_PLUGIN_PATH = p)
      .option('-I, --insecure', '', () => process.env.UIX_INSECURE_MODE = '1')
      .option('-T, --no-timestamp', '', () => process.env.UIX_LOG_NO_TIMESTAMPS = '1')
      .parse(process.argv);

    if (!semver.satisfies(process.version, '>=8.15.1')) {
      const msg = `Node.js v8.15.1 higher is required. You may experience issues running this plugin running on ${process.version}.`;
      log.error(msg);
      log.warn(msg);
    }

    if (config.standalone || (
      process.env.HOMEBRIDGE_CONFIG_UI === '1' && semver.satisfies(process.env.CONFIG_UI_VERSION, '>=3.5.5', { includePrerelease: true }))
    ) {
      this.log(`Running in Standalone Mode.`);
    } else if (config.noFork) {
      this.noFork();
    } else {
      this.fork();
    }
  }

  /**
   * Run plugin as a seperate node.js process
   */
  fork() {
    const ui = child_process.fork(path.resolve(__dirname, 'bin/fork'), null, {
      env: process.env,
    });

    this.log(`Spawning homebridge-config-ui-x with PID`, ui.pid);

    ui.on('close', () => {
      process.kill(process.pid, 'SIGTERM');
    });

    ui.on('error', (err) => { });
  }

  /**
   * Run plugin in the main homebridge process
   */
  async noFork() {
    await import('./main');
  }

  accessories(callback) {
    const accessories = [];
    callback(accessories);
  }

}
