import { Component, ElementRef, OnInit, ViewChild, OnDestroy } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

import { WsService } from '../_services/ws.service';
import { ApiService } from '../_services/api.service';
import { AuthService } from '../_services/auth.service';
import { PluginService } from '../_services/plugin.service';

interface HomebridgeStatus {
  consolePort?: number;
  port?: number;
  pin?: string;
  status?: string;
  packageVersion?: string;
}

@Component({
  selector: 'app-status',
  templateUrl: './status.component.html',
  styleUrls: [
    './status.component.scss'
  ]
})
export class StatusComponent implements OnInit, OnDestroy {
  @ViewChild('qrcode') qrcode: ElementRef;

  private io = this.$ws.connectToNamespace('status');

  public server: HomebridgeStatus = {};
  public stats: any = {};
  public homebridge: any = {};

  public loadedQrCode = false;
  public consoleStatus;

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
    public $plugin: PluginService,
    private $api: ApiService,
    public toastr: ToastrService,
  ) { }

  ngOnInit() {
    this.checkHomebridgeVersion();

    if (this.io.socket.io.readyState) {
      this.consoleStatus = 'up';
    }

    this.io.socket.on('connect', () => {
      this.consoleStatus = 'up';
      this.io.socket.emit('monitor-server-status');
    });

    this.io.socket.on('disconnect', () => {
      this.consoleStatus = 'down';
      this.server.status = 'down';
      this.loadedQrCode = false;
    });

    // listen for to stats data
    this.io.socket.on('system-status', (data) => {
      this.stats = data;
    });

    this.io.socket.on('homebridge-status', (data) => {
      this.server = data;
      this.getQrCodeImage();

      // check if client is up-to-date
      // if (this.server.packageVersion && this.server.packageVersion !== this.$auth.env.packageVersion) {
      //   window.location.reload(true);
      // }
    });
  }

  checkHomebridgeVersion() {
    this.io.request('homebridge-version-check').subscribe(
      (response) => {
        this.homebridge = response;
      },
      (err) => {
        this.toastr.error(err.message);
      }
    );
  }

  getQrCodeImage() {
    if (!this.loadedQrCode) {
      return this.$api.getQrCode().subscribe(
        (svg) => {
          this.qrcode.nativeElement.innerHTML = svg;
          this.loadedQrCode = true;
        },
        (err) => {
          this.loadedQrCode = false;
        }
      );
    }
  }

  ngOnDestroy() {
    this.io.socket.disconnect();
    this.io.socket.removeAllListeners();
  }

}

export const StatusStates = {
  name: 'status',
  url: '/',
  component: StatusComponent,
  data: {
    requiresAuth: true
  }
};

