import { Module } from '@nestjs/common';
import { HomebridgeRingModule } from './homebridge-ring/homebridge-ring.module';
import { HomebridgeHueModule } from './homebridge-hue/homebridge-hue.module';

@Module({
  imports: [
    HomebridgeRingModule,
    HomebridgeHueModule,
  ],
  controllers: [],
  providers: [],
})
export class CustomPluginsModule { }
