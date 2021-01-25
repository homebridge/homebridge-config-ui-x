import { Injectable } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import * as semver from 'semver';
import * as _ from 'lodash';

export interface HomebridgeConfig {
  bridge: {
    username: string;
    pin: string;
    name: string;
    port: number;
    bind?: string | string[];
  };
  mdns?: {
    legacyAdvertiser?: boolean;
    interface?: string | string[];
  };
  platforms: Record<string, any>[];
  accessories: Record<string, any>[];
  plugins?: string[];
  disabledPlugins?: string[];
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
  public configBackupPath = path.resolve(this.storagePath, 'backups/config-backups');
  public instanceBackupPath = path.resolve(this.storagePath, 'backups/instance-backups');
  public homebridgeInsecureMode = Boolean(process.env.UIX_INSECURE_MODE === '1');
  public homebridgeNoTimestamps = Boolean(process.env.UIX_LOG_NO_TIMESTAMPS === '1');
  public homebridgeVersion: string;

  // server env
  public minimumNodeVersion = '10.17.0';
  public serviceMode = (process.env.UIX_SERVICE_MODE === '1');
  public runningInDocker = Boolean(process.env.HOMEBRIDGE_CONFIG_UI === '1');
  public runningInLinux = (!this.runningInDocker && os.platform() === 'linux');
  public ableToConfigureSelf = (!this.runningInDocker || semver.satisfies(process.env.CONFIG_UI_VERSION, '>=3.5.5', { includePrerelease: true }));
  public enableTerminalAccess = this.runningInDocker || Boolean(process.env.HOMEBRIDGE_CONFIG_UI_TERMINAL === '1');

  // docker paths
  public startupScript = path.resolve(this.storagePath, 'startup.sh');
  public dockerEnvFile = path.resolve(this.storagePath, '.docker.env');
  public dockerOfflineUpdate = this.runningInDocker && semver.satisfies(process.env.CONFIG_UI_VERSION, '>=4.6.2', { includePrerelease: true });

  // package.json
  public package = fs.readJsonSync(path.resolve(process.env.UIX_BASE_PATH, 'package.json'));

  // custom wallpaper
  public customWallpaperPath = path.resolve(this.storagePath, 'ui-wallpaper.jpg');
  public customWallpaperHash: string;

  // set true to force the ui to restart on next restart request
  public hbServiceUiRestartRequired = false;

  public homebridgeConfig: HomebridgeConfig;

  public ui: {
    name: string;
    port: number;
    host?: '::' | '0.0.0.0' | string;
    auth: 'form' | 'none';
    theme: string;
    sudo?: boolean;
    restart?: string;
    lang?: string;
    log?: {
      method: 'file' | 'custom' | 'systemd' | 'native';
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
    };
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
    homebridgePackagePath?: string;
    scheduledBackupPath?: string;
    scheduledBackupDisable?: boolean;
    disableServerMetricsMonitoring?: boolean;
  };

  private bridgeFreeze: this['homebridgeConfig']['bridge'];
  private uiFreeze: this['ui'];

  public secrets: {
    secretKey: string;
  };

  public instanceId: string;

  constructor() {
    const homebridgeConfig = fs.readJSONSync(this.configPath);
    this.parseConfig(homebridgeConfig);
  }

  /**
   * Loads the config from the config.json
   */
  public parseConfig(homebridgeConfig) {
    this.homebridgeConfig = homebridgeConfig;

    if (!this.homebridgeConfig.bridge) {
      this.homebridgeConfig.bridge = {} as this['homebridgeConfig']['bridge'];
    }

    this.ui = Array.isArray(this.homebridgeConfig.platforms) ? this.homebridgeConfig.platforms.find(x => x.platform === 'config') : undefined as any;

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
      this.ui.sessionTimeout = this.ui.auth === 'none' ? 1296000 : 28800;
    }

    if (this.ui.scheduledBackupPath) {
      this.instanceBackupPath = this.ui.scheduledBackupPath;
    } else {
      this.instanceBackupPath = path.resolve(this.storagePath, 'backups/instance-backups');
    }

