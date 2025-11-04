import type { AccessoryConfig, HomebridgeConfig, PlatformConfig } from '../../core/config/config.interfaces.js'

import { Inject, Injectable, OnModuleInit } from '@nestjs/common'

import { ConfigService } from '../../core/config/config.service.js'
import { Logger } from '../../core/logger/logger.service.js'
import { SchedulerService } from '../../core/scheduler/scheduler.service.js'
import { ChildBridgesService } from '../child-bridges/child-bridges.service.js'
import { ServerService } from './server.service.js'

@Injectable()
export class RestartSchedulerService implements OnModuleInit {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(SchedulerService) private readonly scheduler: SchedulerService,
    @Inject(ServerService) private readonly serverService: ServerService,
    @Inject(ChildBridgesService) private readonly childBridgesService: ChildBridgesService,
    @Inject(Logger) private readonly logger: Logger,
  ) { }

  onModuleInit() {
    // Schedule at startup from the already-parsed config
    try {
      void this.refreshSchedules()
    } catch (e) {
      this.logger.warn(`Failed to initialize restart schedules: ${(e as Error)?.message}`)
    }
  }

  /**
   * Cancel all existing restart jobs and reschedule from provided or current config
   */
  public async refreshSchedules(config?: HomebridgeConfig) {
    // Cancel existing restart jobs
    Object.keys(this.scheduler.scheduledJobs)
      .filter(name => name.startsWith('restart-homebridge') || name.startsWith('restart-child-'))
      .forEach((name) => {
        try {
          this.scheduler.cancelJob(name)
        } catch (e) {
          // ignore
        }
      })

    const cfg: HomebridgeConfig = config || this.configService.homebridgeConfig

    // Global schedule (main Homebridge)
    const ui = this.configService.ui
    const globalSched = ui?.scheduledRestart
    if (globalSched?.enabled && typeof globalSched.cron === 'string' && globalSched.cron.trim()) {
      const name = 'restart-homebridge'
      const spec: any = globalSched.timezone
        ? { rule: globalSched.cron, tz: globalSched.timezone }
        : globalSched.cron
      try {
        this.scheduler.scheduleJob(name, spec, async () => {
          this.logger.warn('Running scheduled restart of main Homebridge...')
          try {
            await this.serverService.restartServer()
          } catch (e) {
            this.logger.warn(`Scheduled restart (main) failed: ${(e as Error)?.message}`)
          }
        })
        this.logger.debug(`Scheduled main Homebridge restart with rule "${globalSched.cron}"${globalSched.timezone ? ` (tz: ${globalSched.timezone})` : ''}.`)
      } catch (e) {
        this.logger.warn(`Failed to schedule main Homebridge restart cron="${globalSched.cron}": ${(e as Error)?.message}`)
      }
    }

    // Child bridge schedules
    const blocks: (PlatformConfig | AccessoryConfig)[] = [
      ...((cfg?.platforms || []) as PlatformConfig[]),
      ...((cfg?.accessories || []) as AccessoryConfig[]),
    ]

    for (const block of blocks) {
      const bridge = (block as any)._bridge
      if (!bridge?.username) {
        continue
      }
      const sched = bridge.scheduledRestart
      if (sched?.enabled && typeof sched.cron === 'string' && sched.cron.trim()) {
        const deviceId = bridge.username.replace(/:/g, '').toUpperCase()
        const name = `restart-child-${deviceId}`
        const spec: any = sched.timezone ? { rule: sched.cron, tz: sched.timezone } : sched.cron
        try {
          this.scheduler.scheduleJob(name, spec, async () => {
            this.logger.warn(`Running scheduled restart of child bridge ${bridge.username}...`)
            try {
              await this.childBridgesService.restartChildBridge(bridge.username)
            } catch (e) {
              this.logger.warn(`Scheduled restart (child ${bridge.username}) failed: ${(e as Error)?.message}`)
            }
          })
          this.logger.debug(`Scheduled child bridge restart ${bridge.username} with rule "${sched.cron}"${sched.timezone ? ` (tz: ${sched.timezone})` : ''}.`)
        } catch (e) {
          this.logger.warn(`Failed to schedule child bridge ${bridge.username} restart cron="${sched.cron}": ${(e as Error)?.message}`)
        }
      }
    }
  }
}
