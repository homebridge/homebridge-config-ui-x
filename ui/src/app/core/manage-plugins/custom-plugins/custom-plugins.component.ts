import { ApiService } from '@/app/core/api.service'
import { RestartChildBridgesComponent } from '@/app/core/components/restart-child-bridges/restart-child-bridges.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { PluginSchema } from '@/app/core/manage-plugins/plugin-config/plugin-config.component'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { environment } from '@/environments/environment'
import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom, Subject } from 'rxjs'
import { debounceTime, skip } from 'rxjs/operators'

@Component({
  templateUrl: './custom-plugins.component.html',
  styleUrls: ['./custom-plugins.component.scss'],
})
export class CustomPluginsComponent implements OnInit, OnDestroy {
  @ViewChild('custompluginui', { static: true }) customPluginUiElementTarget: ElementRef
  @Input() plugin: any
  @Input() schema: PluginSchema
  @Input() pluginConfig: Record<string, any>[]

  public pluginAlias: string
  public pluginType: 'platform' | 'accessory'
  public loading = true
  public saveInProgress = false
  public pluginSpinner = false
  public uiLoaded = false
  public showSchemaForm = false
  public schemaFormUpdatedSubject = new Subject()
  public formId: string
  public formSchema: any
  public formData: any
  public formSubmitButtonLabel: string
  public formCancelButtonLabel: string
  public formValid = true
  public formUpdatedSubject = new Subject()
  public formActionSubject = new Subject()
  public childBridges: any[] = []
  public isFirstSave = false

  private io: IoNamespace
  private basePath: string
  private iframe: HTMLIFrameElement
  private schemaFormRecentlyUpdated = false
  private schemaFormRecentlyRefreshed = false
  private schemaFormRefreshSubject = new Subject()

  constructor(
    public $activeModal: NgbActiveModal,
    private $api: ApiService,
    private $modal: NgbModal,
    private $plugin: ManagePluginsService,
    private $settings: SettingsService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
    private $ws: WsService,
  ) {}

  ngOnInit(): void {
    this.io = this.$ws.connectToNamespace('plugins/settings-ui')
    this.pluginAlias = this.schema.pluginAlias
    this.pluginType = this.schema.pluginType

    if (this.pluginConfig.length === 0) {
      this.isFirstSave = true
    }

    // start accessory subscription
    if (this.io.connected) {
      this.io.socket.emit('start', this.plugin.name)
      setTimeout(() => {
        this.io.connected.subscribe(() => {
          this.io.socket.emit('start', this.plugin.name)
        })
      }, 1000)
    } else {
      this.io.connected.subscribe(() => {
        this.io.socket.emit('start', this.plugin.name)
      })
    }

    this.io.socket.on('response', (data) => {
      data.action = 'response'
      this.iframe.contentWindow.postMessage(data, environment.api.origin)
    })

    this.io.socket.on('stream', (data) => {
      data.action = 'stream'
      this.iframe.contentWindow.postMessage(data, environment.api.origin)
    })

    this.io.socket.on('ready', () => {
      this.loading = false
      this.loadUi()
    })

    this.schemaFormRefreshSubject.pipe(
      debounceTime(250),
    ).subscribe(this.schemaFormRefresh.bind(this))

    this.schemaFormUpdatedSubject.pipe(
      debounceTime(250),
      skip(1),
    ).subscribe(this.schemaFormUpdated.bind(this))

    this.formUpdatedSubject.pipe(
      debounceTime(100),
      skip(1),
    ).subscribe(this.formUpdated.bind(this))

    this.formActionSubject.subscribe(this.formActionEvent.bind(this))

    this.basePath = `/plugins/settings-ui/${encodeURIComponent(this.plugin.name)}`

    window.addEventListener('message', this.handleMessage, false)
  }

  loadUi() {
    this.iframe = this.customPluginUiElementTarget.nativeElement as HTMLIFrameElement
    this.iframe.src = `${environment.api.base + this.basePath
    }/index.html?origin=${encodeURIComponent(location.origin)}&v=${encodeURIComponent(this.plugin.installedVersion)}`
  }

