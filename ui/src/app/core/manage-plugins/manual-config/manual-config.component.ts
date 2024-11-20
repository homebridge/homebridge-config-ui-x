import { ApiService } from '@/app/core/api.service'
import { RestartChildBridgesComponent } from '@/app/core/components/restart-child-bridges/restart-child-bridges.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { MobileDetectService } from '@/app/core/mobile-detect.service'
import { SettingsService } from '@/app/core/settings.service'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { NgbAccordionBody, NgbAccordionButton, NgbAccordionCollapse, NgbAccordionDirective, NgbAccordionHeader, NgbAccordionItem, NgbAccordionToggle, NgbActiveModal, NgbCollapse, NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import json5 from 'json5'
import { EditorComponent } from 'ngx-monaco-editor-v2'

import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  templateUrl: './manual-config.component.html',
  styleUrls: ['./manual-config.component.scss'],
  imports: [
    NgbAccordionDirective,
    NgbAccordionItem,
    NgbAccordionHeader,
    NgbTooltip,
    NgbAccordionToggle,
    NgbAccordionButton,
    NgbCollapse,
    NgbAccordionCollapse,
    NgbAccordionBody,
    EditorComponent,
    FormsModule,
    TranslatePipe,
  ],
})
export class ManualConfigComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $md = inject(MobileDetectService)
  private $modal = inject(NgbModal)
  private $plugin = inject(ManagePluginsService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  @Input() plugin: any

  public pluginAlias: string
  public pluginType: 'platform' | 'accessory'

  public loading = true
  public canConfigure = false
  public show = ''

  public pluginConfig: Record<string, any>[]
  public currentBlock: string
  public currentBlockIndex: number | null = null
  public saveInProgress = false
  public childBridges: any[] = []
  public isFirstSave = false

  public monacoEditor: any
  public editorOptions: any

  get arrayKey() {
    return this.pluginType === 'accessory' ? 'accessories' : 'platforms'
  }

  ngOnInit(): void {
    this.editorOptions = {
      language: 'json',
      theme: this.$settings.actualLightingMode === 'dark' ? 'vs-dark' : 'vs-light',
      automaticLayout: true,
    }

    if (this.$md.detect.mobile()) {
      this.loading = false
      this.canConfigure = false
    } else {
      this.loadPluginAlias()
    }
  }

  async onEditorInit(editor: any) {
    // @ts-expect-error - TS2339: Property editor does not exist on type Window & typeof globalThis
    window.editor = editor
    this.monacoEditor = editor
    await this.monacoEditor.getModel().setValue(this.currentBlock)
    await this.monacoEditor.getAction('editor.action.formatDocument').run()
  }

  loadPluginAlias() {
    this.$api.get(`/plugins/alias/${encodeURIComponent(this.plugin.name)}`).subscribe({
      next: (result) => {
        if (result.pluginAlias && result.pluginType) {
          this.pluginAlias = result.pluginAlias
          this.pluginType = result.pluginType
          this.loadHomebridgeConfig()
        } else {
          this.loading = false
        }
      },
      error: () => {
        this.loading = false
      },
    })
  }

  loadHomebridgeConfig() {
    this.$api.get(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`).subscribe(
      (config) => {
        this.pluginConfig = config

        this.canConfigure = true
        this.loading = false

        if (this.pluginConfig.length) {
          this.editBlock(0)
        } else {
          this.isFirstSave = true
          this.addBlock()
        }
      },
    )
  }

  addBlock() {
    if (!this.saveCurrentBlock()) {
      this.$toastr.error(this.$translate.instant('plugins.config.please_fix'), this.$translate.instant('toast.title_error'))
      return
    }

    this.pluginConfig.push({
      [this.pluginType]: this.pluginAlias,
      name: this.pluginAlias,
    })

    this.editBlock((this.pluginConfig.length - 1))
  }

  saveCurrentBlock() {
    if (this.currentBlockIndex !== null && this.monacoEditor) {
      let currentBlockString: string = this.monacoEditor.getModel().getValue().trim()
      let currentBlockNew: any

      // fix the object if the user has pasted an example that did not include the opening and closing brackets
      if (currentBlockString.charAt(0) === '"' && currentBlockString.charAt(currentBlockString.length - 1) === ']') {
        currentBlockString = `{${currentBlockString}}`
      }

      try {
        currentBlockNew = json5.parse(currentBlockString)
      } catch (error) {
        console.error(error)
        this.$toastr.error(this.$translate.instant('config.config_invalid_json'), this.$translate.instant('toast.title_error'))
        return false
      }

      if (Array.isArray(currentBlockNew) || typeof currentBlockNew !== 'object') {
        this.$toastr.error(this.$translate.instant('plugins.config.must_be_object'), this.$translate.instant('toast.title_error'))
        return false
      }

      // fix the object if the user pasted an example that included the "accessories" or "platforms" array
      if (
        !currentBlockNew[this.pluginType]
        && Array.isArray(currentBlockNew[this.arrayKey])
        && currentBlockNew[this.arrayKey].length
        && Object.keys(currentBlockNew).length === 1
      ) {
        currentBlockNew = currentBlockNew[this.arrayKey][0]
      }

      // accessory types need a valid name
      if (this.pluginType === 'accessory' && (!currentBlockNew.name || typeof currentBlockNew.name !== 'string')) {
        this.$toastr.error(this.$translate.instant('plugins.config.name_property'), this.$translate.instant('toast.title_error'))
        currentBlockNew.name = ''
        this.monacoEditor.getModel().setValue(JSON.stringify(currentBlockNew, null, 4))
        return false
      }

      const currentBlock = this.pluginConfig[this.currentBlockIndex]
      Object.keys(currentBlock).forEach(x => delete currentBlock[x])
      Object.assign(currentBlock, currentBlockNew)

      // ensure the plugin alias is set
      currentBlock[this.pluginType] = this.pluginAlias
    }

    return true
  }

  editBlock(index: number) {
    if (!this.saveCurrentBlock()) {
      return
    }

    this.show = `configBlock.${index}`
    this.currentBlockIndex = index
    this.currentBlock = JSON.stringify(this.pluginConfig[this.currentBlockIndex], null, 4)
  }

  removeBlock(index: number) {
    const block = this.pluginConfig[index]

    const blockIndex = this.pluginConfig.findIndex(x => x === block)
    if (blockIndex > -1) {
      this.pluginConfig.splice(blockIndex, 1)
    }

    this.currentBlockIndex = null
    this.currentBlock = undefined
    this.show = ''
  }

  async save() {
    this.saveInProgress = true
    if (!this.saveCurrentBlock()) {
      this.saveInProgress = false
      return
    }

    try {
      const newConfig = await firstValueFrom(this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, this.pluginConfig))
      this.$activeModal.close()

      // Possible child bridge setup recommendation if the plugin is not Homebridge UI
      // If it is the first time configuring the plugin, then offer to set up a child bridge straight away
      if (this.isFirstSave && this.$settings.env.recommendChildBridges && this.$settings.env.serviceMode && newConfig[0]?.platform) {
        // Close the modal and open the child bridge setup modal
        this.$activeModal.close()
        this.$plugin.bridgeSettings(this.plugin, true)
        return
      }

      if (!['homebridge', 'homebridge-config-ui-x'].includes(this.plugin.name) && this.$settings.env.serviceMode) {
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
      console.error(error)
      this.$toastr.error(this.$translate.instant('config.failed_to_save_config'), this.$translate.instant('toast.title_error'))
      this.saveInProgress = false
    }
  }

  openFullConfigEditor() {
    this.$router.navigate(['/config'])
    this.$activeModal.close()
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
}
