/* global NodeJS */
/* eslint-disable no-console */

import type { WriteStream } from 'node:fs'

import ora from 'ora'

/**
 * The parts of HomebridgeServiceHelper the logger reads. Kept as an interface
 * so the logger can be tested without importing (and so executing) hb-service.
 */
export interface LoggerHost {
  action: string
  logFile?: WriteStream | NodeJS.WriteStream
}

export class Logger {
  // Read `action` and `logFile` from the service helper at write time —
  // `logFile` is not assigned until `startLog()` runs, which happens after
  // the first log calls in the `run` path, so it must not be snapshotted here.
  constructor(
    private readonly hbService: LoggerHost,
  ) {}

  log(msg: string) {
    this._log(msg, 'info')
  }

  success(msg: string) {
    this._log(msg, 'success')
  }

  error(msg: string) {
    this._log(msg, 'error')
  }

  warn(msg: string) {
    this._log(msg, 'warn')
  }

  debug(msg: string) {
    this._log(msg, 'debug')
  }

  verbose(msg: string) {
    this._log(msg, 'verbose')
  }

  private _log(msg: string, level: 'info' | 'success' | 'error' | 'warn' | 'debug' | 'verbose') {
    if (this.hbService.action === 'run') {
      msg = `\x1B[37m[${new Date().toLocaleString()}]\x1B[0m `
        + `\x1B[36m[HB Supervisor]\x1B[0m [${level.toUpperCase()}] ${msg}`

      if (this.hbService.logFile) {
        this.hbService.logFile.write(`${msg}\n`)
      } else {
        console.log(msg)
      }
    } else {
      let oraLevel: 'info' | 'succeed' | 'fail' | 'warn'
      switch (level) {
        case 'info':
        case 'debug':
        case 'verbose':
          oraLevel = 'info'
          break
        case 'success':
          oraLevel = 'succeed'
          break
        case 'error':
          oraLevel = 'fail'
          break
        case 'warn':
          oraLevel = 'warn'
          break
      }

      ora()[oraLevel](msg)
    }
  }
}
