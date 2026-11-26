import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

import { describe, expect, it } from 'vitest'

import { serviceBridgeKey, serviceBridgeName } from '@/app/core/accessories/filters/service-helpers'

function withBridge(options: { instance?: Record<string, unknown>, bridge?: unknown, protocol?: string }): ServiceTypeX {
  return {
    uniqueId: 'test',
    instance: options.instance,
    bridge: options.bridge,
    protocol: options.protocol,
  } as unknown as ServiceTypeX
}

describe('serviceBridgeName', () => {
  it('prefers the advertised mDNS name over the model in instance.name', () => {
    expect(serviceBridgeName(withBridge({
      instance: { name: 'homebridge', displayName: 'Hue 3A1B', username: 'AA:BB:CC:DD:EE:FF' },
    }))).toBe('Hue 3A1B')
  })

  it('keeps the mDNS suffix as advertised, even when it matches the bridge username', () => {
    expect(serviceBridgeName(withBridge({
      instance: { name: 'homebridge', displayName: 'Tasmota CC79 CC79', username: '0E:11:22:33:CC:79' },
    }))).toBe('Tasmota CC79 CC79')
    expect(serviceBridgeName(withBridge({
      instance: { name: 'homebridge', displayName: 'Skyler Test Node Red DF3C', username: '0E:11:22:33:44:55' },
    }))).toBe('Skyler Test Node Red DF3C')
  })

  it('uses the name the bridge advertises in the HAP instance', () => {
    const service = withBridge({
      instance: { username: 'AA:11', name: 'Kitchen Bridge' },
      bridge: { username: 'AA:11', name: 'Old Name' },
    })
    expect(serviceBridgeName(service)).toBe('Kitchen Bridge')
  })

  it('falls back to the bridge name for a Matter service with no instance', () => {
    const service = withBridge({
      protocol: 'matter',
      bridge: { username: 'MT:22', name: 'Matter Hub' },
    })
    expect(serviceBridgeName(service)).toBe('Matter Hub')
  })

  it('uses a string bridge as the name', () => {
    expect(serviceBridgeName(withBridge({ bridge: 'BRIDGE-A' }))).toBe('BRIDGE-A')
  })

  it('falls back to the username when no name is known', () => {
    const service = withBridge({
      instance: { username: 'AA:33' },
    })
    expect(serviceBridgeName(service)).toBe('AA:33')
    expect(serviceBridgeKey(service)).toBe('AA:33')
  })
})
