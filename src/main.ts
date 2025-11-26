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
import { Bonjour } from 'bonjour-service'

import { AppModule } from './app.module.js'
import { ConfigService } from './core/config/config.service.js'
import { getStartupConfig } from './core/config/config.startup.js'
import { Logger } from './core/logger/logger.service.js'
import { SpaFilter } from './core/spa/spa.filter.js'

import './env-setup.js'
import 'reflect-metadata'
import './self-check.js'
import './globalDefaults.js'

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
        scriptSrc: ['\'self\'', '\'unsafe-inline\'', '\'unsafe-eval\''],
        styleSrc: ['\'self\'', '\'unsafe-inline\''],
        imgSrc: ['\'self\'', 'data:', 'https://raw.githubusercontent.com', 'https://user-images.githubusercontent.com'],
        connectSrc: ['\'self\'', 'https://openweathermap.org', 'https://api.openweathermap.org', (req) => {
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

  // (7) Serve static assets with a long cache timeout
  app.useStaticAssets({
    root: resolve(process.env.UIX_BASE_PATH, 'public'),
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public,max-age=31536000,immutable')
    },
  })

  // Set prefix
  app.setGlobalPrefix('/api')

  // (9) Set up cors
  app.enableCors({
    origin: ['http://localhost:8080', 'http://localhost:4200'],
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
  logger.warn(`Homebridge UI v${configService.package.version} is listening on ${startupConfig.host} port ${configService.ui.port}.`)
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
    app.close().finally(() => {
      process.exit(0)
    })
  }

  process.once('SIGINT', () => handleShutdown('SIGINT'))
  process.once('SIGTERM', () => handleShutdown('SIGTERM'))

  return app
}

export const app = bootstrap()
