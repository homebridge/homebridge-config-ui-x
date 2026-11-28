import type { NetworkInterfaceInfo } from 'node:os'

import { describe, expect, it } from 'vitest'

import { resolveBindEntries } from '../../src/core/bridge-bind.js'

/**
 * `bridge.bind` holds interface names, IP addresses, or both. Homebridge turns
 * an address into the interface that owns it each time it starts, which is what
 * lets a bridge follow a network instead of an interface: in a Docker container
 * on two networks, which of eth0/eth1 sits on which network changes from one
 * start to the next, but the container's address on each network does not.
 *
 * The UI has to read an address the same way, or it reports a working setting
 * as "not connected" and offers the address to features that need a name.
 */
describe('resolving bridge.bind entries to network interfaces', () => {
  const address = (value: string, family: 'IPv4' | 'IPv6' = 'IPv4', scopeid?: number) => ({ address: value, family, scopeid }) as NetworkInterfaceInfo

  const interfaces = {
    lo: [
      address('127.0.0.1'),
    ],
    eth0: [
      address('172.18.0.5'),
      address('fe80::1', 'IPv6', 2),
    ],
    eth1: [
      address('192.168.1.50'),
      address('fd00:1234::50', 'IPv6', 0),
      address('fe80::1', 'IPv6', 3),
    ],
  }

  it('keeps an interface name as it is', () => {
    expect(resolveBindEntries(['eth0'], interfaces)).toEqual([
      { entry: 'eth0', iface: 'eth0', isAddress: false },
    ])
  })

  it('finds the interface that owns an address', () => {
    expect(resolveBindEntries(['192.168.1.50', 'fd00:1234::50'], interfaces)).toEqual([
      { entry: '192.168.1.50', iface: 'eth1', isAddress: true },
      { entry: 'fd00:1234::50', iface: 'eth1', isAddress: true },
    ])
  })

  it('follows the address when the interfaces swap networks between starts', () => {
    const swapped = { lo: interfaces.lo, eth0: interfaces.eth1, eth1: interfaces.eth0 }

    expect(resolveBindEntries(['192.168.1.50'], interfaces)[0].iface).toBe('eth1')
    expect(resolveBindEntries(['192.168.1.50'], swapped)[0].iface).toBe('eth0')
  })

  it('matches an IPv6 address however it is spelled, as Homebridge does', () => {
    // The operating system reports the short form; a user may well type another
    expect(resolveBindEntries(['FD00:1234:0000:0000:0000:0000:0000:0050'], interfaces)[0].iface).toBe('eth1')
    expect(resolveBindEntries(['fd00:1234:0:0:0:0:0:50'], interfaces)[0].iface).toBe('eth1')
  })

  it('uses the zone of a link-local address to pick the interface', () => {
    // fe80::1 is on both interfaces, and the zone says which one is meant
    expect(resolveBindEntries(['fe80::1%eth1'], interfaces)[0].iface).toBe('eth1')
    expect(resolveBindEntries(['fe80::1%3'], interfaces)[0].iface).toBe('eth1')
    expect(resolveBindEntries(['fe80::1%eth9'], interfaces)[0].iface).toBeNull()
    // With no zone, the first interface that has the address wins
    expect(resolveBindEntries(['fe80::1'], interfaces)[0].iface).toBe('eth0')
  })

  it('reports an address this machine does not have, and still calls it an address', () => {
    // The caller tells a missing address from a missing interface by this flag
    expect(resolveBindEntries(['10.0.0.1'], interfaces)).toEqual([
      { entry: '10.0.0.1', iface: null, isAddress: true },
    ])
  })

  it('reports an interface this machine does not have', () => {
    expect(resolveBindEntries(['wlan0'], interfaces)).toEqual([
      { entry: 'wlan0', iface: null, isAddress: false },
    ])
  })

  it('gives the unspecified addresses no interface, as they mean every interface', () => {
    expect(resolveBindEntries(['0.0.0.0', '::'], interfaces)).toEqual([
      { entry: '0.0.0.0', iface: null, isAddress: true },
      { entry: '::', iface: null, isAddress: true },
    ])
  })

  it('does not take a subnet for an address', () => {
    // Homebridge accepts no subnets either
    expect(resolveBindEntries(['192.168.1.0/24'], interfaces)).toEqual([
      { entry: '192.168.1.0/24', iface: null, isAddress: false },
    ])
  })

  it('keeps the order and every entry, so the caller can show each one', () => {
    expect(resolveBindEntries(['192.168.1.50', 'eth1', 'eth0'], interfaces).map(x => x.iface)).toEqual(['eth1', 'eth1', 'eth0'])
  })

  it('leaves out anything in the config that is not text', () => {
    // bridge.bind is edited by hand as well as by the UI
    expect(resolveBindEntries([
      'eth0',
      5,
      null,
      { iface: 'eth1' },
    ] as any, interfaces)).toEqual([
      { entry: 'eth0', iface: 'eth0', isAddress: false },
    ])
  })

  it('reads this machine\'s interfaces when given none', () => {
    expect(resolveBindEntries(['203.0.113.7'])).toEqual([
      { entry: '203.0.113.7', iface: null, isAddress: true },
    ])
  })
})
