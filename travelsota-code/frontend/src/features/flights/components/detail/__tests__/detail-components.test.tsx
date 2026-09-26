import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetailTopSummary } from '../detail-top-summary';
import { DetailJourneyTimeline } from '../detail-journey-timeline';
import { DetailBaggage } from '../detail-baggage';
import { DetailFareRules } from '../detail-fare-rules';
import { DetailPricing } from '../detail-pricing';

// ─── Fixtures ─────────────────────────────────────────────────

const baseDetailView = {
  offerId: 'off_00001',
  provider: 'duffel' as const,
  route: {
    from: { code: 'JFK', label: 'New York (JFK)', cityName: 'New York', airportName: 'John F Kennedy International Airport' },
    to: { code: 'LHR', label: 'London (LHR)', cityName: 'London', airportName: 'Heathrow Airport' },
    tripType: 'one_way' as const,
    totalDurationLabel: '12h',
    stopsLabel: 'Direct',
  },
  airline: {
    code: 'BA',
    name: 'British Airways',
    logoUrl: 'https://example.com/ba.png',
    operatingAirlineName: 'British Airways',
    conditionsOfCarriageUrl: 'https://example.com/toc',
  },
  pricing: {
    baseAmount: 500,
    taxAmount: 50,
    feesAmount: 0,
    supplierTotal: 550,
    customerTotal: 550,
    currency: 'USD',
    offerExpiresAt: '2026-08-16T00:00:00Z',
    priceGuaranteeExpiresAt: '2026-08-15T12:00:00Z',
  },
  journeys: [
    {
      direction: 'itinerary' as const,
      label: 'Flight',
      durationLabel: '12h',
      segments: [
        {
          segmentIndex: 0,
          airlineCode: 'BA',
          airlineName: 'British Airways',
          flightNumber: 'BA178',
          departure: {
            location: { code: 'JFK', label: 'New York (JFK)', cityName: 'New York', airportName: 'JFK', terminal: '8' },
            date: '2026-08-15',
            time: '10:00',
          },
          arrival: {
            location: { code: 'LHR', label: 'London (LHR)', cityName: 'London', airportName: 'Heathrow', terminal: '5' },
            date: '2026-08-15',
            time: '22:00',
          },
          durationLabel: '12h',
          cabin: 'economy',
          cabinMarketingName: 'Economy',
          baggageLabel: 'Checked: 1pc 23kg',
        },
      ],
    },
  ],
  baggage: {
    summaryLabel: 'Carry-on + Checked',
    carryOnLabel: 'Carry-on: 1 piece',
    checkedLabel: 'Checked: 1 piece up to 23kg',
    perSegment: [{ segmentIndex: 0, label: 'Checked: 1pc 23kg', included: true, quantity: 1, weightText: '23kg' }],
  },
  fare: {
    cabin: 'economy',
    cabinMarketingName: 'Economy',
    fareBrand: 'Economy Standard',
    fareBasisCode: 'Y',
    classOfService: 'Y',
    changePolicy: { label: 'Changeable with fee', allowed: true, penaltyAmount: 75, penaltyCurrency: 'USD' },
    refundPolicy: { label: 'Non-refundable', allowed: false },
  },
};

// ─── Tests ────────────────────────────────────────────────────

describe('DetailTopSummary', () => {
  it('renders airline name', () => {
    render(<DetailTopSummary detail={baseDetailView} />);
    expect(screen.getByText('British Airways')).toBeDefined();
  });

  it('renders route labels', () => {
    render(<DetailTopSummary detail={baseDetailView} />);
    expect(screen.getAllByText('New York (JFK)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('London (LHR)').length).toBeGreaterThan(0);
  });

  it('renders trip type badge', () => {
    render(<DetailTopSummary detail={baseDetailView} />);
    expect(screen.getByText('one way')).toBeDefined();
  });
});

describe('DetailJourneyTimeline', () => {
  it('renders journey label', () => {
    render(<DetailJourneyTimeline journeys={baseDetailView.journeys} />);
    expect(screen.getByText('Flight')).toBeDefined();
  });

  it('renders segment times', () => {
    render(<DetailJourneyTimeline journeys={baseDetailView.journeys} />);
    expect(screen.getByText('10:00')).toBeDefined();
    expect(screen.getByText('22:00')).toBeDefined();
  });

  it('renders empty state when no journeys', () => {
    render(<DetailJourneyTimeline journeys={[]} />);
    expect(screen.getByText('Journey details not available.')).toBeDefined();
  });
});

describe('DetailBaggage', () => {
  it('renders baggage section when baggage exists', () => {
    render(<DetailBaggage baggage={baseDetailView.baggage} />);
    expect(screen.getByText('Carry-on')).toBeDefined();
    expect(screen.getByText('Checked')).toBeDefined();
  });

  it('renders baggage label text', () => {
    render(<DetailBaggage baggage={baseDetailView.baggage} />);
    expect(screen.getByText('Carry-on: 1 piece')).toBeDefined();
    expect(screen.getByText('Checked: 1 piece up to 23kg')).toBeDefined();
  });

  it('renders empty state when baggage is undefined', () => {
    render(<DetailBaggage baggage={undefined} />);
    expect(screen.getByText('Baggage details not available.')).toBeDefined();
  });
});

describe('DetailFareRules', () => {
  it('renders fare brand', () => {
    render(<DetailFareRules fare={baseDetailView.fare} />);
    expect(screen.getByText('Economy Standard')).toBeDefined();
  });

  it('renders fare basis code', () => {
    render(<DetailFareRules fare={baseDetailView.fare} />);
    expect(screen.getAllByText('Y').length).toBeGreaterThan(0);
  });

  it('renders change and refund policy labels', () => {
    render(<DetailFareRules fare={baseDetailView.fare} />);
    expect(screen.getByText(/Changeable with fee/)).toBeDefined();
    expect(screen.getByText(/Non-refundable/)).toBeDefined();
  });
});

describe('DetailPricing', () => {
  it('renders price breakdown with base, tax, total', () => {
    render(<DetailPricing pricing={baseDetailView.pricing} />);
    expect(screen.getByText('USD 500.00')).toBeDefined();
    expect(screen.getByText('USD 50.00')).toBeDefined();
  });

  it('renders empty state when pricing is undefined', () => {
    render(<DetailPricing pricing={undefined as any} />);
    expect(screen.getByText('Pricing details not available.')).toBeDefined();
  });
});
