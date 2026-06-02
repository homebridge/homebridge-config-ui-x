export interface SmartAutomation {
  id: string
  name: string
  type: 'smart-light-group'
  uniqueIds: string[]
  restoreAfterMs: number
  enabled: boolean
}
