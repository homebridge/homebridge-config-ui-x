import { SmartAutomationPlatform } from './smart-automation.platform.js'

class EmbeddedSmartAutomationPlatform extends SmartAutomationPlatform {
  constructor(log: any, config: any, api: any) {
    super(log, config, api, 'homebridge-smart-automation')
  }
}

export default (api) => {
  api.registerPlatform('homebridge-smart-automation', 'smart-automation', EmbeddedSmartAutomationPlatform)
}