  handleMessage = (e: MessageEvent) => {
    if (e.origin === environment.api.origin || e.origin === window.origin) {
      switch (e.data.action) {
        case 'loaded':
          this.injectDefaultStyles(e)
          this.confirmReady(e)
          break
        case 'request': {
          this.handleRequest(e)
          break
        }
        case 'scrollHeight':
          this.setiFrameHeight(e)
          this.uiLoaded = true
          break
        case 'config.get': {
          this.requestResponse(e, this.getConfigBlocks())
          break
        }
        case 'config.save': {
          this.requestResponse(e, this.savePluginConfig())
          break
        }
        case 'config.update': {
          this.handleUpdateConfig(e, e.data.pluginConfig)
          break
        }
        case 'config.schema': {
          this.requestResponse(e, this.schema)
          break
        }
        case 'cachedAccessories.get': {
          this.handleGetCachedAccessories(e)
          break
        }
        case 'schema.show': {
          this.formEnd() // do not show other forms at the same time
          this.showSchemaForm = true
          break
        }
        case 'schema.hide': {
          this.showSchemaForm = false
          break
        }
        case 'form.create': {
          this.showSchemaForm = false // hide the schema generated form
          this.formCreate(e.data.formId, e.data.schema, e.data.data, e.data.submitButton, e.data.cancelButton)
          break
        }
        case 'form.end': {
          this.formEnd()
          break
        }
        case 'i18n.lang': {
          this.requestResponse(e, this.$translate.currentLang)
          break
        }
        case 'i18n.translations': {
          this.requestResponse(e, this.$translate.store.translations[this.$translate.currentLang])
          break
        }
        case 'close': {
          this.$activeModal.close()
          break
        }
        case 'toast.success':
          this.$toastr.success(e.data.message, e.data.title)
          break
        case 'toast.error':
          this.$toastr.error(e.data.message, e.data.title)
          break
        case 'toast.warning':
          this.$toastr.warning(e.data.message, e.data.title)
          break
        case 'toast.info':
          this.$toastr.info(e.data.message, e.data.title)
          break
        case 'spinner.show':
          this.pluginSpinner = true
          break
        case 'spinner.hide':
          this.pluginSpinner = false
          break
        default:
          console.log(e) // eslint-disable-line no-console
      }
    }
  }

  confirmReady(event) {
    event.source.postMessage({ action: 'ready' }, event.origin)
  }

  setiFrameHeight(event: MessageEvent) {
    this.iframe.style.height = `${(event.data.scrollHeight) + 10}px`
  }

  handleRequest(event: MessageEvent) {
    this.io.socket.emit('request', event.data)
  }

  handleUpdateConfig(event: MessageEvent, pluginConfig: Array<any>) {
    // refresh the schema form
    this.schemaFormRefreshSubject.next(undefined)

    // ensure the update contains an array
    if (!Array.isArray(pluginConfig)) {
      this.$toastr.error(this.$translate.instant('plugins.config.must_be_array'), this.$translate.instant('toast.title_error'))
      return this.requestResponse(event, { message: this.$translate.instant('plugins.config.must_be_array') }, false)
    }

    // validate each block in the array
    for (const block of pluginConfig) {
      if (typeof block !== 'object' || Array.isArray(block)) {
        this.$toastr.error(this.$translate.instant('plugins.config.must_be_array_objects'), this.$translate.instant('toast.title_error'))
        return this.requestResponse(event, { message: this.$translate.instant('plugins.config.must_be_array_objects') }, false)
      }
    }

    this.updateConfigBlocks(pluginConfig)
    return this.requestResponse(event, this.getConfigBlocks())
  }

  requestResponse(event, data, success = true) {
    event.source.postMessage({
      action: 'response',
      requestId: event.data.requestId,
      success,
      data,
    }, event.origin)
  }

  async injectDefaultStyles(event) {
    // fetch current theme
    const currentTheme = Array.from(window.document.body.classList).find(x => x.startsWith('config-ui-x-'))
    const darkMode = window.document.body.classList.contains('dark-mode')

    // set body class
    event.source.postMessage({ action: 'body-class', class: currentTheme }, event.origin)
    if (darkMode) {
      event.source.postMessage({ action: 'body-class', class: 'dark-mode' }, event.origin)
    }

    // use parent's linked style sheets
    const externalCss = Array.from(document.querySelectorAll('link'))
    for (const css of externalCss) {
      if (css.getAttribute('rel') === 'stylesheet') {
        const srcHref = css.getAttribute('href')
        const href = document.baseURI + (srcHref.startsWith('/') ? srcHref.substring(1) : srcHref)
        event.source.postMessage({ action: 'link-element', href, rel: 'stylesheet' }, event.origin)
      }
    }

    // use parent's inline css
    const inlineCss = Array.from(document.querySelectorAll('style'))
    for (const css of inlineCss) {
      event.source.postMessage({ action: 'inline-style', style: css.innerHTML }, event.origin)
    }

    // add custom css
    const customStyles = `
      body {
        height: unset !important;
        background-color: ${darkMode ? '#242424' : '#FFFFFF'} !important;
        color: ${darkMode ? '#FFFFFF' : '#000000'};
        padding: 5px !important;
      }
    `
    event.source.postMessage({ action: 'inline-style', style: customStyles }, event.origin)
  }

