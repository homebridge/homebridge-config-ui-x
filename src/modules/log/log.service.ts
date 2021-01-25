import * as os from 'os';
import * as color from 'bash-color';
import * as semver from 'semver';
import * as child_process from 'child_process';
import * as fs from 'fs-extra';
import { EventEmitter } from 'events';
import { Injectable } from '@nestjs/common';
import { Tail } from 'tail';

import { ConfigService } from '../../core/config/config.service';
import { NodePtyService } from '../../core/node-pty/node-pty.service';

export type LogTermSize = { cols: number; rows: number };

@Injectable()
export class LogService {
  private command: string[];
  private useNative = false;
  private ending = false;
  private nativeTail: Tail;

  constructor(
    private configService: ConfigService,
    private nodePtyService: NodePtyService,
  ) {
    this.setLogMethod();
  }

  /**
   * Set the log method
   */
  public setLogMethod() {
    this.useNative = false;
    if (typeof this.configService.ui.log !== 'object') {
      this.logNotConfigured();
    } else if (this.configService.ui.log.method === 'file' && this.configService.ui.log.path) {
      this.logFromFile();
    } else if (this.configService.ui.log.method === 'native' && this.configService.ui.log.path) {
      this.useNative = true;
      this.command = undefined;
    } else if (this.configService.ui.log.method === 'systemd') {
      this.logFromSystemd();
    } else if (this.configService.ui.log.method === 'custom' && this.configService.ui.log.command) {
      this.logFromCommand();
    } else {
      this.logNotConfigured();
    }
  }

  /**
   * Socket handler
   * @param client
   */
  public connect(client: EventEmitter, size: LogTermSize) {
    this.ending = false;

    if (!semver.satisfies(process.version, `>=${this.configService.minimumNodeVersion}`)) {
      client.emit('stdout', color.yellow(`Node.js v${this.configService.minimumNodeVersion} higher is required for ${this.configService.name}.\n\r`));
      client.emit('stdout', color.yellow(`You may experience issues while running on Node.js ${process.version}.\n\r\n\r`));
    }

    if (this.command) {
      client.emit('stdout', color.cyan(`Loading logs using "${this.configService.ui.log.method}" method...\r\n`));
      client.emit('stdout', color.cyan(`CMD: ${this.command.join(' ')}\r\n\r\n`));
      this.tailLog(client, size);
    } else if (this.useNative) {
      client.emit('stdout', color.cyan('Loading logs using native method...\r\n'));
      client.emit('stdout', color.cyan(`File: ${this.configService.ui.log.path}\r\n\r\n`));
      this.tailLogFromFileNative(client);
    } else {
      client.emit('stdout', color.red('Cannot show logs. "log" option is not configured correctly in your Homebridge config.json file.\r\n\r\n'));
      client.emit('stdout', color.cyan('See https://github.com/oznu/homebridge-config-ui-x#log-viewer-configuration for instructions.\r\n'));
    }
  }

  /**
   * Connect pty
   * @param client
   */
  private tailLog(client: EventEmitter, size: LogTermSize) {
    const command = [...this.command];

    // spawn the process that will output the logs
    const term = this.nodePtyService.spawn(command.shift(), command, {
      name: 'xterm-color',
      cols: size.cols,
      rows: size.rows,
      cwd: this.configService.storagePath,
      env: process.env,
    });

    // send stdout data from the process to the client
    term.onData((data) => {
      client.emit('stdout', data);
    });

    // send an error message to the client if the log tailing process exits early
    term.onExit((code) => {
      try {
        if (!this.ending) {
          client.emit('stdout', '\n\r');
          client.emit('stdout', color.red(`The log tail command "${command.join(' ')}" exited with code ${code.exitCode}.\n\r`));
          client.emit('stdout', color.red('Please check the command in your config.json is correct.\n\r\n\r'));
          client.emit('stdout', color.cyan('See https://github.com/oznu/homebridge-config-ui-x#log-viewer-configuration for instructions.\r\n'));
        }
      } catch (e) {
        // the client socket probably closed
      }
    });

    // handle resize events
    client.on('resize', (resize: { rows: number; cols: number }) => {
      try {
        term.resize(resize.cols, resize.rows);
      } catch (e) { }
    });

    // cleanup on disconnect
    const onEnd = () => {
      this.ending = true;

      client.removeAllListeners('resize');
      client.removeAllListeners('end');
      client.removeAllListeners('disconnect');

      try {
        term.kill();
      } catch (e) { }
      // really make sure the log tail command is killed when using sudo mode
      if (this.configService.ui.sudo && term && term.pid) {
        child_process.exec(`sudo -n kill -9 ${term.pid}`);
      }
    };

    client.on('end', onEnd.bind(this));
    client.on('disconnect', onEnd.bind(this));
  }

