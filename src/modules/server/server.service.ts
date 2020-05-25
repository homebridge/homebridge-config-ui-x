import * as fs from 'fs-extra';
import * as path from 'path';
import * as bufferShim from 'buffer-shims';
import * as qr from 'qr-image';
import * as child_process from 'child_process';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Categories } from '@oznu/hap-client/dist/hap-types';

import { ConfigService } from '../../core/config/config.service';
import { Logger } from '../../core/logger/logger.service';
import { ConfigEditorService } from '../config-editor/config-editor.service';
import { AccessoriesService } from '../accessories/accessories.service';

@Injectable()
export class ServerService {
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

    if (this.configService.serviceMode && !(await this.configService.uiRestartRequired())) {
      this.logger.log('UI / Bridge settings have not changed; only restarting Homebridge process');
      // emit restart request to hb-service
      process.emit('message', 'restartHomebridge', undefined);
      // reset the pool of discovered homebridge instances
      this.accessoriesService.resetInstancePool();
      return { ok: true, command: 'SIGTERM' };
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
        this.logger.log(`No restart command defined, killing process...`);
        process.kill(process.pid, 'SIGTERM');
      }
    }, 500);

    return { ok: true, command: this.configService.ui.restart };
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

    this.logger.log(`Homebridge Reset: "persist" directory removed.`);
    this.logger.log(`Homebridge Reset: "accessories" directory removed.`);
  }


  /**
   * Return a list of the device pairings in the homebridge persist folder
   */
  public async getDevicePairings() {
    const persistPath = path.join(this.configService.storagePath, 'persist');

    const devices = (await fs.readdir(persistPath))
      .filter(x => x.match(/AccessoryInfo\.([A-F,a-f,0-9]+)\.json/));

    return Promise.all(devices.map(async (x) => {
      const device = await fs.readJson(path.join(persistPath, x));

      // filter out some properties
      delete device.signSk;
      delete device.signPk;
      delete device.configHash;
      delete device.setupID;

      device._id = x.split('.')[1];
      device._username = device._id.match(/.{1,2}/g).join(':');
      device._main = this.configService.homebridgeConfig.bridge.username.toUpperCase() === device._username.toUpperCase();

      try {
        device._category = Object.entries(Categories).find(([name, value]) => value === device.category)[0].toLowerCase();
      } catch (e) {
        device._category = 'Other';
      }

      return device;
    }));
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
   * Returns the cached accessories
   */
  public async getCachedAccessories() {
    const cachedAccessoriesFile = path.join(this.configService.storagePath, 'accessories', 'cachedAccessories');

    if (!await fs.pathExists(cachedAccessoriesFile)) {
      throw new NotFoundException();
    }

    return await fs.readJson(cachedAccessoriesFile);
  }

  /**
   * Remove a single cached accessory
   */
  public async deleteCachedAccessory(uuid: string) {
    if (!this.configService.serviceMode) {
      this.logger.error('The reset accessories cache command is only available in service mode');
      throw new BadRequestException('This command is only available in service mode');
    }

    const cachedAccessoriesPath = path.resolve(this.configService.storagePath, 'accessories', 'cachedAccessories');

    this.logger.warn(`Sent request to hb-service to remove cached accessory with UUID: ${uuid}`);

    return await new Promise((resolve, reject) => {
      process.emit('message', 'deleteSingleCachedAccessory', async () => {
        const cachedAccessories = await this.getCachedAccessories() as Array<any>;
        const accessoryIndex = cachedAccessories.findIndex(x => x.UUID === uuid);

        if (accessoryIndex > -1) {
          cachedAccessories.splice(accessoryIndex, 1);
          await fs.writeJson(cachedAccessoriesPath, cachedAccessories);
          this.logger.warn(`Removed cached accessory with UUID: ${uuid}`);
          resolve();
        } else {
          this.logger.error(`Cannot find cached accessory with UUID: ${uuid}`);
          reject();
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

    const cachedAccessoriesPath = path.resolve(this.configService.storagePath, 'accessories', 'cachedAccessories');

    this.logger.warn('Sent request to clear cached accesories to hb-service');

    process.emit('message', 'clearCachedAccessories', async () => {
      try {
        if (await fs.pathExists(cachedAccessoriesPath)) {
          this.logger.log('Clearing Cached Homebridge Accessories...');
          await fs.unlink(cachedAccessoriesPath);
          this.logger.warn(`Removed ${cachedAccessoriesPath}`);

        }
      } catch (e) {
        this.logger.error(`Failed to clear Homebridge Accessories Cache at ${cachedAccessoriesPath}`);
        console.error(e);
      }
    });

    return;
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
      this.setupCode = await this.generateSetupCode();
      return this.setupCode;
    }
  }

  /**
   * Generates the setup code
   */
  private async generateSetupCode(): Promise<string> {
    if (!await fs.pathExists(this.accessoryInfoPath)) {
      return null;
    }

    const accessoryInfo = await fs.readJson(this.accessoryInfoPath);

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
}
