import { Component, inject, OnDestroy, OnInit, Renderer2 } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import json5 from 'json5'
import { isEqual } from 'lodash-es'
import { DiffEditorComponent, DiffEditorModel, EditorComponent, NgxEditorModel } from 'ngx-monaco-editor-v2'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { RestartChildBridgesComponent } from '@/app/core/components/restart-child-bridges/restart-child-bridges.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { createChildBridgeSchema } from '@/app/core/helpers/child-bridges-schema.helper'
import { ChildBridge } from '@/app/core/manage-plugins/manage-plugins.interfaces'
import { MobileDetectService } from '@/app/core/mobile-detect.service'
import { MonacoEditorService } from '@/app/core/monaco-editor.service'
import { SettingsService } from '@/app/core/settings.service'
import {
  AccessoryConfig,
  ChildBridgeToRestart,
  HomebridgeConfig,
  PlatformConfig,
  PluginChildBridge,
} from '@/app/modules/config-editor/config-editor.interfaces'
import { ConfigRestoreComponent } from '@/app/modules/config-editor/config-restore/config-restore.component'

declare const monaco: any

declare global {
  interface Window {
    editor?: any
  }
}

@Component({
  templateUrl: './config-editor.component.html',
  standalone: true,
  imports: [
    NgbTooltip,
    EditorComponent,
    DiffEditorComponent,
    FormsModule,
    TranslatePipe,
  ],
})
export class ConfigEditorComponent implements OnInit, OnDestroy {
  private $api = inject(ApiService)
  private $md = inject(MobileDetectService)
  private $modal = inject(NgbModal)
  private $monacoEditor = inject(MonacoEditorService)
  private $renderer = inject(Renderer2)
  private $route = inject(ActivatedRoute)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private editorDecorations = []
  private lastHeight: number
  private visualViewPortEventCallback: () => void
  private latestSavedConfig: HomebridgeConfig
  private childBridgesToRestart: ChildBridgeToRestart[] = []
  private hbPendingRestart = false
  private isDebugModeEnabled = this.$settings.isFeatureEnabled('childBridgeDebugMode')

  public homebridgeConfig: string
  public originalConfig: string
  public saveInProgress: boolean
  public isMobile: any = false
  public monacoEditor: any
  public editorOptions: any
  public monacoEditorModel: NgxEditorModel
  public diffOriginalModel: DiffEditorModel
  public diffModifiedModel: DiffEditorModel
  public renderSideBySide = false

  constructor() {
    this.isMobile = this.$md.detect.mobile()
  }

  public ngOnInit() {
    // Set page title - using "JSON Config" from menu
    const title = this.$translate.instant('menu.config_json_editor')
    this.$settings.setPageTitle(title)

    this.editorOptions = {
      language: 'json',
      theme: this.$settings.actualLightingMode === 'dark' ? 'vs-dark' : 'vs-light',
      renderSideBySide: this.renderSideBySide,
      renderIndicators: true,
      ignoreTrimWhitespace: false,
      glyphMargin: true,
    }

    const content = document.querySelector('.content')
    this.$renderer.setStyle(content, 'height', '100%')

    // Capture viewport events
    this.visualViewPortEventCallback = () => this.visualViewPortChanged()
    this.lastHeight = window.innerHeight

    if (window.visualViewport && !this.isMobile) {
      window.visualViewport.addEventListener('resize', this.visualViewPortEventCallback, true)
      this.$md.disableTouchMove()
    }

    // Capture viewport events
    this.visualViewPortEventCallback = () => this.visualViewPortChanged()
    this.lastHeight = window.innerHeight

    if (window.visualViewport && !this.isMobile) {
      window.visualViewport.addEventListener('resize', this.visualViewPortEventCallback, true)
      this.$md.disableTouchMove()
    }

    this.$route.data.subscribe((data: { config: string }) => {
      this.homebridgeConfig = data.config
      this.latestSavedConfig = JSON.parse(data.config)

      // Update diff models with initial config
      if (this.diffModifiedModel) {
        this.updateDiffModels()
      }
    })

    // Set up the base monaco editor model
    this.monacoEditorModel = {
      value: '{}',
      language: 'json',
      uri: (window as any).monaco ? (window as any).monaco.Uri.parse('a://homebridge/config.json') : undefined,
    }

    // Set up diff editor models with initial content
    this.diffOriginalModel = {
      code: '',
      language: 'json',
    }

    this.diffModifiedModel = {
      code: this.homebridgeConfig || '{}',
      language: 'json',
    }

    // If monaco is not loaded yet, wait for it, otherwise set up the editor now
    if (!(window as any).monaco) {
      this.$monacoEditor.readyEvent.subscribe({
        next: () => this.setMonacoEditorModel(),
      })
    } else {
      this.setMonacoEditorModel()
    }

    // Get any query parameters
    const { action } = this.$router.parseUrl(this.$router.url).queryParams
    if (action) {
      switch (action) {
        case 'restore': {
          this.onRestore(true)
          break
        }
      }

      // Clear the query parameters so that we don't keep showing the same action
      void this.$router.navigate([], {
        queryParams: {},
        replaceUrl: true,
        queryParamsHandling: '',
      })
    }
  }

  /**
   * Called when the monaco editor is ready
   */
  public onEditorInit(editor: any) {
    window.editor = editor
    this.monacoEditor = editor
    this.monacoEditor.getModel().setValue(this.homebridgeConfig)
  }

  public onInitDiffEditor(editor: any) {
    this.monacoEditor = editor.getModifiedEditor()
    this.updateDiffModels()
    window.editor = editor
  }

  private updateDiffModels() {
    if (this.diffOriginalModel) {
      this.diffOriginalModel.code = this.originalConfig || ''
    }
    if (this.diffModifiedModel) {
      this.diffModifiedModel.code = this.homebridgeConfig || '{}'
    }

    if ((window as any).editor && (window as any).editor.getOriginalEditor) {
      const originalEditor = (window as any).editor.getOriginalEditor()
      const modifiedEditor = (window as any).editor.getModifiedEditor()

      if (originalEditor && modifiedEditor) {
        const originalModel = originalEditor.getModel()
        const modifiedModel = modifiedEditor.getModel()

        if (originalModel) {
          originalModel.setValue(this.originalConfig || '')
        }
        if (modifiedModel) {
          modifiedModel.setValue(this.homebridgeConfig || '{}')
        }
      }
    }
  }

