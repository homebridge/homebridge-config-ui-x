import type { DestroyRef } from '@angular/core'

interface ListenableSocket {
  on: (event: string, handler: (...args: any[]) => void) => unknown
  off: (event: string, handler: (...args: any[]) => void) => unknown
}

/**
 * Add socket handlers that come off again when the component is destroyed.
 *
 * The socket.io namespaces are cached and shared between pages, and `io.end()` only emits `end`: a handler added
 * with `socket.on` stays for the life of the page, so each visit added one more live copy (a toast, a reload or a
 * terminal write per copy), and each copy kept its destroyed component in memory.
 *
 * @example listenUntilDestroyed(this.destroyRef, this.io.socket).on('homebridge-status', data => ...)
 */
export function listenUntilDestroyed(destroyRef: DestroyRef, socket: ListenableSocket) {
  return {
    on(event: string, handler: (...args: any[]) => void): void {
      // Called after an await, the page may be gone already: then add nothing (onDestroy would throw NG0911,
      // and a handler added first would stay for good)
      if (destroyRef.destroyed) {
        return
      }
      destroyRef.onDestroy(() => socket.off(event, handler))
      socket.on(event, handler)
    },
  }
}
