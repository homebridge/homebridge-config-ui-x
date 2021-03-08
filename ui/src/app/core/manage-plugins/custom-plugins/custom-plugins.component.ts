import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { debounceTime, skip } from 'rxjs/operators';

import { environment } from '@/environments/environment';
import { ApiService } from '@/app/core/api.service';
import { WsService } from '@/app/core/ws.service';
import { NotificationService } from '@/app/core/notification.service';

@Component({
  selector: 'app-custom-plugins',
  templateUrl: './custom-plugins.component.html',
  styleUrls: ['./custom-plugins.component.scss'],
})
export class CustomPluginsComponent implements OnInit, OnDestroy {
  private io = this.$ws.connectToNamespace('plugins/settings-ui');

  @ViewChild('custompluginui', { static: true }) customPluginUiElementTarget: ElementRef;

  @Input() plugin;
  @Input() schema;
  @Input() pluginConfig: Record<string, any>[];

  public pluginAlias: string;
  public pluginType: 'platform' | 'accessory';

  public loading = true;
  public saveInProgress = false;
  public pluginSpinner = false;

  private basePath: string;
  private iframe: HTMLIFrameElement;

  // main config schema forms
  public showSchemaForm = false;
  private schemaFormRecentlyUpdated = false;
  private schemaFormRecentlyRefreshed = false;
  private schemaFormRefreshSubject = new Subject();
  public schemaFormUpdatedSubject = new Subject();

  // other forms
  public formId;
  public formSchema;
  public formData;
  public formUpdatedSubject = new Subject();

  constructor(
    public activeModal: NgbActiveModal,
    private $translate: TranslateService,
    private $toastr: ToastrService,
    private $api: ApiService,
    private $ws: WsService,
    private $notification: NotificationService,
  ) { }

  ngOnInit(): void {
    this.pluginAlias = this.schema.pluginAlias;
    this.pluginType = this.schema.pluginType;

    // start accessory subscription
    if (this.io.connected) {
      this.io.socket.emit('start', this.plugin.name);
      setTimeout(() => {
        this.io.connected.subscribe(() => {
          this.io.socket.emit('start', this.plugin.name);
        });
      }, 1000);
    } else {
      this.io.connected.subscribe(() => {
        this.io.socket.emit('start', this.plugin.name);
      });
    }

    this.io.socket.on('response', (data) => {
      data.action = 'response';
      this.iframe.contentWindow.postMessage(data, environment.api.origin);
    });

    this.io.socket.on('stream', (data) => {
      data.action = 'stream';
      this.iframe.contentWindow.postMessage(data, environment.api.origin);
    });

    this.io.socket.on('ready', (data) => {
      this.loading = false;
      this.loadUi();
    });

    this.schemaFormRefreshSubject.pipe(
      debounceTime(250),
    ).subscribe(this.schemaFormRefresh.bind(this));

    this.schemaFormUpdatedSubject.pipe(
      debounceTime(250),
      skip(1),
    ).subscribe(this.schemaFormUpdated.bind(this));

    this.formUpdatedSubject.pipe(
      debounceTime(100),
      skip(1),
    ).subscribe(this.formUpdated.bind(this));

    this.basePath = `/plugins/settings-ui/${encodeURIComponent(this.plugin.name)}`;

    window.addEventListener('message', this.handleMessage, false);
  }

  get arrayKey() {
    return this.pluginType === 'accessory' ? 'accessories' : 'platforms';
  }

  loadUi() {
    this.iframe = this.customPluginUiElementTarget.nativeElement as HTMLIFrameElement;
    this.iframe.src = environment.api.base + this.basePath +
      '/index.html?origin=' + encodeURIComponent(location.origin) + '&v=' + encodeURIComponent(this.plugin.installedVersion);
  }

