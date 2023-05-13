import * as path from 'path';
import * as fs from 'fs-extra';
import { Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service';

@Injectable()
export class HomebridgeHueService {
  constructor(
    private configService: ConfigService,
  ) { }

  async streamDumpFile(): Promise<StreamableFile> {
    const dumpPath = path.resolve(this.configService.storagePath, 'homebridge-hue.json.gz');

    // check file exists
    if (!await fs.pathExists(dumpPath)) {
      throw new NotFoundException();
    }

    // stream file to client
    return new StreamableFile(fs.createReadStream(dumpPath));
  }
}
