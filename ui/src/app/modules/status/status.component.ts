import { Component, ElementRef, OnInit, ViewChild, OnDestroy } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { WsService } from '../../core/ws.service';
import { AuthService } from '../../core/auth/auth.service';
import { ApiService } from '../../core/api.service';
import { ManagePluginsService } from '../../core/manage-plugins/manage-plugins.service';
import { ResetHomebridgeModalComponent } from './reset-homebridge-modal/reset-homebridge-modal.component';

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
    './status.component.scss',
  ],
})
export class StatusComponent implements OnInit, OnDestroy {
  @ViewChild('qrcode', { static: true }) qrcode: ElementRef;

  private io = this.$ws.connectToNamespace('status');

  public server: HomebridgeStatus = {};
  public stats: any = {};
  public homebridge: any = {};
  public outOfDatePlugins: Array<any> = [];

  public loadedQrCode = false;
  public consoleStatus;

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
    public $plugin: ManagePluginsService,
    private $api: ApiService,
    public $toastr: ToastrService,
    private $modal: NgbModal,
  ) { }

  ngOnInit() {
    this.io.connected.subscribe(async () => {
      this.consoleStatus = 'up';
      this.io.socket.emit('monitor-server-status');
      await this.checkHomebridgeVersion();
      await this.getOutOfDatePlugins();
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
      if (this.server.packageVersion && this.server.packageVersion !== this.$auth.env.packageVersion) {
        // tslint:disable-next-line:deprecation
        window.location.reload(true);
      }
    });
  }

  checkHomebridgeVersion() {
    return this.io.request('homebridge-version-check').toPromise()
      .then((response) => {
        this.homebridge = response;
      })
      .catch((err) => {
        this.$toastr.error(err.message);
      });
  }

  getOutOfDatePlugins() {
    return this.io.request('get-out-of-date-plugins').toPromise()
      .then((response) => {
        this.outOfDatePlugins = response;
      })
      .catch((err) => {
        this.$toastr.error(err.message);
      });
  }

  getQrCodeImage() {
    if (!this.loadedQrCode) {
      return this.$api.get('/server/qrcode.svg', { responseType: 'text' as 'text' }).subscribe(
        (svg) => {
          this.qrcode.nativeElement.innerHTML = svg;
          this.loadedQrCode = true;
        },
        (err) => {
          this.loadedQrCode = false;
        },
      );
    }
  }

  resetHomebridgeState() {
    this.$modal.open(ResetHomebridgeModalComponent, {
      size: 'lg',
    });
  }

  ngOnDestroy() {
    this.io.end();
  }

}
