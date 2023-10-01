/**
 * Homebridge Entry Point
 */

import * as path from 'path';
import * as child_process from 'child_process';
import * as commander from 'commander';

let homebridge;

export = (api) => {
  homebridge = api;
  homebridge.registerPlatform('homebridge-config-ui-x', 'config', HomebridgeConfigUi);

  if (process.env.UIX_SERVICE_MODE === '1' && process.connected) {
    HomebridgeConfigUi.serviceMode();
  }
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

    if (process.env.UIX_SERVICE_MODE === '1' && process.connected) {
      this.log('Running in Service Mode');
      return;
    } else if (config.standalone || process.env.UIX_SERVICE_MODE === '1') {
      this.log.warn('*********** Homebridge Standalone Mode Is Depreciated **********');
      this.log.warn('* Please swap to "service mode" using the hb-service command.  *');
      this.log.warn('* See https://homebridge.io/w/JUvQr for instructions on how to migrate. *');
      this.log('Running in Standalone Mode.');
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

    this.log('Spawning homebridge-config-ui-x with PID', ui.pid);

    ui.on('close', () => {
      process.kill(process.pid, 'SIGTERM');
    });

    ui.on('error', (err) => {
      // do nothing
    });
  }

  /**
   * Run plugin in the main homebridge process
   */
  async noFork() {
    await import('./main');
  }

  /**
   * Setup the service mode process helper
   * This ensures the Homebridge process is killed when hb-service
   * is killed with SIGTERM to prevent stale processes.
   */
  static serviceMode() {
    process.on('disconnect', () => {
      process.exit();
    });
  }

  accessories(callback) {
    const accessories = [];
    callback(accessories);
  }

}
