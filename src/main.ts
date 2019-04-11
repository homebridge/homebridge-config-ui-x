import * as path from 'path';
import * as fastify from 'fastify';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, HttpService } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

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
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(server),
    {
      logger: new Logger(),
      httpsOptions: startupConfig.httpsOptions,
    },
  );

  const configService: ConfigService = app.get(ConfigService);
  const logger: Logger = app.get(Logger);

  // serve static assets with a long cache timeout
  app.useStaticAssets({
    root: path.resolve(process.env.UIX_BASE_PATH, 'public'),
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public,max-age=31536000,immutable');
    },
  });

  // serve index.html without a cache
  app.getHttpAdapter().get('/', (req, res) => {
    res.type('text/html');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    res.sendFile(path.resolve(process.env.UIX_BASE_PATH, 'index.html'));
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

  // serve spa on all 404
  app.useGlobalFilters(new SpaFilter());

  logger.warn(`Console v${configService.package.version} is listening on port ${configService.ui.port}`);
  await app.listen(configService.ui.port || 8080, '0.0.0.0');
}
bootstrap();
