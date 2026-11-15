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
})
