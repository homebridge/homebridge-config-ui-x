/// <reference types="vite/client" />

import { getLocaleDirection, getLocaleId } from '@angular/common'
import { LOCALE_ID } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { chooseStartupLanguage, localeIdFor, storedLanguage, supportedLocales } from '@/app/core/locales'
import { provideAppTranslation } from '@/app/core/providers/translation.providers'

/**
 * The language table, and the lists around the app that have to agree with it.
 *
 * Adding a translation means touching several places by hand, and getting one
 * wrong fails quietly in a way nobody notices in English:
 *
 * - a language shipped but missing from `supportedLocales` falls back to the
 *   `en` locale, so the UI is translated but its dates, decimal separators and
 *   thousands separators are all wrong for the reader;
 * - a language in `supportedLocales` with no translation file makes the shell's
 *   dynamic `import()` reject, and the UI loads untranslated;
 * - a locale mapped but never passed to `registerLocaleData` throws the moment
 *   anything formats a date — this is exactly the finnish bug fixed earlier in
 *   this release;
 * - a language missing from the settings picker or the config editor's guided
 *   schema is shipped, translated, and unreachable.
 *
 * ⚠️ The last two lists are read out of the source files rather than imported,
 * because both are literals buried inside a component. Each regex asserts it
 * matched something first — a moved block has to fail loudly here rather than
 * quietly check an empty list.
 */
