import { resolve } from 'node:path'

import { Injectable, NotFoundException, StreamableFile } from '@nestjs/common'
import { createReadStream, pathExists } from 'fs-extra'

import { ConfigService } from '../../../core/config/config.service'

@Injectable()
export class HomebridgeHueService {
  constructor(
    private configService: ConfigService,
  ) {}

  async streamDumpFile(): Promise<StreamableFile> {
    const dumpPath = resolve(this.configService.storagePath, 'homebridge-hue.json.gz')

    // check file exists
    if (!await pathExists(dumpPath)) {
      throw new NotFoundException()
    }

    // stream file to client
    return new StreamableFile(createReadStream(dumpPath))
  }
}
