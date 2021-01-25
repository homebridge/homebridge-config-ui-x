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

    if (!semver.satisfies(process.version, '>=10.17.0')) {
      const msg = `Node.js v10.17.0 higher is required. You may experience issues running this plugin running on ${process.version}.`;
      log.error(msg);
      log.warn(msg);
    }

    if (process.env.UIX_SERVICE_MODE === '1' && process.connected) {
      this.log('Running in Service Mode');
      this.serviceMode();
    } else if (config.standalone || process.env.UIX_SERVICE_MODE === '1' ||
      (process.env.HOMEBRIDGE_CONFIG_UI === '1' && semver.satisfies(process.env.CONFIG_UI_VERSION, '>=3.5.5', { includePrerelease: true }))) {
      this.log.warn('*********** Homebridge Standalone Mode Is Depreciated **********');
      this.log.warn('* Please swap to "service mode" using the hb-service command.  *');
      this.log.warn('* See https://git.io/JUvQr for instructions on how to migrate. *');
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
  serviceMode() {
    process.on('disconnect', () => {
      process.exit();
    });
  }

  accessories(callback) {
    const accessories = [];
    callback(accessories);
  }

}
