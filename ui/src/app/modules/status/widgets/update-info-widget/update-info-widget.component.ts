import { ChangeDetectionStrategy, Component, computed, createEnvironmentInjector, DestroyRef, EnvironmentInjector, inject, input, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { RouterLink } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { AuthService } from '@/app/core/auth/auth.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { InformationComponent } from '@/app/core/components/information/information.component'
import { HB_V2_MODAL_DATA, INFORMATION_MODAL_DATA, NODE_VERSION_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { Plugin } from '@/app/core/plugins/manage-plugins.interfaces'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { HomebridgeUiUpdatePolicy, HomebridgeUpdatePolicy, NodeUpdatePolicy } from '@/app/core/settings.interfaces'
import { SettingsService } from '@/app/core/ui/settings.service'
import { UpdateAllModalComponent } from '@/app/core/update-all/update-all-modal.component'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { HbV2ModalComponent } from '@/app/modules/status/widgets/update-info-widget/hb-v2-modal/hb-v2-modal.component'
import { NodeVersionModalComponent } from '@/app/modules/status/widgets/update-info-widget/node-version-modal/node-version-modal.component'
import {
  DockerDetails,
  NodeJsInfo,
  ServerInfo,
  VersionOverview,
  Widget,
} from '@/app/modules/status/widgets/widgets.interfaces'
import { environment } from '@/environments/environment'

@Component({
  selector: 'app-update-info-widget',
  imports: [
    TranslatePipe,
    RouterLink,
    NgbTooltip,
  ],
  standalone: true,
  templateUrl: './update-info-widget.component.html',
  styleUrl: './update-info-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateInfoWidgetComponent implements OnInit {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private injector = inject(EnvironmentInjector)
  private $auth = inject(AuthService)
  private $errors = inject(HttpErrorService)
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

  /**
   * How many items Update All would offer, from what this widget already
   * loaded. Gates the title-bar button (≥2 - with one update the existing
   * single-update flow is the right tool); the modal fetches the
   * authoritative plan itself.
   */
  public readonly updateAllCount = computed(() =>
    this.homebridgePluginStatus().length
    + (this.homebridgePkg().updateAvailable ? 1 : 0)
    + (this.homebridgeUiPkg().updateAvailable ? 1 : 0),
  )

  // Other properties
  private io!: IoNamespace
  public packageVersion = this.$settings.env.packageVersion
  public homebridgeVersion = this.$settings.env.homebridgeVersion
  public runningInDocker = this.$settings.env.runningInDocker
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
    this.io.connected!.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      queueMicrotask(() => this.loadAllData())
    })
  }

  private async loadAllData(): Promise<void> {
    let overview: VersionOverview
    try {
      overview = await firstValueFrom(this.io.request('get-version-overview'))
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      return
    }

    // Distribute the aggregated payload. Per-field null means the upstream
    // call rejected on the server — leave the corresponding tile in its
    // loading state (mirrors pre-aggregation behaviour where each failed
    // call left its own *StatusDone signal false).
    if (overview.serverInfo) {
      this.serverInfo.set(overview.serverInfo)
    }

    if (overview.node) {
      this.nodeUpdatePolicy = this.$settings.env.nodeUpdatePolicy || 'all'
      this.nodejsInfo.set(overview.node)
      this.nodejsStatusDone.set(true)
    }

    if (overview.homebridge) {
      const hb = overview.homebridge
      hb.displayName = 'Homebridge'
      this.homebridgePkg.set(hb)
      this.$settings.env.homebridgeVersion = hb.installedVersion
      this.homebridgeVersion = hb.installedVersion
      this.homebridgeUpdatePolicy = this.$settings.env.homebridgeUpdatePolicy || 'all'
      this.isRunningHbV2.set(Number(hb.installedVersion.split('.')[0]) >= 2)
    }

    if (overview.homebridgeUi) {
      const hbUi = overview.homebridgeUi
      this.$settings.env.homebridgeUiVersion = hbUi.installedVersion
      this.homebridgeUiUpdatePolicy = this.$settings.env.homebridgeUiUpdatePolicy || 'all'
      if (!environment.production) {
        hbUi.updateAvailable = false
      }
      this.homebridgeUiPkg.set(hbUi)
    }

    this.homebridgePluginStatus.set(
      overview.outOfDatePlugins
        .filter(x => x.name !== 'homebridge-config-ui-x' && !this.$settings.env.plugins?.hideUpdatesFor?.includes(x.name)),
    )
    this.homebridgePluginStatusDone.set(true)

    if (overview.serverInfo?.homebridgeRunningInDocker) {
      if (overview.docker) {
        this.dockerInfo.set(overview.docker)
        this.dockerStatusDone.set(true)
      }
    } else {
      this.dockerStatusDone.set(true)
    }

    // Hb v2 readiness is computed server-side from the installed plugin list.
    // Display is gated on admin + not-currently-running-v2 to match prior behaviour.
    if (!this.isRunningHbV2() && this.isAdmin) {
      this.isHbV2Ready.set(overview.hbV2Ready)
      this.isHbV2Loaded.set(true)
    } else {
      this.isHbV2Ready.set(true)
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

    if (this.homebridgePkg().multipleInstances) {
      return 'fa-exclamation-circle orange-text'
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

    if (this.nodeUpdatePolicy === 'none' || (this.nodeUpdatePolicy === 'major' && !this.nodejsInfo()?.updateAvailable)) {
      return 'fa-circle green-text'
    }

    if (this.nodejsInfo()?.showNodeUnsupportedWarning) {
      return 'fa-exclamation-circle orange-text'
    }

    return this.nodejsInfo()?.updateAvailable
      ? 'fa-arrow-alt-circle-up orange-text'
      : 'fa-check-circle green-text'
  }

  private async checkHomebridgeVersion(): Promise<void> {
    try {
      const response = await firstValueFrom(this.io.request('homebridge-version-check'))
      response.displayName = 'Homebridge'

      this.homebridgePkg.set(response)
      this.$settings.env.homebridgeVersion = response.installedVersion
      this.homebridgeVersion = response.installedVersion
      this.homebridgeUpdatePolicy = this.$settings.env.homebridgeUpdatePolicy || 'all'
      this.isRunningHbV2.set(Number(response.installedVersion.split('.')[0]) >= 2)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(
        this.$errors.toToastMessage(error),
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
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(
        this.$errors.toToastMessage(error),
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
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(
        this.$errors.toToastMessage(error),
        this.$translate.instant('toast.title_error'),
      )
    }
  }

  public toggleDockerExpand(): void {
    this.widget().dockerExpanded = !this.widget().dockerExpanded
    this.widget().$saveWidgetsEvent.next() // Trigger the save event
  }

  public updateAllModal(): void {
    this.$modal.open(UpdateAllModalComponent, {
      size: 'lg',
      backdrop: 'static',
    })
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
