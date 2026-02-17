import { ChangeDetectionStrategy, Component, createEnvironmentInjector, DestroyRef, EnvironmentInjector, inject, input, OnInit, signal } from '@angular/core'
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
import { HomebridgeUiUpdatePolicy, HomebridgeUpdatePolicy, NodeUpdatePolicy } from '@/app/core/settings.interfaces'
import { SettingsService } from '@/app/core/ui/settings.service'
import { HbV2ModalComponent } from '@/app/modules/status/widgets/update-info-widget/hb-v2-modal/hb-v2-modal.component'
import { NodeVersionModalComponent } from '@/app/modules/status/widgets/update-info-widget/node-version-modal/node-version-modal.component'
import {
  DockerDetails,
  NodeJsInfo,
  ServerInfo,
  Widget,
} from '@/app/modules/status/widgets/widgets.interfaces'
import { environment } from '@/environments/environment'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './update-info-widget.component.html',
  styleUrl: './update-info-widget.component.scss',
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
  readonly widget = input.required<Widget>()
  public readonly homebridgePkg = signal<Plugin>({} as Plugin)
  public readonly homebridgeUiPkg = signal<Plugin>({} as Plugin)
  public readonly homebridgePluginStatus = signal<Plugin[]>([])
  public readonly homebridgePluginStatusDone = signal<boolean>(false)
  public readonly nodejsInfo = signal<NodeJsInfo | null>(null)
  public readonly nodejsStatusDone = signal<boolean>(false)
  public readonly serverInfo = signal<ServerInfo | null>(null)
  public readonly isRunningHbV2 = signal<boolean>(false)
  public readonly isHbV2Loaded = signal<boolean>(false)
  public readonly isHbV2Ready = signal<boolean>(false)
  public readonly dockerStatusDone = signal<boolean>(false)
  public readonly dockerInfo = signal<DockerDetails>({
    latestVersion: null,
    latestReleaseBody: '',
    updateAvailable: false,
  })

  // Other properties
  private io: IoNamespace
  public packageVersion = this.$settings.env.packageVersion
  public homebridgeVersion = this.$settings.env.homebridgeVersion
  public isAdmin = this.$auth.user.admin
  public nodeUpdatePolicy: NodeUpdatePolicy = 'all'
  public homebridgeUpdatePolicy: HomebridgeUpdatePolicy = 'all'
  public homebridgeUiUpdatePolicy: HomebridgeUiUpdatePolicy = 'all'

  public ngOnInit(): void {
    this.io = this.$ws.getExistingNamespace('status')
    this.nodeUpdatePolicy = this.$settings.env.nodeUpdatePolicy || 'all'
    this.homebridgeUiUpdatePolicy = this.$settings.env.homebridgeUiUpdatePolicy || 'all'
    this.homebridgeUpdatePolicy = this.$settings.env.homebridgeUpdatePolicy || 'all'

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
          return hbEngines.some(
            (v: string) => v.startsWith('^2') || v.startsWith('>=2'),
          )
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
        statusIo: this.io,
        onUpdate: async () => {
          // Reload to refresh the widget display
          await this.getNodeInfo()
        },
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
    // Pass a callback to refresh the widget when settings change (Angular 20 feature)
    const onSettingsChange = async () => {
      if (pkg.name === 'homebridge') {
        await this.checkHomebridgeVersion()
      } else if (pkg.name === 'homebridge-config-ui-x') {
        await this.checkHomebridgeUiVersion()
      }
    }
    void this.$plugin.installAlternateVersion(pkg, onSettingsChange)
  }

  public updatePackage(pkg: Plugin): void {
    void this.$plugin.upgradeHomebridge(pkg, pkg.latestVersion)
  }

  public getHomebridgeIconClass(): string {
    if (!this.homebridgePkg().installedVersion) {
      return 'fa-circle-notch fa-spin primary-text'
    }

    if (this.homebridgeUpdatePolicy === 'none' || (this.homebridgeUpdatePolicy === 'major' && !this.homebridgePkg().updateAvailable)) {
      return 'fa-circle green-text'
    }

    return this.homebridgePkg().updateAvailable
      ? 'fa-arrow-alt-circle-up orange-text'
      : 'fa-check-circle green-text'
  }

  public getHomebridgeUiIconClass(): string {
    if (!this.homebridgeUiPkg().installedVersion) {
      return 'fa-circle-notch fa-spin primary-text'
    }

    if (this.homebridgeUiUpdatePolicy === 'none' || (this.homebridgeUiUpdatePolicy === 'major' && !this.homebridgeUiPkg().updateAvailable)) {
      return 'fa-circle green-text'
    }

    return this.homebridgeUiPkg().updateAvailable
      ? 'fa-arrow-alt-circle-up orange-text'
      : 'fa-check-circle green-text'
  }

  public getPluginsIconClass(): string {
    if (!this.homebridgePluginStatusDone()) {
      return 'fa-circle-notch fa-spin primary-text'
    }

    return this.homebridgePluginStatus().length
      ? 'fa-arrow-alt-circle-up orange-text'
      : 'fa-check-circle green-text'
  }

  public getNodejsIconClass(): string {
    if (!this.nodejsStatusDone()) {
      return 'fa-circle-notch fa-spin primary-text'
    }

    if (this.nodeUpdatePolicy === 'none' || (this.nodeUpdatePolicy === 'major' && !this.nodejsInfo().updateAvailable)) {
      return 'fa-circle green-text'
    }

    if (this.nodejsInfo().showNodeUnsupportedWarning) {
      return 'fa-exclamation-circle orange-text'
    }

    return this.nodejsInfo().updateAvailable
      ? 'fa-arrow-alt-circle-up orange-text'
      : 'fa-check-circle green-text'
  }

  private async checkHomebridgeVersion(): Promise<void> {
    try {
      const response = await firstValueFrom(this.io.request('homebridge-version-check'))
      response.displayName = 'Homebridge'

      this.homebridgePkg.set(response)
      this.$settings.env.homebridgeVersion = response.installedVersion
      this.homebridgeUpdatePolicy = this.$settings.env.homebridgeUpdatePolicy || 'all'
      this.isRunningHbV2.set(response.installedVersion.startsWith('2.'))
    } catch (error) {
      console.error(error)
      this.$toastr.error(
        error.message,
        this.$translate.instant('toast.title_error'),
      )
    }
  }

  private async getNodeInfo(): Promise<void> {
    try {
      this.serverInfo.set(await firstValueFrom(this.io.request('get-homebridge-server-info')))
      const nodejsInfo = await firstValueFrom(this.io.request('nodejs-version-check'))

      // Refresh the policy from settings to ensure we have the latest value
      this.nodeUpdatePolicy = this.$settings.env.nodeUpdatePolicy || 'all'

      // Backend handles the policy logic and returns the appropriate version
      // No additional filtering needed here
      this.nodejsInfo.set(nodejsInfo)
      this.nodejsStatusDone.set(true)
    } catch (error) {
      console.error(error)
      this.$toastr.error(
        error.message,
        this.$translate.instant('toast.title_error'),
      )
    }
  }

  private async checkHomebridgeUiVersion(): Promise<void> {
    try {
      const response = await firstValueFrom(this.io.request('homebridge-ui-version-check'))
      this.$settings.env.homebridgeUiVersion = response.installedVersion
      this.homebridgeUiUpdatePolicy = this.$settings.env.homebridgeUiUpdatePolicy || 'all'
      if (!environment.production) {
        response.updateAvailable = false
      }

      this.homebridgeUiPkg.set(response)
    } catch (error) {
      console.error(error)
      this.$toastr.error(
        error.message,
        this.$translate.instant('toast.title_error'),
      )
    }
  }

  private async getOutOfDatePlugins(): Promise<void> {
    try {
      const outOfDatePlugins = await firstValueFrom(this.io.request('get-out-of-date-plugins'))
      // Filter out Homebridge UI and plugins with hide updates setting (Angular 20 feature)
      this.homebridgePluginStatus.set(outOfDatePlugins
        .filter((x: any) => x.name !== 'homebridge-config-ui-x' && !this.$settings.env.plugins?.hideUpdatesFor?.includes(x.name)))
      this.homebridgePluginStatusDone.set(true)
    } catch (error) {
      console.error(error)
      this.$toastr.error(
        error.message,
        this.$translate.instant('toast.title_error'),
      )
    }
  }

  private async getDockerInfo(): Promise<void> {
    if (this.serverInfo() && this.serverInfo()!.homebridgeRunningInDocker) {
      try {
        this.dockerInfo.set(await firstValueFrom(this.io.request('docker-version-check')))
        this.dockerStatusDone.set(true)
      } catch (error) {
        console.error(error)
        this.$toastr.error(
          error.message,
          this.$translate.instant('toast.title_error'),
        )
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
