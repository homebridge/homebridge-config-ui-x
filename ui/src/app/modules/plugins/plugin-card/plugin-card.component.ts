import { ApiService } from '@/app/core/api.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { InformationComponent } from '@/app/core/components/information/information.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { DonateComponent } from '@/app/core/manage-plugins/donate/donate.component'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { PluginLogsComponent } from '@/app/core/manage-plugins/plugin-logs/plugin-logs.component'
import { MobileDetectService } from '@/app/core/mobile-detect.service'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { DisablePluginComponent } from '@/app/modules/plugins/plugin-card/disable-plugin/disable-plugin.component'
import { PluginInfoComponent } from '@/app/modules/plugins/plugin-card/plugin-info/plugin-info.component'
import { Component, Input, OnInit } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  selector: 'app-plugin-card',
  templateUrl: './plugin-card.component.html',
})
export class PluginCardComponent implements OnInit {
  @Input() plugin: any

  public hasChildBridges = false
  public hasUnpairedChildBridges = false
  public allChildBridgesStopped = false
  public childBridgeStatus = 'pending'
  public childBridgeRestartInProgress = false
  public defaultIcon = 'assets/hb-icon.png'
  public isMobile: string
  public setChildBridges = []
  public prettyDisplayName = ''
  public hb2Status = 'unknown' // 'hide' | 'supported' | 'unknown'

  private io: IoNamespace

  constructor(
    private $api: ApiService,
    private $md: MobileDetectService,
    private $modal: NgbModal,
    public $plugin: ManagePluginsService,
    public $settings: SettingsService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
    private $ws: WsService,
  ) {}

  // eslint-disable-next-line accessor-pairs
  @Input() set childBridges(childBridges: any[]) {
    this.hasChildBridges = childBridges.length > 0
    this.hasUnpairedChildBridges = childBridges.filter(x => x.paired === false).length > 0
    this.allChildBridgesStopped = childBridges.filter(x => x.manuallyStopped === true).length === childBridges.length

    if (this.hasChildBridges) {
      // get the "worse" status of all child bridges and use that for colour icon
      if (childBridges.some(x => x.status === 'down')) {
        this.childBridgeStatus = 'down'
      } else if (childBridges.some(x => x.status === 'pending')) {
        this.childBridgeStatus = 'pending'
      } else if (childBridges.some(x => x.status === 'ok')) {
        this.childBridgeStatus = 'ok'
      }
    }

    this.setChildBridges = childBridges

    const homebridgeVersion = this.$settings.env.homebridgeVersion.split('.')[0]
    const hbEngines = this.plugin.engines?.homebridge?.split('||').map((x: string) => x.trim()) || []
    this.hb2Status = homebridgeVersion === '2' ? 'hide' : hbEngines.some((x: string) => (x.startsWith('^2') || x.startsWith('>=2'))) ? 'supported' : this.hb2Status
  }

  ngOnInit(): void {
    this.isMobile = this.$md.detect.mobile()
    this.prettyDisplayName = this.prettifyName()
    this.io = this.$ws.getExistingNamespace('child-bridges')

    if (!this.plugin.icon) {
      this.plugin.icon = this.defaultIcon
    }
  }

  openFundingModal(plugin: any) {
    const ref = this.$modal.open(DonateComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.plugin = plugin
  }

  openVerifiedModal() {
    const ref = this.$modal.open(InformationComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    if (this.plugin.verifiedPlugin || this.plugin.verifiedPlusPlugin) {
      ref.componentInstance.title = this.$translate.instant('plugins.manage.modal_verified_title')
      ref.componentInstance.subtitle = this.$translate.instant('plugins.manage.modal_verified_subtitle', {
        pluginName: this.plugin.displayName || this.plugin.name,
      })
      ref.componentInstance.message = this.$translate.instant('plugins.manage.modal_verified_message')
      ref.componentInstance.faIconClass = 'fa-shield-alt green-text'
    } else {
      ref.componentInstance.title = this.$translate.instant('plugins.manage.modal_unverified_title')
      ref.componentInstance.subtitle = this.$translate.instant('plugins.manage.modal_unverified_subtitle', {
        pluginName: this.plugin.displayName || this.plugin.name,
      })
      ref.componentInstance.message = this.$translate.instant('plugins.manage.modal_unverified_message')
      ref.componentInstance.faIconClass = 'fa-shield-alt grey-text'
    }
    ref.componentInstance.ctaButtonLabel = this.$translate.instant('form.button_more_info')
    ref.componentInstance.ctaButtonLink = 'https://github.com/homebridge/homebridge/wiki/verified-Plugins'
  }

  pluginInfoModal(plugin: any) {
    const ref = this.$modal.open(PluginInfoComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.plugin = plugin
  }

  disablePlugin(plugin: any) {
    const ref = this.$modal.open(DisablePluginComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.pluginName = plugin.name
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

  enablePlugin(plugin: any) {
    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.title = `${this.$translate.instant('plugins.manage.enable')}: ${plugin.name}`
    ref.componentInstance.message = this.$translate.instant('plugins.manage.confirm_enable', { pluginName: plugin.name })
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('plugins.manage.enable')
    ref.componentInstance.faIconClass = 'fa-circle-play primary-text'

    ref.result.then(async () => {
      try {
        await firstValueFrom(this.$api.put(`/config-editor/plugin/${encodeURIComponent(plugin.name)}/enable`, {}))
        // mark as enabled
        plugin.disabled = false
        // start all child bridges
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

  viewPluginLog(plugin: any) {
    const ref = this.$modal.open(PluginLogsComponent, {
      size: 'xl',
      backdrop: 'static',
    })

    ref.componentInstance.plugin = plugin
  }

  async doChildBridgeAction(action: 'stop' | 'start' | 'restart') {
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

  handleIconError() {
    this.plugin.icon = this.defaultIcon
  }

  prettifyName() {
    let pluginName = this.plugin.displayName || (this.plugin.name.charAt(0) === '@' ? this.plugin.name.split('/')[1] : this.plugin.name)
    pluginName = pluginName.replace(/-/g, ' ')
    if (this.isMobile && pluginName.toLowerCase().startsWith('homebridge ')) {
      pluginName = pluginName.replace(/^homebridge /i, '')
    }

    if (!this.plugin.displayName) {
      // Do not overwrite capitalisation if displayName is set (for example Homebridge eWeLink)
      // This changes the plugin name into title case
      pluginName = pluginName.replace(/\w\S*/g, (txt: string) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase())
    }
    return pluginName
  }

  openHb2InfoModal() {
    const ref = this.$modal.open(InformationComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.title = 'Plugin Readiness'

    if (this.hb2Status === 'supported') {
      ref.componentInstance.subtitle = `${this.plugin.displayName || this.plugin.name} is ready for Homebridge v2.0`
      ref.componentInstance.message = 'The developer has specifically marked your installed version of the plugin as compatible with Homebridge v2.0.'
      ref.componentInstance.faIconClass = 'fa-check-circle green-text'
    } else {
      ref.componentInstance.subtitle = `${this.plugin.displayName || this.plugin.name} might not be ready for Homebridge v2.0`
      ref.componentInstance.message = 'The developer has not specifically marked your installed version of the plugin as compatible with Homebridge v2.0, but it may still work.'
      ref.componentInstance.faIconClass = 'fa-question-circle orange-text'
    }
    ref.componentInstance.ctaButtonLabel = this.$translate.instant('form.button_more_info')
    ref.componentInstance.ctaButtonLink = 'https://github.com/homebridge/homebridge/wiki/Updating-To-Homebridge-v2.0'
  }
}