  handleMessage = (e: MessageEvent) => {
    if (e.origin === environment.api.origin || e.origin === window.origin) {
      switch (e.data.action) {
        case 'loaded':
          this.injectDefaultStyles(e);
          this.confirmReady(e);
          break;
        case 'request': {
          this.handleRequest(e);
          break;
        }
        case 'scrollHeight':
          this.setiFrameHeight(e);
          break;
        case 'config.get': {
          this.requestResponse(e, this.getConfigBlocks());
          break;
        }
        case 'config.save': {
          this.requestResponse(e, this.savePluginConfig());
          break;
        }
        case 'config.update': {
          this.handleUpdateConfig(e, e.data.pluginConfig);
          break;
        }
        case 'config.schema': {
          this.requestResponse(e, this.schema);
          break;
        }
        case 'cachedAccessories.get': {
          this.handleGetCachedAccessories(e);
          break;
        }
        case 'schema.show': {
          this.formEnd(); // do not show other forms at the same time
          this.showSchemaForm = true;
          break;
        }
        case 'schema.hide': {
          this.showSchemaForm = false;
          break;
        }
        case 'form.create': {
          this.showSchemaForm = false; // hide the schema generated form
          this.formCreate(e.data.formId, e.data.schema, e.data.data);
          break;
        }
        case 'form.end': {
          this.formEnd();
          break;
        }
        case 'i18n.lang': {
          this.requestResponse(e, this.$translate.currentLang);
          break;
        }
        case 'i18n.translations': {
          this.requestResponse(e, this.$translate.store.translations[this.$translate.currentLang]);
          break;
        }
        case 'close': {
          this.activeModal.close();
          break;
        }
        case 'toast.success':
          this.$toastr.success(e.data.message, e.data.title);
          break;
        case 'toast.error':
          this.$toastr.error(e.data.message, e.data.title);
          break;
        case 'toast.warning':
          this.$toastr.warning(e.data.message, e.data.title);
          break;
        case 'toast.info':
          this.$toastr.info(e.data.message, e.data.title);
          break;
        case 'spinner.show':
          this.pluginSpinner = true;
          break;
        case 'spinner.hide':
          this.pluginSpinner = false;
          break;
        default:
          console.log(e);
      }
    }
  };

  confirmReady(event) {
    event.source.postMessage({ action: 'ready' }, event.origin);
  }

  setiFrameHeight(event: MessageEvent) {
    this.iframe.style.height = (event.data.scrollHeight) + 10 + 'px';
  }

  handleRequest(event: MessageEvent) {
    this.io.socket.emit('request', event.data);
  }

  handleUpdateConfig(event: MessageEvent, pluginConfig: Array<any>) {
    // refresh the schema form
    this.schemaFormRefreshSubject.next();

    // ensure the update contains an array
    if (!Array.isArray(pluginConfig)) {
      this.$toastr.error('Plugin config must be an array.', 'Invalid Config Update');
      return this.requestResponse(event, { message: 'Plugin config must be an array.' }, false);
    }

    // validate each block in the array
    for (const block of pluginConfig) {
      if (typeof block !== 'object' || Array.isArray(block)) {
        this.$toastr.error('Plugin config must be an array of objects.', 'Invalid Config Update');
        return this.requestResponse(event, { message: 'Plugin config must be an array of objects.' }, false);
      }
    }

    this.updateConfigBlocks(pluginConfig);
    return this.requestResponse(event, this.getConfigBlocks());
  }

  requestResponse(event, data, success = true) {
    event.source.postMessage({
      action: 'response',
      requestId: event.data.requestId,
      success,
      data,
    }, event.origin);
  }

  async injectDefaultStyles(event) {
    // fetch current theme
    const currentTheme = Array.from(window.document.body.classList).find(x => x.startsWith('config-ui-x-'));
    const darkMode = window.document.body.classList.contains('dark-mode');

    // set body class
    event.source.postMessage({ action: 'body-class', class: currentTheme }, event.origin);
    if (darkMode) {
      event.source.postMessage({ action: 'body-class', class: 'dark-mode' }, event.origin);
    }

    // use parent's linked style sheets
    const externalCss = Array.from(document.querySelectorAll('link'));
    for (const css of externalCss) {
      if (css.getAttribute('rel') === 'stylesheet') {
        const srcHref = css.getAttribute('href');
        const href = document.baseURI + (srcHref.startsWith('/') ? srcHref.substr(1) : srcHref);
        event.source.postMessage({ action: 'link-element', href, rel: 'stylesheet' }, event.origin);
      }
    }

    // use parent's inline css
    const inlineCss = Array.from(document.querySelectorAll('style'));
    for (const css of inlineCss) {
      event.source.postMessage({ action: 'inline-style', style: css.innerHTML }, event.origin);
    }

    // add custom css
    const customStyles = `
      body {
        height: unset !important;
        background-color: ${darkMode ? '#242424' : '#FFFFFF'} !important;
        color: ${darkMode ? '#FFFFFF' : '#000000'};
        padding: 5px !important;
      }
    `;
    event.source.postMessage({ action: 'inline-style', style: customStyles }, event.origin);
  }

