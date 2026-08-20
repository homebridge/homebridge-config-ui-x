import type { ServiceType } from '@homebridge/hap-client'

import type { SmartAutomationAccessoryController, SmartAutomationRulesEngine, SmartLightGroupConfig } from '../smart-automation.interfaces.js'

interface SavedLightState {
  uniqueId: string
  on: boolean
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
    await (value ? this.turnOn(lights) : this.turnOff(lights))
  }

  private async getLights(): Promise<ServiceType[]> {
    const uniqueIds = new Set(this.config.uniqueIds)
    const lights = (await this.accessories.getServices())
      .filter(service => service.type === 'Lightbulb' && uniqueIds.has(service.uniqueId))

    if (!lights.length) {
      this.log.warn(`[Smart Automation] ${this.config.name}: no configured lights were found.`)
    }
    return lights
  }

  private async turnOn(lights: ServiceType[]): Promise<void> {
    if (this.savedState === null) {
      this.savedState = lights.flatMap((light) => {
        const characteristic = light.getCharacteristic('On')
        return characteristic?.value === undefined
          ? []
          : [{ uniqueId: light.uniqueId, on: Boolean(characteristic.value) }]
      })
    }
    await this.writeLightStates(lights, () => true, 'turn on')
  }

  private async turnOff(lights: ServiceType[]): Promise<void> {
    const savedState = this.savedState
    this.savedState = null

    if (!savedState) {
      await this.writeLightStates(lights, () => false, 'turn off')
      return
    }

    const previousValues = new Map(savedState.map(state => [state.uniqueId, state.on]))
    await this.writeLightStates(lights, light => previousValues.get(light.uniqueId) ?? false, 'restore')
  }

  private async writeLightStates(
    lights: ServiceType[],
    getValue: (light: ServiceType) => boolean,
    operation: string,
  ): Promise<void> {
    for (const light of lights) {
      const characteristic = light.getCharacteristic('On')
      if (!characteristic?.canWrite) {
        this.log.warn(`[Smart Automation] ${this.config.name}: ${light.uniqueId} has no writable On characteristic.`)
        continue
      }

      try {
        await characteristic.setValue(getValue(light))
      } catch (error) {
        this.log.warn(`[Smart Automation] ${this.config.name}: failed to ${operation} ${light.uniqueId}: ${error?.message || error}`)
      }
    }
  }
}
