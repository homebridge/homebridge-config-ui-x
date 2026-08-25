import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clampMinutes, DoorAjarRulesEngine, isDoorOpen } from '../../src/smart-automation/rules/door-ajar.rules-engine.js'

function door(type: string, characteristics: Record<string, number>) {
  return {
    type,
    uniqueId: 'garage-door',
    serviceName: 'Garage Door',
    serviceCharacteristics: Object.entries(characteristics).map(([characteristicType, value]) => ({
      type: characteristicType,
      value,
      canWrite: false,
    })),
  } as any
}

describe('isDoorOpen', () => {
  it.each([
    ['open', 0, true],
    ['closed', 1, false],
    ['opening', 2, true],
    ['closing', 3, true],
    ['stopped halfway', 4, true],
  ])('reads a garage door that is %s', (_case, state, expected) => {
    // Anything that is not shut counts: a door stopped halfway, or one that
    // has been "closing" for ten minutes, is exactly what this rule is for
    expect(isDoorOpen(door('GarageDoorOpener', { CurrentDoorState: state }))).toBe(expected)
  })

  it('reads a plain door from its position', () => {
    expect(isDoorOpen(door('Door', { CurrentPosition: 0 }))).toBe(false)
    expect(isDoorOpen(door('Door', { CurrentPosition: 5 }))).toBe(true)
  })

  it('reads a contact sensor, where not-detected means open', () => {
    expect(isDoorOpen(door('ContactSensor', { ContactSensorState: 0 }))).toBe(false)
    expect(isDoorOpen(door('ContactSensor', { ContactSensorState: 1 }))).toBe(true)
  })

  it('says nothing for a service it does not understand', () => {
    // Better to say "I cannot tell" than to guess a door is shut
    expect(isDoorOpen(door('Lightbulb', { On: 1 }))).toBeUndefined()
    expect(isDoorOpen(door('GarageDoorOpener', {}))).toBeUndefined()
  })
})

describe('clampMinutes', () => {
  it('keeps a sensible value', () => {
    expect(clampMinutes(10, 5)).toBe(10)
  })

  it('falls back for anything that is not a positive number', () => {
    expect(clampMinutes(undefined, 5)).toBe(5)
    expect(clampMinutes(0, 5)).toBe(5)
    expect(clampMinutes(-3, 5)).toBe(5)
    expect(clampMinutes('nonsense', 5)).toBe(5)
  })

  it('caps a value that would break the timer', () => {
    // ⚠️ Node keeps a timer delay in a signed 32-bit int, so a delay past
    // ~24.85 days becomes 1ms and fires in a loop
    expect(clampMinutes(60 * 24 * 365, 5)).toBe(1440)
    expect(clampMinutes(1440, 5) * 60_000).toBeLessThan(2 ** 31 - 1)
  })
})

