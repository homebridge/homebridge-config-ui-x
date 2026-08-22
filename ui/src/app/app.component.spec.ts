import type { FakeSettings } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { NavigationError, provideRouter, Router } from '@angular/router'
import { provideTranslateService, TranslateService } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppComponent } from '@/app/app.component'
import { AVAILABLE_WIDGETS, WIDGETS_WITH_SETTINGS } from '@/app/modules/status/widgets/widgets.component'
import { fireMatchMediaChange, locationReload, makeSettings, setMatchMedia } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The app shell, and the widget registry it has nothing to do with but which has
 * nowhere better to live.
 *
 * The shell's own job is small and entirely about recovery and locale:
 *
 * ⚠️ **the chunk-load reload.** After a deploy the router asks for a hashed JS
 * file that no longer exists, `loadComponent` rejects, and the user is left on a
 * blank page with only a console error. Detecting that and forcing a reload is
 * the difference between "it fixed itself" and "the UI is broken".
 */
describe('appComponent', () => {
  let settings: FakeSettings
  let routerEvents: Subject<any>
  let translate: TranslateService
  let reload: ReturnType<typeof vi.fn>

  function create(options: { storedLang?: string, browserLang?: string } = {}) {
    TestBed.resetTestingModule()
    settings = makeSettings()
    routerEvents = new Subject()

    if (options.storedLang !== undefined) {
      window.localStorage.setItem('uix.lang', options.storedLang)
    }

    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        // ⚠️ NOT `provideTestTranslate()` here. That presets `lang: 'en'`, and
        // the shell only picks a language when none is set yet ("do not override
        // one SettingsService already chose") - so with a preset the whole
        // language-selection branch is unreachable and every assertion about it
        // would pass for the wrong reason
        provideTranslateService({ fallbackLang: 'en' }),
        provideFakes({ settings }),
      ],
    })

    TestBed.overrideComponent(AppComponent, {
      set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
    })

    // The shell subscribes in its constructor, so the stream has to be in place
    // before the component is built
    Object.defineProperty(TestBed.inject(Router), 'events', { value: routerEvents, configurable: true })

    translate = TestBed.inject(TranslateService)
    if (options.browserLang !== undefined) {
      vi.spyOn(translate, 'getBrowserLang').mockReturnValue(options.browserLang)
      vi.spyOn(translate, 'getBrowserCultureLang').mockReturnValue(options.browserLang)
    }

    reload = locationReload
    reload.mockClear()

    const fixture = TestBed.createComponent(AppComponent)
    fixture.detectChanges()
    return fixture
  }

  /**
   * Wait until the shell has settled on a language.
   *
   * ⚠️ Neither microtask flushing nor a fixed number of task turns will do. The
   * shell awaits 29 dynamic `import()` calls for the locale JSON, and on a loaded
   * machine they do not all land inside any count that could be picked here - a
   * fixed ten turns was enough almost every run and then intermittently was not,
   * which is the worst way for a test to behave. This waits for the shell's own
   * signal that it is done instead.
   */
  async function settle() {
    await vi.waitUntil(() => translate.getCurrentLang(), { timeout: 5000, interval: 10 })
  }

  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('recovering from a stale chunk after a deploy', () => {
    it.each([
      ['a ChunkLoadError by name', { name: 'ChunkLoadError', message: 'whatever' }],
      ['the webpack message', { name: 'Error', message: 'Loading chunk 42 failed' }],
      ['the vite message', { name: 'TypeError', message: 'Failed to fetch dynamically imported module: /x.js' }],
    ])('reloads the page on %s', (_label, error) => {
      create()

      routerEvents.next(new NavigationError(1, '/plugins', error))

      expect(reload).toHaveBeenCalled()
    })

    it('matches the chunk message whatever its case', () => {
      create()

      routerEvents.next(new NavigationError(1, '/plugins', { name: 'Error', message: 'loading CHUNK 42 failed' }))

      expect(reload).toHaveBeenCalled()
    })

    it('leaves an ordinary navigation failure alone', () => {
      // A guard rejecting, or a 404 route, must not reload in a loop
      create()

      routerEvents.next(new NavigationError(1, '/plugins', new Error('Cannot match any routes')))

      expect(reload).not.toHaveBeenCalled()
    })

    it('leaves a non-object error alone', () => {
      create()

      routerEvents.next(new NavigationError(1, '/plugins', 'something went wrong'))

      expect(reload).not.toHaveBeenCalled()
    })

    it('ignores an error with no navigation attached', () => {
      create()

      routerEvents.next(new NavigationError(1, '/plugins', null))

      expect(reload).not.toHaveBeenCalled()
    })

    it('ignores any other router event', () => {
      create()

      routerEvents.next({ id: 1, url: '/plugins' })

      expect(reload).not.toHaveBeenCalled()
    })
  })

  describe('following the browser theme', () => {
    it('tells the settings which way the browser is set on load', () => {
      setMatchMedia(true)
      create()

      expect(settings.setBrowserLightingMode).toHaveBeenCalledWith('dark')
    })

    it('reads a light browser as light', () => {
      setMatchMedia(false)
      create()

      expect(settings.setBrowserLightingMode).toHaveBeenCalledWith('light')
    })

    it('follows the browser when the user changes it mid-session', () => {
      setMatchMedia(false)
      create()
      vi.mocked(settings.setBrowserLightingMode).mockClear()

      fireMatchMediaChange(true)

      expect(settings.setBrowserLightingMode).toHaveBeenCalledWith('dark')
    })

    it('stops following once the shell is destroyed', () => {
      setMatchMedia(false)
      const fixture = create()
      fixture.destroy()
      vi.mocked(settings.setBrowserLightingMode).mockClear()

      fireMatchMediaChange(true)

      expect(settings.setBrowserLightingMode).not.toHaveBeenCalled()
    })
  })

  describe('right to left languages', () => {
    it('turns the layout around for hebrew', () => {
      create()

      // ⚠️ `onLangChange` is a getter returning `asObservable()`, so the Subject
      // behind it has to be pushed directly
      ;(translate as any)._onLangChange.next({ lang: 'he', translations: {} })

      expect(settings.rtl).toBe(true)
    })

    it('leaves it alone for every other language', () => {
      create()

      ;(translate as any)._onLangChange.next({ lang: 'ar', translations: {} })

      expect(settings.rtl).toBe(false)
    })
  })

  describe('picking the starting language', () => {
    it('prefers the language the user last chose', async () => {
      // Persisted in localStorage so the very first render is already in the
      // right locale, before the server settings arrive
      create({ storedLang: 'de', browserLang: 'fr' })
      await settle()

      expect(translate.getCurrentLang()).toBe('de')
    })

    it('falls back to the browser language when nothing was chosen', async () => {
      create({ browserLang: 'fr' })
      await settle()

      expect(translate.getCurrentLang()).toBe('fr')
    })

    it('treats an explicit auto choice as no choice', async () => {
      create({ storedLang: 'auto', browserLang: 'fr' })
      await settle()

      expect(translate.getCurrentLang()).toBe('fr')
    })

    it('ignores a stored language the app does not ship', async () => {
      // A locale removed in an update would otherwise leave the UI untranslated
      create({ storedLang: 'kl', browserLang: 'fr' })
      await settle()

      expect(translate.getCurrentLang()).toBe('fr')
    })

    it('always has english to fall back on', () => {
      // No wait here, unlike the cases above: a browser language the app does not
      // ship means the shell never picks one at all, so there is nothing to wait
      // for. English being there anyway is the whole point
      create({ browserLang: 'kl' })

      expect(translate.getCurrentLang()).toBeFalsy()
      expect(translate.getFallbackLang()).toBe('en')
    })
  })

  /**
   * The registry the status page and the widget-control modal both read.
   *
   * ⚠️ There are three lists that have to agree, and nothing but this checks
   * them: the `availableWidgets` map the component instantiates from, the
   * `AVAILABLE_WIDGETS` names the status page offers, and `WIDGETS_WITH_SETTINGS`.
   * A widget in the map but missing from the names list can never be added; a
   * name with no map entry is offered and then silently fails to load.
   */
  describe('the widget registry', () => {
    /** The keys of the private map the component builds its widgets from. */
    async function mapKeys(): Promise<string[]> {
      const { WidgetsComponent } = await import('@/app/modules/status/widgets/widgets.component')
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({ imports: [WidgetsComponent] })
      const fixture = TestBed.createComponent(WidgetsComponent)
      return Object.keys((fixture.componentInstance as any).availableWidgets)
    }

    it('offers exactly the widgets it can actually build', async () => {
      expect([...AVAILABLE_WIDGETS].sort()).toEqual((await mapKeys()).sort())
    })

    it('names every widget once', async () => {
      expect(new Set(AVAILABLE_WIDGETS).size).toBe(AVAILABLE_WIDGETS.length)
      expect(new Set(WIDGETS_WITH_SETTINGS).size).toBe(WIDGETS_WITH_SETTINGS.length)
    })

    it('only claims settings for widgets that exist', async () => {
      // A settings entry for a widget nobody can add is a dead menu item
      for (const name of WIDGETS_WITH_SETTINGS) {
        expect(AVAILABLE_WIDGETS).toContain(name)
      }
    })

    it('builds nothing for a widget name it does not know', async () => {
      // A layout saved by a newer version can name a widget this one lacks
      const { WidgetsComponent } = await import('@/app/modules/status/widgets/widgets.component')
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({ imports: [WidgetsComponent] })

      const fixture = TestBed.createComponent(WidgetsComponent)
      fixture.componentRef.setInput('widget', {
        component: 'SomeWidgetFromTheFuture',
        $resizeEvent: new Subject(),
        $configureEvent: new Subject(),
      } as any)

      expect(() => fixture.detectChanges()).not.toThrow()
      expect(fixture.nativeElement.children).toHaveLength(0)
    })
  })

  /**
   * ⚠️ The one thing the shell can render itself. Until the settings arrive no
   * route can activate, so if the first load is failing the shell has to say so
   * - otherwise the user is looking at an empty page with no clue that anything
   * is happening. Built with the real imports, since the point is that the
   * markup renders.
   */
  describe('waiting for the server', () => {
    function createShell(unreachable: boolean) {
      TestBed.resetTestingModule()
      const settings = makeSettings()
      settings.serverUnreachable.set(unreachable)

      TestBed.configureTestingModule({
        imports: [AppComponent],
        providers: [
          provideRouter([]),
          provideTestTranslate(),
          provideFakes({ settings }),
        ],
      })

      const fixture = TestBed.createComponent(AppComponent)
      fixture.detectChanges()
      return fixture
    }

    it('says it is waiting when the first settings load has not landed', () => {
      const fixture = createShell(true)

      expect(fixture.nativeElement.querySelector('.hb-unreachable')).toBeTruthy()
    })

    it('shows nothing extra once the settings are in', () => {
      const fixture = createShell(false)

      expect(fixture.nativeElement.querySelector('.hb-unreachable')).toBeNull()
    })
  })
})
