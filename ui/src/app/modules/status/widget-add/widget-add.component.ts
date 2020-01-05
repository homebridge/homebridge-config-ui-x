import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Subject } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-widget-add',
  templateUrl: './widget-add.component.html',
  styleUrls: ['./widget-add.component.scss'],
})
export class WidgetAddComponent implements OnInit {
  @Input() dashboard;

  private allWidgets = [
    {
      name: this.translate.instant('status.widget.add.label_homebridge_status'),
      component: 'HomebridgeStatusWidgetComponent',
      hidden: false,
      cols: 10,
      rows: 3,
      mobileOrder: 0,
    },
    {
      name: this.translate.instant('status.widget.add.label_pairing_code'),
      component: 'HapQrcodeWidgetComponent',
      hidden: false,
      cols: 3,
      rows: 7,
      mobileOrder: 9,
    },
    {
      name: this.translate.instant('status.cpu.title_cpu'),
      component: 'CpuWidgetComponent',
      hidden: false,
      cols: 5,
      rows: 3,
      mobileOrder: 2,
    },
    {
      name: this.translate.instant('status.memory.title_memory'),
      component: 'MemoryWidgetComponent',
      hidden: false,
      cols: 5,
      rows: 3,
      mobileOrder: 3,
    },
    {
      name: this.translate.instant('status.uptime.title_uptime'),
      component: 'UptimeWidgetComponent',
      hidden: false,
      cols: 5,
      rows: 3,
      mobileOrder: 4,
    },
    {
      name: this.translate.instant('status.widget.label_systeminfo'),
      component: 'SystemInfoWidgetComponent',
      hidden: false,
      cols: 5,
      rows: 9,
      mobileOrder: 6,
    },
    {
      name: this.translate.instant('status.widget.label_homebridge_logs'),
      component: 'HomebridgeLogsWidgetComponent',
      hidden: false,
      cols: 7,
      rows: 6,
      mobileOrder: 10,
      hideOnMobile: true,
    },
    {
      name: 'Homebridge ' + this.translate.instant('menu.docker.label_terminal'),
      component: 'TerminalWidgetComponent',
      hidden: !this.$auth.env.enableTerminalAccess,
      cols: 7,
      rows: 6,
      mobileOrder: 10,
      hideOnMobile: true,
    },
    {
      name: 'Weather',
      component: 'WeatherWidgetComponent',
      hidden: false,
      cols: 3,
      rows: 5,
      mobileOrder: 1,
      requiresConfig: true,
    },
    {
      name: 'Accessories',
      component: 'AccessoriesWidgetComponent',
      hidden: !this.$auth.env.enableAccessories,
      cols: 7,
      rows: 9,
      mobileOrder: 5,
      hideOnMobile: false,
    },
  ];

  public availableWidgets = [];

  constructor(
    public activeModal: NgbActiveModal,
    private translate: TranslateService,
    private $auth: AuthService,
  ) { }

  ngOnInit() {
    this.availableWidgets = this.allWidgets.filter(x => !this.dashboard.some(i => i.component === x.component) && !x.hidden);
  }

  selectWidget(widget) {
    this.activeModal.close(widget);
  }

}
