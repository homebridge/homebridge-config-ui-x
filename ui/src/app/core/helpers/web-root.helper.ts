/**
 * The rules for the `webRoot` setting, the path the UI is served under (such as `/homebridge`).
 *
 * ⚠️ These are the rules of the server (`normalizeWebRoot()` in `src/core/web-root.ts`). Keep the two the same:
 * the server starts at the root when it reads a value it cannot use.
 */

/** The server answers on these paths itself */
const RESERVED = new Set([
  'api',
  'assets',
  'media',
  'socket.io',
  'swagger',
])

const RE_PART = /^[\w.~-]+$/
const RE_ONLY_DOTS = /^\.+$/
const RE_OUTER_SLASHES = /^\/|\/$/g

const MAX_LENGTH = 100

/**
 * A typed web root as it is saved: `/path`, with no slash at the end.
 * @returns an empty text for no web root, or `null` for a value the server cannot use
 */
export function readWebRoot(value: string | null | undefined): string | null {
  const path = (value ?? '').trim().replace(RE_OUTER_SLASHES, '')
  if (!path) {
    return ''
  }

  const parts = path.split('/')
  const usable = path.length < MAX_LENGTH
    && parts.every(part => RE_PART.test(part) && !RE_ONLY_DOTS.test(part))
    && !RESERVED.has(parts[0].toLowerCase())

  return usable
    ? `/${path}`
    : null
}
