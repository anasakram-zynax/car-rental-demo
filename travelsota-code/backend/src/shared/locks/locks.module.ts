import { Global, Module } from '@nestjs/common';
import { PostgresAdvisoryLockService } from './postgres-advisory-lock.service';

@Global()
@Module({
  providers: [PostgresAdvisoryLockService],
  exports: [PostgresAdvisoryLockService],
})
export class LocksModule {}
