import * as os from 'os';
import * as fs from 'fs-extra';
import * as rp from 'request-promise-native';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../core/config/config.service';
import { Logger } from '../../core/logger/logger.service';

@Injectable()
export class StatusService {
  constructor(
    private logger: Logger,
    private configService: ConfigService,
  ) { }

  /**
   * Socket Handler - Per Client
   * Start emitting server stats to client
   * @param client
   */
  public async watchStats(client) {
    client.emit('system-status', await this.getSystemStats());
    client.emit('homebridge-status', await this.getHomebridgeStats());

    const systemStatusInterval = setInterval(async () => {
      client.emit('system-status', await this.getSystemStats());
    }, 5000);

    const homebridgeStatusInterval = setInterval(async () => {
      client.emit('homebridge-status', await this.getHomebridgeStats());
    }, 10000);

    // cleanup on disconnect
    const onEnd = () => {
      client.removeAllListeners('end');
      client.removeAllListeners('disconnect');
      clearInterval(systemStatusInterval);
      clearInterval(homebridgeStatusInterval);
    };

    client.on('end', onEnd.bind(this));
    client.on('disconnect', onEnd.bind(this));
  }

  /**
   * Returns Homebridge Status From Healthcheck
   */
  private async getHomebridgeStats() {
    return {
      consolePort: this.configService.ui.port,
      port: this.configService.homebridgeConfig.bridge.port,
      pin: this.configService.homebridgeConfig.bridge.pin,
      packageVersion: this.configService.package.version,
      status: await this.checkHomebridgeStatus(),
    };
  }

  /**
   * Returns system stats
   */
  private async getSystemStats() {
    // memory usage
    const memory = {
      total: (((os.totalmem() / 1024) / 1024) / 1024).toFixed(2),
      used: ((((os.totalmem() - os.freemem()) / 1024) / 1024) / 1024).toFixed(2),
      free: (((os.freemem() / 1024) / 1024) / 1024).toFixed(2),
    };

    // cpu load
    const cpu = (os.platform() === 'win32') ? null : (os.loadavg()[0] * 100 / os.cpus().length).toFixed(2);

    // server uptime
    const uptime: any = {
      delta: Math.floor(os.uptime()),
    };

    uptime.days = Math.floor(uptime.delta / 86400);
    uptime.delta -= uptime.days * 86400;
    uptime.hours = Math.floor(uptime.delta / 3600) % 24;
    uptime.delta -= uptime.hours * 3600;
    uptime.minutes = Math.floor(uptime.delta / 60) % 60;

    // cpu temp
    let cputemp = null;
    if (this.configService.ui.temp) {
      try {
        cputemp = await fs.readFile(this.configService.ui.temp, 'utf-8');
        cputemp = ((cputemp / 1000).toPrecision(3));
      } catch (e) {
        cputemp = null;
        this.logger.error(`Failed to read temp from ${this.configService.ui.temp}`);
      }
    }

    return {
      memory,
      cpu,
      uptime,
      cputemp,
    };
  }

  /**
   * Check if homebridge is running on the local system
   */
  private async checkHomebridgeStatus() {
    try {
      await rp.get(`http://localhost:${this.configService.homebridgeConfig.bridge.port}`, {
        resolveWithFullResponse: true,
        simple: false, // <- This prevents the promise from failing on a 404
      });
      return 'up';
    } catch (e) {
      return 'down';
    }
  }
}
