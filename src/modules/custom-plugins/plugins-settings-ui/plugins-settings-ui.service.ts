import type { EventEmitter } from 'node:events'

import type { HomebridgePluginUiMetadata } from '../../plugins/plugins.interfaces.js'

import { fork } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { basename, dirname, join, normalize, resolve } from 'node:path'
import process from 'node:process'

import { HttpService } from '@nestjs/axios'
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { pathExists } from 'fs-extra/esm'
import NodeCache from 'node-cache'
import { firstValueFrom } from 'rxjs'

import { ConfigService } from '../../../core/config/config.service.js'
import { Logger } from '../../../core/logger/logger.service.js'
import { RE_PATH_TRAVERSAL, RE_STATIC_ASSET_EXT } from '../../../core/regex.constants.js'
import { PluginsService } from '../../plugins/plugins.service.js'

@Injectable()
export class PluginsSettingsUiService {
  private pluginUiMetadataCache = new NodeCache({ stdTTL: 86400 })
  private pluginUiLastVersionCache = new NodeCache({ stdTTL: 86400 })

  constructor(
    @Inject(Logger) private readonly loggerService: Logger,
    @Inject(PluginsService) private readonly pluginsService: PluginsService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(HttpService) private readonly httpService: HttpService,
  ) { }

  /**
   * Serve Custom HTML Assets for a plugin
   */
  async serveCustomUiAsset(reply, pluginName: string, assetPath: string, origin: string, version?: string) {
    try {
      if (!assetPath) {
        assetPath = 'index.html'
      }

      if (assetPath === 'index.html' && version) {
        if (version !== this.pluginUiLastVersionCache.get(pluginName)) {
          this.pluginUiMetadataCache.del(pluginName)
        }
      }

      const pluginUi: HomebridgePluginUiMetadata = (this.pluginUiMetadataCache.get(pluginName) as any)
        || (await this.getPluginUiMetadata(pluginName))

      const safeSuffix = normalize(assetPath).replace(RE_PATH_TRAVERSAL, '')
      const filePath = join(pluginUi.publicPath, safeSuffix)

      if (!filePath.startsWith(resolve(pluginUi.publicPath))) {
        return reply.code(404).send('Not Found')
      }

      // For non-HTML assets the CSP header is irrelevant to the browser, but
      // setting an empty value is a belt-and-suspenders measure that prevents
      // any stale header from leaking through.
      reply.header('Content-Security-Policy', '')

      if (assetPath === 'index.html') {
        // Validate origin once here so the same value is used in both the CSP
        // header and the HTML body — preventing any mismatch between the two.
        const safeOrigin = this.sanitizeOrigin(origin)
        // Scope the CSP tightly to the validated origin.  'unsafe-inline' is
        // required because the generated index.html contains two inline
        // <script> blocks.  frame-ancestors restricts embedding to same-origin
        // frames only, preventing the plugin iframe from being embedded by
        // third-party pages.
        reply.header(
          'Content-Security-Policy',
          `default-src 'self' ${safeOrigin}; `
          + `script-src 'self' 'unsafe-inline' ${safeOrigin}; `
          + `style-src 'self' 'unsafe-inline' ${safeOrigin}; `
          + `img-src * data:; `
          + `connect-src *; `
          + `font-src 'self' data:; `
          + `frame-ancestors 'self' ${safeOrigin}`,
        )
        return reply
          .type('text/html')
          .send(await this.buildIndexHtml(pluginUi, safeOrigin))
      }

      if (pluginUi.devServer) {
        return await this.serveAssetsFromDevServer(reply, pluginUi, assetPath)
      }

      // Fallback path (to serve static assets from the plugin ui public folder)
      const fallbackPath = resolve(process.env.UIX_BASE_PATH, 'public', basename(filePath))

      if (await pathExists(filePath)) {
        return reply.sendFile(basename(filePath), dirname(filePath))
      } else if (RE_STATIC_ASSET_EXT.test(fallbackPath) && await pathExists(fallbackPath)) {
        return reply.sendFile(basename(fallbackPath), dirname(fallbackPath))
      } else {
        this.loggerService.warn(`[${pluginName}] asset not found: ${assetPath}.`)
        return reply.code(404).send('Not Found')
      }
    } catch (e) {
      this.loggerService.error(`[${pluginName}] UI threw an error - ${e.message}.`)
      return e.message === 'Not Found' ? reply.code(404).send(e.message) : reply.code(500).send(e.message)
    }
  }

  /**
   * Resolve the path for the custom plugin ui, and store it in the cache
   */
  async getPluginUiMetadata(pluginName: string): Promise<HomebridgePluginUiMetadata> {
    try {
      const pluginUi = await this.pluginsService.getPluginUiMetadata(pluginName)
      this.pluginUiMetadataCache.set(pluginName, pluginUi)
      this.pluginUiLastVersionCache.set(pluginName, pluginUi.plugin.installedVersion)
      return pluginUi
    } catch (e) {
      this.loggerService.warn(`[${pluginName}] custom UI threw an error - ${e.message}.`)
      throw new NotFoundException()
    }
  }

