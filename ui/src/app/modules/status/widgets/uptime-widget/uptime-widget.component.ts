import { Component, OnInit } from '@angular/core';
import * as moment from 'moment';

import { WsService } from '../../../../core/ws.service';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-uptime-widget',
  templateUrl: './uptime-widget.component.html',
  styleUrls: ['./uptime-widget.component.scss'],
})
export class UptimeWidgetComponent implements OnInit {
  private io = this.$ws.getExistingNamespace('status');

  public serverUptime: string;
  public processUptime: string;

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
  ) {
    moment.locale(window.navigator['userLanguage'] || window.navigator.language);
  }

  ngOnInit() {
    this.io.socket.on('system-status', (data) => {
      this.serverUptime = moment.duration(data.time.uptime, 'seconds').humanize();
      this.processUptime = moment.duration(data.processUptime, 'seconds').humanize();
    });
  }

}
