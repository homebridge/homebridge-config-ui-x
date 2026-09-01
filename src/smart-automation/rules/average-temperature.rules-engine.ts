import type { ServiceType } from '@homebridge/hap-client'

import type { AverageTemperatureConfig, SmartAutomationAccessoryController, SmartAutomationMonitor } from '../smart-automation.interfaces.js'

export function averageTemperature(services: ServiceType[]): number | undefined {
  const values = services
    .map(service => service.serviceCharacteristics.find(characteristic => characteristic.type === 'CurrentTemperature')?.value)
    .filter(value => value !== null && value !== undefined)
    .map(Number)
    .filter(Number.isFinite)

  if (!values.length) {
    return undefined
  }

  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10
}

export class AverageTemperatureRulesEngine implements SmartAutomationMonitor<number> {
  private publish: ((value: number) => void) | null = null
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly config: AverageTemperatureConfig,
    private readonly accessories: SmartAutomationAccessoryController,
    private readonly log: any,
  ) {}

  public start(publish: (value: number) => void): void {
    this.publish = publish
    this.log.info(`${this.config.name}: averaging ${this.config.uniqueIds.length} temperature sensor${this.config.uniqueIds.length === 1 ? '' : 's'}.`)
    this.unsubscribe = this.accessories.onServicesChanged?.((changedUniqueIds) => {
      if (this.config.uniqueIds.some(uniqueId => changedUniqueIds.has(uniqueId))) {
        void this.tick()
      }
    }) || null
    void this.tick()
  }

  public stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.publish = null
  }

  public async tick(): Promise<void> {
    try {
      const configured = new Set(this.config.uniqueIds)
      const services = (await this.accessories.getServices())
        .filter(service => configured.has(service.uniqueId))
      const value = averageTemperature(services)

      if (value === undefined) {
        this.log.warn(`${this.config.name}: none of the selected sensors currently reports a temperature.`)
        return
      }

      this.log.debug(`${this.config.name}: averaged ${services.length} resolved sensor${services.length === 1 ? '' : 's'} to ${value}°C.`)
      this.publish?.(value)
    } catch (error: any) {
      this.log.warn(`${this.config.name}: could not average the temperature sensors: ${error?.message || error}`)
    }
  }
}
