import { ChangeDetectionStrategy, Component, createEnvironmentInjector, EnvironmentInjector, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import {
  NgbNav,
  NgbNavContent,
  NgbNavItem,
  NgbNavLinkButton,
  NgbNavOutlet,
} from '@ng-bootstrap/ng-bootstrap/nav'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { MarkdownComponent } from '@/app/core/components/markdown/markdown.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { HB_V2_MODAL_DATA, MANAGE_PLUGIN_MODAL_DATA, MANAGE_VERSION_MODAL_DATA, PLUGIN_LOGS_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { ChildBridge } from '@/app/core/plugins/manage-plugins.interfaces'
import { ManageVersionComponent } from '@/app/core/plugins/manage-version/manage-version.component'
import { PluginLogsComponent } from '@/app/core/plugins/plugin-logs/plugin-logs.component'
import { SettingsService } from '@/app/core/ui/settings.service'
import { BackupService } from '@/app/modules/settings/backup/backup.service'
import { HbV2ModalComponent } from '@/app/modules/status/widgets/update-info-widget/hb-v2-modal/hb-v2-modal.component'

// eslint-disable-next-line no-control-regex
const RE_ANSI = /\x1B\[(\d{1,3}(;\d{1,2})?)?[mGK]/g
const RE_KOFI = /ko-?fi/i
const RE_STARTS_WITH_DIGIT = /^\d/

@Component({
  selector: 'app-manage-plugin',
  imports: [
    MarkdownComponent,
    TranslatePipe,
    NgbNavOutlet,
    NgbNav,
    NgbNavItem,
    NgbNavContent,
    NgbNavLinkButton,
  ],
  standalone: true,
  templateUrl: './manage-plugin.component.html',
  styleUrl: './manage-plugin.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class ManagePluginComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $backup = inject(BackupService)
  private $modal = inject(NgbModal)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private injector = inject(EnvironmentInjector)
  private modalData = inject(MANAGE_PLUGIN_MODAL_DATA)
  private initialIsConfigured = this.modalData.isConfigured ?? false

  // Public properties (from injected data)
  public pluginName = this.modalData.pluginName
  public pluginDisplayName = this.modalData.pluginDisplayName ?? ''
  public targetVersion = this.modalData.targetVersion ?? ''
  public latestVersion = this.modalData.latestVersion ?? ''
  public installedVersion = this.modalData.installedVersion ?? ''
  public isDisabled = this.modalData.isDisabled ?? false
  public action = this.modalData.action
  public onRefreshPluginList = this.modalData.onRefreshPluginList ?? (() => {})
  public verifiedPlugin = this.modalData.verifiedPlugin ?? false
  public verifiedPlusPlugin = this.modalData.verifiedPlusPlugin ?? false
  public funding = this.modalData.funding ?? null
  public backToVersionModal = this.modalData.backToVersionModal ?? null

  // Signals
  public readonly targetVersionPretty = signal('')
  public readonly actionComplete = signal(false)
  public readonly actionFailed = signal(false)
  public readonly justUpdatedPlugin = signal(false)
  public readonly updateToBeta = signal(false)
  public readonly childBridges = signal<ChildBridge[]>([])
  public readonly pastTenseVerb = signal('')
  public readonly onlineUpdateOk = signal(false)
  public readonly versionNotes = signal('')
  public readonly versionNotesLoaded = signal(false)
  public readonly versionNotesShow = signal(false)
  public readonly fullChangelog = signal('')
  public readonly fullChangelogLoaded = signal(false)
  public readonly releaseNotesShow = signal(false)
  public readonly isConfigured = signal(this.initialIsConfigured)
  public readonly supportMessageKey = signal('')
  public readonly donationLink = signal('')
  public readonly downloadingBackup = signal(false)

  // Other public properties
  public readonly presentTenseVerb = signal('')
  public readonly releaseNotesTab = signal(1)
  public readonly iconStar = '<i class="fas fa-star orange-text"></i>'
  public readonly iconThumbsUp = '<i class="fas fa-thumbs-up orange-text"></i>'
  public readonly iconCoffee = '<i class="fas fa-coffee pink-text"></i>'
  public readonly iconHeart = '<i class="fas fa-heart pink-text"></i>'

  // Private properties
  private io!: IoNamespace
  private toastSuccess!: string
  private term: Terminal
  private termTarget!: HTMLElement
  private fitAddon = new FitAddon()
  private webLinksAddon = new WebLinksAddon()
  private errorLog = ''

  public get isLightTerminalTheme(): boolean {
    return this.$settings.getEffectiveTerminalLightingMode() === 'light'
  }

  constructor() {
    this.term = new Terminal(this.$settings.getTerminalOptions({ disableStdin: true }))
    this.term.loadAddon(this.fitAddon)
    this.term.loadAddon(this.webLinksAddon)
  }

  // Lifecycle hooks
  public ngOnInit(): void {
    // Check if the latest version is a numerical version
    const targetVer = this.targetVersion
    const latestVer = this.latestVersion
    this.targetVersionPretty.set(
      targetVer === 'latest'
        ? `v${latestVer}`
        : (RE_STARTS_WITH_DIGIT.test(targetVer) ? `v${targetVer}` : targetVer),
    )

    this.io = this.$ws.connectToNamespace('plugins')
    this.termTarget = document.getElementById('plugin-log-output')!
    this.term.open(this.termTarget)
    this.fitAddon.fit()

    this.io.socket.on('stdout', (data: string | Uint8Array) => {
      this.term.write(data)
      const dataCleaned = data
        .toString()
        .replace(RE_ANSI, '')
        .trimEnd()
      if (dataCleaned) {
        this.errorLog += `${dataCleaned}\r\n`
      }
    })

    this.toastSuccess = this.$translate.instant('toast.title_success')

    this.onlineUpdateOk.set(!(['homebridge', 'homebridge-config-ui-x'].includes(this.pluginName) && this.$settings.env.platform === 'win32'))

    switch (this.action) {
      case 'Install':
        void this.install()
        if (this.targetVersion === this.installedVersion) {
          this.presentTenseVerb.set(this.$translate.instant('plugins.manage.reinstall'))
          this.pastTenseVerb.set(this.$translate.instant('plugins.manage.reinstalled'))
        } else {
          this.presentTenseVerb.set(this.$translate.instant('plugins.manage.install'))
          this.pastTenseVerb.set(this.$translate.instant('plugins.manage.installed'))
        }
        break
      case 'Uninstall':
        this.uninstall()
        this.presentTenseVerb.set(this.$translate.instant('plugins.manage.uninstall'))
        this.pastTenseVerb.set(this.$translate.instant('plugins.manage.uninstalled'))
        break
      case 'Update':
        switch (this.targetVersion) {
          case 'latest':
            this.updateToBeta.set(false)
            break
          case 'alpha':
          case 'beta':
          case 'test':
            this.updateToBeta.set(true)
            break
        }
        this.presentTenseVerb.set(this.$translate.instant('plugins.manage.update'))
        this.pastTenseVerb.set(this.$translate.instant('plugins.manage.updated'))
        void this.getVersionNotes()
        break
    }

    // Determine which support message to show
    this.determineSupportMessage()
  }

  private determineSupportMessage() {
    // Default to GitHub message
    this.supportMessageKey.set('plugins.manage.support_github')
    this.donationLink.set('')

    // Never show donation messages for homebridge or homebridge-config-ui-x
    if (['homebridge', 'homebridge-config-ui-x'].includes(this.pluginName)) {
      return
    }

    // Check if plugin qualifies for donation message and randomly decide to show it
    if ((this.verifiedPlugin || this.verifiedPlusPlugin) && this.funding && Math.random() < 0.5) {
      // Extract random donation URL from funding data
      let donationUrl: string | null = null
      if (typeof this.funding === 'string') {
        donationUrl = this.funding
      } else if (Array.isArray(this.funding)) {
        const urls = this.funding.map((o: any) => typeof o === 'string' ? o : o?.url).filter(Boolean)
        donationUrl = urls.length > 0 ? urls[Math.floor(Math.random() * urls.length)] : null
      } else if (this.funding?.url) {
        donationUrl = this.funding.url
      }

      if (donationUrl) {
        const isKofi = RE_KOFI.test(donationUrl)
        this.supportMessageKey.set(isKofi ? 'plugins.manage.support_kofi' : 'plugins.manage.support_donate')
        this.donationLink.set(`<a href="${donationUrl}" target="_blank" rel="noopener noreferrer"><i class="fas fa-external-link-alt primary-text"></i></a>`)
      }
    }
  }

  public ngOnDestroy(): void {
    this.io.end?.()
  }

  // Public methods
  public update(): void {
    // Hide the release notes
    this.releaseNotesShow.set(false)
    this.versionNotes.set('')
    this.fullChangelog.set('')

    if (!this.onlineUpdateOk()) {
      return
    }

    // If this is updating homebridge, use an alternative workflow
    if (this.pluginName === 'homebridge') {
      void this.upgradeHomebridge()
      return
    }

    this.io.request('update', {
      name: this.pluginName,
      version: this.targetVersion,
      termCols: this.term.cols,
      termRows: this.term.rows,
    }).subscribe({
      next: async () => {
        // Updating the UI needs a restart straight away
        if (this.pluginName === 'homebridge-config-ui-x') {
          try {
            // Set full service restart flag to ensure hb-service restarts properly
            await this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
            window.location.href = 'restart'
          } catch (error) {
            console.error('Failed to set restart flag:', error)
            window.location.href = 'restart'
          }
        } else {
          try {
            await this.getChildBridges()
          } catch (error) {
            console.error(error)
          }

          // Trigger refresh of the plugin list in the background
          const refreshFn = this.onRefreshPluginList
          if (refreshFn) {
            refreshFn()
          }

          // If plugin is not configured and has no child bridges, no restart needed
          if (!this.isConfigured() && this.childBridges().length === 0) {
            this.$toastr.success(
              `${this.pastTenseVerb()} ${this.pluginName}`,
              this.toastSuccess,
            )
            this.$activeModal.close()
            void this.$router.navigate(['/plugins'])
          } else {
            // Plugin is configured or has child bridges, show restart UI
            this.actionComplete.set(true)
            this.justUpdatedPlugin.set(true)
            void this.$router.navigate(['/plugins'])
          }
        }
      },
      error: (error) => {
        this.actionFailed.set(true)
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      },
    })
  }

  public onRestartHomebridgeClick(): void {
    void this.$router.navigate(['/restart'])
    this.$activeModal.close()
  }

  public async onRestartChildBridgeClick(): Promise<void> {
    try {
      for (const bridge of this.childBridges()) {
        await this.$api.put(`/server/restart/${bridge.username}`, {})
      }
      const modalInjector = createEnvironmentInjector([{
        provide: PLUGIN_LOGS_MODAL_DATA,
        useValue: {
          plugin: {
            name: this.pluginName,
            displayName: this.pluginDisplayName,
          },
          childBridges: this.childBridges(),
        },
      }], this.injector)

      this.$modal.open(PluginLogsComponent, {
        size: 'xl',
        backdrop: 'static',
        injector: modalInjector,
      })
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.manage.child_bridge_restart_failed'), this.$translate.instant('toast.title_error'))
    } finally {
      this.$activeModal.close()
    }
  }

  public downloadLogFile(): void {
    const blob = new Blob([this.errorLog], { type: 'text/plain;charset=utf-8' })
    saveAs(blob, `${this.pluginName}-error.log`)
  }

  public async downloadBackupFile(): Promise<void> {
    this.downloadingBackup.set(true)
    try {
      await this.$backup.downloadBackup()
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : this.$translate.instant('toast.title_error')
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
    } finally {
      this.downloadingBackup.set(false)
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  public async goBack(): Promise<void> {
    // Close current modal and reopen ManageVersionComponent
    this.$activeModal.dismiss('Back')

    const injector = createEnvironmentInjector([{
      provide: MANAGE_VERSION_MODAL_DATA,
      useValue: {
        plugin: this.backToVersionModal,
        onRefreshPluginList: this.onRefreshPluginList,
      },
    }], this.injector)

    const ref = this.$modal.open(ManageVersionComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      const { action, version } = await ref.result

      // Reopen the manage plugin modal with the selected version
      const newInjector = createEnvironmentInjector([{
        provide: MANAGE_PLUGIN_MODAL_DATA,
        useValue: {
          action: action === 'alternate' ? 'Update' : 'Install',
          pluginName: this.pluginName,
          pluginDisplayName: this.pluginDisplayName,
          targetVersion: version,
          latestVersion: this.latestVersion,
          installedVersion: this.installedVersion,
          isDisabled: this.isDisabled,
          isConfigured: this.initialIsConfigured,
          onRefreshPluginList: this.onRefreshPluginList,
          verifiedPlugin: this.verifiedPlugin,
          verifiedPlusPlugin: this.verifiedPlusPlugin,
          funding: this.funding,
          backToVersionModal: this.backToVersionModal,
        },
      }], this.injector)

      this.$modal.open(ManagePluginComponent, {
        size: 'lg',
        backdrop: 'static',
        injector: newInjector,
      })
    } catch (e) {
      // Modal was dismissed, do nothing
    }
  }

  // Private methods
  private install(): void {
    if (!this.onlineUpdateOk()) {
      return
    }

    if (this.pluginName === 'homebridge') {
      void this.upgradeHomebridge()
      return
    }

    this.io.request('install', {
      name: this.pluginName,
      version: this.targetVersion,
      termCols: this.term.cols,
      termRows: this.term.rows,
    }).subscribe({
      next: async () => {
        this.$toastr.success(`${this.pastTenseVerb()} ${this.pluginName}`, this.toastSuccess)

        // Trigger refresh of the plugin list in the background
        const refreshFn = this.onRefreshPluginList
        if (refreshFn) {
          refreshFn()
        }

        // Fetch the updated plugin data and close with it
        try {
          const installedPlugins = await this.$api.get('/plugins')
          const installedPlugin = installedPlugins.find((x: { name: string }) => x.name === this.pluginName)
          this.$activeModal.close({ action: 'just-installed', plugin: installedPlugin })
        } catch (error) {
          console.error('Failed to fetch updated plugin data:', error)
          this.$activeModal.close({ action: 'just-installed', pluginName: this.pluginName })
        }
      },
      error: (error) => {
        this.actionFailed.set(true)
        console.error(error)
        void this.$router.navigate(['/plugins'])
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      },
    })
  }

  private uninstall(): void {
    this.io.request('uninstall', {
      name: this.pluginName,
      termCols: this.term.cols,
      termRows: this.term.rows,
    }).subscribe({
      next: () => {
        // Trigger refresh of the plugin list in the background
        const refreshFn = this.onRefreshPluginList
        if (refreshFn) {
          refreshFn()
        }

        this.$activeModal.close()
        void this.$router.navigate(['/plugins'])
        this.$modal.open(RestartHomebridgeComponent, {
          size: 'lg',
          backdrop: 'static',
        })
      },
      error: (error) => {
        this.actionFailed.set(true)
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      },
    })
  }

  private async upgradeHomebridge(): Promise<void> {
    let res = 'update'

    // Only want to show this modal updating from existing version <2 to 2
    // This is just some temporary not-so-great logic to determine if the user is updating from <2 to 2
    if (
      Number(this.installedVersion.split('.')[0]) < 2
      && ['2', 'alpha', 'beta'].includes(this.targetVersion.split('.')[0])
    ) {
      const modalInjector = createEnvironmentInjector([{
        provide: HB_V2_MODAL_DATA,
        useValue: {
          isUpdating: true,
          skipIfCompatible: false,
        },
      }], this.injector)

      const ref = this.$modal.open(HbV2ModalComponent, {
        size: 'lg',
        backdrop: 'static',
        injector: modalInjector,
      })
      res = await ref.result
    }

    if (res === 'update') {
      // Continue selected, so update homebridge
      this.io.request('homebridge-update', {
        version: this.targetVersion,
        termCols: this.term.cols,
        termRows: this.term.rows,
      }).subscribe({
        next: async () => {
          this.$activeModal.close()
          try {
            await this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
            void this.$router.navigate(['/restart'])
          } catch (error) {
            console.error(error)
            void this.$router.navigate(['/restart'])
          }
        },
        error: (error) => {
          this.actionFailed.set(true)
          console.error(error)
          const message = error instanceof Error ? error.message : this.$translate.instant('toast.title_error')
          this.$toastr.error(message, this.$translate.instant('toast.title_error'))
          this.$activeModal.close()
        },
      })
    } else {
      // Modal dismissed, also close the update modal
      this.$activeModal.close()
    }
  }

  private async getVersionNotes(): Promise<void> {
    this.releaseNotesShow.set(true)

    try {
      const reqChangelog = await this.$api.get(`/plugins/release/${encodeURIComponent(this.pluginName)}`, {
        params: { version: this.targetVersion },
      })
      this.fullChangelog.set(reqChangelog.changelog)

      // Only update targetVersionPretty from changelog if we're targeting 'latest'
      if (reqChangelog.latestVersion && this.targetVersion === 'latest') {
        this.targetVersionPretty.set(reqChangelog.latestVersion)
      }

      if (reqChangelog.notes) {
        this.versionNotes.set(reqChangelog.notes)
        this.versionNotesShow.set(true)
      } else {
        const isPrerelease = ['beta', 'alpha', 'test', 'next'].includes(this.targetVersion) || this.targetVersion.includes('-')
        this.versionNotesShow.set(!isPrerelease)
      }
    } catch (error) {
      console.error('Error loading release notes:', error)
    }

    this.fullChangelogLoaded.set(true)
    this.versionNotesLoaded.set(true)
  }

  private async getChildBridges(): Promise<void> {
    const data: ChildBridge[] = await this.$api.get('/status/homebridge/child-bridges')
    const pluginBridges = data.filter(bridge => this.pluginName === bridge.plugin)
    this.childBridges.set(pluginBridges)
  }
}
