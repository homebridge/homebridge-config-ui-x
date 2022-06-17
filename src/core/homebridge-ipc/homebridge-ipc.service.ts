import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { ConfigService } from '../config/config.service';
import { Logger } from '../logger/logger.service';

@Injectable()
export class HomebridgeIpcService extends EventEmitter {
  private homebridge: ChildProcess;

  private permittedEvents = [
    'childBridgeMetadataResponse',
    'childBridgeStatusUpdate',
    'serverStatusUpdate'
  ];

  constructor(
    private logger: Logger,
    private configService: ConfigService,
  ) {
    super();
  }

  /**
   * Set the current homebridge process.
   * This method is called from hb-service.
   */
  public setHomebridgeProcess(process: ChildProcess) {
    this.homebridge = process;

    this.homebridge.on('message', (message: { id: string; data: unknown }) => {
      if (typeof message !== 'object' || !message.id) {
        return;
      }
      if (this.permittedEvents.includes(message.id)) {
        this.emit(message.id, message.data);
      }
    });

    this.homebridge.on('close', () => {
      this.emit('serverStatusUpdate', { status: 'down' });
    });
  }

  /**
   * Set the current homebridge version
   */
  public setHomebridgeVersion(version: string) {
    this.configService.homebridgeVersion = version;
  }

  /**
   * Send a data request to homebridge and wait for the reply
   */
  public async requestResponse(requestEvent: string, responseEvent: string) {
    return new Promise((resolve, reject) => {
      const actionTimeout = setTimeout(() => {
        this.removeListener(responseEvent, listener);
        reject('The Homebridge service did not respond');
      }, 3000);

      const listener = (data) => {
        clearTimeout(actionTimeout);
        resolve(data);
      };

      this.once(responseEvent, listener);
      this.sendMessage(requestEvent);
    });
  }

  /**
   * Send a message to the homebridge child process
   */
  public sendMessage(type: string, data?: unknown) {
    if (this.homebridge && this.homebridge.connected) {
      this.homebridge.send({ id: type, data: data });
    } else {
      throw new ServiceUnavailableException('The Homebridge Service Is Unavailable');
    }
  }

  /**
   * Restarts the main bridge process and any child bridges
   */
  public restartHomebridge(): void {
    if (this.homebridge) {
      this.logger.log('Sending SIGTERM to Homebridge');

      // send SIGTERM command
      this.homebridge.kill('SIGTERM');

      // prepare a timeout to send SIGKILL after 7 seconds if not shutdown before then
      const shutdownTimeout = setTimeout(() => {
        try {
          this.logger.warn('Sending SIGKILL to Homebridge');
          this.homebridge.kill('SIGKILL');
        } catch (e) { }
      }, 7000);

      // if homebridge ends before the timeout, clear the timeout
      this.homebridge.once('close', () => {
        clearTimeout(shutdownTimeout);
      });
    }
  }

  /**
   * Restarts and resolves once homebridge is stopped.
   */
  public async restartAndWaitForClose(): Promise<boolean> {
    if (!this.homebridge || !this.homebridge.connected) {
      return true;
    } else {
      return new Promise((resolve) => {
        this.homebridge.once('close', () => {
          resolve(true);
        });
        this.restartHomebridge();
      });
    }
  }

  /**
   * Send a SIGKILL to the homebridge process
   */
  public async killHomebridge() {
    if (this.homebridge) {
      this.logger.log('Sending SIGKILL to Homebridge');
      this.homebridge.kill('SIGKILL');
    }
  }

}
