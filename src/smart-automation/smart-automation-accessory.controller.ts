import type { ServiceType } from '@homebridge/hap-client'

import type { SmartAutomationAccessoryController } from './smart-automation.interfaces.js'

import { readFileSync } from 'node:fs'

import { HapClient } from '@homebridge/hap-client'

const RECONCILE_MINUTES = 5
const MONITOR_RETRY_SECONDS = 5

export class HapSmartAutomationAccessoryController implements SmartAutomationAccessoryController {
  private readonly hapClient: HapClient | null
  private services: ServiceType[] = []
  private monitor: Awaited<ReturnType<HapClient['monitorCharacteristics']>> | null = null
  private startPromise: Promise<void> | null = null
  private reconcilePromise: Promise<void> | null = null
  private reconcileTimer: ReturnType<typeof setInterval> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private readonly listeners = new Set<(changedUniqueIds: ReadonlySet<string>) => void>()

  constructor(configPath: string | undefined, private readonly log: any, hapClient?: HapClient) {
    if (hapClient) {
      this.hapClient = hapClient
      return
    }
    if (!configPath) {
      this.log.warn('Could not determine the Homebridge config path.')
      this.hapClient = null
      return
    }

    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'))
      const pin = config?.bridge?.pin
      if (!pin) {
        throw new Error('The main bridge pin is missing.')
      }

      this.hapClient = new HapClient({
        pin,
        logger: this.log,
        config: config?.platforms?.find(platform => platform?.platform === 'config')?.ui?.accessoryControl || {},
      })
    } catch (error) {
      this.log.warn(`Failed to initialise accessory control: ${error?.message || error}`)
      this.hapClient = null
    }
  }

  public async start(): Promise<void> {
    if (!this.hapClient) {
      return
    }
    if (!this.startPromise) {
      const attempt = this.reconcile(true).then(() => {
        this.reconcileTimer = setInterval(
          () => void this.reconcile(true),
          RECONCILE_MINUTES * 60_000,
        )
        this.reconcileTimer.unref?.()
      }).catch((error) => {
        if (this.startPromise === attempt) {
          this.startPromise = null
        }
        throw error
      })
      this.startPromise = attempt
    }
    await this.startPromise
  }

  public stop(): void {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer)
      this.reconcileTimer = null
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.finishMonitor()
    this.hapClient?.destroy()
    this.listeners.clear()
  }

  public onServicesChanged(listener: (changedUniqueIds: ReadonlySet<string>) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public async getServices(): Promise<ServiceType[]> {
    if (!this.hapClient) {
      return []
    }
    await this.start()
    return this.services
  }

  private async reconcile(rebuildMonitor: boolean): Promise<void> {
    if (!this.hapClient) {
      return
    }
    if (this.reconcilePromise) {
      return this.reconcilePromise
    }

    const attempt = (async () => {
      const services = await this.hapClient!.getAllServices()
      this.services = services
      this.log.debug(`Accessory discovery returned ${services.length} Homebridge services.`)
      if (rebuildMonitor) {
        await this.replaceMonitor(services)
      }
      this.notify(new Set(services.map(service => service.uniqueId)))
    })().catch((error) => {
      this.log.warn(`Failed to reconcile Smart Automation accessories: ${error?.message || error}`)
      this.scheduleMonitorRetry()
    }).finally(() => {
      if (this.reconcilePromise === attempt) {
        this.reconcilePromise = null
      }
    })
    this.reconcilePromise = attempt
    await attempt
  }

  private async replaceMonitor(services: ServiceType[]): Promise<void> {
    this.finishMonitor()
    this.monitor = await this.hapClient!.monitorCharacteristics(services)
    this.monitor.on('service-update', this.onServiceUpdate)
    this.monitor.on('monitor-close', this.onMonitorClose)
    this.monitor.on('monitor-error', this.onMonitorError)
    this.monitor.on('monitor-refresh', this.onMonitorRefresh)
    this.log.debug(`Monitoring HAP Events for ${services.length} Homebridge services.`)
  }

  private finishMonitor(): void {
    if (!this.monitor) {
      return
    }
    this.monitor.removeAllListeners()
    this.monitor.finish()
    this.monitor = null
  }

  private readonly onServiceUpdate = (update: ServiceType | ServiceType[]): void => {
    const changedServices = (Array.isArray(update) ? update : [update]).filter(Boolean)
    const changedUniqueIds = new Set<string>()
    for (const changed of changedServices) {
      const index = this.services.findIndex(service => service.uniqueId === changed.uniqueId)
      if (index === -1) {
        this.services.push(changed)
      } else {
        this.services[index] = changed
      }
      changedUniqueIds.add(changed.uniqueId)
    }
    if (changedUniqueIds.size) {
      this.notify(changedUniqueIds)
    }
  }

  private readonly onMonitorClose = (instance: { username?: string }, hadError: boolean): void => {
    this.log.warn(`HAP Event monitor closed for ${instance?.username || 'an unknown bridge'}${hadError ? ' after an error' : ''}.`)
    this.scheduleMonitorRetry()
  }

  private readonly onMonitorError = (instance: { username?: string }, error: any): void => {
    this.log.warn(`HAP Event monitor error for ${instance?.username || 'an unknown bridge'}: ${error?.message || error}`)
    this.scheduleMonitorRetry()
  }

  private readonly onMonitorRefresh = (): void => {
    void this.reconcile(false)
  }

  private scheduleMonitorRetry(): void {
    if (this.retryTimer || !this.hapClient) {
      return
    }
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.reconcile(true)
    }, MONITOR_RETRY_SECONDS * 1000)
    this.retryTimer.unref?.()
  }

  private notify(changedUniqueIds: ReadonlySet<string>): void {
    for (const listener of this.listeners) {
      try {
        listener(changedUniqueIds)
      } catch (error) {
        this.log.warn(`Smart Automation update listener failed: ${error?.message || error}`)
      }
    }
  }
}
