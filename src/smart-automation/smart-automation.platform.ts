import type { ServiceType } from '@homebridge/hap-client'

import { readFileSync } from 'node:fs'

import { HapClient } from '@homebridge/hap-client'

const PLUGIN_NAME = 'homebridge-config-ui-x'
const PLATFORM_NAME = 'smart-automation'

interface SmartAutomationConfig {
  id: string
  name: string
  type: 'smart-light-group'
  uniqueIds: string[]
  restoreAfterMs?: number
  enabled?: boolean
}

export class SmartAutomationPlatform {
  private readonly Service
  private readonly Characteristic
  private readonly PlatformAccessory
  private readonly accessories = new Map<string, any>()
  private readonly smartLightGroupTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly smartLightRestoreCharacteristicOrder = [
    'Brightness',
    'Hue',
    'Saturation',
    'ColorTemperature',
    'ColorTemperatureMireds',
    'On',
  ] as const

  private hapClient: HapClient | null = null

  constructor(
    private readonly log: any,
    private readonly config: { smartAutomations?: SmartAutomationConfig[] },
    private readonly api: any,
  ) {
    this.Service = this.api.hap.Service
    this.Characteristic = this.api.hap.Characteristic
    this.PlatformAccessory = this.api.platformAccessory

    this.setupHapClient()

    this.api.on('didFinishLaunching', () => {
      void this.syncAutomationAccessories()
    })
  }

  public configureAccessory(accessory: any) {
    this.accessories.set(accessory.UUID, accessory)
  }

  private setupHapClient() {
    const configPath = this.api?.user?.configPath?.()
    if (!configPath) {
      this.log.warn('[Smart Automation] Could not determine Homebridge config path.')
      return
    }

    try {
      const hbConfig = JSON.parse(readFileSync(configPath, 'utf8'))
      const pin = hbConfig?.bridge?.pin
      if (!pin) {
        this.log.warn('[Smart Automation] Main bridge pin is missing; smart automation engine is disabled.')
        return
      }

      this.hapClient = new HapClient({
        pin,
        logger: this.log,
        config: hbConfig?.platforms?.find(platform => platform?.platform === 'config')?.ui?.accessoryControl || {},
      })
    } catch (error) {
      this.log.warn(`[Smart Automation] Failed to initialize accessory control: ${error?.message || error}`)
    }
  }

