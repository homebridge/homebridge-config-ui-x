import type { ChildProcess } from 'node:child_process'
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
import { DEV_SERVER_PORTS, RE_PATH_TRAVERSAL, RE_STATIC_ASSET_EXT } from '../../../core/regex.constants.js'
import { PluginsService } from '../../plugins/plugins.service.js'

// Sent back to the iframe for any request the server cannot answer. It describes the present state
// rather than a permanent one, because the same text covers a plugin that ships no server-side
// script and a helper that is momentarily gone.
const CUSTOM_UI_UNAVAILABLE = 'The custom UI server for this plugin is not available.'

@Injectable()
export class PluginsSettingsUiService {
  private pluginUiMetadataCache = new NodeCache({ stdTTL: 86400 })
  private pluginUiLastVersionCache = new NodeCache({ stdTTL: 86400 })
  private customUiCleanups = new WeakMap<EventEmitter, () => void>()

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
      // setting an empty value prevents any stale header from leaking through.
      reply.header('Content-Security-Policy', '')

      if (assetPath === 'index.html') {
        // In production the primary UI and plugin UI are same-origin, so the
        // request-supplied origin is ignored.
        //
        // In Angular development mode the primary UI runs on :4200 while
        // Config UI X runs on :8581. Angular supplies its origin so the
        // generated plugin UI can load assets from the Angular dev server.
        //
        // The server independently requires UIX_DEVELOPMENT=1 before it will
        // consider the request-supplied origin. The origin remains untrusted
        // and must pass resolveUiOrigin() before it is used.
        const uiOrigin = process.env.UIX_DEVELOPMENT === '1'
          ? this.resolveUiOrigin(origin, reply.request?.headers?.host)
          : ''

        const cspOrigin = uiOrigin ? ` ${uiOrigin}` : ''

        const extraDomains = pluginUi.customUiCspDomains?.length
          ? ` ${pluginUi.customUiCspDomains.join(' ')}`
          : ''

        reply.header(
          'Content-Security-Policy',
          `default-src 'self'; `
          + `script-src 'self' 'unsafe-inline' 'unsafe-eval'${cspOrigin}${extraDomains}; `
          + `style-src 'self' 'unsafe-inline'${cspOrigin}; `
          + `img-src * data:; `
          + `connect-src *; `
          + `font-src 'self' data:${cspOrigin}; `
          + `frame-ancestors 'self'${cspOrigin}; `
          + `frame-src 'self'${cspOrigin}${extraDomains}`,
        )

        return reply
          .type('text/html')
          .send(await this.buildIndexHtml(pluginUi, uiOrigin))
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
      const response = await firstValueFrom(
        this.httpService.get(
          `${pluginUi.devServer}/${assetPath}`,
          { responseType: 'text' },
        ),
      )

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
      return (
        await firstValueFrom(
          this.httpService.get(
            pluginUi.devServer,
            { responseType: 'text' },
          ),
        )
      ).data
    } else {
      return await readFile(join(pluginUi.publicPath, 'index.html'), 'utf8')
    }
  }

  /**
   * Build the entrypoint html file for the plugin custom ui
   */
  async buildIndexHtml(pluginUi: HomebridgePluginUiMetadata, origin?: string) {
    const body = await this.getIndexHtmlBody(pluginUi)

    // Re-sanitize the origin: only accept a validated URL origin (scheme + host
    // + port) so that untrusted input cannot inject HTML attributes or
    // javascript: URLs into the <script src>.
    let safeOrigin = ''
    if (origin) {
      try {
        const parsed = new URL(origin)
        if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin === origin) {
          safeOrigin = parsed.origin
        }
      } catch {
        // leave safeOrigin as ''
      }
    }

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
   * Validate and resolve the Angular development server origin.
   *
   * This method is only called when UIX_DEVELOPMENT=1. The origin comes
   * from the request URL and is therefore still treated as untrusted.
   *
   * The origin must:
   * - use HTTP or HTTPS;
   * - use a known development-server port;
   * - use the same hostname as the Config UI X request;
   * - contain only the scheme, hostname and port.
   *
   * Any invalid value resolves to an empty string, causing the generated
   * plugin UI to fall back to same-origin behaviour.
   */
  private resolveUiOrigin(origin: string | undefined, requestHost: string | undefined): string {
    if (!origin) {
      return ''
    }

    try {
      const url = new URL(origin)

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return ''
      }

      if (!DEV_SERVER_PORTS.has(url.port)) {
        return ''
      }

      // The API request arrives on :8581 while the Angular dev server runs
      // on a different port, so compare only the hostname.
      const requestHostname = requestHost?.split(':')[0]

      if (!requestHostname || url.hostname !== requestHostname) {
        return ''
      }

      // Only accept a bare origin. This rejects paths, queries, fragments,
      // credentials and any other value that does not round-trip to url.origin.
      return url.origin === origin ? url.origin : ''
    } catch {
      return ''
    }
  }

  /**
   * Answer a single request the server cannot forward to a helper, in the shape the iframe bridge
   * expects: it settles the pending promise held against this request id by rejecting it.
   */
  private rejectRequest(pluginName: string, client: EventEmitter, requestId: string) {
    client.emit('response', {
      requestId,
      success: false,
      data: { message: CUSTOM_UI_UNAVAILABLE },
    })

    this.loggerService.debug(
      `[${pluginName}] custom UI request ${requestId} rejected (no server-side handler available).`,
    )
  }

  /**
   * Starts the custom ui server-side handler
   */
  async startCustomUiHandler(pluginName: string, client: EventEmitter) {
    // A second start can land on a socket that already has a live handler — the settings modal
    // reopened on the cached namespace socket, or a buffered start and a subscription-driven one
    // arriving together. Retiring the previous handler first keeps this socket to one child and
    // one set of listeners instead of stacking a second of each.
    this.customUiCleanups.get(client)?.()

    // Undefined until (and unless) this invocation reaches the fork below.
    let child: ChildProcess | undefined

    // The ids of the requests handed to this invocation's child and not yet answered.
    const outstanding = new Set<string>()

    // The iframe bridge holds a pending promise per request id with no timeout of its own, so a
    // request nothing can answer any more has to be settled here or it stalls the plugin UI for
    // as long as the page stays open.
    const settleOutstanding = () => {
      for (const requestId of outstanding) {
        this.rejectRequest(pluginName, client, requestId)
      }
      outstanding.clear()
    }

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
      this.loggerService.debug(
        `[${pluginName}] custom UI closing (terminating child process)...`,
      )

      // On a disconnect the socket is gone and these emits are harmless; on a modal close or a
      // supersede the socket survives and the iframe gets its answers.
      settleOutstanding()

      // Detach this invocation's child from the socket while it drains, so a message it still
      // manages to send cannot be relayed onto a session a newer child now serves. Its stdout,
      // stderr and exit handlers stay: their logging is useful right up to the exit.
      child?.removeAllListeners('message')

      const childPid = child?.pid

      if (child?.connected) {
        child.disconnect()
      }

      if (child) {
        setTimeout(() => {
          if (child.killed || !childPid) {
            return
          }

          try {
            process.kill(childPid, 'SIGTERM')
          } catch (e: any) {
            // ESRCH is fine — the child already exited. Surface anything else.
            if (e?.code !== 'ESRCH') {
              this.loggerService.warn(
                `[${pluginName}] failed to SIGTERM child pid ${childPid}: ${e.message}`,
              )
            }
          }
        }, 5000)
      }

      client.removeAllListeners('end')
      client.removeAllListeners('disconnect')
      client.removeAllListeners('request')
      this.customUiCleanups.delete(client)
    }

    this.customUiCleanups.set(client, cleanup)

    // Bind the socket's listeners synchronously, before the lookups below suspend: they belong to
    // the socket for its whole session, and a request that arrives while a helper is being
    // resolved still has to be answered rather than dropped.
    client.on('request', (request: { requestId?: string }) => {
      if (child?.connected) {
        if (request?.requestId) {
          outstanding.add(request.requestId)
        }

        child.send(request)
      } else if (request?.requestId) {
        this.rejectRequest(pluginName, client, request.requestId)
      }
    })

    client.on('disconnect', cleanup)
    client.on('end', cleanup)

    const pluginUi: HomebridgePluginUiMetadata = (this.pluginUiMetadataCache.get(pluginName) as any)
      || (await this.getPluginUiMetadata(pluginName))

    // Check the plugin has a server side script.
    const hasServerScript = await pathExists(resolve(pluginUi.serverPath))

    // An invocation superseded, or a socket closed, while the lookups above were in flight must
    // leave no trace of itself: no stray ready, and no orphan child.
    if (cleaned) {
      return
    }

    if (!hasServerScript) {
      client.emit('ready', { server: false })
      return
    }

    // Pass all env vars to server side script.
    const childEnv = { ...process.env }
    childEnv.HOMEBRIDGE_STORAGE_PATH = this.configService.storagePath
    childEnv.HOMEBRIDGE_CONFIG_PATH = this.configService.configPath
    childEnv.HOMEBRIDGE_UI_VERSION = this.configService.package.version

    // Launch the server side script.
    child = fork(pluginUi.serverPath, [], {
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
      this.loggerService.debug(
        `[${pluginName}] custom UI closed (child process ended).`,
      )

      // A crash, or a kill from the cleanup path, can take the child down with requests still in
      // flight. Nothing will ever answer those, so settle them here.
      settleOutstanding()
    })

    child.addListener(
      'message',
      (response: { action: string, payload: any }) => {
        if (typeof response === 'object' && response.action) {
          if (response.action === 'response' && response.payload?.requestId) {
            outstanding.delete(response.payload.requestId)
          }

          response.action = response.action === 'error'
            ? 'server_error'
            : response.action

          client.emit(response.action, response.payload)
        }
      },
    )
  }
}