  /**
   * Serve assets from the custom ui dev server (only for private packages in development)
   */
  async serveAssetsFromDevServer(reply, pluginUi: HomebridgePluginUiMetadata, assetPath: string) {
    try {
      const response = await firstValueFrom(this.httpService.get(`${pluginUi.devServer}/${assetPath}`, { responseType: 'text' }))
      for (const [key, value] of Object.entries(response.headers)) {
        reply.header(key, value)
      }
      reply.send(response.data)
    } catch {
      reply.code(404).send('Not Found')
    }
  }

  /**
   * Return the index.html body for the custom plugin ui
   */
  async getIndexHtmlBody(pluginUi: HomebridgePluginUiMetadata) {
    if (pluginUi.devServer) {
      // Dev server is only enabled for private plugins
      return (await firstValueFrom(this.httpService.get(pluginUi.devServer, { responseType: 'text' }))).data
    } else {
      return await readFile(join(pluginUi.publicPath, 'index.html'), 'utf8')
    }
  }

  /**
   * Build the entrypoint html file for the plugin custom ui
   */
  async buildIndexHtml(pluginUi: HomebridgePluginUiMetadata, origin: string) {
    const body = await this.getIndexHtmlBody(pluginUi)
    const safeOrigin = this.sanitizeOrigin(origin)

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${pluginUi.plugin.name.replace(/</g, '&lt;')}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <script>
          window._homebridge = {
            plugin: ${JSON.stringify(pluginUi.plugin).replace(/</g, '\\u003c')},
            serverEnv: ${JSON.stringify(this.configService.uiSettings(true)).replace(/</g, '\\u003c')},
          };
          </script>
          <script src="${safeOrigin}/assets/plugin-ui-utils/ui.js?v=${this.configService.package.version}"></script>
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
    `
  }

  /**
   * Validate and return only the origin (scheme + host) of the provided URL.
   * Returns a safe fallback if the value is missing, not a valid URL, or uses
   * a scheme other than http/https — preventing script-src injection via the
   * `origin` query parameter.
   */
  private sanitizeOrigin(origin: string | undefined): string {
    const fallback = 'http://localhost:4200'
    if (!origin) {
      return fallback
    }
    try {
      const url = new URL(origin)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return fallback
      }
      // Return only protocol + host, stripping any path, query, or fragment
      return url.origin
    } catch {
      return fallback
    }
  }

  /**
   * Starts the custom ui server-side handler
   */
  async startCustomUiHandler(pluginName: string, client: EventEmitter) {
    const pluginUi: HomebridgePluginUiMetadata = (this.pluginUiMetadataCache.get(pluginName) as any)
      || (await this.getPluginUiMetadata(pluginName))

    // check the plugin has a server side script
    if (!await pathExists(resolve(pluginUi.serverPath))) {
      client.emit('ready', { server: false })
      return
    }

    // Pass all env vars to server side script
    const childEnv = { ...process.env }
    childEnv.HOMEBRIDGE_STORAGE_PATH = this.configService.storagePath
    childEnv.HOMEBRIDGE_CONFIG_PATH = this.configService.configPath
    childEnv.HOMEBRIDGE_UI_VERSION = this.configService.package.version

    // Launch the server side script
    const child = fork(pluginUi.serverPath, [], {
      silent: true,
      env: childEnv,
    })

    child.stdout.on('data', (data) => {
      this.loggerService.log(`[${pluginName}] ${data.toString().trim()}`)
    })

    child.stderr.on('data', (data) => {
      this.loggerService.error(`[${pluginName}] ${data.toString().trim()}`)
    })

    child.on('exit', () => {
      this.loggerService.debug(`[${pluginName}] custom UI closed (child process ended).`)
    })

    child.addListener('message', (response: { action: string, payload: any }) => {
      if (typeof response === 'object' && response.action) {
        response.action = response.action === 'error' ? 'server_error' : response.action
        client.emit(response.action, response.payload)
      }
    })

    // Function to handle cleanup. socket.io often emits both 'disconnect'
    // and 'end' on the same socket close, so cleanup() would otherwise
    // run twice and schedule two 5-second SIGTERM timers. By the time
    // those fire the OS may have recycled childPid, so the second kill
    // (or both, if the first fails) could land on an unrelated process.
    // The single-shot flag plus a `child.killed` check prevents that.
    let cleaned = false
    const cleanup = () => {
      if (cleaned) {
        return
      }
      cleaned = true
      this.loggerService.debug(`[${pluginName}] custom UI closing (terminating child process)...`)

      const childPid = child.pid
      if (child.connected) {
        child.disconnect()
      }
      setTimeout(() => {
        if (child.killed || !childPid) {
          return
        }
        try {
          process.kill(childPid, 'SIGTERM')
        } catch (e: any) {
          // ESRCH is fine — the child already exited. Surface anything else.
          if (e?.code !== 'ESRCH') {
            this.loggerService.warn(`[${pluginName}] failed to SIGTERM child pid ${childPid}: ${e.message}`)
          }
        }
      }, 5000)

      client.removeAllListeners('end')
      client.removeAllListeners('disconnect')
      client.removeAllListeners('request')
    }

    client.on('request', (request) => {
      if (child.connected) {
        child.send(request)
      }
    })

    client.on('disconnect', cleanup)
    client.on('end', cleanup)
  }
}
