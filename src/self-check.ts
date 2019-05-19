import { Logger } from './core/logger/logger.service';

/**
 * The purpose of this script is to check the environment before launching the UI
 */
async function main() {
  const logger = new Logger();

  // check if node-pty is built correctly
  try {
    require('node-pty-prebuilt-multiarch');
  } catch (e) {
    logger.error(e);
    logger.error(`[node-pty] Node.js ${process.version}`);
    logger.error('[node-pty] Failed to load node-pty module');
    logger.error('[node-pty] This could be because the installation of this plugin did not complete successfully ' +
      'or you may have recently upgraded Node.js to a new major version and have not reinstalled or rebuilt this plugin.');
    logger.error('[node-pty] This can usually be fixed by uninstalling and ' +
      'reinstalling this plugin (exact command may vary based on your platform and setup):');
    logger.error('[node-pty] sudo npm uninstall -g homebridge-config-ui-x');
    logger.error('[node-pty] sudo npm install -g --unsafe-perm homebridge-config-ui-x');
    process.exit(1);
  }

}

main();