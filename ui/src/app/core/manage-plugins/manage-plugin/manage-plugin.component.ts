import { NgClass } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import {
  NgbActiveModal,
  NgbModal,
  NgbNav,
  NgbNavContent,
  NgbNavItem,
  NgbNavLinkButton,
  NgbNavOutlet,
} from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import { saveAs } from 'file-saver'
import { NgxMdModule } from 'ngx-md'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { PluginsMarkdownDirective } from '@/app/core/directives/plugins.markdown.directive'
import { ChildBridge } from '@/app/core/manage-plugins/manage-plugins.interfaces'
import { ManageVersionComponent } from '@/app/core/manage-plugins/manage-version/manage-version.component'
import { PluginLogsComponent } from '@/app/core/manage-plugins/plugin-logs/plugin-logs.component'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { BackupService } from '@/app/modules/settings/backup/backup.service'
import { HbV2ModalComponent } from '@/app/modules/status/widgets/update-info-widget/hb-v2-modal/hb-v2-modal.component'

@Component({
  templateUrl: './manage-plugin.component.html',
  styleUrls: ['./manage-plugin.component.scss'],
  standalone: true,
  imports: [
    NgxMdModule,
    PluginsMarkdownDirective,
    TranslatePipe,
    NgClass,
    NgbNavOutlet,
    NgbNav,
    NgbNavItem,
    NgbNavContent,
    NgbNavLinkButton,
  ],
})

