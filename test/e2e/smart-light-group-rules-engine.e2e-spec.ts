import { describe, expect, it, vi } from 'vitest'

import { SmartLightGroupRulesEngine } from '../../src/smart-automation/rules/smart-light-group.rules-engine.js'

function createLight(uniqueId: string, initialValue: boolean) {
  const characteristic = {
    canWrite: true,
    value: initialValue,
    setValue: vi.fn(async (value: boolean) => {
      characteristic.value = value
    }),
  }

  return {
    characteristic,
    service: {
      type: 'Lightbulb',
      uniqueId,
      getCharacteristic: vi.fn(() => characteristic),
    } as any,
  }
}

describe('SmartLightGroupRulesEngine', () => {
  const config = {
    id: 'outside-lights',
    name: 'Outside Lights',
    type: 'smart-light-group' as const,
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
})