    this.secrets = this.getSecrets();
    this.instanceId = this.getInstanceId();

    this.freezeUiSettings();
    this.getCustomWallpaperHash();
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
        homebridgeVersion: this.homebridgeVersion || null,
        homebridgeInstanceName: this.homebridgeConfig.bridge.name,
        nodeVersion: process.version,
        packageName: this.package.name,
        packageVersion: this.package.version,
        platform: os.platform(),
        runningInDocker: this.runningInDocker,
        runningInLinux: this.runningInLinux,
        dockerOfflineUpdate: this.dockerOfflineUpdate,
        serviceMode: this.serviceMode,
        temperatureUnits: this.ui.tempUnits || 'c',
        lang: this.ui.lang === 'auto' ? null : this.ui.lang,
        instanceId: this.instanceId,
        customWallpaperHash: this.customWallpaperHash,
      },
      formAuth: Boolean(this.ui.auth !== 'none'),
      theme: this.ui.theme || 'auto',
      serverTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Checks to see if the UI requires a restart due to changed ui or bridge settings
   */
  public async uiRestartRequired(): Promise<boolean> {
    // if the flag is set, force a restart
    if (this.hbServiceUiRestartRequired) {
      return true;
    }

    // if the ui version has changed on disk, a restart is required
    const currentPackage = await fs.readJson(path.resolve(process.env.UIX_BASE_PATH, 'package.json'));
    if (currentPackage.version !== this.package.version) {
      return true;
    }

    // if the ui or bridge config has changed, a restart is required
    return !(_.isEqual(this.ui, this.uiFreeze) && _.isEqual(this.homebridgeConfig.bridge, this.bridgeFreeze));
  }

  /**
   * Freeze a copy of the initial ui config and homebridge port
   */
  private freezeUiSettings() {
    if (!this.uiFreeze) {
      // freeze ui
      this.uiFreeze = {} as this['ui'];
      Object.assign(this.uiFreeze, this.ui);
    }

    if (!this.bridgeFreeze) {
      // freeze bridge port
      this.bridgeFreeze = {} as this['homebridgeConfig']['bridge'];
      Object.assign(this.bridgeFreeze, this.homebridgeConfig.bridge);
    }
  }

  /**
   * Populate the required config for oznu/homebridge docker
   */
  private setConfigForDocker() {
    // forced config
    this.ui.restart = 'killall -15 homebridge; sleep 5.1; killall -9 homebridge; kill -9 $(pidof homebridge-config-ui-x);';
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
    this.ui.theme = this.ui.theme || process.env.HOMEBRIDGE_CONFIG_UI_THEME || 'auto';
    this.ui.auth = this.ui.auth || process.env.HOMEBRIDGE_CONFIG_UI_AUTH as 'form' | 'none' || 'form';
    this.ui.loginWallpaper = this.ui.loginWallpaper || process.env.HOMEBRIDGE_CONFIG_UI_LOGIN_WALLPAPER || undefined;
  }

  /**
   * Populate the required config when running in "Service Mode"
   */
  private setConfigForServiceMode() {
    this.homebridgeInsecureMode = Boolean(process.env.UIX_INSECURE_MODE === '1');
    this.ui.restart = undefined;
    this.ui.sudo = (os.platform() === 'linux' && !this.runningInDocker);
    this.ui.log = {
      method: 'native',
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

  /**
   * Checks to see if custom wallpaper has been set, and generate a sha256 hash to use as the file name
   */
  private async getCustomWallpaperHash(): Promise<void> {
    try {
      const stat = await fs.stat(this.ui.loginWallpaper || this.customWallpaperPath);
      const hash = crypto.createHash('sha256');
      hash.update(`${stat.birthtime}${stat.ctime}${stat.size}${stat.blocks}`);
      this.customWallpaperHash = hash.digest('hex') + '.jpg';
    } catch (e) {
      // do nothing
    }
  }

  /**
   * Stream the custom wallpaper
   */
  public streamCustomWallpaper(): fs.ReadStream {
    return fs.createReadStream(this.ui.loginWallpaper || this.customWallpaperPath);
  }

}
