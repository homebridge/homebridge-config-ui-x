import type { ServiceType } from '@homebridge/hap-client'

import type { HumidityControlConfig, SmartAutomationAccessoryController, SmartAutomationMonitor } from '../smart-automation.interfaces.js'

interface TargetControl {
  characteristic: ReturnType<ServiceType['getCharacteristic']>
  offValue: string | number | boolean
  onValue: string | number | boolean
}

export function clampHumidity(value: unknown, fallback: number): number {
  const humidity = Number(value)
  return Number.isFinite(humidity) ? Math.min(Math.max(Math.round(humidity), 0), 100) : fallback
}

export function currentHumidity(service: ServiceType): number | undefined {
  const rawValue = service.serviceCharacteristics.find(characteristic => characteristic.type === 'CurrentRelativeHumidity')?.value
  if (rawValue === null || rawValue === undefined) {
    return undefined
  }
  const value = Number(rawValue)
  return Number.isFinite(value) ? value : undefined
}

function targetControl(service: ServiceType): TargetControl | undefined {
  const controls = service.type === 'Thermostat'
    ? [{ type: 'TargetHeatingCoolingState', onValue: 2, offValue: 0 }]
    : [
        { type: 'Active', onValue: 1, offValue: 0 },
        { type: 'On', onValue: true, offValue: false },
      ]

  for (const control of controls) {
    const characteristic = service.getCharacteristic(control.type)
    if (characteristic?.canWrite) {
      return { characteristic, onValue: control.onValue, offValue: control.offValue }
    }
  }
  return undefined
}

export class HumidityControlRulesEngine implements SmartAutomationMonitor<boolean> {
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly config: HumidityControlConfig,
    private readonly accessories: SmartAutomationAccessoryController,
    private readonly log: any,
  ) {}

  public start(_publish: (value: boolean) => void): void {
    this.log.info(`${this.config.name}: turning the target on above ${this.config.onHumidity}% and off below ${this.config.offHumidity}%.`)
    this.unsubscribe = this.accessories.onServicesChanged?.((changedUniqueIds) => {
      if (changedUniqueIds.has(this.config.uniqueIds[0]) || changedUniqueIds.has(this.config.targetUniqueId)) {
        void this.tick()
      }
    }) || null
    void this.tick()
  }

  public stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  public async tick(): Promise<void> {
    try {
      const services = await this.accessories.getServices()
      const sensor = services.find(service => service.uniqueId === this.config.uniqueIds[0])
      const target = services.find(service => service.uniqueId === this.config.targetUniqueId)
      if (!sensor || !target) {
        this.log.warn(`${this.config.name}: ${!sensor ? 'humidity sensor' : 'control target'} was not found.`)
        return
      }

      const humidity = currentHumidity(sensor)
      if (humidity === undefined) {
        this.log.warn(`${this.config.name}: ${sensor.serviceName || sensor.uniqueId} does not currently report humidity.`)
        return
      }

      const desired = humidity > this.config.onHumidity
        ? true
        : humidity < this.config.offHumidity
          ? false
          : undefined
      this.log.debug(`${this.config.name}: humidity=${humidity}%, offBelow=${this.config.offHumidity}%, onAbove=${this.config.onHumidity}%, action=${desired === undefined ? 'hold' : desired ? 'on' : 'off'}.`)
      if (desired === undefined) {
        return
      }

      const control = targetControl(target)
      if (!control) {
        this.log.warn(`${this.config.name}: ${target.serviceName || target.uniqueId} has no supported writable control characteristic.`)
        return
      }

      const value = desired ? control.onValue : control.offValue
      if (control.characteristic.value === value) {
        return
      }

      this.log.info(`${this.config.name}: humidity is ${humidity}%; turning ${target.serviceName || target.uniqueId} ${desired ? 'on' : 'off'}.`)
      await control.characteristic.setValue(value)
    } catch (error: any) {
      this.log.warn(`${this.config.name}: could not apply humidity control: ${error?.message || error}`)
    }
  }
}
