import type { DestroyRef } from '@angular/core'

import { describe, expect, it } from 'vitest'

import { listenUntilDestroyed } from '@/app/core/communication/socket-listener'
import { fakeSocket } from '@/testing/fakes/ws.fake'

describe('listenUntilDestroyed', () => {
  it('takes the handlers off the shared socket when the component is destroyed', () => {
    const socket = fakeSocket()
    const onDestroy: Array<() => void> = []
    const destroyRef = {
      onDestroy: (fn: () => void) => onDestroy.push(fn),
    } as unknown as DestroyRef

    listenUntilDestroyed(destroyRef, socket).on('homebridge-status', () => {})
    listenUntilDestroyed(destroyRef, socket).on('disconnect', () => {})
    expect(socket.handlers('homebridge-status')).toHaveLength(1)

    onDestroy.forEach(fn => fn())

    expect(socket.handlers('homebridge-status')).toHaveLength(0)
    expect(socket.handlers('disconnect')).toHaveLength(0)
  })

  it('adds nothing, and does not throw, once the component is gone', () => {
    // Regression: the setup wizard adds a handler after two awaits. Left mid-upload, Angular's onDestroy threw
    // NG0911 after the handler had been added, so it stayed on the shared socket for good
    const socket = fakeSocket()
    const destroyRef = {
      destroyed: true,
      onDestroy: () => {
        throw new Error('NG0911: View has already been destroyed.')
      },
    } as unknown as DestroyRef

    expect(() => listenUntilDestroyed(destroyRef, socket).on('stdout', () => {})).not.toThrow()
    expect(socket.handlers('stdout')).toHaveLength(0)
  })
})
