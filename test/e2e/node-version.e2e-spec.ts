import { describe, expect, it } from 'vitest'

import { isNodeV24SupportedSystem, pickNodeUpdate } from '../../src/core/node-version.constants.js'

/**
 * A plain `hb-service update-node` picks the newest LTS release. Node.js v24
 * and later only ship 64-bit builds, so on a 32-bit system that pick could
 * never be installed and the update always failed. It has to stay on v22.
 */
describe('picking a node.js update', () => {
  // Newest first, as nodejs.org/dist/index.json lists them
  const releases = [
    { version: 'v27.1.0', lts: false as const },
    { version: 'v26.13.0', lts: 'Wren' },
    { version: 'v24.22.2', lts: 'Krypton' },
    { version: 'v22.23.4', lts: 'Jod' },
    { version: 'v22.12.0', lts: 'Jod' },
  ]

  it('picks the newest lts release on a 64-bit system', () => {
    expect(pickNodeUpdate(releases, 'v22.12.0', 'arm64')?.version).toBe('v26.13.0')
  })

  it('stays on v22 on a 32-bit system', () => {
    expect(pickNodeUpdate(releases, 'v22.12.0', 'arm')?.version).toBe('v22.23.4')
  })

  it('reports no update when a 32-bit system already has the newest v22', () => {
    expect(pickNodeUpdate(releases, 'v22.23.4', 'arm')).toBeUndefined()
  })

  it('stays on v22 on macOS older than 13.5', () => {
    // Darwin 21.6.0 is macOS 12.7
    expect(pickNodeUpdate(releases, 'v22.12.0', 'x64', 'darwin', '21.6.0')?.version).toBe('v22.23.4')
  })

  it('leaves a v24 install alone on macOS older than 13.5', () => {
    expect(pickNodeUpdate(releases, 'v24.22.0', 'x64', 'darwin', '21.6.0')).toBeUndefined()
  })

  it('picks the newest lts release on macOS 13.5', () => {
    expect(pickNodeUpdate(releases, 'v22.12.0', 'arm64', 'darwin', '22.6.0')?.version).toBe('v26.13.0')
  })

  it('only applies the macos limit on macos', () => {
    expect(isNodeV24SupportedSystem('x64', 'linux', '5.15.0')).toBe(true)
    expect(isNodeV24SupportedSystem('x64', 'darwin', '22.5.0')).toBe(false)
    expect(isNodeV24SupportedSystem('arm', 'linux', '6.1.0')).toBe(false)
  })

  it('updates within the current major when it is newer than the lts', () => {
    expect(pickNodeUpdate([
      { version: 'v27.2.0', lts: false },
      ...releases,
    ], 'v27.1.0', 'x64')?.version).toBe('v27.2.0')
  })
})
