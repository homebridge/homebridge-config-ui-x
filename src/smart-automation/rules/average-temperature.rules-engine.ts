import type { ServiceType } from '@homebridge/hap-client'

import type { AverageTemperatureConfig, SmartAutomationAccessoryController, SmartAutomationMonitor } from '../smart-automation.interfaces.js'

import { clampMinutes } from './door-ajar.rules-engine.js'

function numericTemperature(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  const temperature = Number(value)
  return Number.isFinite(temperature) ? temperature : undefined
}

function currentTemperature(service: ServiceType): number | undefined {
  return numericTemperature(service.serviceCharacteristics.find(characteristic => characteristic.type === 'CurrentTemperature')?.value)
}

export function averageTemperature(services: ServiceType[]): number | undefined {
  const values = services
    .map(currentTemperature)
    .filter((value): value is number => value !== undefined)

  if (!values.length) {
    return undefined
  }

  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10
}

export class AverageTemperatureRulesEngine implements SmartAutomationMonitor<number> {
  private publish: ((value: number) => void) | null = null
  private unsubscribe: (() => void) | null = null
  private readonly lastUpdatedAt = new Map<string, number>()

  constructor(
    private readonly config: AverageTemperatureConfig,
    private readonly accessories: SmartAutomationAccessoryController,
    private readonly log: any,
    private readonly now: () => number = () => Date.now(),
  ) {}

  public start(publish: (value: number) => void): void {
    this.publish = publish
    this.log.info(`${this.config.name}: averaging ${this.config.uniqueIds.length} temperature sensor${this.config.uniqueIds.length === 1 ? '' : 's'} and removing sensors after ${this.removeAfterMinutes()} minutes without an update.`)
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
    this.lastUpdatedAt.clear()
  }

  public async tick(): Promise<void> {
    try {
      const configured = new Set(this.config.uniqueIds)
      const services = (await this.accessories.getServices())
        .filter(service => configured.has(service.uniqueId))
      const readings = await Promise.all(services.map(service => this.readTemperature(service)))
      const values = readings
        .map(reading => reading.value)
        .filter((value): value is number => value !== undefined)
      const value = values.length
        ? Math.round((values.reduce((total, reading) => total + reading, 0) / values.length) * 10) / 10
        : undefined

      if (value === undefined) {
        this.log.warn(`${this.config.name}: none of the selected sensors currently reports a temperature.`)
        return
      }

      const inputs = readings
        .map(reading => `${reading.name}=${reading.error ? 'error' : reading.stale ? `stale (${reading.ageMinutes} min)` : reading.value === undefined ? 'unavailable' : `${reading.value}°C`}`)
        .join(', ')
      const reportingSensors = readings.filter(reading => reading.value !== undefined).length
      this.log.debug(`${this.config.name}: inputs [${inputs}]; averaged ${reportingSensors} of ${services.length} resolved sensor${services.length === 1 ? '' : 's'} to ${value}°C.`)
      this.publish?.(value)
    } catch (error: any) {
      this.log.warn(`${this.config.name}: could not average the temperature sensors: ${error?.message || error}`)
    }
  }

  private removeAfterMinutes(): number {
    return clampMinutes(this.config.removeAfterMinutes, 30)
  }

  private async readTemperature(service: ServiceType): Promise<{
    ageMinutes: number
    error: boolean
    name: string
    stale: boolean
    value: number | undefined
  }> {
    const uniqueId = service.uniqueId || `${service.aid}.${service.iid}`
    const now = this.now()
    this.lastUpdatedAt.set(uniqueId, this.lastUpdatedAt.get(uniqueId) ?? now)

    let error = false
    let value = currentTemperature(service)
    const characteristic = service.getCharacteristic?.('CurrentTemperature')
    if (characteristic?.getValue) {
      try {
        const refreshed = await characteristic.getValue()
        const refreshedValue = numericTemperature(refreshed?.value)
        value = refreshedValue
        if (refreshedValue !== undefined) {
          this.lastUpdatedAt.set(uniqueId, now)
        }
      } catch (refreshError: any) {
        error = true
        value = undefined
        this.log.debug(`${this.config.name}: could not refresh ${service.serviceName || uniqueId}: ${refreshError?.message || refreshError}`)
      }
    }

    const ageMs = now - (this.lastUpdatedAt.get(uniqueId) ?? now)
    const stale = !error && ageMs >= this.removeAfterMinutes() * 60_000
    return {
      ageMinutes: Math.floor(ageMs / 60_000),
      error,
      name: service.serviceName || uniqueId,
      stale,
      value: stale ? undefined : value,
    }
  }
}