  public async onSave() {
    if (this.saveInProgress) {
      return
    }

    // Hide decorations
    if (this.monacoEditor) {
      this.editorDecorations = this.monacoEditor.deltaDecorations(this.editorDecorations, [])
    }

    this.saveInProgress = true
    // Verify homebridgeConfig contains valid json
    try {
      // Get the value from the editor
      if (!this.isMobile) {
        // Format the document
        await this.monacoEditor.getAction('editor.action.formatDocument').run()

        // Check for issues, specifically block saving if there are any duplicate keys
        const issues = (window as any).monaco.editor.getModelMarkers({ owner: 'json' })

        for (const issue of issues) {
          if (issue.message === 'Duplicate object key') {
            this.saveInProgress = false
            this.$toastr.error(this.$translate.instant('config.config_invalid_json'), this.$translate.instant('toast.title_error'))
            return
          }
        }

        // Set the value
        this.homebridgeConfig = this.monacoEditor.getModel().getValue()
      }

      // Get the config from the editor
      const config = this.parseConfigFromEditor()

      // Ensure it's formatted so errors can be easily spotted
      this.homebridgeConfig = JSON.stringify(config, null, 4)

      // Basic validation of homebridge config spec
      if (typeof (config.bridge) !== 'object') {
        this.$toastr.error(this.$translate.instant('config.config_bridge_missing'), this.$translate.instant('toast.title_error'))
      } else if (!/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(config.bridge.username)) {
        this.$toastr.error(this.$translate.instant('config.config_username_error'), this.$translate.instant('toast.title_error'))
      } else if (config.accessories && !Array.isArray(config.accessories)) {
        this.$toastr.error(this.$translate.instant('config.config_accessory_must_be_array'), this.$translate.instant('toast.title_error'))
      } else if (config.platforms && !Array.isArray(config.platforms)) {
        this.$toastr.error(this.$translate.instant('config.config_platform_must_be_array'), this.$translate.instant('toast.title_error'))
      } else if (config.platforms && Array.isArray(config.platforms) && !this.validateSection(config.platforms, 'platform')) {
        // Handled in validator function
      } else if (config.accessories && Array.isArray(config.accessories) && !this.validateSection(config.accessories, 'accessory')) {
        // Handled in validator function
      } else if (config.plugins && Array.isArray(config.plugins) && !this.validatePlugins(config.plugins, 'plugins')) {
        // Handled in validator function
      } else if (
        config.disabledPlugins
        && Array.isArray(config.disabledPlugins)
        && !this.validatePlugins(config.disabledPlugins, 'disabledPlugins')
      ) {
        // Handled in validator function
      } else {
        await this.saveConfig(config)
        this.originalConfig = ''
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('config.config_invalid_json'), this.$translate.instant('toast.title_error'))
    }
    this.saveInProgress = false
  }

  public onRestore(fromSettings = false) {
    const ref = this.$modal.open(ConfigRestoreComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.currentConfig = this.homebridgeConfig
    ref.componentInstance.fromSettings = fromSettings

    ref.result
      .then((backupId: string) => {
        if (!this.originalConfig) {
          this.originalConfig = this.homebridgeConfig
          this.updateDiffModels()
        }

        this.$api.get(`/config-editor/backups/${backupId}`).subscribe({
          next: (json) => {
            this.$toastr.info(
              this.$translate.instant('config.restore.confirm'),
              this.$translate.instant('config.title_backup_loaded'),
            )

            this.homebridgeConfig = JSON.stringify(json, null, 4)
            this.updateDiffModels()

            // Update the editor
            if (this.monacoEditor && window.editor.modifiedEditor) {
              // Remove all decorations
              this.editorDecorations = this.monacoEditor.deltaDecorations(this.editorDecorations, [])

              // Remove existing config
              this.monacoEditor.executeEdits('beautifier', [
                {
                  identifier: 'delete' as any,
                  range: new monaco.Range(1, 1, this.monacoEditor.getModel().getLineCount() + 10, 1),
                  text: '',
                  forceMoveMarkers: true,
                },
              ])

              // Inject the restored content
              this.monacoEditor.executeEdits('beautifier', [
                {
                  identifier: 'insert' as any,
                  range: new monaco.Range(1, 1, 1, 1),
                  text: this.homebridgeConfig,
                  forceMoveMarkers: true,
                },
              ])
            }
          },
          error: (error) => {
            console.error(error)
            this.$toastr.error(error.error?.message || this.$translate.instant('backup.load_error'), this.$translate.instant('toast.title_error'))
          },
        })
      })
      .catch(() => { /* modal dismissed */ })
  }

  public onCancelRestore() {
    // Properly dispose of diff editor before clearing config
    if (window.editor && window.editor.dispose) {
      try {
        window.editor.dispose()
        window.editor = undefined
      } catch (error) { /* cancelled */ }
    }

    this.homebridgeConfig = this.originalConfig
    this.originalConfig = ''
    if (this.renderSideBySide) {
      this.toggleSideBySide() // reset to default
    }
    this.updateDiffModels()
    this.onRestore()
  }

  public toggleSideBySide() {
    this.renderSideBySide = !this.renderSideBySide
    this.editorOptions = { ...this.editorOptions, renderSideBySide: this.renderSideBySide }
  }

  public ngOnDestroy() {
    const content = document.querySelector('.content')
    this.$renderer.removeStyle(content, 'height')

    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.visualViewPortEventCallback, true)
      this.$md.enableTouchMove()
    }

