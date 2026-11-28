import type { ChildProcess } from 'node:child_process'

export interface GracefulShutdownOptions {
  /** The Homebridge child process, if one is running */
  child?: Pick<ChildProcess, 'kill' | 'once' | 'exitCode' | 'signalCode'>
  /** Closes the UI (Nest app, mDNS advertisement) that runs in this process */
  closeUi?: () => Promise<void>
  /** How long Homebridge may take to stop before it is killed */
  killAfterMs?: number
  log?: (message: string) => void
}

/**
 * Stop hb-service: ask Homebridge to stop, wait until it has (killing it after `killAfterMs`), then close the UI.
 *
 * Homebridge is waited for, not left behind: the systemd unit uses `KillMode=process`, so a Homebridge that is
 * still running when hb-service exits keeps its ports, and the next start fails with EADDRINUSE. Its stdout
 * must also stay read until it ends, or its shutdown log lines are lost.
 */
export async function gracefulShutdown(options: GracefulShutdownOptions): Promise<void> {
  const { child, closeUi, killAfterMs = 7000, log = () => {} } = options

  if (child && child.exitCode === null && child.signalCode === null) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        log('Homebridge did not stop in time, sending SIGKILL...')
        try {
          child.kill('SIGKILL')
        } catch {}
        resolve()
      }, killAfterMs)
      child.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
      try {
        child.kill('SIGTERM')
      } catch {
        clearTimeout(timer)
        resolve()
      }
    })
  }

  if (closeUi) {
    try {
      await closeUi()
    } catch (e) {
      log(`Failed to close the UI cleanly: ${e?.message ?? e}`)
    }
  }
}
