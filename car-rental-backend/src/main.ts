import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DomainErrorFilter } from './shared/errors/domain-error.filter.js';
import { ResponseInterceptor } from './shared/response/response.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const configuredFrontendUrl = configService.get<string>('FRONTEND_URL');
  const allowedOrigins = new Set<string>();

  if (configuredFrontendUrl) {
    allowedOrigins.add(configuredFrontendUrl);
  }

  if (configService.get<string>('NODE_ENV') !== 'production') {
    allowedOrigins.add('http://localhost:3000');
    allowedOrigins.add('http://localhost:3001');
  }

  app.enableCors({
    origin: [...allowedOrigins],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new DomainErrorFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const port = configService.get<number>('PORT') ?? 4000;

  await app.listen(port);
}
await bootstrap();
