import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Global, Logger, Module } from '@nestjs/common';
import { redisStore } from 'cache-manager-redis-yet';
import { AppConfigModule } from '../config/app-config.module';
import { AppConfigService } from '../config/app-config.service';
import { CacheService } from './cache.service';

const logger = new Logger('CacheModule');

@Global()
@Module({
  imports: [
    AppConfigModule,
    NestCacheModule.registerAsync({
      inject: [AppConfigService],
      useFactory: async (configService: AppConfigService) => {
        const baseConfig = {
          ttl: configService.cache.defaultTtlSeconds,
        };

        const useUpstashRest = Boolean(
          configService.cache.upstashRestUrl &&
          configService.cache.upstashRestToken,
        );

        if (!configService.cache.redisUrl || useUpstashRest) {
          return baseConfig;
        }

        try {
          const store = await redisStore({
            url: configService.cache.redisUrl,
            socket: {
              tls: configService.cache.redisUrl.startsWith('rediss://') ? true : undefined,
              reconnectStrategy: (retries: number) => {
                if (retries > 10) {
                  logger.warn('Cache Redis: max reconnect retries reached, degrading to memory');
                  return false;
                }
                return Math.min(retries * 200, 5000);
              },
            },
            pingInterval: 30_000,
          });

          // Swallow Redis client errors so socket issues don't crash the app.
          // The CacheService already has its own ioredis fallback layer, so
          // cache-manager-redis-yet is only the second-line fallback.
          const client = (store as any).client;
          if (client?.on) {
            client.on('error', (err: Error) => {
              logger.warn(`Cache Redis client error (swallowed): ${err.message}`);
            });
            client.on('end', () => {
              logger.warn('Cache Redis connection closed — requests degrade to memory');
            });
          }

          return { ...baseConfig, store };
        } catch (err) {
          logger.warn(
            `Cache Redis store init failed — degrading to in-memory: ${err instanceof Error ? err.message : String(err)}`,
          );
          return baseConfig;
        }
      },
    }),
  ],
  providers: [CacheService],
  exports: [NestCacheModule, CacheService],
})
export class CacheModule {}
