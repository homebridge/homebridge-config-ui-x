import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Server as HttpServer } from 'node:http'

import { createServer as createHttpServer } from 'node:http'
import { resolve } from 'node:path'
import process from 'node:process'

import helmet from '@fastify/helmet'
import fastifyMultipart from '@fastify/multipart'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Bonjour } from 'bonjour-service'
import { readFile } from 'fs-extra'

import { AppModule } from './app.module'
import { ConfigService } from './core/config/config.service'
import { getStartupConfig } from './core/config/config.startup'
import { Logger } from './core/logger/logger.service'
import { SpaHtmlService } from './core/spa/spa-html.service'
import { SpaFilter } from './core/spa/spa.filter'

import './self-check'
import './globalDefaults'

export { HomebridgeIpcService } from './core/homebridge-ipc/homebridge-ipc.service'

process.env.UIX_BASE_PATH = process.env.UIX_BASE_PATH_OVERRIDE || resolve(__dirname, '../')

async function bootstrap(): Promise<NestFastifyApplication> {
  const startupConfig = await getStartupConfig()

  // Helper to create a configured Nest app with a provided Fastify adapter and shared settings
  async function createConfiguredApp(adapter: FastifyAdapter, opts: { realWebroot?: string } = {}) {
    // Determine if this adapter is configured for HTTPS
    const isHttps = !!((adapter as any)?.getInstance?.()?.initialConfig?.https)
    // (2) Register multipart with file size limit
    adapter.register(fastifyMultipart, {
      limits: {
        files: 1,
        fileSize: globalThis.backup.maxBackupSize,
      },
    })

    // (3) Register helmet with custom CSP
    adapter.register(helmet, {
      // Enable HSTS when serving over HTTPS; keep disabled for HTTP to avoid forcing upgrade unintentionally
      hsts: isHttps,
      frameguard: false,
      referrerPolicy: {
        policy: 'no-referrer',
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ['\'self\''],
          scriptSrc: ['\'self\'', '\'unsafe-inline\'', '\'unsafe-eval\''],
          styleSrc: ['\'self\'', '\'unsafe-inline\''],
          imgSrc: ['\'self\'', 'data:', 'https://raw.githubusercontent.com', 'https://user-images.githubusercontent.com'],
          connectSrc: ['\'self\'', 'https://openweathermap.org', 'https://api.openweathermap.org', (req) => {
            // Advertise both ws and wss endpoints; browsers will prefer wss when on an https page
            return `wss://${req.headers.host} ws://${req.headers.host} ${startupConfig.cspWsOverride || ''}`
          }],
          frameSrc: ['\'self\'', 'data:', 'https://developers.homebridge.io'],
          scriptSrcAttr: null,
          fontSrc: null,
          objectSrc: null,
          frameAncestors: null,
          formAction: null,
          baseUri: null,
          upgradeInsecureRequests: null,
          blockAllMixedContent: null,
        },
      },
    })

    // (4) Create nest app with fastify adapter
    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      adapter,
      {
        logger: startupConfig.debug ? new Logger() : false,
        httpsOptions: (adapter as any)?.getInstance?.()?.initialConfig?.https || undefined,
      },
    )

    const configService: ConfigService = app.get(ConfigService)
    const logger: Logger = app.get(Logger)

    // (5) Sort out the webroot - update index.html and set env var for spa filter (only once)
    let realWebroot = opts.realWebroot || startupConfig.webroot || ''
    if (!opts.realWebroot) {
      try {
        await SpaHtmlService.updateIndexHtml(startupConfig.webroot)
        process.env.UIX_ORIGINAL_WEBROOT = startupConfig.webroot
        configService.setOriginalWebroot(startupConfig.webroot)
      } catch (error) {
        logger.warn(`Could not update index.html with webroot ${startupConfig.webroot}: ${error.message}`)
        realWebroot = ''
        process.env.UIX_ORIGINAL_WEBROOT = globalThis.webroot.errorCode
        configService.setOriginalWebroot(globalThis.webroot.errorCode)
      }
    }

    // (6) If running behind a reverse proxy that terminates HTTP, redirect http->https using X-Forwarded-Proto
    // This provides "resolve http to https" behavior without requiring the app to bind to a second HTTP port
    try {
      if (isHttps) {
        const fastify = app.getHttpAdapter().getInstance?.()
        if (fastify?.addHook) {
          fastify.addHook('onRequest', (req: any, res: any, done: any) => {
            const xfProto = (req.headers['x-forwarded-proto'] || req.headers['X-Forwarded-Proto']) as string | undefined
            if (xfProto && xfProto.toLowerCase() === 'http') {
              const host = req.headers.host
              const location = `https://${host}${req.url}`
              res.statusCode = 308
              res.setHeader('Location', location)
              res.end()
              return
            }
            done()
          })
        }
      }
    } catch (e) {
      // Non-fatal; continue without proxy redirect hook
    }

    // (7) Serve index.html without a cache
    app.getHttpAdapter().get(realWebroot || '/', async (req: FastifyRequest, res: FastifyReply) => {
      res.type('text/html')
      res.header('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.header('Pragma', 'no-cache')
      res.header('Expires', '0')
      res.send(await readFile(resolve(process.env.UIX_BASE_PATH, 'public/index.html')))
    })

    // (8) Serve static assets with a long cache timeout
    app.useStaticAssets({
      root: resolve(process.env.UIX_BASE_PATH, 'public'),
      setHeaders(res) {
        res.setHeader('Cache-Control', 'public,max-age=31536000,immutable')
      },
      ...realWebroot ? { prefix: realWebroot } : {},
    })

    // (9) Set api prefix (including webroot)
    app.setGlobalPrefix(`${realWebroot || ''}/api`)

    // (10) Set up cors
    app.enableCors({
      origin: ['http://localhost:8080', 'http://localhost:4200'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })

    // (11) Set up validation pipes for the api
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    // (12) Build and serve swagger api docs at /swagger
    const options = new DocumentBuilder()
      .setTitle('Homebridge UI API Reference')
      .setVersion(configService.package.version)
      .addBearerAuth({
        type: 'oauth2',
        flows: {
          password: {
            tokenUrl: '/api/auth/login',
            scopes: null,
          },
        },
      })
      .build()
    const document = SwaggerModule.createDocument(app, options)
    SwaggerModule.setup(`${realWebroot}/swagger`.replace(/^\//, ''), app, document)

    // (13) Use the spa filter to serve index.html for any non-api routes
    app.useGlobalFilters(new SpaFilter())

    return { app, realWebroot, logger, configService }
  }

  // If SSL is configured, prefer HTTPS-only mode. Otherwise, run HTTP-only.
  if (startupConfig.httpsOptions) {
    // HTTPS-only mode
    const httpsAdapter = new FastifyAdapter({
      https: startupConfig.httpsOptions,
      logger: startupConfig.debug || false,
    })

    const { app: httpsApp, realWebroot, logger, configService } = await createConfiguredApp(httpsAdapter)

    // Choose port precedence: httpsPort > port > httpPort

    // Advertise via mDNS if enabled
    let bonjour: Bonjour | null = null
    if (configService.ui.enableMdnsAdvertise) {
      try {
        bonjour = new Bonjour()
      } catch (e) {
        logger.error('Failed to initialize mDNS service:', e)
      }
    }
    const httpsPort = configService.ui.httpsPort || configService.ui.port || configService.ui.httpPort
    try {
      logger.warn(`Homebridge UI v${configService.package.version} HTTPS listening on ${startupConfig.host} port ${httpsPort}.`)
      await httpsApp.listen(httpsPort, startupConfig.host)

      if (bonjour) {
        try {
          const serviceName = `${configService.homebridgeConfig?.bridge?.name || 'Homebridge UI'}`
          const service = bonjour.publish({
            name: `${serviceName} (HTTPS)`,
            type: 'https',
            port: httpsPort,
            host: startupConfig.host === '0.0.0.0' || startupConfig.host === '::' ? undefined : startupConfig.host,
            txt: {
              path: realWebroot || '/',
              version: configService.package.version,
              https: 'true',
            },
          })
          logger.log(`Homebridge UI HTTPS service advertised via mDNS as "${service.name}" on port ${httpsPort}`)
        } catch (error) {
          logger.error('Failed to advertise HTTPS mDNS service:', error)
        }
      }
    } catch (err) {
      // If HTTPS fails to start, fall back to HTTP to keep the UI reachable
      logger.error(`Failed to start HTTPS listener on ${httpsPort}:`, err)
      logger.warn('Falling back to HTTP as HTTPS failed to start.')

      const httpAdapter = new FastifyAdapter({
        logger: startupConfig.debug || false,
      })
      const { app: httpApp, realWebroot: httpWebroot } = await createConfiguredApp(httpAdapter, { realWebroot })
      const httpPort = configService.ui.httpPort || configService.ui.port
      let bonjourHttp: Bonjour | null = null
      if (configService.ui.enableMdnsAdvertise) {
        try {
          bonjourHttp = new Bonjour()
        } catch (e) {
          logger.error('Failed to initialize mDNS service for HTTP:', e)
        }
      }
      logger.warn(`Homebridge UI v${configService.package.version} HTTP listening on ${startupConfig.host} port ${httpPort}.`)
      await httpApp.listen(httpPort, startupConfig.host)
      if (bonjourHttp) {
        try {
          const serviceName = configService.homebridgeConfig?.bridge?.name
            ? configService.homebridgeConfig.bridge.name
            : 'Homebridge UI'
          const service = bonjourHttp.publish({
            name: serviceName,
            type: 'http',
            port: httpPort,
            host: startupConfig.host === '0.0.0.0' || startupConfig.host === '::' ? undefined : startupConfig.host,
            txt: {
              path: httpWebroot || '/',
              version: configService.package.version,
              https: 'false',
            },
          })
          logger.log(`Homebridge UI HTTP service advertised via mDNS as "${service.name}" on port ${httpPort}`)
        } catch (error) {
          logger.error('Failed to advertise HTTP mDNS service:', error)
        }
      }

      const handleShutdown = (signal: string) => {
        logger.log(`Received ${signal}, starting graceful shutdown...`)
        if (bonjourHttp) {
          try {
            logger.log('Shutting down mDNS service advertising...')
            bonjourHttp.unpublishAll()
            bonjourHttp.destroy()
            bonjourHttp = null
          } catch (error) {
            logger.error('Error during mDNS cleanup:', error)
          }
        }
        httpApp.close().finally(() => {
          process.exit(0)
        })
      }
      process.once('SIGINT', () => handleShutdown('SIGINT'))
      process.once('SIGTERM', () => handleShutdown('SIGTERM'))
      return httpApp
    }

    // Optional HTTP redirect server: bind an HTTP port that issues 308 redirects to HTTPS
    let redirectServer: HttpServer | null = null
    if (configService.ui.redirectHttpToHttps) {
      const redirectPort = configService.ui.httpPort
      if (redirectPort && redirectPort !== httpsPort) {
        try {
          redirectServer = createHttpServer((req, res) => {
            const hostHeader = (req.headers.host || '') as string
            const hostName = hostHeader.includes(':') ? hostHeader.split(':')[0] : hostHeader
            const location = `https://${hostName}:${httpsPort}${req.url || '/'}`
            res.statusCode = 308
            res.setHeader('Location', location)
            res.end()
          })
          await new Promise<void>((resolveListen, rejectListen) => {
            redirectServer.listen(redirectPort, startupConfig.host, () => resolveListen())
            redirectServer.on('error', rejectListen)
          })
          logger.log(`HTTP redirect server listening on ${startupConfig.host} port ${redirectPort} -> HTTPS ${httpsPort}`)
        } catch (e) {
          logger.error(`Failed to start HTTP redirect server on port ${redirectPort}:`, e)
        }
      } else {
        logger.log('HTTP redirect is enabled but no distinct httpPort is set or it conflicts with the HTTPS port; redirect server not started.')
      }
    }

    const handleShutdown = (signal: string) => {
      logger.log(`Received ${signal}, starting graceful shutdown...`)
      // Stop mDNS
      try {
        if (bonjour) {
          logger.log('Shutting down mDNS service advertising...')
          bonjour.unpublishAll()
          bonjour.destroy()
          bonjour = null
        }
      } catch (error) {
        logger.error('Error during mDNS cleanup:', error)
      }
      try {
        if (redirectServer) {
          redirectServer.close()
          redirectServer = null
        }
      } catch {
        // ignore
      }
      httpsApp.close().finally(() => {
        process.exit(0)
      })
    }
    process.once('SIGINT', () => handleShutdown('SIGINT'))
    process.once('SIGTERM', () => handleShutdown('SIGTERM'))
    return httpsApp
  }

  // HTTP-only mode (no SSL configured)
  const httpAdapter = new FastifyAdapter({
    logger: startupConfig.debug || false,
  })
  const { app: httpApp, realWebroot, logger, configService } = await createConfiguredApp(httpAdapter)

  const httpPort = configService.ui.httpPort || configService.ui.port
  logger.warn(`Homebridge UI v${configService.package.version} HTTP listening on ${startupConfig.host} port ${httpPort}.`)
  await httpApp.listen(httpPort, startupConfig.host)

  // Advertise the HTTP service via mDNS/Bonjour for easy discovery (if enabled)
  let bonjour: Bonjour | null = null
  if (configService.ui.enableMdnsAdvertise) {
    try {
      bonjour = new Bonjour()
      const serviceName = configService.homebridgeConfig?.bridge?.name
        ? configService.homebridgeConfig.bridge.name
        : 'Homebridge UI'
      const service = bonjour.publish({
        name: serviceName,
        type: 'http',
        port: httpPort,
        host: startupConfig.host === '0.0.0.0' || startupConfig.host === '::' ? undefined : startupConfig.host,
        txt: {
          path: realWebroot || '/',
          version: configService.package.version,
          https: 'false',
        },
      })

      logger.log(`Homebridge UI HTTP service advertised via mDNS as "${service.name}" on port ${httpPort}`)
    } catch (error) {
      logger.error('Failed to advertise mDNS service:', error)
    }
  }

  const handleShutdown = (signal: string) => {
    logger.log(`Received ${signal}, starting graceful shutdown...`)
    if (bonjour) {
      try {
        logger.log('Shutting down mDNS service advertising...')
        bonjour.unpublishAll()
        bonjour.destroy()
        bonjour = null
      } catch (error) {
        logger.error('Error during mDNS cleanup:', error)
      }
    }
    httpApp.close().finally(() => {
      process.exit(0)
    })
  }

  process.once('SIGINT', () => handleShutdown('SIGINT'))
  process.once('SIGTERM', () => handleShutdown('SIGTERM'))

  return httpApp
}

export const app = bootstrap()
