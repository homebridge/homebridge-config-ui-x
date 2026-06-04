import { DecimalPipe, TitleCasePipe, UpperCasePipe } from '@angular/common'
import { httpResource } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, OnInit, signal, untracked } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import dayjs from 'dayjs'
import { interval, Subject } from 'rxjs'

import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/ui/settings.service'
import { OpenWeatherMapResponse, Widget } from '@/app/modules/status/widgets/widgets.interfaces'
import { environment } from '@/environments/environment'

// Cache OpenWeatherMap responses for 20 minutes to prevent repeat requests (API rate limits)
const WEATHER_CACHE_MINUTES = 20

@Component({
  selector: 'app-weather-widget',
  imports: [
    DecimalPipe,
    TitleCasePipe,
    TranslatePipe,
    ConvertTempPipe,
    UpperCasePipe,
  ],
  standalone: true,
  templateUrl: './weather-widget.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeatherWidgetComponent implements OnInit {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $settings = inject(SettingsService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)

  // Signals
  readonly widget = input.required<Widget>()

  // Bumped to force the resource to re-evaluate (and re-check the cache) on reconnect / reconfigure / timer
  private readonly refreshTrigger = signal(0)

  // Last known-good weather, seeded from the cache and updated after each successful fetch.
  // Used as the displayed value while the resource is idle (fresh cache) or loading.
  private readonly cachedWeather = signal<OpenWeatherMapResponse | null>(null)

  // Declarative HTTP GET to OpenWeatherMap. Re-runs when the location, language, or refreshTrigger
  // changes; returns undefined (no request) when there is no location or the cache is still fresh.
  protected readonly weather = httpResource<OpenWeatherMapResponse>(() => {
    this.refreshTrigger()
    const location = this.widget().location
    if (!location?.id) {
      return undefined
    }
    if (this.readFreshCache(location.id)) {
      return undefined
    }
    return {
      url: 'https://api.openweathermap.org/data/2.5/weather',
      params: {
        id: location.id,
        appid: environment.owm.appid,
        units: 'metric',
        lang: this.$translate.getCurrentLang() ?? 'en',
      },
    }
  })

  // What the template renders: the live fetch result, or the last cached value while idle/loading.
  public readonly currentWeather = computed<OpenWeatherMapResponse | null>(
    () => this.weather.value() ?? this.cachedWeather(),
  )

  // Other properties
  private io!: IoNamespace
  public temperatureUnits = this.$settings.env.temperatureUnits
  configureEvent!: Subject<any> // Set directly by createComponent()

  constructor() {
    // Persist each successful fetch to the cache and the displayed value
    effect(() => {
      const data = this.weather.value()
      if (!data) {
        return
      }
      const locationId = untracked(() => this.widget().location?.id)
      if (!locationId) {
        return
      }
      const stamped: OpenWeatherMapResponse = { ...data, timestamp: new Date().toISOString() }
      this.cachedWeather.set(stamped)
      localStorage.setItem(`weather-${locationId}`, JSON.stringify(stamped))
    })
  }

  public ngOnInit(): void {
    // Seed the display from a fresh cached value so we show data immediately without a network call
    const locationId = this.widget().location?.id
    if (locationId) {
      const cached = this.readFreshCache(locationId)
      if (cached) {
        this.cachedWeather.set(cached)
      }
    }

    this.io = this.$ws.getExistingNamespace('status')

    // Refresh on server reconnect, on reconfigure, and periodically. Each trigger re-evaluates the
    // request factory, which still respects the 20-minute cache before hitting the network.
    this.io.connected!.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.refresh())
    this.configureEvent?.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.refresh())
    interval(1300000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.refresh())
  }

  private refresh(): void {
    this.refreshTrigger.update(n => n + 1)
  }

  /**
   * Return the cached weather for a location if it exists and is less than 20 minutes old, else null.
   */
  private readFreshCache(locationId: string | number): OpenWeatherMapResponse | null {
    try {
      const raw = localStorage.getItem(`weather-${locationId}`)
      if (raw) {
        const cached = JSON.parse(raw) as OpenWeatherMapResponse
        if (cached.timestamp && dayjs().diff(dayjs(cached.timestamp), 'minute') < WEATHER_CACHE_MINUTES) {
          return cached
        }
      }
    } catch (e) {}
    return null
  }

  /**
   * Translate OpenWeatherMap icon codes into Font Awesome icons
   */
  public getWeatherIconClass(): string {
    switch (this.currentWeather()?.weather[0]?.icon) {
      case '01d': // clear day
        return 'far fa-sun'
      case '01n': // clear night
        return 'far fa-moon'
      case '02d': // few clouds day
        return 'fas fa-cloud-sun'
      case '02n': // few clouds night
        return 'fas fa-cloud-moon'
      case '03d': // scattered clouds day
        return 'fas fa-cloud-sun'
      case '03n': // scattered clouds night
        return 'fas fa-cloud-moon'
      case '04d': // broken clouds day
        return 'fas fa-cloud-sun'
      case '04n': // broken clouds night
        return 'fas fa-cloud-moon'
      case '09d': // shower rain day
        return 'fas fa-cloud-sun-rain'
      case '09n': // shower rain night
        return 'fas fa-cloud-moon-rain'
      case '10d': // rain day
        return 'fas fa-cloud-rain'
      case '10n': // rain night
        return 'fas fa-cloud-moon-rain'
      case '11d': // thunderstorm day
        return 'fas fa-cloud-showers-heavy'
      case '11n': // thunderstorm night
        return 'fas fa-cloud-showers-heavy'
      case '13d': // snow day
        return 'fas fa-snowflake'
      case '13n': // snow night
        return 'fas fa-snowflake'
      case '50d': // mist day
        return 'fas fa-smog'
      case '50n': // mist night
        return 'fas fa-smog'
      default:
        return 'fas fa-cloud'
    }
  }
}
