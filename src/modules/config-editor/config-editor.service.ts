import * as fs from 'fs-extra';
import * as path from 'path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Logger } from '../../core/logger/logger.service';
import { ConfigService, HomebridgeConfig } from '../../core/config/config.service';

@Injectable()
export class ConfigEditorService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {
    this.start();
  }

  /**
   * Executed when the UI starts
   */
  private async start() {
    await this.ensureBackupPathExists();
    await this.migrateConfigBackups();
  }

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

    if (typeof config.bridge.port === 'string') {
      config.bridge.port = parseInt(config.bridge.port, 10);
    }

    if (!config.bridge.port || typeof config.bridge.port !== 'number' || config.bridge.port > 65533 || config.bridge.port < 1025) {
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
    try {
      await fs.rename(this.configService.configPath, path.resolve(this.configService.configBackupPath, 'config.json.' + now.getTime().toString()));
    } catch (e) {
      if (e.code === 'ENOENT') {
        this.ensureBackupPathExists();
      } else {
        this.logger.warn('Could not create a backup of the config.json file to', this.configService.configBackupPath, e.message);
      }
    }

    // save config file
    fs.writeJsonSync(this.configService.configPath, config, { spaces: 4 });

    this.logger.log('Changes to config.json saved.');

    // parse the config for ui settings
    const configCopy = JSON.parse(JSON.stringify(config));
    this.configService.parseConfig(configCopy);

    return config;
  }

  /**
   * List config backups
   */
  public async listConfigBackups() {
    const dirContents = await fs.readdir(this.configService.configBackupPath);

    const backups = dirContents
      .filter(x => x.match(/^config.json.[0-9]{09,15}/))
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
  public async getConfigBackup(backupId: number) {
    const requestedBackupPath = path.resolve(this.configService.configBackupPath, 'config.json.' + backupId);

    // check backup file exists
    if (!await fs.pathExists(requestedBackupPath)) {
      throw new NotFoundException(`Backup ${backupId} Not Found`);
    }

    // read source backup
    return await fs.readFile(requestedBackupPath);
  }

  /**
   * Delete all config backups
   */
  public async deleteAllConfigBackups() {
    const backups = await this.listConfigBackups();

    // delete each backup file
    await backups.forEach(async (backupFile) => {
      await fs.unlink(path.resolve(this.configService.configBackupPath, backupFile.file));
    });
  }

  /**
   * Ensure the backup file path exists
   */
  private async ensureBackupPathExists() {
    try {
      await fs.ensureDir(this.configService.configBackupPath);
    } catch (e) {
      this.logger.error('Could not create directory for config backups:', this.configService.configBackupPath, e.message);
      this.logger.error('Config backups will continue to use', this.configService.storagePath);
      this.configService.configBackupPath = this.configService.storagePath;
    }
  }

  /**
   * This is a one-time script to move config.json.xxxxx backup files to the new location ./backups/config
   */
  private async migrateConfigBackups() {
    try {
      if (this.configService.configBackupPath === this.configService.storagePath) {
        this.logger.error('Skipping migration of existing config.json backups...');
        return;
      }

      const dirContents = await fs.readdir(this.configService.storagePath);

      const backups = dirContents
        .filter(x => x.match(/^config.json.[0-9]{09,15}/))
        .sort()
        .reverse();

      // move the last 100 to the new location
      for (const backupFileName of backups.splice(0, 100)) {
        const sourcePath = path.resolve(this.configService.storagePath, backupFileName);
        const targetPath = path.resolve(this.configService.configBackupPath, backupFileName);
        await fs.move(sourcePath, targetPath, { overwrite: true });
      }

      // delete the rest
      for (const backupFileName of backups) {
        const sourcePath = path.resolve(this.configService.storagePath, backupFileName);
        await fs.remove(sourcePath);
      }
    } catch (e) {
      this.logger.warn('An error occured while migrating config.json backups to new location', e.message);
    }
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
