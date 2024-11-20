import { ApiService } from '@/app/core/api.service'
import { environment } from '@/environments/environment'
import { DatePipe, NgClass, NgFor, NgIf, NgSwitch, NgSwitchCase } from '@angular/common'
import { HttpClient, HttpParams } from '@angular/common/http'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal, NgbTypeahead } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { firstValueFrom, Observable, of } from 'rxjs'
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  switchMap,
  tap,
} from 'rxjs/operators'

@Component({
  templateUrl: './widget-control.component.html',
  imports: [
    NgSwitch,
    FormsModule,
    NgSwitchCase,
    NgClass,
    NgbTypeahead,
    NgFor,
    NgIf,
    DatePipe,
    TranslatePipe,
  ],
})
export class WidgetControlComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $http = inject(HttpClient)
  private $translate = inject(TranslateService)

  @Input() widget: any

  // weather
  public searching: boolean

  // terminal
  public fontSizes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
  public fontWeights = ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'bold', 'normal']

  // clock
  public currentDate = new Date()

  public timeFormats = [
    'h:mm a',
    'h:mm:ss a',
    'H:mm',
    'H:mm:ss',
  ]

  public dateFormats = [
    'yyyy-MM-dd',
    'dd/MM/yy',
    'dd/MM/yyyy',
    'M/d/yy',
    'M/dd/yyyy',
    'dd.MM.yyyy',
    'MMM d',
    'MMM d, y',
    'MMMM d, y',
    'd MMMM y',
    'EEEE, MMMM d, y',
    'EEEE, d MMMM y',
    'EEE, MMM d',
    'EEEE',
    'EEEE, MMM d',
  ]

  public networkInterfaces: string[] = []

  public searchCountryCodes = (text$: Observable<string>) =>
    text$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap(() => this.searching = true),
      switchMap(term =>
        term.length < 3
          ? []
          : this.findOpenWeatherMapCity(term).pipe(
            catchError(() => {
              this.searching = false
              return of([])
            }),
          ),
      ),
      tap(() => this.searching = false),
    )

  public searchCountryCodeFormatter = (result: any) => `${result.name}, ${result.country}`

  ngOnInit() {
    if (this.widget.component === 'HomebridgeLogsWidgetComponent' || this.widget.component === 'TerminalWidgetComponent') {
      if (!this.widget.fontWeight) {
        this.widget.fontWeight = '400'
      }
      if (!this.widget.fontSize) {
        this.widget.fontSize = 15
      }
    }
    if (this.widget.component === 'NetworkWidgetComponent') {
      // Get a list of active network interfaces from the settings
      firstValueFrom(this.$api.get('/server/network-interfaces/bridge')).then((adapters) => {
        this.networkInterfaces = adapters
      })
    }
  }

  findOpenWeatherMapCity(query: string) {
    return this.$http
      .get('https://api.openweathermap.org/data/2.5/find', {
        params: new HttpParams({
          fromObject: {
            q: query,
            type: 'like',
            sort: 'population',
            cnt: '30',
            appid: environment.owm.appid,
            lang: this.$translate.currentLang,
          },
        }),
      })
      .pipe(
        map((response: any) => response.list.map((item: any) => ({
          id: item.id,
          name: item.name,
          country: item.sys.country,
          coord: item.coord,
        }))),
      )
  }
}
