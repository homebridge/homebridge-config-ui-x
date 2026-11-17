import type { NetworkInterfaceInfo } from 'node:os'

import { isIP, isIPv6, SocketAddress } from 'node:net'
import { networkInterfaces } from 'node:os'

import { RE_DIGITS_ONLY } from './regex.constants.js'

/**
 * One entry of `bridge.bind`, and the network interface it stands for on this machine.
 */
export interface ResolvedBindEntry {
  /** The entry as it is written in config.json: an interface name or an IP address */
  entry: string
  /** The interface the entry names or, for an address, the one that owns it now. `null` when this machine has no such interface or address. */
  iface: string | null
  /** Whether the entry is an IP address rather than an interface name */
  isAddress: boolean
}

/**
 * The canonical text of an IPv6 address (lower case, longest zero run compressed), without any
 * zone. The operating system reports addresses in this form; a user may spell the same address
 * any number of other ways in `bridge.bind`.
 */
function canonicalIPv6(address: string): string {
  const zoneStart = address.indexOf('%')
  const bare = zoneStart === -1
    ? address
    : address.slice(0, zoneStart)
  try {
    return new SocketAddress({ address: bare, family: 'ipv6' }).address
  } catch {
    return bare.toLowerCase()
  }
}

/**
 * The name of the interface that owns `address`.
 *
 * An IPv6 address is compared by value, not spelling. Its zone (`fe80::1%eth0` or `fe80::1%2`)
 * names the interface the address must be on: the interface of that name or, for a number, the
 * interface whose address reports that scope id. Without a zone, the first interface that has
 * the address wins. This is how Homebridge reads the same entry.
 */
function interfaceOwningAddress(address: string, interfaces: Record<string, NetworkInterfaceInfo[] | undefined>): string | null {
  const ipv6 = isIPv6(address)
  const wanted = ipv6
    ? canonicalIPv6(address)
    : address

  // The unspecified addresses mean "every interface", so no single interface owns them
  if (wanted === '0.0.0.0' || wanted === '::') {
    return null
  }

  let candidates = Object.keys(interfaces)
  let scopeId: number | undefined
  const zoneStart = ipv6
    ? address.indexOf('%')
    : -1
  if (zoneStart !== -1) {
    const zone = address.slice(zoneStart + 1)
    if (interfaces[zone]) {
      candidates = [zone]
    } else if (RE_DIGITS_ONLY.test(zone)) {
      scopeId = Number(zone)
    } else {
      return null
    }
  }

  for (const name of candidates) {
    for (const info of interfaces[name] ?? []) {
      if (ipv6) {
        if (!isIPv6(info.address)) {
          continue
        }
        if (scopeId !== undefined && scopeId !== 0 && (info as { scopeid?: number }).scopeid !== scopeId) {
          continue
        }
        if (canonicalIPv6(info.address) === wanted) {
          return name
        }
      } else if (info.address === wanted) {
        return name
      }
    }
  }

  return null
}

/**
 * Work out which network interface each `bridge.bind` entry stands for on this machine.
 *
 * `bridge.bind` may hold interface names, IP addresses, or both. Homebridge replaces an address
 * with the interface that owns it each time it starts, so a bridge can follow a network rather
 * than an interface: in a Docker container on several networks, which of `eth0`/`eth1` sits on
 * which network changes between starts, but the container's address on each network does not.
 *
 * Every text entry is returned, in order, so a caller can show each one. Anything else in the
 * list (config.json is edited by hand too) is left out.
 *
 * @param entries - the `bridge.bind` entries
 * @param interfaces - the machine's interfaces (given by tests)
 */
export function resolveBindEntries(
  entries: string[],
  interfaces: Record<string, NetworkInterfaceInfo[] | undefined> = networkInterfaces(),
): ResolvedBindEntry[] {
  return entries
    .filter(entry => typeof entry === 'string')
    .map((entry) => {
      if (interfaces[entry]) {
        return { entry, iface: entry, isAddress: false }
      }
      if (isIP(entry)) {
        return {
          entry,
          iface: interfaceOwningAddress(entry, interfaces),
          isAddress: true,
        }
      }
      return { entry, iface: null, isAddress: false }
    })
}
