import * as fs from 'fs-extra';
import * as path from 'path';
import * as dayjs from 'dayjs';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Logger } from '../../core/logger/logger.service';
import { ConfigService, HomebridgeConfig } from '../../core/config/config.service';
import { SchedulerService } from '../../core/scheduler/scheduler.service';
import { PluginsService } from '../plugins/plugins.service';

@Injectable()
export class ConfigEditorService {
  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerService: SchedulerService,
    private readonly pluginsService: PluginsService,
    private readonly logger: Logger,
  ) {
    this.start();
    this.scheduleConfigBackupCleanup();
  }

  /**
   * Executed when the UI starts
   */
  private async start() {
    await this.ensureBackupPathExists();
    await this.migrateConfigBackups();
  }

  /**
   * Schedule the job to cleanup old config.json backup files
   */
  private scheduleConfigBackupCleanup() {
    const scheduleRule = new this.schedulerService.RecurrenceRule();
    scheduleRule.hour = 1;
    scheduleRule.minute = 10;
    scheduleRule.second = Math.floor(Math.random() * 59) + 1;

    this.logger.debug('Next config.json backup cleanup scheduled for:', scheduleRule.nextInvocationDate(new Date()).toString());

    this.schedulerService.scheduleJob('cleanup-config-backups', scheduleRule, () => {
      this.logger.log('Running job to cleanup config.json backup files older than 60 days...');
      this.cleanupConfigBackups();
    });
  }

  /**
   * Returns the config file
   */
  public async getConfigFile(): Promise<HomebridgeConfig> {
    const config = await fs.readJson(this.configService.configPath);

    // ensure accessories is an array
    if (!config.accessories || !Array.isArray(config.accessories)) {
      config.accessories = [];
    }

    // ensure platforms is an array
    if (!config.platforms || !Array.isArray(config.platforms)) {
      config.platforms = [];
    }

    return config;
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

    // if bridge.port is a string, try and convert to a number
    if (typeof config.bridge.port === 'string') {
      config.bridge.port = parseInt(config.bridge.port, 10);
    }

    // ensure the bridge.port is valid
    if (!config.bridge.port || typeof config.bridge.port !== 'number' || config.bridge.port > 65533 || config.bridge.port < 1025) {
      config.bridge.port = Math.floor(Math.random() * (52000 - 51000 + 1) + 51000);
    }

    // ensure bridge.username exists
    if (!config.bridge.username) {
      config.bridge.username = this.generateUsername();
    }

    // ensure the username matches the required pattern
    const usernamePattern = /^([0-9A-Fa-f]{2}[:]){5}([0-9A-Fa-f]{2})$/;
    if (!usernamePattern.test(config.bridge.username)) {
      if (usernamePattern.test(this.configService.homebridgeConfig.bridge.username)) {
        config.bridge.username = this.configService.homebridgeConfig.bridge.username;
      } else {
        config.bridge.username = this.generateUsername();
      }
    }

    // ensure bridge.pin exists
    if (!config.bridge.pin) {
      config.bridge.pin = this.generatePin();
    }

    // ensure the pin matches the required pattern
    const pinPattern = /^([0-9]{3}-[0-9]{2}-[0-9]{3})$/;
    if (!pinPattern.test(config.bridge.pin)) {
      if (pinPattern.test(this.configService.homebridgeConfig.bridge.pin)) {
        config.bridge.pin = this.configService.homebridgeConfig.bridge.pin;
      } else {
        config.bridge.pin = this.generatePin();
      }
    }

    // ensure the bridge.name exists and is a string
    if (!config.bridge.name || typeof config.bridge.name !== 'string') {
      config.bridge.name = 'Homebridge ' + config.bridge.username.substr(config.bridge.username.length - 5).replace(/:/g, '');
    }

    // ensure accessories is an array
    if (!config.accessories || !Array.isArray(config.accessories)) {
      config.accessories = [];
    }

    // ensure platforms is an array
    if (!config.platforms || !Array.isArray(config.platforms)) {
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

    // ensure config.mdns is valid
    if (config.mdns && typeof config.mdns !== 'object') {
      delete config.mdns;
    }

    if (config.mdns && config.mdns.legacyAdvertiser && typeof config.mdns.legacyAdvertiser !== 'boolean') {
      config.mdns.legacyAdvertiser = false;
    }

    // ensure config.disabledPlugins is an array
    if (config.disabledPlugins && !Array.isArray(config.disabledPlugins)) {
      delete config.disabledPlugins;
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
   * Return the config for a specific plugin
   */
  public async getConfigForPlugin(pluginName: string) {
    return Promise.all([
      await this.pluginsService.getPluginAlias(pluginName),
      await this.getConfigFile(),
    ]).then(([plugin, config]) => {
      if (!plugin.pluginAlias) {
        return new BadRequestException('Plugin alias could not be determined.');
      }

      const arrayKey = plugin.pluginType === 'accessory' ? 'accessories' : 'platforms';

      return config[arrayKey].filter((block) => {
        return block[plugin.pluginType] === plugin.pluginAlias ||
          block[plugin.pluginType] === pluginName + '.' + plugin.pluginAlias;
      });
    });
  }

  /**
   * Update the config for a specific plugin
   */
  public async updateConfigForPlugin(pluginName: string, pluginConfig: Record<string, any>[]) {
    return Promise.all([
      await this.pluginsService.getPluginAlias(pluginName),
      await this.getConfigFile(),
    ]).then(async ([plugin, config]) => {
      if (!plugin.pluginAlias) {
        return new BadRequestException('Plugin alias could not be determined.');
      }

      const arrayKey = plugin.pluginType === 'accessory' ? 'accessories' : 'platforms';

      // ensure the update contains an array
      if (!Array.isArray(pluginConfig)) {
        throw new BadRequestException('Plugin Config must be an array.');
      }

      // validate each block in the array
      for (const block of pluginConfig) {
        if (typeof block !== 'object' || Array.isArray(block)) {
          throw new BadRequestException('Plugin config must be an array of objects.');
        }
        block[plugin.pluginType] = plugin.pluginAlias;
      }

      let positionIndices: number;

      // remove the existing config blocks
      config[arrayKey] = config[arrayKey].filter((block, index) => {
        if (block[plugin.pluginType] === plugin.pluginAlias || block[plugin.pluginType] === pluginName + '.' + plugin.pluginAlias) {
          positionIndices = index;
          return false;
        } else {
          return true;
        }
      });

      // replace with the provided config, trying to put it back in the same location
      if (positionIndices !== undefined) {
        config[arrayKey].splice(positionIndices, 0, ...pluginConfig);
      } else {
        config[arrayKey].push(...pluginConfig);
      }

      // save the config file
      await this.updateConfigFile(config);

      return pluginConfig;
    });
  }

  /**
   * Mark a plugin as disabled
   */
  public async disablePlugin(pluginName: string) {
    if (pluginName === this.configService.name) {
      throw new BadRequestException('Disabling this plugin is now allowed.');
    }

    const config = await this.getConfigFile();

    if (!Array.isArray(config.disabledPlugins)) {
      config.disabledPlugins = [];
    }

    config.disabledPlugins.push(pluginName);

    await this.updateConfigFile(config);

    return config.disabledPlugins;
  }

  /**
   * Mark a plugin as enabled
   */
  public async enablePlugin(pluginName: string) {
    const config = await this.getConfigFile();

    if (!Array.isArray(config.disabledPlugins)) {
      config.disabledPlugins = [];
    }

    const idx = config.disabledPlugins.findIndex(x => x === pluginName);

    config.disabledPlugins.splice(idx, 1);

    await this.updateConfigFile(config);

    return config.disabledPlugins;
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
   * Remove config.json backup files older than 60 days
   */
  public async cleanupConfigBackups() {
    try {
      const backups = await this.listConfigBackups();

      for (const backup of backups) {
        if (dayjs().diff(dayjs(backup.timestamp), 'day') >= 60) {
          await fs.remove(path.resolve(this.configService.configBackupPath, backup.file));
        }
      }
    } catch (e) {
      this.logger.warn('Failed to cleanup old config.json backup files:', e.message);
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
