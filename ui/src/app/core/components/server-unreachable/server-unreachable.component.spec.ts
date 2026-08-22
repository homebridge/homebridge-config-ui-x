import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ServerUnreachableComponent } from '@/app/core/components/server-unreachable/server-unreachable.component'
import { provideTestTranslate } from '@/testing/providers'

/**
 * The one thing the app can draw before it knows anything about the server.
 *
 * It is only ever on screen while the first settings load is failing, so the
 * point of these specs is that it says something useful for as long as that
 * lasts - and that it cleans up after itself when the settings finally arrive.
 */
describe('serverUnreachableComponent', () => {
  function create() {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      imports: [ServerUnreachableComponent],
      providers: [provideTestTranslate()],
    })
    const fixture = TestBed.createComponent(ServerUnreachableComponent)
    fixture.detectChanges()
    return fixture
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('says it is waiting as soon as it appears', () => {
    const fixture = create()

    expect(fixture.nativeElement.querySelector('.hb-unreachable')).toBeTruthy()
    expect(fixture.nativeElement.querySelector('.hb-unreachable-help')).toBeNull()
  })

  // Everything else on this page is still by the time the logo has drawn, and a
  // still page reads as a crashed one
  it('keeps something moving while it waits', () => {
    const fixture = create()

    expect(fixture.nativeElement.querySelector('.hb-unreachable h2 .fa-circle-notch.fa-spin')).toBeTruthy()
  })

  it('offers help once the wait is no longer normal', () => {
    const fixture = create()

    vi.advanceTimersByTime(30000)
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('.hb-unreachable-help')).toBeTruthy()
  })

  // The wiki is the only place that can help here, since every page of the UI
  // that could have explained this is on the server that is not answering
  it('links to the wiki section for a UI that will not load', () => {
    const fixture = create()

    vi.advanceTimersByTime(30000)
    fixture.detectChanges()

    const link = fixture.nativeElement.querySelector('.hb-unreachable-link')
    expect(link.getAttribute('href')).toBe('https://github.com/homebridge/homebridge-config-ui-x/wiki/Troubleshooting#the-homebridge-ui-will-not-load')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('drops its timer when the server comes back and it is torn down', () => {
    const fixture = create()
    const component = fixture.componentInstance

    fixture.destroy()
    vi.advanceTimersByTime(30000)

    expect(component.takingLong()).toBe(false)
  })
})
