import {
  enrichWithLiveFareRules,
  extractFareRulesFromFareRulesResponse,
  extractFareRulesFromPriceResponse,
  mergeMostRestrictive,
  readTravelportFarePolicies,
} from './travelport-fare-policy.util';

// Shape taken from a real Travelport price response (EY 5417/288 DXB-LHE).
const percentTerms = {
  '@type': 'TermsAndConditionsFullAir',
  Restriction: [{ value: 'NON ENDO/ NONREF' }],
  Penalties: [
    {
      '@type': 'Penalties',
      Change: [
        {
          '@type': 'ChangePermitted',
          penaltyTypes: ['Anytime'],
          Penalty: [{ '@type': 'PenaltyPercent', Percent: 100 }],
        },
      ],
      Cancel: [
        {
          '@type': 'CancelPermitted',
          penaltyTypes: ['Anytime'],
          Penalty: [{ '@type': 'PenaltyPercent', Percent: 100 }],
        },
      ],
    },
  ],
};

describe('readTravelportFarePolicies', () => {
  it('treats a 100% cancel penalty as non-refundable', () => {
    const { refund, change } = readTravelportFarePolicies(percentTerms);
    expect(refund.allowed).toBe(false);
    expect(refund.label).toBe('Non-refundable');
    expect(change.allowed).toBe(false);
  });

  it('keeps a partial percent penalty as an allowed policy with the percent', () => {
    const { refund } = readTravelportFarePolicies({
      Penalties: [
        {
          Cancel: [
            {
              '@type': 'CancelPermitted',
              Penalty: [{ '@type': 'PenaltyPercent', Percent: 25 }],
            },
          ],
        },
      ],
    });
    expect(refund).toMatchObject({
      allowed: true,
      penaltyPercent: 25,
      free: false,
    });
    expect(refund.label).toContain('25%');
  });

  it('reads a fixed amount penalty', () => {
    const { change } = readTravelportFarePolicies({
      Penalties: [
        {
          Change: [
            {
              '@type': 'ChangePermitted',
              Penalty: [{ Amount: { value: 81.15, code: 'USD' } }],
            },
          ],
        },
      ],
    });
    expect(change).toMatchObject({
      allowed: true,
      penaltyAmount: 81.15,
      penaltyCurrency: 'USD',
      free: false,
    });
  });

  it('only reports free when Travelport quotes a zero penalty', () => {
    const zero = readTravelportFarePolicies({
      Penalties: [
        {
          Cancel: [
            {
              '@type': 'CancelPermitted',
              Penalty: [{ Amount: { value: 0, code: 'USD' } }],
            },
          ],
        },
      ],
    });
    expect(zero.refund.free).toBe(true);

    const unspecified = readTravelportFarePolicies({
      Penalties: [{ Cancel: [{ '@type': 'CancelPermitted' }] }],
    });
    expect(unspecified.refund).toMatchObject({ allowed: true, free: false });
    expect(unspecified.refund.penaltyAmount).toBeUndefined();
  });

  it('prefers the before-departure entry over a no-show entry', () => {
    const { refund } = readTravelportFarePolicies({
      Penalties: [
        {
          Cancel: [
            {
              '@type': 'CancelPermitted',
              penaltyTypes: ['NoShow'],
              Penalty: [{ Amount: { value: 500, code: 'USD' } }],
            },
            {
              '@type': 'CancelPermitted',
              penaltyTypes: ['BeforeDeparture'],
              Penalty: [{ Amount: { value: 75, code: 'USD' } }],
            },
          ],
        },
      ],
    });
    expect(refund.penaltyAmount).toBe(75);
  });

  it('uses the NONREF restriction when the penalty block gives no figure', () => {
    const { refund } = readTravelportFarePolicies({
      Restriction: [{ value: 'NONREF' }],
      Penalties: [{ Cancel: [{ '@type': 'CancelPermitted' }] }],
    });
    expect(refund.allowed).toBe(false);
  });

  it('reports unknown when there are no terms at all', () => {
    const { refund } = readTravelportFarePolicies(undefined);
    expect(refund.allowed).toBeUndefined();
    expect(refund.label).toBe('Rules confirmed at checkout');
  });
});

describe('extractFareRulesFromPriceResponse', () => {
  it('finds TermsAndConditionsFull inside an OfferListResponse', () => {
    const rules = extractFareRulesFromPriceResponse({
      OfferListResponse: {
        OfferID: [{ id: 'o0', TermsAndConditionsFull: [percentTerms] }],
      },
    });
    expect(rules?.refund.allowed).toBe(false);
  });

  it('returns undefined when the response has no penalty data', () => {
    expect(
      extractFareRulesFromPriceResponse({
        OfferListResponse: { OfferID: [{ id: 'o0' }] },
      }),
    ).toBeUndefined();
  });

  it('uses the most restrictive leg for multi-offer responses', () => {
    const rules = extractFareRulesFromPriceResponse({
      OfferListResponse: {
        OfferID: [
          {
            TermsAndConditionsFull: [
              {
                Penalties: [
                  {
                    Cancel: [
                      {
                        '@type': 'CancelPermitted',
                        Penalty: [{ Amount: { value: 0, code: 'USD' } }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          { TermsAndConditionsFull: [percentTerms] },
        ],
      },
    });
    expect(rules?.refund.allowed).toBe(false);
  });
});

describe('mergeMostRestrictive', () => {
  it('prefers a blocked policy over a free one', () => {
    const out = mergeMostRestrictive([
      { label: 'Free', allowed: true, free: true },
      { label: 'Non-refundable', allowed: false },
    ]);
    expect(out.allowed).toBe(false);
  });
});

describe('extractFareRulesFromFareRulesResponse', () => {
  it('finds Penalties inside an unknown fare-rules envelope', () => {
    const rules = extractFareRulesFromFareRulesResponse({
      FareRuleResponse: { FareRule: [{ Penalties: percentTerms.Penalties }] },
    });
    expect(rules?.refund.allowed).toBe(false);
  });

  it('returns undefined when nothing parseable exists (never "free")', () => {
    expect(
      extractFareRulesFromFareRulesResponse({ FareRuleResponse: {} }),
    ).toBeUndefined();
  });
});

describe('enrichWithLiveFareRules', () => {
  it('fills a missing base fee from live, keeps known base values', () => {
    const out = enrichWithLiveFareRules(
      {
        change: { label: 'Changes permitted', allowed: true, free: false },
        refund: {
          label: 'Cancellation from 50 USD',
          allowed: true,
          penaltyAmount: 50,
          penaltyCurrency: 'USD',
        },
      },
      {
        change: {
          label: 'Changes from 75 USD',
          allowed: true,
          penaltyAmount: 75,
          penaltyCurrency: 'USD',
        },
        refund: { label: 'Refund permitted', allowed: true, free: false },
      },
    );
    expect(out?.change.penaltyAmount).toBe(75);
    expect(out?.refund.penaltyAmount).toBe(50);
  });
});
