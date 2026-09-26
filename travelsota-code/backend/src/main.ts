import 'reflect-metadata';
import 'dotenv/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './shared/config/app-config.service';
import { trustPrivatePeers } from './shared/network/ip-classify.util';
import { GlobalExceptionFilter } from './shared/errors/global-exception.filter';
import { LoggingConfig } from './shared/logging/logging.config';
import { requestIdMiddleware } from './shared/observability/request-id.middleware';
import { RequestLoggingInterceptor } from './shared/observability/request-logging.interceptor';
import { StandardResponseInterceptor } from './shared/response/standard-response.interceptor';
import { createValidationPipe } from './shared/validation/validation.pipe';
import { ProviderConfigSeedService } from './modules/settings/application/services/provider-config-seed.service';
import { PaymentGatewayConfigSeedService } from './modules/settings/application/services/payment-gateway-config-seed.service';

function logBootstrapStep(label: string, startedAt: number): number {
  const now = Date.now();
  console.log(`[BootstrapTiming] ${label} in ${now - startedAt}ms`);
  return now;
}

async function runPostListenSeeds(
  app: Awaited<ReturnType<typeof NestFactory.create>>,
): Promise<void> {
  if (process.env.RUN_BOOTSTRAP_SEEDS === 'false') {
    Logger.log(
      'Post-listen seeds disabled (RUN_BOOTSTRAP_SEEDS=false)',
      'Bootstrap',
    );
    return;
  }

  Logger.log(
    'Running provider/payment seed checks in background...',
    'Bootstrap',
  );

  const seedTasks = [
    {
      label: 'Provider seed',
      run: async () => app.get(ProviderConfigSeedService).ensureSeed(),
    },
    {
      label: 'Payment gateway seed',
      run: async () => app.get(PaymentGatewayConfigSeedService).ensureSeed(),
    },
  ];

  await Promise.allSettled(
    seedTasks.map(async ({ label, run }) => {
      const startedAt = Date.now();
      try {
        await run();
        Logger.log(
          `${label} complete in ${Date.now() - startedAt}ms`,
          'Bootstrap',
        );
      } catch (err) {
        Logger.warn(`${label} skipped: ${(err as Error).message}`, 'Bootstrap');
      }
    }),
  );
}

async function bootstrap() {
  try {
    const bootstrapStartedAt = Date.now();
    let stepStartedAt = bootstrapStartedAt;
    const logLevels = LoggingConfig.getNestLoggerLevels();
    Logger.log('Starting application...', 'Bootstrap');
    const app = await NestFactory.create(AppModule, {
      rawBody: true,
      bufferLogs: true,
      logger: logLevels,
    });
    app.flushLogs();

    const json = await import('body-parser').then(
      (m) => m.default?.json ?? m.json,
    );
    app.use(json({ limit: '10mb' }));

    stepStartedAt = logBootstrapStep('NestFactory created', stepStartedAt);
    Logger.log(
      `Nest logger configured: levels=${logLevels.join(',')}`,
      'Bootstrap',
    );

    const configService = app.get(AppConfigService);
    // Client-IP resolution: by default trust only private/loopback peers
    // (our own reverse proxy) — public peers are the real client, so their
    // spoofable X-Forwarded-For headers are ignored. Operators can pin an
    // exact proxy count with TRUST_PROXY_HOPS (verified production path).
    const trustProxy =
      configService.app.trustProxyHops > 0
        ? configService.app.trustProxyHops
        : trustPrivatePeers;
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
    const isProd = configService.app.nodeEnv === 'production';
    const configuredOrigins = (process.env.FRONTEND_URLS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    const allowedOrigins = new Set([
      ...configuredOrigins,
      'https://demo.travelsota.com',
    ]);

    app.enableCors({
      origin: isProd
        ? (origin, callback) =>
            callback(null, !origin || allowedOrigins.has(origin))
        : true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'x-demo-session-id',
      ],
      exposedHeaders: ['Set-Cookie'],
      maxAge: 86400,
    });

    app.use(cookieParser());
    app.use(
      helmet({
        crossOriginEmbedderPolicy: false, // required for Socket.IO WebSocket upgrade in dev
        contentSecurityPolicy: {
          directives: {
            frameAncestors: isProd
              ? ["'self'", ...allowedOrigins]
              : ["'self'", 'http://localhost:3000', 'http://127.0.0.1:3000'],
          },
        },
      }),
    );

    // SSE anti-buffering middleware: set headers on streaming endpoints
    // before any response buffering occurs
    app.use((req: any, res: any, next: any) => {
      if (req.path?.includes('/events')) {
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }
      next();
    });
    app.use(requestIdMiddleware);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new GlobalExceptionFilter());

    const reflector = app.get(Reflector);
    app.useGlobalInterceptors(
      new RequestLoggingInterceptor(),
      new StandardResponseInterceptor(reflector),
    );

    app.enableShutdownHooks();
    stepStartedAt = logBootstrapStep(
      'HTTP middleware configured',
      stepStartedAt,
    );

    const port = configService.app.port;
    await app.listen(port, '0.0.0.0');
    logBootstrapStep('HTTP server listening', stepStartedAt);
    Logger.log(`Listening on http://localhost:${port}`, 'Bootstrap');
    console.log(
      `[BootstrapTiming] Application bootstrap complete in ${Date.now() - bootstrapStartedAt}ms`,
    );
    console.log(`Application bootstrap complete`);

    void runPostListenSeeds(app);
  } catch (error: unknown) {
    const err = error as Error;
    Logger.error(
      `Bootstrap failed: ${err?.message ?? String(error)}`,
      err?.stack,
      'Bootstrap',
    );
    console.error(err?.stack ?? err?.message ?? error);
    process.exit(1);
  }
}

// Handle unhandled rejections.
// IMPORTANT: do NOT exit here. An unhandled rejection inside one provider call
// (e.g. a supplier validate/check-rate failure) must not take the whole API
// down — exiting turned a single failed request into a platform-wide outage
// (auto-restart gap → Cloudflare 502 for every route). Log loudly and keep
// serving; the request-level exception filter handles error responses.
process.on('unhandledRejection', (reason) => {
  Logger.error(
    `Unhandled Rejection (process kept alive): ${
      reason instanceof Error
        ? (reason.stack ?? reason.message)
        : String(reason)
    }`,
    undefined,
    'Bootstrap',
  );
});

process.on('uncaughtException', (error) => {
  Logger.error(
    `Uncaught Exception: ${error?.message ?? error}`,
    error?.stack,
    'Bootstrap',
  );
  process.exit(1);
});

bootstrap().catch((error) => {
  const err = error as Error;
  Logger.error(
    `Bootstrap promise rejected: ${err?.message ?? String(error)}`,
    err?.stack,
    'Bootstrap',
  );
  process.exit(1);
});
