import { Module } from '@nestjs/common';
import { HomebridgeRingModule } from './homebridge-ring/homebridge-ring.module';

@Module({
  imports: [
    HomebridgeRingModule,
  ],
})
export class CustomPluginsModule { }
