import * as fs from 'fs-extra';
import * as path from 'path';
import * as bufferShim from 'buffer-shims';
import * as qr from 'qr-image';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '../../core/config/config.service';

@Injectable()
export class ServerService {
  private accessoryId = this.configService.homebridgeConfig.bridge.username.split(':').join('');
  private accessoryInfoPath = path.join(this.configService.storagePath, 'persist', `AccessoryInfo.${this.accessoryId}.json`);

  private setupCode: string;

  constructor(
    private readonly configService: ConfigService,
  ) { }

  /**
   * Returns a QR Code SVG
   */
  public async generateQrCode() {
    const setupCode = await this.getSetupCode();

    if (!setupCode) {
      throw new NotFoundException();
    }

    const qrImg = qr.svgObject(setupCode, { type: 'svg' });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23"><path d="${qrImg.path}"/></svg>`;
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
