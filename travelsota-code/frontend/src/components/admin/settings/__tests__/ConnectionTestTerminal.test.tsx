import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConnectionTestTerminal from '@/components/admin/settings/ConnectionTestTerminal';
import type { ProviderConnectionTestResult } from '@/components/admin/settings/ConnectionTestTerminal';

const makeResult = (overrides?: Partial<ProviderConnectionTestResult>): ProviderConnectionTestResult => ({
  provider: 'ratehawk',
  module: 'hotels',
  environment: 'sandbox',
  success: true,
  startedAt: '2026-01-15T12:42:10.000Z',
  completedAt: '2026-01-15T12:42:11.842Z',
  durationMs: 842,
  summary: 'RateHawk sandbox connection verified.',
  checks: [
    { id: 'config', label: 'Configuration', status: 'success', message: 'All required fields present.', durationMs: 10 },
    { id: 'auth', label: 'Authentication', status: 'success', message: 'Auth accepted by RateHawk.', durationMs: 210 },
    { id: 'overview', label: 'Overview Endpoint', status: 'success', message: 'HTTP 200: Overview endpoint reachable.', durationMs: 320, httpStatus: 200, endpoint: 'https://api-sandbox.worldota.net/api/b2b/v3/overview/', method: 'GET' },
    { id: 'endpoints', label: 'Allowed Endpoints', status: 'success', message: '3 endpoint(s) available.', durationMs: 0 },
    { id: 'rateLimits', label: 'Rate Limits', status: 'info', message: '30 req / 60s', durationMs: 0 },
    { id: 'contentApi', label: 'Content API', status: 'success', message: 'All content endpoints reachable.', durationMs: 150 },
  ],
  warnings: [{ code: 'TEST_MODE', message: 'Testing in sandbox mode.' }],
  ...overrides,
});

beforeEach(() => {
  // Mock clipboard API
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('ConnectionTestTerminal', () => {
  it('renders nothing when no result and not running', () => {
    const { container } = render(<ConnectionTestTerminal result={null} running={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows a spinner when running', () => {
    render(<ConnectionTestTerminal result={null} running={true} />);
    expect(screen.getByText('Testing provider connection...')).toBeDefined();
    expect(screen.getByText('Connection Test — Running...')).toBeDefined();
  });

  it('renders success check messages', () => {
    render(<ConnectionTestTerminal result={makeResult()} running={false} />);
    expect(screen.getByText('All required fields present.')).toBeDefined();
    expect(screen.getByText('Auth accepted by RateHawk.')).toBeDefined();
    expect(screen.getByText('HTTP 200: Overview endpoint reachable.')).toBeDefined();
  });

  it('renders warning check text in amber style', () => {
    const result = makeResult();
    result.checks.push({ id: 'testWarn', label: 'Test Warn', status: 'warning', message: 'Endpoint partially unreachable.', durationMs: 0 });
    render(<ConnectionTestTerminal result={result} running={false} />);
    expect(screen.getByText('Endpoint partially unreachable.')).toBeDefined();
    // WARNING label should appear
    expect(screen.getAllByText('WARNING').length).toBeGreaterThan(0);
  });

  it('renders failed checks in red', () => {
    const result = makeResult({ success: false });
    result.checks = [
      { id: 'config', label: 'Configuration', status: 'failed', message: 'Missing required fields: apiKey', durationMs: 10 },
    ];
    render(<ConnectionTestTerminal result={result} running={false} />);
    expect(screen.getByText('Missing required fields: apiKey')).toBeDefined();
    expect(screen.getByText('FAILED')).toBeDefined();
    expect(screen.getByText('Failed')).toBeDefined(); // Header shows "Failed"
  });

  it('renders warning messages from the warnings array', () => {
    render(<ConnectionTestTerminal result={makeResult()} running={false} />);
    expect(screen.getByText('Testing in sandbox mode.')).toBeDefined();
  });

  it('shows environment badge', () => {
    render(<ConnectionTestTerminal result={makeResult()} running={false} />);
    expect(screen.getByText('sandbox')).toBeDefined();
  });

  it('shows duration in summary', () => {
    render(<ConnectionTestTerminal result={makeResult()} running={false} />);
    expect(screen.getByText('842ms')).toBeDefined();
  });

  it('has Copy button', () => {
    render(<ConnectionTestTerminal result={makeResult()} running={false} />);
    const copyBtn = screen.getByText('Copy');
    expect(copyBtn).toBeDefined();
  });

  it('copies diagnostics to clipboard when Copy is clicked', async () => {
    // Add a check with safeDetails containing secret-like values
    const result = makeResult();
    result.checks.push({
      id: 'secretCheck',
      label: 'Secret Check',
      status: 'info',
      message: 'Contains secrets',
      safeDetails: { apiKey: 'my-raw-secret-value-1234', token: 'bearer-token-here' },
      durationMs: 0,
    });

    render(<ConnectionTestTerminal result={result} running={false} />);
    fireEvent.click(screen.getByText('Copy'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
    const clipboardText = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
    // Verify clipboard content includes check messages
    expect(clipboardText).toContain('All required fields present.');
    expect(clipboardText).toContain('Auth accepted by RateHawk.');
    // Verify warning codes are included
    expect(clipboardText).toContain('TEST_MODE');
    // Verify raw secret values are NOT included in clipboard output
    expect(clipboardText).not.toContain('my-raw-secret-value-1234');
    expect(clipboardText).not.toContain('bearer-token-here');
  });

  it('has Clear button when onClear is provided', () => {
    const onClear = vi.fn();
    render(<ConnectionTestTerminal result={makeResult()} running={false} onClear={onClear} />);
    expect(screen.getByText('Clear')).toBeDefined();
  });

  it('calls onClear when Clear button is clicked', () => {
    const onClear = vi.fn();
    render(<ConnectionTestTerminal result={makeResult()} running={false} onClear={onClear} />);
    fireEvent.click(screen.getByText('Clear'));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('does not render Clear button when onClear is not provided', () => {
    render(<ConnectionTestTerminal result={makeResult()} running={false} />);
    expect(screen.queryByText('Clear')).toBeNull();
  });

  it('shows HTTP status for checks with httpStatus', () => {
    render(<ConnectionTestTerminal result={makeResult()} running={false} />);
    // Click expand on the overview check to show endpoint details
    const expandBtns = screen.getAllByText('▼');
    fireEvent.click(expandBtns[0]);
    // Multiple elements contain 'HTTP 200' — use getAllByText
    const matches = screen.getAllByText(/HTTP 200/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders info status check messages', () => {
    render(<ConnectionTestTerminal result={makeResult()} running={false} />);
    expect(screen.getByText('30 req / 60s')).toBeDefined();
  });

  it('shows Passed status when successful', () => {
    render(<ConnectionTestTerminal result={makeResult({ success: true })} running={false} />);
    expect(screen.getByText('Passed')).toBeDefined();
  });

  it('shows Failed status when unsuccessful', () => {
    render(<ConnectionTestTerminal result={makeResult({ success: false })} running={false} />);
    expect(screen.getByText('Failed')).toBeDefined();
  });

  it('renders the connection summary line', () => {
    render(<ConnectionTestTerminal result={makeResult()} running={false} />);
    expect(screen.getByText('RateHawk sandbox connection verified.')).toBeDefined();
  });
});
