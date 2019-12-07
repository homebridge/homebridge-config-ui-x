import { Injectable } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import * as semver from 'semver';

export interface HomebridgeConfig {
  bridge: {
    username: string;
    pin: string;
    name: string;
    port: number;
  };
  platforms: any[];
  accessories: any[];
  plugins?: string;
}

@Injectable()
export class ConfigService {
  public name = 'homebridge-config-ui-x';

  // homebridge env
  public configPath = process.env.UIX_CONFIG_PATH || path.resolve(os.homedir(), '.homebridge/config.json');
  public storagePath = process.env.UIX_STORAGE_PATH || path.resolve(os.homedir(), '.homebridge');
  public customPluginPath = process.env.UIX_CUSTOM_PLUGIN_PATH;
  public secretPath = path.resolve(this.storagePath, '.uix-secrets');
  public authPath = path.resolve(this.storagePath, 'auth.json');
  public accessoryLayoutPath = path.resolve(this.storagePath, 'accessories', 'uiAccessoriesLayout.json');
  public homebridgeInsecureMode = Boolean(process.env.UIX_INSECURE_MODE === '1');
  public homebridgeNoTimestamps = Boolean(process.env.UIX_LOG_NO_TIMESTAMPS === '1');

  // server env
  public minimumNodeVersion = '8.15.1';
  public serviceMode = (process.env.UIX_SERVICE_MODE === '1');
  public runningInDocker = Boolean(process.env.HOMEBRIDGE_CONFIG_UI === '1');
  public runningInLinux = (!this.runningInDocker && os.platform() === 'linux');
  public ableToConfigureSelf = (!this.runningInDocker || semver.satisfies(process.env.CONFIG_UI_VERSION, '>=3.5.5'), { includePrerelease: true });
  public enableTerminalAccess = this.runningInDocker || Boolean(process.env.HOMEBRIDGE_CONFIG_UI_TERMINAL === '1');

  // docker paths
  public startupScript = path.resolve(this.storagePath, 'startup.sh');
  public dockerEnvFile = path.resolve(this.storagePath, '.docker.env');
  public dockerOfflineUpdate = this.runningInDocker && semver.satisfies(process.env.CONFIG_UI_VERSION, '>=4.6.2', { includePrerelease: true });

  // package.json
  public package = fs.readJsonSync(path.resolve(process.env.UIX_BASE_PATH, 'package.json'));

  public homebridgeConfig: HomebridgeConfig;

  public ui: {
    name: string;
    port: number;
    host?: '::' | '0.0.0.0' | string;
    auth: 'form' | 'none';
    theme: string;
    sudo?: boolean;
    restart?: string;
    log?: {
      method: 'file' | 'custom' | 'systemd';
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
    accessoryControl?: {
      debug?: boolean;
      instanceBlacklist?: string[];
    }
    temp?: string;
    tempUnits?: string;
    loginWallpaper?: string;
    noFork?: boolean;
    linux?: {
      shutdown?: string;
      restart?: string;
    };
    standalone?: boolean;
    debug?: boolean;
    proxyHost?: string;
    sessionTimeout?: number;
    websocketCompatibilityMode?: boolean;
    homebridgePackagePath?: string;
  };

  public secrets: {
    secretKey: string;
  };

  public instanceId: string;

  constructor() {
    this.homebridgeConfig = fs.readJSONSync(this.configPath);
    this.ui = Array.isArray(this.homebridgeConfig.platforms) ? this.homebridgeConfig.platforms.find(x => x.platform === 'config') : undefined;

    if (!this.ui) {
      this.ui = {
        name: 'Config',
      } as any;
    }

    process.env.UIX_PLUGIN_NAME = this.ui.name || 'homebridge-config-ui-x';

    if (this.runningInDocker) {
      this.setConfigForDocker();
    }

    if (this.serviceMode) {
      this.setConfigForServiceMode();
    }

    if (!this.ui.port) {
      this.ui.port = 8080;
    }

    if (!this.ui.sessionTimeout) {
      this.ui.sessionTimeout = 28800;
    }

    this.secrets = this.getSecrets();
    this.instanceId = this.getInstanceId();
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
        dockerOfflineUpdate: this.dockerOfflineUpdate,
        temperatureUnits: this.ui.tempUnits || 'c',
        websocketCompatibilityMode: this.ui.websocketCompatibilityMode || false,
        instanceId: this.instanceId,
      },
      formAuth: Boolean(this.ui.auth !== 'none'),
      theme: this.ui.theme || 'auto',
      serverTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Populate the required config for oznu/homebridge docker
   */
  private setConfigForDocker() {
    // forced config
    this.ui.restart = 'killall -9 homebridge && killall -9 homebridge-config-ui-x';
    this.homebridgeInsecureMode = Boolean(process.env.HOMEBRIDGE_INSECURE === '1');
    this.ui.sudo = false;
    this.ui.log = {
      method: 'file',
      path: '/homebridge/logs/homebridge.log',
    };

    // these options can be overridden using the config.json file
    if (!this.ui.port && process.env.HOMEBRIDGE_CONFIG_UI_PORT) {
      this.ui.port = parseInt(process.env.HOMEBRIDGE_CONFIG_UI_PORT, 10);
    }
    this.ui.theme = this.ui.theme || process.env.HOMEBRIDGE_CONFIG_UI_THEME || 'teal';
    this.ui.auth = this.ui.auth || process.env.HOMEBRIDGE_CONFIG_UI_AUTH as 'form' | 'none' || 'form';
    this.ui.temp = this.ui.temp || process.env.HOMEBRIDGE_CONFIG_UI_TEMP || undefined;
    this.ui.loginWallpaper = this.ui.loginWallpaper || process.env.HOMEBRIDGE_CONFIG_UI_LOGIN_WALLPAPER || undefined;
  }

  /**
   * Populate the required config when running in "Service Mode"
   */
  private setConfigForServiceMode() {
    this.ui.restart = undefined;
    this.homebridgeInsecureMode = true;
    this.ui.log = {
      method: 'file',
      path: path.resolve(this.storagePath, 'homebridge.log'),
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

  /**
   * Generates a public instance id from a sha256 has of the secret key
   */
  private getInstanceId(): string {
    return crypto.createHash('sha256').update(this.secrets.secretKey).digest('hex');
  }

}
