import type { Socket } from 'socket.io-client'

import { InjectionToken } from '@angular/core'
import { io } from 'socket.io-client'

/**
 * How a socket gets built.
 *
 * ⚠️ This exists so a spec can substitute a fake socket. `vi.mock` cannot:
 * the unit-test builder compiles the app through its build target, which bakes
 * third-party imports into the app bundle, so a module mock registered in the
 * spec's module graph never reaches the copy of socket.io the service holds.
 * Angular DI is the one seam that survives bundling.
 */
export type SocketFactory = (url: string, options: Record<string, unknown>) => Socket

export const SOCKET_FACTORY = new InjectionToken<SocketFactory>('SOCKET_FACTORY', {
  providedIn: 'root',
  factory: () => (url, options) => io(url, options),
})