export class ManagePluginComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $backup = inject(BackupService)
  private $modal = inject(NgbModal)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private io: IoNamespace
  private toastSuccess: string
  private term = new Terminal({ screenReaderMode: true })
  private termTarget: HTMLElement
  private fitAddon = new FitAddon()
  private webLinksAddon = new WebLinksAddon()
  private errorLog = ''

  @Input() pluginName: string
  @Input() pluginDisplayName: string
  @Input() targetVersion: string
  @Input() latestVersion: string
  @Input() installedVersion: string
  @Input() isDisabled: boolean
  @Input() action: string
  @Input() onRefreshPluginList: () => void
  @Input() verifiedPlugin: boolean
  @Input() verifiedPlusPlugin: boolean
  @Input() funding: any
  @Input() backToVersionModal: any = null // Plugin data to reopen ManageVersionComponent

  public targetVersionPretty = ''
  public actionComplete = false
  public actionFailed = false
  public justUpdatedPlugin = false
  public updateToBeta = false
  public childBridges: ChildBridge[] = []
  public presentTenseVerb: string
  public pastTenseVerb: string
  public onlineUpdateOk: boolean
  public readonly iconStar = '<span role="img" aria-label="star"><i class="fas fa-star orange-text" aria-hidden="true"></i></span>'
  public readonly iconThumbsUp = '<span role="img" aria-label="thumbs up"><i class="fas fa-thumbs-up orange-text" aria-hidden="true"></i></span>'
  public readonly iconCoffee = '<span role="img" aria-label="coffee"><i class="fas fa-coffee pink-text" aria-hidden="true"></i></span>'
  public readonly iconHeart = '<span role="img" aria-label="heart"><i class="fas fa-heart pink-text" aria-hidden="true"></i></span>'
  public supportMessageKey: string
  public donationLink: string
  public versionNotes: string
  public versionNotesLoaded = false
  public versionNotesShow = false
  public fullChangelog: string
  public fullChangelogLoaded = false
  public releaseNotesShow = false
  public releaseNotesTab: number = 1
  public downloadingBackup = false

  public actionLiveMessage = ''
  public terminalAriaHidden = false
  private restoreTerminalTimer: any = null

  constructor() {
    this.term.loadAddon(this.fitAddon)
    this.term.loadAddon(this.webLinksAddon)
  }

  private setRestartToken() {
    try {
      sessionStorage.setItem('hb_restart_requested', '1')
      sessionStorage.setItem('hb_restart_token', String(Date.now()))
    } catch { }
  }

  private speakAction(message: string, suppressTerminalMs = 2000) {
    this.terminalAriaHidden = true
    this.actionLiveMessage = ''
    setTimeout(() => {
      this.actionLiveMessage = message
    }, 0)

    if (this.restoreTerminalTimer) {
      clearTimeout(this.restoreTerminalTimer)
    }

    this.restoreTerminalTimer = setTimeout(() => {
      this.terminalAriaHidden = false
    }, suppressTerminalMs)
  }

  private applyXtermA11yPatches() {
    const host = this.termTarget as HTMLElement | undefined
    if (!host) {
      return
    }

    const xtermRoot = host.querySelector('.xterm') as HTMLElement | null
    if (!xtermRoot) {
      return
    }

    const ta = xtermRoot.querySelector('textarea') as HTMLTextAreaElement | null
    if (ta) {
      ta.disabled = true
      ta.setAttribute('aria-hidden', 'true')
      ta.setAttribute('tabindex', '-1')
      ta.setAttribute('readonly', 'true')
      if (document.activeElement === ta) {
        ta.blur()
      }
    }

    const lives = Array.from(xtermRoot.querySelectorAll('[aria-live]')) as HTMLElement[]
    for (const el of lives) {
      el.setAttribute('aria-live', 'off')
      el.setAttribute('aria-atomic', 'false')
    }
  }

  public ngOnInit() {
    // Check if the latest version is a numerical version
    this.targetVersionPretty = this.targetVersion === 'latest'
      ? `v${this.latestVersion}`
      : (/^\d/.test(this.targetVersion) ? `v${this.targetVersion}` : this.targetVersion)

    this.io = this.$ws.connectToNamespace('plugins')
    this.termTarget = document.getElementById('plugin-log-output')
    this.term.open(this.termTarget)
    this.fitAddon.fit()

    this.io.socket.on('stdout', (data: string | Uint8Array) => {
      this.term.write(data)
      this.applyXtermA11yPatches()
      const dataCleaned = data
        .toString()
        .replace(/\x1B\[(\d{1,3}(;\d{1,2})?)?[mGK]/g, '') // eslint-disable-line no-control-regex
        .trimEnd()
      if (dataCleaned) {
        this.errorLog += `${dataCleaned}\r\n`
      }
    })

    this.applyXtermA11yPatches()
    setTimeout(() => this.applyXtermA11yPatches(), 0)
    setTimeout(() => this.applyXtermA11yPatches(), 50)
    setTimeout(() => this.applyXtermA11yPatches(), 250)

    this.toastSuccess = this.$translate.instant('toast.title_success')

    this.onlineUpdateOk = !(['homebridge', 'homebridge-config-ui-x'].includes(this.pluginName) && this.$settings.env.platform === 'win32')

    switch (this.action) {
      case 'Install':
        this.speakAction(`Installing ${this.pluginDisplayName || this.pluginName}.`, 4000)
        void this.install()
        if (this.targetVersion === this.installedVersion) {
          this.presentTenseVerb = this.$translate.instant('plugins.manage.reinstall')
          this.pastTenseVerb = this.$translate.instant('plugins.manage.reinstalled')
        } else {
          this.presentTenseVerb = this.$translate.instant('plugins.manage.install')
          this.pastTenseVerb = this.$translate.instant('plugins.manage.installed')
        }
        break
      case 'Uninstall':
        this.speakAction(`Uninstalling ${this.pluginDisplayName || this.pluginName}.`, 4000)
        this.uninstall()
        this.presentTenseVerb = this.$translate.instant('plugins.manage.uninstall')
        this.pastTenseVerb = this.$translate.instant('plugins.manage.uninstalled')
        break
      case 'Update':
        switch (this.targetVersion) {
          case 'latest':
            this.updateToBeta = false
            break
          case 'alpha':
          case 'beta':
          case 'test':
            this.updateToBeta = true
            break
        }
        this.presentTenseVerb = this.$translate.instant('plugins.manage.update')
        this.pastTenseVerb = this.$translate.instant('plugins.manage.updated')
        void this.getVersionNotes()
        break
    }

    // Determine which support message to show
    this.determineSupportMessage()
  }

  private determineSupportMessage() {
    // Default to GitHub message
    this.supportMessageKey = 'plugins.manage.support_github'
    this.donationLink = ''

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
        const isKofi = /ko-?fi/i.test(donationUrl)
        this.supportMessageKey = isKofi ? 'plugins.manage.support_kofi' : 'plugins.manage.support_donate'
        this.donationLink = `<a href="${donationUrl}" target="_blank" rel="noopener noreferrer"><i class="fas fa-external-link-alt primary-text" aria-hidden="true"></i></a>`
      }
    }
  }

  public update() {
    // Hide the release notes
    this.releaseNotesShow = false
    this.versionNotes = ''
    this.fullChangelog = ''

    if (!this.onlineUpdateOk) {
      return
    }

    // If this is updating homebridge, use an alternative workflow
    if (this.pluginName === 'homebridge') {
      return this.upgradeHomebridge()
    }

    this.speakAction(`Updating ${this.pluginDisplayName || this.pluginName}.`, 4000)

    this.io.request('update', {
      name: this.pluginName,
      version: this.targetVersion,
      termCols: this.term.cols,
      termRows: this.term.rows,
    }).subscribe({
      next: async () => {
        // Updating the UI needs a restart straight away
        if (this.pluginName === 'homebridge-config-ui-x') {
          this.setRestartToken()
          this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
            next: () => {
              window.location.href = '/restart'
            },
            error: (error) => {
              console.error(error)
              window.location.href = '/restart'
            },
          })
          return
        }

        try {
          await this.getChildBridges()
        } catch (error) {
          console.error(error)
        }
        this.actionComplete = true
        this.justUpdatedPlugin = true
        this.speakAction(`${this.pluginDisplayName || this.pluginName} updated, restart to apply changes.`, 3000)
        void this.$router.navigate(['/plugins'])
      },
      error: (error) => {
        this.actionFailed = true
        console.error(error)
        this.speakAction(`${this.pluginDisplayName || this.pluginName} update failed, check logs or terminal output for details.`, 3000)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      },
    })
  }

  public onRestartHomebridgeClick(): void {
    this.setRestartToken()
    void this.$router.navigate(['/restart'])
    this.$activeModal.close()
  }

  public async onRestartChildBridgeClick(): Promise<void> {
    try {
      for (const bridge of this.childBridges) {
        await firstValueFrom(this.$api.put(`/server/restart/${bridge.username}`, {}))
      }
      const ref = this.$modal.open(PluginLogsComponent, {
        size: 'xl',
        backdrop: 'static',
      })
      ref.componentInstance.plugin = {
        name: this.pluginName,
        displayName: this.pluginDisplayName,
      }
      ref.componentInstance.childBridges = this.childBridges
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
    this.downloadingBackup = true
    try {
      await this.$backup.downloadBackup()
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    } finally {
      this.downloadingBackup = false
    }
  }

  public ngOnDestroy() {
    if (this.restoreTerminalTimer) {
      clearTimeout(this.restoreTerminalTimer)
      this.restoreTerminalTimer = null
    }
    this.io.end()
    try {
      this.term.dispose()
    } catch { }
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public async goBack() {
    // Close current modal and reopen ManageVersionComponent
    this.$activeModal.dismiss('Back')

    const ref = this.$modal.open(ManageVersionComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.plugin = this.backToVersionModal
    ref.componentInstance.onRefreshPluginList = this.onRefreshPluginList

    try {
      const { action, version } = await ref.result

      // Reopen the manage plugin modal with the selected version
      const newRef = this.$modal.open(ManagePluginComponent, {
        size: 'lg',
        backdrop: 'static',
      })

      newRef.componentInstance.action = action === 'alternate' ? 'Update' : 'Install'
      newRef.componentInstance.pluginName = this.pluginName
      newRef.componentInstance.pluginDisplayName = this.pluginDisplayName
      newRef.componentInstance.targetVersion = version
      newRef.componentInstance.latestVersion = this.latestVersion
      newRef.componentInstance.installedVersion = this.installedVersion
      newRef.componentInstance.isDisabled = this.isDisabled
      newRef.componentInstance.onRefreshPluginList = this.onRefreshPluginList
      newRef.componentInstance.verifiedPlugin = this.verifiedPlugin
      newRef.componentInstance.verifiedPlusPlugin = this.verifiedPlusPlugin
      newRef.componentInstance.funding = this.funding
      newRef.componentInstance.backToVersionModal = this.backToVersionModal
    } catch (e) {
      // Modal was dismissed, do nothing
    }
  }

  private install() {
    if (!this.onlineUpdateOk) {
      return
    }

    if (this.pluginName === 'homebridge') {
      return this.upgradeHomebridge()
    }

    this.io.request('install', {
      name: this.pluginName,
      version: this.targetVersion,
      termCols: this.term.cols,
      termRows: this.term.rows,
    }).subscribe({
      next: async () => {
        this.$toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess)
        this.speakAction(`${this.pluginDisplayName || this.pluginName} installed, restart to apply changes.`, 3000)

        // Trigger refresh of the plugin list in the background
        if (this.onRefreshPluginList) {
          this.onRefreshPluginList()
        }

        // Fetch the updated plugin data and close with it
        try {
          const installedPlugins = await firstValueFrom(this.$api.get('/plugins'))
          const installedPlugin = installedPlugins.find((x: any) => x.name === this.pluginName)
          setTimeout(() => {
            this.$activeModal.close({ action: 'just-installed', plugin: installedPlugin })
          }, 3000)
        } catch (error) {
          console.error('Failed to fetch updated plugin data:', error)
          setTimeout(() => {
            this.$activeModal.close({ action: 'just-installed', pluginName: this.pluginName })
          }, 3000)
        }
      },
      error: (error) => {
        this.actionFailed = true
        console.error(error)
        this.speakAction(`${this.pluginDisplayName || this.pluginName} install failed. See logs or terminal output for details.`, 3000)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
        setTimeout(() => {
          void this.$router.navigate(['/plugins'])
        }, 3000)
      },
    })
  }

  private uninstall() {
    this.io.request('uninstall', {
      name: this.pluginName,
      termCols: this.term.cols,
      termRows: this.term.rows,
    }).subscribe({
      next: () => {
        this.speakAction(`${this.pluginDisplayName || this.pluginName} uninstalled, restart to apply changes.`, 3000)
        setTimeout(() => {
          this.$activeModal.close()
          void this.$router.navigate(['/plugins'])
          this.$modal.open(RestartHomebridgeComponent, {
            size: 'lg',
            backdrop: 'static',
          })
        }, 3000)
      },
      error: (error) => {
        this.actionFailed = true
        console.error(error)
        this.speakAction(`${this.pluginDisplayName || this.pluginName} uninstall failed. See logs or terminal output for details.`, 3000)
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
      const ref = this.$modal.open(HbV2ModalComponent, {
        size: 'lg',
        backdrop: 'static',
      })
      ref.componentInstance.isUpdating = true
      res = await ref.result
    }

    if (res === 'update') {
      // Continue selected, so update homebridge
      this.speakAction('Updating Homebridge.', 4000)
      this.io.request('homebridge-update', {
        version: this.targetVersion,
        termCols: this.term.cols,
        termRows: this.term.rows,
      }).subscribe({
        next: () => {
          this.$activeModal.close()
          this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
            next: () => {
              this.$router.navigate(['/restart'])
            },
            error: (error) => {
              console.error(error)
              this.$router.navigate(['/restart'])
            },
          })
        },
        error: (error) => {
          this.actionFailed = true
          console.error(error)
          this.speakAction('Homebridge update failed. Check logs or terminal output for details.', 3000)
          this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
          this.$activeModal.close()
        },
      })
    } else {
      // Modal dismissed, also close the update modal
      this.$activeModal.close()
    }
  }

  private async getVersionNotes() {
    this.releaseNotesShow = true

    try {
      const reqChangelog = await firstValueFrom(this.$api.get(`/plugins/release/${encodeURIComponent(this.pluginName)}`))
      this.fullChangelog = reqChangelog.changelog
      if (reqChangelog.latestVersion) {
        this.latestVersion = reqChangelog.latestVersion
      }

      if (this.targetVersion === 'latest' || this.targetVersion === this.latestVersion) {
        this.versionNotesShow = true
        if (reqChangelog.notes) {
          this.versionNotes = reqChangelog.notes
        }
      } else {
        this.versionNotesShow = false
        this.versionNotesLoaded = true
      }
    } catch (error) {
      console.error('Error loading release notes:', error)
    }

    this.fullChangelogLoaded = true
    this.versionNotesLoaded = true
  }

  private async getChildBridges(): Promise<void> {
    const data: ChildBridge[] = await firstValueFrom(this.$api.get('/status/homebridge/child-bridges'))
    data.forEach((bridge) => {
      if (this.pluginName === bridge.plugin) {
        this.childBridges.push(bridge)
      }
    })
  }
}
