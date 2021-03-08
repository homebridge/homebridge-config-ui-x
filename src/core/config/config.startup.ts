import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';

import { Logger } from '../logger/logger.service';

/**
 * Return config required to start the console server
 */
export async function getStartupConfig() {
  const logger = new Logger();

  const configPath = process.env.UIX_CONFIG_PATH || path.resolve(os.homedir(), '.homebridge/config.json');

  const homebridgeConfig = await fs.readJSON(configPath);
  const ui = Array.isArray(homebridgeConfig.platforms) ? homebridgeConfig.platforms.find(x => x.platform === 'config') : undefined;

  const config = {} as {
    host?: '::' | '0.0.0.0' | string;
    httpsOptions?: {
      key?: Buffer;
      cert?: Buffer;
      pfx?: Buffer;
      passphrase?: string;
    };
    cspWsOveride?: string;
    debug?: boolean;
  };

  // check if IPv6 is available on this host
  const ipv6 = Object.entries(os.networkInterfaces()).filter(([net, addresses]) => {
    return addresses.find(x => x.family === 'IPv6');
  }).length;

  config.host = ipv6 ? '::' : '0.0.0.0';

  // if no ui settings configured - we are done
  if (!ui) {
    return config;
  }

  // preload custom host settings
  if (ui.host) {
    config.host = ui.host;
  }

  // preload ssl settings
  if (ui.ssl && ((ui.ssl.key && ui.ssl.cert) || ui.ssl.pfx)) {
    for (const attribute of ['key', 'cert', 'pfx']) {
      if (ui.ssl[attribute]) {
        if (!(await (fs.stat(ui.ssl[attribute]))).isFile()) {
          logger.error(`SSL Config Error: ui.ssl.${attribute}: ${ui.ssl[attribute]} is not a valid file`);
        }
      }
    }

    try {
      config.httpsOptions = {
        key: ui.ssl.key ? await fs.readFile(ui.ssl.key) : undefined,
        cert: ui.ssl.cert ? await fs.readFile(ui.ssl.cert) : undefined,
        pfx: ui.ssl.pfx ? await fs.readFile(ui.ssl.pfx) : undefined,
        passphrase: ui.ssl.passphrase,
      };
    } catch (e) {
      logger.error('WARNING: COULD NOT START SERVER WITH SSL ENABLED');
      logger.error(e);
    }
  }

  // preload proxy host settings
  if (ui.proxyHost) {
    config.cspWsOveride = `wss://${ui.proxyHost} ws://${ui.proxyHost}`;
  }

  // preload debug settings
  if (ui.debug) {
    config.debug = true;
    process.env.UIX_DEBUG_LOGGING = '1';
  } else {
    config.debug = false;
    process.env.UIX_DEBUG_LOGGING = '0';
  }

  return config;
}
