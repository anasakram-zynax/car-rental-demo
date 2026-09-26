import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/context/CurrencyContext', () => ({
  useCurrencyData: () => ({ decimalsMap: {} }),
  useCurrency: () => ({
    convertAmount: (n: number) => n,
    selectedCurrency: { code: 'USD' },
  }),
}));

import { FlightRateComments } from '../flight-rate-comments';

describe('FlightRateComments', () => {
  it('shows a percent penalty as a fee of the fare', () => {
    render(
      <FlightRateComments
        data={{ refund: { allowed: true, penaltyPercent: 25, free: false } }}
      />,
    );
    expect(screen.getByText('Cancel fee: 25% of fare')).toBeDefined();
  });

  it('shows non-refundable when the airline does not allow refunds', () => {
    render(<FlightRateComments data={{ refund: { allowed: false } }} />);
    expect(screen.getByText('Non-refundable')).toBeDefined();
  });

  it('never claims free cancellation when the fee is simply undisclosed', () => {
    render(
      <FlightRateComments data={{ refund: { allowed: true, free: false } }} />,
    );
    expect(screen.queryByText('Free cancellation')).toBeNull();
    expect(
      screen.getByText('Refund permitted — airline fee not disclosed'),
    ).toBeDefined();
  });

  it('shows free cancellation only for a genuine zero fee', () => {
    render(<FlightRateComments data={{ refund: { allowed: true, free: true } }} />);
    expect(screen.getByText('Free cancellation')).toBeDefined();
  });
});
