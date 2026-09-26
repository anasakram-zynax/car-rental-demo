const fs = require('fs');
const filePath = 'src/modules/flights/application/services/travelport-booking-workflow.service.ts';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add imports for the two new services
const importBlock = `import { TravelportWorkflowRequestBuilderService, WorkflowProductSelection } from './travelport-workflow-request-builder.service';
import { TravelportWorkflowResponseParserService, TravelerIdEntry } from './travelport-workflow-response-parser.service';
`;

// Insert after the last existing import (sanitizeForLog import)
content = content.replace(
  "import { sanitizeForLog } from './flight-log.util';",
  "import { sanitizeForLog } from './flight-log.util';\n" + importBlock
);

// 2. Add the two new DI params to the constructor
// Remove the WorkflowProductSelection and TravelerIdEntry interfaces (they're now in the extracted services)
const oldInterface1 = `interface WorkflowProductSelection {\n  offeringId: string;\n  productIds: string[];\n}\n`;
// This interface might have been declared already... let's remove the one AFTER @Injectable
content = content.replace(
  /interface WorkflowProductSelection \{[^}]*\}\n/g,
  ''
);
content = content.replace(
  /interface TravelerIdEntry \{[^}]*\}\n/g,
  ''
);

// 3. Add new constructor params
content = content.replace(
  "    private readonly ancillaryService: TravelportAncillaryService,\n  ) {}",
  `    private readonly ancillaryService: TravelportAncillaryService,
    private readonly requestBuilder: TravelportWorkflowRequestBuilderService,
    private readonly responseParser: TravelportWorkflowResponseParserService,
  ) {}`
);

// 4. Replace all `this.buildXxx(` with `this.requestBuilder.buildXxx(`
const buildMethods = [
  'buildHeaders', 'buildHeadersWithoutContentType', 'buildSessionHeaders',
  'buildSearchBody', 'buildSearchCriteriaFlight', 'buildSearchModifiersAir',
  'buildTravelerBody', 'buildOfferBody', 'buildSeatAddBody', 'buildBaggageAddBody',
  'buildMealSsrBody', 'buildServicesAddBody', 'buildCashFopBody', 'buildPaymentBody',
];
for (const method of buildMethods) {
  // Only replace in non-declaration contexts (i.e. calls, not definitions)
  // We'll handle removing the definitions separately
  content = content.split(`this.${method}(`).join(`this.requestBuilder.${method}(`);
}

// 5. Replace other builder methods
content = content.split('this.resolveSelectedOfferIds(').join('this.requestBuilder.resolveSelectedOfferIds(');
content = content.split('this.normalizeProductSelections(').join('this.requestBuilder.normalizeProductSelections(');
content = content.split('this.normalizeTravelers(').join('this.requestBuilder.normalizeTravelers(');
content = content.split('this.normalizeIds(').join('this.requestBuilder.normalizeIds(');

// 6. Replace all extract/parser methods
const extractMethods = [
  'extractSearchIdentifiers', 'extractWorkbenchIdentifiers', 'extractOfferIdentifiers',
  'extractTravelerId', 'extractTravelerIdentifierValue', 'extractIdentifierValue',
  'extractFopIdentifier', 'extractPriceDetails', 'findFirstStringValueByKeys',
  'findHeaderValueByKeyFragment', 'extractLocatorCode', 'extractTicketNumbersFromReservation',
  'extractTicketNumbers', 'extractResultErrors', 'extractPricedOfferIdentifier',
  'checkOfferIdentifierKey', 'findMatchingSearchProduct', 'findFirstSearchProduct',
  'resolveTravelerRef',
];
for (const method of extractMethods) {
  content = content.split(`this.${method}(`).join(`this.responseParser.${method}(`);
}

// 7. Replace remap + verify methods
content = content.split('this.remapSeatsFromFreshOptions(').join('this.responseParser.remapSeatsFromFreshOptions(');
content = content.split('this.remapAncillariesFromFreshOptions(').join('this.responseParser.remapAncillariesFromFreshOptions(');
content = content.split('this.verifyAncillariesInResponse(').join('this.responseParser.verifyAncillariesInResponse(');

// 8. Remove the extracted private method definitions and the WorkflowProductSelection interface
// We need to remove lines from 1754 to the end of the file, but KEEP:
// - requestStep (2874)
// - extractSetCookieHeaders (2911)
// - applySetCookies (2924)
// - extractPricedOfferIdentifier (3167) - already extracted but still used internally... wait it's called from within runWorkflow AND runTicketingWorkflow?
// Actually wait - extractPricedOfferIdentifier and checkOfferIdentifierKey are called from within the EXTRACTED methods themselves?
// Let me check: extractPricedOfferIdentifier and checkOfferIdentifierKey are called from within extractSearchIdentifiers or similar?
// No - based on the grep, they're called at lines 3135, 3187, 3188 which are in the remaining methods section
// Actually those are inside the PRIVATE methods that are being extracted, so they'll be in the response parser.
// 
// Let me be more careful about what to keep:
// - requestStep (line ~2874)
// - extractSetCookieHeaders (line ~2911)
// - applySetCookies (line ~2924)
// - extractPricedOfferIdentifier (line ~3167) - this IS an extract method, so goes to response parser
// - checkOfferIdentifierKey (line ~3204) - this IS an extract method, goes to response parser
// - resolveConfig (line ~3247)
// - getAccessToken (line ~3288)
// - buildTokenCacheKey (line ~3356)
// - buildCredentialFingerprint (line ~3361)
// - getTokenTtlSeconds (line ~3366)

// Actually, since str_replace can't handle this file, let me use a different approach.
// Instead of removing method definitions, I'll leave them but they become dead code.
// The typecheck will catch any remaining issues.
// 
// BUT we removed the interface definitions, so the extracted methods that reference
// TravelerIdEntry and WorkflowProductSelection will fail typecheck.
// 
// Let me take a safer approach: keep the interfaces but mark them as @deprecated,
// or better yet, just keep them for now and remove them in a cleanup pass.
// 
// Actually, the method definitions AND interfaces are both still in the file.
// Since the private methods reference each other and the interfaces, they'd still compile.
// The issue is the REPLACEMENT calls - we've already changed `this.buildXxx(` to `this.requestBuilder.buildXxx(`
// inside `runWorkflow`, `runTicketingWorkflow`, etc. But the private method definitions also contain
// `this.buildXxx(` calls to other private methods. Those would now be broken because they reference
// `this.requestBuilder` which doesn't exist in the scope of the private methods.
// 
// Wait - the private method definitions are STILL in the file. So `this.buildXxx(` in the private
// methods that call other private methods would still resolve to local private methods.
// The only problem would be if a REPLACED call inside a private method now references requestBuilder.
// 
// Let me think about this differently. The approach should be:
// 1. Remove the extracted method DEFINITIONS from the file
// 2. Remove the extracted interfaces
// 3. Keep only: runWorkflow, runTicketingWorkflow, reprice, priceForCheckoutSession,
//    requestStep, extractSetCookieHeaders, applySetCookies,
//    resolveConfig, getAccessToken, buildTokenCacheKey, buildCredentialFingerprint, getTokenTtlSeconds
//
// For removing the definitions, I need to know the exact line ranges.

fs.writeFileSync(filePath, content, 'utf8');
console.log('Workflow service updated with new DI and method calls.');
