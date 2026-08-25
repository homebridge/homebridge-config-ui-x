import { describe, expect, it, vi } from 'vitest'

import { SmartLightGroupRulesEngine } from '../../src/smart-automation/rules/smart-light-group.rules-engine.js'

function createCharacteristic(type: string, initialValue: string | number | boolean, canWrite = true) {
  const characteristic = {
    canWrite,
    type,
    value: initialValue,
    setValue: vi.fn(async (value: string | number | boolean) => {
      characteristic.value = value
    }),
  }

  return characteristic
}

function createLight(uniqueId: string, initialValue: boolean, additionalCharacteristics: any[] = []) {
  const characteristic = createCharacteristic('On', initialValue)
  const serviceCharacteristics = [characteristic, ...additionalCharacteristics]

  return {
    characteristic,
    service: {
      type: 'Lightbulb',
      uniqueId,
      serviceCharacteristics,
      getCharacteristic: vi.fn(type => serviceCharacteristics.find(item => item.type === type)),
    } as any,
  }
}

describe('SmartLightGroupRulesEngine', () => {
  const config = {
    id: 'outside-lights',
    name: 'Outside Lights',
    type: 'smart-light-group' as const,
    lightbulbType: 'on-off' as const,
    uniqueIds: ['light-1', 'light-2'],
    enabled: true,
  }

  it('stores each On state, turns the group on, then restores and clears the state', async () => {
    const first = createLight('light-1', false)
    const second = createLight('light-2', true)
    const accessories = { getServices: vi.fn(async () => [first.service, second.service]) }
    const engine = new SmartLightGroupRulesEngine(config, accessories, {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    })

    await engine.setOn(true)
    expect(first.characteristic.value).toBe(true)
    expect(second.characteristic.value).toBe(true)

    // A repeated On must not replace the original snapshot.
    await engine.setOn(true)
    await engine.setOn(false)
    expect(first.characteristic.value).toBe(false)
    expect(second.characteristic.value).toBe(true)

    // The previous snapshot was cleared, so another Off turns all lights off.
    await engine.setOn(false)
    expect(first.characteristic.value).toBe(false)
    expect(second.characteristic.value).toBe(false)
  })

  it('turns the configured lights off when Off is received without saved state', async () => {
    const first = createLight('light-1', true)
    const second = createLight('light-2', true)
    const accessories = { getServices: vi.fn(async () => [first.service, second.service]) }
    const engine = new SmartLightGroupRulesEngine(config, accessories, {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    })

    await engine.setOn(false)

    expect(first.characteristic.value).toBe(false)
    expect(second.characteristic.value).toBe(false)
  })

  it('restores every writable light characteristic and restores On last', async () => {
    const brightness = createCharacteristic('Brightness', 35)
    const hue = createCharacteristic('Hue', 120)
    const name = createCharacteristic('Name', 'Porch Light', false)
    const light = createLight('light-1', false, [brightness, hue, name])
    const accessories = { getServices: vi.fn(async () => [light.service]) }
    const engine = new SmartLightGroupRulesEngine(config, accessories, {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    })

    await engine.setOn(true)
    brightness.value = 100
    hue.value = 270
    await engine.setOn(false)

    expect(brightness.value).toBe(35)
    expect(hue.value).toBe(120)
    expect(name.setValue).not.toHaveBeenCalled()

    const brightnessRestoreOrder = brightness.setValue.mock.invocationCallOrder.at(-1)!
    const hueRestoreOrder = hue.setValue.mock.invocationCallOrder.at(-1)!
    const onRestoreOrder = light.characteristic.setValue.mock.invocationCallOrder.at(-1)!
    expect(onRestoreOrder).toBeGreaterThan(brightnessRestoreOrder)
    expect(onRestoreOrder).toBeGreaterThan(hueRestoreOrder)
  })

  it('logs detailed characteristic snapshots and old-to-new writes at debug level', async () => {
    const brightness = createCharacteristic('Brightness', 42)
    const light = createLight('light-1', false, [brightness])
    const accessories = { getServices: vi.fn(async () => [light.service]) }
    const log = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }
    const engine = new SmartLightGroupRulesEngine(config, accessories, log)

    await engine.setOn(true)
    brightness.value = 80
    await engine.setOn(false)

    const debugOutput = log.debug.mock.calls.flat().join('\n')
    expect(debugOutput).toContain('captured light-1.On=false')
    expect(debugOutput).toContain('captured light-1.Brightness=42')
    expect(debugOutput).toContain('turn on light-1.On: false -> true')
    expect(debugOutput).toContain('restore light-1.Brightness: 80 -> 42')
  })

  it('passes published light settings through while active and restores the original values on Off', async () => {
    const brightness = createCharacteristic('Brightness', 20)
    const light = createLight('light-1', true, [brightness])
    const accessories = { getServices: vi.fn(async () => [light.service]) }
    const log = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }
    const engine = new SmartLightGroupRulesEngine(config, accessories, log)

    await engine.setCharacteristic('Brightness', 40)
    expect(brightness.value).toBe(20)

    await engine.setOn(true)
    await engine.setCharacteristic('Brightness', 60)
    expect(brightness.value).toBe(60)

    await engine.setOn(false)
    expect(brightness.value).toBe(20)
    expect(light.characteristic.value).toBe(true)

    const debugOutput = log.debug.mock.calls.flat().join('\n')
    expect(debugOutput).toContain('ignoring Brightness=40 because the trigger light is off')
    expect(debugOutput).toContain('set Brightness light-1.Brightness: 20 -> 60')
  })
})
