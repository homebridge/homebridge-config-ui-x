import * as os from 'os';
import * as tar from 'tar';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as color from 'bash-color';
import * as unzipper from 'unzipper';
import * as child_process from 'child_process';
import * as dayjs from 'dayjs';
import { EventEmitter } from 'events';
import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { FastifyReply } from 'fastify';

import { PluginsService } from '../plugins/plugins.service';
import { SchedulerService } from '../../core/scheduler/scheduler.service';
import { ConfigService, HomebridgeConfig } from '../../core/config/config.service';
import { Logger } from '../../core/logger/logger.service';
import { HomebridgePlugin } from '../plugins/types';

@Injectable()
export class BackupService {
  private restoreDirectory;

  constructor(
    private readonly configService: ConfigService,
    private readonly pluginsService: PluginsService,
    private readonly schedulerService: SchedulerService,
    private readonly logger: Logger,
  ) {
    this.scheduleInstanceBackups();
  }

  /**
   * Schedule the job to create an instance backup at recurring intervals
   */
  public scheduleInstanceBackups() {
    if (this.configService.ui.scheduledBackupDisable === true) {
      this.logger.debug('Scheduled backups disabled.');
      return;
    }

    const scheduleRule = new this.schedulerService.RecurrenceRule();
    scheduleRule.hour = 1;
    scheduleRule.minute = 15;
    scheduleRule.second = Math.floor(Math.random() * 59) + 1;

    this.logger.debug('Next automated backup scheduled for:', scheduleRule.nextInvocationDate(new Date()).toString());

    this.schedulerService.scheduleJob('instance-backup', scheduleRule, () => {
      this.logger.log('Running scheduled instance backup...');
      this.runScheduledBackupJob();
    });
  }

  /**
   * Creates the .tar.gz instance backup of the curent Homebridge instance
   */
  private async createBackup() {
    // prepare a temp working directory
    const instanceId = this.configService.homebridgeConfig.bridge.username.replace(/:/g, '');
    const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homebridge-backup-'));
    const backupFileName = 'homebridge-backup' + '-' + instanceId + '.tar.gz';
    const backupPath = path.resolve(backupDir, backupFileName);

    this.logger.log(`Creating temporary backup archive at ${backupPath}`);

    // create a copy of the storage directory in the temp path
    await fs.copy(this.configService.storagePath, path.resolve(backupDir, 'storage'), {
      filter: (filePath) => (![
        'instance-backups',   // scheduled backups
        'nssm.exe',           // windows hb-service
        'homebridge.log',     // hb-service
        'logs',               // docker
        'node_modules',       // docker
        'startup.sh',         // docker
        '.docker.env',        // docker
        'FFmpeg',             // ffmpeg
        'fdk-aac',            // ffmpeg
        '.git',               // git
        'recordings',         // homebridge-camera-ui recordings path
        '.homebridge.sock',   // homebridge ipc socket
      ].includes(path.basename(filePath))), // list of files not to include in the archive
    });

    // get full list of installed plugins
    const installedPlugins = await this.pluginsService.getInstalledPlugins();
    await fs.writeJSON(path.resolve(backupDir, 'plugins.json'), installedPlugins);

    // create an info.json
    await fs.writeJson(path.resolve(backupDir, 'info.json'), {
      timestamp: new Date().toISOString(),
      platform: os.platform(),
      uix: this.configService.package.version,
      node: process.version,
    });

    // create a tarball of storage and plugins list
    await tar.c({
      portable: true,
      gzip: true,
      file: backupPath,
      cwd: backupDir,
      filter: (filePath, stat) => {
        if (stat.size > 1e+7) {
          this.logger.warn(`Backup is skipping "${filePath}" because it is larger than 10MB.`);
          return false;
        }
        return true;
      },
    }, [
      'storage', 'plugins.json', 'info.json',
    ]);

    return {
      instanceId,
      backupDir,
      backupPath,
      backupFileName,
    };
  }

  /**
   * Ensures the scheduled backup path exists and is writable
   */
  async ensureScheduledBackupPath() {
    if (this.configService.ui.scheduledBackupPath) {
      // if using a custom backup path, check it exists
      if (!await fs.pathExists(this.configService.instanceBackupPath)) {
        throw new Error(`Custom instance backup path does not exists: ${this.configService.instanceBackupPath}`);
      }

      try {
        await fs.access(this.configService.instanceBackupPath, fs.constants.W_OK | fs.constants.R_OK);
      } catch (e) {
        throw new Error(`Custom instance backup path is not writable / readable by service: ${e.message}`);
      }
    } else {
      // when not using a custom backup path, just ensure it exists
      return await fs.ensureDir(this.configService.instanceBackupPath);
    }
  }