  private async syncAutomationAccessories() {
    const newAccessories: any[] = []
    const existingAccessories: any[] = []
    const desiredUuids = new Set<string>()

    for (const automation of this.getAutomations()) {
      const uuid = this.api.hap.uuid.generate(`smart-automation:${automation.id}`)
      desiredUuids.add(uuid)
      const existing = this.accessories.get(uuid)
      const accessory = existing || new this.PlatformAccessory(automation.name, uuid)

      this.configureAutomationSwitchAccessory(accessory, automation)
      this.accessories.set(uuid, accessory)

      if (existing) {
        existingAccessories.push(accessory)
      } else {
        newAccessories.push(accessory)
      }
    }

    const staleAccessories = [...this.accessories.entries()]
      .filter(([uuid]) => !desiredUuids.has(uuid))
      .map(([, accessory]) => accessory)

    staleAccessories.forEach((accessory) => {
      this.accessories.delete(accessory.UUID)
    })

    if (newAccessories.length) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, newAccessories)
    }

    if (existingAccessories.length) {
      this.api.updatePlatformAccessories(existingAccessories)
    }

    if (staleAccessories.length) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories)
    }
  }

  private configureAutomationSwitchAccessory(accessory: any, automation: SmartAutomationConfig) {
    const information = accessory.getService(this.Service.AccessoryInformation)
    information
      .setCharacteristic(this.Characteristic.Manufacturer, 'homebridge-config-ui-x')
      .setCharacteristic(this.Characteristic.Model, 'Smart Automation Switch')
      .setCharacteristic(this.Characteristic.SerialNumber, automation.id)

    accessory.context.automation = automation
    accessory.displayName = automation.name

    const switchService = accessory.getService(this.Service.Switch) || accessory.addService(this.Service.Switch)
    switchService.setCharacteristic(this.Characteristic.Name, automation.name)

    const onCharacteristic = switchService.getCharacteristic(this.Characteristic.On)
    onCharacteristic.removeAllListeners('set')
    onCharacteristic.onSet(async (value: boolean) => {
      await this.handleAutomationSwitchSet(accessory, Boolean(value))
    })

    if (!(automation.enabled ?? true)) {
      onCharacteristic.updateValue(false)
    }
  }

  private getAutomations(): SmartAutomationConfig[] {
    const smartAutomations = Array.isArray(this.config?.smartAutomations) ? this.config.smartAutomations : []
    return smartAutomations
      .filter(automation => automation?.type === 'smart-light-group' && typeof automation?.id === 'string')
      .map((automation) => {
        const uniqueIds = [...new Set(automation.uniqueIds || [])].filter(id => typeof id === 'string' && id.length > 0)
        return {
          ...automation,
          name: typeof automation.name === 'string' && automation.name.trim().length ? automation.name.trim() : 'Smart Automation',
          uniqueIds,
          restoreAfterMs: Number.isInteger(automation.restoreAfterMs) ? automation.restoreAfterMs : 30000,
          enabled: automation.enabled ?? true,
        }
      })
      .filter(automation => automation.uniqueIds.length > 0)
  }

  private async handleAutomationSwitchSet(accessory: any, isOn: boolean) {
    const automation = accessory.context?.automation as SmartAutomationConfig | undefined
    if (!automation) {
      return
    }

    const switchService = accessory.getService(this.Service.Switch)
    const onCharacteristic = switchService?.getCharacteristic(this.Characteristic.On)

    if (!isOn) {
      return
    }

    if (!(automation.enabled ?? true)) {
      onCharacteristic?.updateValue(false)
      return
    }

    try {
      await this.runSmartLightGroupAutomation(automation)
    } catch (error) {
      this.log.warn(`[Smart Automation] ${automation.name}: ${error?.message || error}`)
    } finally {
      const restoreAfterMs = Number.isInteger(automation.restoreAfterMs) && automation.restoreAfterMs > 0
        ? automation.restoreAfterMs
        : 30000
      setTimeout(() => {
        onCharacteristic?.updateValue(false)
      }, restoreAfterMs)
    }
  }

  private async loadAccessories(): Promise<ServiceType[]> {
    if (!this.hapClient) {
      return []
    }

    try {
      return await this.hapClient.getAllServices()
    } catch (error) {
      this.log.warn(`[Smart Automation] Failed to load accessories: ${error?.message || error}`)
      return []
    }
  }

  private async runSmartLightGroupAutomation(automation: SmartAutomationConfig) {
    const uniqueIds = [...new Set(automation.uniqueIds || [])].filter(x => typeof x === 'string' && x.length > 0)
    if (!uniqueIds.length) {
      return
    }

    const services = await this.loadAccessories()
    const selectedLights = services
      .filter(service => uniqueIds.includes(service.uniqueId))
      .filter(service => service.type === 'Lightbulb')

    if (!selectedLights.length) {
      this.log.warn(`[Smart Automation] ${automation.name}: no lightbulb services found.`)
      return
    }

    const snapshots = selectedLights.map((service) => {
      const writableState = service.serviceCharacteristics
        .filter(characteristic =>
          characteristic.canWrite
          && this.smartLightRestoreCharacteristicOrder.includes(characteristic.type as typeof this.smartLightRestoreCharacteristicOrder[number])
          && characteristic.value !== undefined,
        )
        .map(characteristic => ({
          type: characteristic.type,
          value: characteristic.value as string | number | boolean,
        }))

      return {
        uniqueId: service.uniqueId,
        writableState,
      }
    })

    for (const service of selectedLights) {
      const onCharacteristic = service.getCharacteristic('On')
      if (!onCharacteristic || !onCharacteristic.canWrite) {
        continue
      }

      try {
        await onCharacteristic.setValue(true)
      } catch (error) {
        this.log.warn(`[Smart Automation] ${automation.name}: failed to enable ${service.uniqueId}: ${error?.message || error}`)
      }
    }

    const restoreAfterMs = Number.isInteger(automation.restoreAfterMs) && automation.restoreAfterMs > 0
      ? automation.restoreAfterMs
      : 30000

    const timerKey = this.getSmartLightGroupTimerKey(uniqueIds)
    const existingTimer = this.smartLightGroupTimers.get(timerKey)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(() => {
      void this.restoreSmartLightGroupState(timerKey, snapshots)
    }, restoreAfterMs)
    this.smartLightGroupTimers.set(timerKey, timer)
  }

  private getSmartLightGroupTimerKey(uniqueIds: string[]) {
    return [...uniqueIds].sort().join('|')
  }

  private async restoreSmartLightGroupState(
    timerKey: string,
    snapshots: Array<{ uniqueId: string, writableState: Array<{ type: string, value: string | number | boolean }> }>,
  ) {
    try {
      const services = await this.loadAccessories()
      for (const snapshot of snapshots) {
        const service = services.find(x => x.uniqueId === snapshot.uniqueId)
        if (!service) {
          continue
        }

        const sortedState = [...snapshot.writableState].sort((a, b) => {
          if (a.type === 'On') {
            return 1
          }
          if (b.type === 'On') {
            return -1
          }
          return this.smartLightRestoreCharacteristicOrder.indexOf(a.type as typeof this.smartLightRestoreCharacteristicOrder[number])
            - this.smartLightRestoreCharacteristicOrder.indexOf(b.type as typeof this.smartLightRestoreCharacteristicOrder[number])
        })

        for (const characteristicState of sortedState) {
          const characteristic = service.getCharacteristic(characteristicState.type)
          if (!characteristic || !characteristic.canWrite) {
            continue
          }

          try {
            await characteristic.setValue(characteristicState.value)
          } catch (error) {
            this.log.warn(`[Smart Automation] Failed to restore ${characteristicState.type} for ${service.uniqueId}: ${error?.message || error}`)
          }
        }
      }
    } finally {
      this.smartLightGroupTimers.delete(timerKey)
    }
  }
}