    try {
      // Clear up main editor
      if (window.editor && window.editor.dispose) {
        window.editor.dispose()
        window.editor = undefined
      }

      // Clean up models
      if ((window as any).monaco) {
        const originalUri = (window as any).monaco.Uri.parse('file:///original.json')
        const modifiedUri = (window as any).monaco.Uri.parse('file:///modified.json')

        const existingOriginalModel = (window as any).monaco.editor.getModel(originalUri)
        if (existingOriginalModel) {
          existingOriginalModel.dispose()
        }

        const existingModifiedModel = (window as any).monaco.editor.getModel(modifiedUri)
        if (existingModifiedModel) {
          existingModifiedModel.dispose()
        }

        // Clean up validation schemas to prevent interference with other Monaco editors
        // Remove the homebridge config schema we added
        const existingSchemas = (window as any).monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas || []
        const updatedSchemas = existingSchemas.filter((x: any) => x.uri !== 'http://homebridge/config.json');

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

  private validateSection(sections: any[], type: 'accessory' | 'platform') {
    for (const section of sections) {
      // Check section is an object
      if (typeof section !== 'object' || Array.isArray(section)) {
        this.$toastr.error(this.$translate.instant('config.error_blocks_objects', { type }), this.$translate.instant('toast.title_error'))
        this.highlightOffendingArrayItem(section)
        return false
      }

      // Check section contains platform/accessory key
      if (!section[type]) {
        this.$toastr.error(this.$translate.instant('config.error_blocks_type', { type }), this.$translate.instant('toast.title_error'))
        this.highlightOffendingArrayItem(section)
        return false
      }

      // Check section platform/accessory key is a string
      if (typeof section[type] !== 'string') {
        this.$toastr.error(this.$translate.instant('config.error_string_type', { type }), this.$translate.instant('toast.title_error'))
        this.highlightOffendingArrayItem(section)
        return false
      }
    }

    // Validation passed
    return true
  }

  private validatePlugins(plugins: any[], key: string) {
    for (const item of plugins) {
      if (typeof item !== 'string') {
        this.$toastr.error(this.$translate.instant('config.error_string_array', { key }), this.$translate.instant('toast.title_error'))
        return false
      }
    }
    return true
  }

  /**
   * Highlight the problematic rows in the editor
   */
  private highlightOffendingArrayItem(block: string) {
    if (!this.monacoEditor) {
      return
    }

    // Figure out which lines the offending block spans, add leading space as per formatting rules
    block = JSON.stringify(block, null, 4).split('\n').map(x => `        ${x}`).join('\n')

    setTimeout(() => {
      const matches = this.monacoEditor.getModel().findMatches(block)

      if (matches.length) {
        const matchRange = matches[0].range

        const range = new monaco.Range(
          matchRange.startLineNumber,
          matchRange.startColumn,
          matchRange.endLineNumber,
          matchRange.endColumn,
        )

        this.editorDecorations = this.monacoEditor.deltaDecorations(this.editorDecorations, [
          { range, options: { isWholeLine: true, linesDecorationsClassName: 'hb-monaco-editor-line-error' } },
        ])
      }
    }, 200)
  }

  /**
   * Set up a json schema object used to check the config against
   */
  private setMonacoEditorModel() {
    if ((window as any).monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas.some((x: any) => x.uri === 'http://homebridge/config.json')) {
      return
    }

    const uri = monaco.Uri.parse('a://homebridge/config.json')

    const childBridgeSchema = createChildBridgeSchema(this.$translate, {
      isDebugModeEnabled: this.isDebugModeEnabled,
    });

    (window as any).monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      allowComments: false,
      validate: true,
      schemas: [
        {
          uri: 'http://homebridge/config.json',
          fileMatch: [uri.toString()],
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['bridge'],
            properties: {
              bridge: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'username', 'port', 'pin'],
                properties: {
                  name: {
                    type: 'string',
                    title: this.$translate.instant('settings.name'),
                    description: 'The Homebridge instance name.\n'
                      + 'This should be unique if you are running multiple instances of Homebridge.',
                    default: 'Homebridge',
                  },
                  username: {
                    type: 'string',
                    title: this.$translate.instant('users.label_username'),
                    description: 'Homebridge username must be 6 pairs of colon-separated hexadecimal characters (A-F 0-9).\n'
                      + 'You should change this pin if you need to re-pair your instance with HomeKit.\n'
                      + 'Example: 0E:89:49:64:91:86.',
                    default: '0E:89:49:64:91:86',
                    pattern: '^([A-Fa-f0-9]{2}:){5}[A-Fa-f0-9]{2}$',
                  },
                  port: {
                    type: 'number',
                    title: this.$translate.instant('settings.network.port_hb'),
                    description: 'The port Homebridge listens on.\n'
                      + 'If running more than one instance of Homebridge on the same server make sure each instance is given a unique port.',
                    default: 51173,
                    minimum: 1025,
                    maximum: 65534,
                  },
                  pin: {
                    type: 'string',
                    description: 'The Homebridge instance pin.\n'
                      + 'This is used when pairing Homebridge to HomeKit.\n'
                      + 'Example: 630-27-655.',
                    default: '630-27-655',
                    pattern: '^([0-9]{3}-[0-9]{2}-[0-9]{3})$',
                  },
                  manufacturer: {
                    type: 'string',
                    title: this.$translate.instant('child_bridge.config.manufacturer'),
                    description: 'The bridge manufacturer to be displayed in HomeKit.',
                  },
                  firmwareRevision: {
                    type: 'string',
                    title: this.$translate.instant('child_bridge.config.firmware'),
                    description: 'The bridge firmware version to be displayed in HomeKit.',
                  },
                  model: {
                    type: 'string',
                    title: this.$translate.instant('child_bridge.config.model'),
                    description: 'The bridge model to be displayed in HomeKit.',
                  },
                  advertiser: {
                    type: 'string',
                    title: this.$translate.instant('settings.mdns_advertiser'),
                    description: this.$translate.instant('settings.mdns_advertiser_help'),
                    oneOf: [
                      {
                        title: 'Avahi',
                        enum: ['avahi'],
                      },
                      {
                        title: 'Bonjour HAP',
                        enum: ['bonjour-hap'],
                      },
                      {
                        title: 'Ciao',
                        enum: ['ciao'],
                      },
                      {
                        title: 'Resolved',
                        enum: ['resolved'],
                      },
                    ],
                  },
                  bind: {
                    title: this.$translate.instant('settings.network.title_network_interfaces'),
                    description: 'A string or an array of strings with the name(s) of the network interface(s) Homebridge should bind to.\n'
                      + 'Requires Homebridge v1.3 or later.',
                    type: ['string', 'array'],
                    items: {
                      type: 'string',
                      description: this.$translate.instant('status.widget.network.network_interface'),
                    },
                  },
                },
                default: { name: 'Homebridge', username: '0E:89:49:64:91:86', port: 51173, pin: '6302-7655' },
              },
              mdns: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  interface: {
                    type: 'string',
                    title: this.$translate.instant('status.widget.network.network_interface'),
                    description: 'The interface or IP address of the interface you want Homebridge to listen on.\n'
                      + 'This is useful if your server has multiple interfaces.\n'
                      + 'Deprecated as of Homebridge v1.3.0 - use bridge.bind instead.',
                  },
                  legacyAdvertiser: {
                    type: 'boolean',
                    title: 'Legacy mDNS Advertiser',
                    description: 'Set to false to use the new mdns library, ciao.',
                  },
                },
                default: { legacyAdvertiser: false },
              },
              ports: {
                type: 'object',
                additionalProperties: false,
                title: 'Port Range',
                description: 'The range of ports that should be used for external accessories like cameras and TVs.',
                required: ['start', 'end'],
                properties: {
                  start: {
                    type: 'number',
                    default: 52100,
                    minimum: 1025,
                    maximum: 65534,
                    title: this.$translate.instant('settings.network.port_start'),
                    description: this.$translate.instant('settings.network.port_start_desc'),
                  },
                  end: {
                    type: 'number',
                    default: 52150,
                    minimum: 1025,
                    maximum: 65534,
                    title: this.$translate.instant('settings.network.port_end'),
                    description: this.$translate.instant('settings.network.port_end_desc'),
                  },
                },
                default: {
                  start: 52100,
                  end: 52150,
                },
              },
              platforms: {
                type: 'array',
                title: 'Platforms',
                description: 'Any plugin that exposes a platform should have its config entered in this array.\n'
                  + 'Separate each plugin config block using a comma.',
                items: {
                  type: 'object',
                  required: ['platform'],
                  anyOf: [
                    {
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
                    },
                    {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        platform: {
                          type: 'string',
                          title: 'Platform Name',
                          description: 'Homebridge UI platform name must be set to "config".\n'
                            + 'Do not change!',
                          const: 'config',
                        },
                        name: {
                          title: this.$translate.instant('accessories.name'),
                          type: 'string',
                          default: 'Homebridge UI',
                          minLength: 1,
                          description: 'The name of the Homebridge instance.',
                        },
                        port: {
                          title: this.$translate.instant('settings.network.port_ui'),
                          type: 'integer',
                          default: 8080,
                          minimum: 1025,
                          maximum: 65535,
                          description: this.$translate.instant('settings.network.port_ui_desc'),
                        },
                        auth: {
                          type: 'string',
                          default: 'form',
                          title: this.$translate.instant('settings.security.auth'),
                          description: this.$translate.instant('settings.security.auth_desc'),
                          oneOf: [
                            {
                              title: 'Require Authentication',
                              enum: ['form'],
                            },
                            {
                              title: 'None',
                              enum: ['none'],
                            },
                          ],
                        },
                        theme: {
                          title: this.$translate.instant('settings.display.theme'),
                          description: 'The theme used for the UI.',
                          type: 'string',
                          default: 'orange',
                          oneOf: [
                            { title: this.$translate.instant('settings.display.orange'), enum: ['orange'] },
                            { title: this.$translate.instant('settings.display.red'), enum: ['red'] },
                            { title: this.$translate.instant('settings.display.pink'), enum: ['pink'] },
                            { title: this.$translate.instant('settings.display.purple'), enum: ['purple'] },
                            { title: this.$translate.instant('settings.display.deep_purple'), enum: ['deep-purple'] },
                            { title: this.$translate.instant('settings.display.indigo'), enum: ['indigo'] },
                            { title: this.$translate.instant('settings.display.blue'), enum: ['blue'] },
                            { title: this.$translate.instant('settings.display.bluegrey'), enum: ['blue-grey'] },
                            { title: this.$translate.instant('settings.display.cyan'), enum: ['cyan'] },
                            { title: this.$translate.instant('settings.display.green'), enum: ['green'] },
                            { title: this.$translate.instant('settings.display.teal'), enum: ['teal'] },
                            { title: this.$translate.instant('settings.display.grey'), enum: ['grey'] },
                            { title: this.$translate.instant('settings.display.brown'), enum: ['brown'] },
                          ],
                        },
                        lightingMode: {
                          title: this.$translate.instant('settings.display.lighting_mode'),
                          description: 'The lighting mode used for the UI.',
                          type: 'string',
                          default: 'auto',
                          oneOf: [
                            { title: this.$translate.instant('accessories.control.auto'), enum: ['auto'] },
                            { title: this.$translate.instant('settings.display.light'), enum: ['light'] },
                            { title: this.$translate.instant('settings.display.dark'), enum: ['dark'] },
                          ],
                        },
                        menuMode: {
                          title: this.$translate.instant('settings.display.menu_mode'),
                          description: 'Modes for the UI side menu.',
                          type: 'string',
                          default: 'default',
                          oneOf: [
                            { title: this.$translate.instant('settings.display.menu_default'), enum: ['default'] },
                            { title: this.$translate.instant('settings.display.menu_freeze'), enum: ['freeze'] },
                          ],
                        },
                        temp: {
                          title: this.$translate.instant('settings.linux.temp'),
                          type: 'string',
                          description: this.$translate.instant('settings.linux.temp_desc'),
                        },
                        tempUnits: {
                          title: this.$translate.instant('settings.display.temp_units'),
                          description: 'The units used to display the temperature.',
                          type: 'string',
                          default: 'c',
                          oneOf: [
                            { title: this.$translate.instant('settings.display.temp_units.c'), enum: ['c'] },
                            { title: this.$translate.instant('settings.display.temp_units.f'), enum: ['f'] },
                          ],
                        },
                        lang: {
                          title: this.$translate.instant('settings.display.lang'),
                          type: 'string',
                          default: 'auto',
                          description: 'The language used for the UI.',
                          oneOf: [
                            { title: this.$translate.instant('form.select.auto'), enum: ['auto'] },
                            { title: 'Bulgarian (bg)', enum: ['bg'] },
                            { title: 'Catalan (ca)', enum: ['ca'] },
                            { title: 'Chinese - Simplified (zh-CN)', enum: ['zh-CN'] },
                            { title: 'Chinese - Traditional (zh-TW)', enum: ['zh-TW'] },
                            { title: 'Czech (cs)', enum: ['cs'] },
                            { title: 'Dutch (nl)', enum: ['nl'] },
                            { title: 'English (en)', enum: ['en'] },
                            { title: 'Finnish (fi)', enum: ['fi'] },
                            { title: 'French (fr)', enum: ['fr'] },
                            { title: 'German (de)', enum: ['de'] },
                            { title: 'Hebrew (he)', enum: ['he'] },
                            { title: 'Hungarian (hu)', enum: ['hu'] },
                            { title: 'Indonesian (id)', enum: ['id'] },
                            { title: 'Italian (it)', enum: ['it'] },
                            { title: 'Japanese (ja)', enum: ['ja'] },
                            { title: 'Korean (ko)', enum: ['ko'] },
                            { title: 'Macedonian (mk)', enum: ['mk'] },
                            { title: 'Norwegian (no)', enum: ['no'] },
                            { title: 'Polish (pl)', enum: ['pl'] },
                            { title: 'Portuguese (Brazil)', enum: ['pt-BR'] },
                            { title: 'Portuguese (Portugal)', enum: ['pt'] },
                            { title: 'Russian (ru)', enum: ['ru'] },
                            { title: 'Slovenian (sl)', enum: ['sl'] },
                            { title: 'Spanish (es)', enum: ['es'] },
                            { title: 'Swedish (sv)', enum: ['sv'] },
                            { title: 'Thai (th)', enum: ['th'] },
                            { title: 'Turkish (tr)', enum: ['tr'] },
                            { title: 'Ukrainian (uk)', enum: ['uk'] },
                          ],
                        },
                        wallpaper: {
                          title: this.$translate.instant('settings.display.wallpaper'),
                          description: 'The full path to the .jpg file.',
                          type: 'string',
                        },
                        homebridgePackagePath: {
                          title: this.$translate.instant('settings.network.hb_package'),
                          type: 'string',
                          description: this.$translate.instant('settings.network.hb_package_desc'),
                        },
                        host: {
                          type: 'string',
                          pattern: '^[^{}/ :\\\\]+(?::\\d+)?$',
                          title: this.$translate.instant('settings.network.host'),
                          description: this.$translate.instant('settings.network.host_desc'),
                        },
                        sessionTimeoutInactivityBased: {
                          type: 'boolean',
                          title: this.$translate.instant('settings.startup.session_inactivity_based'),
                          description: this.$translate.instant('settings.startup.session_inactivity_based_desc'),
                        },
                        sessionTimeout: {
                          type: 'integer',
                          minimum: 600,
                          maximum: 86400000,
                          title: this.$translate.instant('settings.startup.session'),
                          description: this.$translate.instant('settings.startup.session_desc'),
                        },
                        log: {
                          type: 'object',
                          additionalProperties: false,
                          title: 'Log Settings',
                          description: 'The log settings for the Homebridge UI.',
                          properties: {
                            maxSize: {
                              type: 'integer',
                              title: this.$translate.instant('settings.terminal.log_max'),
                              description: this.$translate.instant('settings.terminal.log_max_desc'),
                              minimum: -1,
                            },
                            truncateSize: {
                              type: 'integer',
                              title: this.$translate.instant('settings.terminal.log_truncate'),
                              description: this.$translate.instant('settings.terminal.log_truncate_desc'),
                              minimum: 0,
                            },
                          },
                        },
                        ssl: {
                          type: 'object',
                          additionalProperties: false,
                          title: this.$translate.instant('settings.security.https'),
                          description: this.$translate.instant('settings.security.https_desc'),
                          properties: {
                            key: {
                              type: 'string',
                              title: this.$translate.instant('settings.security.key'),
                              description: 'The full path to the private key file.',
                            },
                            cert: {
                              type: 'string',
                              title: this.$translate.instant('settings.security.cert'),
                              description: 'The full path to the certificate file.',
                            },
                            pfx: {
                              title: this.$translate.instant('settings.security.pfx'),
                              type: 'string',
                              description: 'The full path to the PKCS#12 certificate file.',
                            },
                            passphrase: {
                              title: this.$translate.instant('settings.security.pass'),
                              type: 'string',
                              description: 'The passphrase for the PKCS#12 certificate file.',
                            },
                          },
                        },
                        accessoryControl: {
                          title: 'Accessory Control Setup',
                          type: 'object',
                          additionalProperties: false,
                          description: 'The accessory control settings for the Homebridge UI.',
                          properties: {
                            debug: {
                              title: this.$translate.instant('settings.accessory.debug'),
                              type: 'boolean',
                              description: this.$translate.instant('settings.accessory.debug_desc'),
                            },
                            instanceBlacklist: {
                              title: this.$translate.instant('settings.security.ui_control'),
                              type: 'array',
                              description: this.$translate.instant('settings.security.ui_control_desc'),
                              items: {
                                title: this.$translate.instant('users.label_username'),
                                type: 'string',
                                pattern: '^([A-Fa-f0-9]{2}:){5}[A-Fa-f0-9]{2}$',
                              },
                            },
                          },
                        },
                        linux: {
                          title: 'Linux Server Commands',
                          type: 'object',
                          additionalProperties: false,
                          description: 'The Linux server commands for the Homebridge UI.',
                          properties: {
                            shutdown: {
                              title: this.$translate.instant('settings.linux.shutdown'),
                              type: 'string',
                              description: this.$translate.instant('settings.linux.shutdown_desc'),
                            },
                            restart: {
                              title: this.$translate.instant('settings.linux.restart'),
                              type: 'string',
                              description: this.$translate.instant('settings.linux.restart_desc'),
                            },
                          },
                        },
                        proxyHost: {
                          title: this.$translate.instant('settings.network.proxy'),
                          type: 'string',
                          pattern: '^[^{}/ :\\\\]+(?::\\d+)?$',
                          description: this.$translate.instant('settings.network.proxy_desc'),
                        },
                        scheduledBackupPath: {
                          title: this.$translate.instant('backup.settings_path'),
                          description: 'The full path to where the service should save daily scheduled backups archives.',
                          type: 'string',
                        },
                        scheduledBackupDisable: {
                          title: 'Disable Scheduled Backups',
                          type: 'boolean',
                          description: 'When enabled, the Homebridge UI will not create daily scheduled backups.',
                        },
                        scheduledRestartCron: {
                          type: 'string',
                          title: this.$translate.instant('settings.startup.scheduled_restart'),
                          description: this.$translate.instant('settings.startup.scheduled_restart_desc'),
                        },
                        disableServerMetricsMonitoring: {
                          title: 'Disable Server Metrics Monitoring',
                          type: 'boolean',
                          description: 'When enabled, the Homebridge UI will not collect or report CPU or memory stats.',
                        },
                        enableMdnsAdvertise: {
                          title: this.$translate.instant('settings.network.mdns_advertise'),
                          type: 'boolean',
                          description: this.$translate.instant('settings.network.mdns_advertise_help'),
                        },
                        plugins: {
                          title: this.$translate.instant('menu.label_plugins'),
                          type: 'object',
                          additionalProperties: false,
                          description: 'Settings surrounding plugins that are used by the Homebridge UI.',
                          properties: {
                            hideUpdatesFor: {
                              type: 'array',
                              title: this.$translate.instant('config.hide_plugin_updates'),
                              description: 'A list of plugin names for which frontend update notifications will be hidden.',
                              items: {
                                type: 'string',
                                title: this.$translate.instant('accessories.plugin'),
                                pattern: '^(?:@[\\w-]+(?:\\.[\\w-]+)*/)?homebridge-[\\w-]+$',
                              },
                            },
                            alwaysShowBetasFor: {
                              type: 'array',
                              title: 'Prefer Beta Versions For',
                              description: 'A list of plugin names that should prefer beta releases.',
                              items: {
                                type: 'string',
                                title: this.$translate.instant('accessories.plugin'),
                                pattern: '^(?:@[\\w-]+(?:\\.[\\w-]+)*/)?homebridge-[\\w-]+$',
                              },
                            },
                          },
                        },
                        nodeUpdatePolicy: {
                          type: 'string',
                          title: this.$translate.instant('status.widget.node_update_policy'),
                          description: 'Controls when Node.js update notifications are shown.',
                          default: 'all',
                          enum: ['all', 'major', 'none'],
                          oneOf: [
                            {
                              title: this.$translate.instant('status.widget.node_update_policy_all'),
                              const: 'all',
                            },
                            {
                              title: this.$translate.instant('status.widget.node_update_policy_major'),
                              const: 'major',
                            },
                            {
                              title: this.$translate.instant('status.widget.node_update_policy_none'),
                              const: 'none',
                            },
                          ],
                        },
                        homebridgeHideUpdates: {
                          type: 'boolean',
                          title: `${this.$translate.instant('plugins.manage.hide_updates')} (Homebridge)`,
                          description: 'Hide Homebridge update notifications.',
                        },
                        homebridgeAlwaysShowBetas: {
                          type: 'boolean',
                          title: `${this.$translate.instant('settings.display.show_betas')} (Homebridge)`,
                          description: 'Show beta releases as available updates for Homebridge.',
                        },
                        homebridgeUiHideUpdates: {
                          type: 'boolean',
                          title: `${this.$translate.instant('plugins.manage.hide_updates')} (Homebridge UI)`,
                          description: 'Hide Homebridge UI update notifications.',
                        },
                        homebridgeUiAlwaysShowBetas: {
                          type: 'boolean',
                          title: `${this.$translate.instant('settings.display.show_betas')} (Homebridge UI)`,
                          description: 'Show beta releases as available updates for Homebridge UI.',
                        },
                        bridges: {
                          type: 'array',
                          title: this.$translate.instant('child_bridge.bridges'),
                          description: 'Settings surrounding bridges that are used by the Homebridge UI.',
                          items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['username'],
                            properties: {
                              username: {
                                type: 'string',
                                title: this.$translate.instant('users.label_username'),
                                description: 'The MAC address of the bridge (e.g., "0E:02:9A:9D:44:45").',
                                pattern: '^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$',
                              },
                              hideHapAlert: {
                                type: 'boolean',
                                title: this.$translate.instant('config.hide_hap_pairing'),
                                description: 'Hide the HAP pairing alert for this bridge.',
                              },
                              scheduledRestartCron: {
                                type: 'string',
                                title: this.$translate.instant('settings.startup.scheduled_restart'),
                                description: this.$translate.instant('settings.startup.scheduled_restart_desc'),
                              },
                            },
                          },
                        },
                        terminal: {
                          type: 'object',
                          additionalProperties: false,
                          title: 'Terminal Settings',
                          description: 'The terminal settings for the Homebridge UI.',
                          properties: {
                            persistence: {
                              title: this.$translate.instant('settings.terminal.persistence'),
                              type: 'boolean',
                              description: this.$translate.instant('settings.terminal.persistence_help'),
                              default: false,
                            },
                            hideWarning: {
                              title: this.$translate.instant('settings.terminal.warning'),
                              type: 'boolean',
                              description: this.$translate.instant('settings.terminal.warning_help'),
                              default: false,
                            },
                            bufferSize: {
                              title: this.$translate.instant('settings.terminal.buffer_size'),
                              type: 'integer',
                              description: this.$translate.instant('settings.terminal.buffer_size_help'),
                              default: 50000,
                              minimum: 0,
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
              accessories: {
                type: 'array',
                title: this.$translate.instant('menu.label_accessories'),
                description: 'Any plugin that exposes an accessory should have its config entered in this array.\n'
                  + 'Separate each plugin config block using a comma.',
                items: {
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
                },
              },
              plugins: {
                type: 'array',
                title: this.$translate.instant('menu.label_plugins'),
                description: 'An array of plugins that should be selectively enabled.\n'
                  + 'Remove this array to enable all plugins.',
                items: {
                  type: 'string',
                  title: this.$translate.instant('accessories.plugin'),
                  description: 'The full plugin npm package name.'
                    + '\nExample: homebridge-dummy.',
                },
                default: ['homebridge-config-ui-x'],
              },
              disabledPlugins: {
                type: 'array',
                description: 'An array of plugins that should be disabled.\n'
                  + 'Requires Homebridge v1.3 or later.',
                items: {
                  type: 'string',
                  title: this.$translate.instant('accessories.plugin'),
                  description: 'The full plugin npm package name.\n'
                    + 'Example: homebridge-dummy.',
                },
                default: [],
              },
            },
          },
        },
      ],
    })

    this.monacoEditorModel.uri = monaco.Uri.parse('a://homebridge/config.json')
  }

  private visualViewPortChanged() {
    if (this.lastHeight < window.visualViewport.height) {
      (document.activeElement as HTMLElement).blur()
    }

    if (window.visualViewport.height < window.innerHeight) {
      // Keyboard may have opened
      this.$md.enableTouchMove()
      this.lastHeight = window.visualViewport.height
    } else if (window.visualViewport.height === window.innerHeight) {
      // Keyboard is closed
      this.$md.disableTouchMove()
      this.lastHeight = window.visualViewport.height
    }
  }

  private async saveConfig(config: any) {
    try {
      const data = await firstValueFrom(this.$api.post('/config-editor', config))
      this.homebridgeConfig = JSON.stringify(data, null, 4)
      await this.detectSavesChangesForRestart()
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('config.failed_to_save_config'), this.$translate.instant('toast.title_error'))
    }
  }

