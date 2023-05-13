/**
 * Pollyfill for Node.js 11.x that does not support `globalThis`
 * This should be removed when support for < Node.js 12 is dropped
 */
if (!global.globalThis && (process.versions.modules === '67' || process.versions.modules === '64')) {
  (global as any).globalThis = global;
}

import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';
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
      'or you may have recently upgraded Node.js to a new major version.');
    logger.error('[node-pty] Follow the steps below to resolve this issue.');

    try {
      tryRebuildNodePtyModule();
      logger.warn('[node-pty] Module rebuilt successfully (maybe) - if you are still encountering errors follow the steps below.');
    } catch (rebuildError) {
      logger.error('[node-pty] Failed to rebuild npm modules automatically. Manual operation is now required.');
    }

    const modulePath = path.dirname(__dirname);

    if ((process.env.UIX_SERVICE_MODE === '1')) {
      if (os.platform() === 'win32') {
        logger.warn('[node-pty] From the Node.js command prompt (run as Administrator) run this command to rebuild npm modules:\n');
        logger.warn('hb-service rebuild\n');
      } else {
        logger.warn('[node-pty] From the terminal run this command to rebuild npm modules:\n');
        logger.warn('sudo hb-service rebuild\n');
      }
      throw new Error('Node.js global modules rebuild required. See log errors above.');
    } else {
      if (os.platform() === 'win32') {
        logger.warn('[node-pty] From the Node.js command prompt (run as Administrator) run these commands (exact commands may vary):\n');
        logger.warn('npm uninstall -g homebridge-config-ui-x');
        logger.warn('npm install -g homebridge-config-ui-x\n');
      } else if (os.platform() === 'darwin') {
        logger.warn('[node-pty] From the terminal run these commands (exact commands may vary):\n');
        logger.warn(`cd ${modulePath}`);
        logger.warn('sudo npm rebuild --unsafe-perm\n');
      } else {
        logger.warn('[node-pty] From the terminal run these commands (exact commands may vary):\n');
        logger.warn(`cd ${modulePath}`);
        logger.warn('sudo npm rebuild --unsafe-perm\n');
      }
    }
    process.exit(1);
  }

}

function tryRebuildNodePtyModule() {
  // using eval('require') here so it does not break with webpack
  const modulePath = path.dirname(path.dirname(eval('require').resolve('node-pty-prebuilt-multiarch')));

  logger.warn('[node-pty] Trying to rebuild automatically...');
  logger.warn(`[node-pty] Path: ${modulePath}`);
  try {
    if (process.env.UIX_USE_PNPM === '1' && process.env.UIX_CUSTOM_PLUGIN_PATH) {
      child_process.execSync('pnpm rebuild node-pty-prebuilt-multiarch', {
        cwd: process.env.UIX_CUSTOM_PLUGIN_PATH,
        stdio: 'ignore',
      });
    } else {
      child_process.execSync('npm run install --unsafe-perm', {
        cwd: modulePath,
        stdio: 'ignore',
      });
    }
  } catch (e) {
    if (os.platform() !== 'win32') {
      child_process.execSync('sudo -E -n run install --unsafe-perm', {
        cwd: modulePath,
        stdio: 'ignore',
      });
    } else {
      throw e;
    }
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
