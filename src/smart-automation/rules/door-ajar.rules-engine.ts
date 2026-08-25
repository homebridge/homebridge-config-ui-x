import type { ServiceType } from '@homebridge/hap-client'

import type { DoorAjarConfig, SmartAutomationAccessoryController, SmartAutomationMonitor } from '../smart-automation.interfaces.js'

/** How often the door is read. Fine enough for a rule measured in minutes. */
const POLL_SECONDS = 30

/**
 * The longest delay either setting may ask for.
 *
 * ⚠️ Node stores a timer delay in a signed 32-bit integer, so anything past
 * ~24.85 days silently becomes 1ms and fires in a loop. A day is far more than
 * this rule needs and leaves no room for that to happen.
 */
const MAX_MINUTES = 1440

/** How long the sensor drops back to closed to make a repeat alert land. */
const RETRIGGER_PULSE_MS = 1000

/**
 * Whether a door-like service is currently anything other than shut.
 *
 * Each service type says so differently, and "not closed" is deliberately
 * wider than "open": a door stopped halfway, or one that has been opening for
 * ten minutes because something is in the way, is exactly what this rule is
 * for.
 * @param service - the watched accessory service
 */
export function isDoorOpen(service: ServiceType): boolean | undefined {
  const read = (type: string) => service.serviceCharacteristics?.find(characteristic => characteristic.type === type)?.value

  switch (service.type) {
    case 'GarageDoorOpener': {
      // 0 Open, 1 Closed, 2 Opening, 3 Closing, 4 Stopped
      const state = read('CurrentDoorState')
      return state === undefined ? undefined : Number(state) !== 1
    }
    case 'Door':
    case 'Window':
    case 'WindowCovering': {
      const position = read('CurrentPosition')
      return position === undefined ? undefined : Number(position) > 0
    }
    case 'ContactSensor': {
      // 0 contact detected (shut), 1 contact not detected (open)
      const state = read('ContactSensorState')
      return state === undefined ? undefined : Number(state) === 1
    }
    default:
      return undefined
  }
}

/**
 * Clamp a configured number of minutes into something a timer can hold.
 * @param minutes - the configured value
 * @param fallback - what to use when it is missing or not a number
 */
export function clampMinutes(minutes: unknown, fallback: number): number {
  const value = Number(minutes)
  if (!Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return Math.min(Math.round(value), MAX_MINUTES)
}

/**
 * "Door left ajar": watch one door, and if it stays open longer than the
 * configured time, trip a contact sensor — then keep tripping it at an
 * interval until the door is finally shut.
 *
 * The published accessory is a contact sensor rather than a switch so it can
 * be used directly as a HomeKit automation trigger, and because HomeKit fires
 * an automation on a *change*, a repeat alert has to drop the sensor back to
 * closed for a moment before opening it again — otherwise the second and
 * later alerts would never fire.
 */
export class DoorAjarRulesEngine implements SmartAutomationMonitor<boolean> {
  private publish: ((tripped: boolean) => void) | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private pulseTimer: ReturnType<typeof setTimeout> | null = null
  private openSince: number | null = null
  private lastAlertAt: number | null = null
  private tripped = false

  constructor(
    private readonly config: DoorAjarConfig,
    private readonly accessories: SmartAutomationAccessoryController,
    private readonly log: any,
    private readonly now: () => number = () => Date.now(),
  ) {}

  public start(publish: (tripped: boolean) => void): void {
    this.publish = publish
    publish(false)
    this.log.info(`${this.config.name}: watching for the door being left open longer than ${this.openMinutes()} minute${this.openMinutes() === 1 ? '' : 's'}, repeating every ${this.repeatMinutes()}.`)
    this.timer = setInterval(() => void this.tick(), POLL_SECONDS * 1000)
    // Never hold Homebridge open on the way out
    this.timer.unref?.()
    void this.tick()
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.pulseTimer) {
      clearTimeout(this.pulseTimer)
      this.pulseTimer = null
    }
    this.publish = null
  }

  private openMinutes(): number {
    return clampMinutes(this.config.openMinutes, 5)
  }

  private repeatMinutes(): number {
    return clampMinutes(this.config.repeatMinutes, 5)
  }

  /**
   * Read the door and decide what the sensor should say.
   *
   * ⚠️ Nothing in here may throw. It runs on an interval, and an unhandled
   * rejection from a timer takes the whole child bridge down with it.
   */
  public async tick(): Promise<void> {
    try {
      const door = await this.findDoor()
      if (!door) {
        return
      }

      const open = isDoorOpen(door)
      if (open === undefined) {
        this.log.warn(`${this.config.name}: ${door.serviceName || door.uniqueId} does not report a state this rule understands.`)
        return
      }

      if (!open) {
        if (this.openSince !== null || this.tripped) {
          this.log.info(`${this.config.name}: the door is closed.`)
        }
        this.reset()
        return
      }

      const now = this.now()
      this.openSince ??= now
      const openForMs = now - this.openSince

      if (!this.tripped) {
        if (openForMs < this.openMinutes() * 60_000) {
          return
        }
        this.log.info(`${this.config.name}: the door has been open for ${Math.round(openForMs / 60_000)} minutes.`)
        this.trip(now)
        return
      }

      if (this.lastAlertAt !== null && now - this.lastAlertAt >= this.repeatMinutes() * 60_000) {
        this.log.info(`${this.config.name}: the door is still open.`)
        this.retrigger(now)
      }
    } catch (error: any) {
      this.log.warn(`${this.config.name}: could not check the door: ${error?.message || error}`)
    }
  }

  private async findDoor(): Promise<ServiceType | undefined> {
    const uniqueId = this.config.uniqueIds?.[0]
    if (!uniqueId) {
      this.log.warn(`${this.config.name}: no door has been chosen for this automation.`)
      return undefined
    }

    const services = await this.accessories.getServices()
    const door = services.find(service => service.uniqueId === uniqueId)
    if (!door) {
      this.log.warn(`${this.config.name}: the chosen door ${uniqueId} was not found.`)
    }
    return door
  }

  private reset(): void {
    this.openSince = null
    this.lastAlertAt = null
    if (this.pulseTimer) {
      clearTimeout(this.pulseTimer)
      this.pulseTimer = null
    }
    if (this.tripped) {
      this.tripped = false
      this.publish?.(false)
    }
  }

  private trip(now: number): void {
    this.tripped = true
    this.lastAlertAt = now
    this.publish?.(true)
  }

  /**
   * Fire the alert again by closing the sensor for a moment and reopening it,
   * so a HomeKit automation watching for "opens" sees a fresh change.
   * @param now - the current time, so the next repeat is measured from here
   */
  private retrigger(now: number): void {
    this.lastAlertAt = now
    this.publish?.(false)
    this.pulseTimer = setTimeout(() => {
      this.pulseTimer = null
      if (this.tripped) {
        this.publish?.(true)
      }
    }, RETRIGGER_PULSE_MS)
    this.pulseTimer.unref?.()
  }
}
