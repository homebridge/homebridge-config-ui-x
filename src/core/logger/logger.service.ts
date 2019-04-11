import { LoggerService } from '@nestjs/common';
import * as color from 'bash-color';

export class Logger implements LoggerService {
  log(args) {
    console.log(
      color.white(`[${new Date().toLocaleString()}]`),
      color.cyan(`[homebridge-config-ui-x]`),
      args,
    );
  }
  error(args) {
    console.error(
      color.white(`[${new Date().toLocaleString()}]`),
      color.cyan(`[homebridge-config-ui-x]`),
      color.red(args),
    );
  }
  warn(args) {
    console.warn(
      color.white(`[${new Date().toLocaleString()}]`),
      color.cyan(`[homebridge-config-ui-x]`),
      color.yellow(args),
    );
  }
  debug(args) {
    console.debug(
      color.white(`[${new Date().toLocaleString()}]`),
      color.cyan(`[homebridge-config-ui-x]`),
      args,
    );
  }
  verbose(args) {
    console.debug(
      color.white(`[${new Date().toLocaleString()}]`),
      color.cyan(`[homebridge-config-ui-x]`),
      args,
    );
  }
}
