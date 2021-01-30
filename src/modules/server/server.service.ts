import * as os from 'os';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as bufferShim from 'buffer-shims';
import * as qr from 'qr-image';
import * as si from 'systeminformation';
import * as NodeCache from 'node-cache';
import * as child_process from 'child_process';
import * as tcpPortUsed from 'tcp-port-used';
import { Injectable, NotFoundException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Categories } from '@oznu/hap-client/dist/hap-types';

import { Logger } from '../../core/logger/logger.service';
import { ConfigService, HomebridgeConfig } from '../../core/config/config.service';
import { ConfigEditorService } from '../config-editor/config-editor.service';
import { AccessoriesService } from '../accessories/accessories.service';
import { HomebridgeMdnsSettingDto } from './server.dto';

@Injectable()
export class ServerService {
  private serverServiceCache = new NodeCache({ stdTTL: 300 });

  private accessoryId = this.configService.homebridgeConfig.bridge.username.split(':').join('');
  private accessoryInfoPath = path.join(this.configService.storagePath, 'persist', `AccessoryInfo.${this.accessoryId}.json`);

  private setupCode: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly configEditorService: ConfigEditorService,
    private readonly accessoriesService: AccessoriesService,
    private readonly logger: Logger,
  ) { }

  /**
   * Restart the server
   */
  public async restartServer() {
    this.logger.log('Homebridge restart request received');

    if (this.configService.serviceMode && !(await this.configService.uiRestartRequired() || await this.nodeVersionChanged())) {
      this.logger.log('UI / Bridge settings have not changed; only restarting Homebridge process');
      // emit restart request to hb-service
      process.emit('message', 'restartHomebridge', undefined);
      // reset the pool of discovered homebridge instances
      this.accessoriesService.resetInstancePool();
      return { ok: true, command: 'SIGTERM', restartingUI: false };
    }

    setTimeout(() => {
      if (this.configService.ui.restart) {
        this.logger.log(`Executing restart command: ${this.configService.ui.restart}`);
        child_process.exec(this.configService.ui.restart, (err) => {
          if (err) {
            this.logger.log('Restart command exited with an error. Failed to restart Homebridge.');
          }
        });
      } else {
        this.logger.log('No restart command defined, killing process...');
        process.kill(process.pid, 'SIGTERM');
      }
    }, 500);

    return { ok: true, command: this.configService.ui.restart, restartingUI: true };
  }

  /**
   * Resets homebridge accessory and deletes all accessory cache.
   * Preserves plugin config.
   */
  public async resetHomebridgeAccessory() {
    // restart ui on next restart
    this.configService.hbServiceUiRestartRequired = true;

    const configFile = await this.configEditorService.getConfigFile();

    // generate new random username and pin
    configFile.bridge.pin = this.configEditorService.generatePin();
    configFile.bridge.username = this.configEditorService.generateUsername();

    this.logger.warn(`Homebridge Reset: New Username: ${configFile.bridge.username}`);
    this.logger.warn(`Homebridge Reset: New Pin: ${configFile.bridge.pin}`);

    // save the config file
    await this.configEditorService.updateConfigFile(configFile);

    // remove accessories and persist directories
    await fs.remove(path.resolve(this.configService.storagePath, 'accessories'));
    await fs.remove(path.resolve(this.configService.storagePath, 'persist'));

    this.logger.log('Homebridge Reset: "persist" directory removed.');
    this.logger.log('Homebridge Reset: "accessories" directory removed.');
  }

  /**
   * Return a list of the device pairings in the homebridge persist folder
   */
  public async getDevicePairings() {
    const persistPath = path.join(this.configService.storagePath, 'persist');

    const devices = (await fs.readdir(persistPath))
      .filter(x => x.match(/AccessoryInfo\.([A-F,a-f,0-9]+)\.json/));

    return Promise.all(devices.map(async (x) => {
      return await this.getDevicePairingById(x.split('.')[1]);
    }));
  }

  /**
   * Return a single device paring
   * @param deviceId 
   */
  public async getDevicePairingById(deviceId: string) {
    const persistPath = path.join(this.configService.storagePath, 'persist');

    let device;
    try {
      device = await fs.readJson(path.join(persistPath, `AccessoryInfo.${deviceId}.json`));
    } catch (e) {
      throw new NotFoundException();
    }

    device._id = deviceId;
    device._username = device._id.match(/.{1,2}/g).join(':');
    device._main = this.configService.homebridgeConfig.bridge.username.toUpperCase() === device._username.toUpperCase();
    device._isPaired = device.pairedClients && Object.keys(device.pairedClients).length > 0;
    device._setupCode = this.generateSetupCode(device);

    // filter out some properties
    delete device.signSk;
    delete device.signPk;
    delete device.configHash;
    delete device.pairedClients;
    delete device.pairedClientsPermission;

    try {
      device._category = Object.entries(Categories).find(([name, value]) => value === device.category)[0].toLowerCase();
    } catch (e) {
      device._category = 'Other';
    }

    return device;
  }

  /**
   * Remove a device pairing
   */
  public async deleteDevicePairing(id: string) {
    const persistPath = path.join(this.configService.storagePath, 'persist');

    const accessoryInfo = path.join(persistPath, 'AccessoryInfo.' + id + '.json');
    const identifierCache = path.join(persistPath, 'IdentifierCache.' + id + '.json');

    if (await fs.pathExists(accessoryInfo)) {
      await fs.unlink(accessoryInfo);
      this.logger.warn(`Removed ${accessoryInfo}`);
    }

    if (await fs.pathExists(identifierCache)) {
      await fs.unlink(identifierCache);
      this.logger.warn(`Removed ${identifierCache}`);
    }

    return;
  }

  /**
   * Returns all cached accessories
   */
  public async getCachedAccessories() {
    const cachedAccessoriesDir = path.join(this.configService.storagePath, 'accessories');

    const cachedAccessoryFiles = (await fs.readdir(cachedAccessoriesDir))
      .filter(x => x.match(/cachedAccessories\.([A-F,0-9]+)/) || x === 'cachedAccessories');

    const cachedAccessories = [];

    await Promise.all(cachedAccessoryFiles.map(async (x) => {
      const accessories = await fs.readJson(path.join(cachedAccessoriesDir, x));
      for (const accessory of accessories) {
        accessory.$cacheFile = x;
        cachedAccessories.push(accessory);
      }
    }));

    return cachedAccessories;
  }

  /**
   * Remove a single cached accessory
   */
  public async deleteCachedAccessory(uuid: string, cacheFile: string) {
    cacheFile = cacheFile || 'cachedAccessories';

    if (!this.configService.serviceMode) {
      this.logger.error('The reset accessories cache command is only available in service mode');
      throw new BadRequestException('This command is only available in service mode');
    }

    const cachedAccessoriesPath = path.resolve(this.configService.storagePath, 'accessories', cacheFile);

    this.logger.warn(`Sent request to hb-service to remove cached accessory with UUID: ${uuid}`);

    return await new Promise((resolve, reject) => {
      process.emit('message', 'deleteSingleCachedAccessory', async () => {
        const cachedAccessories = await fs.readJson(cachedAccessoriesPath) as Array<any>;
        const accessoryIndex = cachedAccessories.findIndex(x => x.UUID === uuid);

        if (accessoryIndex > -1) {
          cachedAccessories.splice(accessoryIndex, 1);
          await fs.writeJson(cachedAccessoriesPath, cachedAccessories);
          this.logger.warn(`Removed cached accessory with UUID: ${uuid}`);
          resolve(true);
        } else {
          this.logger.error(`Cannot find cached accessory with UUID: ${uuid}`);
          reject(new NotFoundException());
        }
      });
    });
  }

  /**
   * Clears the Homebridge Accessory Cache
   */
  public async resetCachedAccessories() {
    if (!this.configService.serviceMode) {
      this.logger.error('The reset accessories cache command is only available in service mode');
      throw new BadRequestException('This command is only available in service mode');
    }

    const cachedAccessoriesDir = path.join(this.configService.storagePath, 'accessories');
    const cachedAccessoryPaths = (await fs.readdir(cachedAccessoriesDir))
      .filter(x => x.match(/cachedAccessories\.([A-F,0-9]+)/) || x === 'cachedAccessories')
      .map(x => path.resolve(cachedAccessoriesDir, x));

    const cachedAccessoriesPath = path.resolve(this.configService.storagePath, 'accessories', 'cachedAccessories');

    this.logger.warn('Sent request to clear cached accesories to hb-service');

    process.emit('message', 'clearCachedAccessories', async () => {
      try {
        this.logger.log('Clearing Cached Homebridge Accessories...');
        for (const cachedAccessoriesPath of cachedAccessoryPaths) {
          if (await fs.pathExists(cachedAccessoriesPath)) {
            await fs.unlink(cachedAccessoriesPath);
            this.logger.warn(`Removed ${cachedAccessoriesPath}`);
          }
        }
      } catch (e) {
        this.logger.error(`Failed to clear Homebridge Accessories Cache at ${cachedAccessoriesPath}`);
        console.error(e);
      }
    });

    return;
  }

  /**
   * Restart a single child bridge
   */
  public async restartChildBridge(deviceId: string) {
    if (!this.configService.serviceMode) {
      this.logger.error('The restart child bridge command is only available in service mode');
      throw new BadRequestException('This command is only available in service mode');
    }

    if (deviceId.length === 12) {
      deviceId = deviceId.match(/.{1,2}/g).join(':');
    }

    await new Promise((resolve, reject) => {
      process.emit('message', 'getHomebridgeChildProcess', (homebridge: child_process.ChildProcess) => {
        if (homebridge && homebridge.connected) {
          homebridge.send({ id: 'restartChildBridge', data: deviceId.toUpperCase() });
          resolve(true);
        } else {
          reject(new ServiceUnavailableException('The Homebridge Service Is Unavailable'));
        }
      });
    });

    // reset the pool of discovered homebridge instances
    this.accessoriesService.resetInstancePool();

    return {
      ok: true
    };
  }

  /**
   * Returns a QR Code SVG
   */
  public async generateQrCode() {
    const setupCode = await this.getSetupCode();

    if (!setupCode) {
      throw new NotFoundException();
    }

    return qr.image(setupCode, { type: 'svg' });
  }

  /**
   * Returns existing setup code if cached, or requests one
   */
  private async getSetupCode() {
    if (this.setupCode) {
      return this.setupCode;
    } else {
      if (!await fs.pathExists(this.accessoryInfoPath)) {
        return null;
      }

      const accessoryInfo = await fs.readJson(this.accessoryInfoPath);
      this.setupCode = this.generateSetupCode(accessoryInfo);
      return this.setupCode;
    }
  }

  /**
   * Generates the setup code
   */
  private generateSetupCode(accessoryInfo): string {
    // this code is from https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/Accessory.js#L369
    const buffer = bufferShim.alloc(8);
    const setupCode = parseInt(accessoryInfo.pincode.replace(/-/g, ''), 10);
    let valueLow = setupCode;
    const valueHigh = accessoryInfo.category >> 1;

    valueLow |= 1 << 28; // Supports IP;

    buffer.writeUInt32BE(valueLow, 4);

    if (accessoryInfo.category & 1) {
      buffer[4] = buffer[4] | 1 << 7;
    }

    buffer.writeUInt32BE(valueHigh, 0);

    let encodedPayload = (buffer.readUInt32BE(4) + (buffer.readUInt32BE(0) * Math.pow(2, 32))).toString(36).toUpperCase();

    if (encodedPayload.length !== 9) {
      for (let i = 0; i <= 9 - encodedPayload.length; i++) {
        encodedPayload = '0' + encodedPayload;
      }
    }

    return 'X-HM://' + encodedPayload + accessoryInfo.setupID;
  }

  /**
   * Return the current pairing information for the main bridge
   */
  public async getBridgePairingInformation() {
    if (!await fs.pathExists(this.accessoryInfoPath)) {
      return new ServiceUnavailableException('Pairing Information Not Available Yet');
    }

    const accessoryInfo = await fs.readJson(this.accessoryInfoPath);

    return {
      displayName: accessoryInfo.displayName,
      pincode: accessoryInfo.pincode,
      setupCode: await this.getSetupCode(),
      isPaired: accessoryInfo.pairedClients && Object.keys(accessoryInfo.pairedClients).length > 0,
    };
  }

  /**
   * Returns a list of network adapters on the current host
   */
  public async getSystemNetworkInterfaces(): Promise<si.Systeminformation.NetworkInterfacesData[]> {
    const fromCache: si.Systeminformation.NetworkInterfacesData[] = this.serverServiceCache.get('network-interfaces');

    const networkInterfaces = fromCache || (await si.networkInterfaces()).filter((adapter) => {
      return !adapter.internal
        && adapter.mac
        && (adapter.ip4 || (adapter.ip6 && adapter.ip6subnet !== 'ffff:ffff:ffff:ffff::'))
        && (adapter.operstate === 'up' || os.platform() === 'freebsd');
    });

    if (!fromCache) {
      this.serverServiceCache.set('network-interfaces', networkInterfaces);
    }

    return networkInterfaces;
  }

  /**
   * Returns a list of network adapters the bridge is currently configured to listen on
   */
  public async getHomebridgeNetworkInterfaces() {
    const config = await this.configEditorService.getConfigFile();

    if (!config.bridge?.bind) {
      return [];
    }

    if (Array.isArray(config.bridge?.bind)) {
      return config.bridge.bind;
    }

    if (typeof config.bridge?.bind === 'string') {
      return [config.bridge.bind];
    }

    return [];
  }

  /**
   * Return the current setting for the config.mdns.legacyAdvertiser value
   */
  public async getHomebridgeMdnsSetting(): Promise<HomebridgeMdnsSettingDto> {
    const config = await this.configEditorService.getConfigFile();

    if (config.mdns?.legacyAdvertiser === undefined) {
      return { legacyAdvertiser: true };
    } else {
      return { legacyAdvertiser: config.mdns.legacyAdvertiser };
    }
  }

  /**
   * Return the current setting for the config.mdns.legacyAdvertiser value
   */
  public async setHomebridgeMdnsSetting(setting: HomebridgeMdnsSettingDto) {
    const config = await this.configEditorService.getConfigFile();

    if (config.mdns !== 'object') {
      config.mdns = {};
    }

    config.mdns.legacyAdvertiser = setting.legacyAdvertiser;

    await this.configEditorService.updateConfigFile(config);

    return;
  }

  /**
   * Set the bridge interfaces
   */
  public async setHomebridgeNetworkInterfaces(adapters: string[]) {
    const config = await this.configEditorService.getConfigFile();

    if (!config.bridge) {
      config.bridge = {} as HomebridgeConfig['bridge'];
    }

    if (!adapters.length) {
      delete config.bridge.bind;
    } else {
      config.bridge.bind = adapters;
    }

    await this.configEditorService.updateConfigFile(config);

    return;
  }

  /**
   * Generate a random, unused port and return it
   */
  public async lookupUnusedPort() {
    const randomPort = () => Math.floor(Math.random() * (60000 - 30000 + 1) + 30000);

    let port = randomPort();
    while (await tcpPortUsed.check(port)) {
      port = randomPort();
    }

    return { port };
  }

  /**
   * Check if the system Node.js version has changed
   */
  private async nodeVersionChanged(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let result = false;

      const child = child_process.spawn(process.execPath, ['-v']);

      child.stdout.once('data', (data) => {
        if (data.toString().trim() === process.version) {
          result = false;
        } else {
          result = true;
        }
      });

      child.on('error', () => {
        result = true;
      });

      child.on('close', () => {
        return resolve(result);
      });
    });
  }
}
