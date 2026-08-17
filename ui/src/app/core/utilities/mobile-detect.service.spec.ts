import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MobileDetectService } from '@/app/core/utilities/mobile-detect.service'

/**
 * The service that stops the page behind a modal scrolling on a phone.
 *
 * ⚠️ **iOS scrolls the page under an open modal unless `touchmove` is cancelled.**
 * The user drags the list inside the modal, the page behind moves instead, and
 * when they close it they are somewhere else entirely.
 *
 * ⚠️ **The lock has to be released exactly as often as it is taken.** The listener
 * is added once and removed once, so a service that added it twice would leave one
 * behind and the page would stay unscrollable after every modal had closed —
 * fixable only by reloading.
 */
describe('mobileDetectService', () => {
  let service: MobileDetectService
  let addListener: ReturnType<typeof vi.spyOn>
  let removeListener: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({})
    service = TestBed.inject(MobileDetectService)
    addListener = vi.spyOn(document.body, 'addEventListener')
    removeListener = vi.spyOn(document.body, 'removeEventListener')
    // ⚠️ `vi.spyOn` on an already-spied method hands back the SAME spy, so without
    // this the call list carries over from the previous case and the counts are
    // whatever the whole file has done so far
    addListener.mockClear()
    removeListener.mockClear()
  })

  it('reads the browser it is running in', () => {
    // Everything else the app asks it is a question about this
    expect(service.detect).toBeDefined()
    expect(typeof service.detect.mobile).toBe('function')
  })

  it('starts with the page free to scroll', () => {
    expect(service.isTouchMoveLocked).toBe(false)
  })

  it('cancels touch scrolling when asked', () => {
    service.disableTouchMove()

    expect(service.isTouchMoveLocked).toBe(true)
    expect(addListener).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: false })
  })

  it('registers the listener as cancellable', () => {
    // ⚠️ `passive: false` is the whole point. A passive listener cannot call
    // preventDefault, so the page would scroll anyway and the listener would do
    // nothing but cost a frame
    service.disableTouchMove()

    expect(addListener.mock.calls[0][2]).toEqual({ passive: false })
  })

  it('actually cancels the touch', () => {
    service.disableTouchMove()
    const handler = addListener.mock.calls[0][1] as (event: Event) => void
    const event = new Event('touchmove', { cancelable: true })

    handler(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('adds the listener once however many times it is asked', () => {
    // Two modals open at once would otherwise leave one listener behind when the
    // first of them closes
    service.disableTouchMove()
    service.disableTouchMove()
    service.disableTouchMove()

    expect(addListener).toHaveBeenCalledOnce()
  })

  it('lets the page scroll again', () => {
    service.disableTouchMove()

    service.enableTouchMove()

    expect(service.isTouchMoveLocked).toBe(false)
    expect(removeListener).toHaveBeenCalledWith('touchmove', expect.any(Function))
  })

  it('removes the same listener it added', () => {
    // ⚠️ A different function reference removes nothing, and the page stays stuck
    service.disableTouchMove()

    service.enableTouchMove()

    expect(removeListener.mock.calls[0][1]).toBe(addListener.mock.calls[0][1])
  })

  it('can be locked again after being released', () => {
    service.disableTouchMove()
    service.enableTouchMove()

    service.disableTouchMove()

    expect(service.isTouchMoveLocked).toBe(true)
    expect(addListener).toHaveBeenCalledTimes(2)
  })

  it('is harmless to unlock when nothing was locked', () => {
    expect(() => service.enableTouchMove()).not.toThrow()
    expect(service.isTouchMoveLocked).toBe(false)
  })
})
