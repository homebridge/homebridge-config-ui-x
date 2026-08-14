/**
 * Pull the JWT off a Socket.IO handshake.
 *
 * Clients send it in the `auth` payload, which travels in the handshake body
 * rather than the URL. The `query` fallback is for a browser still running a
 * pre-upgrade bundle: query strings are recorded by reverse proxies, access
 * logs and monitoring, so anything captured there stays a usable bearer
 * credential until it expires. The fallback can be dropped once a release
 * cycle has passed.
 */
export function extractWsToken(handshake: any): string | undefined {
  return handshake?.auth?.token || handshake?.query?.token
}
