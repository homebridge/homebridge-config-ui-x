import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService {
  public name = 'homebridge-config-ui-x';
  public customPluginPath: string | undefined | null;
  public temperatureFile: string;

}
