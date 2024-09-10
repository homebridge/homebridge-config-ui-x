import { ApiService } from '@/app/core/api.service'
import { RestartComponent } from '@/app/core/components/restart/restart.component'
import { MobileDetectService } from '@/app/core/mobile-detect.service'
import { SettingsService } from '@/app/core/settings.service'
import { Component, Input, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { parse } from 'json5'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './manual-config.component.html',
  styleUrls: ['./manual-config.component.scss'],
})
export class ManualConfigComponent implements OnInit {
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

  public monacoEditor: any
  public editorOptions: any

  constructor(
    public activeModal: NgbActiveModal,
    private $api: ApiService,
    private $modal: NgbModal,
    private $settings: SettingsService,
    private $toastr: ToastrService,
    private translate: TranslateService,
    private $router: Router,
    private $md: MobileDetectService,
  ) {}

  get arrayKey() {
    return this.pluginType === 'accessory' ? 'accessories' : 'platforms'
  }

  ngOnInit(): void {
    this.editorOptions = {
      language: 'json',
      theme: this.$settings.theme.startsWith('dark-mode') ? 'vs-dark' : 'vs-light',
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
    this.$api.get(`/plugins/alias/${encodeURIComponent(this.plugin.name)}`).subscribe(
      (result) => {
        if (result.pluginAlias && result.pluginType) {
          this.pluginAlias = result.pluginAlias
          this.pluginType = result.pluginType
          this.loadHomebridgeConfig()
        } else {
          this.loading = false
        }
      },
      () => {
        this.loading = false
      },
    )
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
          this.addBlock()
        }
      },
    )
  }

  blockChanged() {
    for (const block of this.pluginConfig) {
      block.name = block.config.name || block.name
    }
  }

  addBlock() {
    if (!this.saveCurrentBlock()) {
      this.$toastr.error('Please fix validation errors before adding a new block.')
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
      let currentBlockNew

      // fix the object if the user has pasted an example that did not include the opening and closing brackets
      if (currentBlockString.charAt(0) === '"' && currentBlockString.charAt(currentBlockString.length - 1) === ']') {
        currentBlockString = `{${currentBlockString}}`
      }

      try {
        currentBlockNew = parse(currentBlockString)
      } catch (e) {
        this.$toastr.error(
          this.translate.instant('config.toast_config_invalid_json'),
          this.translate.instant('config.toast_title_config_syntax_error'),
        )
        return false
      }

      if (Array.isArray(currentBlockNew) || typeof currentBlockNew !== 'object') {
        this.$toastr.error(
          this.translate.instant('Config block must be an object {}'),
          this.translate.instant('config.toast_title_config_syntax_error'),
        )
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
        this.$toastr.error(
          this.translate.instant('Accessory must have a valid "name" attribute'),
          this.translate.instant('config.toast_title_config_syntax_error'),
        )
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
      await this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, this.pluginConfig).toPromise()
      this.activeModal.close()
      this.$modal.open(RestartComponent, {
        size: 'lg',
        backdrop: 'static',
      })
    } catch {
      this.$toastr.error(this.translate.instant('config.toast_failed_to_save_config'), this.translate.instant('toast.title_error'))
      this.saveInProgress = false
    }
  }

  openFullConfigEditor() {
    this.$router.navigate(['/config'])
    this.activeModal.close()
  }
}
