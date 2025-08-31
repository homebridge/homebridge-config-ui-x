import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { resolve } from 'node:path'
import process from 'node:process'

import helmet from '@fastify/helmet'
import fastifyMultipart from '@fastify/multipart'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
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
      logger: startupConfig.debug ? new Logger() : false,
      httpsOptions: startupConfig.httpsOptions,
    },
  )

  const configService: ConfigService = app.get(ConfigService)
  const logger: Logger = app.get(Logger)

  // (5) Sort out the webroot - update index.html and set env var for spa filter
  let realWebroot = startupConfig.webroot || ''
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

  // (6) Serve index.html without a cache
  app.getHttpAdapter().get(realWebroot || '/', async (req: FastifyRequest, res: FastifyReply) => {
    res.type('text/html')
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.header('Pragma', 'no-cache')
    res.header('Expires', '0')
    res.header('Origin-Agent-Cluster', '?1')
    res.send(await readFile(resolve(process.env.UIX_BASE_PATH, 'public/index.html')))
  })

  // (7) Serve static assets with a long cache timeout
  app.useStaticAssets({
    root: resolve(process.env.UIX_BASE_PATH, 'public'),
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public,max-age=31536000,immutable')
    },
    ...realWebroot ? { prefix: realWebroot } : {},
  })

  // (8) Set api prefix (including webroot)
  app.setGlobalPrefix(`${realWebroot || ''}/api`)

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
  SwaggerModule.setup(`${realWebroot}/swagger`.replace(/^\//, ''), app, document)

  // (12) Use the spa filter to serve index.html for any non-api routes
  app.useGlobalFilters(new SpaFilter())

  // (13) Start listening - woohoo!
  logger.warn(`Homebridge UI v${configService.package.version} is listening on ${startupConfig.host} port ${configService.ui.port}.`)
  await app.listen(configService.ui.port, startupConfig.host)

  return app
}

export const app = bootstrap()
