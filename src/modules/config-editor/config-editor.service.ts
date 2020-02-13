import * as fs from 'fs-extra';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { Logger } from '../../core/logger/logger.service';
import { ConfigService, HomebridgeConfig } from '../../core/config/config.service';

@Injectable()
export class ConfigEditorService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) { }

  /**
   * Returns the config file
   */
  public async getConfigFile(): Promise<HomebridgeConfig> {
    return await fs.readJson(this.configService.configPath);
  }

  /**
   * Updates the config file
   */
  public async updateConfigFile(config: HomebridgeConfig) {
    const now = new Date();

    if (!config) {
      config = {} as HomebridgeConfig;
    }

    if (!config.bridge) {
      config.bridge = {} as HomebridgeConfig['bridge'];
    }

    if (!config.bridge.name) {
      config.bridge.name = 'Homebridge';
    }

    if (!config.bridge.port) {
      config.bridge.port = Math.floor(Math.random() * (52000 - 51000 + 1) + 51000);
    }

    if (!config.bridge.username) {
      config.bridge.username = this.generateUsername();
    }

    if (!config.bridge.pin) {
      config.bridge.pin = this.generatePin();
    }

    if (!config.accessories) {
      config.accessories = [];
    }

    if (!config.platforms) {
      config.platforms = [];
    }

    // ensure config.plugins is an array and not empty
    if (config.plugins && Array.isArray(config.plugins)) {
      if (!config.plugins.length) {
        delete config.plugins;
      }
    } else if (config.plugins) {
      delete config.plugins;
    }

    // create backup of existing config
    await fs.rename(this.configService.configPath, `${this.configService.configPath}.${now.getTime()}`);

    // save config file
    fs.writeJsonSync(this.configService.configPath, config, { spaces: 4 });

    this.logger.log('Changes to config.json saved.');

    // parse the config for ui settings
    const configCopy = {};
    Object.assign(configCopy, config);
    this.configService.parseConfig(configCopy);

    return config;
  }

  /**
   * List config backups
   */
  public async listConfigBackups() {
    const dirContents = await fs.readdir(this.configService.storagePath);

    const backups = dirContents
      .filter(x => x.indexOf('config.json.') === 0)
      .sort()
      .reverse()
      .map(x => {
        const ext = x.split('.');
        if (ext.length === 3 && !isNaN(ext[2] as any)) {
          return {
            id: ext[2],
            timestamp: new Date(parseInt(ext[2], 10)),
            file: x,
          };
        } else {
          return null;
        }
      })
      .filter((x => x && !isNaN(x.timestamp.getTime())));

    return backups;
  }

  /**
   * Returns a config backup
   * @param backupId
   */
  public async getConfigBackup(backupId: string) {
    // check backup file exists
    if (!await fs.pathExists(this.configService.configPath + '.' + parseInt(backupId, 10))) {
      throw new Error(`Backup ${backupId} Not Found`);
    }

    // read source backup
    return await fs.readFile(this.configService.configPath + '.' + parseInt(backupId, 10));
  }

  /**
   * Delete all config backups
   */
  public async deleteAllConfigBackups() {
    const backups = await this.listConfigBackups();

    // delete each backup file
    await backups.forEach(async (backupFile) => {
      await fs.unlink(path.resolve(this.configService.storagePath, backupFile.file));
    });
  }

  /**
   * Generates a new random pin
   */
  public generatePin() {
    let code: string | Array<any> = Math.floor(10000000 + Math.random() * 90000000) + '';
    code = code.split('');
    code.splice(3, 0, '-');
    code.splice(6, 0, '-');
    code = code.join('');
    return code;
  }

  /**
   * Generates a new random username
   */
  public generateUsername() {
    const hexDigits = '0123456789ABCDEF';
    let username = '0E:';
    for (let i = 0; i < 5; i++) {
      username += hexDigits.charAt(Math.round(Math.random() * 15));
      username += hexDigits.charAt(Math.round(Math.random() * 15));
      if (i !== 4) {
        username += ':';
      }
    }
    return username;
  }
}
