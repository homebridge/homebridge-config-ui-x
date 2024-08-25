import { exec, execSync } from 'child_process';
import {
  cpus,
  loadavg,
  platform,
  userInfo,
} from 'os';
import { dirname, resolve } from 'path';
import { promisify } from 'util';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { readFile, readJson, writeJsonSync } from 'fs-extra';
import * as NodeCache from 'node-cache';
import { Subject, Subscription } from 'rxjs';
import { gt } from 'semver';
import {
  Systeminformation,
  cpuTemperature,
  currentLoad,
  mem,
  networkInterfaceDefault,
  networkInterfaces,
  networkStats,
  osInfo,
  time,
} from 'systeminformation';
import { ConfigService } from '../../core/config/config.service';
import { HomebridgeIpcService } from '../../core/homebridge-ipc/homebridge-ipc.service';
import { Logger } from '../../core/logger/logger.service';
import { PluginsService } from '../plugins/plugins.service';
import { ServerService } from '../server/server.service';

export const enum HomebridgeStatus {
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

const execAsync = promisify(exec);

@Injectable()
export class StatusService {
  private statusCache = new NodeCache({ stdTTL: 3600 });
  private dashboardLayout: any;
  private homebridgeStatus: HomebridgeStatus = HomebridgeStatus.DOWN;
  private homebridgeStatusChange = new Subject<HomebridgeStatus>();

  private cpuLoadHistory: number[] = [];
  private memoryUsageHistory: number[] = [];

  private memoryInfo: Systeminformation.MemData;

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
    if (platform() === 'freebsd') {
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
    const load = (await currentLoad()).currentLoad;
    this.cpuLoadHistory = this.cpuLoadHistory.slice(-60);
    this.cpuLoadHistory.push(load);
  }

  /**
   * Looks up the current memory usage and stores the last 60 points
   */
  private async getMemoryUsagePoint() {
    const memory = await mem();
    this.memoryInfo = memory;

    const memoryFreePercent = ((memory.total - memory.available) / memory.total) * 100;
    this.memoryUsageHistory = this.memoryUsageHistory.slice(-60);
    this.memoryUsageHistory.push(memoryFreePercent);
  }

  /**
   * Alternative method to get the CPU load on systems that do not support systeminformation.currentLoad
   * This is currently only used on FreeBSD
   */
  private async getCpuLoadPointAlt() {
    const load = (loadavg()[0] * 100 / cpus().length);
    this.cpuLoadHistory = this.cpuLoadHistory.slice(-60);
    this.cpuLoadHistory.push(load);
  }

  /**
   * Get the current CPU temperature using systeminformation.cpuTemperature
   */
  private async getCpuTemp() {
    const cpuTempData = await cpuTemperature();

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
      const tempData = await readFile(this.configService.ui.temp, 'utf-8');
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
  public async getCurrentNetworkUsage(netInterfaces?: string[]): Promise<{ net: Systeminformation.NetworkStatsData; point: number }> {
    if (!netInterfaces || !netInterfaces.length) {
      netInterfaces = [await networkInterfaceDefault()];
    }

    const net = await networkStats(netInterfaces.join(','));

    // TODO: be able to specify in the ui the unit size (i.e. bytes, megabytes, gigabytes)
    const txRxSec = (net[0].tx_sec + net[0].rx_sec) / 1024 / 1024;

    // TODO: break out the sent and received figures to two separate stacked graphs
    // (these should ideally be positive/negative mirrored line charts)
    return { net: net[0], point: txRxSec };
  }

  /**
   * Get the current dashboard layout
   */
  public async getDashboardLayout() {
    if (!this.dashboardLayout) {
      try {
        const layout = await readJson(resolve(this.configService.storagePath, '.uix-dashboard.json'));
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
  public async setDashboardLayout(layout: any) {
    writeJsonSync(resolve(this.configService.storagePath, '.uix-dashboard.json'), layout);
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
      time: time(),
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
  public async watchStats(client: any) {
    let homebridgeStatusChangeSub: Subscription;
    let homebridgeStatusInterval: NodeJS.Timeout;

    client.emit('homebridge-status', await this.getHomebridgeStats());

    // ipc status events are only available when running in service mode
    if (this.configService.serviceMode) {
      homebridgeStatusChangeSub = this.homebridgeStatusChange.subscribe(async () => {
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
    if (this.configService.serviceMode) {
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
  private async getDefaultInterface(): Promise<Systeminformation.NetworkInterfacesData> {
    const cachedResult = this.statusCache.get('defaultInterface') as Systeminformation.NetworkInterfacesData;

    if (cachedResult) {
      return cachedResult;
    }

    const defaultInterfaceName = await networkInterfaceDefault();
    // These ts-ignore should be able to be removed in the next major release of 'systeminformation' (v6)
    // See https://github.com/sebhildebrandt/systeminformation/issues/775#issuecomment-1741836906
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const defaultInterface = defaultInterfaceName ? (await networkInterfaces()).find((x) => x.iface === defaultInterfaceName) : undefined;

    if (defaultInterface) {
      this.statusCache.set('defaultInterface', defaultInterface);
    }

    return defaultInterface;
  }

  /**
   * Get / Cache the OS Information
   */
  private async getOsInfo(): Promise<Systeminformation.OsData> {
    const cachedResult = this.statusCache.get('osInfo') as Systeminformation.OsData;

    if (cachedResult) {
      return cachedResult;
    }

    const osInformation = await osInfo();

    this.statusCache.set('osInfo', osInformation, 86400);
    return osInformation;
  }

  /**
   * Get / Cache the GLIBC version
   */
  private getGlibcVersion(): string {
    if (platform() !== 'linux') {
      return '';
    }

    const cachedResult = this.statusCache.get('glibcVersion') as string;
    if (cachedResult) {
      return cachedResult;
    }

    try {
      const glibcVersion = execSync('getconf GNU_LIBC_VERSION 2>/dev/null').toString().split('glibc')[1].trim();
      this.statusCache.set('glibcVersion', glibcVersion, 86400);
      return glibcVersion;
    } catch (e) {
      this.logger.debug('Could not check glibc version:', e.message);
      return '';
    }
  }

  /**
   * Returns details about this Homebridge server
   */
  public async getHomebridgeServerInfo() {
    return {
      serviceUser: userInfo().username,
      homebridgeConfigJsonPath: this.configService.configPath,
      homebridgeStoragePath: this.configService.storagePath,
      homebridgeInsecureMode: this.configService.homebridgeInsecureMode,
      homebridgeCustomPluginPath: this.configService.customPluginPath,
      homebridgePluginPath: resolve(process.env.UIX_BASE_PATH, '..'),
      homebridgeRunningInDocker: this.configService.runningInDocker,
      homebridgeRunningInSynologyPackage: this.configService.runningInSynologyPackage,
      homebridgeRunningInPackageMode: this.configService.runningInPackageMode,
      homebridgeServiceMode: this.configService.serviceMode,
      nodeVersion: process.version,
      os: await this.getOsInfo(),
      glibcVersion: this.getGlibcVersion(),
      time: time(),
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

      // Get the newest v18 and v20 in the list
      const latest18 = versionList.filter((x: { version: string }) => x.version.startsWith('v18'))[0];
      const latest20 = versionList.filter((x: { version: string }) => x.version.startsWith('v20'))[0];
      const latest22 = versionList.filter((x: { version: string }) => x.version.startsWith('v22'))[0];

      let updateAvailable = false;
      let latestVersion = process.version;
      let showNodeUnsupportedWarning = false;
      let showGlibcUnsupportedWarning = false;

      /**
       * NodeJS Version - Minimum GLIBC Version
       *
       *      18            2.28
       *      20            2.31
       */

      // Behaviour depends on the installed version of node
      switch (process.version.split('.')[0]) {
        case 'v18': {
          // Currently using v18, but v20 is available
          // If the user is running linux, then check their glibc version
          //   If they are running glibc 2.31 or higher, then show the option to update to v20
          //   Otherwise we would still want to see if there is a minor/patch update available for v18
          // Otherwise, already show the option for updating to node 20
          if (platform() === 'linux') {
            const glibcVersion = this.getGlibcVersion();
            if (glibcVersion) {
              if (parseFloat(glibcVersion) >= 2.31) {
                // glibc version is high enough to support v20
                updateAvailable = true;
                latestVersion = latest20.version;
              } else {
                // glibc version is too low to support v20
                // Check if there is a new minor/patch version available
                if (gt(latest18.version, process.version)) {
                  updateAvailable = true;
                  latestVersion = latest18.version;
                }

                // Show the user a warning about the glibc version for upcoming end-of-life Node 18
                if (parseFloat(glibcVersion) < 2.31) {
                  showGlibcUnsupportedWarning = true;
                }
              }
            }
          } else {
            // Not running linux, so show the option for updating to node 20
            updateAvailable = true;
            latestVersion = latest20.version;
          }
          break;
        }
        case 'v20': {
          // Currently using v20
          // Check if there is a new minor/patch version available
          if (gt(latest20.version, process.version)) {
            updateAvailable = true;
            latestVersion = latest20.version;
          }
          break;
        }
        case 'v22': {
          // Currently using v22
          // Check if there is a new minor/patch version available
          if (gt(latest22.version, process.version)) {
            updateAvailable = true;
            latestVersion = latest22.version;
          }
          break;
        }
        default: {
          // Using an unsupported version of node
          showNodeUnsupportedWarning = true;
        }
      }

      const versionInformation = {
        currentVersion: process.version,
        latestVersion,
        updateAvailable,
        showNodeUnsupportedWarning,
        showGlibcUnsupportedWarning,
        installPath: dirname(process.execPath),
      };
      this.statusCache.set('nodeJsVersion', versionInformation, 86400);
      return versionInformation;
    } catch (e) {
      this.logger.log('Failed to check for Node.js version updates - check your internet connection.');
      const versionInformation = {
        currentVersion: process.version,
        latestVersion: process.version,
        updateAvailable: false,
        showNodeUnsupportedWarning: false,
        showGlibcUnsupportedWarning: false,
      };
      this.statusCache.set('nodeJsVersion', versionInformation, 3600);
      return versionInformation;
    }
  }

  /**
   * Returns information about the current state of the Raspberry Pi
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
          output[this.rpiGetThrottledMapping[bit]] = !!((throttledHex >> parseInt(bit, 10)) & 1);
        }
      }
    } catch (e) {
      this.logger.debug('Could not check vcgencmd get_throttled:', e.message);
    }

    return output;
  }
}