  /**
   * Runs the job to create a a scheduled backup
   */
  async runScheduledBackupJob() {
    // ensure backup path exists
    try {
      await this.ensureScheduledBackupPath();
    } catch (e) {
      this.logger.warn('Could not run scheduled backup:', e.message);
      return;
    }

    // create the backup
    try {
      const { backupDir, backupPath, instanceId } = await this.createBackup();
      await fs.copy(backupPath, path.resolve(
        this.configService.instanceBackupPath,
        'homebridge-backup-' + instanceId + '.' + new Date().getTime().toString() + '.tar.gz'
      ));
      await fs.remove(path.resolve(backupDir));
    } catch (e) {
      this.logger.warn('Failed to create scheduled instance backup:', e.message);
    }

    // remove backups older than 7 days
    try {
      const backups = await this.listScheduledBackups();

      for (const backup of backups) {
        if (dayjs().diff(dayjs(backup.timestamp), 'day') >= 7) {
          await fs.remove(path.resolve(this.configService.instanceBackupPath, backup.fileName));
        }
      }
    } catch (e) {
      this.logger.warn('Failed to remove old backups:', e.message);
    }
  }

  /**
   * List the instance backups saved on disk
   */
  async listScheduledBackups() {
    // ensure backup path exists
    try {
      await this.ensureScheduledBackupPath();
    } catch (e) {
      this.logger.warn('Could get scheduled backups:', e.message);
      throw new InternalServerErrorException(e.message);
    }

    const dirContents = await fs.readdir(this.configService.instanceBackupPath, { withFileTypes: true });

    return dirContents
      .filter(x => x.isFile() && x.name.match(/^homebridge-backup-[0-9A-Za-z]{12}.[0-9]{09,15}.tar.gz/))
      .map(x => {
        const split = x.name.split('.');
        const instanceId = split[0].split('-')[2];
        if (split.length === 4 && !isNaN(split[1] as any)) {
          return {
            id: instanceId + '.' + split[1],
            instanceId: split[0].split('-')[2],
            timestamp: new Date(parseInt(split[1], 10)),
            fileName: x.name,
          };
        } else {
          return null;
        }
      })
      .filter((x => x !== null))
      .sort((a, b) => {
        if (a.id > b.id) {
          return -1;
        } else if (a.id < b.id) {
          return -2;
        } else {
          return 0;
        }
      });
  }

  /**
   * Downloads a scheduled backup .tar.gz
   */
  async getScheduledBackup(backupId: string) {
    const backupPath = path.resolve(this.configService.instanceBackupPath, 'homebridge-backup-' + backupId + '.tar.gz');

    // check the file exists
    if (!await fs.pathExists(backupPath)) {
      return new NotFoundException();
    }

    return fs.createReadStream(backupPath);
  }

  /**
   * Create and download backup archive of the current homebridge instance
   */
  async downloadBackup(reply: FastifyReply) {
    const { backupDir, backupPath, backupFileName } = await this.createBackup();

    // remove temp files (called when download finished)
    async function cleanup() {
      await fs.remove(path.resolve(backupDir));
      this.logger.log(`Backup complete, removing ${backupDir}`);
    }

    // set download headers
    reply.raw.setHeader('Content-type', 'application/octet-stream');
    reply.raw.setHeader('Content-disposition', 'attachment; filename=' + backupFileName);
    reply.raw.setHeader('File-Name', backupFileName);

    // for dev only
    if (reply.request.hostname === 'localhost:8080') {
      reply.raw.setHeader('access-control-allow-origin', 'http://localhost:4200');
    }

    // start download
    fs.createReadStream(backupPath)
      .on('close', cleanup.bind(this))
      .pipe(reply.raw);
  }

  /**
   * Restore a backup file
   * File upload handler
   */
  async uploadBackupRestore(file) {
    // clear restore directory
    this.restoreDirectory = undefined;

    // prepare a temp working directory
    const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homebridge-backup-'));

    // create a write stream and pipe the upload into it
    file.pipe(tar.x({
      cwd: backupDir,
    }).on('error', (err) => {
      this.logger.error(err);
    }));

    file.on('end', () => {
      this.restoreDirectory = backupDir;
    });
  }

  /**
   * Removes the temporary directory used for the restore
   */
  async removeRestoreDirectory() {
    if (this.restoreDirectory) {
      return await fs.remove(this.restoreDirectory);
    }
  }

