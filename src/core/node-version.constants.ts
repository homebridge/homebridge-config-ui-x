import { release } from 'node:os'
import process from 'node:process'

import { gt, gte, parse } from 'semver'

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
 * NodeJS Version - Minimum macOS Version (Darwin release, which is what os.release() returns)
 *
 *      22            11.0    (20.1.0)
 *                            // https://github.com/nodejs/node/blob/v22.x/BUILDING.md#platform-list
 *      24            13.5    (22.6.0)
 *                            // https://nodejs.org/en/blog/migrations/v22-to-v24
 *                            // https://github.com/nodejs/node/blob/v24.x/BUILDING.md#platform-list
 *      26            13.5    (22.6.0)
 *                            // https://github.com/nodejs/node/blob/v26.x/BUILDING.md#platform-list
 *
 * Summary: below these versions a release is unsupported and may not start at all.
 * On macOS 12, v26 fails with a dyld "Symbol not found" error as soon as it runs,
 * which also stops hb-service, so it cannot undo the update. v24.22.0 does start
 * there, but it is blocked too, because any later v24 could fail in the same way.
 */
export const NODE_V24_MIN_DARWIN_RELEASE = '22.6.0'

/**
 * Check if this version of macOS supports Node.js v24, given its Darwin release
 */
export function isNodeV24SupportedMacOS(osRelease: string = release()): boolean {
  return gte(osRelease, NODE_V24_MIN_DARWIN_RELEASE)
}

/**
 * Check if this system can run Node.js v24, by architecture and, on macOS, by OS version
 */
export function isNodeV24SupportedSystem(
  arch: string = process.arch,
  platform: string = process.platform,
  osRelease: string = release(),
): boolean {
  return isNodeV24SupportedArchitecture(arch) && (platform !== 'darwin' || isNodeV24SupportedMacOS(osRelease))
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
 * Only releases this system can run are considered. Node.js v24 and later only
 * ship 64-bit builds and need macOS 13.5, so on a 32-bit system or older macOS
 * the newest LTS is one it cannot run. On 32-bit, picking it made the update fail
 * instead of moving to the newest v22. On older macOS, it installed and left
 * node unable to start.
 */
export function pickNodeUpdate<T extends NodeReleaseEntry>(
  versionList: T[],
  currentVersion: string,
  arch: string = process.arch,
  platform: string = process.platform,
  osRelease: string = release(),
): T | undefined {
  const installable = isNodeV24SupportedSystem(arch, platform, osRelease)
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
