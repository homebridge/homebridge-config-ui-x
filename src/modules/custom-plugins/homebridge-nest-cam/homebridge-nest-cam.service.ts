import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as child_process from 'child_process';

import { Logger } from '../../../core/logger/logger.service';
import { PluginsService } from '../../plugins/plugins.service';


@Injectable()
export class HomebridgeNestCamService {
  private child: child_process.ChildProcess;

  constructor(
    private pluginsService: PluginsService,
    private logger: Logger,
  ) { }

  async start(client: EventEmitter) {
    const plugins = await this.pluginsService.getInstalledPlugins();
    const nestCamPlugin = plugins.find(x => x.name === 'homebridge-nest-cam');

    if (!nestCamPlugin) {
      this.logger.error('Cannot find homebridge-nest-cam package.');
    }

    const childProcessPath = path.join(nestCamPlugin.installPath, nestCamPlugin.name, 'dist/uix.js');

    if (!this.child?.connected) {
      this.logger.log(`Starting homebridge-nest-cam account linking script: ${childProcessPath}`);
      this.child = child_process.fork(childProcessPath, ['-h']);
    }

    client.on('disconnect', () => {
      if (this.child) {
        this.child.kill();
      }
    });

    client.on('end', () => {
      if (this.child) {
        this.child.kill();
      }
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
      client.emit(request.action, request.payload);
    });

    this.child.on('close', () => {
      console.log('child closed');
    });
  }
}
