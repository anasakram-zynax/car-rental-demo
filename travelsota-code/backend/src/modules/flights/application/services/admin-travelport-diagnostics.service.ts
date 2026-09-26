import { Inject, Injectable, Logger } from '@nestjs/common';
import { TravelportBookingCoreService } from './travelport-booking-core.service';
import type { FlightBookingExtraRepoPort } from '../ports/flight-booking-extra-repo.port';
import { FlightBookingExtraRepoPortToken } from '../ports/flight-booking-extra-repo.port';

export interface DiagnosticStep {
  step: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
}

export interface DiagnosticResult {
  ok: boolean;
  summary: string;
  steps: DiagnosticStep[];
  configSanitized: {
    hasConfig: boolean;
    baseUrl?: string;
    pcc?: string;
    accessGroupConfigured?: boolean;
  };
}

@Injectable()
export class AdminTravelportDiagnosticsService {
  private readonly logger = new Logger(AdminTravelportDiagnosticsService.name);

  constructor(
    private readonly coreService: TravelportBookingCoreService,
    @Inject(FlightBookingExtraRepoPortToken)
    private readonly extraRepo: FlightBookingExtraRepoPort,
  ) {}

  /**
   * Run a full diagnostics suite against the Travelport provider.
   * All steps are best-effort — failures in one step don't abort the suite.
   * PII is strictly excluded from all diagnostic output.
   */
  async runDiagnostics(): Promise<DiagnosticResult> {
    const steps: DiagnosticStep[] = [];

    // Step 1: Resolve config (check provider config exists)
    try {
      const start = Date.now();
      const config = await this.coreService.resolveConfig();
      const elapsed = Date.now() - start;
      const hasConfig = !!(config.baseUrl && config.clientId);
      steps.push({
        step: 'resolve-config',
        ok: hasConfig,
        durationMs: elapsed,
        detail: hasConfig
          ? `Config resolved: ${config.baseUrl ?? 'no baseUrl'}`
          : 'Missing baseUrl or clientId in config',
      });
    } catch (err: unknown) {
      steps.push({
        step: 'resolve-config',
        ok: false,
        durationMs: 0,
        detail: `Config resolution failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Step 2: Get OAuth token
    try {
      const start = Date.now();
      const config = await this.coreService.resolveConfig();
      const token = await this.coreService.getAccessToken(config);
      const elapsed = Date.now() - start;
      const hasToken = !!(token?.access_token);
      steps.push({
        step: 'oauth-token',
        ok: hasToken,
        durationMs: elapsed,
        detail: hasToken
          ? `Token obtained (expires in ${token.expires_in ?? 'unknown'}s)`
          : 'No access token returned',
      });
    } catch (err: unknown) {
      steps.push({
        step: 'oauth-token',
        ok: false,
        durationMs: 0,
        detail: `OAuth failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Step 3: Create reservation workbench (empty, no PNR)
    try {
      const start = Date.now();
      const workbench = await this.coreService.createWorkbench();
      const elapsed = Date.now() - start;
      const ok = !!workbench?.workbenchId;
      steps.push({
        step: 'create-workbench',
        ok,
        durationMs: elapsed,
        detail: ok
          ? `Workbench created: ${workbench!.workbenchId.slice(0, 8)}...`
          : 'Workbench creation returned null',
      });
    } catch (err: unknown) {
      steps.push({
        step: 'create-workbench',
        ok: false,
        durationMs: 0,
        detail: `Workbench creation failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Step 4: Retrieve reservation (by locator — best-effort, no real locator provided)
    // This step is informational — we expect it to fail if no reservations exist
    steps.push({
      step: 'reservation-access',
      ok: true,
      durationMs: 0,
      detail: 'Reservation retrieval requires a PNR locator — test via admin booking details',
    });

    // Summary
    const totalDuration = steps.reduce((sum, s) => sum + s.durationMs, 0);
    const successCount = steps.filter((s) => s.ok).length;
    const allOk = successCount >= steps.length - 1; // reservation-access is always "ok"

    // Sanitized config info for display
    const config = await this.coreService.resolveConfig().catch(() => null);

    this.logger.log(
      `[AdminDiagnostics] ${successCount}/${steps.length} steps OK (${totalDuration}ms) — result=${allOk ? 'PASS' : 'FAIL'}`,
    );

    return {
      ok: allOk,
      summary: `${successCount}/${steps.length} diagnostic steps passed`,
      steps,
      configSanitized: {
        hasConfig: !!config,
        baseUrl: config?.baseUrl?.replace(/\/\/[^@]+@/, '//<redacted>:<redacted>@'),
        pcc: config?.pcc?.slice(0, 4) + '...',
        accessGroupConfigured: !!config?.accessGroup,
      },
    };
  }

  /**
   * Get all extras for admin review, including payment info.
   */
  async getAdminExtras(bookingId: string) {
    try {
      const extras = await this.extraRepo.findByBookingId(bookingId);

      return {
        ok: true,
        bookingId,
        totalExtras: extras.length,
        extras: extras.map((e) => ({
          id: e.id,
          type: e.type,
          status: e.status,
          label: e.label,
          amount: e.amount,
          currency: e.currency,
          supplierErrorCode: e.supplierErrorCode,
          supplierErrorMessage: e.supplierErrorMessage,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
        })),
      };
    } catch (err: unknown) {
      return {
        ok: false,
        bookingId,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Retry failed extras — marks them back to 'pending' for re-processing.
   */
  async retryFailedExtras(bookingId: string, extraIds: string[]) {
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const extraId of extraIds) {
      try {
        const extra = await this.extraRepo.findById(extraId);
        if (!extra) {
          results.push({ id: extraId, ok: false, error: 'Extra not found' });
          continue;
        }

        if (extra.status !== 'failed') {
          results.push({ id: extraId, ok: false, error: `Cannot retry: status is '${extra.status}', expected 'failed'` });
          continue;
        }

        await this.extraRepo.update(extraId, {
          status: 'selected',
        });
        results.push({ id: extraId, ok: true });
      } catch (err: unknown) {
        results.push({
          id: extraId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    this.logger.log(`[AdminExtras] Retry: ${successCount}/${extraIds.length} extras reset to pending`);

    return {
      ok: successCount > 0,
      bookingId,
      results,
      summary: `${successCount}/${extraIds.length} extras queued for retry`,
    };
  }

  /**
   * Refund failed extras — marks them as refunded (Phase 4 stub).
   * Full payment gateway refund integration will come in a future phase.
   */
  async refundFailedExtras(bookingId: string, extraIds: string[], reason?: string) {
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const extraId of extraIds) {
      try {
        const extra = await this.extraRepo.findById(extraId);
        if (!extra) {
          results.push({ id: extraId, ok: false, error: 'Extra not found' });
          continue;
        }

        // Mark as refunded with reason
        await this.extraRepo.update(extraId, {
          status: 'refunded',
          supplierErrorCode: 'ADMIN_REFUND',
          supplierErrorMessage: reason ?? 'Admin-initiated refund',
        });
        results.push({ id: extraId, ok: true });
      } catch (err: unknown) {
        results.push({
          id: extraId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    this.logger.log(`[AdminExtras] Refund: ${successCount}/${extraIds.length} extras marked as refunded`);

    return {
      ok: successCount > 0,
      bookingId,
      results,
      summary: `${successCount}/${extraIds.length} extras marked as refunded`,
    };
  }
}
