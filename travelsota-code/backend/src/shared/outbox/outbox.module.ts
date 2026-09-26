import { Global, Module, OnApplicationBootstrap } from '@nestjs/common';
import { OutboxWriterService } from './application/outbox-writer.service';
import { OutboxRelayService, OUTBOX_RELAY_CONFIG, DEFAULT_RELAY_CONFIG } from './application/outbox-relay.service';
import { EventDispatcherService } from './application/event-dispatcher.service';
import { ImmediateOutboxDispatcherService } from './application/immediate-outbox-dispatcher.service';
import { OutboxRepoPortToken } from './application/outbox-repo.port';
import { PrismaOutboxRepository } from './infrastructure/prisma-outbox.repository';
import { PrismaModule } from '../database/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: OutboxRepoPortToken,
      useClass: PrismaOutboxRepository,
    },
    OutboxWriterService,
    OutboxRelayService,
    EventDispatcherService,
    ImmediateOutboxDispatcherService,
    {
      provide: OUTBOX_RELAY_CONFIG,
      useValue: DEFAULT_RELAY_CONFIG,
    },
  ],
  exports: [OutboxWriterService, OutboxRelayService, EventDispatcherService, ImmediateOutboxDispatcherService],
})
export class OutboxModule implements OnApplicationBootstrap {
  constructor(private readonly relay: OutboxRelayService) {}

  onApplicationBootstrap(): void {
    if (process.env.OUTBOX_RELAY_ENABLED === 'false') {
      return;
    }
    void this.relay.start();
  }
}
