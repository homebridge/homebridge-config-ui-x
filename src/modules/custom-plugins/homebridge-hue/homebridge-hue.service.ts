import { createReadStream } from 'node:fs'
import { resolve } from 'node:path'

import { Inject, Injectable, NotFoundException, StreamableFile } from '@nestjs/common'
import { pathExists } from 'fs-extra/esm'

import { ConfigService } from '../../../core/config/config.service.js'

@Injectable()
export class HomebridgeHueService {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async streamDumpFile(): Promise<StreamableFile> {
    const dumpPath = resolve(this.configService.storagePath, 'homebridge-hue.json.gz')

    // Check file exists
    if (!await pathExists(dumpPath)) {
      throw new NotFoundException()
    }

    // Stream file to client
    return new StreamableFile(createReadStream(dumpPath))
  }
}