  private validateArraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
      return false
    }
    const sortedA = [...a].sort()
    const sortedB = [...b].sort()
    return sortedA.every((val, idx) => val === sortedB[idx])
  }

  private removePlatformsAndAccessories(config: HomebridgeConfig): Omit<HomebridgeConfig, 'platforms' | 'accessories'> {
    // eslint-disable-next-line unused-imports/no-unused-vars
    const { accessories, platforms, ...rest } = config
    return rest
  }

  private removeEmptyBridges(entries: (PlatformConfig | AccessoryConfig)[]): PluginChildBridge[] {
    return entries
      .filter((p: PlatformConfig | AccessoryConfig) => p._bridge && Object.keys(p._bridge).length > 0)
      .map((p: PlatformConfig | AccessoryConfig) => p._bridge)
  }

  private validateBridgesEqual(a: PluginChildBridge[], b: PluginChildBridge[]): boolean {
    if (a.length !== b.length) {
      return false
    }
    return a.every(itemA => b.some(itemB => isEqual(itemA, itemB)))
  }

  private detectConfigPlatformChanges(): boolean {
    try {
      const originalConfigJson = this.latestSavedConfig
      const updatedConfigJson = JSON.parse(this.homebridgeConfig) as HomebridgeConfig

      // Find config platforms in original config
      const originalConfigPlatform = (originalConfigJson.platforms || [])
        .find(platform => platform.platform === 'config')

      // Find config platforms in updated config
      const updatedConfigPlatform = (updatedConfigJson.platforms || [])
        .find(platform => platform.platform === 'config')

      // If one exists and the other doesn't, that's a change
      if (!originalConfigPlatform && updatedConfigPlatform) {
        return true
      }
      if (originalConfigPlatform && !updatedConfigPlatform) {
        return true
      }
      if (!originalConfigPlatform && !updatedConfigPlatform) {
        return false
      }

      // Both exist - compare all keys (deep equality check)
      return !isEqual(originalConfigPlatform, updatedConfigPlatform)
    } catch (error) {
      console.error('Error detecting config platform changes:', error)
      return false // Default to no service restart if we can't determine
    }
  }

  private async detectSavesChangesForRestart() {
    const restartType = await this.determineRestartType()

    if (restartType === 'full') {
      // If any of the keys inside the platforms[].entry where entry.platform === 'config' have changed, we need a full service restart
      const doServiceRestart = this.detectConfigPlatformChanges()

      await this.performFullRestart(doServiceRestart)
    } else if (restartType === 'child') {
      await this.performChildBridgeRestart()
    }

    this.latestSavedConfig = JSON.parse(this.homebridgeConfig)
  }

  private async determineRestartType(): Promise<'none' | 'child' | 'full'> {
    // If homebridge is pending a restart, we don't even need to start with these checks
    if (this.hbPendingRestart) {
      return 'full'
    }

    // We can try to find things that have changed, to offer the best restart option
    const originalConfigJson = this.latestSavedConfig
    const originalConfigString = JSON.stringify(originalConfigJson, null, 4)
    const updatedConfigJson = JSON.parse(this.homebridgeConfig) as HomebridgeConfig
    const updatedConfigString = this.homebridgeConfig

    // Check one: has anything actually changed?
    if (originalConfigString === updatedConfigString && !this.childBridgesToRestart.length) {
      this.$toastr.info(this.$translate.instant('config.no_restart'), this.$translate.instant('config.config_saved'))
      return 'none'
    }

    // Check two: has a new key been added or removed at the top level?
    if (!this.validateArraysEqual(Object.keys(originalConfigJson), Object.keys(updatedConfigJson))) {
      return 'full'
    }

    // Check three: if the user has no child bridges, then there is no point in checking the rest
    const platformsAndAccessories = [
      ...(updatedConfigJson.platforms || []),
      ...(updatedConfigJson.accessories || []),
    ]
    // Check if no child bridges are present
    if (platformsAndAccessories.every((entry: PlatformConfig | AccessoryConfig) => !entry._bridge || !Object.keys(entry._bridge).length)) {
      return 'full'
    }

    // Check four: have any of the top level properties changed (except plugins and accessories)?
    // Remove 'accessories' and 'platforms' from both configs
    const originalConfigOmitted = this.removePlatformsAndAccessories(originalConfigJson)
    const updatedConfigOmitted = this.removePlatformsAndAccessories(updatedConfigJson)
    if (!isEqual(originalConfigOmitted, updatedConfigOmitted)) {
      return 'full'
    }

    // So far so good, now we just needs to deal with the platforms and accessories keys
    // Check five: In each case, for the properties of those arrays, compare on the 'platform' or 'accessory' key
    // If by comparing them, we find a 'platform' or 'accessory' has been added, removed or changed, we need a full restart
    const originalPlatforms = originalConfigJson.platforms || []
    const updatedPlatforms = updatedConfigJson.platforms || []
    const originalPlatformKeys = originalPlatforms.map((p: PlatformConfig) => p.platform)
    const updatedPlatformKeys = updatedPlatforms.map((p: PlatformConfig) => p.platform)
    if (!this.validateArraysEqual(originalPlatformKeys, updatedPlatformKeys)) {
      return 'full'
    }
    const originalAccessories = originalConfigJson.accessories || []
    const updatedAccessories = updatedConfigJson.accessories || []
    const originalAccessoryKeys = originalAccessories.map((a: AccessoryConfig) => a.accessory)
    const updatedAccessoryKeys = updatedAccessories.map((a: AccessoryConfig) => a.accessory)
    if (!this.validateArraysEqual(originalAccessoryKeys, updatedAccessoryKeys)) {
      return 'full'
    }

    // Any object in the platforms array can have a '_bridge' key, and the value is an object
    // Check six: We need a full restart if for any of the platforms a '_bridge' key has been added, changed or removed
    if (!this.validateBridgesEqual(this.removeEmptyBridges(originalPlatforms), this.removeEmptyBridges(updatedPlatforms))) {
      return 'full'
    }
    if (!this.validateBridgesEqual(this.removeEmptyBridges(originalAccessories), this.removeEmptyBridges(updatedAccessories))) {
      return 'full'
    }

    // For the rest of the checks, we need to find out which entries have changed
    const changedPlatformEntries = originalPlatforms.filter((p: PlatformConfig) => {
      return !isEqual(p, updatedPlatforms.find((up: PlatformConfig) => up.platform === p.platform))
    })
    const changedAccessoryEntries = originalAccessories.filter((a: AccessoryConfig) => {
      return !isEqual(a, updatedAccessories.find((ua: AccessoryConfig) => ua.accessory === a.accessory))
    })
    const changedEntries = [...changedPlatformEntries, ...changedAccessoryEntries]

    // Check seven: we need a full restart if the homebridge ui config entry has changed
    if (changedPlatformEntries.some((entry: PlatformConfig) => entry.platform === 'config')) {
      return 'full'
    }

    // Check eight: apart from the ui config entry, if any of the changed entries do not have a '_bridge' key
    //   (or it is null or an empty object), we must do a full restart
    const hasChangedEntriesWithoutBridge = changedEntries.some((entry: PlatformConfig | AccessoryConfig) => {
      if (entry.platform === 'config') {
        return false
      }
      return !entry._bridge || Object.keys(entry._bridge).length === 0
    })
    if (hasChangedEntriesWithoutBridge) {
      return 'full'
    }

    // At this point we have a list of the changed entries, and we know they all have a _bridge key
    // Now we can start to form a list of the child bridges that we can restart.
    try {
      const data: ChildBridge[] = await firstValueFrom(this.$api.get('/status/homebridge/child-bridges'))

      // Match up the changed entries with the child bridges
      changedEntries.forEach((entry: PlatformConfig | AccessoryConfig) => {
        // Grab the username from the _bridge key, uppercase it, and find the matching child bridge
        const configUsername = entry._bridge.username.toUpperCase()
        const childBridge = data.find(({ username }) => username === configUsername)
        if (childBridge) {
          if (!this.childBridgesToRestart.some((b: ChildBridgeToRestart) => b.username === childBridge.username)) {
            this.childBridgesToRestart.push({
              name: childBridge.name,
              username: childBridge.username,
            })
          }
        } else {
          return 'full' // child bridge not found, need full restart
        }
      })

      return 'child' // child bridge restart is sufficient
    } catch (error) {
      console.error('Error fetching child bridges:', error)
      return 'full' // api error, fallback to full restart
    }
  }

  private async performChildBridgeRestart() {
    // If there are no child bridges to restart, fall through to full restart
    if (!this.childBridgesToRestart.length) {
      await this.performFullRestart(false)
      return
    }

    const ref = this.$modal.open(RestartChildBridgesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.bridges = this.childBridgesToRestart

    // If the user dismisses the modal, the child bridges are still pending a restart
    try {
      await ref.result
      this.childBridgesToRestart = []
    } catch (error) { /* modal dismissed */ }
  }

  private async performFullRestart(restartService: boolean) {
    // If restartService is true, set the flag to do a full service restart
    if (restartService) {
      await firstValueFrom(this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}))
    }

    const ref = this.$modal.open(RestartHomebridgeComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    try {
      await ref.result
      this.hbPendingRestart = false
      this.childBridgesToRestart = []
    } catch {
      this.hbPendingRestart = true
    }
  }

  private parseConfigFromEditor() {
    try {
      return JSON.parse(this.homebridgeConfig)
    } catch (e) {
      const config = json5.parse(this.homebridgeConfig)
      this.homebridgeConfig = JSON.stringify(config, null, 4)
      if (this.monacoEditor) {
        this.monacoEditor.getModel().setValue(this.homebridgeConfig)
      }
      return config
    }
  }
}
