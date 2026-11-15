import type { HomebridgeServiceHelper } from './hb-service.js'

import process from 'node:process'

export class BasePlatform {
  constructor(
    public hbService: HomebridgeServiceHelper,
  ) {}

  public async install(): Promise<void> {
    this.hbService.logger.error('This command has not been implemented on this platform.')
    process.exit(0)
  }

  public async uninstall(): Promise<void> {
    this.hbService.logger.error('This command has not been implemented on this platform.')
    process.exit(0)
  }

  public async start(): Promise<void> {
    this.hbService.logger.error('This command has not been implemented on this platform.')
    process.exit(0)
  }

  public async stop(): Promise<void> {
    this.hbService.logger.error('This command has not been implemented on this platform.')
    process.exit(0)
  }

  public async restart(): Promise<void> {
    this.hbService.logger.error('This command has not been implemented on this platform.')
    process.exit(0)
  }

  public async beforeStart(): Promise<void> {
    this.hbService.logger.error('This command has not been implemented on this platform.')
    process.exit(0)
  }

  public async rebuild(all = false): Promise<void> {
    this.hbService.logger.error('This command has not been implemented on this platform.')
    process.exit(0)
  }

  /**
   * Show the service manager's own log first, where the platform has one (Linux: journalctl). Elsewhere there is
   * nothing to add: `hb-service view` then shows the log file, which works on every platform.
   */
  public async viewLogs(): Promise<void> {}

  public async getId(): Promise<{ uid: number, gid: number }> {
    return {
      uid: 0,
      gid: 0,
    }
  }

  public getPidOfPort(port: number): string | null {
    return null
  }

  public async updateNodejs(job: { target: string, rebuild: boolean }): Promise<void> {}

  public async updateHomebridgePackage(): Promise<void> {
    this.hbService.logger.error('This command has not been implemented on this platform.')
    process.exit(0)
  }
}
