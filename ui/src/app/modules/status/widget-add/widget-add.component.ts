import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';

import { SettingsService } from '@/app/core/settings.service';

@Component({
  selector: 'app-widget-add',
  templateUrl: './widget-add.component.html',
  styleUrls: ['./widget-add.component.scss'],
})
export class WidgetAddComponent implements OnInit {
  @Input() dashboard;
  @Input() resetLayout: () => void;
  @Input() lockLayout: () => void;
  @Input() unlockLayout: () => void;
  @Input() public isLayoutUnlocked: boolean;

  private allWidgets = [
    {
      name: this.translate.instant('status.widget.add.label_homebridge_status'),
      component: 'HomebridgeStatusWidgetComponent',
      hidden: false,
      cols: 10,
      rows: 3,
      mobileOrder: 10,
    },
    {
      name: this.translate.instant('status.widget.weather.title_weather'),
      component: 'WeatherWidgetComponent',
      hidden: false,
      cols: 3,
      rows: 5,
      mobileOrder: 20,
      requiresConfig: true,
    },
    {
      name: this.translate.instant('accessories.title_accessories'),
      component: 'AccessoriesWidgetComponent',
      hidden: !this.$settings.env.enableAccessories,
      cols: 7,
      rows: 9,
      mobileOrder: 30,
      hideOnMobile: false,
    },
    {
      name: 'Child Bridge Status',
      component: 'ChildBridgeWidgetComponent',
      hidden: !this.$settings.env.serviceMode,
      cols: 5,
      rows: 9,
      mobileOrder: 35,
    },
    {
      name: this.translate.instant('status.cpu.title_cpu'),
      component: 'CpuWidgetComponent',
      hidden: false,
      cols: 5,
      rows: 3,
      mobileOrder: 40,
    },
    {
      name: this.translate.instant('status.memory.title_memory'),
      component: 'MemoryWidgetComponent',
      hidden: false,
      cols: 5,
      rows: 3,
      mobileOrder: 50,
    },
    {
      name: this.translate.instant('status.network.title_network'),
      component: 'NetworkWidgetComponent',
      hidden: false,
      cols: 10,
      rows: 3,
      mobileOrder: 55,
    },
    {
      name: this.translate.instant('status.uptime.title_uptime'),
      component: 'UptimeWidgetComponent',
      hidden: false,
      cols: 5,
      rows: 3,
      mobileOrder: 60,
    },
    {
      name: this.translate.instant('status.widget.label_systeminfo'),
      component: 'SystemInfoWidgetComponent',
      hidden: false,
      cols: 5,
      rows: 9,
      mobileOrder: 70,
    },
    {
      name: this.translate.instant('status.widget.add.label_pairing_code'),
      component: 'HapQrcodeWidgetComponent',
      hidden: false,
      cols: 3,
      rows: 7,
      mobileOrder: 100,
    },
    {
      name: this.translate.instant('status.widget.label_homebridge_logs'),
      component: 'HomebridgeLogsWidgetComponent',
      hidden: false,
      cols: 7,
      rows: 6,
      mobileOrder: 1000,
      hideOnMobile: true,
    },
    {
      name: 'Homebridge ' + this.translate.instant('menu.docker.label_terminal'),
      component: 'TerminalWidgetComponent',
      hidden: !this.$settings.env.enableTerminalAccess,
      cols: 7,
      rows: 6,
      mobileOrder: 1000,
      hideOnMobile: true,
    },
    {
      name: this.translate.instant('status.widget.label_clock'),
      component: 'ClockWidgetComponent',
      cols: 5,
      rows: 3,
      mobileOrder: 23,
      hideOnMobile: true,
    },
  ];

  public availableWidgets = [];

  constructor(
    public activeModal: NgbActiveModal,
    private translate: TranslateService,
    private $settings: SettingsService,
  ) { }

  ngOnInit() {
    this.availableWidgets = this.allWidgets.filter(x => !this.dashboard.some(i => i.component === x.component) && !x.hidden);
  }

  selectWidget(widget) {
    this.activeModal.close(widget);
  }

  doResetLayout() {
    this.resetLayout();
    this.activeModal.dismiss();
  }

  doLockLayout() {
    this.lockLayout();
    this.activeModal.dismiss();
  }

  doUnlockLayout() {
    this.unlockLayout();
    this.activeModal.dismiss();
  }

}
