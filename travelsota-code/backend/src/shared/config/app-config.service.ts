import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from './app-config.constants';
import type { AppConfig } from './app-config.types';

@Injectable()
export class AppConfigService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get app() {
    return this.config.app;
  }

  get http() {
    return this.config.http;
  }

  get flights() {
    return this.config.flights;
  }

  get auth() {
    return this.config.auth;
  }

  get travelport() {
    return this.config.travelport;
  }

  get currency() {
    return this.config.currency;
  }

  get hotelbeds() {
    return this.config.hotelbeds;
  }

  get hotelContent() {
    return this.config.hotelContent;
  }

  get cache() {
    return this.config.cache;
  }

  get rateLimit() {
    return this.config.rateLimit;
  }

  get demo() {
    return this.config.demo;
  }
}