  /**
   * Construct the logs from file command
   */
  private logFromFile() {
    let command: string[];
    if (os.platform() === 'win32') {
      // windows - use powershell to tail log
      command = ['powershell.exe', '-command', `Get-Content -Path '${this.configService.ui.log.path}' -Wait -Tail 200`];
    } else {
      // linux / macos etc
      command = ['tail', '-n', '500', '-f', this.configService.ui.log.path];

      // sudo mode is requested in plugin config
      if (this.configService.ui.sudo) {
        command.unshift('sudo', '-n');
      }
    }

    this.command = command;
  }

  /**
   * Construct the logs from systemd command
   */
  private logFromSystemd() {
    const command = ['journalctl', '-o', 'cat', '-n', '500', '-f', '-u', this.configService.ui.log.service || 'homebridge'];

    // sudo mode is requested in plugin config
    if (this.configService.ui.sudo) {
      command.unshift('sudo', '-n');
    }

    this.command = command;
  }

  /**
   * Logs from a file without spawning a child_process
   */
  private async tailLogFromFileNative(client: EventEmitter) {
    if (!fs.existsSync(this.configService.ui.log.path)) {
      client.emit('stdout', '\n\r');
      client.emit('stdout', color.red(`No log file exists at path: ${this.configService.ui.log.path}\n\r`));
    }

    // read the first 50000 bytes of the log and emit to the client
    try {
      const logStats = await fs.stat(this.configService.ui.log.path);
      const logStartPosition = logStats.size <= 50000 ? 0 : logStats.size - 50000;
      const logStream = fs.createReadStream(this.configService.ui.log.path, { start: logStartPosition });

      logStream.on('data', (buffer) => {
        client.emit('stdout', buffer.toString('utf8').split('\n').join('\n\r'));
      });

      logStream.on('end', () => {
        logStream.close();
      });
    } catch (e) {
      client.emit('stdout', color.red(`Failed to read log file: ${e.message}\n\r`));
      return;
    }

    if (!this.nativeTail) {
      this.nativeTail = new Tail(this.configService.ui.log.path, {
        fromBeginning: false,
        useWatchFile: true,
        fsWatchOptions: {
          interval: 200,
        },
      });
    } else if (this.nativeTail.listenerCount('line') === 0) {
      this.nativeTail.watch();
    }

    // watch for lines and emit to client
    const onLine = (line) => {
      client.emit('stdout', line + '\n\r');
    };

    const onError = (err) => {
      client.emit('stdout', err.message + '\n\r');
    };

    this.nativeTail.on('line', onLine);
    this.nativeTail.on('error', onError);

    // cleanup on disconnect
    const onEnd = () => {
      this.ending = true;

      this.nativeTail.removeListener('line', onLine);
      this.nativeTail.removeListener('error', onError);

      // stop watching the file if there are no other watchers
      if (this.nativeTail.listenerCount('line') === 0) {
        this.nativeTail.unwatch();
      }

      client.removeAllListeners('end');
      client.removeAllListeners('disconnect');
    };

    client.on('end', onEnd.bind(this));
    client.on('disconnect', onEnd.bind(this));
  }

  /**
   * Construct the logs from custom command
   */
  private logFromCommand() {
    this.command = this.configService.ui.log.command.split(' ');
  }

  /**
   * Logs are not configued
   */
  private logNotConfigured() {
    this.command = null;
  }

}
