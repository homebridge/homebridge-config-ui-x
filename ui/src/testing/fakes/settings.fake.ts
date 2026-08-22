import type { EnvInterface } from '@/app/core/settings.interfaces'
import type { SettingsService } from '@/app/core/ui/settings.service'

import { signal } from '@angular/core'
import { of, Subject } from 'rxjs'
import { vi } from 'vitest'

import { TEST_INSTANCE_ID } from '../constants'

export type FakeSettings = SettingsService & { env: EnvInterface }

export interface MakeSettingsOverrides extends Partial<Omit<FakeSettings, 'env'>> {
  env?: Partial<EnvInterface>
}

/**
 * A plausible `env` block. Every flag defaults to the plain, non-container,
 * everything-enabled case, so a spec only states what it is actually about.
 * @param overrides - fields to change
 */
export function makeEnv(overrides: Partial<EnvInterface> = {}): EnvInterface {
  return {
    platform: 'linux',
    enableAccessories: true,
    enableTerminalAccess: true,
    restrictLogsToAdmins: false,
    featureFlags: {},
    homebridgeInstanceName: 'Homebridge Test',
    homebridgeVersion: '2.0.0',
    homebridgeUiVersion: '5.0.0',
    nodeVersion: '22.0.0',
    packageName: 'homebridge-config-ui-x',
    packageVersion: '5.0.0',
    runningInDocker: false,
    runningInLinux: true,
    runningInFreeBSD: false,
    runningInSynologyPackage: false,
    runningInPackageMode: false,
    runningOnRaspberryPi: false,
    runningOnRaspbianImage: false,
    canShutdownRestartHost: false,
    dockerOfflineUpdate: false,
    lang: 'en',
    temperatureUnits: 'c',
    port: 8581,
    instanceId: TEST_INSTANCE_ID,
    customWallpaperHash: '',
    setupWizardComplete: true,
    recommendChildBridges: true,
    scheduledBackupDisable: false,
    scheduledBackupPath: '/var/lib/homebridge/backups',
    ...overrides,
  }
}

/**
 * A stand-in for SettingsService - the most injected object in the app.
 *
 * Two defaults are mandatory rather than convenient: `settingsLoaded: true`
 * and an `onSettingsLoaded` that emits. The real property is a plain Subject
 * piped through `first()`, so a subscriber that attaches after the event has
 * already fired never hears anything - and every route guard waits on it, so
 * without these a guard spec hangs until the test times out.
 * @param overrides - fields to change; `env` is merged over the defaults
 */
export function makeSettings(overrides: MakeSettingsOverrides = {}): FakeSettings {
  const { env: envOverrides, ...rest } = overrides

  const settings = {
    env: makeEnv(envOverrides),
    host: 'localhost',
    proxyHost: 'localhost:8581',
    formAuth: true,
    sessionTimeout: 28800,
    sessionTimeoutInactivityBased: false,
    uiVersion: '5.0.0',
    theme: 'deep-purple',
    lightingMode: 'auto',
    currentLightingMode: 'auto',
    actualLightingMode: 'light',
    browserLightingMode: 'light',
    menuMode: 'default',
    keepOrphans: false,
    wallpaper: '',
    serverTimeOffset: 0,
    rtl: false,
    browserLang: 'en',
    settingsLoaded: true,
    onSettingsLoaded: of(undefined),
    // The shell reads this every render - a plain `false` would not be callable
    serverUnreachable: signal(false),
    restartToastRef: null,
    terminalSettingsChanged: new Subject(),
    themeList: [
      'orange',
      'red',
      'pink',
      'purple',
      'deep-purple',
      'indigo',
      'blue',
      'blue-grey',
      'cyan',
      'green',
      'teal',
      'grey',
      'brown',
    ],

    getAppSettings: vi.fn(async () => undefined),
    setBrowserLightingMode: vi.fn(),
    setLightingMode: vi.fn(),
    setTheme: vi.fn(),
    setMenuMode: vi.fn(),
    setKeepOrphans: vi.fn(),
    setLang: vi.fn(),
    setItem: vi.fn(),
    setPageTitle: vi.fn(),
    showRestartToast: vi.fn(),
    getTerminalThemeOptions: vi.fn(() => ({ theme: {}, allowTransparency: false })),
    getTerminalOptions: vi.fn(() => ({})),
  } as unknown as FakeSettings

  // Kept real because components read the value straight back after writing it
  settings.setEnvItem = vi.fn((key: string, value: any) => {
    const keys = key.split('.')
    let current = settings.env as Record<string, any>
    for (const part of keys.slice(0, -1)) {
      current[part] ??= {}
      current = current[part]
    }
    current[keys.at(-1)!] = value
  })

  settings.isFeatureEnabled = vi.fn((featureKey: string) => settings.env.featureFlags?.[featureKey] ?? false)

  settings.getEffectiveTerminalLightingMode = vi.fn(() => (
    settings.actualLightingMode === 'dark' ? 'dark' : settings.env.terminal?.lightingMode || 'dark'
  ))

  return Object.assign(settings, rest)
}
