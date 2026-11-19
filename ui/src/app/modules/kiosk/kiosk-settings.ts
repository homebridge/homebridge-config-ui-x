/** Per-tablet kiosk settings, stored in this browser only */
export type KioskTheme = 'dark' | 'light'

export interface KioskSettings {
  /** Exit PIN, 4 to 8 digits. Absent when no PIN is set */
  pin?: string
  /** Whether locks, garage doors and security systems can be changed from this tablet */
  allowSensitive: boolean
  theme: KioskTheme
}

export const KIOSK_SETTINGS_KEY = 'kiosk-settings-v1'

const PIN_PATTERN = /^\d{4,8}$/

export function isValidKioskPin(pin: string): boolean {
  return PIN_PATTERN.test(pin)
}

/** Settings for a view, with defaults for anything missing or malformed */
export function normaliseKioskSettings(entry: unknown): KioskSettings {
  const value = (entry && typeof entry === 'object'
    ? entry
    : {}) as Record<string, unknown>
  return {
    pin: typeof value.pin === 'string' && isValidKioskPin(value.pin)
      ? value.pin
      : undefined,
    allowSensitive: value.allowSensitive === true,
    theme: value.theme === 'light'
      ? 'light'
      : 'dark',
  }
}

function readStore(): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(KIOSK_SETTINGS_KEY)
    const parsed = raw
      ? JSON.parse(raw)
      : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    // Storage unavailable or corrupt: every view starts from the defaults
    return {}
  }
}

export function loadKioskSettings(viewId: string): KioskSettings {
  return normaliseKioskSettings(readStore()[viewId])
}

/** Save one view's settings. Returns false when storage is unavailable; the page keeps working for this visit. */
export function saveKioskSettings(viewId: string, settings: KioskSettings): boolean {
  try {
    const store = readStore()
    store[viewId] = settings
    window.localStorage.setItem(KIOSK_SETTINGS_KEY, JSON.stringify(store))
    return true
  } catch {
    return false
  }
}
