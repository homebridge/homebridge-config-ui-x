import type { ChildBridge, DeviceInfo, Plugin } from '@/app/core/plugins/manage-plugins.interfaces'

/**
 * A plugin as the plugins page receives it.
 *
 * Returns a fresh object every call, which matters: PluginCardComponent's
 * `ngOnInit` rewrites `displayName` and `icon` on the object it is given, so a
 * shared fixture leaks state from one test into the next.
 * @param overrides - fields to change
 */
export function makePlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    author: 'Test Author',
    description: 'A plugin used in tests',
    disabled: false,
    displayName: 'Test Plugin',
    engines: { node: '>=20', homebridge: '>=1.8.0' },
    globalInstall: false,
    hasChildBridges: false,
    hasChildBridgesUnpaired: false,
    hasExternalAccessories: false,
    icon: '',
    installPath: '/var/lib/homebridge/node_modules',
    installedVersion: '1.0.0',
    isConfigured: true,
    isConfiguredDynamicPlatform: true,
    isUnmaintained: false,
    isHbScoped: false,
    latestVersion: '1.0.0',
    links: { npm: 'https://www.npmjs.com/package/homebridge-test' },
    name: 'homebridge-test',
    private: false,
    publicPackage: true,
    recommendChildBridge: false,
    settingsSchema: true,
    updateAvailable: false,
    updateTag: null,
    verifiedPlugin: true,
    verifiedPlusPlugin: false,
    ...overrides,
  }
}

/**
 * A child bridge as the status socket reports it.
 * @param overrides - fields to change
 */
export function makeChildBridge(overrides: Partial<ChildBridge> = {}): ChildBridge {
  return {
    identifier: 'homebridge-test.TestPlatform',
    manuallyStopped: false,
    name: 'Test Bridge',
    paired: true,
    pid: 1234,
    pin: '031-45-154',
    plugin: 'homebridge-test',
    port: 51000,
    setupUri: 'X-HM://0024K0RR0TEST',
    status: 'ok',
    username: '0E:12:34:56:78:9A',
    ...overrides,
  }
}

/**
 * A paired bridge as GET /server/pairings reports it.
 * @param overrides - fields to change
 */
export function makePairing(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    category: 2,
    configVersion: 1,
    displayName: 'Homebridge Test',
    lastFirmwareVersion: '2.0.0',
    pincode: '031-45-154',
    setupID: 'TEST',
    _category: 'bridge',
    _id: 'test-pairing-id',
    _isPaired: true,
    _main: true,
    _setupCode: 'X-HM://0024K0RR0TEST',
    _username: '0E:12:34:56:78:9A',
    ...overrides,
  }
}
