import { LoggerService } from '@nestjs/common';
import * as color from 'bash-color';

export class Logger implements LoggerService {
  private pluginName = ('Homebridge UI');
  private useTimestamps = (process.env.UIX_LOG_NO_TIMESTAMPS !== '1');

  private get prefix() {
    if (this.useTimestamps) {
      return color.white(`[${new Date().toLocaleString()}] `) + color.cyan(`[${this.pluginName}]`);
    } else {
      return color.cyan(`[${this.pluginName}]`);
    }
  }

  log(...args) {
    console.log(
      this.prefix,
      ...args,
    );
  }

  error(...args) {
    console.error(
      this.prefix,
      ...args.map(x => color.red(x)),
    );
  }

  warn(...args) {
    console.warn(
      this.prefix,
      ...args.map(x => color.yellow(x)),
    );
  }

  debug(...args) {
    if (process.env.UIX_DEBUG_LOGGING === '1') {
      console.debug(
        this.prefix,
        ...args.map(x => color.green(x)),
      );
    }
  }

  verbose(...args) {
    console.debug(
      this.prefix,
      ...args,
    );
  }
}
