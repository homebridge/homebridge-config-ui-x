export interface SmartAutomationLogger {
  debug: (message: string) => void
  info: (message: string) => void
  warn: (message: string) => void
}

export function createSmartAutomationLogger(log: any, debugEnabled: boolean): SmartAutomationLogger {
  return {
    debug: (message: string) => {
      if (debugEnabled) {
        log.info(`[DEBUG] ${message}`)
      } else {
        log.debug(message)
      }
    },
    info: (message: string) => log.info(message),
    warn: (message: string) => log.warn(message),
  }
}