describe('DoorAjarRulesEngine', () => {
  const config = {
    id: 'garage',
    name: 'Garage Left Open',
    type: 'door-ajar' as const,
    uniqueIds: ['garage-door'],
    openMinutes: 10,
    repeatMinutes: 5,
    enabled: true,
  }

  let clock: number
  let log: any

  beforeEach(() => {
    clock = 0
    log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * Build an engine over a door whose state the test can change.
   * @param state - the garage door's starting CurrentDoorState
   */
  function engineFor(state: number) {
    const service = door('GarageDoorOpener', { CurrentDoorState: state })
    const accessories = { getServices: vi.fn(async () => [service]) }
    const published: boolean[] = []
    const engine = new DoorAjarRulesEngine(config, accessories, log, () => clock)
    return {
      accessories,
      engine,
      published,
      publish: (value: boolean) => published.push(value),
      setDoor: (next: number) => {
        service.serviceCharacteristics[0].value = next
      },
    }
  }

  /**
   * Start the engine and let its first read land. `start` fires that read
   * without awaiting it, so a test that moves the clock on immediately would
   * otherwise record the door as having only just opened.
   * @param engine - the engine under test
   * @param publish - the publish callback
   */
  async function startEngine(engine: DoorAjarRulesEngine, publish: (value: boolean) => void) {
    engine.start(publish)
    await engine.tick()
  }

  /**
   * Move time on and read the door again.
   * @param engine - the engine under test
   * @param minutes - how long to advance
   */
  async function advance(engine: DoorAjarRulesEngine, minutes: number) {
    clock += minutes * 60_000
    await engine.tick()
  }

  it('says nothing while the door is shut', async () => {
    const { engine, published, publish } = engineFor(1)

    await startEngine(engine, publish)
    await advance(engine, 60)

    // The only value is the closed state it publishes on startup
    expect(published).toEqual([false])
    engine.stop()
  })

  it('stays quiet while the door has not been open long enough', async () => {
    const { engine, published, publish } = engineFor(0)

    await startEngine(engine, publish)
    await advance(engine, 9)

    expect(published).toEqual([false])
    engine.stop()
  })

  it('trips once the door has been open past the configured time', async () => {
    const { engine, published, publish } = engineFor(0)

    await startEngine(engine, publish)
    await advance(engine, 10)

    expect(published).toEqual([false, true])
    engine.stop()
  })

  it('measures from when the door opened, not from startup', async () => {
    const { engine, published, publish, setDoor } = engineFor(1)

    await startEngine(engine, publish)
    await advance(engine, 30)
    setDoor(0)
    await engine.tick()
    await advance(engine, 9)

    expect(published).toEqual([false])

    await advance(engine, 1)

    expect(published).toEqual([false, true])
    engine.stop()
  })

  it('keeps alerting while the door stays open', async () => {
    // ⚠️ HomeKit fires an automation on a change, so a repeat has to close the
    // sensor before opening it again or only the first alert would ever run
    vi.useFakeTimers()
    const { engine, published, publish } = engineFor(0)

    await startEngine(engine, publish)
    await advance(engine, 10)
    expect(published).toEqual([false, true])

    await advance(engine, 5)
    vi.advanceTimersByTime(1000)

    expect(published).toEqual([false, true, false, true])

    await advance(engine, 5)
    vi.advanceTimersByTime(1000)

    expect(published).toEqual([false, true, false, true, false, true])
    engine.stop()
    vi.useRealTimers()
  })

  it('does not repeat before the repeat time is up', async () => {
    const { engine, published, publish } = engineFor(0)

    await startEngine(engine, publish)
    await advance(engine, 10)
    await advance(engine, 4)

    expect(published).toEqual([false, true])
    engine.stop()
  })

  it('clears the alert as soon as the door is shut', async () => {
    const { engine, published, publish, setDoor } = engineFor(0)

    await startEngine(engine, publish)
    await advance(engine, 10)
    expect(published).toEqual([false, true])

    setDoor(1)
    await engine.tick()

    expect(published).toEqual([false, true, false])
    engine.stop()
  })

  it('starts the clock again when the door is opened a second time', async () => {
    const { engine, published, publish, setDoor } = engineFor(0)

    await startEngine(engine, publish)
    await advance(engine, 10)
    setDoor(1)
    await engine.tick()

    setDoor(0)
    // ⚠️ The clock runs from when the engine SEES the door open, not from when
    // it opened - with a 30 second poll that is up to half a minute of slack,
    // which is immaterial for a rule measured in minutes
    await engine.tick()
    await advance(engine, 9)

    // Still inside the grace period of the second opening
    expect(published).toEqual([false, true, false])

    await advance(engine, 1)

    expect(published).toEqual([false, true, false, true])
    engine.stop()
  })

  it('warns rather than throwing when the door cannot be found', async () => {
    const accessories = { getServices: vi.fn(async () => []) }
    const engine = new DoorAjarRulesEngine(config, accessories, log, () => clock)

    await expect(engine.tick()).resolves.toBeUndefined()
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('was not found'))
  })

  it('survives the accessory lookup failing', async () => {
    // ⚠️ This runs on an interval: a rejection here would take the bridge down
    const accessories = { getServices: vi.fn(async () => {
      throw new Error('hap is unreachable')
    }) }
    const engine = new DoorAjarRulesEngine(config, accessories, log, () => clock)

    await expect(engine.tick()).resolves.toBeUndefined()
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('hap is unreachable'))
  })

  it('warns about an accessory whose state it cannot read', async () => {
    const service = door('Lightbulb', { On: 1 })
    const accessories = { getServices: vi.fn(async () => [service]) }
    const engine = new DoorAjarRulesEngine(config, accessories, log, () => clock)

    await engine.tick()

    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('does not report a state'))
  })

  it('stops watching when it is stopped', async () => {
    const { accessories, engine, publish } = engineFor(0)

    await startEngine(engine, publish)
    const callsWhileRunning = accessories.getServices.mock.calls.length
    engine.stop()
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(accessories.getServices.mock.calls.length).toBe(callsWhileRunning)
  })
})
