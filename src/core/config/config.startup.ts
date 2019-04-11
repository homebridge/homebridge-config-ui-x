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
  };

  if (ui.ssl && ((ui.ssl.key && ui.ssl.cert) || ui.ssl.pfx)) {
    config.httpsOptions = {
      key: ui.ssl.key ? await fs.readFile(ui.ssl.key) : undefined,
      cert: ui.ssl.cert ? await fs.readFile(ui.ssl.cert) : undefined,
      pfx: ui.ssl.pfx ? await fs.readFile(ui.ssl.pfx) : undefined,
      passphrase: ui.ssl.passphrase,
    };
  }

  return config;
}