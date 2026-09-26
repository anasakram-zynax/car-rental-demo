/**
 * Board/meal-code → human-readable label mapping.
 *
 * Providers return machine codes ("nomeal", "BB", "RO", "HB"…) which were
 * leaking raw to search cards, detail pages and booking summaries
 * ("Junior Suite · nomeal"). Normalized at the provider-normalizer layer so
 * every surface (search, details, booking, invoice) renders clean labels.
 */
const BOARD_LABELS: Record<string, string> = {
  // RateHawk
  nomeal: 'Room Only',
  breakfast: 'Breakfast',
  'breakfast for two': 'Breakfast (2 persons)',
  'half board': 'Half Board',
  'full board': 'Full Board',
  'all inclusive': 'All Inclusive',
  dinner: 'Dinner',
  // Hotelbeds / common codes
  ro: 'Room Only',
  bb: 'Bed & Breakfast',
  hb: 'Half Board',
  fb: 'Full Board',
  ai: 'All Inclusive',
  sc: 'Self Catering',
  uai: 'All Inclusive (Ultra)',
  // Amadeus
  room_only: 'Room Only',
  buffet_breakfast: 'Buffet Breakfast',
  half_board: 'Half Board',
  full_board: 'Full Board',
  all_inclusive: 'All Inclusive',
};

/**
 * Map a provider board/meal code or free-text value to a display label.
 * Returns the input unchanged when it is not a recognized code (free-text
 * values like "Bed & Breakfast" pass through as-is).
 */
export function normalizeBoardLabel(
  board: string | null | undefined,
): string | undefined {
  if (board == null) return undefined;
  const trimmed = board.trim();
  if (!trimmed) return undefined;
  const key = trimmed.toLowerCase();
  return BOARD_LABELS[key] ?? trimmed;
}
