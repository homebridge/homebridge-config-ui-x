import * as path from 'path';
import * as fs from 'fs-extra';
import * as rp from 'request-promise-native';
import * as si from 'systeminformation';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../core/config/config.service';
import { Logger } from '../../core/logger/logger.service';

@Injectable()
export class StatusService {
  private dashboardLayout;

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
    }, 10000);

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
    return {
      mem: await si.mem(),
      cpu: await si.cpu(),
      cpuTemperature: await si.cpuTemperature(),
      time: await si.time(),
      currentLoad: await si.currentLoad(),
      processUptime: process.uptime(),
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

  /**
   * Get the current dashboard layout
   */
  public async getDashboardLayout() {
    if (!this.dashboardLayout) {
      try {
        const layout = await fs.readJSON(path.resolve(this.configService.storagePath, '.uix-dashboard.json'));
        this.dashboardLayout = layout;
        return layout;
      } catch (e) {
        return [];
      }
    } else {
      return this.dashboardLayout;
    }
  }

  /**
   * Saves the current dashboard layout
   */
  public async setDashboardLayout(layout) {
    fs.writeJSONSync(path.resolve(this.configService.storagePath, '.uix-dashboard.json'), layout);
    this.dashboardLayout = layout;
    return { status: 'ok' };
  }

  /**
   * Returns details about this Homebridge server
   */
  public async getHomebridgeServerInfo() {
    const defaultInterface = await si.networkInterfaceDefault();
    return {
      homebridgeConfigJsonPath: this.configService.configPath,
      homebridgeStoragePath: this.configService.storagePath,
      homebridgeInsecureMode: this.configService.homebridgeInsecureMode,
      homebridgeCustomPluginPath: this.configService.customPluginPath,
      homebridgeRunningInDocker: this.configService.runningInDocker,
      homebridgeServiceMode: this.configService.serviceMode,
      nodeVersion: process.version,
      os: await si.osInfo(),
      time: await si.time(),
      network: (await si.networkInterfaces()).find(x => x.iface === defaultInterface),
    };
  }
}
