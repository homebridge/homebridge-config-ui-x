import { Module } from '@nestjs/common';
import { AccessoriesService } from './accessories.service';
import { AccessoriesGateway } from './accessories.gateway';

@Module({
  providers: [AccessoriesService, AccessoriesGateway],
})
export class AccessoriesModule { }
