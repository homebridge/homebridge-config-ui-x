import process from 'node:process'

import { gt, parse } from 'semver'

/**
 * Node.js version and architecture compatibility constants
 */

/**
 * Architectures that support Node.js v24
 * Node.js v24 requires 64-bit architectures
 */
export const NODE_V24_SUPPORTED_ARCHITECTURES = ['x64', 'arm64', 'ppc64', 's390x'] as const

/**
 * Check if the current architecture supports Node.js v24
 */
export function isNodeV24SupportedArchitecture(arch: string = process.arch): boolean {
  return NODE_V24_SUPPORTED_ARCHITECTURES.includes(arch as any)
}

/**
 * The fields of a nodejs.org/dist/index.json entry that picking an update needs
 */
export interface NodeReleaseEntry {
  version: string
  lts: string | false
}

/**
 * Pick the Node.js release a plain `hb-service update-node` should install, or
 * nothing when already up to date. Prefers the newest LTS release, and otherwise
 * the newest release of the major version already installed.
 *
 * Only releases this architecture can run are considered. Node.js v24 and later
 * only ship 64-bit builds, so on a 32-bit system the newest LTS is one it cannot
 * install - picking it made the update fail instead of moving to the newest v22.
 */
export function pickNodeUpdate<T extends NodeReleaseEntry>(versionList: T[], currentVersion: string, arch: string = process.arch): T | undefined {
  const installable = isNodeV24SupportedArchitecture(arch)
    ? versionList
    : versionList.filter(x => parse(x.version)?.major < 24)

  const latestLts = installable.find(x => x.lts)
  if (latestLts && gt(latestLts.version, currentVersion)) {
    return latestLts
  }

  const currentMajor = parse(currentVersion)?.major
  const latestOfMajor = installable.find(x => parse(x.version)?.major === currentMajor)
  if (latestOfMajor && gt(latestOfMajor.version, currentVersion)) {
    return latestOfMajor
  }

  return undefined
}
