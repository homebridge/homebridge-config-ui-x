import process from 'node:process'

import { ConsoleLogger } from '@nestjs/common'
import { cyan, green, red, white, yellow } from 'bash-color'

export class Logger extends ConsoleLogger {
  private pluginName = ('Homebridge UI')
  private useTimestamps = (process.env.UIX_LOG_NO_TIMESTAMPS !== '1')

  private get prefix() {
    if (this.useTimestamps) {
      return white(`[${new Date().toLocaleString()}] `) + cyan(`[${this.pluginName}]`)
    } else {
      return cyan(`[${this.pluginName}]`)
    }
  }

  log(...args: any[]) {
    // eslint-disable-next-line no-console
    console.log(
      this.prefix,
      ...args,
    )
  }

  success(...args: any[]) {
    // eslint-disable-next-line no-console
    console.log(
      this.prefix,
      ...args.map(x => green(x)),
    )
  }

  error(...args: any[]) {
    console.error(
      this.prefix,
      ...args.map(x => red(x)),
    )
  }

  warn(...args: any[]) {
    console.warn(
      this.prefix,
      ...args.map(x => yellow(x)),
    )
  }

  debug(...args: any[]) {
    if (process.env.UIX_DEBUG_LOGGING === '1') {
      // eslint-disable-next-line no-console
      console.debug(
        this.prefix,
        ...args.map(x => green(x)),
      )
    }
  }

  verbose(...args: any[]) {
    // eslint-disable-next-line no-console
    console.debug(
      this.prefix,
      ...args,
    )
  }
}
