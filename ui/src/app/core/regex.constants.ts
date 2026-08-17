// ANSI escape sequences
// eslint-disable-next-line no-control-regex
export const RE_ANSI = /\x1B\[(\d{1,3}(;\d{1,2})?)?[mGK]/g

// eslint-disable-next-line no-control-regex, unicorn/escape-case
export const RE_ANSI_SIMPLE = /\x1b\[[0-9;]*m/g

// eslint-disable-next-line no-control-regex
export const RE_ANSI_FULL = /\x1B\[[\d;]*[a-z]/gi
export const RE_BRACKET_TAG = /36m\[.*?\]/

// Character / string manipulation
export const RE_COLON = /:/g
export const RE_CHAR_PAIRS = /.{1,2}/g
export const RE_UNDERSCORE = /_/g
export const RE_SLASH = /\//
export const RE_WHITESPACE = /\s+/g
export const RE_NEWLINE = /[\r\n]+/

// Text casing
export const RE_FIRST_UPPER = /^([A-Z])/
export const RE_UPPER = /([A-Z])/g
export const RE_CAMEL_CASE = /([a-z])([A-Z])/g
export const RE_WORD_START = /\b\w/g

// MAC address / device ID
export const RE_USERNAME = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i

// Plugin identification
export const RE_HOMEBRIDGE_PREFIX = /^homebridge /i

// Templating
export const RE_HOSTNAME_PLACEHOLDER = /\$\{\{HOSTNAME\}\}/g

// HAP name validation
// https://github.com/homebridge/HAP-NodeJS/blob/ee41309fd9eac383cdcace39f4f6f6a3d54396f3/src/lib/util/checkName.ts#L12
export const RE_HAP_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ']*[\p{L}\p{N}]$/u
export const RE_NON_ALNUM = /[^a-z0-9]/gi
export const RE_CONSECUTIVE_DASHES = /-+/g
export const RE_LEADING_TRAILING_DASH = /^-|-$/g
export const RE_INVALID_HAP_NAME_CHARS = /[^\p{L}\p{N} ']/gu
export const RE_LEADING_TRAILING_SPACE_APOSTROPHE = /^[ ']+|[ ']+$/g
export const RE_LEADING_TRAILING_NON_ALNUM_UNICODE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu

// JSON schema form
export const RE_LEADING_SYMBOLS = /^[\s\uF0D7\uF0D8\uF0A7\uF0A8]+/g
export const RE_TRAILING_CLICKABLE = /\s+clickable\s*$/i

// Browser / device detection
export const RE_IPAD_IPHONE_IPOD = /iPad|iPhone|iPod/
export const RE_SAFARI = /Safari/
export const RE_NON_SAFARI = /Chrome|CriOS|FxiOS|EdgiOS/

// Manage plugin
export const RE_STARTS_WITH_DIGIT = /^\d/
export const RE_KOFI = /ko-?fi/i

// Form values
/**
 * At least one character that is not whitespace.
 *
 * `Validators.required` only rejects null and the empty string, so a value of
 * spaces alone counts as filled in - which let a room be created with a name that
 * trimmed away to nothing.
 */
export const RE_NOT_BLANK = /\S/

// Scheduling
export const RE_WHITESPACE_SINGLE = /\s+/
export const RE_CRON_FIELD = /^[\d*,\-/]+$/

// Setup wizard
export const RE_SPINNER = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/
