import { ChangeDetectionStrategy, Component, ElementRef, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { Bootstrap5FrameworkModule } from '@ng-formworks/bootstrap5'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { Subject, takeUntil } from 'rxjs'
import { debounceTime, skip } from 'rxjs/operators'

import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { SchemaFormComponent } from '@/app/core/components/schema-form/schema-form.component'
import { CUSTOM_PLUGINS_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { ChildBridgesService } from '@/app/core/utilities/child-bridges.service'
import { environment } from '@/environments/environment'

@Component({
  selector: 'app-custom-plugins',
  imports: [
    SchemaFormComponent,
    Bootstrap5FrameworkModule,
    NgbTooltip,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './custom-plugins.component.html',
  styleUrl: './custom-plugins.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomPluginsComponent implements OnInit, OnDestroy {
  // 1. Injected Dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $cb = inject(ChildBridgesService)
  private $plugin = inject(ManagePluginsService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private modalData = inject(CUSTOM_PLUGINS_MODAL_DATA)

  // 2. ViewChild queries
  readonly customPluginUiElementTarget = viewChild<ElementRef>('custompluginui')

  // 3. Public properties (from injected data)
  public plugin = this.modalData.plugin
  public schema = this.modalData.schema
  public pluginConfig: Record<string, unknown>[] = this.modalData.pluginConfig ?? []

  // 4. Other Signals
  public readonly pluginAlias = signal<string>('')
  public readonly pluginType = signal<'platform' | 'accessory'>('platform')
  public readonly loading = signal(true)
  public readonly saveInProgress = signal(false)
  public readonly pluginSpinner = signal(false)
  public readonly saveButtonDisabled = signal(false)
  public readonly uiLoaded = signal(false)
  public readonly showSchemaForm = signal(false)
  public readonly formId = signal<string | undefined>(undefined)
  public readonly formSchema = signal<unknown>(undefined)
  public readonly formData = signal<unknown>(undefined)
  public readonly formSubmitButtonLabel = signal<string | undefined>(undefined)
  public readonly formCancelButtonLabel = signal<string | undefined>(undefined)
  public readonly formValid = signal(true)
  public readonly isFirstSave = signal(false)
  public readonly formIsValid = signal(true)
  public readonly strictValidation = signal(false)

  // 5. Other Properties
  private io!: IoNamespace
  private basePath = ''
  private iframe!: HTMLIFrameElement
  private schemaFormRecentlyRefreshed = false
  private destroy$ = new Subject<void>()
  public schemaFormUpdatedSubject = new Subject<unknown>()
  private schemaFormRefreshSubject = new Subject<unknown>()
  public formUpdatedSubject = new Subject<unknown>()
  public formActionSubject = new Subject<'cancel' | 'submit'>()

  // 6. Lifecycle Hooks
  public ngOnInit(): void {
    const schema = this.schema
    const plugin = this.plugin

    if (!schema || !plugin) {
      console.error('CustomPluginsComponent: schema or plugin not provided')
      this.$activeModal.dismiss('Missing required data')
      return
    }

    this.pluginAlias.set(schema.pluginAlias)
    this.pluginType.set(schema.pluginType)
    this.strictValidation.set(schema.strictValidation)

    if (this.pluginConfig.length === 0) {
      this.isFirstSave.set(true)
    }

    this.io = this.$ws.connectToNamespace('plugins/settings-ui')
    this.basePath = `/plugins/settings-ui/${encodeURIComponent(plugin.name)}`

    void this.initialize()

    // Set up subscriptions with proper cleanup
    this.schemaFormRefreshSubject
      .pipe(debounceTime(250), takeUntil(this.destroy$))
      .subscribe(this.schemaFormRefresh.bind(this))

    this.schemaFormUpdatedSubject
      .pipe(debounceTime(250), skip(1), takeUntil(this.destroy$))
      .subscribe(() => {
        this.schemaFormUpdated()
      })

    this.formUpdatedSubject
      .pipe(debounceTime(100), skip(1), takeUntil(this.destroy$))
      .subscribe(this.formUpdated.bind(this))

    this.formActionSubject
      .pipe(takeUntil(this.destroy$))
      .subscribe(this.formActionEvent.bind(this))

    window.addEventListener('message', this.handleMessage, false)
  }

  public ngOnDestroy(): void {
    window.removeEventListener('message', this.handleMessage)

    this.destroy$.next()
    this.destroy$.complete()

    if (this.io) {
      this.io.end()
    }

    this.schemaFormRefreshSubject.complete()
    this.schemaFormUpdatedSubject.complete()
    this.formUpdatedSubject.complete()
    this.formActionSubject.complete()
  }

  // 7. Public Methods
  public onIsValid($event: boolean): void {
    this.formIsValid.set($event)
  }

  /**
   * Fired when the form changes with a boolean indicating if the form is valid
   */
  public formValidEvent(isValid: boolean): void {
    this.formValid.set(isValid)
  }

  public async savePluginConfig(exit = false): Promise<void> {
    const plugin = this.plugin
    if (!plugin) {
      return
    }

    this.saveInProgress.set(true)
    try {
      const newConfig = await this.$api.post(`/config-editor/plugin/${encodeURIComponent(plugin.name)}`, this.pluginConfig)
      this.saveInProgress.set(false)

      if (exit) {
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
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('config.failed_to_save_config'), this.$translate.instant('toast.title_error'))
      this.saveInProgress.set(false)
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  // 8. Private Methods
  private async initialize(): Promise<void> {
    const plugin = this.plugin
    if (!plugin) {
      return
    }

    this.io.socket.emit('start', plugin.name)

    this.io.socket.on('response', (data) => {
      data.action = 'response'
      this.iframe.contentWindow.postMessage(data, environment.api.origin)
    })

    this.io.socket.on('stream', (data) => {
      data.action = 'stream'
      this.iframe.contentWindow.postMessage(data, environment.api.origin)
    })

    this.io.socket.on('ready', () => {
      this.loading.set(false)
      this.loadUi()
    })
  }

  private loadUi(): void {
    const plugin = this.plugin
    if (!plugin) {
      return
    }

    this.iframe = this.customPluginUiElementTarget()?.nativeElement as HTMLIFrameElement
    if (!this.iframe) {
      return
    }

    this.iframe.src = `${environment.api.base + this.basePath}/index.html?origin=${encodeURIComponent(location.origin)}&v=${encodeURIComponent(plugin.installedVersion)}`
  }

  private handleMessage = (e: MessageEvent): void => {
    if (e.origin === environment.api.origin || e.origin === window.origin) {
      switch (e.data.action) {
        case 'loaded':
          void this.injectDefaultStyles(e)
          this.confirmReady(e)
          break
        case 'request': {
          this.handleRequest(e)
          break
        }
        case 'scrollHeight':
          this.setiFrameHeight(e)
          this.uiLoaded.set(true)
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
          void this.handleGetCachedAccessories(e)
          break
        }
        case 'cachedMatterAccessories.get': {
          void this.handleGetCachedMatterAccessories(e)
          break
        }
        case 'schema.show': {
          void this.formEnd() // do not show other forms at the same time
          this.showSchemaForm.set(true)
          break
        }
        case 'schema.hide': {
          this.showSchemaForm.set(false)
          break
        }
        case 'form.create': {
          this.showSchemaForm.set(false) // hide the schema generated form
          void this.formCreate(e.data.formId, e.data.schema, e.data.data, e.data.submitButton, e.data.cancelButton)
          break
        }
        case 'form.end': {
          void this.formEnd()
          break
        }
        case 'user.lightingMode': {
          this.requestResponse(e, this.$settings.actualLightingMode)
          break
        }
        case 'i18n.lang': {
          this.requestResponse(e, this.$translate.getCurrentLang())
          break
        }
        case 'i18n.translations': {
          // eslint-disable-next-line ts/no-require-imports
          this.requestResponse(e, require(`../../../../i18n/${this.$translate.getCurrentLang()}.json`))
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
          this.pluginSpinner.set(true)
          break
        case 'spinner.hide':
          this.pluginSpinner.set(false)
          break
        case 'button.save.disabled':
          this.saveButtonDisabled.set(true)
          break
        case 'button.save.enabled':
          this.saveButtonDisabled.set(false)
          break
      }
    }
  }

  private confirmReady(event: MessageEvent): void {
    (event.source as Window).postMessage({ action: 'ready' }, event.origin)
  }

  private setiFrameHeight(event: MessageEvent): void {
    this.iframe.style.height = `${(event.data.scrollHeight) + 10}px`
  }

  private handleRequest(event: MessageEvent): void {
    this.io.socket.emit('request', event.data)
  }

  private handleUpdateConfig(event: MessageEvent, pluginConfig: Array<Record<string, unknown>>): void {
    // Ensure the update contains an array
    if (!Array.isArray(pluginConfig)) {
      this.$toastr.error(this.$translate.instant('plugins.config.must_be_array'), this.$translate.instant('toast.title_error'))
      return this.requestResponse(event, { message: this.$translate.instant('plugins.config.must_be_array') }, false)
    }

    // Validate each block in the array
    for (const block of pluginConfig) {
      if (typeof block !== 'object' || Array.isArray(block)) {
        this.$toastr.error(this.$translate.instant('plugins.config.must_be_array_objects'), this.$translate.instant('toast.title_error'))
        return this.requestResponse(event, { message: this.$translate.instant('plugins.config.must_be_array_objects') }, false)
      }
    }

    // Always apply the update, then only refresh the schema form if data actually changed
    const before = JSON.stringify(this.pluginConfig)
    this.updateConfigBlocks(pluginConfig)
    const after = JSON.stringify(this.pluginConfig)

    if (this.showSchemaForm() && before !== after) {
      this.schemaFormRefreshSubject.next(undefined)
    }

    return this.requestResponse(event, this.getConfigBlocks())
  }

  private requestResponse(event: MessageEvent, data: unknown, success = true): void {
    (event.source as Window).postMessage({
      action: 'response',
      requestId: event.data.requestId,
      success,
      data,
    }, event.origin)
  }

  private async injectDefaultStyles(event: MessageEvent): Promise<void> {
    // Fetch current theme
    const currentTheme = Array.from(window.document.body.classList).find(x => x.startsWith('config-ui-x-'))
    const darkMode = window.document.body.classList.contains('dark-mode')

    const sourceWindow = event.source as Window

    // Set body class
    sourceWindow.postMessage({ action: 'body-class', class: currentTheme }, event.origin)
    sourceWindow.postMessage({ action: 'body-class', class: 'modal-content' }, event.origin)
    if (darkMode) {
      sourceWindow.postMessage({ action: 'body-class', class: 'dark-mode' }, event.origin)
    }

    // Use parent's linked style sheets
    const externalCss = Array.from(document.querySelectorAll('link'))
    for (const css of externalCss) {
      if (css.getAttribute('rel') === 'stylesheet') {
        const srcHref = css.getAttribute('href')
        const href = document.baseURI + (srcHref.startsWith('/') ? srcHref.substring(1) : srcHref)
        sourceWindow.postMessage({ action: 'link-element', href, rel: 'stylesheet' }, event.origin)
      }
    }

    // Use parent's inline css
    const inlineCss = Array.from(document.querySelectorAll('style'))
    for (const css of inlineCss) {
      sourceWindow.postMessage({ action: 'inline-style', style: css.innerHTML }, event.origin)
    }

    // Add custom CSS
    const customStyles = `
      body {
        height: unset !important;
        background-color: ${darkMode ? '#242424' : '#FFFFFF'} !important;
        color: ${darkMode ? '#FFFFFF' : '#000000'} !important;
      }
    `
    sourceWindow.postMessage({ action: 'inline-style', style: customStyles }, event.origin)
  }

  private getConfigBlocks(): Array<Record<string, unknown>> {
    return this.pluginConfig
  }

  private updateConfigBlocks(pluginConfig: Record<string, unknown>[]): void {
    // Update blocks in-place to avoid triggering change detection
    // Do NOT reassign the array - that would create a new reference and reset the form
    for (let i = 0; i < pluginConfig.length; i++) {
      const block = pluginConfig[i]
      block[this.pluginType()] = this.pluginAlias()

      // Update existing array element in-place
      if (this.pluginConfig[i]) {
        Object.assign(this.pluginConfig[i], block)
      } else {
        this.pluginConfig[i] = block
      }
    }

    // Remove any extra blocks that no longer exist
    if (this.pluginConfig.length > pluginConfig.length) {
      this.pluginConfig.length = pluginConfig.length
    }
  }

  /**
   * Called when changes are made to the schema form content
   * These changes are emitted to the custom ui
   */
  private schemaFormUpdated(): void {
    if (!this.iframe || !this.iframe.contentWindow) {
      return
    }

    if (this.schemaFormRecentlyRefreshed) {
      this.schemaFormRecentlyRefreshed = false
      return
    }

    // No need to update pluginConfig - two-way binding handles it in-place
    // Just notify the iframe about the change
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
  private schemaFormRefresh(): void {
    this.schemaFormRecentlyRefreshed = true

    if (this.showSchemaForm()) {
      // Toggle the form to refresh it
      this.showSchemaForm.set(false)

      // Use a microtask to re-enable on the next tick
      queueMicrotask(() => {
        this.showSchemaForm.set(true)
      })
    }
  }

  /**
   * Create a new other-form
   */
  private async formCreate(formId: string, schema: unknown, data: unknown, submitButton?: string, cancelButton?: string): Promise<void> {
    // Need to clear out existing forms
    await this.formEnd()

    this.formId.set(formId)
    this.formSchema.set(schema)
    this.formData.set(data)
    this.formSubmitButtonLabel.set(submitButton)
    this.formCancelButtonLabel.set(cancelButton)
  }

  /**
   * Removes the current other-form
   */
  private async formEnd(): Promise<void> {
    if (this.formId()) {
      this.formId.set(undefined)
      this.formSchema.set(undefined)
      this.formData.set(undefined)
      this.formSubmitButtonLabel.set(undefined)
      this.formCancelButtonLabel.set(undefined)
      await new Promise(resolve => setTimeout(resolve))
    }
  }

  /**
   * Called when an other-form type is updated
   */
  private formUpdated(data: unknown): void {
    this.iframe.contentWindow.postMessage({
      action: 'stream',
      event: this.formId(),
      data: {
        formEvent: 'change',
        formData: data,
      },
    }, environment.api.origin)
  }

  /**
   * Fired when a custom form is canceled or submitted
   */
  private formActionEvent(formEvent: 'cancel' | 'submit'): void {
    this.iframe.contentWindow.postMessage({
      action: 'stream',
      event: this.formId(),
      data: {
        formEvent,
        formData: this.formData(),
      },
    }, environment.api.origin)
  }

  /**
   * Handle the event to get a list of cached accessories
   */
  private async handleGetCachedAccessories(event: MessageEvent): Promise<void> {
    const plugin = this.plugin
    if (!plugin) {
      return
    }

    try {
      const cachedAccessories = await this.$api.get('/server/cached-accessories')
      return this.requestResponse(event, cachedAccessories.filter(x => (x as { plugin: string }).plugin === plugin.name))
    } catch (error) {
      console.error('Failed to get cached accessories:', error)
      this.$toastr.error(this.$translate.instant('toast.title_error'))
    }
  }

  /**
   * Handle the event to get a list of cached Matter accessories
   */
  private async handleGetCachedMatterAccessories(event: MessageEvent): Promise<void> {
    const plugin = this.plugin
    if (!plugin) {
      return
    }

    try {
      const cachedMatterAccessories = await this.$api.get('/server/matter-accessories')
      return this.requestResponse(event, cachedMatterAccessories.filter(x => (x as { plugin: string }).plugin === plugin.name))
    } catch (error) {
      console.error('Failed to get cached Matter accessories:', error)
      this.$toastr.error(this.$translate.instant('toast.title_error'))
    }
  }
}
