import './self-check';

import * as path from 'path';
import { fastify, FastifyReply, FastifyRequest } from 'fastify';
import fastifyMultipart from 'fastify-multipart';
import * as helmet from 'helmet';
import * as fs from 'fs-extra';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { Logger } from './core/logger/logger.service';
import { SpaFilter } from './core/spa/spa.filter';
import { ConfigService } from './core/config/config.service';
import { getStartupConfig } from './core/config/config.startup';

process.env.UIX_BASE_PATH = path.resolve(__dirname, '../');

async function bootstrap() {
  const startupConfig = await getStartupConfig();

  const server = fastify({
    https: startupConfig.httpsOptions,
    logger: startupConfig.debug ? {
      prettyPrint: true,
    } : false,
  });

  const fAdapter = new FastifyAdapter(server);

  fAdapter.register(fastifyMultipart, {
    limits: {
      files: 1,
    },
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fAdapter,
    {
      logger: startupConfig.debug ? new Logger() : false,
      httpsOptions: startupConfig.httpsOptions,
    },
  );

  const configService: ConfigService = app.get(ConfigService);
  const logger: Logger = app.get(Logger);

  // helmet security headers
  app.use(helmet({
    hsts: false,
    frameguard: false,
    referrerPolicy: {
      policy: 'no-referrer',
    },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        scriptSrc: ['\'self\'', '\'unsafe-inline\'', '\'unsafe-eval\''],
        styleSrc: ['\'self\'', '\'unsafe-inline\''],
        imgSrc: ['\'self\'', 'data:', 'https://raw.githubusercontent.com', 'https://user-images.githubusercontent.com'],
        connectSrc: ['\'self\'', 'https://openweathermap.org', 'https://api.openweathermap.org', (req) => {
          return `wss://${req.headers.host} ws://${req.headers.host} ${startupConfig.cspWsOveride || ''}`;
        }],
      },
    },
  }));

  // serve index.html without a cache
  app.getHttpAdapter().get('/', async (req: FastifyRequest, res: FastifyReply) => {
    res.type('text/html');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    res.send(await fs.readFile(path.resolve(process.env.UIX_BASE_PATH, 'public/index.html')));
  });

  // serve static assets with a long cache timeout
  app.useStaticAssets({
    root: path.resolve(process.env.UIX_BASE_PATH, 'public'),
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public,max-age=31536000,immutable');
    },
  });

  // set prefix
  app.setGlobalPrefix('/api');

  // setup cors
  app.enableCors({
    origin: ['http://localhost:8080', 'http://localhost:4200'],
  });

  // validation pipes
  // https://github.com/typestack/class-validator
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    skipMissingProperties: true,
  }));

  // setup swagger api doc generator
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
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('swagger', app, document);

  // serve spa on all 404
  app.useGlobalFilters(new SpaFilter());

  logger.warn(`Homebridge Config UI X v${configService.package.version} is listening on ${startupConfig.host} port ${configService.ui.port}`);
  await app.listen(configService.ui.port, startupConfig.host);
}
bootstrap();
