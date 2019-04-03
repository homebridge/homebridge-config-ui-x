import * as fs from 'fs';
import * as WebSocket from 'ws';
import * as pty from 'node-pty-prebuilt-multiarch';
import * as color from 'bash-color';

import { User } from '../users';
import { hb } from '../hb';

export class TerminalWssHandler {
  private ws: WebSocket;
  private term: any;
  private user: User;

  constructor(ws: WebSocket, req) {
    this.ws = ws;
    this.user = req.user;

    if (!this.user.admin) {
      hb.warn(`[${this.user.username}]`, `Non-admin user attempted to access terminal.`);
      return;
    }

    if (!hb.enableTerminalAccess) {
      this.send(color.red(`Request to spawn terminal rejected, see log for details.`));
      hb.error(`[${this.user.username}]`, `Request to spawn terminal rejected. ` +
        `Terminal is not enabled.`);
      return;
    }

    ws.on('terminal', (msg) => {
      if (msg.data) {
        this.term.write(msg.data);
      } else if (msg.size) {
        this.resizeTerminal(msg.size);
      } else if (msg.start) {
        this.startTerminal();
      }
    });

    // when the client disconnects stop the terminal
    const onClose = () => {
      onUnsubscribe('terminal');
    };
    ws.on('close', onClose);

    // when the client leaves the terminal page, stop the terminal
    const onUnsubscribe = (sub?) => {
      if (sub === 'terminal') {
        ws.removeAllListeners('terminal');
        this.killTerm();
        ws.removeEventListener('unsubscribe', onUnsubscribe);
        ws.removeEventListener('close', onClose);
      }
    };
    ws.on('unsubscribe', onUnsubscribe);
  }

  send(data) {
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ terminal: data }));
    }
  }

  startTerminal() {
    hb.log(`[${this.user.username}]`, 'Terminal session started');

    const shell = fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';

    this.term = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: hb.storagePath,
      env: process.env
    });

    // send stdout data from the process to the client
    this.term.on('data', this.send.bind(this));

    // send an error message to the client if the terminal exits
    this.term.on('exit', (code) => {
      try {
        this.send(color.red(`\n\r\n\rTerminal Session Ended\n\r\n\r`));
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
      hb.log(`[${this.user.username}]`, 'Terminal session ended');
      this.term.kill();
      this.term.destroy();
    }
  }
}