  getConfigBlocks(): Array<any> {
    return this.pluginConfig;
  }

  updateConfigBlocks(pluginConfig: Record<string, any>[]) {
    for (const block of pluginConfig) {
      block[this.pluginType] = this.pluginAlias;
    }
    this.pluginConfig = pluginConfig;
  }

  /**
   * Called when changes are made to the schema form content
   * These changes are emitted to the custom ui
   */
  schemaFormUpdated() {
    if (!this.iframe || !this.iframe.contentWindow) {
      return;
    }

    if (this.schemaFormRecentlyRefreshed) {
      this.schemaFormRecentlyRefreshed = false;
      return;
    }

    this.schemaFormRecentlyUpdated = true;

    this.iframe.contentWindow.postMessage({
      action: 'stream',
      event: 'configChanged',
      data: this.pluginConfig,
    }, environment.api.origin);
  }

  /**
   * Called when changes sent from the custom ui config
   * Updates the schema form with the new values
   */
  schemaFormRefresh() {
    if (this.schemaFormRecentlyUpdated) {
      this.schemaFormRecentlyUpdated = false;
      return;
    }

    this.schemaFormRecentlyRefreshed = true;

    if (this.showSchemaForm) {
      this.showSchemaForm = false;
      setTimeout(() => {
        this.showSchemaForm = true;
      });
    }
  }

  /**
   * Create a new other-form
   */
  async formCreate(formId: string, schema, data) {
    // need to clear out existing forms
    await this.formEnd();

    this.formId = formId;
    this.formSchema = schema;
    this.formData = data;
  }

  /**
   * Removes the current other-form
   */
  async formEnd() {
    if (this.formId) {
      this.formId = undefined;
      this.formSchema = undefined;
      this.formData = undefined;
      await new Promise((resolve) => setTimeout(resolve));
    }
  }

  /**
   * Called when a other-form type is updated
   */
  formUpdated(data) {
    this.iframe.contentWindow.postMessage({
      action: 'stream',
      event: this.formId,
      data,
    }, environment.api.origin);
  }

  /**
   * Handle the event to get a list of cached accessories
   */
  async handleGetCachedAccessories(event) {
    const cachedAccessories = await this.$api.get('/server/cached-accessories').toPromise();
    return this.requestResponse(event, cachedAccessories.filter(x => x.plugin === this.plugin.name));
  }

  async savePluginConfig(exit = false) {
    this.saveInProgress = true;
    return await this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, this.pluginConfig)
      .toPromise()
      .then(data => {
        this.$toastr.success(
          this.$translate.instant('plugins.settings.toast_restart_required'),
          this.$translate.instant('plugins.settings.toast_plugin_config_saved'),
        );

        this.saveInProgress = false;
        this.$notification.configUpdated.next();

        if (exit) {
          this.activeModal.close();
        }
      })
      .catch(err => {
        this.saveInProgress = false;
        this.$toastr.error(this.$translate.instant('config.toast_failed_to_save_config'), this.$translate.instant('toast.title_error'));
      });
  }

  deletePluginConfig() {
    this.updateConfigBlocks([]);
    this.savePluginConfig(true);
  }

  ngOnDestroy() {
    window.removeEventListener('message', this.handleMessage);
    this.io.end();
    this.schemaFormRefreshSubject.complete();
    this.schemaFormUpdatedSubject.complete();
    this.formUpdatedSubject.complete();
  }
}
