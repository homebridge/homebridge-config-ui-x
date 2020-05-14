import * as os from 'os';
import * as tar from 'tar';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as color from 'bash-color';
import * as unzipper from 'unzipper';
import * as child_process from 'child_process';
import { Injectable, BadRequestException } from '@nestjs/common';
import { PluginsService } from '../plugins/plugins.service';
import { ConfigService, HomebridgeConfig } from '../../core/config/config.service';
import { Logger } from '../../core/logger/logger.service';

@Injectable()
export class BackupService {
  private restoreDirectory;

  constructor(
    private readonly configService: ConfigService,
    private readonly pluginsService: PluginsService,
    private readonly logger: Logger,
  ) { }

  /**
   * Create a backup archive of the current homebridge instance
   */
  async downloadBackup(reply) {
    // prepare a temp working directory
    const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homebridge-backup-'));
    const backupFileName = 'homebridge-backup' + '-' +
      this.configService.homebridgeConfig.bridge.username.replace(/:/g, '') + '.tar.gz';
    const backupPath = path.resolve(backupDir, backupFileName);

    this.logger.log(`Creating temporary backup archive at ${backupPath}`);

    // create a copy of the storage directory in the temp path
    await fs.copy(this.configService.storagePath, path.resolve(backupDir, 'storage'), {
      filter: (filePath) => (![
        'nssm.exe',           // windows hb-service
        'homebridge.log',     // hb-service
        'logs',               // docker
        'node_modules',       // docker
        'startup.sh',         // docker
        '.docker.env',        // docker
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

    // remove temp files (called when download finished)
    async function cleanup() {
      await fs.remove(path.resolve(backupDir));
      this.logger.log(`Backup complete, removing ${backupDir}`);
    }

    // set download headers
    reply.res.setHeader('Content-type', 'application/octet-stream');
    reply.res.setHeader('Content-disposition', 'attachment; filename=' + backupFileName);
    reply.res.setHeader('File-Name', backupFileName);

    // for dev only
    if (reply.request.hostname === 'localhost:8080') {
      reply.res.setHeader('access-control-allow-origin', 'http://localhost:4200');
    }

    // start download
    fs.createReadStream(backupPath)
      .on('close', cleanup.bind(this))
      .pipe(reply.res);
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
  async restoreFromBackup(payload, client) {
    if (!this.restoreDirectory) {
      throw new BadRequestException();
    }

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
    this.logger.warn(`Starting backup restore...`);
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
    client.emit('stdout', color.yellow(`File restore complete.\r\n`));
    await new Promise(resolve => setTimeout(resolve, 1000));

    // restore plugins
    client.emit('stdout', color.cyan('\r\nRestoring plugins...\r\n'));
    const plugins = (await fs.readJson(path.resolve(this.restoreDirectory, 'plugins.json')))
      .filter(x => ![
        'homebridge-config-ui-x',
      ].includes(x.name) && x.publicPackage); // list of plugins not to restore

    for (const plugin of plugins) {
      try {
        client.emit('stdout', color.yellow(`\r\nInstalling ${plugin.name}...\r\n`));
        await this.pluginsService.installPlugin(plugin.name, client);
      } catch (e) {
        client.emit('stdout', color.red(`Failed to install ${plugin.name}.\r\n`));
      }
    }

    // load restored config
    const restoredConfig = await fs.readJson(this.configService.configPath);

    // ensure the bridge port does not change
    if (restoredConfig.bridge) {
      restoredConfig.bridge.port = this.configService.homebridgeConfig.bridge.port;
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
  async restoreHbfxBackup(payload, client) {
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
    this.logger.warn(`Starting hbfx restore...`);
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
          'config.json'
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
      'wink': 'homebridge-wink3'
    };

    // install plugins
    if (sourceConfig.plugins?.length) {
      for (let plugin of sourceConfig.plugins) {
        if (plugin in pluginMap) {
          plugin = pluginMap[plugin];
        }
        try {
          client.emit('stdout', color.yellow(`\r\nInstalling ${plugin}...\r\n`));
          await this.pluginsService.installPlugin(plugin, client);
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

    // add config ui platform
    targetConfig.platforms.push(this.configService.ui);

    // save the config
    await fs.writeJson(this.configService.configPath, targetConfig, { spaces: 4 });

    // remove temp files
    await this.removeRestoreDirectory();

    client.emit('stdout', color.green('\r\nRestore Complete!\r\n'));

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
              return parseInt(child_process.execSync(`pidof homebridge`).toString('utf8').trim(), 10);
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
}