import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import helmet from '@fastify/helmet'
import fastifyMultipart from '@fastify/multipart'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import Bonjour from 'bonjour-service'

import { AppModule } from './app.module.js'
import { API_PREFIX } from './core/api.constants.js'
import { ConfigService } from './core/config/config.service.js'
import { getStartupConfig } from './core/config/config.startup.js'
import { devServerCorsConfig } from './core/cors.config.js'
import { Logger } from './core/logger/logger.service.js'
import { RE_HASHED_ASSET } from './core/regex.constants.js'
import { SpaFilter } from './core/spa/spa.filter.js'

import './env-setup.js'
import 'reflect-metadata'
import './self-check.js'
import './global-defaults.js'

export { HomebridgeIpcService } from './core/homebridge-ipc/homebridge-ipc.service.js'

async function bootstrap(): Promise<NestFastifyApplication> {
  const startupConfig = await getStartupConfig()

  // (1) Create fastify adapter
  const fAdapter = new FastifyAdapter({
    https: startupConfig.httpsOptions,
    logger: startupConfig.debug || false,
  })

  // (2) Register multipart with file size limit
  fAdapter.register(fastifyMultipart, {
    limits: {
      files: 1,
      fileSize: globalThis.backup.maxBackupSize,
    },
  })

  // (3) Register helmet with custom CSP
  fAdapter.register(helmet, {
    hsts: false,
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
        // No 'unsafe-inline': the built index.html loads only external module
        // scripts and carries no inline <script> body, so nothing here needs
        // it. Dropping it is what stops an injected event handler (e.g.
        // `<img src=x onerror=...>`) from running at all. 'unsafe-eval' stays
        // because the Monaco editor genuinely needs it. Plugin custom UIs are
        // served with their own, looser policy in plugins-settings-ui.service.
        scriptSrc: ['\'self\'', '\'unsafe-eval\''],
        // Angular injects component styles as inline <style> blocks.
        styleSrc: ['\'self\'', '\'unsafe-inline\''],
        imgSrc: ['\'self\'', 'data:', 'https://raw.githubusercontent.com', 'https://user-images.githubusercontent.com'],
        connectSrc: ['\'self\'', 'https://openweathermap.org', 'https://api.openweathermap.org', (req) => {
          return `wss://${req.headers.host} ws://${req.headers.host} ${startupConfig.cspWsOverride || ''}`
        }],
        frameSrc: ['\'self\'', 'data:', 'https://developers.homebridge.io'],
        workerSrc: ['\'self\'', 'blob:'], // required for web-workers for monaco editor
        fontSrc: ['\'self\'', 'data:'], // required for web-workers for monaco editor
        // Inline event-handler attributes are never used by the app, and this
        // says so explicitly rather than relying on the script-src fallback.
        scriptSrcAttr: ['\'none\''],
        objectSrc: null,
        // Block clickjacking: only same-origin pages may frame the UI (this
        // still allows the app's own same-origin plugin-UI iframes). Admins who
        // embed the dashboard in a third-party page can widen this with the
        // `allowFrameAncestors` config option. Was previously unset (any origin
        // could frame the authenticated UI). X-Frame-Options stays off
        // (frameguard: false) because it cannot express an allowlist; modern
        // browsers honour this CSP directive instead.
        frameAncestors: ['\'self\'', ...(startupConfig.allowedFrameAncestors ?? [])],
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
    fAdapter,
    {
      logger: (startupConfig.debug || process.env.UIX_DEVELOPMENT === '1') ? new Logger() : false,
      httpsOptions: startupConfig.httpsOptions,
    },
  )

  const configService: ConfigService = app.get(ConfigService)
  const logger: Logger = app.get(Logger)

  // Serve index.html without a cache
  app.getHttpAdapter().get('/', async (req: FastifyRequest, res: FastifyReply) => {
    res.type('text/html')
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.header('Pragma', 'no-cache')
    res.header('Expires', '0')
    res.send(await readFile(resolve(process.env.UIX_BASE_PATH, 'public/index.html')))
  })

  // (7) Serve static assets. Content-hashed build output (chunk-B3-qTyJy.js,
  // styles-PEDBJHIE.css, media/fa-solid-900-7ICWWULB.woff2, ...) is immutable
  // by construction - a new build produces new filenames - so it gets a
  // year-long immutable cache (#2902). Everything else under public/ keeps
  // stable filenames across releases (assets/monaco/**, icons, manifest) and
  // must revalidate, or upgrades would leave browsers running year-old copies.
  //
  // `cacheControl: false` keeps the `send` dependency from computing its own
  // Cache-Control from `maxAge`/`immutable` at all, so the values set below are
  // the only ones in play. @fastify/static v10 also lets setHeaders() win over
  // send's headers, but leaving this off keeps the two from ever disagreeing.
  //
  // The `reply` cast is needed because v10 hands setHeaders() a FastifyReply
  // (v9 passed a node Response), while @nestjs/platform-fastify still vendors
  // the v9 signature in its FastifyStaticOptions type. Drop the cast once its
  // peer range covers v10.
  app.useStaticAssets({
    root: resolve(process.env.UIX_BASE_PATH, 'public'),
    cacheControl: false,
    setHeaders: (reply: unknown, path: string) => {
      const res = reply as FastifyReply
      if (RE_HASHED_ASSET.test(path)) {
        res.header('Cache-Control', 'public,max-age=31536000,immutable')
      } else {
        res.header('Cache-Control', 'no-cache')
      }
    },
  })

  // Set prefix
  app.setGlobalPrefix(API_PREFIX)

  // (9) Set up cors
  app.enableCors({
    ...devServerCorsConfig,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  // (10) Set up validation pipes for the api
  // https://github.com/typestack/class-validator
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    skipMissingProperties: true,
  }))

  // (11) Build and serve swagger api docs at /swagger
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
  SwaggerModule.setup('swagger', app, document)

  // (12) Use the spa filter to serve index.html for any non-api routes
  app.useGlobalFilters(new SpaFilter())

  // (13) Start listening - woohoo!
  logger.success(`Homebridge UI v${configService.package.version} is listening on ${startupConfig.host} port ${configService.ui.port}.`)
  await app.listen(configService.ui.port, startupConfig.host)

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
        port: configService.ui.port,
        host: startupConfig.host === '0.0.0.0' || startupConfig.host === '::' ? undefined : startupConfig.host,
        txt: {
          path: '/',
          version: configService.package.version,
          https: startupConfig.httpsOptions ? 'true' : 'false',
        },
      })

      logger.log(`Homebridge UI HTTP service advertised via mDNS as "${service.name}" on port ${configService.ui.port}`)
    } catch (error) {
      logger.error('Failed to advertise mDNS service:', error)
    }
  }

  const handleShutdown = (signal: string) => {
    logger.debug(`Received ${signal}, starting graceful shutdown...`)
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
    app.close().finally(() => {
      process.exit(0)
    })
  }

  process.once('SIGINT', () => handleShutdown('SIGINT'))
  process.once('SIGTERM', () => handleShutdown('SIGTERM'))

  return app
}

export const app = bootstrap()
