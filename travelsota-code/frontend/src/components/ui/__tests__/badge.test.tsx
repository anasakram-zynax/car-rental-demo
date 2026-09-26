import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, StatusBadge } from '@/components/ui/badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeDefined();
  });

  it('applies variant classes', () => {
    render(<Badge variant="success">Done</Badge>);
    const el = screen.getByText('Done');
    expect(el.className).toContain('bg-emerald-100');
  });
});

describe('StatusBadge', () => {
  it('maps confirmed to success variant', () => {
    render(<StatusBadge status="confirmed" />);
    const el = screen.getByText('confirmed');
    expect(el.className).toContain('bg-emerald-100');
  });

  it('maps failed to error variant', () => {
    render(<StatusBadge status="failed" />);
    const el = screen.getByText('failed');
    expect(el.className).toContain('bg-red-100');
  });

  it('renders unknown status as default', () => {
    render(<StatusBadge status="unknown" />);
    const el = screen.getByText('unknown');
    expect(el.className).toContain('bg-zinc-100');
  });

  it('maps held_pending_payment to info variant', () => {
    render(<StatusBadge status="held_pending_payment" />);
    const el = screen.getByText('held pending payment');
    expect(el.className).toContain('bg-blue-100');
  });

  it('maps AUTHORIZED to info variant', () => {
    render(<StatusBadge status="AUTHORIZED" />);
    const el = screen.getByText('AUTHORIZED');
    expect(el.className).toContain('bg-blue-100');
  });

  it('maps booking_in_progress to warning variant', () => {
    render(<StatusBadge status="booking_in_progress" />);
    const el = screen.getByText('booking in progress');
    expect(el.className).toContain('bg-amber-100');
  });

  it('maps hold_expired to error variant', () => {
    render(<StatusBadge status="hold_expired" />);
    const el = screen.getByText('hold expired');
    expect(el.className).toContain('bg-red-100');
  });
});
