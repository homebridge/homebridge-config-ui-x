import type { SmartAutomationConfig, SmartAutomationRulesEngine } from './smart-automation.interfaces.js'

import { SmartLightGroupRulesEngine } from './rules/smart-light-group.rules-engine.js'
import { HapSmartAutomationAccessoryController } from './smart-automation-accessory.controller.js'

const PLUGIN_NAME = 'homebridge-config-ui-x'
const PLATFORM_NAME = 'smart-automation'

export class SmartAutomationPlatform {
  private readonly accessories = new Map<string, any>()
  private readonly accessoryController: HapSmartAutomationAccessoryController

  constructor(
    private readonly log: any,
    private readonly config: { smartAutomations?: SmartAutomationConfig[] },
    private readonly api: any,
  ) {
    this.accessoryController = new HapSmartAutomationAccessoryController(this.api?.user?.configPath?.(), this.log)
    this.api.on('didFinishLaunching', () => void this.initialise())
  }

  public configureAccessory(accessory: any) {
    this.accessories.set(accessory.UUID, accessory)
  }

  private async initialise() {
    const newAccessories: any[] = []
    const existingAccessories: any[] = []
    const desiredUuids = new Set<string>()

    const automations = this.getAutomations()
    this.log.info(`Starting engine with ${automations.length} configured automation${automations.length === 1 ? '' : 's'}.`)

    for (const automation of automations) {
      const uuid = this.api.hap.uuid.generate(`smart-automation:${automation.id}`)
      const existing = this.accessories.get(uuid)
      const PlatformAccessory = this.api.platformAccessory
      const accessory = existing || new PlatformAccessory(automation.name, uuid)
      const rulesEngine = this.createRulesEngine(automation)
      this.log.info(`${automation.name}: configured ${automation.lightbulbType} trigger light for ${automation.uniqueIds.length} group light${automation.uniqueIds.length === 1 ? '' : 's'}.`)
      this.log.debug(`${automation.name}: configuration id=${automation.id}, type=${automation.type}, publishedLight=${automation.lightbulbType}, enabled=${automation.enabled}, lights=[${automation.uniqueIds.join(', ')}].`)

      desiredUuids.add(uuid)
      this.configureTriggerLightbulb(accessory, automation, rulesEngine)
      this.accessories.set(uuid, accessory)
      ;(existing ? existingAccessories : newAccessories).push(accessory)
      this.log.debug(`${automation.name}: ${existing ? 'restored cached' : 'created new'} ${automation.lightbulbType} trigger light; uuid=${uuid}.`)
    }

    const staleAccessories = [...this.accessories.entries()]
      .filter(([uuid]) => !desiredUuids.has(uuid))
      .map(([, accessory]) => accessory)
    staleAccessories.forEach((accessory) => {
      this.log.debug(`Removing stale trigger light ${accessory.displayName || accessory.UUID}; uuid=${accessory.UUID}.`)
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

    this.log.info(`Engine ready; published ${automations.length} trigger light${automations.length === 1 ? '' : 's'}.`)
  }

  private createRulesEngine(automation: SmartAutomationConfig): SmartAutomationRulesEngine {
    switch (automation.type) {
      case 'smart-light-group':
        return new SmartLightGroupRulesEngine(automation, this.accessoryController, this.log)
    }
  }

  private configureTriggerLightbulb(
    accessory: any,
    automation: SmartAutomationConfig,
    rulesEngine: SmartAutomationRulesEngine,
  ) {
    const { Characteristic, Service } = this.api.hap
    accessory.displayName = automation.name
    accessory.context.automationId = automation.id

    accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, 'homebridge-config-ui-x')
      .setCharacteristic(Characteristic.Model, 'Smart Automation Light')
      .setCharacteristic(Characteristic.SerialNumber, automation.id)

    const legacySwitchService = accessory.getService(Service.Switch)
    if (legacySwitchService) {
      accessory.removeService(legacySwitchService)
    }

    const lightService = accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb)
    lightService.setCharacteristic(Characteristic.Name, automation.name)
    const passThroughCharacteristics = this.configureLightbulbCharacteristics(accessory, lightService, automation, rulesEngine)

    const onCharacteristic = lightService.getCharacteristic(Characteristic.On)
    onCharacteristic.removeAllListeners('set')
    onCharacteristic.onSet(async (value: boolean) => {
      if (!(automation.enabled ?? true)) {
        onCharacteristic.updateValue(false)
        return
      }
      this.log.info(`${automation.name}: trigger light received ${value ? 'On' : 'Off'}.`)
      await rulesEngine.setOn(Boolean(value))
      if (value) {
        for (const passThrough of passThroughCharacteristics) {
          const passThroughValue = accessory.context.lightbulbValues[passThrough.uuid]
          this.log.info(`${automation.name}: applying published ${passThrough.type}=${String(passThroughValue)} after On.`)
          await rulesEngine.setCharacteristic(
            passThrough.type,
            passThroughValue,
          )
        }
      }
    })

    if (!(automation.enabled ?? true)) {
      onCharacteristic.updateValue(false)
    }
  }

