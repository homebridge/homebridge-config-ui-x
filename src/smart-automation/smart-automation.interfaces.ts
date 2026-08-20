import type { ServiceType } from '@homebridge/hap-client'

export interface SmartLightGroupConfig {
  id: string
  name: string
  type: 'smart-light-group'
  uniqueIds: string[]
  lightbulbType: 'on-off' | 'dimmable' | 'colour' | 'temperature'
  enabled?: boolean
}

export type SmartAutomationConfig = SmartLightGroupConfig

export interface SmartAutomationAccessoryController {
  getServices: () => Promise<ServiceType[]>
}

export interface SmartAutomationRulesEngine {
  setOn: (value: boolean) => Promise<void>
}
