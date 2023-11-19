import { Component, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '@/app/core/auth/auth.service';
import { InformationComponent } from '@/app/core/components/information/information.component';
import { WsService } from '@/app/core/ws.service';

@Component({
  selector: 'app-system-info-widget',
  templateUrl: './system-info-widget.component.html',
  styleUrls: ['./system-info-widget.component.scss'],
})
export class SystemInfoWidgetComponent implements OnInit {
  private io = this.$ws.getExistingNamespace('status');

  public serverInfo: any;
  public nodejsInfo = {} as any;

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
    private $modal: NgbModal,
    private $translate: TranslateService,
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

  glibcVersionModal() {
    const ref = this.$modal.open(InformationComponent);
    ref.componentInstance.title = this.$translate.instant('status.widget.systeminfo.modal_glibc_title');
    ref.componentInstance.message = this.$translate.instant('status.widget.systeminfo.modal_glibc_message');
    ref.componentInstance.ctaButtonLabel = this.$translate.instant('status.widget.systeminfo.modal_glibc_cta');

    // eslint-disable-next-line max-len
    ref.componentInstance.ctaButtonLink = 'https://github.com/homebridge/homebridge-config-ui-x/wiki/Troubleshooting/#error---update-node---your-version-of-linux-does-not-meet-the-glibc-version';
  }

  serviceModeModal() {
    const ref = this.$modal.open(InformationComponent);
    ref.componentInstance.title = this.$translate.instant('status.widget.systeminfo.modal_servicemode_title');
    ref.componentInstance.message = this.$translate.instant('status.widget.systeminfo.modal_servicemode_message');
    ref.componentInstance.ctaButtonLabel = this.$translate.instant('status.widget.systeminfo.modal_servicemode_cta');

    // eslint-disable-next-line max-len
    ref.componentInstance.ctaButtonLink = 'https://github.com/homebridge/homebridge-config-ui-x/wiki/How-To-Swap-From-Standalone-Mode-to-Service-Mode';
  }
}
