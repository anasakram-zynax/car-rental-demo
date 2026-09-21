import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DomainErrorFilter } from './shared/errors/domain-error.filter.js';
import { ResponseInterceptor } from './shared/response/response.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new DomainErrorFilter())
  app.useGlobalInterceptors(new ResponseInterceptor())

  const port = configService.get<number>('PORT') ?? 3000;

  await app.listen(port);
}
await bootstrap();
