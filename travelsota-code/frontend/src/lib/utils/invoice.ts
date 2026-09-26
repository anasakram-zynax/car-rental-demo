/** TVL-EINV-2023-40066 → 40066 — compact display form for tables/chips. */
export function shortInvoiceNumber(inv: string): string {
  const tail = inv.split("-").pop() ?? inv;
  return tail.length > 10 ? `${tail.slice(0, 8)}…` : tail;
}
