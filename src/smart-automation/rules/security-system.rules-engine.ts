import type { ServiceType } from '@homebridge/hap-client'

import type { SecuritySystemConfig, SmartAutomationAccessoryController, SmartAutomationMonitor } from '../smart-automation.interfaces.js'

export const SECURITY_DISARMED = 3
export const SECURITY_ALARM_TRIGGERED = 4
export const SECURITY_NO_FAULT = 0
export const SECURITY_GENERAL_FAULT = 1

const SECURITY_STATE_NAMES: Record<number, string> = {
  0: 'Stay Arm',
  1: 'Away Arm',
  2: 'Night Arm',
  3: 'Disarmed',
  4: 'Alarm Triggered',
}

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
      const selectedChanges = new Set(this.config.uniqueIds.filter(uniqueId => changedUniqueIds.has(uniqueId)))
      if (selectedChanges.size) {
        void this.tick(selectedChanges)
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
    const requestedMode = this.stateName(state)
    if (state === this.targetState && !this.alarmTriggered && !this.armRejected) {
      this.log.debug(`${this.config.name}: ignored duplicate ${requestedMode} request; current state is already ${requestedMode}.`)
      return state
    }
    this.log.info(`${this.config.name}: received request to change from ${this.stateName(this.targetState)} to ${requestedMode}.`)
    this.alarmTriggered = false
    this.armRejected = false
    this.bypassed.clear()

    if (state === SECURITY_DISARMED) {
      this.targetState = state
      this.publishFault?.(SECURITY_NO_FAULT)
      this.publish?.(state)
      this.log.info(`${this.config.name}: current state is Disarmed; all sensor bypasses and faults were cleared.`)
      return state
    }

    try {
      const services = await this.selectedServices()
      this.logSensorSnapshot(services, `evaluating ${requestedMode} request`)
      const resolvedIds = new Set(services.map(service => service.uniqueId))
      const missingIds = this.config.uniqueIds.filter(uniqueId => !resolvedIds.has(uniqueId))
      if (missingIds.length) {
        this.log.warn(`${this.config.name}: ${missingIds.length} configured sensor${missingIds.length === 1 ? '' : 's'} could not be resolved: ${missingIds.join(', ')}.`)
      }
      const openContacts = services.filter(service => service.type === 'ContactSensor' && isSecuritySensorActive(service) === true)
      if (openContacts.length && !this.config.autoBypass) {
        this.targetState = SECURITY_DISARMED
        this.armRejected = true
        this.publishFault?.(SECURITY_GENERAL_FAULT)
        this.publish?.(SECURITY_DISARMED)
        this.log.warn(`${this.config.name}: ${requestedMode} rejected; ${openContacts.map(service => this.sensorLabel(service)).join(', ')} ${openContacts.length === 1 ? 'is' : 'are'} open and auto-bypass is disabled. Current state remains Disarmed; StatusFault=GENERAL_FAULT.`)
        return SECURITY_DISARMED
      }

      for (const service of services) {
        if (isSecuritySensorActive(service) === true && (service.type === 'MotionSensor' || this.config.autoBypass)) {
          this.bypassed.add(service.uniqueId)
        }
      }
      if (openContacts.length) {
        this.log.info(`${this.config.name}: ${requestedMode} will auto-bypass ${openContacts.map(service => this.sensorLabel(service)).join(', ')} until ${openContacts.length === 1 ? 'it closes' : 'they close'}.`)
      }
      this.targetState = state
      this.publishFault?.(SECURITY_NO_FAULT)
      this.publish?.(state)
      this.log.info(`${this.config.name}: current state is ${requestedMode}; ${services.length - this.bypassed.size} protected, ${this.bypassed.size} bypassed, ${missingIds.length} unresolved.`)
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

  public async tick(changedUniqueIds: ReadonlySet<string> = new Set()): Promise<void> {
    try {
      const services = await this.selectedServices()
      const changedServices = services.filter(service => changedUniqueIds.has(service.uniqueId))
      for (const service of changedServices) {
        this.log.info(`${this.config.name}: sensor event — ${this.describeSensor(service)}; system=${this.stateName(this.targetState)}.`)
      }
      if (this.targetState === SECURITY_DISARMED) {
        if (this.armRejected) {
          const hasOpenContact = services.some(service => service.type === 'ContactSensor' && isSecuritySensorActive(service) === true)
          if (!hasOpenContact) {
            this.armRejected = false
            this.publishFault?.(SECURITY_NO_FAULT)
            this.log.info(`${this.config.name}: all entry sensors are closed; StatusFault cleared. The system remains Disarmed until another arm request.`)
          }
        }
        if (changedServices.length && !this.armRejected) {
          this.log.debug(`${this.config.name}: sensor event did not trigger an alarm because the system is Disarmed.`)
        }
        return
      }
      if (this.alarmTriggered) {
        if (changedServices.length) {
          this.log.debug(`${this.config.name}: sensor event did not change state because the alarm is already triggered; disarm to reset it.`)
        }
        return
      }

      for (const service of services.filter(service => this.bypassed.has(service.uniqueId))) {
        if (isSecuritySensorActive(service) === false) {
          this.bypassed.delete(service.uniqueId)
          this.log.info(`${this.config.name}: bypass removed — ${this.sensorLabel(service)} is now ${this.sensorState(service)} and protected in ${this.stateName(this.targetState)} mode.`)
        }
      }
      const active = services.find(service => !this.bypassed.has(service.uniqueId) && isSecuritySensorActive(service) === true)
      if (active) {
        this.alarmTriggered = true
        this.log.warn(`${this.config.name}: ALARM TRIGGERED — ${this.describeSensor(active)} while protected in ${this.stateName(this.targetState)} mode; SecuritySystemCurrentState=${SECURITY_ALARM_TRIGGERED} (Alarm Triggered).`)
        this.publish?.(SECURITY_ALARM_TRIGGERED)
      } else if (changedServices.length) {
        this.log.debug(`${this.config.name}: sensor event evaluated; no protected sensor is active, so current state remains ${this.stateName(this.targetState)}.`)
      }
    } catch (error: any) {
      this.log.warn(`${this.config.name}: could not check security sensors: ${error?.message || error}`)
    }
  }

  private async selectedServices(): Promise<ServiceType[]> {
    const selected = new Set(this.config.uniqueIds)
    return (await this.accessories.getServices()).filter(service => selected.has(service.uniqueId))
  }

  private stateName(state: number): string {
    return SECURITY_STATE_NAMES[state] || `Unknown (${state})`
  }

  private sensorLabel(service: ServiceType): string {
    return `${service.serviceName || 'Unnamed sensor'} (${service.type || 'Unknown'}, id=${service.uniqueId})`
  }

  private sensorState(service: ServiceType): string {
    const active = isSecuritySensorActive(service)
    if (active === undefined) {
      return 'state unavailable'
    }
    if (service.type === 'ContactSensor') {
      return active ? 'open' : 'closed'
    }
    return active ? 'motion detected' : 'clear'
  }

  private describeSensor(service: ServiceType): string {
    const protection = this.bypassed.has(service.uniqueId) ? 'bypassed' : 'protected'
    return `${this.sensorLabel(service)} is ${this.sensorState(service)} [${protection}]`
  }

  private logSensorSnapshot(services: ServiceType[], reason: string): void {
    if (!services.length) {
      this.log.warn(`${this.config.name}: no configured security sensors were resolved while ${reason}.`)
      return
    }
    this.log.info(`${this.config.name}: sensor status while ${reason}: ${services.map(service => `${this.sensorLabel(service)} is ${this.sensorState(service)}`).join('; ')}.`)
  }
}
