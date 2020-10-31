
import * as path from 'path';
import * as fs from 'fs-extra';
import * as NodeCache from 'node-cache';
import * as child_process from 'child_process';
import { Injectable, NotFoundException } from '@nestjs/common';

import { Logger } from '../../../core/logger/logger.service';
import { ConfigService } from '../../../core/config/config.service';
import { PluginsService } from '../../plugins/plugins.service';
import { HomebridgePluginUiMetadata } from '../../plugins/types';
import { EventEmitter } from 'events';

@Injectable()
export class PluginsSettingsUiService {
  private pluginUiMetadataCache = new NodeCache({ stdTTL: 86400 });

  constructor(
    private loggerService: Logger,
    private pluginsService: PluginsService,
    private configService: ConfigService,
  ) { }

  /**
   * Serve Custom HTML Assets for a plugin
   */
  async serveCustomUiAsset(res, pluginName: string, assetPath: string, origin: string) {
    try {
      if (!assetPath) {
        assetPath = 'index.html';
      }

      const pluginUi: HomebridgePluginUiMetadata = (this.pluginUiMetadataCache.get(pluginName) as any)
        || (await this.getPluginUiMetadata(pluginName));

      const safeSuffix = path.normalize(assetPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const filePath = path.join(pluginUi.publicPath, safeSuffix);

      if (!filePath.startsWith(path.resolve(pluginUi.publicPath))) {
        throw new NotFoundException();
      }

      // this will severely limit the ability for this page to do anything if loaded outside of the UI
      res.header('Content-Security-Policy', '');

      if (assetPath === 'index.html') {
        return res
          .type('text/html')
          .send(await this.buildIndexHtml(pluginUi, origin));
      }

      if (await fs.pathExists(filePath)) {
        return res.sendFile(path.basename(filePath), path.dirname(filePath));
      } else {
        this.loggerService.warn('Asset Not Found:', pluginName + '/' + assetPath);
        throw new NotFoundException();
      }
    } catch (e) {
      console.log(e);
    }
  }

  /**
   * Resolve the path for the custom plugin ui, and store it in the cache
   */
  async getPluginUiMetadata(pluginName: string): Promise<HomebridgePluginUiMetadata> {
    try {
      const pluginUi = await this.pluginsService.getPluginUiMetadata(pluginName);
      this.pluginUiMetadataCache.set(pluginName, pluginUi);
      return pluginUi;
    } catch (e) {
      this.loggerService.warn('Plugin Custom UI Not Found:', pluginName);
      throw new NotFoundException();
    }
  }

  /**
   * Build the entrypoint html file for the plugin custom ui
   */
  async buildIndexHtml(pluginUi: HomebridgePluginUiMetadata, origin: string) {
    const body = await fs.readFile(path.join(pluginUi.publicPath, 'index.html'), 'utf8');

    const htmlDocument = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${pluginUi.plugin.name}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <script>
          window._homebridge = {
            plugin: ${JSON.stringify(pluginUi.plugin)},
            serverEnv: ${JSON.stringify(this.configService.uiSettings())},
          };
          </script>
          <script src="${origin || 'http://localhost:4200'}/assets/plugin-settings-ui-lib.js"></script>
          <script>
            window.addEventListener('load', () => {
              window.parent.postMessage({action: 'loaded'}, '*');
            }, false)
          </script>
        </head>
        <body style="display:none;">
          ${body}
        </body>
      </html>
    `;

    return htmlDocument;
  }

  /**
   * Starts the custom ui server-side handler
   */
  async startCustomUiHandler(pluginName: string, client: EventEmitter) {
    const pluginUi: HomebridgePluginUiMetadata = (this.pluginUiMetadataCache.get(pluginName) as any)
      || (await this.getPluginUiMetadata(pluginName));

    if (!await fs.pathExists(path.resolve(pluginUi.serverPath))) {
      client.emit('ready', { server: false });
      return;
    }

    const child = child_process.fork(pluginUi.serverPath, [], {
      silent: true,
    });

    const cleanup = () => {
      this.loggerService.log(`[${pluginName}]`, 'Terminating child process...');

      const childPid = child.pid;
      if (child.connected) {
        child.disconnect();
      }
      setTimeout(() => {
        try {
          process.kill(childPid, 'SIGTERM');
        } catch (e) { }
      }, 5000);

      client.removeAllListeners('end');
      client.removeAllListeners('disconnect');
      client.removeAllListeners('request');
    };

    child.stdout.on('data', (data) => {
      this.loggerService.log(`[${pluginName}]`, data.toString().trim());
    });

    child.stderr.on('data', (data) => {
      this.loggerService.error(`[${pluginName}]`, data.toString().trim());
    });

    child.on('exit', () => {
      this.loggerService.log(`[${pluginName}]`, 'Child process ended');
    });

    child.addListener('message', (response: { action: string, payload: any }) => {
      if (typeof response === 'object' && response.action) {
        response.action = response.action === 'error' ? 'server_error' : response.action;
        client.emit(response.action, response.payload);
      }
    });

    client.on('disconnect', () => {
      cleanup();
    });

    client.on('end', () => {
      cleanup();
    });

    client.on('request', (request) => {
      if (child.connected) {
        child.send(request);
      }
    });
  }
}