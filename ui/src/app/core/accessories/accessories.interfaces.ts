import type { ServiceType } from '@homebridge/hap-client'

export type AccessoryLayout = {
  name: string
  services: Array<{
    aid: number
    iid: number
    uuid: string
    uniqueId: string
    name: string
    serial: string
    bridge: string
    customName?: string
    customType?: string
    hidden?: boolean
    onDashboard?: boolean
  }>
}[]

/**
 * Matter OnOff cluster attributes
 */
export interface MatterOnOffCluster extends Record<string, unknown> {
  onOff: boolean
}

/**
 * Matter LevelControl cluster attributes
 */
export interface MatterLevelControlCluster extends Record<string, unknown> {
  currentLevel: number
  minLevel?: number
  maxLevel?: number
}

/**
 * Matter ColorControl cluster attributes
 */
export interface MatterColorControlCluster extends Record<string, unknown> {
  currentHue?: number
  currentSaturation?: number
  colorTemperatureMireds?: number
}

/**
 * Matter rvcOperationalState cluster attributes
 */
export interface MatterRvcOperationalStateCluster extends Record<string, unknown> {
  operationalState: number // 0=Stopped, 1=Running, 2=Paused, 3=Error
  operationalStateList?: unknown[]
}

/**
 * Known Matter cluster types
 */
export interface MatterClusters {
  onOff?: MatterOnOffCluster
  levelControl?: MatterLevelControlCluster
  colorControl?: MatterColorControlCluster
  rvcOperationalState?: MatterRvcOperationalStateCluster
  // Add more cluster types as implemented
  [key: string]: MatterOnOffCluster | MatterLevelControlCluster | MatterColorControlCluster | MatterRvcOperationalStateCluster | Record<string, unknown> | undefined
}

export type ServiceTypeX = ServiceType & {
  customName?: string
  customType?: string
  hidden?: boolean
  onDashboard?: boolean
  protocol?: 'matter'
  deviceType?: string
  displayName?: string
  clusters?: MatterClusters
  partId?: string
  bridge?: {
    name?: string
    username?: string
  }
  getCluster?: (clusterName: string) => {
    attributes: Record<string, unknown>
    setAttributes: (attributes: Record<string, unknown>) => Promise<void>
  } | null
}
