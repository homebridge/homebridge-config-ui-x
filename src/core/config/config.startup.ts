import type { StartupConfig } from './config.interfaces.js'

import { readFile, stat } from 'node:fs/promises'
import { homedir, networkInterfaces } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

import { readJson } from 'fs-extra/esm'

import { Logger } from '../logger/logger.service.js'
import { SslCertGeneratorService } from '../ssl/ssl-cert-generator.service.js'
import { activeWebRoot } from '../web-root.js'

/**
 * Return config required to start the console server
 */
export async function getStartupConfig() {
  const logger = new Logger()

  const configPath = process.env.UIX_CONFIG_PATH || resolve(homedir(), '.homebridge/config.json')

  const homebridgeConfig = await readJson(configPath)
  const ui = Array.isArray(homebridgeConfig.platforms)
    ? homebridgeConfig.platforms.find((x: any) => x.platform === 'config')
    : undefined

  const config = {} as StartupConfig

  // Check if IPv6 is available on this host
  const ipv6 = Object.entries(networkInterfaces()).filter(([, addresses]) => {
    return addresses.find(x => x.family === 'IPv6')
  }).length

  config.host = ipv6 ? '::' : '0.0.0.0'
  config.webRoot = ''

  // If no ui settings configured - we are done
  if (!ui) {
    return config
  }

  // Preload custom host settings
  if (ui.host && process.env.UIX_DEVELOPMENT !== '1') {
    config.host = ui.host
  }

  // Preload ssl settings
  if (ui.ssl && process.env.UIX_DEVELOPMENT !== '1') {
    // Check if self-signed certificate is enabled
    if (ui.ssl.selfSigned) {
      try {
        const sslCertGenerator = new SslCertGeneratorService()
        const hostnames = ui.ssl.selfSignedHostnames || ['localhost', '127.0.0.1']
        const { privateKey, certificate } = await sslCertGenerator.generateOrLoadCertificate(hostnames)

        config.httpsOptions = {
          key: privateKey,
          cert: certificate,
        }
        logger.log('Self-signed certificate loaded successfully')
      } catch (e) {
        logger.error(`Could not generate self-signed certificate: ${e.message}`)
        logger.error(e)
      }
    } else if ((ui.ssl.key && ui.ssl.cert) || ui.ssl.pfx) {
      // Traditional file-based SSL
      // A missing file must not stop the UI from starting: it then starts without SSL (below), so the user can
      // open it and fix the path
      for (const attribute of ['key', 'cert', 'pfx']) {
        if (ui.ssl[attribute]) {
          const isFile = await stat(ui.ssl[attribute]).then(s => s.isFile(), () => false)
          if (!isFile) {
            logger.error(`SSL config error: ui.ssl.${attribute}: ${ui.ssl[attribute]} is not a valid file.`)
          }
        }
      }

      try {
        config.httpsOptions = {
          key: ui.ssl.key
            ? await readFile(ui.ssl.key)
            : undefined,
          cert: ui.ssl.cert
            ? await readFile(ui.ssl.cert)
            : undefined,
          pfx: ui.ssl.pfx
            ? await readFile(ui.ssl.pfx)
            : undefined,
          passphrase: ui.ssl.passphrase,
        }
      } catch (e) {
        logger.error(`Could not start server with SSL enabled as ${e.message}.`)
        logger.error(e)
      }
    }
  }

  // Preload proxy host settings
  if (ui.proxyHost && process.env.UIX_DEVELOPMENT !== '1') {
    config.cspWsOverride = `wss://${ui.proxyHost} ws://${ui.proxyHost}`
  }

  // Preload the web root. A value the server cannot use must not stop the UI from starting: it then starts at
  // the root, so the user can open it and fix the setting
  config.webRoot = activeWebRoot(ui.webRoot)
  if (ui.webRoot && !config.webRoot && process.env.UIX_DEVELOPMENT !== '1') {
    logger.error(`Web root config error: ui.webRoot: ${JSON.stringify(ui.webRoot)} is not a valid path, so the UI is at the root.`)
  }

  // Extra origins allowed to frame the UI. The default CSP is
  // `frame-ancestors 'self'`, which blocks clickjacking from third-party pages;
  // set `allowFrameAncestors` (an array, or a space/comma-separated string) to
  // permit embedding the dashboard in named origins.
  if (ui.allowFrameAncestors) {
    const raw = Array.isArray(ui.allowFrameAncestors)
      ? ui.allowFrameAncestors
      : String(ui.allowFrameAncestors).split(/[\s,]+/)
    config.allowedFrameAncestors = raw.map((s: string) => s.trim()).filter(Boolean)
  }

  // Preload debug settings
  if (ui.debug) {
    config.debug = true
    process.env.UIX_DEBUG_LOGGING = '1'
  } else {
    config.debug = false
    process.env.UIX_DEBUG_LOGGING = '0'
  }

  return config
}
