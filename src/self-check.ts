import * as os from 'os';
import { Logger } from './core/logger/logger.service';

const logger = new Logger();

/**
 * The purpose of this script is to check the environment before launching the UI
 */
function main() {
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
      'reinstalling this homebridge-config-ui-x.');

    if ((process.env.UIX_SERVICE_MODE === '1')) {
      if (os.platform() === 'win32') {
        logger.error('[node-pty] From the Node.js command prompt (run as Administrator) run this command to rebuild Node.js modules:\n');
        logger.warn('hb-service rebuild\n');
      } else {
        logger.error('[node-pty] From the terminal run this command to rebuild Node.js modules:\n');
        logger.warn('sudo hb-service rebuild\n');
      }
      throw new Error('Node.js global modules rebuild required. See log errors above.');
    } else {
      if (os.platform() === 'win32') {
        logger.error('[node-pty] From the Node.js command prompt (run as Administrator) run these commands (exact commands may vary):\n');
        logger.warn('npm uninstall -g homebridge-config-ui-x');
        logger.warn('npm install -g homebridge-config-ui-x\n');
      } else if (os.platform() === 'darwin') {
        logger.error('[node-pty] From the terminal run these commands (exact commands may vary):\n');
        logger.warn('npm uninstall -g homebridge-config-ui-x');
        logger.warn('npm install -g --unsafe-perm homebridge-config-ui-x');
        logger.warn('cd $(npm -g prefix)/lib/node_modules');
        logger.warn('npm rebuild --unsafe-perm\n');
      } else {
        logger.error('[node-pty] From the terminal run these commands (exact commands may vary):\n');
        logger.warn('sudo npm uninstall -g homebridge-config-ui-x');
        logger.warn('sudo npm install -g --unsafe-perm homebridge-config-ui-x');
        logger.warn('cd $(sudo npm -g prefix)/lib/node_modules');
        logger.warn('sudo npm rebuild --unsafe-perm\n');
      }
    }
    process.exit(1);
  }

}

main();

/**
 * Catch startup errors
 */
process.on('unhandledRejection', (err: any) => {
  logger.error(err.toString());
  if (err.code === 'EADDRINUSE') {
    logger.error('Another process or service on this host is using port ' + err.port + '.');
    logger.error('Please stop the other service or change the port you have assigned to homebridge-config-ui-x.');
    logger.error('Ending process now.');
    setTimeout(() => process.exit(0));
  } else if (err.code === 'EACCES') {
    logger.error('The process owner does not have permission to run services on port ' + err.port + '.');
    logger.error('Please change the homebridge-config-ui-x port to something above 1024.');
    logger.error('Ending process now.');
    setTimeout(() => process.exit(0));
  } else {
    logger.error('Caught Unhandled Rejection Error :: Details Below');
    console.error(err);
  }
});