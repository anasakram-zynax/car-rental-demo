import { TravelportWorkflowResponseParserService } from './travelport-workflow-response-parser.service';

// Real GDS hold-commit shape, captured live 2026-09-21 (PNR HN61C7):
// deadline fields sit on Offer-level terms entries, NOT at Reservation level.
// Dates are dynamic so the future-date guard never time-bombs this spec.
const future = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
const futureIso = new Date(future).toISOString();
const commitResponse = {
  ReservationResponse: {
    Reservation: {
      Offer: [
        {
          TermsAndConditionsFull: [
            { '@type': 'TermsAndConditionsFullAir' },
            {
              '@type': 'TermsAndConditionsFullAir',
              ExpiryDate: future,
              PaymentTimeLimit: future,
            },
          ],
        },
      ],
      Receipt: [{ Confirmation: { Locator: { value: 'HN61C7' } } }],
    },
  },
};

describe('extractTicketingDeadline', () => {
  const parser = new TravelportWorkflowResponseParserService();

  it('reads ExpiryDate from Offer-level terms (live commit shape)', () => {
    const out = parser.extractTicketingDeadline(commitResponse);
    expect(out?.deadline).toBe(futureIso);
    expect(out?.source).toBe('supplier_terms');
  });

  it('returns undefined when no deadline paths exist (never fake one)', () => {
    expect(
      parser.extractTicketingDeadline({
        ReservationResponse: { Reservation: {} },
      }),
    ).toBeUndefined();
  });
});

describe('extractTicketNumbers', () => {
  const parser = new TravelportWorkflowResponseParserService();

  it('reads TicketListResponse from getbylocator (live shape)', () => {
    expect(
      parser.extractTicketNumbers({
        TicketListResponse: {
          TicketID: [{ Identifier: { value: '6039905581330' } }],
        },
      }),
    ).toEqual(['6039905581330']);
  });
});

describe('extractPaymentTimeLimit', () => {
  const parser = new TravelportWorkflowResponseParserService();
  it('finds PaymentTimeLimit anywhere in a price response', () => {
    expect(
      parser.extractPaymentTimeLimit({
        OfferListResponse: {
          OfferID: [{ PaymentTimeLimit: future }],
        },
      }),
    ).toBe(future);
  });
});
