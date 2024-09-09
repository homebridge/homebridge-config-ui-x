import { AuthService } from '@/app/core/auth/auth.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { environment } from '@/environments/environment'
import { HttpClient, HttpParams } from '@angular/common/http'
import { Component, Input, OnDestroy, OnInit } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import * as dayjs from 'dayjs'
import { interval, Subject, Subscription } from 'rxjs'

@Component({
  templateUrl: './weather-widget.component.html',
})
export class WeatherWidgetComponent implements OnInit, OnDestroy {
  @Input() widget: any
  @Input() configureEvent: Subject<any>

  public currentWeather

  private io: IoNamespace
  private intervalSubscription: Subscription

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
    private $http: HttpClient,
    private $translate: TranslateService,
  ) {}

  ngOnInit() {
    this.io = this.$ws.getExistingNamespace('status')
    this.io.connected.subscribe(async () => {
      this.getCurrentWeather()
    })

    if (this.io.socket.connected) {
      this.getCurrentWeather()
    }

    this.configureEvent.subscribe({
      next: () => {
        this.getCurrentWeather()
      },
    })

    this.intervalSubscription = interval(1300000).subscribe(() => {
      this.getCurrentWeather()
    })
  }

  /**
   * Get the current weather forecast from OpenWeatherMap
   * Cache for 20 minutes to prevent repeat requests
   */
  getCurrentWeather() {
    if (!this.widget.location || !this.widget.location.id) {
      return
    }

    try {
      const weatherCache = JSON.parse(localStorage.getItem(`weather-${this.widget.location.id}`))
      if (weatherCache) {
        if (dayjs().diff(dayjs(weatherCache.timestamp), 'minute') < 20) {
          this.currentWeather = weatherCache
          return
        }
      }
    } catch (e) {}

    this.$http.get('https://api.openweathermap.org/data/2.5/weather', {
      params: new HttpParams({
        fromObject: {
          id: this.widget.location.id,
          appid: environment.owm.appid,
          units: 'metric',
          lang: this.$translate.currentLang,
        },
      }),
    }).subscribe((data: any) => {
      data.timestamp = new Date().toISOString()
      this.currentWeather = data
      localStorage.setItem(`weather-${this.widget.location.id}`, JSON.stringify(data))
    })
  }

  /**
   * Translate OpenWeatherMap icon codes into Font Awesome icons
   */
  getWeatherIconClass(): string {
    switch (this.currentWeather.weather[0].icon) {
      case '01d': // clear day
        return 'far fa-fw fa-sun'
      case '01n': // clear night
        return 'far fa-fw fa-moon'
      case '02d': // few clouds day
        return 'fas fa-fw fa-cloud-sun'
      case '02n': // few clouds night
        return 'fas fa-fw fa-cloud-moon'
      case '03d': // scattered clouds day
        return 'fas fa-fw fa-cloud-sun'
      case '03n': // scattered clouds night
        return 'fas fa-fw fa-cloud-moon'
      case '04d': // broken clouds day
        return 'fas fa-fw fa-cloud-sun'
      case '04n': // broken clouds night
        return 'fas fa-fw fa-cloud-moon'
      case '09d': // shower rain day
        return 'fas fa-fw fa-cloud-sun-rain'
      case '09n': // shower rain night
        return 'fas fa-fw fa-cloud-moon-rain'
      case '10d': // rain day
        return 'fas fa-fw fa-cloud-rain'
      case '10n': // rain night
        return 'fas fa-fw fa-cloud-moon-rain'
      case '11d': // thunderstorm day
        return 'fas fa-fw fa-cloud-showers-heavy'
      case '11n': // thunderstorm night
        return 'fas fa-fw fa-cloud-showers-heavy'
      case '13d': // snow day
        return 'fas fa-fw fa-snowflake'
      case '13n': // snow night
        return 'fas fa-fw fa-snowflake'
      case '50d': // mist day
        return 'fas fa-fw fa-smog'
      case '50n': // mist night
        return 'fas fa-fw fa-smog'
    }
  }

  ngOnDestroy() {
    this.intervalSubscription.unsubscribe()
  }
}
