import { Component, OnInit } from '@angular/core';

import { WsService } from '@/app/core/ws.service';
import { AuthService } from '@/app/core/auth/auth.service';

@Component({
  selector: 'app-system-info-widget',
  templateUrl: './system-info-widget.component.html',
  styleUrls: ['./system-info-widget.component.scss'],
})
export class SystemInfoWidgetComponent implements OnInit {
  private io = this.$ws.getExistingNamespace('status');

  public serverInfo;
  public nodejsInfo = {} as any;

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
  ) { }

  ngOnInit() {
    this.io.connected.subscribe(async () => {
      this.getSystemInfo();
    });

    if (this.io.socket.connected) {
      this.getSystemInfo();
    }
  }

  getSystemInfo() {
    this.io.request('get-homebridge-server-info').subscribe((data) => {
      this.serverInfo = data;
    });

    this.io.request('nodejs-version-check').subscribe((data) => {
      this.nodejsInfo = data;
    });
  }

}
