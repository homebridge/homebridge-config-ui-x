import type { FakeSettings } from '@/testing'
import type { ComponentFixture } from '@angular/core/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslatePipe } from '@ngx-translate/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PluginSupportComponent } from '@/app/modules/plugins/plugin-support/plugin-support.component'
import { SupportComponent } from '@/app/modules/support/support.component'
import { environment } from '@/environments/environment'
import { makeSettings } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The support page, and the smaller support panel a plugin's menu opens.
 *
 * Both are mostly a list of links out to documentation, Discord and Reddit, so
 * there is little logic — but the links themselves are worth checking:
 *
 * ⚠️ **every external link opens in a new tab, and must say `noopener`.**
 * Without it the page that opens can reach back through `window.opener` and
 * navigate this tab wherever it likes. There are around a dozen of them here and
 * one missing attribute is invisible on screen.
 */
describe('the support pages', () => {
  let settings: FakeSettings

  /**
   * Build the full support page.
   */
  function createPage(): ComponentFixture<SupportComponent> {
    TestBed.resetTestingModule()
    settings = makeSettings()

    TestBed.configureTestingModule({
      imports: [SupportComponent],
      providers: [provideTestTranslate(), provideFakes({ settings })],
    })

    // The real template is kept: the link assertions below are about its markup
    TestBed.overrideComponent(SupportComponent, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    const fixture = TestBed.createComponent(SupportComponent)
    fixture.detectChanges()
    return fixture
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('the page itself', () => {
    it('sets the page title', () => {
      createPage()

      expect(settings.setPageTitle).toHaveBeenCalledWith('support.title')
    })

    it('opens with both sections showing', () => {
      // Nothing here is long enough to be worth hiding by default
      const page = createPage().componentInstance

      expect(page.showFields()).toEqual({ general: true, dev: true })
    })

    it('hides a section when its heading is clicked', () => {
      const page = createPage().componentInstance

      page.toggleSection('general')

      expect(page.showFields().general).toBe(false)
    })

    it('brings a hidden section back', () => {
      const page = createPage().componentInstance

      page.toggleSection('dev')
      page.toggleSection('dev')

      expect(page.showFields().dev).toBe(true)
    })

    it('leaves the other section alone', () => {
      const page = createPage().componentInstance

      page.toggleSection('general')

      expect(page.showFields().dev).toBe(true)
    })

    it('tells a screen reader which sections are open', () => {
      // The chevron says it visually; aria-expanded is the same fact for anyone
      // not looking at it
      const fixture = createPage()

      const toggles = fixture.nativeElement.querySelectorAll('.disclosure-toggle')
      expect(toggles).toHaveLength(2)
      expect([...toggles].map((button: HTMLElement) => button.getAttribute('aria-expanded'))).toEqual(['true', 'true'])

      fixture.componentInstance.toggleSection('general')
      fixture.detectChanges()

      expect(fixture.nativeElement.querySelector('.disclosure-toggle').getAttribute('aria-expanded')).toBe('false')
    })
  })

  describe('the links out', () => {
    /** Every anchor on the page, with both sections open. */
    function links(): HTMLAnchorElement[] {
      return [...createPage().nativeElement.querySelectorAll('a[href]')]
    }

    it('has links to offer', () => {
      // Otherwise the assertions below check an empty list
      expect(links().length).toBeGreaterThan(5)
    })

    it('opens each one in a new tab without handing over this one', () => {
      // Collected rather than asserted one by one, so a failure names every
      // link that is wrong instead of stopping at the first
      const unsafe = links()
        .filter(link => link.getAttribute('target') !== '_blank' || link.getAttribute('rel') !== 'noopener noreferrer')
        .map(link => link.getAttribute('href'))

      expect(unsafe).toEqual([])
    })

    it('never links off the box over plain http', () => {
      // ⚠️ The api documentation link is deliberately excluded: it points at the
      // user's own homebridge instance, which is plain http unless they have set
      // up a certificate. Everything that leaves the network must be https
      const offTheBox = links().filter((link) => {
        const href = link.getAttribute('href') ?? ''
        return !href.startsWith('/') && !href.startsWith(environment.api.origin)
      })

      expect(offTheBox.length).toBeGreaterThan(5)
      for (const link of offTheBox) {
        expect(link.getAttribute('href')).toMatch(/^https:\/\//)
      }
    })

    it('says what each link is, for anyone who cannot see the icon', () => {
      // Every one of these is an icon-only button
      const unnamed = links()
        .filter(link => !link.getAttribute('aria-label'))
        .map(link => link.getAttribute('href'))

      expect(unnamed).toEqual([])
    })
  })

  describe('the link to the api documentation', () => {
    it('is a path on the same host in production', () => {
      // Served by the homebridge backend itself, whatever host and port that is
      const original = environment.production
      try {
        environment.production = true

        expect(createPage().componentInstance.swaggerUrl).toBe('/swagger')
      } finally {
        environment.production = original
      }
    })

    it('points at the backend when running the dev server', () => {
      // The dev server serves the UI on another port, so a relative path 404s
      expect(createPage().componentInstance.swaggerUrl).toBe(`${environment.api.origin}/swagger`)
    })
  })

  describe('the plugin support panel', () => {
    it('closes when dismissed', () => {
      const activeModal = { dismiss: vi.fn(), close: vi.fn() }
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({
        imports: [PluginSupportComponent],
        providers: [provideTestTranslate(), provideFakes({ activeModal })],
      })
      TestBed.overrideComponent(PluginSupportComponent, {
        set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
      })

      const fixture = TestBed.createComponent(PluginSupportComponent)
      fixture.detectChanges()
      fixture.componentInstance.dismissModal()

      expect(activeModal.dismiss).toHaveBeenCalled()
      expect(activeModal.close).not.toHaveBeenCalled()
    })
  })
})
