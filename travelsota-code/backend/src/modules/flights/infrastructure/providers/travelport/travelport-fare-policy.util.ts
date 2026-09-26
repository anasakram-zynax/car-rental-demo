/**
 * Pure parser for Travelport fare conditions ("TermsAndConditions" at search
 * time, "TermsAndConditionsFull" in the price/reprice response).
 *
 * A penalty entry is one of:
 *   - PenaltyAmount:  { Amount: { value, code } }
 *   - PenaltyPercent: { Percent: 100 }            (share of the fare)
 * Cancel/Change entries also carry `penaltyTypes` (Anytime, BeforeDeparture,
 * AfterDeparture, NoShow...). Only before-departure / anytime entries describe
 * what a traveller pays for a normal refund or change.
 */

type Rec = Record<string, unknown>;

export interface TravelportFarePolicy {
  label: string;
  allowed?: boolean;
  penaltyAmount?: number;
  penaltyCurrency?: string;
  /** Penalty as a share of the fare (0-100), when Travelport quotes a percent. */
  penaltyPercent?: number;
  free?: boolean;
}

export interface TravelportFarePolicies {
  change: TravelportFarePolicy;
  refund: TravelportFarePolicy;
}

const UNKNOWN: TravelportFarePolicy = { label: 'Rules confirmed at checkout' };

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

function readAmount(
  penalties: Rec[],
): { amount: number; currency: string } | undefined {
  for (const p of penalties) {
    const a = p.Amount as Rec | number | undefined;
    if (a && typeof a === 'object') {
      const value = num(a.value);
      const currency = str(a.code) ?? str((a.CurrencyCode as Rec)?.value);
      if (value !== undefined && currency) return { amount: value, currency };
    }
  }
  return undefined;
}

function readPercent(penalties: Rec[]): number | undefined {
  for (const p of penalties) {
    const pct = num(p.Percent) ?? num(p.Percentage);
    if (pct !== undefined) return pct;
  }
  return undefined;
}

/** Entries that describe a normal pre-departure refund/change come first. */
function preferBeforeDeparture(items: Rec[]): Rec[] {
  const score = (item: Rec): number => {
    const types = toArray(item.penaltyTypes as string[]).map((t) =>
      String(t).toLowerCase(),
    );
    if (types.length === 0) return 1;
    if (types.some((t) => t.includes('anytime') || t.includes('before')))
      return 0;
    return 2; // after departure / no-show only
  };
  return [...items].sort((a, b) => score(a) - score(b));
}

function readGroup(
  items: Rec[],
  kind: 'change' | 'cancel',
): TravelportFarePolicy | undefined {
  if (items.length === 0) return undefined;
  const sorted = preferBeforeDeparture(items);
  const typeOf = (item: Rec) => (str(item['@type']) ?? '').toLowerCase();

  const prohibited = sorted.find((i) => {
    const t = typeOf(i);
    return (
      t.includes('notpermitted') ||
      t.includes('prohibited') ||
      t.includes('notallowed')
    );
  });
  const permitted = sorted.find(
    (i) => typeOf(i).includes('permitted') && !typeOf(i).includes('not'),
  );

  if (prohibited && !permitted) {
    return {
      allowed: false,
      free: false,
      label: kind === 'change' ? 'Changes not permitted' : 'Non-refundable',
    };
  }

  const source = permitted ?? sorted[0];
  const penalties = toArray(source.Penalty as Rec[]);
  const money = readAmount(penalties);
  if (money) {
    return {
      allowed: true,
      penaltyAmount: money.amount,
      penaltyCurrency: money.currency,
      free: money.amount === 0,
      label:
        kind === 'change'
          ? `Changes from ${money.amount} ${money.currency}`
          : `Cancellation from ${money.amount} ${money.currency}`,
    };
  }

  const pct = readPercent(penalties);
  if (pct !== undefined) {
    if (pct >= 100) {
      // A 100% penalty is a non-refundable / non-changeable fare.
      return {
        allowed: false,
        penaltyPercent: 100,
        free: false,
        label: kind === 'change' ? 'Changes not permitted' : 'Non-refundable',
      };
    }
    if (pct <= 0) {
      return {
        allowed: true,
        penaltyPercent: 0,
        free: true,
        label: kind === 'change' ? 'Free changes' : 'Free cancellation',
      };
    }
    return {
      allowed: true,
      penaltyPercent: pct,
      free: false,
      label:
        kind === 'change'
          ? `Change fee: ${pct}% of fare`
          : `Cancellation fee: ${pct}% of fare`,
    };
  }

  return {
    allowed: true,
    free: false,
    label: kind === 'change' ? 'Changes permitted' : 'Refund permitted',
  };
}

/** True when the fare's short restriction text says non-refundable. */
function restrictionSaysNonRefundable(terms: Rec): boolean {
  return toArray(terms.Restriction as Rec[]).some((r) =>
    /NON[\s-]?REF/i.test(str(r.value) ?? ''),
  );
}

