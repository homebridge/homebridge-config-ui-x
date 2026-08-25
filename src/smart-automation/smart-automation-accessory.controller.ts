import type { ServiceType } from '@homebridge/hap-client'

import type { SmartAutomationAccessoryController } from './smart-automation.interfaces.js'

import { readFileSync } from 'node:fs'

import { HapClient } from '@homebridge/hap-client'

export class HapSmartAutomationAccessoryController implements SmartAutomationAccessoryController {
  private readonly hapClient: HapClient | null

  constructor(configPath: string | undefined, private readonly log: any) {
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

  public async getServices(): Promise<ServiceType[]> {
    if (!this.hapClient) {
      return []
    }

    const services = await this.hapClient.getAllServices()
    this.log.debug(`Accessory discovery returned ${services.length} Homebridge services.`)
    return services
  }
}
