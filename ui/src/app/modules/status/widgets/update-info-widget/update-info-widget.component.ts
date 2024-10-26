import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { RouterLink } from '@angular/router'
import { NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { InformationComponent } from '@/app/core/components/information/information.component'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { HbV2ModalComponent } from '@/app/modules/status/widgets/update-info-widget/hb-v2-modal/hb-v2-modal.component'

@Component({
  templateUrl: './update-info-widget.component.html',
  styleUrls: ['./update-info-widget.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
    RouterLink,
    NgbTooltip,
  ],
})
export class UpdateInfoWidgetComponent implements OnInit {
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $plugin = inject(ManagePluginsService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private io: IoNamespace

  @Input() widget: any

  public homebridgePkg = {} as any
  public homebridgeUiPkg = {} as any
  public homebridgePluginStatus = [] as any
  public homebridgePluginStatusDone = false as boolean
  public nodejsInfo = {} as any
  public nodejsStatusDone = false as boolean
  public serverInfo: any
  public isRunningHbV2 = false
  public isHbV2Ready = false
  public packageVersion = this.$settings.env.packageVersion
  public homebridgeVersion = this.$settings.env.homebridgeVersion

  public async ngOnInit() {
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

    // The user on UI v5 will already have a compatible Node.js version
    this.isHbV2Ready = true

    if (!this.isRunningHbV2) {
      const installedPlugins = await firstValueFrom(this.$api.get('/plugins'))
      const allHb2Ready = installedPlugins
        .filter((x: any) => x.name !== 'homebridge-config-ui-x')
        .every((x: any) => {
          const hbEngines = x.engines?.homebridge?.split('||').map((s: string) => s.trim()) || []
          return hbEngines.some((v: string) => v.startsWith('^2') || v.startsWith('>=2'))
        })

      this.isHbV2Ready = this.isHbV2Ready && allHb2Ready
    }
  }

  public nodeUpdateModal() {
    const ref = this.$modal.open(InformationComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.title = this.$translate.instant('status.widget.info.node_update_title')
    ref.componentInstance.message = this.$translate.instant('status.widget.info.node_update_message')
    if (this.serverInfo.homebridgeRunningInSynologyPackage || this.serverInfo.homebridgeRunningInDocker) {
      ref.componentInstance.message2 = this.$translate.instant('status.widget.info.node_update_message_2')
    }
    ref.componentInstance.subtitle = `${this.serverInfo.nodeVersion} &rarr; ${this.nodejsInfo.latestVersion}`
    ref.componentInstance.ctaButtonLabel = this.$translate.instant('form.button_more_info')
    ref.componentInstance.faIconClass = 'fab fa-fw fa-node-js primary-text'
    ref.componentInstance.ctaButtonLink = 'https://github.com/homebridge/homebridge/wiki/How-To-Update-Node.js'
  }

  public nodeUnsupportedModal() {
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

  public readyForV2Modal() {
    const ref = this.$modal.open(HbV2ModalComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.isUpdating = false
    ref.componentInstance.skipIfCompatible = false
  }

  public installAlternateVersion(pkg) {
    this.$plugin.installAlternateVersion(pkg)
  }

  public updatePackage(pkg) {
    this.$plugin.upgradeHomebridge(pkg, pkg.latestVersion)
  }

  private async checkHomebridgeVersion() {
    try {
      const response = await firstValueFrom(this.io.request('homebridge-version-check'))
      this.homebridgePkg = response
      this.homebridgePkg.displayName = 'Homebridge'
      this.$settings.env.homebridgeVersion = response.installedVersion
      this.isRunningHbV2 = response.installedVersion.startsWith('2.')
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  private async getNodeInfo() {
    try {
      this.serverInfo = await firstValueFrom(this.io.request('get-homebridge-server-info'))
      this.nodejsInfo = await firstValueFrom(this.io.request('nodejs-version-check'))
      this.nodejsStatusDone = true
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  private async checkHomebridgeUiVersion() {
    try {
      const response = await firstValueFrom(this.io.request('homebridge-ui-version-check'))
      this.homebridgeUiPkg = response
      this.$settings.env.homebridgeUiVersion = response.installedVersion
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  private async getOutOfDatePlugins() {
    try {
      const outOfDatePlugins = await firstValueFrom(this.io.request('get-out-of-date-plugins'))
      this.homebridgePluginStatus = outOfDatePlugins
        .filter((x: any) => x.name !== 'homebridge-config-ui-x' && !this.$settings.env.plugins?.hideUpdatesFor?.includes(x.name))
      this.homebridgePluginStatusDone = true
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }
}
