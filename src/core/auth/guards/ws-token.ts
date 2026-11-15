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

/**
 * The user a guard verified the handshake token for. A handler that acts for "the current user" must read
 * the username from here, never from the message: anything in the message is chosen by the client.
 */
export interface WsUser {
  username: string
  admin: boolean
}

export function setWsUser(client: any, payload: { username?: string, admin?: boolean }): void {
  if (client && typeof payload?.username === 'string') {
    client.data = {
      ...(client.data ?? {}),
      user: { username: payload.username, admin: payload.admin === true } satisfies WsUser,
    }
  }
}

export function getWsUser(client: any): WsUser | undefined {
  return client?.data?.user
}
