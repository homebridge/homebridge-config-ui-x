import { DatePipe } from '@angular/common'
import { HttpClient, HttpParams } from '@angular/common/http'
import { Component, inject, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTypeahead } from '@ng-bootstrap/ng-bootstrap/typeahead'
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

import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { WIDGET_CONTROL_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'
import { ServerInfo, Widget } from '@/app/modules/status/widgets/widgets.interfaces'
import { environment } from '@/environments/environment'

@Component({
  templateUrl: './widget-control.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NgbTypeahead,
    DatePipe,
    TranslatePipe,
  ],
})
export class WidgetControlComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $http = inject(HttpClient)
  private $settings = inject(SettingsService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private modalData = inject(WIDGET_CONTROL_MODAL_DATA)

  // Public properties for component use
  public widget = this.modalData.widget

  // Signals
  public searching = signal<boolean>(false)
  public serverInfo = signal<ServerInfo | null>(null)
  public networkInterfaces = signal<string[]>([])
  public isLightMode = signal<boolean>(false)

  // Other properties
  private io: IoNamespace
  private originalWidget: Widget
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

  public searchCountryCodes = (text$: Observable<string>) => text$.pipe(
    debounceTime(300),
    distinctUntilChanged(),
    tap(() => this.searching.set(true)),
    switchMap(term => term.length < 3
      ? []
      : this.findOpenWeatherMapCity(term).pipe(
          catchError(() => {
            this.searching.set(false)
            return of([])
          }),
        ),
    ),
    tap(() => this.searching.set(false)),
  )

  public searchCountryCodeFormatter = (result: any) => `${result.name}, ${result.country}`

  public ngOnInit(): void {
    void this.initialize()
  }

  private async initialize(): Promise<void> {
    const widget = this.widget
    if (!widget) {
      return
    }

    // Store original reference and create a working copy to avoid mutating during editing
    this.originalWidget = widget
    this.widget = { ...widget }

    this.io = this.$ws.getExistingNamespace('status')
    this.isLightMode.set(this.$settings.actualLightingMode === 'light')

    if (this.widget.component === 'NetworkWidgetComponent') {
      // Get a list of active network interfaces from the settings
      void this.loadNetworkInterfaces()
    }
    try {
      this.serverInfo.set(await firstValueFrom(this.io.request('get-homebridge-server-info')))
    } catch (error) {
      console.error('Failed to fetch server info:', error)
      this.serverInfo.set(null)
    }
  }

  private async loadNetworkInterfaces(): Promise<void> {
    const adapters = await this.$api.get('/server/network-interfaces/bridge')
    this.networkInterfaces.set(adapters)
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  public closeModal(): void {
    const widget = this.widget
    if (!widget) {
      return
    }
    // Copy changes from working copy back to original widget
    Object.assign(this.originalWidget, widget)
    this.$activeModal.close()
  }

  private findOpenWeatherMapCity(query: string): Observable<any> {
    return this.$http
      .get('https://api.openweathermap.org/data/2.5/find', {
        params: new HttpParams({
          fromObject: {
            q: query,
            type: 'like',
            sort: 'population',
            cnt: '30',
            appid: environment.owm.appid,
            lang: this.$translate.getCurrentLang(),
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
