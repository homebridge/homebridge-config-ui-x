import { Component, createEnvironmentInjector, DestroyRef, EnvironmentInjector, inject, input, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { RouterLink } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { InformationComponent } from '@/app/core/components/information/information.component'
import { HB_V2_MODAL_DATA, INFORMATION_MODAL_DATA, NODE_VERSION_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { Plugin } from '@/app/core/plugins/manage-plugins.interfaces'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { HbV2ModalComponent } from '@/app/modules/status/widgets/update-info-widget/hb-v2-modal/hb-v2-modal.component'
import { NodeVersionModalComponent } from '@/app/modules/status/widgets/update-info-widget/node-version-modal/node-version-modal.component'
import { DockerDetails, NodeJsInfo, ServerInfo, Widget } from '@/app/modules/status/widgets/widgets.interfaces'
import { environment } from '@/environments/environment'

@Component({
  templateUrl: './update-info-widget.component.html',
  styleUrls: ['./update-info-widget.component.scss'],
  standalone: true,
  imports: [
    TranslatePipe,
    RouterLink,
    NgbTooltip,
  ],
})
export class UpdateInfoWidgetComponent implements OnInit {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private injector = inject(EnvironmentInjector)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $modal = inject(NgbModal)
  private $plugin = inject(ManagePluginsService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)

  // Signals
  widget = input.required<Widget>()
  public homebridgePkg = signal<Plugin>({} as Plugin)
  public homebridgeUiPkg = signal<Plugin>({} as Plugin)
  public homebridgePluginStatus = signal<Plugin[]>([])
  public homebridgePluginStatusDone = signal<boolean>(false)
  public nodejsInfo = signal<NodeJsInfo | null>(null)
  public nodejsStatusDone = signal<boolean>(false)
  public serverInfo = signal<ServerInfo | null>(null)
  public isRunningHbV2 = signal<boolean>(false)
  public isHbV2Loaded = signal<boolean>(false)
  public isHbV2Ready = signal<boolean>(false)
  public dockerStatusDone = signal<boolean>(false)
  public dockerInfo = signal<DockerDetails>({
    latestVersion: null,
    latestReleaseBody: '',
    updateAvailable: false,
  })

  // Other properties
  private io: IoNamespace
  public packageVersion = this.$settings.env.packageVersion
  public homebridgeVersion = this.$settings.env.homebridgeVersion
  public isAdmin = this.$auth.user.admin

  public ngOnInit(): void {
    this.io = this.$ws.getExistingNamespace('status')

    // Set up reconnection handler
    this.io.connected.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      queueMicrotask(() => this.loadAllData())
    })

    // Fetch initial data if already connected - defer to avoid NG0100
    if (this.io.socket.connected) {
      queueMicrotask(() => this.loadAllData())
    }
  }

  private async loadAllData(): Promise<void> {
    await this.getNodeInfo()
    await Promise.all([
      this.checkHomebridgeVersion(),
      this.checkHomebridgeUiVersion(),
      this.getOutOfDatePlugins(),
      this.getDockerInfo(),
    ])

    // The user on UI v5 will already have a compatible Node.js version
    this.isHbV2Ready.set(true)

    if (!this.isRunningHbV2() && this.isAdmin) {
      const installedPlugins = await this.$api.get('/plugins')
      const allHb2Ready = installedPlugins
        .filter((x: any) => x.name !== 'homebridge-config-ui-x')
        .every((x: any) => {
          const hbEngines = x.engines?.homebridge?.split('||').map((s: string) => s.trim()) || []
          return hbEngines.some((v: string) => v.startsWith('^2') || v.startsWith('>=2'))
        })

      this.isHbV2Ready.set(this.isHbV2Ready() && allHb2Ready)
      this.isHbV2Loaded.set(true)
    }
  }

  public nodeVersionModal(compareVersion: string): void {
    const injector = createEnvironmentInjector([{
      provide: NODE_VERSION_MODAL_DATA,
      useValue: {
        nodeVersion: this.serverInfo()!.nodeVersion,
        latestVersion: compareVersion,
        showNodeUnsupportedWarning: this.nodejsInfo()!.showNodeUnsupportedWarning,
        homebridgeRunningInSynologyPackage: this.serverInfo()!.homebridgeRunningInSynologyPackage,
        homebridgeRunningInDocker: this.serverInfo()!.homebridgeRunningInDocker,
        homebridgePkg: this.homebridgePkg(),
        architecture: this.nodejsInfo()!.architecture,
        supportsNodeJs24: this.nodejsInfo()!.supportsNodeJs24,
      },
    }], this.injector)

    this.$modal.open(NodeVersionModalComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })
  }

  public readyForV2Modal(): void {
    const injector = createEnvironmentInjector([{
      provide: HB_V2_MODAL_DATA,
      useValue: {
        isUpdating: false,
        skipIfCompatible: false,
      },
    }], this.injector)

    this.$modal.open(HbV2ModalComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })
  }

  public installAlternateVersion(pkg: Plugin): void {
    void this.$plugin.installAlternateVersion(pkg)
  }

  public updatePackage(pkg: Plugin): void {
    void this.$plugin.upgradeHomebridge(pkg, pkg.latestVersion)
  }

  private async checkHomebridgeVersion(): Promise<void> {
    try {
      const response = await firstValueFrom(this.io.request('homebridge-version-check'))
      response.displayName = 'Homebridge'
      this.homebridgePkg.set(response)
      this.$settings.env.homebridgeVersion = response.installedVersion
      this.isRunningHbV2.set(response.installedVersion.startsWith('2.'))
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  private async getNodeInfo(): Promise<void> {
    try {
      this.serverInfo.set(await firstValueFrom(this.io.request('get-homebridge-server-info')))
      this.nodejsInfo.set(await firstValueFrom(this.io.request('nodejs-version-check')))
      this.nodejsStatusDone.set(true)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  private async checkHomebridgeUiVersion(): Promise<void> {
    try {
      const response = await firstValueFrom(this.io.request('homebridge-ui-version-check'))
      this.$settings.env.homebridgeUiVersion = response.installedVersion
      if (!environment.production) {
        response.updateAvailable = false
      }
      this.homebridgeUiPkg.set(response)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  private async getOutOfDatePlugins(): Promise<void> {
    try {
      const outOfDatePlugins = await firstValueFrom(this.io.request('get-out-of-date-plugins'))
      this.homebridgePluginStatus.set(outOfDatePlugins
        .filter((x: any) => x.name !== 'homebridge-config-ui-x' && !this.$settings.env.plugins?.hideUpdatesFor?.includes(x.name)))
      this.homebridgePluginStatusDone.set(true)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  private async getDockerInfo(): Promise<void> {
    if (this.serverInfo() && this.serverInfo()!.homebridgeRunningInDocker) {
      try {
        this.dockerInfo.set(await firstValueFrom(this.io.request('docker-version-check')))
        this.dockerStatusDone.set(true)
      } catch (error) {
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      }
    } else {
      this.dockerStatusDone.set(true)
    }
  }

  public toggleDockerExpand(): void {
    this.widget().dockerExpanded = !this.widget().dockerExpanded
    this.widget().$saveWidgetsEvent.next() // Trigger the save event
  }

  public dockerUpdateModal(): void {
    const dockerInfo = this.dockerInfo()
    const injector = createEnvironmentInjector([{
      provide: INFORMATION_MODAL_DATA,
      useValue: {
        title: this.$translate.instant('status.widget.info.docker_update_title'),
        message: this.$translate.instant('status.widget.info.docker_update_message'),
        markdownMessage2: dockerInfo.latestReleaseBody,
        subtitle: (dockerInfo.currentVersion && dockerInfo.latestVersion)
          ? `${dockerInfo.currentVersion} &rarr; ${dockerInfo.latestVersion}`
          : this.$translate.instant('accessories.control.unknown'),
        ctaButtonLabel: this.$translate.instant('form.button_more_info'),
        faIconClass: 'fab fa-docker primary-text',
        ctaButtonLink: 'https://github.com/homebridge/docker-homebridge/wiki/How-To-Update-Docker-Homebridge',
      },
    }], this.injector)

    this.$modal.open(InformationComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })
  }
}
