import type { FakeApi, FakeToastr } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { Title } from '@angular/platform-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsService } from '@/app/core/ui/settings.service'
import { fakeApi, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * SettingsService is the most injected object in the app, so these specs pin
 * the parts other code reads constantly: the theme and lighting rules that
 * paint the page, the two setters that write into `env`, and the terminal
 * option derivation every terminal view depends on.
 *
 * The constructor fires `GET /auth/settings`, so every spec registers a
 * response for it even when the spec drives the service by hand afterwards.
 */
describe('SettingsService', () => {
  let api: FakeApi
  let toastr: FakeToastr
  let service: SettingsService

  function appSettings(overrides: Record<string, any> = {}) {
    return {
      formAuth: true,
      sessionTimeout: 28800,
      sessionTimeoutInactivityBased: false,
      theme: 'teal',
      lightingMode: 'light',
      menuMode: 'default',
      keepOrphans: false,
      wallpaper: '',
      serverTimestamp: new Date().toISOString(),
      env: {
        homebridgeInstanceName: 'Homebridge Test',
        packageVersion: '5.28.1',
        lang: 'en',
        featureFlags: {},
        ...overrides.env,
      },
      ...overrides,
    }
  }

  function create(settings: Record<string, any> = {}) {
    // A spec that wants different server settings re-creates the service, so
    // the module built by the default beforeEach has to go first
    TestBed.resetTestingModule()
    api = fakeApi().respond('get', '/auth/settings', appSettings(settings))
    toastr = toastrStub()
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ api, toastr }),
      ],
    })
    service = TestBed.inject(SettingsService)
    return service
  }

  /**
   * A server that refuses the first `failures` requests before answering, so a
   * spec can drive the retry the constructor performs.
   * @param failures - how many requests to reject before succeeding
   */
  function createFlaky(failures: number) {
    TestBed.resetTestingModule()
    let attempts = 0
    api = fakeApi().respond('get', '/auth/settings', () => {
      attempts += 1
      if (attempts <= failures) {
        throw new Error('connection refused')
      }
      return appSettings()
    })
    toastr = toastrStub()
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ api, toastr }),
      ],
    })
    service = TestBed.inject(SettingsService)
    return service
  }

  beforeEach(() => {
    create()
  })

  describe('loading', () => {
    it('reads the settings and announces that it has finished', async () => {
      const service = create({ env: { homebridgeInstanceName: 'Front Room' } })
      const loaded = vi.fn()
      service.onSettingsLoaded.subscribe(loaded)

      await service.getAppSettings()

      expect(service.settingsLoaded).toBe(true)
      expect(service.env.homebridgeInstanceName).toBe('Front Room')
      expect(loaded).toHaveBeenCalledTimes(1)
    })

    /**
     * ⚠️ The failure this pins is a blank page, not a missing setting. Every
     * route guard waits on `onSettingsLoaded`, which only ever emits on
     * success, so one refused request used to strand the app with no route
     * activated and nothing to look at. Refreshing while the UI restarts after
     * updating itself does exactly that.
     */
    it('retries the first load until the server answers, instead of giving up', async () => {
      vi.useFakeTimers()
      try {
        const service = createFlaky(2)
        const loaded = vi.fn()
        service.onSettingsLoaded.subscribe(loaded)

        // The first attempt has already been made and refused
        await vi.advanceTimersByTimeAsync(0)
        expect(service.settingsLoaded).toBe(false)
        expect(service.serverUnreachable()).toBe(true)

        // Backs off 1s then 2s before the third attempt succeeds
        await vi.advanceTimersByTimeAsync(3000)

        expect(service.settingsLoaded).toBe(true)
        expect(service.serverUnreachable()).toBe(false)
        expect(loaded).toHaveBeenCalledTimes(1)
        expect(api.callsTo('get', '/auth/settings')).toHaveLength(3)
      } finally {
        vi.useRealTimers()
      }
    })

    it('stops retrying once it is destroyed, so a torn-down app leaves nothing running', async () => {
      vi.useFakeTimers()
      try {
        const service = createFlaky(Number.POSITIVE_INFINITY)
        await vi.advanceTimersByTimeAsync(0)
        expect(api.callsTo('get', '/auth/settings')).toHaveLength(1)

        service.ngOnDestroy()
        await vi.advanceTimersByTimeAsync(30000)

        expect(api.callsTo('get', '/auth/settings')).toHaveLength(1)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('lighting mode', () => {
    it.each([
      ['light', 'dark', 'light'],
      ['dark', 'light', 'dark'],
      ['auto', 'dark', 'dark'],
      ['auto', 'light', 'light'],
    ] as const)('resolves %s with a %s browser to %s', (chosen, browser, expected) => {
      service.browserLightingMode = browser
      service.setLightingMode(chosen, 'user')

      expect(service.actualLightingMode).toBe(expected)
    })

    it('remembers the user choice but not the browser one', () => {
      service.setLightingMode('dark', 'user')
      expect(service.lightingMode).toBe('dark')

      service.setLightingMode('light', 'browser')
      // A browser change must not overwrite what the user picked, or the
      // preference is lost the moment the OS switches to night mode
      expect(service.lightingMode).toBe('dark')
      expect(service.currentLightingMode).toBe('light')
    })

    it('follows the browser only while set to auto', () => {
      service.setLightingMode('auto', 'user')
      service.setBrowserLightingMode('dark')
      expect(service.actualLightingMode).toBe('dark')

      service.setLightingMode('light', 'user')
      service.setBrowserLightingMode('dark')
      expect(service.actualLightingMode).toBe('light')
    })
  })

  describe('theme', () => {
    it('applies the theme class to the body', () => {
      service.setLightingMode('light', 'user')
      service.setTheme('teal')

      expect(document.body.classList.contains('config-ui-x-teal')).toBe(true)
      expect(document.body.classList.contains('dark-mode')).toBe(false)
    })

    it('uses the dark variant and the dark-mode class in dark mode', () => {
      service.setLightingMode('dark', 'user')
      service.setTheme('teal')

      expect(document.body.classList.contains('config-ui-x-dark-mode-teal')).toBe(true)
      expect(document.body.classList.contains('dark-mode')).toBe(true)
    })

    it('removes the previous theme class when switching', () => {
      service.setLightingMode('light', 'user')
      service.setTheme('teal')
      service.setTheme('indigo')

      expect(document.body.classList.contains('config-ui-x-teal')).toBe(false)
      expect(document.body.classList.contains('config-ui-x-indigo')).toBe(true)
    })

    it.each([
      ['an unknown theme', 'not-a-theme'],
      ['an empty theme', ''],
    ])('falls back to deep purple and saves it for %s', (_case, theme) => {
      api.clearCalls()
      service.setTheme(theme)

      expect(service.theme).toBe('deep-purple')
      // Writing the fallback back to the config stops the same repair running
      // on every page load
      expect(api.lastCall('patch', '/config-editor/ui')?.body).toEqual({ theme: 'deep-purple' })
    })

    it('keeps working when saving the fallback fails', () => {
      api.fail('patch', '/config-editor/ui', new Error('offline'))

      expect(() => service.setTheme('nope')).not.toThrow()
      expect(service.theme).toBe('deep-purple')
    })

    /**
     * ⚠️ **Custom plugin UIs live in an iframe, and the theme has to reach into
     * them.** They are same-origin, so the service reaches through
     * `contentDocument` and puts the classes on the iframe's own body. Without it a
     * plugin's settings page stays light while the rest of the UI goes dark, which
     * looks like the plugin is broken.
     */
    describe('the theme inside a plugin iframe', () => {
      let iframe: HTMLIFrameElement

      /**
       * Put an iframe on the page.
       * @param options - how the iframe behaves
       * @param options.crossOrigin - whether reading its document throws
       */
      function addIframe(options: { crossOrigin?: boolean } = {}) {
        iframe = document.createElement('iframe')
        document.body.appendChild(iframe)
        if (options.crossOrigin) {
          Object.defineProperty(iframe, 'contentDocument', {
            get() {
              throw new Error('Blocked a frame with origin from accessing a cross-origin frame')
            },
          })
        }
        return iframe
      }

      afterEach(() => {
        iframe?.remove()
      })

      /** The classes on the iframe's own body. */
      function iframeClasses(): string[] {
        return [...(iframe.contentDocument!.body.classList as any)]
      }

      it('gives the iframe the light theme class', () => {
        addIframe()
        service.setLightingMode('light', 'user')

        service.setTheme('teal')

        expect(iframeClasses()).toContain('config-ui-x-teal')
        expect(iframeClasses()).not.toContain('dark-mode')
      })

      it('gives the iframe the dark variant in dark mode', () => {
        addIframe()
        service.setLightingMode('dark', 'user')

        service.setTheme('teal')

        expect(iframeClasses()).toContain('config-ui-x-dark-mode-teal')
        expect(iframeClasses()).toContain('dark-mode')
      })

      it('swaps the light class out when the mode changes', () => {
        addIframe()
        service.setLightingMode('light', 'user')
        service.setTheme('teal')

        service.setLightingMode('dark', 'user')

        expect(iframeClasses()).not.toContain('config-ui-x-teal')
        expect(iframeClasses()).toContain('config-ui-x-dark-mode-teal')
      })

      it('swaps the dark class out again', () => {
        addIframe()
        service.setLightingMode('dark', 'user')
        service.setTheme('teal')

        service.setLightingMode('light', 'user')

        expect(iframeClasses()).not.toContain('config-ui-x-dark-mode-teal')
        expect(iframeClasses()).not.toContain('dark-mode')
        expect(iframeClasses()).toContain('config-ui-x-teal')
      })

      it('adds nothing twice when the theme is set again', () => {
        addIframe()
        service.setLightingMode('light', 'user')

        service.setTheme('teal')
        service.setTheme('teal')

        expect(iframeClasses().filter(name => name === 'config-ui-x-teal')).toHaveLength(1)
      })

      it('carries on when an iframe cannot be reached', () => {
        // A plugin UI served from somewhere else. Throwing here would leave the
        // page half-themed
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        addIframe({ crossOrigin: true })
        service.setLightingMode('light', 'user')

        expect(() => service.setTheme('teal')).not.toThrow()
        expect(document.body.classList.contains('config-ui-x-teal')).toBe(true)
        expect(console.warn).toHaveBeenCalled()
      })
    })
  })

  describe('setItem', () => {
    it('sets a top level property', () => {
      service.setItem('host', '192.168.1.10')

      expect(service.host).toBe('192.168.1.10')
    })

    it.each(['__proto__', 'constructor', 'prototype'])('refuses to set %s', (key) => {
      service.setItem(key, { polluted: true })

      expect(({} as Record<string, any>).polluted).toBeUndefined()
    })
  })

  describe('setEnvItem', () => {
    it('sets a plain key', () => {
      service.setEnvItem('homebridgeInstanceName', 'Studio')

      expect(service.env.homebridgeInstanceName).toBe('Studio')
    })

    it('creates the intermediate objects for a dotted key', () => {
      service.env = {} as any
      service.setEnvItem('terminal.fontSize', 16)

      expect(service.env.terminal).toEqual({ fontSize: 16 })
    })

    it('keeps the neighbouring values in a nested object', () => {
      service.env = { terminal: { fontSize: 16, fontWeight: '700' } } as any
      service.setEnvItem('terminal.fontSize', 12)

      expect(service.env.terminal).toEqual({ fontSize: 12, fontWeight: '700' })
    })

    it.each([
      ['the last segment', 'ssl.__proto__'],
      ['an intermediate segment', '__proto__.polluted'],
      ['a constructor segment', 'constructor.prototype.polluted'],
    ])('refuses to write through %s', (_case, key) => {
      service.setEnvItem(key, { polluted: true })

      expect(({} as Record<string, any>).polluted).toBeUndefined()
    })
  })

  describe('feature flags', () => {
    it.each([
      ['an enabled flag', { matterSupport: true }, true],
      ['a disabled flag', { matterSupport: false }, false],
      ['a missing flag', {}, false],
    ])('reports %s', (_case, flags, expected) => {
      service.env = { featureFlags: flags } as any

      expect(service.isFeatureEnabled('matterSupport')).toBe(expected)
    })

    it('reports false when the server sent no flags at all', () => {
      service.env = {} as any

      expect(service.isFeatureEnabled('matterSupport')).toBe(false)
    })
  })

  describe('page title', () => {
    it('joins the instance name and the page name', () => {
      service.env = { homebridgeInstanceName: 'Front Room' } as any
      service.setPageTitle('Plugins')

      expect(TestBed.inject(Title).getTitle()).toBe('Front Room — Plugins')
    })

    it('shows the instance name alone when there is no page name', () => {
      service.env = { homebridgeInstanceName: 'Front Room' } as any
      service.setPageTitle()

      expect(TestBed.inject(Title).getTitle()).toBe('Front Room')
    })

    it('falls back to Homebridge when the instance has no name', () => {
      service.env = {} as any
      service.setPageTitle('Plugins')

      expect(TestBed.inject(Title).getTitle()).toBe('Homebridge — Plugins')
    })
  })

  describe('terminal lighting', () => {
    it('forces a dark terminal whenever the ui is dark', () => {
      service.actualLightingMode = 'dark'
      service.env = { terminal: { lightingMode: 'light' } } as any

      // Deliberate hard override: a light terminal inside a dark page is
      // unreadable, so the terminal setting does not get a say here
      expect(service.getEffectiveTerminalLightingMode()).toBe('dark')
    })

    it('honours the terminal setting while the ui is light', () => {
      service.actualLightingMode = 'light'
      service.env = { terminal: { lightingMode: 'light' } } as any

      expect(service.getEffectiveTerminalLightingMode()).toBe('light')
    })

    it('defaults to a dark terminal when nothing is configured', () => {
      service.actualLightingMode = 'light'
      service.env = {} as any

      expect(service.getEffectiveTerminalLightingMode()).toBe('dark')
    })
  })

  describe('terminal options', () => {
    beforeEach(() => {
      service.actualLightingMode = 'dark'
      service.env = {} as any
    })

    it('uses a solid black background on a full page terminal', () => {
      const options = service.getTerminalOptions()

      expect(options.theme).toEqual({ background: '#000000' })
      expect(options.allowTransparency).toBe(false)
    })

    it('uses the widget grey background inside a widget', () => {
      const options = service.getTerminalOptions(undefined, true)

      // Matches the widget box, so the terminal does not sit in a black hole
      expect(options.theme).toEqual({ background: '#2b2b2b' })
    })

    it('uses a transparent background in a light terminal', () => {
      service.actualLightingMode = 'light'
      service.env = { terminal: { lightingMode: 'light' } } as any

      const options = service.getTerminalOptions()

      expect(options.theme).toMatchObject({ background: '#00000000', foreground: '#2b2b2b' })
      expect(options.allowTransparency).toBe(true)
    })

    it('applies the default font settings', () => {
      const options = service.getTerminalOptions()

      expect(options).toMatchObject({ fontSize: 13, fontWeight: '400', lineHeight: 1.2, screenReaderMode: true })
    })

    it('prefers the configured font settings', () => {
      service.env = { terminal: { fontSize: 18, fontWeight: '700' } } as any

      expect(service.getTerminalOptions()).toMatchObject({ fontSize: 18, fontWeight: '700' })
    })

    it('lets a caller override anything', () => {
      const options = service.getTerminalOptions({ disableStdin: true, fontSize: 20 })

      expect(options.disableStdin).toBe(true)
      expect(options.fontSize).toBe(20)
    })
  })

  describe('language', () => {
    it('remembers the chosen language', () => {
      service.setLang('de')

      expect(window.localStorage.getItem('uix.lang')).toBe('de')
      expect(service.env.lang).toBe('de')
    })

    it('forgets the choice when the language is cleared', () => {
      service.setLang('de')
      service.setLang('')

      expect(window.localStorage.getItem('uix.lang')).toBeNull()
      expect(service.env.lang).toBe('auto')
    })

    it('survives a browser that blocks local storage', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      // Private browsing modes throw here, and an unhandled throw would leave
      // the language half applied
      expect(() => service.setLang('de')).not.toThrow()
      expect(service.env.lang).toBe('de')
    })
  })

  describe('restart toast', () => {
    it('shows only one toast at a time', () => {
      service.showRestartToast()
      service.showRestartToast()

      // Every saved setting asks for this toast, so without the guard a
      // settings page visit stacks a column of identical toasts
      expect(toastr.info).toHaveBeenCalledTimes(1)
    })

    it('can be shown again once the first one has gone', () => {
      service.showRestartToast()
      toastr.last()!.onHidden.next(undefined)
      service.showRestartToast()

      expect(toastr.info).toHaveBeenCalledTimes(2)
    })

    it('stays on screen until it is acted on', () => {
      service.showRestartToast()

      expect(toastr.last()?.config).toMatchObject({ timeOut: 0, disableTimeOut: true, tapToDismiss: false })
    })
  })
})
