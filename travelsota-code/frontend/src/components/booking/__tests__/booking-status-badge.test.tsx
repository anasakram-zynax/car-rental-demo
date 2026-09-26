import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookingStatusBadge } from '../booking-status-badge';

describe('BookingStatusBadge', () => {
  it('shows "Confirmed" for held, booked, and ticketed alike', () => {
    render(<BookingStatusBadge status="held" />);
    expect(screen.getByText('Confirmed')).toBeDefined();
  });

  it('shows "Confirmed" for booked', () => {
    render(<BookingStatusBadge status="booked" />);
    expect(screen.getByText('Confirmed')).toBeDefined();
  });

  it('shows "Confirmed" for ticketed', () => {
    render(<BookingStatusBadge status="ticketed" />);
    expect(screen.getByText('Confirmed')).toBeDefined();
  });

  it('does not show the raw "held"/"ticketed" words anywhere', () => {
    render(<BookingStatusBadge status="held" />);
    expect(screen.queryByText(/held/i)).toBeNull();
    expect(screen.queryByText(/ticketed/i)).toBeNull();
  });

  it('still shows a distinct label for failed statuses', () => {
    render(<BookingStatusBadge status="failed_supplier_booking" />);
    expect(screen.getByText('Supplier Failed')).toBeDefined();
  });

  it('still shows Cancelled for cancelled bookings', () => {
    render(<BookingStatusBadge status="cancelled" />);
    expect(screen.getByText('Cancelled')).toBeDefined();
  });

  it('falls back to a title-cased label for an unknown status', () => {
    render(<BookingStatusBadge status="some_new_status" />);
    expect(screen.getByText('Some New Status')).toBeDefined();
  });
});
