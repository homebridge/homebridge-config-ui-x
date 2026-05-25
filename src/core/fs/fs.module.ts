import { Module } from '@nestjs/common'

import { JsonFileStoreService } from './json-file-store.service.js'

@Module({
  providers: [JsonFileStoreService],
  exports: [JsonFileStoreService],
})
export class FsModule {}
