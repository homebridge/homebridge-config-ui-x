import axios from 'axios';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as si from 'systeminformation';
import * as semver from 'semver';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../core/config/config.service';
import { Logger } from '../../core/logger/logger.service';

@Injectable()
export class StatusService {
  private dashboardLayout;
  private nodeJsVersionCache;
  private homebridgeStatus: 'up' | 'down';

  private cpuLoadHistory: number[] = [];
  private memoryUsageHistory: number[] = [];

  private memoryInfo: si.Systeminformation.MemData;

  constructor(
    private logger: Logger,
    private configService: ConfigService,
  ) {

    // systeminformation cpu data is not supported in FreeBSD Jail Shells
    if (os.platform() === 'freebsd') {
      this.getCpuLoadPoint = this.getCpuLoadPointAlt;
      this.getCpuTemp = this.getCpuTempAlt;
    }

    setInterval(async () => {
      this.getCpuLoadPoint();
      this.getMemoryUsagePoint();
    }, 10000);
  }

  /**
   * Looks up the cpu current load % and stores the last 60 points
   */
  private async getCpuLoadPoint() {
    const currentLoad = (await si.currentLoad()).currentload;
    this.cpuLoadHistory = this.cpuLoadHistory.slice(-60);
    this.cpuLoadHistory.push(currentLoad);
  }

  /**
   * Looks up the current memory usage and stores the last 60 points
   */
  private async getMemoryUsagePoint() {
    const mem = await si.mem();
    this.memoryInfo = mem;

    const memoryFreePercent = ((mem.total - mem.available) / mem.total) * 100;
    this.memoryUsageHistory = this.memoryUsageHistory.slice(-60);
    this.memoryUsageHistory.push(memoryFreePercent);
  }

  /**
   * Alternative method to get the CPU load on systems that do not support systeminformation.currentLoad
   * This is currently only used on FreeBSD
   */
  private async getCpuLoadPointAlt() {
    const currentLoad = (os.loadavg()[0] * 100 / os.cpus().length);
    this.cpuLoadHistory = this.cpuLoadHistory.slice(-60);
    this.cpuLoadHistory.push(currentLoad);
  }

  /**
   * Get the current CPU temperature using systeminformation.cpuTemperature
   */
  private async getCpuTemp() {
    const cpuTempData = await si.cpuTemperature();

    if (cpuTempData.main === -1 && this.configService.ui.temp) {
      return this.getCpuTempLegacy();
    }

    return cpuTempData;
  }

  /**
   * The old way of getting the cpu temp
   */
  private async getCpuTempLegacy() {
    try {
      const tempData = await fs.readFile(this.configService.ui.temp, 'utf-8');
      const cpuTemp = parseInt(tempData, 10) / 1000;
      return {
        main: cpuTemp,
        cores: [],
        max: cpuTemp,
      };
    } catch (e) {
      this.logger.error(`Failed to read temp from ${this.configService.ui.temp} - ${e.message}`);
      return this.getCpuTempAlt();
    }
  }

  /**
   * Alternative method for CPU temp
   * This is currently only used on FreeBSD and will return null
   */
  private async getCpuTempAlt() {
    return {
      main: -1,
      cores: [],
      max: -1,
    };
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
   * Returns server CPU Load and temperature information
   */
  public async getServerCpuInfo() {
    if (!this.memoryUsageHistory.length) {
      await this.getCpuLoadPoint();
    }

    return {
      cpuTemperature: await this.getCpuTemp(),
      currentLoad: this.cpuLoadHistory.slice(-1)[0],
      cpuLoadHistory: this.cpuLoadHistory,
    };
  }

  /**
   * Returns server Memory usage information
   */
  public async getServerMemoryInfo() {
    if (!this.memoryUsageHistory.length) {
      await this.getMemoryUsagePoint();
    }

    return {
      mem: this.memoryInfo,
      memoryUsageHistory: this.memoryUsageHistory,
    };
  }

  /**
   * Returns server and process uptime information
   */
  public async getServerUptimeInfo() {
    return {
      time: await si.time(),
      processUptime: process.uptime(),
    };
  }

  /**
   * Returns Homebridge pairing information
   */
  public async getHomebridgePairingPin() {
    return {
      pin: this.configService.homebridgeConfig.bridge.pin,
    };
  }

  /**
   * Returns Homebridge up/down status from cache
   */
  public async getHomebridgeStatus() {
    return {
      consolePort: this.configService.ui.port,
      port: this.configService.homebridgeConfig.bridge.port,
      pin: this.configService.homebridgeConfig.bridge.pin,
      packageVersion: this.configService.package.version,
      status: this.homebridgeStatus,
    };
  }

  /**
   * Socket Handler - Per Client
   * Start emitting server stats to client
   * @param client
   */
  public async watchStats(client) {
    client.emit('homebridge-status', await this.getHomebridgeStats());

    const homebridgeStatusInterval = setInterval(async () => {
      client.emit('homebridge-status', await this.getHomebridgeStats());
    }, 10000);

    // cleanup on disconnect
    const onEnd = () => {
      client.removeAllListeners('end');
      client.removeAllListeners('disconnect');
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
   * Check if homebridge is running on the local system
   */
  public async checkHomebridgeStatus() {
    try {
      await axios.get(`http://localhost:${this.configService.homebridgeConfig.bridge.port}`, {
        validateStatus: () => true
      });
      this.homebridgeStatus = 'up';
    } catch (e) {
      this.homebridgeStatus = 'down';
    }

    return this.homebridgeStatus;
  }

  /**
   * Returns details about this Homebridge server
   */
  public async getHomebridgeServerInfo() {
    const defaultInterface = (os.platform() !== 'freebsd') ? await si.networkInterfaceDefault() : await undefined;

    return {
      serviceUser: os.userInfo().username,
      homebridgeConfigJsonPath: this.configService.configPath,
      homebridgeStoragePath: this.configService.storagePath,
      homebridgeInsecureMode: this.configService.homebridgeInsecureMode,
      homebridgeCustomPluginPath: this.configService.customPluginPath,
      homebridgeRunningInDocker: this.configService.runningInDocker,
      homebridgeServiceMode: this.configService.serviceMode,
      nodeVersion: process.version,
      os: await si.osInfo(),
      time: await si.time(),
      network: defaultInterface ? (await si.networkInterfaces()).find(x => x.iface === defaultInterface) : {},
    };
  }

  /**
   * Checks the current version of Node.js and compares to the latest LTS
   */
  public async getNodeJsVersionInfo() {
    if (this.nodeJsVersionCache) {
      return this.nodeJsVersionCache;
    }

    try {
      const versionList = (await axios.get('https://nodejs.org/dist/index.json')).data;
      const currentLts = versionList.filter(x => x.lts)[0];
      this.nodeJsVersionCache = {
        currentVersion: process.version,
        latestVersion: currentLts.version,
        updateAvailable: semver.gt(currentLts.version, process.version),
        showUpdateWarning: semver.lt(process.version, '10.17.0'),
        installPath: path.dirname(process.execPath),
      };
      return this.nodeJsVersionCache;
    } catch (e) {
      this.logger.warn('Failed to check for Node.js version updates');
      return {
        currentVersion: process.version,
        latestVersion: process.version,
        updateAvailable: false,
        showUpdateWarning: false,
      };
    }
  }
}
