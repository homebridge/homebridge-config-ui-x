import { Injectable } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import * as semver from 'semver';

@Injectable()
export class ConfigService {
  public name = 'homebridge-config-ui-x';
  public customPluginPath: string | undefined | null;
  public temperatureFile: string;

  // homebridge env
  public configPath = process.env.UIX_CONFIG_PATH || path.resolve(os.homedir(), '.homebridge/config.json');
  public storagePath = process.env.UIX_STORAGE_PATH || path.resolve(os.homedir(), '.homebridge');
  public secretPath = path.resolve(this.storagePath, '.uix-secrets');
  public authPath = path.resolve(this.storagePath, 'auth.json');
  public accessoryLayoutPath = path.resolve(this.storagePath, 'accessories', 'uiAccessoriesLayout.json');
  public homebridgeInsecureMode = Boolean(process.env.UIX_INSECURE_MODE);

  // server env
  public runningInDocker = Boolean(process.env.HOMEBRIDGE_CONFIG_UI === '1');
  public runningInLinux = (!this.runningInDocker && os.platform() === 'linux');
  public ableToConfigureSelf = (!this.runningInDocker || semver.satisfies(process.env.CONFIG_UI_VERSION, '>=3.5.5'));
  public enableTerminalAccess = this.runningInDocker || Boolean(process.env.HOMEBRIDGE_CONFIG_UI_TERMINAL === '1');

  // package.json
  public package = fs.readJsonSync(path.resolve(__dirname, '../../../../package.json'));

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
    auth: 'form' | 'none';
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
   * Settings that are sent to the UI
   */
  public uiSettings() {
    return {
      env: {
        ableToConfigureSelf: this.ableToConfigureSelf,
        enableAccessories: this.homebridgeInsecureMode,
        enableTerminalAccess: this.enableTerminalAccess,
        homebridgeInstanceName: this.homebridgeConfig.bridge.name,
        nodeVersion: process.version,
        packageName: this.package.name,
        packageVersion: this.package.version,
        runningInDocker: this.runningInDocker,
        runningInLinux: this.runningInLinux,
        temperatureUnits: this.ui.tempUnits,
      },
      formAuth: Boolean(this.ui.auth !== 'none'),
      theme: this.ui.theme,
    };
  }

  /**
   * Gets the unique secrets for signing JWTs
   */
  private getSecrets() {
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
  private generateSecretToken() {
    const secrets = {
      secretKey: crypto.randomBytes(32).toString('hex'),
    };

    fs.writeJsonSync(this.secretPath, secrets);

    return secrets;
  }

}
