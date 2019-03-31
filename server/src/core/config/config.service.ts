import { Injectable } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';

@Injectable()
export class ConfigService {
  public name = 'homebridge-config-ui-x';
  public customPluginPath: string | undefined | null;
  public temperatureFile: string;

  public configPath = process.env.UIX_CONFIG_PATH || path.resolve(os.homedir(), '.homebridge/config.json');
  public storagePath = process.env.UIX_STORAGE_PATH || path.resolve(os.homedir(), '.homebridge');
  public secretPath = path.resolve(this.storagePath, '.uix-secrets');
  public homebridgeInsecureMode = Boolean(process.env.UIX_INSECURE_MODE);

  public homebridgeConfig: {
    bridge: {
      username: string;
      pin: string;
      name: string;
      port: number;
    },
    platforms: any[];
    accessories: any[];
  };

  public ui: {
    name: string;
    port: number;
    auth?: 'form' | false | null;
    theme: string;
    sudo?: boolean;
    restart?: string;
    log?: {
      method: string;
      command?: string;
      path?: string;
      service?: string;
    };
    ssl?: {
      key?: string;
      cert?: string;
      pfx?: string;
      passphrase?: string;
    };
    temp?: string;
    tempUnits?: string;
    loginWallpaper?: string;
    noFork: boolean;
    linux?: {
      shutdown?: string;
      restart?: string;
    };
    proxyHost?: string;
  };

  public secrets: {
    secretKey: string;
  };

  constructor() {
    this.homebridgeConfig = fs.readJSONSync(this.configPath);
    this.ui = this.homebridgeConfig.platforms.find(x => x.platform === 'config');
    this.secrets = this.getSecrets();
  }

  /**
   * Gets the unique secrets for signing JWTs
   */
  getSecrets() {
    if (fs.pathExistsSync(this.secretPath)) {
      try {
        const secrets = fs.readJsonSync(this.secretPath);
        if (!secrets.secretKey) {
          return this.generateSecretToken();
        } else {
          return secrets;
        }
      } catch (e) {
        return this.generateSecretToken();
      }
    } else {
      return this.generateSecretToken();
    }
  }

  /**
   * Generates the secret token for signing JWTs
   */
  generateSecretToken() {
    const secrets = {
      secretKey: crypto.randomBytes(32).toString('hex'),
    };

    fs.writeJsonSync(this.secretPath, secrets);

    return secrets;
  }
}
