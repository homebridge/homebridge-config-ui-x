import type { ServiceType } from '@homebridge/hap-client'

import type { SmartAutomationAccessoryController, SmartAutomationRulesEngine, SmartLightGroupConfig } from '../smart-automation.interfaces.js'

interface SavedLightState {
  uniqueId: string
  characteristics: Array<{
    type: string
    value: string | number | boolean
  }>
}

export class SmartLightGroupRulesEngine implements SmartAutomationRulesEngine {
  private savedState: SavedLightState[] | null = null

  constructor(
    private readonly config: SmartLightGroupConfig,
    private readonly accessories: SmartAutomationAccessoryController,
    private readonly log: any,
  ) {}

  public async setOn(value: boolean): Promise<void> {
    const lights = await this.getLights()
    this.log.debug(`${this.config.name}: processing ${value ? 'On' : 'Off'} for ${lights.length} resolved light${lights.length === 1 ? '' : 's'}.`)
    await (value ? this.turnOn(lights) : this.turnOff(lights))
  }

  public async setCharacteristic(type: string, value: string | number | boolean): Promise<void> {
    if (this.savedState === null) {
      this.log.debug(`${this.config.name}: ignoring ${type}=${String(value)} because the trigger light is off.`)
      return
    }

    const lights = await this.getLights()
    this.log.debug(`${this.config.name}: passing through ${type}=${String(value)} to ${lights.length} resolved light${lights.length === 1 ? '' : 's'}.`)
    await this.writeCharacteristicStates(lights, type, () => value, `set ${type}`)
  }

  private async getLights(): Promise<ServiceType[]> {
    const uniqueIds = new Set(this.config.uniqueIds)
    const services = await this.accessories.getServices()
    const lights = services
      .filter(service => service.type === 'Lightbulb' && uniqueIds.has(service.uniqueId))
    const resolvedIds = new Set(lights.map(light => light.uniqueId))

    this.log.debug(`${this.config.name}: resolving configured lights [${this.config.uniqueIds.join(', ')}] against ${services.length} discovered services.`)
    lights.forEach((light) => {
      this.log.debug(`${this.config.name}: resolved light ${light.uniqueId} (${light.serviceName || 'unnamed'}) with ${light.serviceCharacteristics.length} characteristics.`)
    })
    this.config.uniqueIds
      .filter(uniqueId => !resolvedIds.has(uniqueId))
      .forEach(uniqueId => this.log.warn(`${this.config.name}: configured light ${uniqueId} was not found.`))

    if (!lights.length) {
      this.log.warn(`${this.config.name}: no configured lights were found.`)
    }
    return lights
  }

  private async turnOn(lights: ServiceType[]): Promise<void> {
    if (this.savedState === null) {
      this.savedState = lights.flatMap((light) => {
        const characteristics = light.serviceCharacteristics
          .filter(characteristic => characteristic.canWrite && characteristic.value !== undefined)
          .map(characteristic => ({
            type: characteristic.type,
            value: characteristic.value as string | number | boolean,
          }))

        characteristics.forEach((characteristic) => {
          this.log.debug(`${this.config.name}: captured ${light.uniqueId}.${characteristic.type}=${String(characteristic.value)}.`)
        })

        return characteristics.length === 0
          ? []
          : [{ uniqueId: light.uniqueId, characteristics }]
      })
      const characteristicCount = this.savedState.reduce((count, state) => count + state.characteristics.length, 0)
      this.log.info(`${this.config.name}: saved ${characteristicCount} writable characteristics across ${this.savedState.length} light${this.savedState.length === 1 ? '' : 's'}.`)
    } else {
      this.log.debug(`${this.config.name}: repeated On received; keeping the original saved state (${this.savedState.length} lights).`)
    }
    await this.writeLightStates(lights, () => true, 'turn on')
    this.log.info(`${this.config.name}: light group is on.`)
  }

  private async turnOff(lights: ServiceType[]): Promise<void> {
    const savedState = this.savedState
    this.savedState = null

    if (!savedState) {
      this.log.info(`${this.config.name}: no saved state; turning the light group off.`)
      await this.writeLightStates(lights, () => false, 'turn off')
      return
    }

    await this.restoreLightStates(lights, savedState)
    this.log.info(`${this.config.name}: restored and cleared the saved light state.`)
  }

  private async restoreLightStates(lights: ServiceType[], savedState: SavedLightState[]): Promise<void> {
    const lightsById = new Map(lights.map(light => [light.uniqueId, light]))

    for (const state of savedState) {
      const light = lightsById.get(state.uniqueId)
      if (!light) {
        this.log.warn(`${this.config.name}: could not find ${state.uniqueId} while restoring state.`)
        continue
      }

      const characteristics = [...state.characteristics].sort((first, second) => {
        if (first.type === 'On') {
          return 1
        }
        if (second.type === 'On') {
          return -1
        }
        return 0
      })

      for (const stateCharacteristic of characteristics) {
        const characteristic = light.getCharacteristic(stateCharacteristic.type)
        if (!characteristic?.canWrite) {
          this.log.warn(`${this.config.name}: ${state.uniqueId} no longer has a writable ${stateCharacteristic.type} characteristic.`)
          continue
        }

        try {
          this.log.debug(`${this.config.name}: restore ${state.uniqueId}.${stateCharacteristic.type}: ${String(characteristic.value)} -> ${String(stateCharacteristic.value)}.`)
          await characteristic.setValue(stateCharacteristic.value)
        } catch (error) {
          this.log.warn(`${this.config.name}: failed to restore ${stateCharacteristic.type} for ${state.uniqueId}: ${error?.message || error}`)
        }
      }
    }
  }

  private async writeLightStates(
    lights: ServiceType[],
    getValue: (light: ServiceType) => boolean,
    operation: string,
  ): Promise<void> {
    await this.writeCharacteristicStates(lights, 'On', getValue, operation)
  }

  private async writeCharacteristicStates(
    lights: ServiceType[],
    type: string,
    getValue: (light: ServiceType) => string | number | boolean,
    operation: string,
  ): Promise<void> {
    for (const light of lights) {
      const characteristic = light.getCharacteristic(type)
      if (!characteristic?.canWrite) {
        this.log.warn(`${this.config.name}: ${light.uniqueId} has no writable ${type} characteristic.`)
        continue
      }

      try {
        const value = getValue(light)
        this.log.debug(`${this.config.name}: ${operation} ${light.uniqueId}.${type}: ${String(characteristic.value)} -> ${String(value)}.`)
        await characteristic.setValue(value)
      } catch (error) {
        this.log.warn(`${this.config.name}: failed to ${operation} ${light.uniqueId}: ${error?.message || error}`)
      }
    }
  }
}
