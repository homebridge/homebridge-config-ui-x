import type { ServiceType } from '@homebridge/hap-client'

import type { SecuritySystemConfig, SmartAutomationAccessoryController, SmartAutomationMonitor } from '../smart-automation.interfaces.js'

export const SECURITY_DISARMED = 3
export const SECURITY_ALARM_TRIGGERED = 4
export const SECURITY_NO_FAULT = 0
export const SECURITY_GENERAL_FAULT = 1

export function isSecuritySensorActive(service: ServiceType): boolean | undefined {
  const read = (type: string) => service.serviceCharacteristics?.find(characteristic => characteristic.type === type)?.value

  if (service.type === 'ContactSensor') {
    const value = read('ContactSensorState')
    return value === undefined ? undefined : Number(value) === 1
  }
  if (service.type === 'MotionSensor') {
    const value = read('MotionDetected')
    return value === undefined ? undefined : Boolean(value)
  }
  return undefined
}

/** A virtual HomeKit alarm which watches selected contact and motion sensors. */
export class SecuritySystemRulesEngine implements SmartAutomationMonitor<number> {
  private publish: ((state: number) => void) | null = null
  private publishFault: ((fault: number) => void) | null = null
  private unsubscribe: (() => void) | null = null
  private targetState = SECURITY_DISARMED
  private alarmTriggered = false
  private armRejected = false
  private readonly bypassed = new Set<string>()

  constructor(
    private readonly config: SecuritySystemConfig,
    private readonly accessories: SmartAutomationAccessoryController,
    private readonly log: any,
  ) {}

  public start(publish: (state: number) => void, publishFault?: (fault: number) => void): void {
    this.publish = publish
    this.publishFault = publishFault || null
    publish(this.targetState)
    this.publishFault?.(SECURITY_NO_FAULT)
    this.unsubscribe = this.accessories.onServicesChanged?.((changedUniqueIds) => {
      if (this.config.uniqueIds.some(uniqueId => changedUniqueIds.has(uniqueId))) {
        void this.tick()
      }
    }) || null
  }

  public stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.publish = null
    this.publishFault = null
  }

  public async setTargetState(state: number): Promise<number> {
    this.alarmTriggered = false
    this.armRejected = false
    this.bypassed.clear()

    if (state === SECURITY_DISARMED) {
      this.targetState = state
      this.publishFault?.(SECURITY_NO_FAULT)
      this.publish?.(state)
      this.log.info(`${this.config.name}: disarmed.`)
      return state
    }

    try {
      const services = await this.selectedServices()
      const openContacts = services.filter(service => service.type === 'ContactSensor' && isSecuritySensorActive(service) === true)
      if (openContacts.length && !this.config.autoBypass) {
        this.targetState = SECURITY_DISARMED
        this.armRejected = true
        this.publishFault?.(SECURITY_GENERAL_FAULT)
        this.publish?.(SECURITY_DISARMED)
        this.log.warn(`${this.config.name}: could not arm; ${openContacts.map(service => service.serviceName || service.uniqueId).join(', ')} ${openContacts.length === 1 ? 'is' : 'are'} open.`)
        return SECURITY_DISARMED
      }

      for (const service of services) {
        if (isSecuritySensorActive(service) === true && (service.type === 'MotionSensor' || this.config.autoBypass)) {
          this.bypassed.add(service.uniqueId)
        }
      }
      if (openContacts.length) {
        this.log.info(`${this.config.name}: arming with ${openContacts.map(service => service.serviceName || service.uniqueId).join(', ')} bypassed until closed.`)
      }
      this.targetState = state
      this.publishFault?.(SECURITY_NO_FAULT)
      this.publish?.(state)
      this.log.info(`${this.config.name}: armed.`)
      return state
    } catch (error: any) {
      this.targetState = SECURITY_DISARMED
      this.armRejected = true
      this.publishFault?.(SECURITY_GENERAL_FAULT)
      this.publish?.(SECURITY_DISARMED)
      this.log.warn(`${this.config.name}: could not arm because its sensors could not be checked: ${error?.message || error}`)
      return SECURITY_DISARMED
    }
  }

  public async tick(): Promise<void> {
    try {
      const services = await this.selectedServices()
      if (this.targetState === SECURITY_DISARMED) {
        if (this.armRejected) {
          const hasOpenContact = services.some(service => service.type === 'ContactSensor' && isSecuritySensorActive(service) === true)
          if (!hasOpenContact) {
            this.armRejected = false
            this.publishFault?.(SECURITY_NO_FAULT)
            this.log.info(`${this.config.name}: all entry sensors are closed; the arming fault has cleared.`)
          }
        }
        return
      }
      if (this.alarmTriggered) {
        return
      }

      for (const service of services.filter(service => this.bypassed.has(service.uniqueId))) {
        if (isSecuritySensorActive(service) === false) {
          this.bypassed.delete(service.uniqueId)
          this.log.info(`${this.config.name}: ${service.serviceName || service.uniqueId} closed and is now protected.`)
        }
      }
      const active = services.find(service => !this.bypassed.has(service.uniqueId) && isSecuritySensorActive(service) === true)
      if (active) {
        this.alarmTriggered = true
        this.log.warn(`${this.config.name}: alarm triggered by ${active.serviceName || active.uniqueId}.`)
        this.publish?.(SECURITY_ALARM_TRIGGERED)
      }
    } catch (error: any) {
      this.log.warn(`${this.config.name}: could not check security sensors: ${error?.message || error}`)
    }
  }

  private async selectedServices(): Promise<ServiceType[]> {
    const selected = new Set(this.config.uniqueIds)
    return (await this.accessories.getServices()).filter(service => selected.has(service.uniqueId))
  }
}