  /**
   * Restores the uploaded backup
   */
  async restoreFromBackup(client: EventEmitter) {
    if (!this.restoreDirectory) {
      throw new BadRequestException();
    }

    console.log(this.restoreDirectory);

    // check info.json exists
    if (!await fs.pathExists(path.resolve(this.restoreDirectory, 'info.json'))) {
      await this.removeRestoreDirectory();
      throw new Error('Uploaded file is not a valid Homebridge Backup Archive.');
    }

    // check plugins.json exists
    if (!await fs.pathExists(path.resolve(this.restoreDirectory, 'plugins.json'))) {
      await this.removeRestoreDirectory();
      throw new Error('Uploaded file is not a valid Homebridge Backup Archive.');
    }

    // check storage exists
    if (!await fs.pathExists(path.resolve(this.restoreDirectory, 'storage'))) {
      await this.removeRestoreDirectory();
      throw new Error('Uploaded file is not a valid Homebridge Backup Archive.');
    }

    // load info.json
    const backupInfo = await fs.readJson(path.resolve(this.restoreDirectory, 'info.json'));

    // display backup archive information
    client.emit('stdout', color.cyan('Backup Archive Information\r\n'));
    client.emit('stdout', `Source Node.js Version: ${backupInfo.node}\r\n`);
    client.emit('stdout', `Source Homebridge Config UI X Version: v${backupInfo.uix}\r\n`);
    client.emit('stdout', `Source Platform: ${backupInfo.platform}\r\n`);
    client.emit('stdout', `Created: ${backupInfo.timestamp}\r\n`);

    // start restore
    this.logger.warn('Starting backup restore...');
    client.emit('stdout', color.cyan('\r\nRestoring backup...\r\n\r\n'));
    await new Promise(resolve => setTimeout(resolve, 1000));

    // restore files
    client.emit('stdout', color.yellow(`Restoring Homebridge storage to ${this.configService.storagePath}\r\n`));
    await new Promise(resolve => setTimeout(resolve, 100));
    await fs.copy(path.resolve(this.restoreDirectory, 'storage'), this.configService.storagePath, {
      filter: (filePath) => {
        client.emit('stdout', `Restoring ${path.basename(filePath)}\r\n`);
        return true;
      },
    });
    client.emit('stdout', color.yellow('File restore complete.\r\n'));
    await new Promise(resolve => setTimeout(resolve, 1000));

    // restore plugins
    client.emit('stdout', color.cyan('\r\nRestoring plugins...\r\n'));
    const plugins: HomebridgePlugin[] = (await fs.readJson(path.resolve(this.restoreDirectory, 'plugins.json')))
      .filter((x: HomebridgePlugin) => ![
        'homebridge-config-ui-x',
      ].includes(x.name) && x.publicPackage); // list of plugins not to restore

    for (const plugin of plugins) {
      try {
        client.emit('stdout', color.yellow(`\r\nInstalling ${plugin.name}...\r\n`));
        await this.pluginsService.installPlugin(plugin.name, plugin.installedVersion || 'latest', client);
      } catch (e) {
        client.emit('stdout', color.red(`Failed to install ${plugin.name}.\r\n`));
      }
    }

    // load restored config
    const restoredConfig: HomebridgeConfig = await fs.readJson(this.configService.configPath);

    // ensure the bridge port does not change
    if (restoredConfig.bridge) {
      restoredConfig.bridge.port = this.configService.homebridgeConfig.bridge.port;
    }

    // check the bridge.bind config contains valid interface names
    if (restoredConfig.bridge.bind) {
      this.checkBridgeBindConfig(restoredConfig);
    }

    // ensure platforms in an array
    if (!Array.isArray(restoredConfig.platforms)) {
      restoredConfig.platforms = [];
    }

    // load the ui config block
    const uiConfigBlock = restoredConfig.platforms.find((x) => x.platform === 'config');

    if (uiConfigBlock) {
      uiConfigBlock.port = this.configService.ui.port;

      // delete unnecessary config in service mode / docker
      if (this.configService.serviceMode || this.configService.runningInDocker) {
        delete uiConfigBlock.restart;
        delete uiConfigBlock.sudo;
        delete uiConfigBlock.log;
      }
    } else {
      restoredConfig.platforms.push({
        name: 'Config',
        port: this.configService.ui.port,
        platform: 'config',
      });
    }

    // save the config
    await fs.writeJson(this.configService.configPath, restoredConfig, { spaces: 4 });

    // remove temp files
    await this.removeRestoreDirectory();

    client.emit('stdout', color.green('\r\nRestore Complete!\r\n'));

    // ensure ui is restarted on next restart
    this.configService.hbServiceUiRestartRequired = true;

    return { status: 0 };
  }