  getConfigBlocks(): Array<any> {
    return this.pluginConfig
  }

  updateConfigBlocks(pluginConfig: Record<string, any>[]) {
    for (const block of pluginConfig) {
      block[this.pluginType] = this.pluginAlias
    }
    this.pluginConfig = pluginConfig
  }

  /**
   * Called when changes are made to the schema form content
   * These changes are emitted to the custom ui
   */
  schemaFormUpdated() {
    if (!this.iframe || !this.iframe.contentWindow) {
      return
    }

    if (this.schemaFormRecentlyRefreshed) {
      this.schemaFormRecentlyRefreshed = false
      return
    }

    this.schemaFormRecentlyUpdated = true

    this.iframe.contentWindow.postMessage({
      action: 'stream',
      event: 'configChanged',
      data: this.pluginConfig,
    }, environment.api.origin)
  }

  /**
   * Called when changes sent from the custom ui config
   * Updates the schema form with the new values
   */
  schemaFormRefresh() {
    if (this.schemaFormRecentlyUpdated) {
      this.schemaFormRecentlyUpdated = false
      return
    }

    this.schemaFormRecentlyRefreshed = true

    if (this.showSchemaForm) {
      this.showSchemaForm = false
      setTimeout(() => {
        this.showSchemaForm = true
      })
    }
  }

  /**
   * Create a new other-form
   */
  async formCreate(formId: string, schema, data, submitButton?: string, cancelButton?: string) {
    // need to clear out existing forms
    await this.formEnd()

    this.formId = formId
    this.formSchema = schema
    this.formData = data
    this.formSubmitButtonLabel = submitButton
    this.formCancelButtonLabel = cancelButton
  }

  /**
   * Removes the current other-form
   */
  async formEnd() {
    if (this.formId) {
      this.formId = undefined
      this.formSchema = undefined
      this.formData = undefined
      this.formSubmitButtonLabel = undefined
      this.formCancelButtonLabel = undefined
      await new Promise(resolve => setTimeout(resolve))
    }
  }

  /**
   * Called when an other-form type is updated
   */
  formUpdated(data) {
    this.iframe.contentWindow.postMessage({
      action: 'stream',
      event: this.formId,
      data: {
        formEvent: 'change',
        formData: data,
      },
    }, environment.api.origin)
  }

  /**
   * Fired when the form changes with a boolean indicating if the form is valid
   */
  formValidEvent(isValid: boolean) {
    this.formValid = isValid
  }

  /**
   * Fired when a custom form is cancelled or submitted
   *
   * @param formEvent
   */
  formActionEvent(formEvent: 'cancel' | 'submit') {
    this.iframe.contentWindow.postMessage({
      action: 'stream',
      event: this.formId,
      data: {
        formEvent,
        formData: this.formData,
      },
    }, environment.api.origin)
  }

  /**
   * Handle the event to get a list of cached accessories
   */
  async handleGetCachedAccessories(event) {
    const cachedAccessories = await firstValueFrom(this.$api.get('/server/cached-accessories'))
    return this.requestResponse(event, cachedAccessories.filter(x => x.plugin === this.plugin.name))
  }

  async savePluginConfig(exit = false): Promise<void> {
    this.saveInProgress = true
    try {
      const newConfig = await firstValueFrom(this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, this.pluginConfig))
      this.saveInProgress = false
      if (exit) {
        // Possible child bridge setup recommendation if the plugin is not Homebridge UI
        // If it is the first time configuring the plugin, then offer to set up a child bridge straight away
        if (this.isFirstSave && this.$settings.env.recommendChildBridges && this.$settings.env.serviceMode && newConfig[0]?.platform) {
          // Close the modal and open the child bridge setup modal
          this.$activeModal.close()
          this.$plugin.bridgeSettings(this.plugin, true)
          return
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
      }
    } catch (error) {
      this.saveInProgress = false
      console.error(error)
      this.$toastr.error(this.$translate.instant('config.failed_to_save_config'), this.$translate.instant('toast.title_error'))
    }
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

  deletePluginConfig() {
    this.updateConfigBlocks([])
    this.savePluginConfig(true)
  }

  ngOnDestroy() {
    window.removeEventListener('message', this.handleMessage)
    this.io.end()
    this.schemaFormRefreshSubject.complete()
    this.schemaFormUpdatedSubject.complete()
    this.formUpdatedSubject.complete()
  }
}
