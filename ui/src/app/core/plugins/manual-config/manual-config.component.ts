import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
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
import json5 from 'json5'
import { NgxMdModule } from 'ngx-md'
import { EditorComponent } from 'ngx-monaco-editor-v2'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { PluginsMarkdownDirective } from '@/app/core/directives/plugins.markdown.directive'
import { createChildBridgeSchema } from '@/app/core/helpers/child-bridges-schema.helper'
import { PLUGIN_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { InterpolateMdPipe } from '@/app/core/pipes/interpolate-md.pipe'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { ChildBridgesService } from '@/app/core/utilities/child-bridges.service'
import { MobileDetectService } from '@/app/core/utilities/mobile-detect.service'

declare global {
  interface Window {
    editor?: any
  }
}

@Component({
  imports: [
    NgbAccordionDirective,
    NgbAccordionItem,
    NgbAccordionHeader,
    NgbTooltip,
    NgbAccordionCollapse,
    NgbAccordionBody,
    EditorComponent,
    FormsModule,
    TranslatePipe,
    NgbAccordionToggle,
    InterpolateMdPipe,
    NgxMdModule,
    PluginsMarkdownDirective,
  ],
  standalone: true,
  templateUrl: './manual-config.component.html',
  styleUrl: './manual-config.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualConfigComponent implements OnInit, OnDestroy {
  // 1. Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $cb = inject(ChildBridgesService)
  private $md = inject(MobileDetectService)
  private $plugin = inject(ManagePluginsService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private modalData = inject(PLUGIN_MODAL_DATA)

  // 2. Public properties for component use
  public plugin = this.modalData.plugin
  public schema = this.modalData.schema

  // 3. Other properties
  private isDebugModeEnabled = this.$settings.isFeatureEnabled('childBridgeDebugMode')
  private isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')

  public readonly pluginAlias = signal<string>('')
  public readonly pluginType = signal<'platform' | 'accessory' | null>(null)
  public readonly loading = signal(true)
  public readonly canConfigure = signal(false)
  public readonly show = signal<string>('')
  public readonly pluginConfig = signal<Record<string, unknown>[]>([])
  public readonly currentBlock = signal<string | undefined>(undefined)
  public readonly currentBlockIndex = signal<number | null>(null)
  public readonly saveInProgress = signal(false)
  public readonly isFirstSave = signal(false)
  public monacoEditor: any

  // Validation properties
  public readonly formBlocksValid = signal<{ [key: number]: boolean }>({})
  public readonly formIsValid = signal(true)
  public readonly strictValidation = signal(false)
  public editorOptions: any

  // 6. Getters
  get arrayKey(): string {
    return this.pluginType() === 'accessory' ? 'accessories' : 'platforms'
  }

  // 7. Lifecycle
  public ngOnInit(): void {
    this.editorOptions = {
      language: 'json',
      theme: this.$settings.actualLightingMode === 'dark' ? 'vs-dark' : 'vs-light',
    }

    // Initialize validation properties
    this.strictValidation.set(this.schema?.strictValidation || false)

    if (this.$md.detect.mobile()) {
      this.loading.set(false)
      this.canConfigure.set(false)
    } else {
      this.loadPluginAlias()
    }
  }

  // 8. Public methods
  public async onEditorInit(editor: any): Promise<void> {
    window.editor = editor
    this.monacoEditor = editor

    // Set up schema validation before setting content
    this.setupSchemaValidation()

    // Add event listener for content changes to trigger validation
    // Debounce validation to avoid excessive calls
    this.monacoEditor.onDidChangeModelContent(() => setTimeout(() => this.onValidationChange(), 300))

    // Also listen for marker changes to get more accurate validation timing
    const monaco = (window as any).monaco
    monaco.editor.onDidChangeMarkers((uris: unknown[]) => {
      const modelUri = this.monacoEditor.getModel()?.uri
      if (modelUri && uris.some(uri => (uri as { toString: () => string }).toString() === modelUri.toString())) {
        // Markers for our model have changed, update validation state
        this.onValidationChange()
      }
    })

    await this.monacoEditor.getModel().setValue(this.currentBlock())
    await this.monacoEditor.getAction('editor.action.formatDocument').run()
  }

  public ngOnDestroy(): void {
    try {
      // Clear up main editor
      if (window.editor && window.editor.dispose) {
        window.editor.dispose()
        window.editor = undefined
      }

      // Clean up validation schemas to avoid duplicates if modal is reopened
      if ((window as any).monaco) {
        const pluginAlias = this.schema?.pluginAlias || this.pluginAlias()
        const schemaUri = `http://plugin/${pluginAlias}/config.json`

        const existingSchemas = (window as any).monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas || []
        const updatedSchemas = existingSchemas.filter((x: { uri: string }) => x.uri !== schemaUri);
        (window as any).monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
          validate: true,
          allowComments: false,
          schemas: updatedSchemas,
        })
      }

      // Clean up monaco editor instance
      if (this.monacoEditor) {
        this.monacoEditor.dispose()
      }
    } catch (error) { /* no problem disposing */ }
  }

  public addBlock(): void {
    if (!this.saveCurrentBlock()) {
      this.$toastr.error(this.$translate.instant('plugins.config.please_fix'), this.$translate.instant('toast.title_error'))
      return
    }

    this.pluginConfig.update(current => [...current, {
      [this.pluginType()!]: this.pluginAlias(),
      name: this.pluginAlias(),
    }])

    this.editBlock((this.pluginConfig().length - 1))
  }

  public editBlock(index: number): void {
    // Save current block and capture its final validation state
    if (this.currentBlockIndex() !== null) {
      if (!this.saveCurrentBlock()) {
        return
      }

      // Capture final validation state for the block we're leaving
      this.formBlocksValid.update(current => ({
        ...current,
        [this.currentBlockIndex()!]: this.isJsonValid(),
      }))
    }

    this.show.set(`configBlock.${index}`)
    this.currentBlockIndex.set(index)
    this.currentBlock.set(JSON.stringify(this.pluginConfig()[index], null, 4))

    // Initialize validation state for this block if not already set
    if (!(index in this.formBlocksValid())) {
      this.formBlocksValid.update(current => ({ ...current, [index]: true }))
    }

    // Update overall validation immediately
    this.updateOverallValidation()

    // Trigger validation check after Monaco is ready
    setTimeout(() => this.onValidationChange(), 150)
  }

  public removeBlock(index: number): void {
    const block = this.pluginConfig()[index]

    const blockIndex = this.pluginConfig().findIndex(x => x === block)
    if (blockIndex > -1) {
      this.pluginConfig.update((current) => {
        const updated = [...current]
        updated.splice(blockIndex, 1)
        return updated
      })
    }

    this.currentBlockIndex.set(null)
    this.currentBlock.set(undefined)
    this.show.set('')
  }

  public async save(): Promise<void> {
    this.saveInProgress.set(true)
    if (!this.saveCurrentBlock()) {
      this.saveInProgress.set(false)
      return
    }

    try {
      const plugin = this.plugin
      if (!plugin) {
        return
      }
      const newConfig = await this.$api.post(`/config-editor/plugin/${encodeURIComponent(plugin.name)}`, this.pluginConfig())
      this.$activeModal.close()

      // Possible child bridge setup recommendation if the plugin is not Homebridge UI
      // If it is the first time configuring the plugin, then offer to set up a child bridge straight away
      if (this.isFirstSave() && this.$settings.env.recommendChildBridges && newConfig[0]?.platform) {
        // Close the modal and open the child bridge setup modal
        this.$activeModal.close()
        void this.$plugin.bridgeSettings(plugin, true)
        return
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

  public openFullConfigEditor(): void {
    void this.$router.navigate(['/config'])
    this.$activeModal.close()
  }

  public closeModal(): void {
    this.$activeModal.close()
  }

  // 9. Private methods
  private setupSchemaValidation(): void {
    // Create a basic schema if plugin doesn't have one
    let schemaToUse = this.schema?.schema
    if (!schemaToUse) {
      schemaToUse = this.createBasicSchema()
    }

    const pluginAlias = this.schema?.pluginAlias || this.pluginAlias()
    const schemaUri = `http://plugin/${pluginAlias}/config.json`

    const childBridgeSchema = createChildBridgeSchema(this.$translate, {
      isDebugModeEnabled: this.isDebugModeEnabled,
      isMatterSupported: this.isMatterSupported,
      isPlatformPlugin: this.pluginType() === 'platform',
    })

    // Ensure required properties are present for the plugin type
    const existingRequired = schemaToUse.required || []
    const requiredProperties = [...existingRequired]

    if (this.pluginType() === 'platform') {
      // Platform must have 'platform' property
      if (!requiredProperties.includes('platform')) {
        requiredProperties.push('platform')
      }

      // Also - we must ensure that the platform property is equal to the plugin alias
      if (schemaToUse.properties?.platform) {
        schemaToUse.properties.platform.const = this.pluginAlias()
      } else {
        schemaToUse.properties = {
          ...schemaToUse.properties,
          platform: {
            type: 'string',
            title: 'Platform Name',
            description: 'This is used by Homebridge to identify which plugin this platform belongs to.',
            const: this.pluginAlias(),
          },
        }
      }
    } else {
      // Accessory must have both 'accessory' and 'name' properties
      if (!requiredProperties.includes('accessory')) {
        requiredProperties.push('accessory')
      }
      if (!requiredProperties.includes('name')) {
        requiredProperties.push('name')
      }

      // Also - we must ensure that the accessory property is equal to the plugin alias
      if (schemaToUse.properties?.accessory) {
        schemaToUse.properties.accessory.const = this.pluginAlias()
      } else {
        schemaToUse.properties = {
          ...schemaToUse.properties,
          accessory: {
            type: 'string',
            title: this.$translate.instant('child_bridge.config.accessory'),
            description: 'This is used by Homebridge to identify which plugin this accessory belongs to.',
            const: this.pluginAlias(),
          },
        }
      }
    }

    // Set up schema validation using the plugin schema (from config.schema.json)
    const monaco = (window as any).monaco
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      schemas: [
        {
          uri: schemaUri,
          fileMatch: ['*'], // Apply to all JSON files in this editor
          schema: {
            ...schemaToUse,
            required: requiredProperties,
            properties: {
              ...schemaToUse.properties,
              _bridge: childBridgeSchema,
            },
          },
        },
      ],
    })
  }

  private createBasicSchema() {
    const childBridgeSchema = createChildBridgeSchema(this.$translate, {
      isDebugModeEnabled: this.isDebugModeEnabled,
      isMatterSupported: this.isMatterSupported,
      isPlatformPlugin: this.pluginType() === 'platform',
    })

    if (this.pluginType() === 'platform') {
      // Platform template
      return {
        type: 'object',
        required: ['platform'],
        title: this.$translate.instant('plugins.button_settings'),
        properties: {
          platform: {
            type: 'string',
            title: 'Platform Name',
            description: 'This is used by Homebridge to identify which plugin this platform belongs to.',
            not: { enum: ['config'] },
          },
          name: {
            type: 'string',
            title: this.$translate.instant('accessories.name'),
            description: 'The name of the platform.',
          },
          _bridge: childBridgeSchema,
        },
      }
    } else {
      // Accessory template
      return {
        type: 'object',
        required: ['accessory', 'name'],
        title: this.$translate.instant('plugins.button_settings'),
        properties: {
          accessory: {
            type: 'string',
            title: this.$translate.instant('child_bridge.config.accessory'),
            description: 'This is used by Homebridge to identify which plugin this accessory belongs to.',
          },
          name: {
            type: 'string',
            title: this.$translate.instant('accessories.name'),
            description: 'The name of the accessory.',
          },
          _bridge: childBridgeSchema,
        },
      }
    }
  }

  /**
   * Check if the current JSON content matches the schema
   * @returns true if valid, false if there are validation errors
   */
  public isJsonValid(): boolean {
    if (!this.monacoEditor) {
      // Consider valid if no editor
      return true
    }

    const model = this.monacoEditor.getModel()
    if (!model) {
      return true
    }

    // Get validation markers (errors, warnings) from Monaco
    const markers = (window as any).monaco.editor.getModelMarkers({ resource: model.uri })

    // Filter for error-level and warning-level markers (schema violations)
    const monaco = (window as any).monaco
    const validationIssues = markers.filter((marker: { severity: number }) =>
      marker.severity === monaco.MarkerSeverity.Error || marker.severity === monaco.MarkerSeverity.Warning,
    )

    return !validationIssues.length
  }

  /**
   * Trigger validation update for the current block
   */
  public onValidationChange(): void {
    if (this.currentBlockIndex() !== null && this.monacoEditor) {
      // Update validation state immediately since we're now called when markers are ready
      this.formBlocksValid.update(current => ({
        ...current,
        [this.currentBlockIndex()!]: this.isJsonValid(),
      }))
      this.updateOverallValidation()
    }
  }

  /**
   * Update the overall form validation state
   */
  private updateOverallValidation(): void {
    this.formIsValid.set(Object.values(this.formBlocksValid()).every(x => x))
  }

  private async loadPluginAlias(): Promise<void> {
    const plugin = this.plugin
    if (!plugin) {
      return
    }
    try {
      const result = await this.$api.get(`/plugins/alias/${encodeURIComponent(plugin.name)}`)
      if (result.pluginAlias && result.pluginType) {
        this.pluginAlias.set(result.pluginAlias)
        this.pluginType.set(result.pluginType)
        void this.loadHomebridgeConfig()
      } else {
        this.loading.set(false)
      }
    } catch {
      this.loading.set(false)
    }
  }

  private async loadHomebridgeConfig(): Promise<void> {
    const plugin = this.plugin
    if (!plugin) {
      return
    }
    const config = await this.$api.get(`/config-editor/plugin/${encodeURIComponent(plugin.name)}`)
    this.pluginConfig.set(config)

    this.canConfigure.set(true)
    this.loading.set(false)

    // Initialize validation state for all blocks
    this.initializeValidationState()

    if (this.pluginConfig().length) {
      this.editBlock(0)
    } else {
      this.isFirstSave.set(true)
      this.addBlock()
    }
  }

  private saveCurrentBlock(): boolean {
    if (this.currentBlockIndex() !== null && this.monacoEditor) {
      let currentBlockString: string = this.monacoEditor.getModel().getValue().trim()
      let currentBlockNew: unknown

      // Fix the object if the user has pasted an example that did not include the opening and closing brackets
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

      if (Array.isArray(currentBlockNew) || typeof currentBlockNew !== 'object' || currentBlockNew === null) {
        this.$toastr.error(this.$translate.instant('plugins.config.must_be_object'), this.$translate.instant('toast.title_error'))
        return false
      }

      // Type-safe: we've confirmed it's a non-null object
      let typedBlock = currentBlockNew as Record<string, unknown>

      // Fix the object if the user pasted an example that included the "accessories" or "platforms" array
      if (
        !typedBlock[this.pluginType()!]
        && Array.isArray(typedBlock[this.arrayKey])
        && (typedBlock[this.arrayKey] as unknown[]).length
        && Object.keys(typedBlock).length === 1
      ) {
        typedBlock = (typedBlock[this.arrayKey] as Record<string, unknown>[])[0]
      }

      // Accessory types need a valid name
      if (this.pluginType() === 'accessory' && (!typedBlock.name || typeof typedBlock.name !== 'string')) {
        this.$toastr.error(this.$translate.instant('plugins.config.name_property'), this.$translate.instant('toast.title_error'))
        typedBlock.name = ''
        this.monacoEditor.getModel().setValue(JSON.stringify(typedBlock, null, 4))
        return false
      }

      const currentBlock = this.pluginConfig()[this.currentBlockIndex()!]
      Object.keys(currentBlock).forEach(x => delete currentBlock[x])
      Object.assign(currentBlock, typedBlock)

      // Ensure the plugin alias is set
      currentBlock[this.pluginType()!] = this.pluginAlias()
    }

    return true
  }

  private initializeValidationState(): void {
    // Always initialise validation state
    const validationState: { [key: number]: boolean } = {}
    for (let i = 0; i < this.pluginConfig().length; i += 1) {
      validationState[i] = true
    }
    this.formBlocksValid.set(validationState)
    this.updateOverallValidation()
  }
}