  private configureLightbulbCharacteristics(
    accessory: any,
    lightService: any,
    automation: SmartAutomationConfig,
    rulesEngine: SmartAutomationRulesEngine,
  ): Array<{ type: string, uuid: string }> {
    const { Characteristic } = this.api.hap
    const optionalCharacteristics = [
      { defaultValue: 100, hapType: Characteristic.Brightness, type: 'Brightness' },
      { defaultValue: 0, hapType: Characteristic.Hue, type: 'Hue' },
      { defaultValue: 0, hapType: Characteristic.Saturation, type: 'Saturation' },
      { defaultValue: 140, hapType: Characteristic.ColorTemperature, type: 'ColorTemperature' },
    ]
    const characteristicTypes = {
      'dimmable': ['Brightness'],
      'colour': ['Brightness', 'Hue', 'Saturation'],
      'temperature': ['Brightness', 'ColorTemperature'],
      'on-off': [],
    }
    const desiredTypes = new Set(characteristicTypes[automation.lightbulbType])
    accessory.context.lightbulbValues ||= {}

    for (const definition of optionalCharacteristics) {
      const existing = lightService.characteristics.find(characteristic => characteristic.UUID === definition.hapType.UUID)
      if (!desiredTypes.has(definition.type)) {
        if (existing) {
          this.log.debug(`${automation.name}: removing published ${existing.displayName || existing.UUID} characteristic (${existing.UUID}).`)
          lightService.removeCharacteristic(existing)
        }
        continue
      }

      const characteristic = lightService.getCharacteristic(definition.hapType)
      accessory.context.lightbulbValues[definition.hapType.UUID] ??= definition.defaultValue
      this.log.debug(`${automation.name}: publishing ${characteristic.displayName || definition.hapType.UUID} characteristic (${definition.hapType.UUID}) with value ${String(accessory.context.lightbulbValues[definition.hapType.UUID])}.`)
      characteristic.removeAllListeners('get')
      characteristic.removeAllListeners('set')
      characteristic.onGet(() => accessory.context.lightbulbValues[definition.hapType.UUID])
      characteristic.onSet(async (value: string | number | boolean) => {
        const previousValue = accessory.context.lightbulbValues[definition.hapType.UUID]
        this.log.info(`${automation.name}: published ${definition.type} received ${String(value)}.`)
        this.log.debug(`${automation.name}: published ${characteristic.displayName || definition.hapType.UUID} changed ${String(previousValue)} -> ${String(value)}.`)
        accessory.context.lightbulbValues[definition.hapType.UUID] = value
        await rulesEngine.setCharacteristic(definition.type, value)
      })
    }

    return optionalCharacteristics
      .filter(definition => desiredTypes.has(definition.type))
      .map(definition => ({ type: definition.type, uuid: definition.hapType.UUID }))
  }

  private getAutomations(): SmartAutomationConfig[] {
    const automations = Array.isArray(this.config.smartAutomations) ? this.config.smartAutomations : []
    return automations
      .filter(automation => automation?.type === 'smart-light-group' && typeof automation.id === 'string')
      .map(automation => ({
        ...automation,
        name: automation.name?.trim() || 'Smart Light Group',
        uniqueIds: [...new Set(automation.uniqueIds || [])].filter(Boolean),
        lightbulbType: ['on-off', 'dimmable', 'colour', 'temperature'].includes(automation.lightbulbType)
          ? automation.lightbulbType
          : 'on-off',
        enabled: automation.enabled ?? true,
      }))
      .filter(automation => automation.uniqueIds.length > 0)
  }
}
