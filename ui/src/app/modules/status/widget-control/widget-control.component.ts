import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  switchMap,
  tap,
} from 'rxjs/operators';
import { ApiService } from '@/app/core/api.service';
import { environment } from '@/environments/environment';

@Component({
  selector: 'app-widget-control',
  templateUrl: './widget-control.component.html',
  styleUrls: ['./widget-control.component.scss'],
})
export class WidgetControlComponent implements OnInit {
  @Input() widget: any;

  // weather
  public searching: boolean;

  // terminal
  public fontSizes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  public fontWeights = ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'bold', 'normal'];

  // clock
  public currentDate = new Date();

  public timeFormats = [
    'h:mm a',
    'h:mm:ss a',
    'H:mm',
    'H:mm:ss',
  ];

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
  ];

  // cpu
  public temperatureUnits = [
    { label: 'status.widget.label_temperature_units_system_default', value: '' },
    { label: 'status.widget.label_temperature_units_celsius', value: 'c' },
    { label: 'status.widget.label_temperature_units_fahrenheit', value: 'f' },
  ];

  public networkInterfaces: string[] = [];

  constructor(
    public activeModal: NgbActiveModal,
    private $api: ApiService,
    private $http: HttpClient,
    private $translate: TranslateService,
  ) {}

  public searchCountryCodes = (text$: Observable<string>) =>
    text$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap(() => this.searching = true),
      switchMap(term =>
        term.length < 3 ? [] :
          this.findOpenWeatherMapCity(term).pipe(
            catchError(() => {
              this.searching = false;
              return of([]);
            })),
      ),
      tap(() => this.searching = false),
    );

  public searchCountryCodeFormatter = (result: any) => result.name + ', ' + result.country;

  ngOnInit() {
    if (this.widget.component === 'HomebridgeLogsWidgetComponent' || this.widget.component === 'TerminalWidgetComponent') {
      if (!this.widget.fontWeight) {
        this.widget.fontWeight = '400';
      }
      if (!this.widget.fontSize) {
        this.widget.fontSize = 15;
      }
    }
    if (this.widget.component === 'NetworkWidgetComponent') {
      // Get a list of active network interfaces from the settings
      this.$api.get('/server/network-interfaces/bridge').toPromise()
        .then((adapters) => {
          this.networkInterfaces = adapters;
        });
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
      }).pipe(
        map((response: any) => response.list.map((item) => ({
          id: item.id,
          name: item.name,
          country: item.sys.country,
          coord: item.coord,
        }))),
      );
  }
}
