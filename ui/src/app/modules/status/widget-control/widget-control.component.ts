import { Component, OnInit, Input } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, tap, switchMap, catchError } from 'rxjs/operators';

@Component({
  selector: 'app-widget-control',
  templateUrl: './widget-control.component.html',
  styleUrls: ['./widget-control.component.scss'],
})
export class WidgetControlComponent implements OnInit {

  constructor(
    public activeModal: NgbActiveModal,
    private $http: HttpClient,
  ) { }
  @Input() widget;

  public searching: boolean;

  public fontSizes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  public fontWeights = ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'bold', 'normal'];

  public searchCountryCodes = (text$: Observable<string>) =>
    text$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap(() => this.searching = true),
      switchMap(term =>
        term.length < 3 ? [] :
          this.findOpenWeatherMapCity(term).pipe(
            catchError((e) => {
              this.searching = false;
              return of([]);
            })),
      ),
      tap(() => this.searching = false),
    )

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
  }

  findOpenWeatherMapCity(query: string) {
    return this.$http
      .get('https://openweathermap.org/data/2.5/find', {
        params: new HttpParams({
          fromObject: {
            q: query,
            type: 'like',
            sort: 'population',
            cnt: '30',
            appid: 'b6907d289e10d714a6e88b30761fae22',
          },
        }),
      }).pipe(
        map((response: any) => {
          return response.list.map((item) => {
            return {
              id: item.id,
              name: item.name,
              country: item.sys.country,
              coord: item.coord,
            };
          });
        }),
      );
  }

}
