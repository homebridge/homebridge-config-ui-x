import type { ConsoleLoggerOptions } from '@nestjs/common'

import process from 'node:process'

import { ConsoleLogger, Injectable, Optional } from '@nestjs/common'
import { cyan, green, red, white, yellow } from 'bash-color'

@Injectable()
export class Logger extends ConsoleLogger {
  private pluginName = ('Homebridge UI')
  private useTimestamps = (process.env.UIX_LOG_NO_TIMESTAMPS !== '1')

  // Nest 12 reads @Optional() constructor markers with getOwnMetadata, so
  // they no longer inherit from a parent class - without a constructor of
  // its own, this class inherits ConsoleLogger's two constructor params as
  // REQUIRED deps and every module holding a Logger fails to bootstrap.
  // Redeclaring the params with our own @Optional() markers fixes that in
  // every transform: the decorators run at runtime, so this works under
  // tsx (which emits no design:paramtypes) as well as tsc and swc.
  constructor(@Optional() context?: string, @Optional() options?: ConsoleLoggerOptions) {
    super(context, options)
  }

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
