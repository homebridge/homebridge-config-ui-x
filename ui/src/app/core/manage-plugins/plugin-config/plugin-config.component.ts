import type { ChildBridge, PluginConfigBlock, PluginSchema } from '@/app/core/manage-plugins/manage-plugins.interfaces'

import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import {
  NgbAccordionBody,
  NgbAccordionCollapse,
  NgbAccordionDirective,
  NgbAccordionHeader,
  NgbAccordionItem,
  NgbAccordionToggle,
  NgbActiveModal,
  NgbModal,
  NgbTooltip,
} from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { NgxMdModule } from 'ngx-md'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { v4 as uuid } from 'uuid'

import { ApiService } from '@/app/core/api.service'
import { RestartChildBridgesComponent } from '@/app/core/components/restart-child-bridges/restart-child-bridges.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { SchemaFormComponent } from '@/app/core/components/schema-form/schema-form.component'
import { PluginsMarkdownDirective } from '@/app/core/directives/plugins.markdown.directive'
import { HomebridgeDeconzComponent } from '@/app/core/manage-plugins/custom-plugins/homebridge-deconz/homebridge-deconz.component'
import { HomebridgeHueComponent } from '@/app/core/manage-plugins/custom-plugins/homebridge-hue/homebridge-hue.component'
import { Plugin } from '@/app/core/manage-plugins/manage-plugins.interfaces'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { InterpolateMdPipe } from '@/app/core/pipes/interpolate-md.pipe'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  templateUrl: './plugin-config.component.html',
  styleUrls: ['./plugin-config.component.scss'],
  standalone: true,
  imports: [
    NgxMdModule,
    PluginsMarkdownDirective,
    NgbAccordionDirective,
    NgbAccordionItem,
    NgbAccordionHeader,
    NgbTooltip,
    NgbAccordionCollapse,
    NgbAccordionBody,
    NgClass,
    SchemaFormComponent,
    HomebridgeDeconzComponent,
    HomebridgeHueComponent,
    TranslatePipe,
    InterpolateMdPipe,
    NgbAccordionToggle,
  ],
})
export class PluginConfigComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $plugin = inject(ManagePluginsService)
  private $modal = inject(NgbModal)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  @Input() plugin: Plugin
  @Input() schema: PluginSchema

  public pluginAlias: string
  public pluginType: 'platform' | 'accessory'
  public pluginConfig: PluginConfigBlock[] = []
  public form: any = {}
  public show = ''
  public saveInProgress: boolean
  public childBridges: ChildBridge[] = []
  public isFirstSave = false
  public formBlocksValid: { [key: number]: boolean } = {}
  public formIsValid = true
  public strictValidation = false

  public ngOnInit() {
    this.pluginAlias = this.schema.pluginAlias
    this.pluginType = this.schema.pluginType
    this.strictValidation = this.schema.strictValidation
    this.loadPluginConfig()
  }

  public async save() {
    this.saveInProgress = true
    const configBlocks = this.pluginConfig.map(x => x.config)

    try {
      const newConfig = await firstValueFrom(this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, configBlocks))
      this.saveInProgress = false
      if (this.plugin.name === 'homebridge-config-ui-x') {
        // Reload app settings if the config was changed for Homebridge UI
        this.$settings.getAppSettings().catch(() => { /* do nothing */ })
      } else {
        // Possible child bridge setup recommendation if the plugin is not Homebridge UI
        // If it is the first time configuring the plugin, then offer to set up a child bridge straight away
        if (this.isFirstSave && this.$settings.env.recommendChildBridges && newConfig[0]?.platform) {
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
            name: childBridge.name,
            username: childBridge.username,
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

  public blockShown(event: string) {
    this.show = event
    for (const block of this.pluginConfig) {
      block.name = block.config.name || block.name
    }
  }

  public blockHidden(event: string) {
    if (this.show === event) {
      this.show = ''
    }
  }

  public addBlock() {
    const __uuid__ = uuid()

    this.pluginConfig.push({
      __uuid__,
      name: this.schema.pluginAlias,
      config: {
        [this.pluginType]: this.schema.pluginAlias,
      },
    })

    this.formBlocksValid[this.pluginConfig.length - 1] = false
    this.blockShown(__uuid__)
  }

  public removeBlock(__uuid__: string) {
    const pluginConfigIndex = this.pluginConfig.findIndex(x => x.__uuid__ === __uuid__)
    this.pluginConfig.splice(pluginConfigIndex, 1)

    delete this.formBlocksValid[pluginConfigIndex]
    if (!Object.keys(this.formBlocksValid).length) {
      this.formIsValid = true
    }
  }

  public onIsValid($event: boolean, index: number) {
    this.formBlocksValid[index] = $event
    this.formIsValid = Object.values(this.formBlocksValid).every(x => x)
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public closeModal() {
    this.$activeModal.close()
  }

  private loadPluginConfig() {
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

  private homebridgeHueFix(platform: any) {
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

  private async getChildBridges(): Promise<void> {
    try {
      const data: ChildBridge[] = await firstValueFrom(this.$api.get('/status/homebridge/child-bridges'))
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
}
