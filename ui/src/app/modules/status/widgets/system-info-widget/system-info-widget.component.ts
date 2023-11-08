import { Component, OnInit } from '@angular/core';

import { WsService } from '@/app/core/ws.service';
import { AuthService } from '@/app/core/auth/auth.service';
import { InformationComponent } from '@/app/core/components/information/information.component';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

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
//
  glibcVersionModal() {
    const ref = this.$modal.open(InformationComponent);
    ref.componentInstance.title = 'OS Update';
    ref.componentInstance.message = 'This message indicates that your operating system does not support newer versions of Node.js. ' +
      'To resolve this and be able to install updated versions of Node.js in the future, ' +
      'you will need to update your operating system to a more recent version.';
    ref.componentInstance.ctaButtonLabel = 'More Info';
    ref.componentInstance.ctaButtonLink = 'https://homebridge.io/w/JJSun';
  }
}
