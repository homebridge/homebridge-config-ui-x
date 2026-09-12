import json5 from 'json5'

// Plugin schemas are not exhaustive: this is a best-effort display aid, never
// an authorization boundary or a source of config to save back to disk.
const secretKey = /password|passwd|passphrase|secret|token|apikey|privatekey|authorization|credential|^(?:pin|pincode|cookie)$/i

export function redactConfig(config: string): string | null {
  try {
    return JSON.stringify(json5.parse(config), (key, value) => {
      return secretKey.test(key.replace(/[-_\s]/g, '')) ? '********' : value
    }, 4)
  } catch {
    // Do not fall back to the raw text when unsaved JSON is incomplete.
    return null
  }
}
