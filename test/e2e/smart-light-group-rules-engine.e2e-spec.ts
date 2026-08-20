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
})
