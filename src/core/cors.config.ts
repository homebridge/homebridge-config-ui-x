import process from 'node:process'

import { RE_DEV_SERVER_ORIGIN } from './regex.constants.js'

/**
 * Shared CORS configuration for HTTP and WebSocket connections.
 *
 * In production the UI is served from the same origin as the API, so no other origin is ever allowed.
 * Only in development (`UIX_DEVELOPMENT=1`, as `npm run watch` sets) is the Angular dev server allowed,
 * on any hostname (localhost, 127.0.0.1, a local IP) on port 4200 or 8080.
 *
 * This must not apply in production: the answer allows credentials, and a browser sends the `hb-refresh`
 * cookie to any port of the same host. Another web app on port 8080 of the same machine (or a page with an
 * XSS hole there) could then read a fresh access token from `POST /api/auth/session`.
 */
export const devServerCorsConfig = {
  origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || (process.env.UIX_DEVELOPMENT === '1' && RE_DEV_SERVER_ORIGIN.test(origin))) {
      callback(null, true)
    } else {
      callback(null, false)
    }
  },
  credentials: true,
}