  /**
   * Upload a .hbfx backup file
   */
  async uploadHbfxRestore(file: fs.ReadStream) {
    // clear restore directory
    this.restoreDirectory = undefined;

    // prepare a temp working directory
    const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homebridge-backup-'));

    this.logger.log(`Extracting .hbfx file to ${backupDir}`);

    file.pipe(unzipper.Extract({
      path: backupDir,
    }));

    file.on('end', () => {
      this.restoreDirectory = backupDir;
    });
  }

  /**
   * Restore .hbfx backup file
   */
  async restoreHbfxBackup(client: EventEmitter) {
    if (!this.restoreDirectory) {
      throw new BadRequestException();
    }

    // check package.json exists
    if (!await fs.pathExists(path.resolve(this.restoreDirectory, 'package.json'))) {
      await this.removeRestoreDirectory();
      throw new Error('Uploaded file is not a valid HBFX Backup Archive.');
    }

    // check config.json exists
    if (!await fs.pathExists(path.resolve(this.restoreDirectory, 'etc', 'config.json'))) {
      await this.removeRestoreDirectory();
      throw new Error('Uploaded file is not a valid HBFX Backup Archive.');
    }

    // load package.json
    const backupInfo = await fs.readJson(path.resolve(this.restoreDirectory, 'package.json'));

    // display backup archive information
    client.emit('stdout', color.cyan('Backup Archive Information\r\n'));
    client.emit('stdout', `Backup Source: ${backupInfo.name}\r\n`);
    client.emit('stdout', `Version: v${backupInfo.version}\r\n`);

    // start restore
    this.logger.warn('Starting hbfx restore...');
    client.emit('stdout', color.cyan('\r\nRestoring hbfx backup...\r\n\r\n'));
    await new Promise(resolve => setTimeout(resolve, 1000));

    // restore files
    client.emit('stdout', color.yellow(`Restoring Homebridge storage to ${this.configService.storagePath}\r\n`));
    await fs.copy(path.resolve(this.restoreDirectory, 'etc'), path.resolve(this.configService.storagePath), {
      filter: (filePath) => {
        if ([
          'access.json',
          'dashboard.json',
          'layout.json',
          'config.json',
        ].includes(path.basename(filePath))) {
          return false;
        }
        client.emit('stdout', `Restoring ${path.basename(filePath)}\r\n`);
        return true;
      },
    });

    // restore accessories
    const sourceAccessoriesPath = path.resolve(this.restoreDirectory, 'etc', 'accessories');
    const targeAccessoriestPath = path.resolve(this.configService.storagePath, 'accessories');
    if (await fs.pathExists(sourceAccessoriesPath)) {
      await fs.copy(sourceAccessoriesPath, targeAccessoriestPath, {
        filter: (filePath) => {
          client.emit('stdout', `Restoring ${path.basename(filePath)}\r\n`);
          return true;
        },
      });
    }

    // load source config.json
    const sourceConfig = await fs.readJson(path.resolve(this.restoreDirectory, 'etc', 'config.json'));

    // map hbfx plugins to homebridge plugins
    const pluginMap = {
      'hue': 'homebridge-hue',
      'chamberlain': 'homebridge-chamberlain',
      'google-home': 'homebridge-gsh',
      'ikea-tradfri': 'homebridge-ikea-tradfri-gateway',
      'nest': 'homebridge-nest',
      'ring': 'homebridge-ring',
      'roborock': 'homebridge-roborock',
      'shelly': 'homebridge-shelly',
      'wink': 'homebridge-wink3',
      'homebridge-tuya-web': '@milo526/homebridge-tuya-web',
    };

    // install plugins
    if (sourceConfig.plugins?.length) {
      for (let plugin of sourceConfig.plugins) {
        if (plugin in pluginMap) {
          plugin = pluginMap[plugin];
        }
        try {
          client.emit('stdout', color.yellow(`\r\nInstalling ${plugin}...\r\n`));
          await this.pluginsService.installPlugin(plugin, 'latest', client);
        } catch (e) {
          client.emit('stdout', color.red(`Failed to install ${plugin}.\r\n`));
        }
      }
    }

    // clone elements from the source config that we care about
    const targetConfig: HomebridgeConfig = JSON.parse(JSON.stringify({
      bridge: sourceConfig.bridge,
      accessories: sourceConfig.accessories?.map((x) => {
        delete x.plugin_map;
        return x;
      }) || [],
      platforms: sourceConfig.platforms?.map((x) => {
        if (x.platform === 'google-home') {
          x.platform = 'google-smarthome';
          x.notice = 'Keep your token a secret!';
        }
        delete x.plugin_map;
        return x;
      }) || [],
    }));

    // correct bridge name
    targetConfig.bridge.name = 'Homebridge ' + targetConfig.bridge.username.substr(targetConfig.bridge.username.length - 5).replace(/:/g, '');

    // check the bridge.bind config contains valid interface names
    if (targetConfig.bridge.bind) {
      this.checkBridgeBindConfig(targetConfig);
    }

    // add config ui platform
    targetConfig.platforms.push(this.configService.ui);

    // save the config
    await fs.writeJson(this.configService.configPath, targetConfig, { spaces: 4 });

    // remove temp files
    await this.removeRestoreDirectory();

    client.emit('stdout', color.green('\r\nRestore Complete!\r\n'));

    // ensure ui is restarted on next restart
    this.configService.hbServiceUiRestartRequired = true;

    return { status: 0 };
  }