describe('the supported locales', () => {
  /**
   * The translation files the app actually ships.
   *
   * ⚠️ Root-absolute glob patterns, not relative ones. A relative pattern
   * resolves to nothing when the suite runs with `--coverage` — the instrumented
   * module ids no longer match — so the whole block would check empty lists.
   */
  const shippedLanguages = Object.keys(import.meta.glob('/src/i18n/*.json'))
    .map(path => path.split('/').pop()!.replace('.json', ''))
    .sort()

  /** The source of the two components carrying a hand-written language list. */
  const sources = import.meta.glob<string>(
    ['/src/app/modules/settings/settings.component.html', '/src/app/modules/config-editor/config-editor.component.ts'],
    { query: '?raw', import: 'default', eager: true },
  )

  /**
   * One of the two source files, by the part of its path that identifies it.
   * @param name - a fragment of the file name
   */
  function source(name: string): string {
    const match = Object.entries(sources).find(([path]) => path.includes(name))
    expect(match, `source not found: ${name}`).toBeDefined()
    return match![1]
  }

  it('found the translation files to compare against', () => {
    // Guards the rest of the block: an empty list would make several of these
    // assertions vacuous rather than wrong
    expect(shippedLanguages.length).toBeGreaterThan(20)
    expect(Object.keys(sources)).toHaveLength(2)
  })

  it('ships a translation for every language it lists', () => {
    expect(Object.keys(supportedLocales).sort()).toEqual(shippedLanguages)
  })

  it('lists every translation it ships', () => {
    // The same assertion the other way round, kept separate so a failure says
    // which direction the drift went
    expect(shippedLanguages.every(lang => lang in supportedLocales)).toBe(true)
  })

  describe('the angular locale each language maps to', () => {
    it.each(Object.entries(supportedLocales))('has its data registered for %s', (_lang, locale) => {
      // ⚠️ The real assertion is that this does not throw. Angular's locale
      // lookup throws "Missing locale data" for an unregistered locale, and the
      // first thing to hit it is whatever formats a date - a widget, a log
      // timestamp - long after the language was selected
      expect(() => getLocaleId(locale)).not.toThrow()
    })

    it('maps the two chinese variants onto the scripts angular names them by', () => {
      // zh-CN and zh-TW are the translation file names; angular has no such
      // locales, only zh-Hans and zh-Hant
      expect(supportedLocales['zh-CN']).toBe('zh-Hans')
      expect(supportedLocales['zh-TW']).toBe('zh-Hant')
    })

    it('maps norwegian onto bokmal', () => {
      // 'no' is a macrolanguage with no data of its own
      expect(supportedLocales.no).toBe('nb')
    })

    it('formats brazilian portuguese with the portuguese locale', () => {
      // The translations differ; the number and date formats do not, and angular
      // ships no pt-BR data
      expect(supportedLocales['pt-BR']).toBe('pt')
    })

    it('is the only place that decides text direction', () => {
      // The shell keeps its own list of right-to-left languages. Hebrew is the
      // only one the app ships, and this is what will fail if arabic, farsi or
      // urdu is added without adding it there too
      const rightToLeft = Object.entries(supportedLocales)
        .filter(([, locale]) => getLocaleDirection(locale) === 'rtl')
        .map(([lang]) => lang)

      expect(rightToLeft).toEqual(['he'])
    })
  })

  /**
   * What every date and number in the UI is formatted with.
   *
   * ⚠️ **This is resolved once, at bootstrap, and cannot be resolved again.**
   * Angular reads `LOCALE_ID` immediately after the app initialisers — before the
   * shell has loaded a single translation (`core.mjs`,
   * `internalCreateApplication` → `setLocaleId`). It therefore cannot be derived
   * from `TranslateService.getCurrentLang()`, which is still the `'en'` the
   * provider config sets at that moment. It used to be, and the result was that
   * every non-English user read a translated UI with English date order and
   * English decimal separators.
   *
   * It now comes from the stored language, which is available synchronously and
   * is the same thing the shell uses to choose a translation. The consequence to
   * remember: a language change only reformats after the next page load.
   */
  describe('the locale angular formats dates and numbers with', () => {
    /**
     * Resolve LOCALE_ID the way the app configures it.
     *
     * TestBed resolves it when the test module is instantiated, which is the same
     * point in the lifecycle the real bootstrap does — so a language stored
     * beforehand is the only thing that can influence it.
     * @param options - the state at bootstrap
     * @param options.stored - the language in local storage, if any
     * @param options.browser - the browser language, if any
     */
    function localeFor(options: { stored?: string, browser?: string } = {}): string {
      TestBed.resetTestingModule()
      window.localStorage.clear()
      if (options.stored !== undefined) {
        window.localStorage.setItem('uix.lang', options.stored)
      }

      // ⚠️ Stubbed on the prototype, before the module exists. Injecting
      // TranslateService to spy on the instance is too late: instantiating the
      // module is what resolves LOCALE_ID, so the factory has already run and the
      // answer is cached. That is the same ordering the real bootstrap has, which
      // is the whole reason this provider cannot ask for the current language
      vi.spyOn(TranslateService.prototype, 'getBrowserLang').mockReturnValue(options.browser)
      vi.spyOn(TranslateService.prototype, 'getBrowserCultureLang').mockReturnValue(options.browser)

      TestBed.configureTestingModule({ providers: [provideAppTranslation()] })

      return TestBed.inject(LOCALE_ID)
    }

    afterEach(() => {
      vi.restoreAllMocks()
      window.localStorage.clear()
    })

    it('formats for the language the user chose', () => {
      expect(localeFor({ stored: 'de' })).toBe('de')
    })

    it('maps the chosen language through the table', () => {
      // The translation file is named zh-CN; angular has no such locale
      expect(localeFor({ stored: 'zh-CN' })).toBe('zh-Hans')
      expect(localeFor({ stored: 'no' })).toBe('nb')
      expect(localeFor({ stored: 'pt-BR' })).toBe('pt')
    })

    it('agrees with the table for every language the app ships', () => {
      // The shell loads the translation for the stored language; this has to be
      // the locale that goes with it, or the text and the dates disagree
      const resolved = Object.fromEntries(
        Object.keys(supportedLocales).map(lang => [lang, localeFor({ stored: lang })]),
      )

      expect(resolved).toEqual(supportedLocales)
    })

    it('follows the browser when nothing was chosen', () => {
      expect(localeFor({ browser: 'fr' })).toBe('fr')
    })

    it('follows the browser when the choice is explicitly auto', () => {
      expect(localeFor({ stored: 'auto', browser: 'fr' })).toBe('fr')
    })

    it('ignores a stored language the app no longer ships', () => {
      // Left behind by an update that dropped a translation
      expect(localeFor({ stored: 'kl', browser: 'fr' })).toBe('fr')
    })

    it('falls back to english when neither says anything useful', () => {
      expect(localeFor()).toBe('en')
      expect(localeFor({ browser: 'kl' })).toBe('en')
    })

    it('prefers the stored language over the browser', () => {
      // Choosing a language in settings has to beat the browser's own setting
      expect(localeFor({ stored: 'de', browser: 'fr' })).toBe('de')
    })
  })

  describe('choosing the language to start in', () => {
    it('reads nothing from storage when storage is unavailable', () => {
      // Private browsing can make even reading throw, and this runs during
      // bootstrap - throwing here takes the whole app down
      const getItem = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
        throw new Error('access denied')
      })
      try {
        expect(storedLanguage()).toBeUndefined()
        expect(chooseStartupLanguage('fr', 'fr-FR')).toBe('fr')
      } finally {
        getItem.mockRestore()
      }
    })

    it('matches the fuller browser language when the short one does not', () => {
      // A browser set to Brazilian portuguese reports pt-BR as its culture
      window.localStorage.clear()

      expect(chooseStartupLanguage('pt-BR', 'pt-BR')).toBe('pt-BR')
    })

    it('settles on nothing when the browser language is not shipped', () => {
      window.localStorage.clear()

      expect(chooseStartupLanguage('kl', 'kl-GL')).toBeUndefined()
      expect(localeIdFor(undefined)).toBe('en')
    })
  })

  describe('the lists the user picks from', () => {
    it('offers every shipped language in the settings picker', () => {
      const html = source('settings.component.html')
      const block = html.match(/<option value="auto">[\s\S]*?<\/select>/)
      expect(block, 'the language select could not be found').not.toBeNull()

      const offered = [...block![0].matchAll(/<option value="([\w-]+)"/g)]
        .map(match => match[1])
        .filter(value => value !== 'auto')

      expect(offered.sort()).toEqual(shippedLanguages)
    })

    it('offers every shipped language in the config editor schema', () => {
      // The guided form the json editor shows for the homebridge-config-ui-x
      // block. A language missing here cannot be set by anyone editing the
      // config that way
      // Sliced by hand rather than matched with one regex: the pair of lazy
      // wildcards that needs is the shape the linter rejects for backtracking
      const ts = source('config-editor.component.ts')
      const start = ts.indexOf('description: \'The language used for the UI.\'')
      expect(start, 'the language schema could not be found').toBeGreaterThan(-1)
      // Each entry ends `] },` so the first `],` is the end of the list itself
      const end = ts.indexOf('],', start)
      expect(end, 'the end of the language schema could not be found').toBeGreaterThan(start)

      const offered = [...ts.slice(start, end).matchAll(/enum: \['([\w-]+)'\]/g)]
        .map(match => match[1])
        .filter(value => value !== 'auto')

      expect(offered.sort()).toEqual(shippedLanguages)
    })

    it('names each language once in each list', () => {
      for (const [name, pattern] of [
        ['settings.component.html', /<option value="([\w-]+)"/g],
        ['config-editor.component.ts', /enum: \['([\w-]+)'\]/g],
      ] as const) {
        const values = [...source(name).matchAll(pattern)].map(match => match[1])
        const languages = values.filter(value => value in supportedLocales)
        expect(new Set(languages).size, `${name} lists a language twice`).toBe(languages.length)
      }
    })
  })
})
