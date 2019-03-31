import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { Logger } from './core/logger/logger.service';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    {
      logger: new Logger(),
    },
  );

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

  await app.listen(3000);
}
bootstrap();
