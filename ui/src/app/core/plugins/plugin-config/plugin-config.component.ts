import type { PluginConfigBlock } from '@/app/core/plugins/manage-plugins.interfaces'

import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import {
  NgbAccordionBody,
  NgbAccordionCollapse,
  NgbAccordionDirective,
  NgbAccordionHeader,
  NgbAccordionItem,
  NgbAccordionToggle,
} from '@ng-bootstrap/ng-bootstrap/accordion'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { NgxMdModule } from 'ngx-md'
import { ToastrService } from 'ngx-toastr'
import { v4 as uuid } from 'uuid'

import { ApiService } from '@/app/core/communication/api.service'
import { SchemaFormComponent } from '@/app/core/components/schema-form/schema-form.component'
import { PluginsMarkdownDirective } from '@/app/core/directives/plugins.markdown.directive'
import { PLUGIN_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { InterpolateMdPipe } from '@/app/core/pipes/interpolate-md.pipe'
import { HomebridgeDeconzComponent } from '@/app/core/plugins/custom-plugins/homebridge-deconz/homebridge-deconz.component'
import { HomebridgeHueComponent } from '@/app/core/plugins/custom-plugins/homebridge-hue/homebridge-hue.component'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { ChildBridgesService } from '@/app/core/utilities/child-bridges.service'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plugin-config.component.html',
  styleUrl: './plugin-config.component.scss',
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
    SchemaFormComponent,
    HomebridgeDeconzComponent,
    HomebridgeHueComponent,
    TranslatePipe,
    InterpolateMdPipe,
    NgbAccordionToggle,
  ],
})
export class PluginConfigComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $cb = inject(ChildBridgesService)
  private $plugin = inject(ManagePluginsService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private modalData = inject(PLUGIN_MODAL_DATA)

  // Public properties for component use
  public plugin = this.modalData.plugin
  public schema = this.modalData.schema

  // Signals
  public pluginConfig = signal<PluginConfigBlock[]>([])
  public show = signal('')
  public saveInProgress = signal(false)
  public formBlocksValid = signal<{ [key: number]: boolean }>({})
  public formIsValid = signal(true)
  public strictValidation = signal(false)
  public pluginAlias = signal<string>('')
  public pluginType = signal<'platform' | 'accessory'>('platform')
  public isFirstSave = signal(false)

  // Other public properties
  public form: Record<string, unknown> = {}

  // Lifecycle hooks
  public ngOnInit(): void {
    const schema = this.schema
    const plugin = this.plugin

    if (!schema || !plugin) {
      console.error('PluginConfigComponent: schema or plugin not provided')
      this.$activeModal.dismiss('Missing required data')
      return
    }

    this.pluginAlias.set(schema.pluginAlias)
    this.pluginType.set(schema.pluginType)
    this.strictValidation.set(schema.strictValidation)
    void this.loadPluginConfig()
  }

  // Public methods
  public async save(): Promise<void> {
    this.saveInProgress.set(true)
    const configBlocks = this.pluginConfig().map(x => x.config)
    const plugin = this.plugin

    if (!plugin) {
      this.saveInProgress.set(false)
      return
    }

    try {
      const newConfig = await this.$api.post(`/config-editor/plugin/${encodeURIComponent(plugin.name)}`, configBlocks)
      this.saveInProgress.set(false)
      if (plugin.name === 'homebridge-config-ui-x') {
        // Reload app settings if the config was changed for Homebridge UI
        this.$settings.getAppSettings().catch(() => { /* do nothing */ })
      } else {
        // Possible child bridge setup recommendation if the plugin is not Homebridge UI
        // If it is the first time configuring the plugin, then offer to set up a child bridge straight away
        if (this.isFirstSave() && this.$settings.env.recommendChildBridges && newConfig[0]?.platform) {
          // Close the modal and open the child bridge setup modal
          this.$activeModal.close()
          void this.$plugin.bridgeSettings(plugin, true)
          return
        }
      }

      // This will show the child bridge restart modal if needed, otherwise the full restart homebridge modal
      this.$activeModal.close()
      await this.$cb.openCorrectRestartModalForPlugin(plugin.name)
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('config.failed_to_save_config'), this.$translate.instant('toast.title_error'))
      this.saveInProgress.set(false)
    }
  }

  public blockShown(event: string): void {
    this.show.set(event)
    const blocks = this.pluginConfig()
    for (const block of blocks) {
      block.name = block.config.name || block.name
    }
  }

  public blockHidden(event: string): void {
    if (this.show() === event) {
      this.show.set('')
    }
  }

  public addBlock(): void {
    const __uuid__ = uuid()
    const schema = this.schema

    this.pluginConfig.update(current => [...current, {
      __uuid__,
      name: schema.pluginAlias,
      config: {
        [this.pluginType()]: schema.pluginAlias,
      },
    }])

    this.formBlocksValid.update(current => ({ ...current, [this.pluginConfig().length - 1]: false }))
    this.blockShown(__uuid__)
  }

  public removeBlock(__uuid__: string): void {
    const pluginConfigIndex = this.pluginConfig().findIndex(x => x.__uuid__ === __uuid__)
    this.pluginConfig.update(current => current.filter(x => x.__uuid__ !== __uuid__))

    this.formBlocksValid.update((current) => {
      const updated = { ...current }
      delete updated[pluginConfigIndex]
      return updated
    })
    if (!Object.keys(this.formBlocksValid()).length) {
      this.formIsValid.set(true)
    }
  }

  public onIsValid($event: boolean, index: number): void {
    this.formBlocksValid.update(current => ({ ...current, [index]: $event }))
    this.formIsValid.set(Object.values(this.formBlocksValid()).every(x => x))
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  public closeModal(): void {
    this.$activeModal.close()
  }

  // Private methods
  private async loadPluginConfig(): Promise<void> {
    const plugin = this.plugin
    const schema = this.schema

    if (!plugin || !schema) {
      return
    }

    try {
      const pluginConfig = await this.$api.get(`/config-editor/plugin/${encodeURIComponent(plugin.name)}`)
      const configBlocks = pluginConfig.map((block: Record<string, unknown>) => ({
        __uuid__: uuid(),
        name: block.name || schema.pluginAlias,
        config: block,
      }))

      this.pluginConfig.set(configBlocks)

      if (!this.pluginConfig().length) {
        this.isFirstSave.set(true)
        this.addBlock()
      } else {
        this.show.set(this.pluginConfig()[0].__uuid__)
      }

      if (plugin.name === 'homebridge-hue' && this.pluginConfig().length) {
        this.homebridgeHueFix(this.pluginConfig()[0].config)
      }
    } catch (error) {
      console.error(error)
      const message = error?.error?.message || this.$translate.instant('plugins.config.load_error')
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
    }
  }

  private homebridgeHueFix(platform: Record<string, unknown>): void {
    const schema = this.schema
    if (!schema) {
      return
    }

    schema.schema.properties.users = {
      type: 'object',
      properties: {},
    }

    if (!platform.users || typeof platform.users !== 'object') {
      return
    }

    for (const key of Object.keys(platform.users)) {
      schema.schema.properties.users.properties[key] = {
        type: 'string',
      }
    }
  }
}
