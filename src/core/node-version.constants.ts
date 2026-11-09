import { release } from 'node:os'
import process from 'node:process'

import { gt, gte, parse, valid } from 'semver'

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
 * What a system needs to run Node.js, from a major version onwards. Platforms with
 * no entry in minOsRelease are not limited by their OS version.
 */
export interface NodeRequirement {
  fromMajor: number
  architectures: readonly string[]
  minOsRelease: Partial<Record<string, string>>
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
export const NODE_REQUIREMENTS: NodeRequirement[] = [
  {
    fromMajor: 24,
    architectures: NODE_V24_SUPPORTED_ARCHITECTURES,
    minOsRelease: { darwin: '22.6.0' },
  },
]

/**
 * Check if this system can run a major version of Node.js, by architecture and OS version.
 * Anything that cannot be worked out counts as unsupported, so the system stays on a working version.
 */
export function isNodeMajorSupported(
  major: number,
  arch: string = process.arch,
  platform: string = process.platform,
  osRelease: string = release(),
): boolean {
  if (!Number.isInteger(major)) {
    return false
  }

  return NODE_REQUIREMENTS
    .filter(requirement => major >= requirement.fromMajor)
    .every((requirement) => {
      const minOsRelease = requirement.minOsRelease[platform]
      return requirement.architectures.includes(arch) && (!minOsRelease || (valid(osRelease) && gte(osRelease, minOsRelease)))
    })
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
 * ship 64-bit builds and need a minimum OS version, so on other systems the newest
 * LTS is one they cannot run. Picking it could fail the update, or install a
 * release that leaves node unable to start, instead of moving to the newest v22.
 */
export function pickNodeUpdate<T extends NodeReleaseEntry>(
  versionList: T[],
  currentVersion: string,
  arch: string = process.arch,
  platform: string = process.platform,
  osRelease: string = release(),
): T | undefined {
  const installable = versionList.filter(x => isNodeMajorSupported(parse(x.version)?.major, arch, platform, osRelease))

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
