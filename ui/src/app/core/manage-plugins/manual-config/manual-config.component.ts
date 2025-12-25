import type { PluginSchema } from '@/app/core/manage-plugins/manage-plugins.interfaces'

import { NgClass } from '@angular/common'
import { ChangeDetectorRef, Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import {
  NgbAccordionBody,
  NgbAccordionCollapse,
  NgbAccordionDirective,
  NgbAccordionHeader,
  NgbAccordionItem,
  NgbAccordionToggle,
  NgbActiveModal,
  NgbTooltip,
} from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import json5 from 'json5'
import { NgxMdModule } from 'ngx-md'
import { EditorComponent } from 'ngx-monaco-editor-v2'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { ChildBridgesService } from '@/app/core/child-bridges.service'
import { PluginsMarkdownDirective } from '@/app/core/directives/plugins.markdown.directive'
import { createChildBridgeSchema } from '@/app/core/helpers/child-bridges-schema.helper'
import { Plugin } from '@/app/core/manage-plugins/manage-plugins.interfaces'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { MobileDetectService } from '@/app/core/mobile-detect.service'
import { InterpolateMdPipe } from '@/app/core/pipes/interpolate-md.pipe'
import { SettingsService } from '@/app/core/settings.service'

declare global {
  interface Window {
    editor?: any
  }
}

@Component({
  templateUrl: './manual-config.component.html',
  styleUrls: ['./manual-config.component.scss'],
  standalone: true,
  imports: [
    NgClass,
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
})
export class ManualConfigComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $cb = inject(ChildBridgesService)
  private $cdr = inject(ChangeDetectorRef)
  private $md = inject(MobileDetectService)
  private $plugin = inject(ManagePluginsService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private isDebugModeEnabled = this.$settings.isFeatureEnabled('childBridgeDebugMode')

  @Input() plugin: Plugin
  @Input() schema: PluginSchema

  public pluginAlias: string
  public pluginType: 'platform' | 'accessory'
  public loading = true
  public canConfigure = false
  public show = ''
  public pluginConfig: Record<string, any>[]
  public currentBlock: string
  public currentBlockIndex: number | null = null
  public saveInProgress = false
  public isFirstSave = false
  public monacoEditor: any

  // Validation properties
  public formBlocksValid: { [key: number]: boolean } = {}
  public formIsValid = true
  public strictValidation = false
  public editorOptions: any

  get arrayKey() {
    return this.pluginType === 'accessory' ? 'accessories' : 'platforms'
  }

  public ngOnInit(): void {
    this.editorOptions = {
      language: 'json',
      theme: this.$settings.actualLightingMode === 'dark' ? 'vs-dark' : 'vs-light',
    }

    // Initialize validation properties
    this.strictValidation = this.schema?.strictValidation || false

    if (this.$md.detect.mobile()) {
      this.loading = false
      this.canConfigure = false
    } else {
      this.loadPluginAlias()
    }
  }

  public async onEditorInit(editor: any) {
    window.editor = editor
    this.monacoEditor = editor

    // Set up schema validation before setting content
    this.setupSchemaValidation()

    // Add event listener for content changes to trigger validation
    // Debounce validation to avoid excessive calls
    this.monacoEditor.onDidChangeModelContent(() => setTimeout(() => this.onValidationChange(), 300))

    // Also listen for marker changes to get more accurate validation timing
    const monaco = (window as any).monaco
    monaco.editor.onDidChangeMarkers((uris: any[]) => {
      const modelUri = this.monacoEditor.getModel()?.uri
      if (modelUri && uris.some((uri: any) => uri.toString() === modelUri.toString())) {
        // Markers for our model have changed, update validation state
        this.onValidationChange()
      }
    })

    await this.monacoEditor.getModel().setValue(this.currentBlock)
    await this.monacoEditor.getAction('editor.action.formatDocument').run()
  }

  public ngOnDestroy() {
    try {
      // Clear up main editor
      if (window.editor && window.editor.dispose) {
        window.editor.dispose()
        window.editor = undefined
      }

      // Clean up validation schemas to avoid duplicates if modal is reopened
      if ((window as any).monaco) {
        const pluginAlias = this.schema?.pluginAlias || this.pluginAlias
        const schemaUri = `http://plugin/${pluginAlias}/config.json`

        const existingSchemas = (window as any).monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas || []
        const updatedSchemas = existingSchemas.filter((x: any) => x.uri !== schemaUri);
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

  private setupSchemaValidation() {
    // Create a basic schema if plugin doesn't have one
    let schemaToUse = this.schema?.schema
    if (!schemaToUse) {
      schemaToUse = this.createBasicSchema()
    }

    const pluginAlias = this.schema?.pluginAlias || this.pluginAlias
    const schemaUri = `http://plugin/${pluginAlias}/config.json`

    const childBridgeSchema = createChildBridgeSchema(this.$translate, {
      isDebugModeEnabled: this.isDebugModeEnabled,
    })

    // Ensure required properties are present for the plugin type
    const existingRequired = schemaToUse.required || []
    const requiredProperties = [...existingRequired]

    if (this.pluginType === 'platform') {
      // Platform must have 'platform' property
      if (!requiredProperties.includes('platform')) {
        requiredProperties.push('platform')
      }

      // Also - we must ensure that the platform property is equal to the plugin alias
      if (schemaToUse.properties?.platform) {
        schemaToUse.properties.platform.const = this.pluginAlias
      } else {
        schemaToUse.properties = {
          ...schemaToUse.properties,
          platform: {
            type: 'string',
            title: 'Platform Name',
            description: 'This is used by Homebridge to identify which plugin this platform belongs to.',
            const: this.pluginAlias,
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
        schemaToUse.properties.accessory.const = this.pluginAlias
      } else {
        schemaToUse.properties = {
          ...schemaToUse.properties,
          accessory: {
            type: 'string',
            title: this.$translate.instant('child_bridge.config.accessory'),
            description: 'This is used by Homebridge to identify which plugin this accessory belongs to.',
            const: this.pluginAlias,
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
    })

    if (this.pluginType === 'platform') {
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
    const validationIssues = markers.filter((marker: any) =>
      marker.severity === monaco.MarkerSeverity.Error || marker.severity === monaco.MarkerSeverity.Warning,
    )

    return !validationIssues.length
  }

  /**
   * Update the overall form validation state
   */
  private updateOverallValidation(): void {
    this.formIsValid = Object.values(this.formBlocksValid).every(x => x)
  }

  /**
   * Trigger validation update for the current block
   */
  public onValidationChange(): void {
    if (this.currentBlockIndex !== null && this.monacoEditor) {
      // Update validation state immediately since we're now called when markers are ready
      this.formBlocksValid[this.currentBlockIndex] = this.isJsonValid()
      this.updateOverallValidation()

      // Manually trigger change detection to update the UI immediately
      this.$cdr.detectChanges()
    }
  }

  public addBlock() {
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

  public editBlock(index: number) {
    // Save current block and capture its final validation state
    if (this.currentBlockIndex !== null) {
      if (!this.saveCurrentBlock()) {
        return
      }

      // Capture final validation state for the block we're leaving
      this.formBlocksValid[this.currentBlockIndex] = this.isJsonValid()
    }

    this.show = `configBlock.${index}`
    this.currentBlockIndex = index
    this.currentBlock = JSON.stringify(this.pluginConfig[this.currentBlockIndex], null, 4)

    // Initialize validation state for this block if not already set
    if (!(index in this.formBlocksValid)) {
      this.formBlocksValid[index] = true
    }

    // Update overall validation immediately
    this.updateOverallValidation()

    // Trigger validation check after Monaco is ready
    setTimeout(() => this.onValidationChange(), 150)
  }

  public removeBlock(index: number) {
    const block = this.pluginConfig[index]

    const blockIndex = this.pluginConfig.findIndex(x => x === block)
    if (blockIndex > -1) {
      this.pluginConfig.splice(blockIndex, 1)
    }

    this.currentBlockIndex = null
    this.currentBlock = undefined
    this.show = ''
  }

  public async save() {
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
      if (this.isFirstSave && this.$settings.env.recommendChildBridges && newConfig[0]?.platform) {
        // Close the modal and open the child bridge setup modal
        this.$activeModal.close()
        void this.$plugin.bridgeSettings(this.plugin, true)
        return
      }

      // This will show the child bridge restart modal if needed, otherwise the full restart homebridge modal
      this.$activeModal.close()
      await this.$cb.openCorrectRestartModalForPlugin(this.plugin.name)
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('config.failed_to_save_config'), this.$translate.instant('toast.title_error'))
      this.saveInProgress = false
    }
  }

  public openFullConfigEditor() {
    void this.$router.navigate(['/config'])
    this.$activeModal.close()
  }

  public closeModal() {
    this.$activeModal.close()
  }

  private loadPluginAlias() {
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

  private loadHomebridgeConfig() {
    this.$api.get(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`).subscribe((config) => {
      this.pluginConfig = config

      this.canConfigure = true
      this.loading = false

      // Initialize validation state for all blocks
      this.initializeValidationState()

      if (this.pluginConfig.length) {
        this.editBlock(0)
      } else {
        this.isFirstSave = true
        this.addBlock()
      }
    })
  }

  private saveCurrentBlock() {
    if (this.currentBlockIndex !== null && this.monacoEditor) {
      let currentBlockString: string = this.monacoEditor.getModel().getValue().trim()
      let currentBlockNew: any

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

      if (Array.isArray(currentBlockNew) || typeof currentBlockNew !== 'object') {
        this.$toastr.error(this.$translate.instant('plugins.config.must_be_object'), this.$translate.instant('toast.title_error'))
        return false
      }

      // Fix the object if the user pasted an example that included the "accessories" or "platforms" array
      if (
        !currentBlockNew[this.pluginType]
        && Array.isArray(currentBlockNew[this.arrayKey])
        && currentBlockNew[this.arrayKey].length
        && Object.keys(currentBlockNew).length === 1
      ) {
        currentBlockNew = currentBlockNew[this.arrayKey][0]
      }

      // Accessory types need a valid name
      if (this.pluginType === 'accessory' && (!currentBlockNew.name || typeof currentBlockNew.name !== 'string')) {
        this.$toastr.error(this.$translate.instant('plugins.config.name_property'), this.$translate.instant('toast.title_error'))
        currentBlockNew.name = ''
        this.monacoEditor.getModel().setValue(JSON.stringify(currentBlockNew, null, 4))
        return false
      }

      const currentBlock = this.pluginConfig[this.currentBlockIndex]
      Object.keys(currentBlock).forEach(x => delete currentBlock[x])
      Object.assign(currentBlock, currentBlockNew)

      // Ensure the plugin alias is set
      currentBlock[this.pluginType] = this.pluginAlias
    }

    return true
  }

  private initializeValidationState() {
    // Always initialise validation state
    this.formBlocksValid = {}
    for (let i = 0; i < this.pluginConfig.length; i += 1) {
      this.formBlocksValid[i] = true
    }
    this.updateOverallValidation()
  }
}
