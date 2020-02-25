import * as os from 'os';
import * as tar from 'tar';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as color from 'bash-color';
import * as child_process from 'child_process';
import { Injectable, BadRequestException } from '@nestjs/common';
import { PluginsService } from '../plugins/plugins.service';
import { ConfigService } from '../../core/config/config.service';
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
        'nssm.exe',
        'node_modules',
        '.docker.env',
        'startup.sh',
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
    // prepare a temp working directory
    const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homebridge-backup-'));

    // create a write stream and pipe the upload into it
    file.pipe(tar.x({
      cwd: backupDir,
    }));

    file.on('end', () => {
      this.restoreDirectory = backupDir;
    });
  }

  /**
   * Restores the uploaded backup
   */
  async restoreFromBackup(payload, client) {
    if (!this.restoreDirectory) {
      throw new BadRequestException();
    }

    // start restore
    this.logger.warn(`Starting backup restore...`);
    client.emit('stdout', color.cyan('Restoring backup...\r\n\r\n'));
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
    await fs.remove(this.restoreDirectory);

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
        return child_process.execSync('killall -9 homebridge; kill -9 $(pidof homebridge-config-ui-x);');
      }

      // if standalone mode
      if (this.configService.ui.standalone && this.configService.runningInLinux) {
        child_process.execSync('killall -9 homebridge;');
        return process.kill(process.pid, 'SIGKILL');
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

      // try the users restart command
      if (this.configService.ui.restart) {
        return child_process.exec(this.configService.ui.restart);
      }

      // if all else fails just kill the current process
      return process.kill(process.pid, 'SIGKILL');
    }, 500);

    return { status: 0 };
  }
}