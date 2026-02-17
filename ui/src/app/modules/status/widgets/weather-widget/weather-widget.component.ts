import { DecimalPipe, TitleCasePipe, UpperCasePipe } from '@angular/common'
import { HttpClient, HttpParams } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import dayjs from 'dayjs'
import { interval, Subject } from 'rxjs'

import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/ui/settings.service'
import { OpenWeatherMapResponse, Widget } from '@/app/modules/status/widgets/widgets.interfaces'
import { environment } from '@/environments/environment'

@Component({
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
  private $http = inject(HttpClient)
  private $settings = inject(SettingsService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)

  // Signals
  readonly widget = input.required<Widget>()
  public readonly currentWeather = signal<OpenWeatherMapResponse | null>(null)

  // Other properties
  private io: IoNamespace
  public temperatureUnits = this.$settings.env.temperatureUnits
  configureEvent!: Subject<any> // Set directly by ComponentFactoryResolver

  public ngOnInit(): void {
    this.io = this.$ws.getExistingNamespace('status')

    // Set up reconnection handler
    this.io.connected.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.getCurrentWeather()
    })

    // Set up configure event handler
    this.configureEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.getCurrentWeather()
    })

    // Set up periodic refresh
    interval(1300000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.getCurrentWeather()
    })

    // Fetch initial data if already connected
    if (this.io.socket.connected) {
      this.getCurrentWeather()
    }
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
    }
  }

  /**
   * Get the current weather forecast from OpenWeatherMap
   * Cache for 20 minutes to prevent repeat requests
   */
  private getCurrentWeather(): void {
    if (!this.widget().location || !this.widget().location.id) {
      return
    }

    try {
      const cacheItem = localStorage.getItem(`weather-${this.widget().location.id}`)
      if (cacheItem) {
        const weatherCache = JSON.parse(cacheItem) as OpenWeatherMapResponse
        if (weatherCache.timestamp && dayjs().diff(dayjs(weatherCache.timestamp), 'minute') < 20) {
          this.currentWeather.set(weatherCache)
          return
        }
      }
    } catch (e) {}

    this.$http.get<OpenWeatherMapResponse>('https://api.openweathermap.org/data/2.5/weather', {
      params: new HttpParams({
        fromObject: {
          id: this.widget().location.id,
          appid: environment.owm.appid,
          units: 'metric',
          lang: this.$translate.getCurrentLang(),
        },
      }),
    }).subscribe((data) => {
      const weatherData: OpenWeatherMapResponse = {
        ...data,
        timestamp: new Date().toISOString(),
      }
      this.currentWeather.set(weatherData)
      localStorage.setItem(`weather-${this.widget().location.id}`, JSON.stringify(weatherData))
    })
  }
}
