import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NavigationError, Router, RouterOutlet } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'

import { ServerUnreachableComponent } from '@/app/core/components/server-unreachable/server-unreachable.component'
import { chooseStartupLanguage, supportedLocales } from '@/app/core/locales'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ServerUnreachableComponent],
  standalone: true,
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private $translate = inject(TranslateService)
  protected $settings = inject(SettingsService)
  private $router = inject(Router)
  private destroyRef = inject(DestroyRef)

  constructor() {
    // Recover from chunk-load failures after a deploy: the router tries
    // to fetch a hashed JS file that no longer exists on the server,
    // throws inside the route's `loadComponent` promise, and the user
    // is stuck on a blank page with a console error. Detect that case
    // and force a full reload so the browser pulls the new index.html
    // and the fresh chunk hashes it points at.
    this.$router.events
      .pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationError && this.isChunkLoadError(event.error)) {
          window.location.reload()
        }
      })

    // Detect if the user has a dark mode preference
    const colorSchemeQueryList = window.matchMedia('(prefers-color-scheme: dark)')
    const setLightingMode = (event: MediaQueryList | MediaQueryListEvent) => {
      this.$settings.setBrowserLightingMode(event.matches ? 'dark' : 'light')
    }
    setLightingMode(colorSchemeQueryList)
    colorSchemeQueryList.addEventListener('change', setLightingMode)
    this.destroyRef.onDestroy(() => {
      colorSchemeQueryList.removeEventListener('change', setLightingMode)
    })

    // Every language the UI ships, taken from the locale table rather than
    // listed again here: the two used to be maintained by hand side by side, and
    // a language present in one but not the other either loads a translation
    // with the wrong date and number formats or cannot be selected at all.
    const languages = Object.keys(supportedLocales)

    // Which languages should use RTL
    const rtlLanguages = [
      'he',
    ]

    // Watch for lang changes
    this.$translate.onLangChange
      .pipe(takeUntilDestroyed())
      .subscribe(({ lang }) => {
        this.$settings.rtl = rtlLanguages.includes(lang)
      })

    // Prefer the last user-selected language (persisted in localStorage) so
    // bootstrap renders in the chosen locale before the server settings arrive;
    // fall back to the browser-detected language. The same decision decides which
    // locale dates and numbers are formatted with, so it is made in one place -
    // see chooseStartupLanguage.
    const browserLang = chooseStartupLanguage(this.$translate.getBrowserLang(), this.$translate.getBrowserCultureLang())

    // Load all translations asynchronously
    void this.loadTranslations(languages, browserLang)
  }

  private isChunkLoadError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false
    }
    const err = error as { name?: string, message?: string }
    return err.name === 'ChunkLoadError'
      || /Loading chunk/i.test(err.message ?? '')
      || /Failed to fetch dynamically imported module/i.test(err.message ?? '')
  }

  private async loadTranslations(languages: string[], browserLang: string | undefined): Promise<void> {
    await Promise.all(
      languages.map(async (lang) => {
        const translation = await import(`../i18n/${lang}.json`)
        this.$translate.setTranslation(lang, translation.default)
      }),
    )

    this.$translate.setFallbackLang('en')

    // Don't override a language already set by SettingsService
    if (browserLang && !this.$translate.getCurrentLang()) {
      this.$translate.use(browserLang)
    }
  }
}
