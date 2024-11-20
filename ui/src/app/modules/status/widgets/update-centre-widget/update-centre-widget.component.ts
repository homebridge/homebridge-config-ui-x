import { InformationComponent } from '@/app/core/components/information/information.component'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { RouterLink } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  templateUrl: './update-centre-widget.component.html',
  styleUrls: ['./update-centre-widget.component.scss'],
  imports: [
    NgClass,
    RouterLink,
    TranslatePipe,
  ],
})
export class UpdateCentreWidgetComponent implements OnInit {
  private $modal = inject(NgbModal)
  $plugin = inject(ManagePluginsService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)

  @Input() widget: any

  public homebridgePkg = {} as any
  public homebridgeUiPkg = {} as any
  public homebridgePluginStatus = [] as any
  public homebridgePluginStatusDone = false as boolean
  public nodejsInfo = {} as any
  public nodejsStatusDone = false as boolean
  public serverInfo: any

  private io: IoNamespace

  async ngOnInit() {
    this.io = this.$ws.getExistingNamespace('status')

    this.io.connected.subscribe(async () => {
      await Promise.all([
        this.checkHomebridgeVersion(),
        this.checkHomebridgeUiVersion(),
        this.getOutOfDatePlugins(),
        this.getNodeInfo(),
      ])
    })

    if (this.io.socket.connected) {
      await Promise.all([
        this.checkHomebridgeVersion(),
        this.checkHomebridgeUiVersion(),
        this.getOutOfDatePlugins(),
        this.getNodeInfo(),
      ])
    }
  }

  async checkHomebridgeVersion() {
    try {
      const response = await firstValueFrom(this.io.request('homebridge-version-check'))
      this.homebridgePkg = response
      this.$settings.env.homebridgeVersion = response.installedVersion
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  async getNodeInfo() {
    try {
      this.serverInfo = await firstValueFrom(this.io.request('get-homebridge-server-info'))
      this.nodejsInfo = await firstValueFrom(this.io.request('nodejs-version-check'))
      this.nodejsStatusDone = true
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  async checkHomebridgeUiVersion() {
    try {
      const response = await firstValueFrom(this.io.request('homebridge-ui-version-check'))
      this.homebridgeUiPkg = response
      this.$settings.env.homebridgeUiVersion = response.installedVersion
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  async getOutOfDatePlugins() {
    try {
      const outOfDatePlugins = await firstValueFrom(this.io.request('get-out-of-date-plugins'))
      this.homebridgePluginStatus = outOfDatePlugins.filter((x: any) => x.name !== 'homebridge-config-ui-x')
      this.homebridgePluginStatusDone = true
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  nodeUpdateModal() {
    const ref = this.$modal.open(InformationComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.title = `${this.$translate.instant('status.widget.info.node_update_title')} - ${this.nodejsInfo.latestVersion}`
    ref.componentInstance.message = this.$translate.instant('status.widget.info.node_update_message')
    ref.componentInstance.ctaButtonLabel = this.$translate.instant('form.button_more_info')
    ref.componentInstance.faIconClass = 'fab fa-fw fa-node-js primary-text'
    ref.componentInstance.ctaButtonLink = 'https://github.com/homebridge/homebridge/wiki/How-To-Update-Node.js'
  }

  nodeUnsupportedModal() {
    const ref = this.$modal.open(InformationComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.title = this.$translate.instant('status.widget.info.node_unsupp_title')
    ref.componentInstance.message = this.$translate.instant('status.widget.info.node_unsupp_message')
    ref.componentInstance.ctaButtonLabel = this.$translate.instant('form.button_more_info')
    ref.componentInstance.faIconClass = 'fab fa-fw fa-node-js primary-text'
    ref.componentInstance.ctaButtonLink = 'https://github.com/homebridge/homebridge/wiki/How-To-Update-Node.js'
  }
}
