import { Controller, Get, Delete, Param, Res, Sse, Logger, NotFoundException } from '@nestjs/common';
import { ResponseMessage } from '../../shared/response/response-message.decorator';
import { Response } from 'express';
import { Observable, Subscriber } from 'rxjs';
import { SearchJobService } from './search-job.service';
import { SearchProgressEvent, SearchJobState } from './search-job.types';

@Controller('search-jobs')
export class SearchJobController {
  private readonly logger = new Logger(SearchJobController.name);

  constructor(private readonly jobService: SearchJobService) {}

  @Sse(':searchId/events')
  streamEvents(
    @Param('searchId') searchId: string,
  ): Observable<{ data: SearchProgressEvent }> {
    return new Observable<{ data: SearchProgressEvent }>((subscriber) => {
      let closed = false;

      const send = (event: SearchProgressEvent) => {
        if (!closed) {
          subscriber.next({ data: event });
        }
      };

      // Heartbeat: defeats proxy/CDN buffering and lets the client detect a
      // dead stream. Comment-style keepalives aren't possible through Nest's
      // @Sse wrapper, so we send a tiny typed event the client ignores.
      const heartbeat = setInterval(() => {
        send({ type: 'heartbeat', timestamp: Date.now() });
      }, 15000);

      // Replay existing snapshot first
      this.jobService.getSnapshot(searchId).then((events) => {
        if (closed) return;
        for (const event of events) {
          send(event);
        }

        // Check if job already terminated
        const lastEvent = events[events.length - 1];
        if (lastEvent && (lastEvent.type === 'search_completed' || lastEvent.type === 'search_failed')) {
          clearInterval(heartbeat);
          subscriber.complete();
          closed = true;
          return;
        }

        // Listen for new events
        const listener = (event: SearchProgressEvent) => send(event);
        this.jobService.on(`event:${searchId}`, listener);

        subscriber.add(() => {
          closed = true;
          clearInterval(heartbeat);
          this.jobService.removeListener(`event:${searchId}`, listener);
        });
      });

      return () => {
        closed = true;
        clearInterval(heartbeat);
      };
    });
  }

  @Get(':searchId/result')
  async getResult(@Param('searchId') searchId: string) {
    const result = await this.jobService.retrieveResult(searchId);
    if (!result) {
      throw new NotFoundException('Search result not found or expired');
    }
    return result;
  }

  @Delete(':searchId')
  @ResponseMessage('Search job cancelled.')
  async cancelJob(@Param('searchId') searchId: string) {
    await this.jobService.cancelJob(searchId);
    return {
      searchId,
      cancelled: true,
    };
  }
}
