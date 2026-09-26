import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { CacheService } from '../../shared/cache/cache.service';
import {
  SearchJobState,
  SearchProgressEvent,
  SearchKind,
  SearchJobStartResponse,
} from './search-job.types';

const JOB_TTL_SECONDS = 300; // 5 minutes

@Injectable()
export class SearchJobService extends EventEmitter {
  private readonly logger = new Logger(SearchJobService.name);

  constructor(private readonly cache: CacheService) {
    super();
    this.setMaxListeners(50);
  }

  private jobKey(searchId: string) {
    return `search-job:${searchId}`;
  }

  private resultKey(searchId: string) {
    return `search-job-result:${searchId}`;
  }

  async createJob(
    kind: SearchKind,
    suppliers: Array<{ key: string; label: string }>,
  ): Promise<SearchJobStartResponse> {
    const searchId =
      kind === 'flights'
        ? `fsj_${randomUUID().replace(/-/g, '').slice(0, 16)}`
        : `hsj_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const state: SearchJobState = {
      searchId,
      kind,
      lifecycle: 'pending',
      suppliers: suppliers.map((s) => ({
        key: s.key,
        label: s.label,
        phase: 'queued' as const,
        resultCount: null,
      })),
      totalResults: null,
      startedAt: Date.now(),
      events: [],
    };

    await this.cache.set(this.jobKey(searchId), state, JOB_TTL_SECONDS);

    const startedEvent: SearchProgressEvent = {
      type: 'search_started',
      searchId,
      kind,
      suppliers,
      timestamp: Date.now(),
    };
    await this.appendEvent(searchId, startedEvent);

    this.logger.log(
      `[SearchJob] Created ${kind} job ${searchId} with ${suppliers.length} suppliers`,
    );

    return {
      searchId,
      eventsUrl: `/search-jobs/${searchId}/events`,
      resultUrl: `/search-jobs/${searchId}/result`,
    };
  }

  async getJob(searchId: string): Promise<SearchJobState | null> {
    return this.cache.get<SearchJobState>(this.jobKey(searchId));
  }

  async getSnapshot(searchId: string): Promise<SearchProgressEvent[]> {
    const job = await this.getJob(searchId);
    return job?.events ?? [];
  }

  private async appendEvent(
    searchId: string,
    event: SearchProgressEvent,
  ): Promise<void> {
    // Always emit via SSE so live subscribers receive the event
    this.emit(`event:${searchId}`, event);

    // Don't persist large result payloads in job.events — they're streamed live via SSE.
    // Only persist lightweight lifecycle events to keep Redis/memory usage bounded.
    if (
      event.type === 'supplier_results' ||
      event.type === 'supplier_results_ready' ||
      event.type === 'supplier_results_enriched'
    ) {
      return;
    }

    const job = await this.getJob(searchId);
    if (!job) return;

    job.events.push(event);
    await this.cache.set(this.jobKey(searchId), job, JOB_TTL_SECONDS);
  }

  async reportSupplierStarted(
    searchId: string,
    supplierKey: string,
    phase: 'connecting' | 'searching',
  ): Promise<void> {
    const job = await this.getJob(searchId);
    if (!job || job.lifecycle === 'cancelled') return;

    if (job.lifecycle === 'pending') {
      job.lifecycle = 'running';
      await this.cache.set(this.jobKey(searchId), job, JOB_TTL_SECONDS);
    }

    const supplier = job.suppliers.find((s) => s.key === supplierKey);
    if (supplier) supplier.phase = phase;
    await this.cache.set(this.jobKey(searchId), job, JOB_TTL_SECONDS);

    const event: SearchProgressEvent = {
      type: 'supplier_started',
      supplierKey,
      phase,
      timestamp: Date.now(),
    };
    await this.appendEvent(searchId, event);
  }

  async reportSupplierCompleted(
    searchId: string,
    supplierKey: string,
    resultCount: number,
    elapsedMs: number,
  ): Promise<void> {
    const job = await this.getJob(searchId);
    if (!job || job.lifecycle === 'cancelled') return;

    const supplier = job.suppliers.find((s) => s.key === supplierKey);
    if (supplier) {
      supplier.phase = 'completed';
      supplier.resultCount = resultCount;
      supplier.elapsedMs = elapsedMs;
    }
    await this.cache.set(this.jobKey(searchId), job, JOB_TTL_SECONDS);

    const event: SearchProgressEvent = {
      type: 'supplier_completed',
      supplierKey,
      resultCount,
      elapsedMs,
      timestamp: Date.now(),
    };
    await this.appendEvent(searchId, event);
  }

  async reportSupplierFailed(
    searchId: string,
    supplierKey: string,
    code: 'TIMEOUT' | 'UNAVAILABLE' | 'FAILED',
    elapsedMs: number,
  ): Promise<void> {
    const job = await this.getJob(searchId);
    if (!job || job.lifecycle === 'cancelled') return;

    const supplier = job.suppliers.find((s) => s.key === supplierKey);
    if (supplier) {
      supplier.phase = code === 'TIMEOUT' ? 'timed_out' : 'failed';
      supplier.errorCode = code;
      supplier.elapsedMs = elapsedMs;
    }
    await this.cache.set(this.jobKey(searchId), job, JOB_TTL_SECONDS);

    const event: SearchProgressEvent = {
      type: 'supplier_failed',
      supplierKey,
      code,
      elapsedMs,
      timestamp: Date.now(),
    };
    await this.appendEvent(searchId, event);
  }

  async reportSupplierResults(
    searchId: string,
    supplierKey: string,
    results: unknown[],
  ): Promise<void> {
    const job = await this.getJob(searchId);
    if (!job || job.lifecycle === 'cancelled') return;

    const event: SearchProgressEvent = {
      type: 'supplier_results',
      supplierKey,
      results,
      timestamp: Date.now(),
    };
    await this.appendEvent(searchId, event);
  }

  /**
   * Emit a supplier_results_ready event containing display-ready, enriched,
   * mapped results for a single supplier. The frontend should consume this
   * event to progressively render cards while the search is still running.
   */
  async reportSupplierResultsReady(
    searchId: string,
    supplierKey: string,
    searchKey: string,
    results: unknown[],
    appendMode: 'append' | 'merge' = 'append',
  ): Promise<void> {
    const job = await this.getJob(searchId);
    if (!job || job.lifecycle === 'cancelled') return;

    const event: SearchProgressEvent = {
      type: 'supplier_results_ready',
      supplierKey,
      searchKey,
      results,
      resultCount: results.length,
      appendMode,
      timestamp: Date.now(),
    };
    await this.appendEvent(searchId, event);
  }

  /**
   * Emit enriched patch event — replaces/updates previously emitted fast cards
   * with fully enriched data (airline/airport names, logos, currency breakdown).
   */
  async reportSupplierResultsEnriched(
    searchId: string,
    supplierKey: string,
    searchKey: string,
    results: unknown[],
  ): Promise<void> {
    const job = await this.getJob(searchId);
    if (!job || job.lifecycle === 'cancelled') return;

    const event: SearchProgressEvent = {
      type: 'supplier_results_enriched',
      supplierKey,
      searchKey,
      results,
      resultCount: results.length,
      timestamp: Date.now(),
    };
    await this.appendEvent(searchId, event);
  }

  async completeJob(
    searchId: string,
    totalResults: number,
    partial: boolean,
  ): Promise<void> {
    const event: SearchProgressEvent = {
      type: 'search_completed',
      totalResults,
      partial,
      timestamp: Date.now(),
    };
    // SSE-first: subscribers must be told the job ended even if the cached
    // job state is unavailable (cache miss/fallback skew). Persist below is
    // best-effort.
    await this.appendEvent(searchId, event);

    const job = await this.getJob(searchId);
    if (!job || job.lifecycle === 'cancelled') {
      this.logger.warn(
        `[SearchJob] ${searchId} completed event emitted but job state unavailable for lifecycle update`,
      );
      return;
    }

    job.lifecycle = partial ? 'partial' : 'succeeded';
    job.totalResults = totalResults;
    job.completedAt = Date.now();
    await this.cache.set(this.jobKey(searchId), job, JOB_TTL_SECONDS);

    this.logger.log(
      `[SearchJob] ${searchId} completed: ${job.lifecycle}, ${totalResults} results`,
    );
  }

  async failJob(
    searchId: string,
    code: 'ALL_SUPPLIERS_FAILED' | 'CANCELLED',
  ): Promise<void> {
    const event: SearchProgressEvent = {
      type: 'search_failed',
      code,
      timestamp: Date.now(),
    };
    await this.appendEvent(searchId, event);

    const job = await this.getJob(searchId);
    if (!job || job.lifecycle === 'cancelled') return;

    job.lifecycle = 'failed';
    job.completedAt = Date.now();
    await this.cache.set(this.jobKey(searchId), job, JOB_TTL_SECONDS);
  }

  async cancelJob(searchId: string): Promise<void> {
    const job = await this.getJob(searchId);
    if (!job) return;

    job.lifecycle = 'cancelled';
    job.completedAt = Date.now();
    await this.cache.set(this.jobKey(searchId), job, JOB_TTL_SECONDS);

    const event: SearchProgressEvent = {
      type: 'search_failed',
      code: 'CANCELLED',
      timestamp: Date.now(),
    };
    await this.appendEvent(searchId, event);
    this.logger.log(`[SearchJob] ${searchId} cancelled`);
  }

  async storeResult<T>(searchId: string, result: T): Promise<void> {
    await this.cache.set(this.resultKey(searchId), result, JOB_TTL_SECONDS);
  }

  async retrieveResult<T>(searchId: string): Promise<T | null> {
    return this.cache.get<T>(this.resultKey(searchId));
  }
}
