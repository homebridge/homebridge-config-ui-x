import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as child_process from 'child_process';
import * as fs from 'fs-extra';

import { Logger } from '../../../core/logger/logger.service';
import { PluginsService } from '../../plugins/plugins.service';

@Injectable()
export class HomebridgeNestCamService {
  private child: child_process.ChildProcess;

  constructor(
    private pluginsService: PluginsService,
    private logger: Logger,
  ) { }

  async linkAccount(client: EventEmitter) {
    let complete = false;
    const plugins = await this.pluginsService.getInstalledPlugins();
    const nestCamPlugin = plugins.find(x => x.name === 'homebridge-nest-cam');

    if (!nestCamPlugin) {
      this.logger.error('Cannot find homebridge-nest-cam package.');
    }

    const childProcessPath = path.join(nestCamPlugin.installPath, nestCamPlugin.name, 'dist/uix.js');

    if (!await fs.pathExists(childProcessPath)) {
      client.emit('server_error', {
        key: 'not_supported',
        message: 'Your version of homebridge-nest-cam does not support account linking using the Homebridge UI.',
      });
      return;
    }

    if (this.child?.connected) {
      this.child.kill();
    }

    this.logger.log(`Starting homebridge-nest-cam account linking script: ${childProcessPath}`);
    this.child = child_process.fork(childProcessPath, [], {
      silent: true,
    });

    this.child.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    this.child.stderr.on('data', (data) => {
      process.stdout.write(data);
    });

    const cleanup = () => {
      complete = true;
      if (this.child.connected) {
        this.child.disconnect();
        const childPid = this.child.pid;
        setTimeout(() => {
          try {
            process.kill(childPid, 'SIGTERM');
          } catch (e) { }
        }, 5000);
      }
      client.removeAllListeners('end');
      client.removeAllListeners('username');
      client.removeAllListeners('password');
      client.removeAllListeners('totp');
      client.removeAllListeners('cancel');
    };

    client.on('disconnect', () => {
      cleanup();
    });

    client.on('end', () => {
      cleanup();
    });

    client.on('cancel', () => {
      cleanup();
    });

    client.on('username', (payload) => {
      this.child.send({ action: 'username', payload });
    });

    client.on('password', (payload) => {
      this.child.send({ action: 'password', payload });
    });

    client.on('totp', (payload) => {
      this.child.send({ action: 'totp', payload });
    });

    // start login script
    this.child.send({ action: 'doLogin' });

    // listen for messages from the child process
    this.child.addListener('message', (request: { action: string; payload?: any }) => {
      // we don't want the child emitting errors to the client, so change the name
      request.action = request.action === 'error' ? 'server_error' : request.action;
      client.emit(request.action, request.payload);

      if (request.action === 'credentials') {
        complete = true;
        cleanup();
      }
    });

    this.child.on('exit', () => {
      this.logger.log('The homebridge-nest-cam account linking script exited.');
      if (!complete) {
        client.emit('browser_closed', { message: 'The account linking process closed unexpectedly.' });
        cleanup();
      }
    });
  }
}
