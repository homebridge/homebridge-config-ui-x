import type { IncomingMessage, Server } from 'node:http'

import process from 'node:process'

/**
 * The web root is a path the UI can be served under, such as `/homebridge`, for a reverse proxy that shares one
 * address between several apps (`https://server/homebridge/`).
 *
 * The server answers under the web root and still answers at the root. Health checks, `hb-service status` and
 * the nginx of the Raspberry Pi and VM images all call the root address, and a reverse proxy may take the path
 * off before it passes a request on.
 */

/** The first part of a web root cannot be a path the server answers on itself */
const RESERVED = new Set([
  'api',
  'assets',
  'media',
  'socket.io',
  'swagger',
])

/** Letters, numbers and `. _ ~ -`: the value goes into the page, a cookie and a log line as it is */
const RE_PART = /^[\w.~-]+$/
const RE_ONLY_DOTS = /^\.+$/
const RE_OUTER_SLASHES = /^\/|\/$/g
const RE_BASE_TAG = /<base href="\/"/

const MAX_LENGTH = 100

/**
 * The web root from config.json, as `/path` with no slash at the end.
 * @returns an empty text when there is none, or when the value is not one the server can use
 */
export function normalizeWebRoot(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  const path = value.trim().replace(RE_OUTER_SLASHES, '')
  if (!path || path.length >= MAX_LENGTH) {
    return ''
  }

  const parts = path.split('/')
  if (parts.some(part => !RE_PART.test(part) || RE_ONLY_DOTS.test(part)) || RESERVED.has(parts[0].toLowerCase())) {
    return ''
  }

  return `/${path}`
}

/**
 * The web root the server uses. There is none in development, as the other network settings (host, ssl): the
 * dev server on port 4200 calls the root address of this one.
 */
export function activeWebRoot(value: unknown): string {
  return process.env.UIX_DEVELOPMENT === '1'
    ? ''
    : normalizeWebRoot(value)
}

/**
 * Take the web root off the front of a request address.
 * An address that does not start with the web root is returned as it is.
 */
export function stripWebRoot(url: string, webRoot: string): string {
  if (!webRoot || !url.startsWith(webRoot)) {
    return url
  }

  const rest = url.slice(webRoot.length)
  if (rest === '') {
    return '/'
  }
  if (rest.startsWith('/')) {
    return rest
  }
  if (rest.startsWith('?')) {
    return `/${rest}`
  }

  // Another path that only starts with the same letters, such as /homebridge-x
  return url
}

/**
 * Point the page at the web root. Its scripts, styles, icons, API calls and page links are all relative to
 * the `<base>` tag.
 */
export function setBaseHref(indexHtml: string, webRoot: string): string {
  return webRoot
    ? indexHtml.replace(RE_BASE_TAG, `<base href="${webRoot}/"`)
    : indexHtml
}

/**
 * Make a server answer under the web root as well as at the root.
 *
 * This works on the Node server, below Fastify, as socket.io answers there too: it looks at each request
 * before Fastify does. Call it after the app is initialised. socket.io wraps the listeners that are on the server
 * when it attaches, and a listener added before that would run after its path check.
 */
export function serveUnderWebRoot(server: Server, webRoot: string): void {
  if (!webRoot) {
    return
  }

  const strip = (req: IncomingMessage) => {
    req.url = stripWebRoot(req.url ?? '/', webRoot)
  }

  server.prependListener('request', strip)
  server.prependListener('upgrade', strip)
}
