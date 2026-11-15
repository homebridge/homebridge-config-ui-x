import type { Job } from 'node-schedule'

import type { AccessoryConfig, HomebridgeConfig, PlatformConfig } from '../config/config.interfaces.js'

import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { cancelJob, RecurrenceRule, scheduledJobs, scheduleJob } from 'node-schedule'

import { ConfigService } from '../config/config.service.js'
import { HomebridgeIpcService } from '../homebridge-ipc/homebridge-ipc.service.js'
import { Logger } from '../logger/logger.service.js'
import { RE_COLON } from '../regex.constants.js'

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

  /**
   * The restart jobs this service made. node-schedule keeps only the newest job under a name, so cancelling by name
   * would leave an older job with the same name running.
   */
  private readonly restartJobs: Job[] = []

  onModuleInit() {
    // Initialize restart schedules on startup (async, so a failure is a rejection, not a throw)
    this.refreshRestartSchedules().catch((error: any) => {
      this.logger.warn(`Failed to initialize restart schedules: ${error.message}`)
    })
  }

  /**
   * Schedule a restart job; node-schedule answers a cron it can't read with null rather than an error
   */
  private scheduleRestart(name: string, cron: string, run: () => void): boolean {
    const job = this.scheduleJob(name, cron, run)
    if (!job) {
      // node-schedule still lists a job under the name: take it off
      this.cancelJob(name)
      return false
    }
    this.restartJobs.push(job)
    return true
  }

  /**
   * Cancel all existing restart jobs and reschedule from provided or current config
   */
  public async refreshRestartSchedules(config?: HomebridgeConfig) {
    // Cancel existing restart jobs
    for (const job of this.restartJobs.splice(0)) {
      try {
        job.cancel()
      } catch (e) { /* ignore */ }
    }

    const cfg: HomebridgeConfig = config || this.configService.homebridgeConfig

    // Global schedule (main Homebridge)
    const ui = this.configService.ui
    const mainBridgeCron = ui?.scheduledRestartCron
    if (typeof mainBridgeCron === 'string' && mainBridgeCron.trim()) {
      const name = 'restart-homebridge'
      try {
        const scheduled = this.scheduleRestart(name, mainBridgeCron, () => {
          this.logger.warn('Running scheduled restart of main Homebridge...')
          try {
            this.homebridgeIpcService.restartHomebridge()
          } catch (error: any) {
            this.logger.warn(`Scheduled restart (main) failed: ${error.message}`)
          }
        })
        if (scheduled) {
          this.logger.debug(`Scheduled main Homebridge restart with cron "${mainBridgeCron}".`)
        } else {
          this.logger.warn(`Could not schedule the main Homebridge restart: "${mainBridgeCron}" is not a valid cron.`)
        }
      } catch (error: any) {
        this.logger.warn(`Failed to schedule main Homebridge restart cron="${mainBridgeCron}": ${error.message}`)
      }
    }

    // Child bridge schedules
    const blocks: (PlatformConfig | AccessoryConfig)[] = [
      ...((cfg.platforms || []) as PlatformConfig[]),
      ...((cfg.accessories || []) as AccessoryConfig[]),
    ]

    // Several blocks can share one child bridge (`_bridge.username`): schedule each bridge once
    const scheduledBridges = new Set<string>()

    for (const block of blocks) {
      const bridge = block._bridge
      if (typeof bridge?.username === 'string' && bridge.username) {
        // Look up cron in ui.bridges array by username
        const normalizedUsername = bridge.username.toUpperCase()
        if (scheduledBridges.has(normalizedUsername)) {
          continue
        }
        const bridgeConfig = ui?.bridges?.find(b => typeof b?.username === 'string' && b.username.toUpperCase() === normalizedUsername)
        const childBridgeCron = bridgeConfig?.scheduledRestartCron

        if (typeof childBridgeCron === 'string' && childBridgeCron.trim()) {
          scheduledBridges.add(normalizedUsername)
          const deviceId = bridge.username.replace(RE_COLON, '').toUpperCase()
          const name = `restart-child-${deviceId}`
          try {
            const scheduled = this.scheduleRestart(name, childBridgeCron, () => {
              this.logger.warn(`Running scheduled restart of child bridge ${bridge.username}...`)
              try {
                this.homebridgeIpcService.sendMessage('restartChildBridge', bridge.username)
              } catch (error) {
                this.logger.warn(`Scheduled restart (child ${bridge.username}) failed: ${error.message}`)
              }
            })
            if (scheduled) {
              this.logger.debug(`Scheduled child bridge restart ${bridge.username} with cron "${childBridgeCron}".`)
            } else {
              this.logger.warn(`Could not schedule the restart of child bridge ${bridge.username}: "${childBridgeCron}" is not a valid cron.`)
            }
          } catch (error) {
            this.logger.warn(`Failed to schedule child bridge ${bridge.username} restart cron="${childBridgeCron}": ${error.message}`)
          }
        }
      }
    }
  }
}
