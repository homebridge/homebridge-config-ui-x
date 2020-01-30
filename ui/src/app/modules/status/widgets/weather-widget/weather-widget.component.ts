import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { Subject, Subscription, interval } from 'rxjs';
import * as dayjs from 'dayjs';

import { WsService } from '../../../../core/ws.service';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-weather-widget',
  templateUrl: './weather-widget.component.html',
  styleUrls: ['./weather-widget.component.scss'],
})
export class WeatherWidgetComponent implements OnInit, OnDestroy {
  @Input() widget;
  @Input() configureEvent: Subject<any>;

  private io = this.$ws.getExistingNamespace('status');
  private intervalSubscription: Subscription;

  public currentWeather;

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
    private $http: HttpClient,
    private $translate: TranslateService,
  ) { }

  ngOnInit() {
    this.io.connected.subscribe(async () => {
      this.getCurrentWeather();
    });

    if (this.io.socket.connected) {
      this.getCurrentWeather();
    }

    this.configureEvent.subscribe({
      next: () => {
        this.getCurrentWeather();
      },
    });

    this.intervalSubscription = interval(1300000).subscribe(() => {
      this.getCurrentWeather();
    });
  }

  /**
   * Get the current weather forcast from OpenWeatherMap
   * Cache for 20 minutes to prevent repeat requests
   */
  getCurrentWeather() {
    if (!this.widget.location || !this.widget.location.id) {
      return;
    }

    try {
      const weatherCache = JSON.parse(localStorage.getItem(`weather-${this.widget.location.id}`));
      if (weatherCache) {
        if (dayjs().diff(dayjs(weatherCache.timestamp), 'minute') < 20) {
          this.currentWeather = weatherCache;
          return;
        }
      }
    } catch (e) { }

    this.$http.get('https://api.openweathermap.org/data/2.5/weather', {
      params: new HttpParams({
        fromObject: {
          id: this.widget.location.id,
          appid: 'fec67b55f7f74deaa28df89ba6a60821',
          units: 'metric',
          lang: this.$translate.currentLang,
        },
      }),
    }).subscribe((data: any) => {
      data.timestamp = new Date().toISOString();
      this.currentWeather = data;
      localStorage.setItem(`weather-${this.widget.location.id}`, JSON.stringify(data));
    });
  }

  /**
   * Translate OpenWeatherMap icon codes into Font Awesome icons
   */
  getWeatherIconClass(): string {
    switch (this.currentWeather.weather[0].icon) {
      case '01d': // clear day
        return 'far fa-sun';
      case '01n': // clear night
        return 'far fa-moon';
      case '02d': // few clouds day
        return 'fas fa-cloud-sun';
      case '02n': // few clouds night
        return 'fas fa-cloud-moon';
      case '03d': // scattered clouds day
        return 'fas fa-cloud-sun';
      case '03n': // scattered clouds night
        return 'fas fa-cloud-moon';
      case '04d': // broken clouds day
        return 'fas fa-cloud-sun';
      case '04n': // broken clouds night
        return 'fas fa-cloud-moon';
      case '09d': // shower rain day
        return 'fas fa-cloud-sun-rain';
      case '09n': // shower rain night
        return 'fas fa-cloud-moon-rain';
      case '10d': // rain day
        return 'fas fa-cloud-rain';
      case '10n': // rain night
        return 'fas fa-cloud-moon-rain';
      case '11d': // thunderstorm day
        return 'fas fa-cloud-showers-heavy';
      case '11n': // thunderstorm night
        return 'fas fa-cloud-showers-heavy';
      case '13d': // snow day
        return 'fas fa-snowflake';
      case '13n': // snow night
        return 'fas fa-snowflake';
      case '50d': // mist day
        return 'fas fa-smog';
      case '50n': // mist night
        return 'fas fa-smog';
    }
  }

  ngOnDestroy() {
    this.intervalSubscription.unsubscribe();
  }

}
