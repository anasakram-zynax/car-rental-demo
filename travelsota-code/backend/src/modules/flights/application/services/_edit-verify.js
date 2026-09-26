const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, 'travelport-booking-workflow.service.ts');
let content = fs.readFileSync(filePath, 'utf8');
const original = content;

// Normalize line endings for matching
const nl = '\r\n';

// 1. Add ancillaryVerification to WorkflowIdentifiers
const interfaceEnd = `  locatorCode?: string;${nl}  ticketNumbers?: string[];${nl}  /** Mapping of travelerIndex to Travelport traveler identifiers */${nl}  travelerIdMapping?: TravelerIdEntry[];${nl}}${nl}${nl}interface WorkflowProductSelection {`;

const interfaceReplacement = `  locatorCode?: string;${nl}  ticketNumbers?: string[];${nl}  /** Mapping of travelerIndex to Travelport traveler identifiers */${nl}  travelerIdMapping?: TravelerIdEntry[];${nl}  /** Post-commit ancillary verification results */${nl}  ancillaryVerification?: {${nl}    seatsFound: number;${nl}    seatsRequested: number;${nl}    mealsFound: number;${nl}    mealsRequested: number;${nl}    ancillaryOffersFound: number;${nl}    ancillaryOffersRequested: number;${nl}  };${nl}}${nl}${nl}interface WorkflowProductSelection {`;

if (content.includes(interfaceEnd)) {
  content = content.replace(interfaceEnd, interfaceReplacement);
  console.log('✅ Added ancillaryVerification to WorkflowIdentifiers');
} else {
  console.log('❌ Could not find interface ending');
  // Try with \n only
  const altEnd = interfaceEnd.replace(/\r\n/g, '\n');
  if (content.includes(altEnd)) {
    console.log('  (found with LF instead)');
    content = content.replace(altEnd, interfaceReplacement.replace(/\r\n/g, '\n'));
    console.log('✅ Added ancillaryVerification to WorkflowIdentifiers');
  } else {
    process.exit(1);
  }
}

// 2. Add verification call after ticket list
const ticketListEnd = `    identifiers.ticketNumbers = this.extractTicketNumbers(ticketStep.response);${nl}    wf('Ticket numbers: %j', identifiers.ticketNumbers);${nl}${nl}    wf('=== WORKFLOW COMPLETE ===');${nl}    wf('Locator=%s tickets=%d', identifiers.locatorCode, identifiers.ticketNumbers?.length ?? 0);${nl}    return { ok: true, steps, identifiers };`;

const ticketListReplacement = `    identifiers.ticketNumbers = this.extractTicketNumbers(ticketStep.response);${nl}    wf('Ticket numbers: %j', identifiers.ticketNumbers);${nl}${nl}    // ── Ancillary verification ──${nl}    // After ticketing, verify that requested ancillaries appear in the reservation.${nl}    // Non-blocking — logs warnings for missing items but doesn't fail the booking.${nl}    wf('=== ANCILLARY VERIFICATION ===');${nl}    const ancillaryVerification = this.verifyAncillariesInResponse(${nl}      retrieveStep.ok ? retrieveStep.response : commitTicketingStep.response,${nl}      {${nl}        seatsRequested: seatsToAdd.length,${nl}        mealsRequested: mealsToAdd.length,${nl}        ancillaryOffersRequested: baggageToAdd.length + servicesToAdd.length,${nl}      },${nl}    );${nl}    identifiers.ancillaryVerification = ancillaryVerification;${nl}    if (ancillaryVerification) {${nl}      wf('Ancillary verification: seats=%d/%d meals=%d/%d offers=%d/%d',${nl}        ancillaryVerification.seatsFound, ancillaryVerification.seatsRequested,${nl}        ancillaryVerification.mealsFound, ancillaryVerification.mealsRequested,${nl}        ancillaryVerification.ancillaryOffersFound, ancillaryVerification.ancillaryOffersRequested);${nl}      if (ancillaryVerification.seatsFound < ancillaryVerification.seatsRequested) {${nl}        wfWarn('Seat verification: expected %d, found %d in reservation',${nl}          ancillaryVerification.seatsRequested, ancillaryVerification.seatsFound);${nl}      }${nl}      if (ancillaryVerification.mealsFound < ancillaryVerification.mealsRequested) {${nl}        wfWarn('Meal verification: expected %d, found %d in reservation',${nl}          ancillaryVerification.mealsRequested, ancillaryVerification.mealsFound);${nl}      }${nl}      if (ancillaryVerification.ancillaryOffersFound < ancillaryVerification.ancillaryOffersRequested) {${nl}        wfWarn('Ancillary offer verification: expected %d, found %d in reservation',${nl}          ancillaryVerification.ancillaryOffersRequested, ancillaryVerification.ancillaryOffersFound);${nl}      }${nl}    }${nl}${nl}    wf('=== WORKFLOW COMPLETE ===');${nl}    wf('Locator=%s tickets=%d ancillaryVerify=%s', identifiers.locatorCode, identifiers.ticketNumbers?.length ?? 0,${nl}      ancillaryVerification${nl}        ? \`\${ancillaryVerification.seatsFound}/\${ancillaryVerification.seatsRequested} seats, \${ancillaryVerification.mealsFound}/\${ancillaryVerification.mealsRequested} meals, \${ancillaryVerification.ancillaryOffersFound}/\${ancillaryVerification.ancillaryOffersRequested} offers\`${nl}        : 'skipped');${nl}    return { ok: true, steps, identifiers };`;

