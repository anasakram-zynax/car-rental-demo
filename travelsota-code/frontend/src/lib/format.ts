// Shared formatting helpers for dashboard widgets (Reference-2 lib/utils port).
// Formatters are memoized: `new Intl.NumberFormat` is surprisingly expensive
// and these run inside charts/tooltips and count-up animations, so constructing
// one per call measurably added to dashboard render cost.

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const currencyFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const percent = new Intl.NumberFormat("en", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function formatCurrency(value: number) {
  return currency.format(value);
}

export function formatCurrencyFull(value: number) {
  return currencyFull.format(value);
}

export function formatDate(value: string | number | Date) {
  return dateFmt.format(new Date(value));
}

export function formatPercent(value: number) {
  return percent.format(value);
}
