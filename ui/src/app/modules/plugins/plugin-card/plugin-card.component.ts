import { DatePipe, NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { NgbDropdown, NgbDropdownButtonItem, NgbDropdownItem, NgbDropdownMenu, NgbDropdownToggle, NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { DisablePluginComponent } from '@/app/core/manage-plugins/disable-plugin/disable-plugin.component'
import { DonateComponent } from '@/app/core/manage-plugins/donate/donate.component'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { PluginLogsComponent } from '@/app/core/manage-plugins/plugin-logs/plugin-logs.component'
import { MobileDetectService } from '@/app/core/mobile-detect.service'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { PluginInfoComponent } from '@/app/modules/plugins/plugin-card/plugin-info/plugin-info.component'

@Component({
  selector: 'app-plugin-card',
  templateUrl: './plugin-card.component.html',
  standalone: true,
  imports: [
    NgbTooltip,
    NgClass,
    NgbDropdown,
    NgbDropdownToggle,
    NgbDropdownMenu,
    NgbDropdownButtonItem,
    NgbDropdownItem,
    DatePipe,
    TranslatePipe,
  ],
})
export class PluginCardComponent implements OnInit {
  private $api = inject(ApiService)
  private $md = inject(MobileDetectService)
  private $modal = inject(NgbModal)
  private $plugin = inject(ManagePluginsService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private io: IoNamespace

  @Input() plugin: any

  public hasChildBridges = false
  public hasUnpairedChildBridges = false
  public allChildBridgesStopped = false
  public childBridgeStatus = 'pending'
  public childBridgeRestartInProgress = false
  public defaultIcon = 'assets/hb-icon.png'
  public isMobile: string
  public setChildBridges = []
  public hb2Status = 'unknown' // 'hide' | 'supported' | 'unknown'

  // eslint-disable-next-line accessor-pairs
  @Input() set childBridges(childBridges: any[]) {
    this.hasChildBridges = childBridges.length > 0
    this.hasUnpairedChildBridges = childBridges.filter(x => x.paired === false).length > 0
    this.allChildBridgesStopped = childBridges.filter(x => x.manuallyStopped === true).length === childBridges.length

    if (this.hasChildBridges) {
      // Get the "worse" status of all child bridges and use that for colour icon
      if (childBridges.some(x => x.status === 'down')) {
        this.childBridgeStatus = 'down'
      } else if (childBridges.some(x => x.status === 'pending')) {
        this.childBridgeStatus = 'pending'
      } else if (childBridges.some(x => x.status === 'ok')) {
        this.childBridgeStatus = 'ok'
      }
    }

    this.setChildBridges = childBridges

    const homebridgeVersion = this.$settings.env.homebridgeVersion?.split('.')[0]
    const hbEngines = this.plugin.engines?.homebridge?.split('||').map((x: string) => x.trim()) || []
    this.hb2Status = homebridgeVersion === '2' ? 'hide' : hbEngines.some((x: string) => (x.startsWith('^2') || x.startsWith('>=2'))) ? 'supported' : this.hb2Status
  }

  public ngOnInit(): void {
    this.isMobile = this.$md.detect.mobile()
    this.io = this.$ws.getExistingNamespace('child-bridges')

    if (this.isMobile && this.plugin.displayName.toLowerCase().startsWith('homebridge ')) {
      this.plugin.displayName = this.plugin.displayName.replace(/^homebridge /i, '')
    }

    if (!this.plugin.icon) {
      this.plugin.icon = this.defaultIcon
    }
  }

  public openFundingModal(plugin: any) {
    const ref = this.$modal.open(DonateComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.plugin = plugin
  }

  public pluginInfoModal(plugin: any) {
    const ref = this.$modal.open(PluginInfoComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.plugin = plugin
  }

  public disablePlugin(plugin: any) {
    const ref = this.$modal.open(DisablePluginComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.pluginName = plugin.displayName
    ref.componentInstance.isConfigured = plugin.isConfigured
    ref.componentInstance.isConfiguredDynamicPlatform = plugin.isConfiguredDynamicPlatform

    ref.result.then(async () => {
      try {
        await firstValueFrom(this.$api.put(`/config-editor/plugin/${encodeURIComponent(plugin.name)}/disable`, {}))
        // Mark as disabled
        plugin.disabled = true

        // Stop all child bridges
        if (this.hasChildBridges) {
          this.doChildBridgeAction('stop')
        }
        this.$modal.open(RestartHomebridgeComponent, {
          size: 'lg',
          backdrop: 'static',
        })
      } catch (error) {
        console.error(error)
        this.$toastr.error(this.$translate.instant('plugins.disable.error'), this.$translate.instant('toast.title_error'))
      }
    })
  }

  public enablePlugin(plugin: any) {
    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.title = plugin.name
    ref.componentInstance.message = this.$translate.instant('plugins.manage.confirm_enable', { pluginName: plugin.displayName })
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('plugins.manage.enable')
    ref.componentInstance.faIconClass = 'fa-circle-play primary-text'

    ref.result.then(async () => {
      try {
        await firstValueFrom(this.$api.put(`/config-editor/plugin/${encodeURIComponent(plugin.name)}/enable`, {}))

        // Mark as enabled
        plugin.disabled = false

        // Start all child bridges
        if (this.hasChildBridges) {
          await this.doChildBridgeAction('start')
        }
        this.$modal.open(RestartHomebridgeComponent, {
          size: 'lg',
          backdrop: 'static',
        })
      } catch (error) {
        console.error(error)
        this.$toastr.error(this.$translate.instant('plugins.enable.error'), this.$translate.instant('toast.title_error'))
      }
    })
  }

  public viewPluginLog() {
    const ref = this.$modal.open(PluginLogsComponent, {
      size: 'xl',
      backdrop: 'static',
    })

    ref.componentInstance.plugin = this.plugin
  }

  public async doChildBridgeAction(action: 'stop' | 'start' | 'restart') {
    this.childBridgeRestartInProgress = true
    try {
      for (const bridge of this.setChildBridges) {
        await firstValueFrom(this.io.request(`${action}-child-bridge`, bridge.username))
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.bridge.action_error', { action }), this.$translate.instant('toast.title_error'))
      this.childBridgeRestartInProgress = false
    } finally {
      setTimeout(() => {
        this.childBridgeRestartInProgress = false
      }, action === 'restart' ? 12000 : action === 'stop' ? 6000 : 1000)
    }
  }

  public handleIconError() {
    this.plugin.icon = this.defaultIcon
  }

  public checkAndUpdatePlugin() {
    this.$plugin.checkAndUpdatePlugin(this.plugin, this.plugin.latestVersion)
  }

  public openSettings() {
    this.$plugin.settings(this.plugin)
  }

  public openBridgeSettings() {
    this.$plugin.bridgeSettings(this.plugin)
  }

  public switchToScoped() {
    this.$plugin.switchToScoped(this.plugin)
  }

  public installAlternateVersion() {
    this.$plugin.installAlternateVersion(this.plugin)
  }

  public openJsonEditor() {
    this.$plugin.jsonEditor(this.plugin)
  }

  public uninstallPlugin() {
    this.$plugin.uninstallPlugin(this.plugin, this.setChildBridges)
  }

  public resetChildBridges() {
    this.$plugin.resetChildBridges(this.setChildBridges)
  }
}