if (content.includes(ticketListEnd)) {
  content = content.replace(ticketListEnd, ticketListReplacement);
  console.log('✅ Added ancillary verification call');
} else {
  console.log('❌ Could not find ticket list ending');
  const altEnd2 = ticketListEnd.replace(/\r\n/g, '\n');
  if (content.includes(altEnd2)) {
    console.log('  (found with LF instead)');
    content = content.replace(altEnd2, ticketListReplacement.replace(/\r\n/g, '\n'));
    console.log('✅ Added ancillary verification call');
  } else {
    process.exit(1);
  }
}

// 3. Add verifyAncillariesInResponse method before the last closing brace
const lastBrace = content.lastIndexOf(nl + '}');
if (lastBrace === -1) {
  // Try LF
  const lastBraceLF = content.lastIndexOf('\n}');
  if (lastBraceLF !== -1) {
    const verifyMethod = `
  /**
   * Verify that requested ancillaries appear in the reservation response.
   * Walks the response tree looking for seat assignments, SSR codes, and ancillary offers.
   * Non-blocking — always returns results instead of throwing.
   */
  private verifyAncillariesInResponse(
    response: unknown,
    requested: { seatsRequested: number; mealsRequested: number; ancillaryOffersRequested: number },
  ): { seatsFound: number; mealsFound: number; ancillaryOffersFound: number; seatsRequested: number; mealsRequested: number; ancillaryOffersRequested: number } | null {
    if (!response || typeof response !== 'object') return null;

    const result = {
      seatsFound: 0,
      mealsFound: 0,
      ancillaryOffersFound: 0,
      seatsRequested: requested.seatsRequested,
      mealsRequested: requested.mealsRequested,
      ancillaryOffersRequested: requested.ancillaryOffersRequested,
    };

    if (result.seatsRequested === 0 && result.mealsRequested === 0 && result.ancillaryOffersRequested === 0) {
      return result; // Nothing requested, nothing to verify
    }

    const queue: unknown[] = [response];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;

      const record = current as Record<string, unknown>;

      // Check for seat assignments
      if (record.SeatAssignment || record.seatNumber || record.SeatIdentifier) {
        result.seatsFound++;
      }

      // Check for SSR codes (meal requests)
      if (record.SSRCode || record.ssrCode) {
        result.mealsFound++;
      }

      // Check for ancillary offers (baggage/services)
      if (record['@type'] && typeof record['@type'] === 'string') {
        const type = record['@type'] as string;
        if (type.includes('Ancillary') || type.includes('Baggage') || type.includes('SeatOffer')) {
          result.ancillaryOffersFound++;
        }
      }

      // Queue children for traversal
      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') {
          queue.push(value);
        }
      }
    }

    return result;
  }
`;
    content = content.slice(0, lastBraceLF) + verifyMethod + '\n}';
    console.log('✅ Added verifyAncillariesInResponse method');
  } else {
    console.log('❌ Could not find class end');
    process.exit(1);
  }
} else {
  const verifyMethod = `${nl}  /**${nl}   * Verify that requested ancillaries appear in the reservation response.${nl}   * Walks the response tree looking for seat assignments, SSR codes, and ancillary offers.${nl}   * Non-blocking — always returns results instead of throwing.${nl}   */${nl}  private verifyAncillariesInResponse(${nl}    response: unknown,${nl}    requested: { seatsRequested: number; mealsRequested: number; ancillaryOffersRequested: number },${nl}  ): { seatsFound: number; mealsFound: number; ancillaryOffersFound: number; seatsRequested: number; mealsRequested: number; ancillaryOffersRequested: number } | null {${nl}    if (!response || typeof response !== 'object') return null;${nl}${nl}    const result = {${nl}      seatsFound: 0,${nl}      mealsFound: 0,${nl}      ancillaryOffersFound: 0,${nl}      seatsRequested: requested.seatsRequested,${nl}      mealsRequested: requested.mealsRequested,${nl}      ancillaryOffersRequested: requested.ancillaryOffersRequested,${nl}    };${nl}${nl}    if (result.seatsRequested === 0 && result.mealsRequested === 0 && result.ancillaryOffersRequested === 0) {${nl}      return result; // Nothing requested, nothing to verify${nl}    }${nl}${nl}    const queue: unknown[] = [response];${nl}${nl}    while (queue.length > 0) {${nl}      const current = queue.shift();${nl}      if (!current || typeof current !== 'object') continue;${nl}${nl}      const record = current as Record<string, unknown>;${nl}${nl}      // Check for seat assignments${nl}      if (record.SeatAssignment || record.seatNumber || record.SeatIdentifier) {${nl}        result.seatsFound++;${nl}      }${nl}${nl}      // Check for SSR codes (meal requests)${nl}      if (record.SSRCode || record.ssrCode) {${nl}        result.mealsFound++;${nl}      }${nl}${nl}      // Check for ancillary offers (baggage/services)${nl}      if (record['@type'] && typeof record['@type'] === 'string') {${nl}        const type = record['@type'] as string;${nl}        if (type.includes('Ancillary') || type.includes('Baggage') || type.includes('SeatOffer')) {${nl}          result.ancillaryOffersFound++;${nl}        }${nl}      }${nl}${nl}      // Queue children for traversal${nl}      for (const value of Object.values(record)) {${nl}        if (value && typeof value === 'object') {${nl}          queue.push(value);${nl}        }${nl}      }${nl}    }${nl}${nl}    return result;${nl}  }`;
  content = content.slice(0, lastBrace) + verifyMethod + `${nl}}`;
  console.log('✅ Added verifyAncillariesInResponse method');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ All edits complete');
