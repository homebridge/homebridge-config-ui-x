import type { FastifyReply } from 'fastify'

import { API_PREFIX } from './api.constants.js'
import { RE_HASHED_ASSET } from './regex.constants.js'

export function setStaticAssetCacheHeaders(reply: unknown, path: string): void {
  const res = reply as FastifyReply
  // sendFile() also passes through this callback. Preserve the private,
  // non-cacheable policy set by the authenticated plugin-settings route;
  // otherwise a hash-looking plugin filename would become public and
  // immutable for a year after its asset session was revoked.
  if (res.request.url.startsWith(`${API_PREFIX}/plugins/settings-ui/`)) {
    res.header('Cache-Control', 'no-store, private')
  } else if (RE_HASHED_ASSET.test(path)) {
    res.header('Cache-Control', 'public,max-age=31536000,immutable')
  } else {
    res.header('Cache-Control', 'no-cache')
  }
}
