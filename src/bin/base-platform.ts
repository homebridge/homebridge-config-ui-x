import process from 'node:process'

import type { HomebridgeServiceHelper } from './hb-service'

export class BasePlatform {
  constructor(
    public hbService: HomebridgeServiceHelper,
  ) {}

  public async install(): Promise<void> {
    this.hbService.logger('This command has not been implemented on this platform.', 'fail')
    process.exit(0)
  }

  public async uninstall(): Promise<void> {
    this.hbService.logger('This command has not been implemented on this platform.', 'fail')
    process.exit(0)
  }

  public async start(): Promise<void> {
    this.hbService.logger('This command has not been implemented on this platform.', 'fail')
    process.exit(0)
  }

  public async stop(): Promise<void> {
    this.hbService.logger('This command has not been implemented on this platform.', 'fail')
    process.exit(0)
  }

  public async restart(): Promise<void> {
    this.hbService.logger('This command has not been implemented on this platform.', 'fail')
    process.exit(0)
  }

  public async beforeStart(): Promise<void> {
    this.hbService.logger('This command has not been implemented on this platform.', 'fail')
    process.exit(0)
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  public async rebuild(all = false): Promise<void> {
    this.hbService.logger('This command has not been implemented on this platform.', 'fail')
    process.exit(0)
  }

  public async viewLogs(): Promise<void> {
    this.hbService.logger('This command has not been implemented on this platform.', 'fail')
    process.exit(0)
  }

  public async getId(): Promise<{ uid: number, gid: number }> {
    return {
      uid: 0,
      gid: 0,
    }
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  public getPidOfPort(port: number): string | null {
    return null
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  public async updateNodejs(job: { target: string, rebuild: boolean }): Promise<void> {}
}
