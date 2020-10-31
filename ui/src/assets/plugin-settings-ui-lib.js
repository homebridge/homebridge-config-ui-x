'use strict';

/**
 * This script is injected into a plugins custom settings ui.
 * It provides the interface to interact with the Homebridge UI service.
 */
class HomebridgeUiPluginHelper extends EventTarget {
  constructor() {
    super();

    this.toast = new HomebridgeUiToastHelper();
    this.origin = '';

    this.plugin = window._homebridge.plugin;
    this.serverEnv = window._homebridge.serverEnv;

    window.addEventListener('message', this._handleIncomingMessage.bind(this), false);
  }

  _handleIncomingMessage(e) {
    switch (e.data.action) {
      case 'ready': {
        this.origin = e.origin;
        document.body.style.display = 'block';
        this.dispatchEvent(new Event('ready'));
        this.fixScrollHeight();
        break;
      }
      case 'response': {
        this.dispatchEvent(new MessageEvent(e.data.requestId, {
          data: e.data,
        }));
        break;
      }
      case 'stream': {
        this.dispatchEvent(new MessageEvent(e.data.event, {
          data: e.data.data,
        }));
        break;
      }
      case 'body-class': {
        this._setBodyClass(e);
        break;
      }
      case 'inline-style': {
        this._setInlineStyle(e);
        break;
      }
      case 'link-element': {
        this._setLinkElement(e);
        break;
      }
      default:
        console.log(e.data);
    }
  }

  _postMessage(message) {
    window.parent.postMessage(message, this.origin || '*');
  }

  _setBodyClass(e) {
    document.body.classList.add(e.data.class);
  }

  _setInlineStyle(e) {
    const styleElement = document.createElement('style');
    styleElement.innerHTML = e.data.style;
    document.head.appendChild(styleElement);
  }

  _setLinkElement(e) {
    const linkElement = document.createElement('link');
    linkElement.setAttribute('href', e.data.href);
    linkElement.setAttribute('rel', e.data.rel);
    document.head.appendChild(linkElement);
  }

  async _requestResponse(payload) {
    // generate a random request id so we can link the response
    const requestId = Math.random().toString(36).substring(2);
    payload.requestId = requestId;

    // post message to parent
    this._postMessage(payload);

    // wait for response
    return new Promise((resolve, reject) => {
      const responseHandler = (event) => {
        this.removeEventListener(requestId, responseHandler);
        if (event.data.success) {
          resolve(event.data.data);
        } else {
          reject(event.data.data);
        }
      }

      this.addEventListener(requestId, responseHandler);
    });
  }

  fixScrollHeight() {
    this._postMessage({ action: 'scollHeight', scrollHeight: document.body.scrollHeight });
  }

  closeSettings() {
    this._postMessage({ action: 'close' });
  }

  showSchemaEditor() {
    this._postMessage({ action: 'schema.show' });
  }

  hideSchemaEditor() {
    this._postMessage({ action: 'schema.hide' });
  }

  async getPluginConfig() {
    return await this._requestResponse({ action: 'config.get' });
  }

  async updatePluginConfig(pluginConfig) {
    return await this._requestResponse({ action: 'config.update', pluginConfig: pluginConfig });
  }

  async savePluginConfig() {
    return await this._requestResponse({ action: 'config.save' });
  }

  async request(path, body) {
    return await this._requestResponse({ action: 'request', path: path, body: body });
  }

}

class HomebridgeUiToastHelper {
  _postMessage(type, message, title) {
    window.parent.postMessage({ action: 'toast.' + type, message: message, title: title }, '*');
  }

  success(message, title) {
    this._postMessage('success', message, title);
  }
  error(message, title) {
    this._postMessage('error', message, title);
  }
  warning(message, title) {
    this._postMessage('warning', message, title);
  }
  info(message, title) {
    this._postMessage('info', message, title);
  }
}

window.homebridge = new HomebridgeUiPluginHelper();
