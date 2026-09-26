import { describe, it, expect, vi } from 'vitest';
import {
  runTravelportDiagnostics,
  getAdminBookingExtras,
  retryFailedExtras,
  refundFailedExtras,
} from '../admin-flights';

vi.mock('@/lib/api/admin-client', () => ({
  adminRequest: vi.fn(),
}));

import { adminRequest } from '@/lib/api/admin-client';

describe('runTravelportDiagnostics', () => {
  it('calls adminRequest with correct endpoint', async () => {
    vi.mocked(adminRequest).mockResolvedValue({
      ok: true,
      summary: 'All checks passed',
      steps: [],
      configSanitized: { hasConfig: true },
    });

    await runTravelportDiagnostics();

    expect(adminRequest).toHaveBeenCalledWith('/admin/flights/diagnostics/travelport');
  });

  it('returns diagnostic result', async () => {
    const expected = {
      ok: true,
      summary: 'All checks passed',
      steps: [
        { step: 'OAuth', ok: true, durationMs: 350 },
        { step: 'GDS Search', ok: true, durationMs: 1200 },
      ],
      configSanitized: { hasConfig: true, baseUrl: 'https://api.travelport.com' },
    };
    vi.mocked(adminRequest).mockResolvedValue(expected);

    const result = await runTravelportDiagnostics();
    expect(result).toEqual(expected);
  });

  it('propagates errors', async () => {
    const error = { statusCode: 500, message: 'Diagnostics failed' };
    vi.mocked(adminRequest).mockRejectedValue(error);

    await expect(runTravelportDiagnostics()).rejects.toEqual(error);
  });
});

describe('getAdminBookingExtras', () => {
  it('calls adminRequest with booking ID in endpoint', async () => {
    vi.mocked(adminRequest).mockResolvedValue({
      ok: true,
      bookingId: 'b-1',
      totalExtras: 0,
      extras: [],
    });

    await getAdminBookingExtras('b-1');

    expect(adminRequest).toHaveBeenCalledWith('/admin/flights/bookings/b-1/extras');
  });

  it('returns extras response', async () => {
    const expected = {
      ok: true,
      bookingId: 'b-1',
      totalExtras: 2,
      extras: [
        { id: 'e-1', type: 'seat', status: 'confirmed', amount: 25, currency: 'USD', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 'e-2', type: 'baggage', status: 'failed', amount: 50, currency: 'USD', supplierErrorCode: 'ERR-1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      ],
    };
    vi.mocked(adminRequest).mockResolvedValue(expected);

    const result = await getAdminBookingExtras('b-1');
    expect(result.extras).toHaveLength(2);
    expect(result.extras[1].supplierErrorCode).toBe('ERR-1');
  });

  it('propagates errors', async () => {
    vi.mocked(adminRequest).mockRejectedValue(new Error('Not found'));
    await expect(getAdminBookingExtras('b-999')).rejects.toThrow('Not found');
  });
});

describe('retryFailedExtras', () => {
  it('calls adminRequest with POST method and extra IDs', async () => {
    vi.mocked(adminRequest).mockResolvedValue({
      ok: true,
      bookingId: 'b-1',
      results: [{ id: 'e-2', ok: true }],
      summary: '1 extra retried',
    });

    await retryFailedExtras('b-1', ['e-2']);

    expect(adminRequest).toHaveBeenCalledWith('/admin/flights/bookings/b-1/extras/retry', {
      method: 'POST',
      body: { extraIds: ['e-2'] },
    });
  });

  it('can retry multiple extras at once', async () => {
    vi.mocked(adminRequest).mockResolvedValue({
      ok: true, bookingId: 'b-1',
      results: [{ id: 'e-2', ok: true }, { id: 'e-3', ok: false, error: 'Already confirmed' }],
      summary: '1 retried, 1 skipped',
    });

    const result = await retryFailedExtras('b-1', ['e-2', 'e-3']);
    expect(result.results).toHaveLength(2);
    expect(result.results[1].ok).toBe(false);
  });

  it('propagates errors', async () => {
    vi.mocked(adminRequest).mockRejectedValue(new Error('Server error'));
    await expect(retryFailedExtras('b-1', ['e-2'])).rejects.toThrow('Server error');
  });
});

describe('refundFailedExtras', () => {
  it('calls adminRequest with POST method, extra IDs, and reason', async () => {
    vi.mocked(adminRequest).mockResolvedValue({
      ok: true, bookingId: 'b-1',
      results: [{ id: 'e-2', ok: true }],
      summary: '1 extra refunded',
    });

    await refundFailedExtras('b-1', ['e-2'], 'Supplier failed to add extra');

    expect(adminRequest).toHaveBeenCalledWith('/admin/flights/bookings/b-1/extras/refund', {
      method: 'POST',
      body: { extraIds: ['e-2'], reason: 'Supplier failed to add extra' },
    });
  });

  it('works without a reason', async () => {
    vi.mocked(adminRequest).mockResolvedValue({
      ok: true, bookingId: 'b-1',
      results: [{ id: 'e-2', ok: true }],
      summary: '1 extra refunded',
    });

    await refundFailedExtras('b-1', ['e-2']);

    expect(adminRequest).toHaveBeenCalledWith('/admin/flights/bookings/b-1/extras/refund', {
      method: 'POST',
      body: { extraIds: ['e-2'] },
    });
  });
});
