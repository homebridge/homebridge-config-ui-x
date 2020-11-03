import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';

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
  @Input() homebridgeConfig;

  public pluginAlias: string;
  public pluginType: 'platform' | 'accessory';

  public loading = true;
  public saveInProgress = false;
  public pluginSpinner = false;

  private basePath: string;
  private iframe: HTMLIFrameElement;

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

    // ensure homebridge config has platform and accessories arrays
    if (!Array.isArray(this.homebridgeConfig.platforms)) {
      this.homebridgeConfig.platforms = [];
    }

    if (!Array.isArray(this.homebridgeConfig.accessories)) {
      this.homebridgeConfig.accessories = [];
    }

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
          this.requestResponse(e, this.saveHomebridgeConfig());
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
  }

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
    if (!Array.isArray(pluginConfig)) {
      return this.requestResponse(event, { message: 'Plugin config must be an array.' }, false);
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
    return this.homebridgeConfig[this.arrayKey].filter((block: any) => {
      return block[this.pluginType] === this.pluginAlias ||
        block[this.pluginType] === this.plugin.name + '.' + this.pluginAlias;
    });
  }

  updateConfigBlocks(pluginConfig: Array<any>) {
    this.homebridgeConfig[this.arrayKey] = this.homebridgeConfig[this.arrayKey].filter((block: any) => {
      return block[this.pluginType] !== this.pluginAlias &&
        block[this.pluginType] !== this.plugin.name + '.' + this.pluginAlias;
    });

    for (const block of pluginConfig) {
      block[this.pluginType] = this.pluginAlias;
    }
    this.homebridgeConfig[this.arrayKey].push(...pluginConfig);
  }

  async saveHomebridgeConfig(exit = false) {
    this.saveInProgress = true;
    return await this.$api.post('/config-editor', this.homebridgeConfig)
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
    this.saveHomebridgeConfig(true);
  }

  ngOnDestroy() {
    window.removeEventListener('message', this.handleMessage);
    this.io.end();
  }
}
