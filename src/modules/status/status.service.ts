import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';
import * as util from 'util';
import * as fs from 'fs-extra';
import * as si from 'systeminformation';
import * as semver from 'semver';
import * as NodeCache from 'node-cache';
import { Subject, Subscription } from 'rxjs';
import { Injectable, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

import { Logger } from '../../core/logger/logger.service';
import { ConfigService } from '../../core/config/config.service';
import { HomebridgeIpcService } from '../../core/homebridge-ipc/homebridge-ipc.service';
import { PluginsService } from '../plugins/plugins.service';
import { ServerService } from '../server/server.service';

export const enum HomebridgeStatus {
  PENDING = 'pending',
  OK = 'ok',
  UP = 'up',
  DOWN = 'down',
}

export interface HomebridgeStatusUpdate {
  status: HomebridgeStatus;
  paired?: null | boolean;
  setupUri?: null | string;
  name?: string;
  username?: string;
  pin?: string;
}

const execAsync = util.promisify(child_process.exec);

@Injectable()
export class StatusService {
  private statusCache = new NodeCache({ stdTTL: 3600 });
  private dashboardLayout;
  private homebridgeStatus: HomebridgeStatus = HomebridgeStatus.DOWN;
  private homebridgeStatusChange = new Subject<HomebridgeStatus>();

  private cpuLoadHistory: number[] = [];
  private memoryUsageHistory: number[] = [];

  private memoryInfo: si.Systeminformation.MemData;

  private rpiGetThrottledMapping = {
    0: 'Under-voltage detected',
    1: 'Arm frequency capped',
    2: 'Currently throttled',
    3: 'Soft temperature limit active',
    16: 'Under-voltage has occurred',
    17: 'Arm frequency capping has occurred',
    18: 'Throttled has occurred',
    19: 'Soft temperature limit has occurred',
  };

  constructor(
    private httpService: HttpService,
    private logger: Logger,
    private configService: ConfigService,
    private pluginsService: PluginsService,
    private serverService: ServerService,
    private homebridgeIpcService: HomebridgeIpcService,
  ) {

    // systeminformation cpu data is not supported in FreeBSD Jail Shells
    if (os.platform() === 'freebsd') {
      this.getCpuLoadPoint = this.getCpuLoadPointAlt;
      this.getCpuTemp = this.getCpuTempAlt;
    }

    if (this.configService.ui.disableServerMetricsMonitoring !== true) {
      setInterval(async () => {
        this.getCpuLoadPoint();
        this.getMemoryUsagePoint();
      }, 10000);
    } else {
      this.logger.warn('Server metrics monitoring disabled.');
    }

    if (this.configService.serviceMode) {
      this.homebridgeIpcService.on('serverStatusUpdate', (data: HomebridgeStatusUpdate) => {
        this.homebridgeStatus = data.status === HomebridgeStatus.OK ? HomebridgeStatus.UP : data.status;

        if (data?.setupUri) {
          this.serverService.setupCode = data.setupUri;
        }

        this.homebridgeStatusChange.next(this.homebridgeStatus);
      });
    }
  }

  /**
   * Looks up the cpu current load % and stores the last 60 points
   */
  private async getCpuLoadPoint() {
    const currentLoad = (await si.currentLoad()).currentLoad;
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
   * Returns the current network usage
   */
  public async getCurrentNetworkUsage(): Promise<{ net: si.Systeminformation.NetworkStatsData; point: number }> {
    // TODO: be able to specify in the UI which interfaces to aggregate
    const defaultInterfaceName = await si.networkInterfaceDefault();

    const net = await si.networkStats(defaultInterfaceName);

    // TODO: be able to specify in the ui the unit size (i.e. bytes, megabytes, gigabytes)
    const tx_rx_sec = (net[0].tx_sec + net[0].rx_sec) / 1024 / 1024;

    // TODO: break out the sent and received figures to two separate stacked graphs 
    // (these should ideally be positive/negative mirrored linecharts)
    return { net: net[0], point: tx_rx_sec };
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
      setupUri: await this.serverService.getSetupCode(),
    };
  }

  /**
   * Returns Homebridge up/down status from cache
   */
  public async getHomebridgeStatus() {
    return {
      status: this.homebridgeStatus,
      consolePort: this.configService.ui.port,
      port: this.configService.homebridgeConfig.bridge.port,
      pin: this.configService.homebridgeConfig.bridge.pin,
      setupUri: this.serverService.setupCode,
      packageVersion: this.configService.package.version,
    };
  }

  /**
   * Socket Handler - Per Client
   * Start emitting server stats to client
   * @param client
   */
  public async watchStats(client) {
    let homebridgeStatusChangeSub: Subscription;
    let homebridgeStatusInterval: NodeJS.Timeout;

    client.emit('homebridge-status', await this.getHomebridgeStats());

    // ipc status events are only available in Homebridge 1.3.3 or later - and when running in service mode
    if (this.configService.serviceMode && this.configService.homebridgeVersion && semver.gt(this.configService.homebridgeVersion, '1.3.3-beta.5', { includePrerelease: true })) {
      homebridgeStatusChangeSub = this.homebridgeStatusChange.subscribe(async (status) => {
        client.emit('homebridge-status', await this.getHomebridgeStats());
      });
    } else {
      homebridgeStatusInterval = setInterval(async () => {
        client.emit('homebridge-status', await this.getHomebridgeStats());
      }, 10000);
    }

    // cleanup on disconnect
    const onEnd = () => {
      client.removeAllListeners('end');
      client.removeAllListeners('disconnect');

      if (homebridgeStatusInterval) {
        clearInterval(homebridgeStatusInterval);
      }

      if (homebridgeStatusChangeSub) {
        homebridgeStatusChangeSub.unsubscribe();
      }
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
      setupUri: await this.serverService.getSetupCode(),
      packageVersion: this.configService.package.version,
      status: await this.checkHomebridgeStatus(),
    };
  }

  /**
   * Check if homebridge is running on the local system
   */
  public async checkHomebridgeStatus() {
    if (this.configService.serviceMode && this.configService.homebridgeVersion && semver.gt(this.configService.homebridgeVersion, '1.3.3-beta.5', { includePrerelease: true })) {
      return this.homebridgeStatus;
    }

    try {
      await this.httpService.get(`http://localhost:${this.configService.homebridgeConfig.bridge.port}`, {
        validateStatus: () => true,
      }).toPromise();
      this.homebridgeStatus = HomebridgeStatus.UP;
    } catch (e) {
      this.homebridgeStatus = HomebridgeStatus.DOWN;
    }

    return this.homebridgeStatus;
  }

  /**
   * Get / Cache the default interface
   */
  private async getDefaultInterface(): Promise<si.Systeminformation.NetworkInterfacesData> {
    const cachedResult = this.statusCache.get('defaultInterface') as si.Systeminformation.NetworkInterfacesData;

    if (cachedResult) {
      return cachedResult;
    }

    const defaultInterfaceName = await si.networkInterfaceDefault();
    const defaultInterface = defaultInterfaceName ? (await si.networkInterfaces()).find(x => x.iface === defaultInterfaceName) : undefined;

    if (defaultInterface) {
      this.statusCache.set('defaultInterface', defaultInterface);
    }

    return defaultInterface;
  }

  /**
   * Get / Cache the OS Information
   */
  private async getOsInfo(): Promise<si.Systeminformation.OsData> {
    const cachedResult = this.statusCache.get('osInfo') as si.Systeminformation.OsData;

    if (cachedResult) {
      return cachedResult;
    }

    const osInfo = await si.osInfo();

    this.statusCache.set('osInfo', osInfo, 86400);
    return osInfo;
  }

  /**
   * Returns details about this Homebridge server
   */
  public async getHomebridgeServerInfo() {
    return {
      serviceUser: os.userInfo().username,
      homebridgeConfigJsonPath: this.configService.configPath,
      homebridgeStoragePath: this.configService.storagePath,
      homebridgeInsecureMode: this.configService.homebridgeInsecureMode,
      homebridgeCustomPluginPath: this.configService.customPluginPath,
      homebridgeRunningInDocker: this.configService.runningInDocker,
      homebridgeRunningInSynologyPackage: this.configService.runningInSynologyPackage,
      homebridgeRunningInPackageMode: this.configService.runningInPackageMode,
      homebridgeServiceMode: this.configService.serviceMode,
      nodeVersion: process.version,
      os: await this.getOsInfo(),
      time: await si.time(),
      network: await this.getDefaultInterface() || {},
    };
  }

  /**
   * Return the Homebridge package
   */
  public async getHomebridgeVersion() {
    return this.pluginsService.getHomebridgePackage();
  }

  /**
   * Checks the current version of Node.js and compares to the latest LTS
   */
  public async getNodeJsVersionInfo() {
    const cachedResult = this.statusCache.get('nodeJsVersion');

    if (cachedResult) {
      return cachedResult;
    }

    try {
      const versionList = (await this.httpService.get('https://nodejs.org/dist/index.json').toPromise()).data;
      const currentLts = versionList.filter(x => x.lts)[0];
      const versionInformation = {
        currentVersion: process.version,
        latestVersion: currentLts.version,
        updateAvailable: semver.gt(currentLts.version, process.version),
        showUpdateWarning: semver.lt(process.version, '14.15.0'),
        installPath: path.dirname(process.execPath),
      };
      this.statusCache.set('nodeJsVersion', versionInformation, 86400);
      return versionInformation;
    } catch (e) {
      this.logger.log('Failed to check for Node.js version updates - check your internet connection.');
      const versionInformation = {
        currentVersion: process.version,
        latestVersion: process.version,
        updateAvailable: false,
        showUpdateWarning: false,
      };
      this.statusCache.set('nodeJsVersion', versionInformation, 3600);
      return versionInformation;
    }
  }

  /**
   * Returns infomation about the current state of the Raspberry Pi
   */
  public async getRaspberryPiThrottledStatus() {
    if (!this.configService.runningOnRaspberryPi) {
      throw new BadRequestException('This command is only available on Raspberry Pi');
    }

    const output = {};

    for (const bit of Object.keys(this.rpiGetThrottledMapping)) {
      output[this.rpiGetThrottledMapping[bit]] = false;
    }

    try {
      const { stdout } = await execAsync('vcgencmd get_throttled');
      const throttledHex = parseInt(stdout.trim().replace('throttled=', ''));

      if (!isNaN(throttledHex)) {
        for (const bit of Object.keys(this.rpiGetThrottledMapping)) {
          if ((throttledHex >> parseInt(bit, 10)) & 1) {
            output[this.rpiGetThrottledMapping[bit]] = true;
          } else {
            output[this.rpiGetThrottledMapping[bit]] = false;
          }
        }
      }
    } catch (e) {
      this.logger.debug('Could not check vcgencmd get_throttled:', e.message);
    }

    return output;
  }
}
