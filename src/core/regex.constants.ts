// Character / string manipulation
export const RE_COLON = /:/g
export const RE_CHAR_PAIRS = /.{1,2}/g
export const RE_HYPHEN = /-/
export const RE_HYPHEN_GLOBAL = /-/g
export const RE_WHITESPACE = /\s+/

// URL patterns
export const RE_URL_WITH_OPTIONAL_PAREN = /\(?(?:https?|ftp):\/\/[\n\S]+/g
export const RE_URL = /(?:https?|ftp):\/\/[\n\S]+/g
export const RE_GITHUB_REPO = /https:\/\/github.com\/([^/]+)\/([^/#]+)/

// Encoding
export const RE_ENCODED_AT = /%40/g
export const RE_WORD_SEQUENCE = /\w\S*/g
export const RE_NON_NUMERIC_DOT = /[^0-9.]/g

// CORS
export const RE_DEV_SERVER_ORIGIN = /^https?:\/\/[^:]+:(?:4200|8080)$/

// Homebridge service
export const RE_SERVICE_NAME = /^[a-z0-9-]+$/i

// POSIX OS username — used to validate `--user` before interpolating into
// sudoers entries / service files. Matches `useradd` / Linux NAME_REGEX.
export const RE_OS_USERNAME = /^[a-z_][a-z0-9_-]*\$?$/

// npm package parsing
export const RE_SCOPED = /^(@[^/]+\/[^@/]+)(?:@([^/]+))?(\/.*)?$/
export const RE_NON_SCOPED = /^([^@/]+)(?:@([^/]+))?(\/.*)?$/

// Plugin identification
export const RE_PLUGIN_NAME = /^(?:@[\w-]+(?:\.[\w-]+)*\/)?homebridge-[\w-]+$/i

// MAC address / device ID
export const RE_DEVICE_ID = /^[0-9a-f]{2}(?::?[0-9a-f]{2}){5}$/i
export const RE_USERNAME = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i
export const RE_HEX_12 = /^[a-f0-9]{12}$/i
export const RE_HEX_ANY = /^[a-f0-9]+$/i

// Homebridge accessory / cache files
export const RE_ACCESSORY_INFO_FILE = /AccessoryInfo\.([A-Fa-f0-9]+)\.json$/
export const RE_CACHED_ACCESSORIES_EXACT = /^cachedAccessories\.([A-F,0-9]+)$/
export const RE_CACHED_ACCESSORIES = /cachedAccessories\.([A-F,0-9]+)/
export const RE_EXTERNAL_ACCESSORIES_EXACT = /^externalAccessories\.([A-F,0-9]+)$/

// Homebridge bridge config
export const RE_PIN = /^\d{3}-\d{2}-\d{3}$/
export const RE_CONFIG_BACKUP = /^config.json.\d{09,15}/
export const RE_VALID_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ']*[\p{L}\p{N}]$/u

// SSL / TLS
export const RE_PRIVATE_KEY = /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/
export const RE_CERTIFICATE = /-----BEGIN CERTIFICATE-----/
export const RE_IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
export const RE_IPV6 = /^(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i

// Backup
export const RE_BACKUP_FILENAME = /^homebridge-backup-[0-9a-z]{12}.\d{09,15}.tar.gz/i
export const RE_BACKUP_ID = /^[0-9a-z]{12}\.\d{9,15}$/i

// Version tags
export const RE_PRERELEASE_TYPE = /-(beta|alpha|test)\b/
export const RE_BETA_DATE = /^beta-\d{4}-\d{2}-\d{2}$/i
export const RE_TEST_DATE = /^test-\d{4}-\d{2}-\d{2}$/i
export const RE_TRAILING_DATE = /\d{4}-\d{2}-\d{2}$/
export const RE_STABLE_DATE = /^\d{4}-\d{2}-\d{2}$/

// Terminal output
// eslint-disable-next-line no-control-regex
export const RE_ANSI_COLOUR = /\x1B\[(\d{1,3}(;\d{1,2})?)?[mGK]/g

// Security
export const RE_PATH_TRAVERSAL = /^(\.\.(\/|\\|$))+/
export const RE_STATIC_ASSET_EXT = /^.*\.(?:jpe?g|gif|png|svg|ttf|woff2|css)$/i

// Allowlist for user-configured host / Homebridge restart and shutdown
// commands (`ui.restart`, `ui.linux.restart`, `ui.linux.shutdown`).
//
// Matches an optional `sudo` with simple flags (`-n`, `-E`, `-nE`, ...)
// followed by one of a small fixed set of trusted binaries
// (systemctl/service/shutdown/reboot/poweroff/halt/init), then zero or
// more space-separated arguments composed only of alphanumerics, dot,
// underscore, slash, dash, colon, equals. No shell metacharacters
// (`;`, `&`, `|`, `$`, `()`, backtick, redirects, quotes) — those
// would let an admin who can edit config.json inject arbitrary shell
// commands. Docker-mode `ui.restart` is set by the loader (not via
// the save endpoint), so it intentionally bypasses this allowlist.
export const RE_SAFE_RESTART_CMD = /^(?:sudo(?:\s+-[a-zA-Z]+)*\s+)?(?:systemctl|service|shutdown|reboot|poweroff|halt|init)(?:\s+[\w./:=-]+)*\s*$/
