import json5 from 'json5'

// Plugin schemas are not exhaustive: this is a best-effort display aid, never
// an authorization boundary or a source of config to save back to disk.
const secretKey = /password|passwd|passphrase|secret|token|apikey|appkey|accesskey|privatekey|authorization|credential|setupcode|^(?:pin|pincode|cookie)$/i

// Settings ABOUT a secret rather than the secret itself, e.g. tokenRefreshInterval
const notSecretSuffix = /(?:interval|timeout|expiry|expires|ttl|url|uri|endpoint|enabled|type|mode|count|length)$/i

/**
 * Whether a config key looks like it holds a secret, judged by its name alone.
 * Shared with the settings forms, so both hide the same fields.
 */
export function isSecretKey(key: string): boolean {
  const normalised = key.replace(/[-_\s]/g, '')
  return secretKey.test(normalised) && !notSecretSuffix.test(normalised)
}

export function redactConfig(config: string): string | null {
  try {
    return JSON.stringify(json5.parse(config), (key, value) => {
      return isSecretKey(key)
        ? '********'
        : value
    }, 4)
  } catch {
    // Do not fall back to the raw text when unsaved JSON is incomplete.
    return null
  }
}
