import * as os from 'os';
import * as fs from 'fs';
import * as WebSocket from 'ws';
import * as pty from 'node-pty';
import * as color from 'bash-color';
import * as child_process from 'child_process';

import { hb } from '../hb';

export class LogsWssHandler {
  private ws: WebSocket;
  private term: any;

  constructor(ws: WebSocket, req) {
    this.ws = ws;

    // support legacy log configs
    if (hb.oldLogOpts && !hb.logOpts) {
      hb.error('WARNING: "log" config option is depreciated. Please update your log config to use the "logOpts" method!');
      if (hb.oldLogOpts && typeof (hb.oldLogOpts) === 'string' && fs.existsSync(hb.oldLogOpts)) {
        hb.logOpts = {
          method: 'file',
          path: hb.oldLogOpts,
        };
      } else if (hb.oldLogOpts && hb.oldLogOpts === 'systemd') {
        hb.logOpts = {
          method: 'systemd',
          service: 'homebridge',
        };
      } else if (hb.oldLogOpts && typeof (hb.oldLogOpts) === 'object' && hb.oldLogOpts.systemd && hb.oldLogOpts.systemd.length) {
        hb.logOpts = {
          method: 'systemd',
          service: hb.oldLogOpts.systemd,
        };
      } else if (hb.oldLogOpts && typeof (hb.oldLogOpts) === 'object' && hb.oldLogOpts.tail) {
        hb.logOpts = {
          method: 'custom',
          command: hb.oldLogOpts.tail,
        };
      }
    }

    if (hb.logOpts.method === 'file') {
      this.logFromFile();
    } else if (hb.logOpts.method === 'systemd') {
      this.logFromSystemd();
    } else if (hb.logOpts.method === 'custom') {
      this.logFromCommand();
    } else {
      this.logNotConfigured();
    }

    // listen for resize events from the client
    ws.on('logs', (msg) => {
      if (msg.size) {
        this.resizeTerminal(msg.size);
      }
    });

    // when the client disconnects stop tailing the log file
    const onClose = () => {
      onUnsubscribe('logs');
    };
    ws.on('close', onClose);

    // when the client leaves the log page, stop tailing the log file
    const onUnsubscribe = (sub?) => {
      if (sub === 'logs') {
        this.killTerm();
        ws.removeAllListeners('logs');
        ws.removeEventListener('unsubscribe', onUnsubscribe);
        ws.removeEventListener('close', onClose);
      }
    };
    ws.on('unsubscribe', onUnsubscribe);
  }

  send(data) {
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({logs: data}));
    }
  }

  logFromFile() {
    let command;
    if (os.platform() === 'win32') {
      // windows - use powershell to tail log
      command = ['powershell.exe', '-command', `Get-Content -Path '${hb.logOpts.path}' -Wait -Tail 200`];
    } else {
      // linux / macos etc
      command = ['tail', '-n', '200', '-f', hb.logOpts.path];

      // sudo mode is requested in plugin config
      if (hb.useSudo) {
        command.unshift('sudo', '-n');
      }
    }

    this.send(color.cyan(`Loading logs from file\r\nCMD: ${command.join(' ')}\r\n\r\n`));

    this.tailLog(command);
  }

  logFromSystemd() {
    const command = ['journalctl', '-o', 'cat', '-n', '500', '-f', '-u', hb.logOpts.service || 'homebridge'];

    // sudo mode is requested in plugin config
    if (hb.useSudo) {
      command.unshift('sudo', '-n');
    }

    this.send(color.cyan(`Using systemd to tail logs\r\nCMD: ${command.join(' ')}\r\n\r\n`));

    this.tailLog(command);
  }

  logFromCommand() {
    const command = hb.logOpts.command.split(' ');

    this.send(color.cyan(`Using custom command to tail logs\r\nCMD: ${command.join(' ')}\r\n\r\n`));

    this.tailLog(command);
  }

  logNotConfigured() {
    this.send(color.red(`Cannot show logs. "logOpts" option is not configured correctly in your Homebridge config.json file.\r\n\r\n`));
    this.send(color.cyan(`See https://github.com/oznu/homebridge-config-ui-x#log-viewer-configuration for instructions.\r\n`));
  }

  tailLog(command) {
    const cmd = command.join(' ');

    // spawn the process that will output the logs
    this.term = pty.spawn(command.shift(), command, {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: hb.storagePath,
      env: process.env
    });

    // send stdout data from the process to the client
    this.term.on('data', this.send.bind(this));

    // send an error message to the client if the log tailing process exits early
    this.term.on('exit', (code) => {
      try {
        this.send('\n\r');
        this.send(color.red(`The log tail command "${cmd}" exited with code ${code}.\n\r`));
        this.send(color.red(`Please check the command in your config.json is correct.\n\r\n\r`));
        this.send(color.cyan(`See https://github.com/oznu/homebridge-config-ui-x#log-viewer-configuration for instructions.\r\n`));
      } catch (e) {
        // the client socket probably closed
      }
    });
  }

  resizeTerminal(size) {
    if (this.term) {
      this.term.resize(size.cols, size.rows);
    }
  }

  killTerm() {
    if (this.term) {
      this.term.kill();
      this.term.destroy();
      this.forceKillProcess();
    }
  }

  forceKillProcess() {
    if (hb.useSudo && this.term && this.term.pid) {
      // really make sure the log tail command is killed when using sudo mode
      child_process.exec(`sudo -n kill -9 ${this.term.pid}`);
    }
  }
}
