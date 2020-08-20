import { Module } from '@nestjs/common';
import { HomebridgeRingModule } from './homebridge-ring/homebridge-ring.module';
import { HomebridgeHueModule } from './homebridge-hue/homebridge-hue.module';
import { HomebridgeNestCamModule } from './homebridge-nest-cam/homebridge-nest-cam.module';

@Module({
  imports: [
    HomebridgeRingModule,
    HomebridgeHueModule,
    HomebridgeNestCamModule,
  ],
  controllers: [],
  providers: [],
})
export class CustomPluginsModule { }
