import { LoggerService } from '@nestjs/common';
import * as color from 'bash-color';

export class Logger implements LoggerService {
  private pluginName = (process.env.UIX_PLUGIN_NAME || 'homebridge-config-ui-x');
  private useTimestamps = (process.env.UIX_LOG_NO_TIMESTAMPS !== '1');

  private get prefix() {
    if (this.useTimestamps) {
      return color.white(`[${new Date().toLocaleString()}] `) + color.cyan(`[${this.pluginName}]`);
    } else {
      return color.cyan(`[${this.pluginName}]`);
    }
  }

  log(args) {
    console.log(
      this.prefix,
      args,
    );
  }
  error(args) {
    console.error(
      this.prefix,
      color.red(args),
    );
  }
  warn(args) {
    console.warn(
      this.prefix,
      color.yellow(args),
    );
  }
  debug(args) {
    console.debug(
      this.prefix,
      args,
    );
  }
  verbose(args) {
    console.debug(
      this.prefix,
      args,
    );
  }
}
