import * as os from 'os';
import * as fs from 'fs';
import * as pty from 'node-pty';
import * as color from 'bash-color';

import { hb } from '../hb';

export class LogsWssHandler {
  private ws: any;
  private term: any;

  constructor (ws, req) {
    this.ws = ws;

    if (hb.logOpts && typeof (hb.logOpts) === 'string' && fs.existsSync(hb.logOpts)) {
      this.logFromFile();
    } else if (hb.logOpts && hb.logOpts === 'systemd') {
      this.logFromSystemd();
    } else if (hb.logOpts && typeof (hb.logOpts) === 'object' && hb.logOpts.tail) {
      this.logFromCommand();
    } else {
      this.logNotConfigured();
    }

    // when the client disconnects stop tailing the log file
    const onClose = () => {
      this.killTerm();
    };
    ws.on('close', onClose);

    // when the client leaves the log page, stop tailing the log file
    const onUnsubscribe = (sub) => {
      if (sub === 'logs') {
        this.killTerm();
        ws.removeEventListener('unsubscribe', onUnsubscribe);
        ws.removeEventListener('close', onClose);
      }
    };
    ws.on('unsubscribe', onUnsubscribe);
  }

  send (data) {
    this.ws.send(JSON.stringify({log: data}));
  }

  logFromFile () {
    let command;
    if (os.platform() === 'win32') {
      // windows - use powershell to tail log
      command = ['powershell.exe', '-command', `Get-Content -Path '${hb.logOpts}' -Wait -Tail 100`];
    } else {
      // linux / macos etc
      command = `tail -n 100 -f ${hb.logOpts}`.split(' ');

      // sudo mode is requested in plugin config
      if (hb.useSudo) {
        command.unshift('sudo', '-n');
      }
    }

    this.send(color.cyan(`Loading logs from file\r\nCMD: ${command.join(' ')}\r\n\r\n`));

    this.tailLog(command);
  }

  logFromSystemd () {
    const command = `journalctl -o cat -n 500 -f -u homebridge`.split(' ');

    // sudo mode is requested in plugin config
    if (hb.useSudo) {
      command.unshift('sudo', '-n');
    }

    this.send(color.cyan(`Using systemd to tail logs\r\nCMD: ${command.join(' ')}\r\n\r\n`));

    this.tailLog(command);
  }

  logFromCommand () {
    const command = Array.isArray(hb.logOpts.tail) ? hb.logOpts.tail.slice() : hb.logOpts.tail.split(' ');

    this.send(color.cyan(`Using custom command to tail logs\r\nCMD: ${command.join(' ')}\r\n\r\n`));

    this.tailLog(command);
  }

  logNotConfigured () {
    if (hb.logOpts) {
      this.send(color.red(`Log file does not exist: ${hb.logOpts}\r\n`));
      this.send(color.red(`Please set the correct path to the logs in your Homebridge config.json file.\r\n\r\n`));
    } else {
      this.send(color.red(`Cannot show logs. Log option is not configured in your Homebridge config.json file.\r\n\r\n`));
    }
    this.send(color.cyan(`See https://github.com/oznu/homebridge-config-ui-x#log-viewer-configuration for instructions.\r\n`));
  }

  tailLog (command) {
    const cmd = command.join(' ');

    // spawn the process that will output the logs
    this.term = pty.spawn(command.shift(), command, {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
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

  killTerm () {
    if (this.term) {
      this.term.kill();
    }
  }

}
