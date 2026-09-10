import { describe, expect, it, vi } from 'vitest'

import { isSecuritySensorActive, SECURITY_ALARM_TRIGGERED, SECURITY_DISARMED, SecuritySystemRulesEngine } from '../../src/smart-automation/rules/security-system.rules-engine.js'

function sensor(type: 'ContactSensor' | 'MotionSensor', uniqueId: string, active: boolean) {
  return {
    type,
    uniqueId,
    serviceName: uniqueId,
    serviceCharacteristics: [{
      type: type === 'ContactSensor' ? 'ContactSensorState' : 'MotionDetected',
      value: type === 'ContactSensor' ? Number(active) : active,
    }],
  } as any
}

describe('isSecuritySensorActive', () => {
  it('recognises open contacts and detected motion', () => {
    expect(isSecuritySensorActive(sensor('ContactSensor', 'door', true))).toBe(true)
    expect(isSecuritySensorActive(sensor('ContactSensor', 'door', false))).toBe(false)
    expect(isSecuritySensorActive(sensor('MotionSensor', 'hall', true))).toBe(true)
    expect(isSecuritySensorActive(sensor('MotionSensor', 'hall', false))).toBe(false)
  })
})

describe('SecuritySystemRulesEngine', () => {
  const config = {
    id: 'alarm',
    name: 'House Alarm',
    type: 'security-system' as const,
    uniqueIds: ['door', 'hall'],
    autoBypass: false,
    enabled: true,
  }

  it('triggers from a selected sensor only while armed and clears on disarm', async () => {
    const door = sensor('ContactSensor', 'door', false)
    const published: number[] = []
    const engine = new SecuritySystemRulesEngine(config, {
      getServices: vi.fn(async () => [door, sensor('MotionSensor', 'other', true)]),
    }, { info: vi.fn(), warn: vi.fn() })

    engine.start(value => published.push(value))
    await engine.tick()
    expect(published).toEqual([SECURITY_DISARMED])

    await engine.setTargetState(1)
    door.serviceCharacteristics[0].value = 1
    await engine.tick()
    expect(published).toContain(SECURITY_ALARM_TRIGGERED)

    await engine.setTargetState(SECURITY_DISARMED)
    expect(published.at(-1)).toBe(SECURITY_DISARMED)
    engine.stop()
  })

  it('reacts to HAP events from selected motion sensors', async () => {
    const motion = sensor('MotionSensor', 'hall', false)
    let changed: ((ids: ReadonlySet<string>) => void) | undefined
    const published: number[] = []
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
    const engine = new SecuritySystemRulesEngine(config, {
      getServices: vi.fn(async () => [motion]),
      onServicesChanged: vi.fn((listener) => {
        changed = listener
        return vi.fn()
      }),
    }, log)

    engine.start(value => published.push(value))
    await engine.setTargetState(0)
    motion.serviceCharacteristics[0].value = true
    changed?.(new Set(['hall']))

    await vi.waitFor(() => expect(published.at(-1)).toBe(SECURITY_ALARM_TRIGGERED))
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('sensor event — hall (MotionSensor, id=hall) is motion detected [protected]; system=Stay Arm'))
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('ALARM TRIGGERED'))
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('SecuritySystemCurrentState=4'))
    engine.stop()
  })

  it('rejects arming with an open contact when auto-bypass is disabled', async () => {
    const faults: number[] = []
    const published: number[] = []
    const engine = new SecuritySystemRulesEngine(config, {
      getServices: vi.fn(async () => [sensor('ContactSensor', 'door', true)]),
    }, { info: vi.fn(), warn: vi.fn() })
    engine.start(value => published.push(value), value => faults.push(value))

    expect(await engine.setTargetState(1)).toBe(SECURITY_DISARMED)
    expect(published.at(-1)).toBe(SECURITY_DISARMED)
    expect(faults.at(-1)).toBe(1)
    engine.stop()
  })

  it('auto-bypasses an open contact until it closes', async () => {
    const door = sensor('ContactSensor', 'door', true)
    const published: number[] = []
    const engine = new SecuritySystemRulesEngine({ ...config, autoBypass: true }, {
      getServices: vi.fn(async () => [door]),
    }, { info: vi.fn(), warn: vi.fn() })
    engine.start(value => published.push(value))

    expect(await engine.setTargetState(1)).toBe(1)
    await engine.tick()
    expect(published).not.toContain(SECURITY_ALARM_TRIGGERED)
    door.serviceCharacteristics[0].value = 0
    await engine.tick()
    door.serviceCharacteristics[0].value = 1
    await engine.tick()

    expect(published.at(-1)).toBe(SECURITY_ALARM_TRIGGERED)
    engine.stop()
  })
})