export function readTravelportFarePolicies(
  terms: Rec | undefined,
): TravelportFarePolicies {
  if (!terms) return { change: { ...UNKNOWN }, refund: { ...UNKNOWN } };

  let change: TravelportFarePolicy | undefined;
  let refund: TravelportFarePolicy | undefined;

  for (const group of toArray(terms.Penalties as Rec[])) {
    const changes = toArray(group.Change as Rec[]);
    const cancels = toArray(group.Cancel as Rec[]);
    if (!change && changes.length > 0) change = readGroup(changes, 'change');
    if (!refund && cancels.length > 0) refund = readGroup(cancels, 'cancel');
  }

  // Legacy flat shape: terms.Penalty[] with a category code per entry.
  if (!change || !refund) {
    for (const p of toArray(terms.Penalty as Rec[])) {
      const cat = (
        str(p.CategoryCode) ??
        str(p.PenaltyType) ??
        str(p.type) ??
        ''
      ).toUpperCase();
      const amount = num(p.Amount);
      const currency =
        str((p.CurrencyCode as Rec | undefined)?.value) ??
        str(p.CurrencyCode) ??
        str(p.currency);
      const known = amount !== undefined && !!currency;
      if (!change && /CHANGE|MODIFY|CHG/.test(cat)) {
        change = known
          ? {
              allowed: true,
              penaltyAmount: amount,
              penaltyCurrency: currency,
              label: `Changes from ${amount} ${currency}`,
            }
          : { allowed: true, label: 'Changes permitted' };
      }
      if (!refund && /CANCEL|REFUND|CXL/.test(cat)) {
        refund = known
          ? {
              allowed: true,
              penaltyAmount: amount,
              penaltyCurrency: currency,
              free: amount === 0,
              label: `Cancellation from ${amount} ${currency}`,
            }
          : { allowed: true, free: false, label: 'Refund permitted' };
      }
    }
  }

  // Fare restriction text ("NON ENDO/ NONREF") is authoritative when the
  // penalty block only says "cancel permitted" without a figure.
  if (
    (!refund || (refund.allowed && refund.free === false && !hasFee(refund))) &&
    restrictionSaysNonRefundable(terms)
  ) {
    refund = { allowed: false, free: false, label: 'Non-refundable' };
  }

  return {
    change: change ?? { ...UNKNOWN },
    refund: refund ?? { ...UNKNOWN },
  };
}

function hasFee(p: TravelportFarePolicy): boolean {
  return p.penaltyAmount != null || p.penaltyPercent != null;
}

/**
 * Combine the policies of several priced offers (multi-city / multi-product):
 * the most restrictive one wins so the customer is never promised more than
 * the strictest leg allows.
 */
export function mergeMostRestrictive(
  list: TravelportFarePolicy[],
): TravelportFarePolicy {
  const known = list.filter((p) => p.allowed !== undefined);
  if (known.length === 0) return list[0] ?? { ...UNKNOWN };
  const blocked = known.find((p) => p.allowed === false);
  if (blocked) return blocked;
  const withFee = known.filter((p) => hasFee(p) && p.free !== true);
  if (withFee.length > 0) {
    return withFee.reduce((worst, p) =>
      (p.penaltyPercent ?? 0) + (p.penaltyAmount ?? 0) >
      (worst.penaltyPercent ?? 0) + (worst.penaltyAmount ?? 0)
        ? p
        : worst,
    );
  }
  return known.find((p) => !p.free) ?? known[0];
}

/**
 * Pull fare conditions out of a live `farerule/farerules/fromoffer` (or
 * `fromcatalogproductofferings`) response. Shape varies by channel, so this
 * key-walks for any node carrying a `Penalties` block and reuses the same
 * reader as the price-response parser. Returns undefined when nothing
 * parseable is found — callers must treat that as "unknown", never "free".
 */
export function extractFareRulesFromFareRulesResponse(
  data: unknown,
): TravelportFarePolicies | undefined {
  const termsList: Rec[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (depth > 8 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n, depth + 1);
      return;
    }
    const rec = node as Rec;
    if (Array.isArray(rec.Penalties) && rec.Penalties.length > 0) {
      termsList.push(rec);
    }
    for (const v of Object.values(rec)) visit(v, depth + 1);
  };
  visit(data, 0);
  if (termsList.length === 0) return undefined;
  const parsed = termsList.map((t) => readTravelportFarePolicies(t));
  return {
    change: mergeMostRestrictive(parsed.map((p) => p.change)),
    refund: mergeMostRestrictive(parsed.map((p) => p.refund)),
  };
}

/**
 * Merge live fare-rules over price-derived ones: the live side wins only
 * when it carries a concrete fee the base lacks. Known values are never
 * downgraded to unknown.
 */
export function enrichWithLiveFareRules(
  base: TravelportFarePolicies | undefined,
  live: TravelportFarePolicies | undefined,
): TravelportFarePolicies | undefined {
  if (!live) return base;
  if (!base) return live;
  const pick = (
    b: TravelportFarePolicy,
    l: TravelportFarePolicy,
  ): TravelportFarePolicy => (hasFee(l) && !hasFee(b) ? l : b);
  return { change: pick(base.change, live.change), refund: pick(base.refund, live.refund) };
}
/**
 * Pull fare conditions out of a price/reprice response
 * (OfferListResponse.OfferID[*].TermsAndConditionsFull[*]).
 */
export function extractFareRulesFromPriceResponse(
  data: unknown,
): TravelportFarePolicies | undefined {
  const termsList: Rec[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (depth > 6 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n, depth + 1);
      return;
    }
    const rec = node as Rec;
    for (const key of ['TermsAndConditionsFull', 'TermsAndConditions']) {
      for (const t of toArray(rec[key] as Rec[])) {
        if (t && typeof t === 'object') termsList.push(t);
      }
    }
    for (const [k, v] of Object.entries(rec)) {
      if (k === 'TermsAndConditionsFull' || k === 'TermsAndConditions')
        continue;
      visit(v, depth + 1);
    }
  };
  visit(data, 0);
  const withPenalties = termsList.filter(
    (t) => toArray(t.Penalties as Rec[]).length > 0,
  );
  if (withPenalties.length === 0) return undefined;
  const parsed = withPenalties.map((t) => readTravelportFarePolicies(t));
  return {
    change: mergeMostRestrictive(parsed.map((p) => p.change)),
    refund: mergeMostRestrictive(parsed.map((p) => p.refund)),
  };
}
