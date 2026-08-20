import type { ServiceType } from '@homebridge/hap-client'

import type { SmartAutomationAccessoryController } from './smart-automation.interfaces.js'

import { readFileSync } from 'node:fs'

import { HapClient } from '@homebridge/hap-client'

export class HapSmartAutomationAccessoryController implements SmartAutomationAccessoryController {
  private readonly hapClient: HapClient | null

  constructor(configPath: string | undefined, logger: any) {
    if (!configPath) {
      logger.warn('[Smart Automation] Could not determine the Homebridge config path.')
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
        logger,
        config: config?.platforms?.find(platform => platform?.platform === 'config')?.ui?.accessoryControl || {},
      })
    } catch (error) {
      logger.warn(`[Smart Automation] Failed to initialise accessory control: ${error?.message || error}`)
      this.hapClient = null
    }
  }

  public async getServices(): Promise<ServiceType[]> {
    return this.hapClient ? await this.hapClient.getAllServices() : []
  }
}
