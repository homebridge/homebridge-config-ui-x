import { ApiService } from '@/app/core/api.service'
import { RestartChildBridgesComponent } from '@/app/core/components/restart-child-bridges/restart-child-bridges.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/settings.service'
import { Component, Input, OnInit } from '@angular/core'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { v4 as uuid } from 'uuid'

export interface PluginConfigBlock {
  config: Record<string, any>
  name: string
  __uuid__: string
}

export interface PluginSchema {
  pluginAlias: string
  pluginType: 'platform' | 'accessory'
  singular?: boolean
  headerDisplay?: string
  footerDisplay?: string
  schema: any
  form?: any
  display?: any
}

@Component({
  templateUrl: './plugin-config.component.html',
  styleUrls: ['./plugin-config.component.scss'],
})
export class PluginConfigComponent implements OnInit {
  @Input() plugin: any
  @Input() schema: PluginSchema

  public pluginAlias: string
  public pluginType: 'platform' | 'accessory'
  public pluginConfig: PluginConfigBlock[] = []
  public form: any = {}
  public show = ''
  public saveInProgress: boolean
  public childBridges: any[] = []
  public isFirstSave = false

  constructor(
    public $activeModal: NgbActiveModal,
    private $api: ApiService,
    private $plugin: ManagePluginsService,
    private $modal: NgbModal,
    private $settings: SettingsService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  ngOnInit() {
    this.pluginAlias = this.schema.pluginAlias
    this.pluginType = this.schema.pluginType
    this.loadPluginConfig()
  }

  loadPluginConfig() {
    this.$api.get(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`).subscribe({
      next: (pluginConfig) => {
        for (const block of pluginConfig) {
          const pluginConfigBlock = {
            __uuid__: uuid(),
            name: block.name || this.schema.pluginAlias,
            config: block,
          }
          this.pluginConfig.push(pluginConfigBlock)
        }

        if (!this.pluginConfig.length) {
          this.isFirstSave = true
          this.addBlock()
        } else {
          this.show = this.pluginConfig[0].__uuid__
        }

        if (this.plugin.name === 'homebridge-hue' && this.pluginConfig.length) {
          this.homebridgeHueFix(this.pluginConfig[0].config)
        }
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(error.error?.message || this.$translate.instant('plugins.config.load_error'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  async save() {
    this.saveInProgress = true
    const configBlocks = this.pluginConfig.map(x => x.config)

    try {
      const newConfig = await firstValueFrom(this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, configBlocks))
      this.saveInProgress = false
      if (this.plugin.name === 'homebridge-config-ui-x') {
        // Reload app settings if the config was changed for Homebridge UI
        this.$settings.getAppSettings().catch()
      } else {
        // Possible child bridge setup recommendation if the plugin is not Homebridge UI
        // If it is the first time configuring the plugin, then offer to set up a child bridge straight away
        if (this.isFirstSave && this.$settings.env.recommendChildBridges && this.$settings.env.serviceMode && newConfig[0]?.platform) {
          // Close the modal and open the child bridge setup modal
          this.$activeModal.close()
          this.$plugin.bridgeSettings(this.plugin, true)
          return
        }
      }

      if (!['homebridge', 'homebridge-config-ui-x'].includes(this.plugin.name)) {
        await this.getChildBridges()
        if (this.childBridges.length > 0) {
          this.$activeModal.close()
          const ref = this.$modal.open(RestartChildBridgesComponent, {
            size: 'lg',
            backdrop: 'static',
          })
          ref.componentInstance.bridges = this.childBridges.map(childBridge => ({
            displayName: childBridge.name,
            username: childBridge.username.replace(/:/g, ''),
          }))
          return
        }
      }

      this.$activeModal.close()
      this.$modal.open(RestartHomebridgeComponent, {
        size: 'lg',
        backdrop: 'static',
      })
    } catch (error) {
      this.saveInProgress = false
      console.error(error)
      this.$toastr.error(this.$translate.instant('config.failed_to_save_config'), this.$translate.instant('toast.title_error'))
    }
  }

  blockShown(event: string) {
    this.show = event
    for (const block of this.pluginConfig) {
      block.name = block.config.name || block.name
    }
  }

  blockHidden(event: string) {
    if (this.show === event) {
      this.show = ''
    }
  }

  addBlock() {
    const __uuid__ = uuid()

    this.pluginConfig.push({
      __uuid__,
      name: this.schema.pluginAlias,
      config: {
        [this.pluginType]: this.schema.pluginAlias,
      },
    })

    this.blockShown(__uuid__)
  }

  removeBlock(__uuid__: string) {
    const pluginConfigIndex = this.pluginConfig.findIndex(x => x.__uuid__ === __uuid__)
    this.pluginConfig.splice(pluginConfigIndex, 1)
  }

  async getChildBridges(): Promise<void> {
    try {
      const data: any[] = await firstValueFrom(this.$api.get('/status/homebridge/child-bridges'))
      data.forEach((bridge) => {
        if (this.plugin.name === bridge.plugin) {
          this.childBridges.push(bridge)
        }
      })
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.childBridges = []
    }
  }

  /**
   * Homebridge Hue - ensure users object is preserved
   */
  homebridgeHueFix(platform: any) {
    this.schema.schema.properties.users = {
      type: 'object',
      properties: {},
    }

    if (!platform.users || typeof platform.users !== 'object') {
      return
    }

    for (const key of Object.keys(platform.users)) {
      this.schema.schema.properties.users.properties[key] = {
        type: 'string',
      }
    }
  }
}
