import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * Return config required to start the console server
 */
export async function getStartupConfig() {
  const configPath = process.env.UIX_CONFIG_PATH || path.resolve(os.homedir(), '.homebridge/config.json');

  const homebridgeConfig = await fs.readJSON(configPath);
  const ui = homebridgeConfig.platforms.find(x => x.platform === 'config');

  if (!ui) {
    return {};
  }

  const config = {} as {
    httpsOptions?: {
      key?: Buffer,
      cert?: Buffer,
      pfx?: Buffer,
      passphrase?: string,
    },
    cspWsOveride?: string;
    debug?: boolean;
  };

  if (ui.ssl && ((ui.ssl.key && ui.ssl.cert) || ui.ssl.pfx)) {
    config.httpsOptions = {
      key: ui.ssl.key ? await fs.readFile(ui.ssl.key) : undefined,
      cert: ui.ssl.cert ? await fs.readFile(ui.ssl.cert) : undefined,
      pfx: ui.ssl.pfx ? await fs.readFile(ui.ssl.pfx) : undefined,
      passphrase: ui.ssl.passphrase,
    };
  }

  if (ui.proxyHost) {
    config.cspWsOveride = `wss://${ui.proxyHost} ws://${ui.proxyHost}`;
  }

  if (ui.debug) {
    config.debug = true;
  } else {
    config.debug = false;
  }

  return config;
}