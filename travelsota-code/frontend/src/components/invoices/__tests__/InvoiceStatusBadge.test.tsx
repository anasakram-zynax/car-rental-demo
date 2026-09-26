import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvoiceStatusBadge } from '../InvoiceStatusBadge';

describe('InvoiceStatusBadge', () => {
  it('renders the status text', () => {
    render(<InvoiceStatusBadge status="generated" />);
    expect(screen.getByText('generated')).toBeDefined();
  });

  it('applies generated styles', () => {
    render(<InvoiceStatusBadge status="generated" />);
    const el = screen.getByText('generated');
    expect(el.className).toContain('bg-amber-100');
  });

  it('applies sent styles', () => {
    render(<InvoiceStatusBadge status="sent" />);
    const el = screen.getByText('sent');
    expect(el.className).toContain('bg-blue-100');
  });

  it('applies viewed styles', () => {
    render(<InvoiceStatusBadge status="viewed" />);
    const el = screen.getByText('viewed');
    expect(el.className).toContain('bg-emerald-100');
  });

  it('applies paid styles', () => {
    render(<InvoiceStatusBadge status="paid" />);
    const el = screen.getByText('paid');
    expect(el.className).toContain('bg-emerald-100');
  });

  it('applies refunded styles', () => {
    render(<InvoiceStatusBadge status="refunded" />);
    const el = screen.getByText('refunded');
    expect(el.className).toContain('bg-purple-100');
  });

  it('renders unknown status with default styles', () => {
    render(<InvoiceStatusBadge status="unknown" />);
    const el = screen.getByText('unknown');
    expect(el.className).toContain('bg-gray-100');
  });
});
