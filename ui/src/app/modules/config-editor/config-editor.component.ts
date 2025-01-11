import { Component, inject, OnDestroy, OnInit, Renderer2 } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute } from '@angular/router'
import { NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import json5 from 'json5'
import { DiffEditorComponent, EditorComponent, NgxEditorModel } from 'ngx-monaco-editor-v2'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { MobileDetectService } from '@/app/core/mobile-detect.service'
import { MonacoEditorService } from '@/app/core/monaco-editor.service'
import { SettingsService } from '@/app/core/settings.service'
import { ConfigRestoreComponent } from '@/app/modules/config-editor/config-restore/config.restore.component'

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
  private $route = inject(ActivatedRoute)
  private $renderer = inject(Renderer2)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public homebridgeConfig: string
  public originalConfig: string
  public saveInProgress: boolean
  public isMobile: any = false
  public monacoEditor: any
  public editorOptions: any

  public monacoEditorModel: NgxEditorModel

  private editorDecorations = []
  private lastHeight: number
  private visualViewPortEventCallback: () => void

  constructor() {
    this.isMobile = this.$md.detect.mobile()
  }

  ngOnInit() {
    this.editorOptions = {
      language: 'json',
      theme: this.$settings.actualLightingMode === 'dark' ? 'vs-dark' : 'vs-light',
      automaticLayout: true,
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
    })

    // Setup the base monaco editor model
    this.monacoEditorModel = {
      value: '{}',
      language: 'json',
      uri: (window as any).monaco ? (window as any).monaco.Uri.parse('a://homebridge/config.json') : undefined,
    }

    //  if monaco is not loaded yet, wait for it, otherwise set up the editor now
    if (!(window as any).monaco) {
      this.$monacoEditor.readyEvent.subscribe({
        next: () => {
          this.setMonacoEditorModel()
        },
      })
    } else {
      this.setMonacoEditorModel()
    }
  }

  /**
   * Called when the monaco editor is ready
   */
  onEditorInit(editor: any) {
    // @ts-expect-error - TS2339: Property editor does not exist on type Window & typeof globalThis
    window.editor = editor
    this.monacoEditor = editor
    this.monacoEditor.getModel().setValue(this.homebridgeConfig)
  }

  onInitDiffEditor(editor: any) {
    this.monacoEditor = editor.modifiedEditor

    editor.getModel().original.setValue(this.originalConfig)
    editor.getModel().modified.setValue(this.homebridgeConfig)

    // @ts-expect-error - TS2339: Property editor does not exist on type Window & typeof globalThis
    window.editor = editor
  }

  async onSave() {
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

  parseConfigFromEditor() {
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

  async saveConfig(config: any) {
    try {
      const data = await firstValueFrom(this.$api.post('/config-editor', config))
      this.homebridgeConfig = JSON.stringify(data, null, 4)
      this.$modal.open(RestartHomebridgeComponent, {
        size: 'lg',
        backdrop: 'static',
      })
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('config.failed_to_save_config'), this.$translate.instant('toast.title_error'))
    }
  }

  onRestore() {
    this.$modal
      .open(ConfigRestoreComponent, {
        size: 'lg',
        backdrop: 'static',
      })
      .result
      .then((backupId) => {
        if (!this.originalConfig) {
          this.originalConfig = this.homebridgeConfig
        }

        this.$api.get(`/config-editor/backups/${backupId}`).subscribe({
          next: (json) => {
            this.$toastr.info(
              this.$translate.instant('config.restore.confirm'),
              this.$translate.instant('config.title_backup_loaded'),
            )

            this.homebridgeConfig = JSON.stringify(json, null, 4)

            // Update the editor
            // @ts-expect-error - TS2339: Property editor does not exist on type Window & typeof globalThis
            if (this.monacoEditor && window.editor.modifiedEditor) {
            // Remove all decorations
              this.editorDecorations = this.monacoEditor.deltaDecorations(this.editorDecorations, [])

              // Remove existing config
              this.monacoEditor.executeEdits('beautifier', [
                {
                  identifier: 'delete' as any,
                  // @ts-expect-error - monaco is defined in the browser
                  // eslint-disable-next-line no-undef
                  range: new monaco.Range(1, 1, this.monacoEditor.getModel().getLineCount() + 10, 1),
                  text: '',
                  forceMoveMarkers: true,
                },
              ])

              // Inject the restored content
              this.monacoEditor.executeEdits('beautifier', [
                {
                  identifier: 'insert' as any,
                  // @ts-expect-error - monaco is defined in the browser
                  // eslint-disable-next-line no-undef
                  range: new monaco.Range(1, 1, 1, 1),
                  text: this.homebridgeConfig,
                  forceMoveMarkers: true,
                },
              ])
            }
          },
          error: (error) => {
            console.error(error)
            this.$toastr.error(error.error.message || this.$translate.instant('backup.load_error'), this.$translate.instant('toast.title_error'))
          },
        })
      })
      .catch(() => { /* modal dismissed */ })
  }

  onExportConfig() {
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(this.homebridgeConfig)}`
    const downloadAnchorNode = document.createElement('a')
    downloadAnchorNode.setAttribute('href', dataStr)
    downloadAnchorNode.setAttribute('download', 'config.json')
    document.body.appendChild(downloadAnchorNode) // required for firefox
    downloadAnchorNode.click()
    downloadAnchorNode.remove()
  }

  onCancelRestore() {
    this.homebridgeConfig = this.originalConfig
    this.originalConfig = ''
  }

  validateSection(sections: any[], type: 'accessory' | 'platform') {
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

  validatePlugins(plugins: any[], key: string) {
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
  highlightOffendingArrayItem(block: string) {
    if (!this.monacoEditor) {
      return
    }

    // Figure out which lines the offending block spans, add leading space as per formatting rules
    block = JSON.stringify(block, null, 4).split('\n').map(x => `        ${x}`).join('\n')

    setTimeout(() => {
      const matches = this.monacoEditor.getModel().findMatches(block)

      if (matches.length) {
        const matchRange = matches[0].range

        // @ts-expect-error - monaco is defined in the browser
        // eslint-disable-next-line no-undef
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
  setMonacoEditorModel() {
    if ((window as any).monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas.some((x: any) => x.uri === 'http://homebridge/config.json')) {
      return
    }

    // @ts-expect-error - monaco is defined in the browser
    // eslint-disable-next-line no-undef
    const uri = monaco.Uri.parse('a://homebridge/config.json');

    (window as any).monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      allowComments: false,
      validate: true,
      schemas: [
        {
          uri: 'http://homebridge/config.json',
          fileMatch: [uri.toString()],
          schema: {
            type: 'object',
            required: ['bridge'],
            properties: {
              bridge: {
                type: 'object',
                required: ['name', 'username', 'port', 'pin'],
                properties: {
                  name: {
                    type: 'string',
                    description: 'The Homebridge instance name.\n'
                      + 'This should be unique if you are running multiple instances of Homebridge.',
                    default: 'Homebridge',
                  },
                  username: {
                    type: 'string',
                    description: 'Homebridge username must be 6 pairs of colon-separated hexadecimal characters (A-F 0-9).'
                      + '\nYou should change this pin if you need to re-pair your instance with HomeKit.\nExample: 0E:89:49:64:91:86',
                    default: '0E:89:49:64:91:86',
                    pattern: '^([A-Fa-f0-9]{2}:){5}[A-Fa-f0-9]{2}$',
                  },
                  port: {
                    type: 'number',
                    description: 'The port Homebridge listens on.\nIf running more than one instance of Homebridge '
                      + 'on the same server make sure each instance is given a unique port.',
                    default: 51173,
                    minimum: 1025,
                    maximum: 65534,
                  },
                  pin: {
                    type: 'string',
                    description: 'The Homebridge instance pin.\nThis is used when pairing Homebridge to HomeKit.\nExample: 630-27-655',
                    default: '630-27-655',
                    pattern: '^([0-9]{3}-[0-9]{2}-[0-9]{3})$',
                  },
                  manufacturer: {
                    type: 'string',
                    description: 'The bridge manufacturer to be displayed in HomeKit',
                  },
                  firmwareRevision: {
                    type: 'string',
                    description: 'The bridge firmware version to be displayed in HomeKit',
                  },
                  model: {
                    type: 'string',
                    description: 'The bridge model to be displayed in HomeKit',
                  },
                  bind: {
                    description: 'A string or an array of strings with the name(s) of the network interface(s) '
                      + 'Homebridge should bind to.\n\nRequires Homebridge v1.3 or later.',
                    type: ['string', 'array'],
                    items: {
                      type: 'string',
                      description: 'Network Interface name that Homebridge should bind to.',
                    },
                  },
                },
                default: { name: 'Homebridge', username: '0E:89:49:64:91:86', port: 51173, pin: '6302-7655' },
              },
              mdns: {
                type: 'object',
                properties: {
                  interface: {
                    type: 'string',
                    description: 'The interface or IP address of the interface you want Homebridge to listen on. '
                      + 'This is useful if your server has multiple interfaces. '
                      + '\n\nDeprecated as of Homebridge v1.3.0 - use bridge.bind instead.',
                  },
                  legacyAdvertiser: {
                    type: 'boolean',
                    description: 'Set to `false` to use the new mdns library, ciao.',
                  },
                },
                default: { legacyAdvertiser: false },
              },
              plugins: {
                type: 'array',
                description: 'An array of plugins that should be selectively enabled. Remove this array to enable all plugins.',
                items: {
                  type: 'string',
                  description: 'The full plugin npm package name.\nExample: homebridge-dummy',
                },
                default: ['homebridge-config-ui-x'],
              },
              disabledPlugins: {
                type: 'array',
                description: 'An array of plugins that should be disabled.\n\nRequires Homebridge v1.3 or later.',
                items: {
                  type: 'string',
                  description: 'The full plugin npm package name.\nExample: homebridge-dummy',
                },
                default: [],
              },
              ports: {
                type: 'object',
                description: 'The range of ports that should be used for certain accessories like cameras and TVs',
                required: ['start', 'end'],
                properties: {
                  start: {
                    type: 'number',
                    default: 52100,
                    minimum: 1025,
                    maximum: 65534,
                  },
                  end: {
                    type: 'number',
                    default: 52150,
                    minimum: 1025,
                    maximum: 65534,
                  },
                },
                default: {
                  start: 52100,
                  end: 52150,
                },
              },
              platforms: {
                type: 'array',
                description: 'Any plugin that exposes a platform should have its config entered in this array.'
                  + '\nSeparate each plugin config block using a comma.',
                items: {
                  type: 'object',
                  required: ['platform'],
                  anyOf: [
                    {
                      type: 'object',
                      required: ['platform'],
                      properties: {
                        platform: {
                          type: 'string',
                          description: 'This is used by Homebridge to identify which plugin this platform belongs to.',
                          not: { enum: ['config'] },
                        },
                        name: {
                          type: 'string',
                          description: 'The name of the platform.',
                        },
                      },
                    },
                    {
                      type: 'object',
                      properties: {
                        platform: {
                          type: 'string',
                          description: 'Homebridge UI platform name must be set to "config".\nDo Not Change!',
                          oneOf: [
                            { enum: 'config' },
                          ],
                        },
                        name: {
                          type: 'string',
                          description: 'The name used in the Homebridge log.',
                        },
                      },
                    },
                  ],
                },
              },
              accessories: {
                type: 'array',
                description: 'Any plugin that exposes an accessory should have its config entered in this array.'
                  + '\nSeparate each plugin config block using a comma.',
                items: {
                  type: 'object',
                  required: ['accessory', 'name'],
                  properties: {
                    accessory: {
                      type: 'string',
                      description: 'This is used by Homebridge to identify which plugin this accessory belongs to.',
                    },
                    name: {
                      type: 'string',
                      description: 'The name of the accessory.',
                    },
                  },
                },
              },
            },
          },
        },
      ],
    })

    // @ts-expect-error - monaco is defined in the browser
    // eslint-disable-next-line no-undef
    this.monacoEditorModel.uri = monaco.Uri.parse('a://homebridge/config.json')
  }

  visualViewPortChanged() {
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

  ngOnDestroy() {
    const content = document.querySelector('.content')
    this.$renderer.removeStyle(content, 'height')

    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.visualViewPortEventCallback, true)
      this.$md.enableTouchMove()
    }

    if (this.monacoEditor) {
      this.monacoEditor.dispose()
    }
  }
}
