import { NgClass, TitleCasePipe } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'

import { InformationComponent } from '@/app/core/components/information/information.component'
import { IoNamespace, WsService } from '@/app/core/ws.service'

@Component({
  templateUrl: './system-info-widget.component.html',
  styleUrls: ['./system-info-widget.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TitleCasePipe,
    TranslatePipe,
  ],
})
export class SystemInfoWidgetComponent implements OnInit {
  private $modal = inject(NgbModal)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private io: IoNamespace

  @Input() widget: any

  public serverInfo: any
  public nodejsInfo = {} as any

  public ngOnInit() {
    this.io = this.$ws.getExistingNamespace('status')
    this.io.connected.subscribe(async () => {
      this.getSystemInfo()
    })

    if (this.io.socket.connected) {
      this.getSystemInfo()
    }
  }

  public glibcVersionModal() {
    const ref = this.$modal.open(InformationComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.title = this.$translate.instant('status.widget.info.glibc_title')
    ref.componentInstance.message = this.$translate.instant('status.widget.info.glibc_message')
    ref.componentInstance.ctaButtonLabel = this.$translate.instant('form.button_more_info')
    ref.componentInstance.faIconClass = 'fab fa-fw fa-node-js primary-text'
    ref.componentInstance.ctaButtonLink = 'https://github.com/homebridge/homebridge-config-ui-x/wiki/Troubleshooting/#error---update-node---your-version-of-linux-does-not-meet-the-glibc-version'
  }

  private getSystemInfo() {
    this.io.request('get-homebridge-server-info').subscribe((data) => {
      this.serverInfo = data
    })

    this.io.request('nodejs-version-check').subscribe((data) => {
      this.nodejsInfo = data
    })
  }
}