  /**
   * Send SIGKILL to Homebridge to prevent accessory cache being re-generated on shutdown
   */
  postBackupRestoreRestart() {

    setTimeout(() => {
      // if running in service mode
      if (this.configService.serviceMode) {
        return process.emit('message', 'postBackupRestoreRestart', undefined);
      }

      // if running in docker
      if (this.configService.runningInDocker) {
        try {
          return child_process.execSync('killall -9 homebridge; kill -9 $(pidof homebridge-config-ui-x);');
        } catch (e) {
          this.logger.error(e);
          this.logger.error('Failed to restart Homebridge');
        }
      }

      // if running as a fork, kill the parent homebridge process
      if (process.connected) {
        process.kill(process.ppid, 'SIGKILL');
        process.kill(process.pid, 'SIGKILL');
      }

      // if running with noFork
      if (this.configService.ui.noFork) {
        return process.kill(process.pid, 'SIGKILL');
      }

      // if running in standalone mode, need to find the pid of homebridge and kill it
      if (os.platform() === 'linux' && this.configService.ui.standalone) {
        try {
          // try get pid by port
          const getPidByPort = (port: number): number => {
            try {
              return parseInt(child_process.execSync(
                `fuser ${port}/tcp 2>/dev/null`,
              ).toString('utf8').trim(), 10);
            } catch (e) {
              return null;
            }
          };

          // try get pid by name
          const getPidByName = (): number => {
            try {
              return parseInt(child_process.execSync('pidof homebridge').toString('utf8').trim(), 10);
            } catch (e) {
              return null;
            }
          };

          const homebridgePid = getPidByPort(this.configService.homebridgeConfig.bridge.port) || getPidByName();

          if (homebridgePid) {
            process.kill(homebridgePid, 'SIGKILL');
            return process.kill(process.pid, 'SIGKILL');
          }
        } catch (e) {
          // just proceed to the users restart command
        }
      }

      // try the users restart command
      if (this.configService.ui.restart) {
        return child_process.exec(this.configService.ui.restart, (err) => {
          if (err) {
            this.logger.log('Restart command exited with an error. Failed to restart Homebridge.');
          }
        });
      }

      // if all else fails just kill the current process
      return process.kill(process.pid, 'SIGKILL');
    }, 500);

    return { status: 0 };
  }

  /**
   * Checks the bridge.bind options are valid for the current system when restoring.
   */
  private checkBridgeBindConfig(restoredConfig: HomebridgeConfig) {
    if (restoredConfig.bridge.bind) {
      // if it's a string, convert to an array
      if (typeof restoredConfig.bridge.bind === 'string') {
        restoredConfig.bridge.bind = [restoredConfig.bridge.bind];
      }

      // if it's still not an array, delete it
      if (!Array.isArray(restoredConfig.bridge.bind)) {
        delete restoredConfig.bridge.bind;
        return;
      }

      // check each interface exists on the new host
      const networkInterfaces = os.networkInterfaces();
      restoredConfig.bridge.bind = restoredConfig.bridge.bind.filter((x) => networkInterfaces[x]);

      // if empty delete
      if (!restoredConfig.bridge.bind) {
        delete restoredConfig.bridge.bind;
      }
    }
  }
}
