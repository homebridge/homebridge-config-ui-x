import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { RouterLink } from '@angular/router'
import { NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { InformationComponent } from '@/app/core/components/information/information.component'
import { Plugin } from '@/app/core/manage-plugins/manage-plugins.interfaces'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { HbV2ModalComponent } from '@/app/modules/status/widgets/update-info-widget/hb-v2-modal/hb-v2-modal.component'
import { NodeVersionModalComponent } from '@/app/modules/status/widgets/update-info-widget/node-version-modal/node-version-modal.component'
import { DockerDetails, NodeJsInfo, ServerInfo, Widget } from '@/app/modules/status/widgets/widgets.interfaces'

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
  private $auth = inject(AuthService)
  private $modal = inject(NgbModal)
  private $plugin = inject(ManagePluginsService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private io: IoNamespace

  @Input() widget: Widget

  public homebridgePkg: Plugin = {} as Plugin
  public homebridgeUiPkg: Plugin = {} as Plugin
  public homebridgePluginStatus: Plugin[] = []
  public homebridgePluginStatusDone = false
  public nodejsInfo: NodeJsInfo
  public nodejsStatusDone = false
  public serverInfo: ServerInfo
  public isRunningHbV2 = false
  public isHbV2Loaded = false
  public isHbV2Ready = false
  public packageVersion = this.$settings.env.packageVersion
  public homebridgeVersion = this.$settings.env.homebridgeVersion
  public isAdmin = this.$auth.user.admin
  public dockerStatusDone = false as boolean
  public dockerExpanded = false
  public dockerInfo: DockerDetails = {
    latestVersion: null,
    latestReleaseBody: '',
    updateAvailable: false,
  }

  public async ngOnInit() {
    this.io = this.$ws.getExistingNamespace('status')

    this.io.connected.subscribe(async () => {
      await this.getNodeInfo()
      await Promise.all([
        this.checkHomebridgeVersion(),
        this.checkHomebridgeUiVersion(),
        this.getOutOfDatePlugins(),
        this.getDockerInfo(),
      ])
    })

    if (this.io.socket.connected) {
      await this.getNodeInfo()
      await Promise.all([
        this.checkHomebridgeVersion(),
        this.checkHomebridgeUiVersion(),
        this.getOutOfDatePlugins(),
        this.getDockerInfo(),
      ])
    }

    // The user on UI v5 will already have a compatible Node.js version
    this.isHbV2Ready = true

    if (!this.isRunningHbV2 && this.isAdmin) {
      const installedPlugins = await firstValueFrom(this.$api.get('/plugins'))
      const allHb2Ready = installedPlugins
        .filter((x: any) => x.name !== 'homebridge-config-ui-x')
        .every((x: any) => {
          const hbEngines = x.engines?.homebridge?.split('||').map((s: string) => s.trim()) || []
          return hbEngines.some((v: string) => v.startsWith('^2') || v.startsWith('>=2'))
        })

      this.isHbV2Ready = this.isHbV2Ready && allHb2Ready
      this.isHbV2Loaded = true
    }
  }

  public nodeVersionModal(compareVersion: string) {
    const ref = this.$modal.open(NodeVersionModalComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.nodeVersion = this.serverInfo.nodeVersion
    ref.componentInstance.latestVersion = compareVersion
    ref.componentInstance.showNodeUnsupportedWarning = this.nodejsInfo.showNodeUnsupportedWarning
    ref.componentInstance.homebridgeRunningInSynologyPackage = this.serverInfo.homebridgeRunningInSynologyPackage
    ref.componentInstance.homebridgeRunningInDocker = this.serverInfo.homebridgeRunningInDocker
    ref.componentInstance.homebridgePkg = this.homebridgePkg
  }

  public readyForV2Modal() {
    const ref = this.$modal.open(HbV2ModalComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.isUpdating = false
    ref.componentInstance.skipIfCompatible = false
  }

  public installAlternateVersion(pkg: Plugin) {
    this.$plugin.installAlternateVersion(pkg)
  }

  public updatePackage(pkg: Plugin) {
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

  private async getDockerInfo() {
    if (this.serverInfo?.homebridgeRunningInDocker) {
      try {
        this.dockerInfo = await firstValueFrom(this.io.request('docker-version-check'))
        this.dockerStatusDone = true
      } catch (error) {
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      }
    } else {
      this.dockerStatusDone = true
    }
  }

  public toggleDockerExpand() {
    this.dockerExpanded = !this.dockerExpanded
  }

  public dockerUpdateModal() {
    const ref = this.$modal.open(InformationComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.title = this.$translate.instant('status.widget.info.docker_update_title')
    ref.componentInstance.message = this.$translate.instant('status.widget.info.docker_update_message')
    ref.componentInstance.markdownMessage2 = this.dockerInfo.latestReleaseBody
    ref.componentInstance.subtitle = (this.dockerInfo.currentVersion && this.dockerInfo.latestVersion)
      ? `${this.dockerInfo.currentVersion} → ${this.dockerInfo.latestVersion}`
      : this.$translate.instant('accessories.control.unknown')
    ref.componentInstance.ctaButtonLabel = this.$translate.instant('form.button_more_info')
    ref.componentInstance.faIconClass = 'fab fa-fw fa-docker primary-text'
    ref.componentInstance.ctaButtonLink = 'https://github.com/homebridge/docker-homebridge/wiki/How-To-Update-Docker-Homebridge'
  }
}
