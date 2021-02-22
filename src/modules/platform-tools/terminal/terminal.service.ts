import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import { Injectable } from '@nestjs/common';

import { ConfigService } from '../../../core/config/config.service';
import { Logger } from '../../../core/logger/logger.service';
import { NodePtyService } from '../../../core/node-pty/node-pty.service';

export type TermSize = { cols: number; rows: number };

export interface WsEventEmitter extends EventEmitter {
  disconnect: () => void;
}

@Injectable()
export class TerminalService {
  private ending = false;

  constructor(
    private configService: ConfigService,
    private logger: Logger,
    private nodePtyService: NodePtyService,
  ) { }

  /**
   * Create a new terminal session
   * @param client
   */
  async startSession(client: WsEventEmitter, size: TermSize) {
    this.ending = false;

    // if terminal is not enabled, disconnect the client
    if (!this.configService.enableTerminalAccess) {
      this.logger.error('Terminal is not enabled. Disconnecting client...');
      client.disconnect();
      return;
    }

    this.logger.log('Starting terminal session');

    // check if we should use bash or sh
    const shell = await fs.pathExists('/bin/bash') ? '/bin/bash' : '/bin/sh';

    // spawn a new shell
    const term = this.nodePtyService.spawn(shell, [], {
      name: 'xterm-color',
      cols: size.cols,
      rows: size.rows,
      cwd: this.configService.storagePath,
      env: process.env,
    });

    // write to the client
    term.onData((data) => {
      client.emit('stdout', data);
    });

    // let the client know when the session ends
    term.onExit((code) => {
      try {
        if (!this.ending) {
          client.emit('process-exit', code);
        }
      } catch (e) {
        // the client socket probably closed
      }
    });

    // write input to the terminal
    client.on('stdin', (data) => {
      term.write(data);
    });

    // capture resize events
    client.on('resize', (resize: TermSize) => {
      try {
        term.resize(resize.cols, resize.rows);
      } catch (e) { }
    });

    // cleanup on disconnect
    const onEnd = () => {
      this.ending = true;

      client.removeAllListeners('stdin');
      client.removeAllListeners('resize');
      client.removeAllListeners('end');
      client.removeAllListeners('disconnect');

      try {
        this.logger.log('Terminal session ended.');
        term.kill();
      } catch (e) { }
    };

    client.on('end', onEnd.bind(this));
    client.on('disconnect', onEnd.bind(this));
  }
}
