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
    this.log.info(`[Smart Automation] Starting engine with ${automations.length} configured automation${automations.length === 1 ? '' : 's'}.`)

    for (const automation of automations) {
      const uuid = this.api.hap.uuid.generate(`smart-automation:${automation.id}`)
      const existing = this.accessories.get(uuid)
      const PlatformAccessory = this.api.platformAccessory
      const accessory = existing || new PlatformAccessory(automation.name, uuid)
      const rulesEngine = this.createRulesEngine(automation)

      desiredUuids.add(uuid)
      this.configureTriggerSwitch(accessory, automation, rulesEngine)
      this.accessories.set(uuid, accessory)
      ;(existing ? existingAccessories : newAccessories).push(accessory)
      this.log.debug(`[Smart Automation] ${automation.name}: ${existing ? 'restored' : 'created'} trigger switch (${automation.id}).`)
    }

    const staleAccessories = [...this.accessories.entries()]
      .filter(([uuid]) => !desiredUuids.has(uuid))
      .map(([, accessory]) => accessory)
    staleAccessories.forEach(accessory => this.accessories.delete(accessory.UUID))

    if (newAccessories.length) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, newAccessories)
    }
    if (existingAccessories.length) {
      this.api.updatePlatformAccessories(existingAccessories)
    }
    if (staleAccessories.length) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories)
    }

    this.log.info(`[Smart Automation] Engine ready; published ${automations.length} trigger switch${automations.length === 1 ? '' : 'es'}.`)
  }

  private createRulesEngine(automation: SmartAutomationConfig): SmartAutomationRulesEngine {
    switch (automation.type) {
      case 'smart-light-group':
        return new SmartLightGroupRulesEngine(automation, this.accessoryController, this.log)
    }
  }

  private configureTriggerSwitch(
    accessory: any,
    automation: SmartAutomationConfig,
    rulesEngine: SmartAutomationRulesEngine,
  ) {
    const { Characteristic, Service } = this.api.hap
    accessory.displayName = automation.name
    accessory.context.automationId = automation.id

    accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, 'homebridge-config-ui-x')
      .setCharacteristic(Characteristic.Model, 'Smart Automation Trigger')
      .setCharacteristic(Characteristic.SerialNumber, automation.id)

    const switchService = accessory.getService(Service.Switch) || accessory.addService(Service.Switch)
    switchService.setCharacteristic(Characteristic.Name, automation.name)

    const onCharacteristic = switchService.getCharacteristic(Characteristic.On)
    onCharacteristic.removeAllListeners('set')
    onCharacteristic.onSet(async (value: boolean) => {
      if (!(automation.enabled ?? true)) {
        onCharacteristic.updateValue(false)
        return
      }
      this.log.info(`[Smart Automation] ${automation.name}: trigger switch received ${value ? 'On' : 'Off'}.`)
      await rulesEngine.setOn(Boolean(value))
    })

    if (!(automation.enabled ?? true)) {
      onCharacteristic.updateValue(false)
    }
  }

  private getAutomations(): SmartAutomationConfig[] {
    const automations = Array.isArray(this.config.smartAutomations) ? this.config.smartAutomations : []
    return automations
      .filter(automation => automation?.type === 'smart-light-group' && typeof automation.id === 'string')
      .map(automation => ({
        ...automation,
        name: automation.name?.trim() || 'Smart Light Group',
        uniqueIds: [...new Set(automation.uniqueIds || [])].filter(Boolean),
        enabled: automation.enabled ?? true,
      }))
      .filter(automation => automation.uniqueIds.length > 0)
  }
}
