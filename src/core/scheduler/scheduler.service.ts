import type { AccessoryConfig, HomebridgeConfig, PlatformConfig } from '../config/config.interfaces.js'

import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { cancelJob, RecurrenceRule, scheduledJobs, scheduleJob } from 'node-schedule'

import { ConfigService } from '../config/config.service.js'
import { HomebridgeIpcService } from '../homebridge-ipc/homebridge-ipc.service.js'
import { Logger } from '../logger/logger.service.js'

@Injectable()
export class SchedulerService implements OnModuleInit {
  public readonly scheduleJob = scheduleJob
  public readonly scheduledJobs = scheduledJobs
  public readonly cancelJob = cancelJob
  public readonly RecurrenceRule = RecurrenceRule

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(HomebridgeIpcService) private readonly homebridgeIpcService: HomebridgeIpcService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  onModuleInit() {
    // Initialize restart schedules on startup
    try {
      void this.refreshRestartSchedules()
    } catch (error: any) {
      this.logger.warn(`Failed to initialize restart schedules: ${error.message}`)
    }
  }

  /**
   * Cancel all existing restart jobs and reschedule from provided or current config
   */
  public async refreshRestartSchedules(config?: HomebridgeConfig) {
    // Cancel existing restart jobs
    Object.keys(this.scheduledJobs)
      .filter(name => name.startsWith('restart-homebridge') || name.startsWith('restart-child-'))
      .forEach((name) => {
        try {
          this.cancelJob(name)
        } catch (e) { /* ignore */ }
      })

    const cfg: HomebridgeConfig = config || this.configService.homebridgeConfig

    // Global schedule (main Homebridge)
    const ui = this.configService.ui
    const mainBridgeCron = ui?.scheduledRestartCron
    if (mainBridgeCron && mainBridgeCron.trim()) {
      const name = 'restart-homebridge'
      try {
        this.scheduleJob(name, mainBridgeCron, () => {
          this.logger.warn('Running scheduled restart of main Homebridge...')
          try {
            this.homebridgeIpcService.restartHomebridge()
          } catch (error: any) {
            this.logger.warn(`Scheduled restart (main) failed: ${error.message}`)
          }
        })
        this.logger.debug(`Scheduled main Homebridge restart with cron "${mainBridgeCron}".`)
      } catch (error: any) {
        this.logger.warn(`Failed to schedule main Homebridge restart cron="${mainBridgeCron}": ${error.message}`)
      }
    }

    // Child bridge schedules
    const blocks: (PlatformConfig | AccessoryConfig)[] = [
      ...((cfg.platforms || []) as PlatformConfig[]),
      ...((cfg.accessories || []) as AccessoryConfig[]),
    ]

    for (const block of blocks) {
      const bridge = block._bridge
      if (bridge?.username) {
        // Look up cron in ui.bridges array by username
        const normalizedUsername = bridge.username.toUpperCase()
        const bridgeConfig = ui.bridges?.find(b => b.username.toUpperCase() === normalizedUsername)
        const childBridgeCron = bridgeConfig?.scheduledRestartCron

        if (childBridgeCron && childBridgeCron.trim()) {
          const deviceId = bridge.username.replace(/:/g, '').toUpperCase()
          const name = `restart-child-${deviceId}`
          try {
            this.scheduleJob(name, childBridgeCron, () => {
              this.logger.warn(`Running scheduled restart of child bridge ${bridge.username}...`)
              try {
                this.homebridgeIpcService.sendMessage('restartChildBridge', bridge.username)
              } catch (error) {
                this.logger.warn(`Scheduled restart (child ${bridge.username}) failed: ${error.message}`)
              }
            })
            this.logger.debug(`Scheduled child bridge restart ${bridge.username} with cron "${childBridgeCron}".`)
          } catch (error) {
            this.logger.warn(`Failed to schedule child bridge ${bridge.username} restart cron="${childBridgeCron}": ${error.message}`)
          }
        }
      }
    }
  }
}
