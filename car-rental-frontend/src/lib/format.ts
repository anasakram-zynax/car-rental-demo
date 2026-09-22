export type DateValue = Date | string | number;

interface DateFormatOptions extends Intl.DateTimeFormatOptions {
  locale?: string;
}

export function formatCurrency(
  amount: number,
  currency = "USD",
  locale = "en-US",
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(
  value: DateValue,
  { locale = "en-US", ...options }: DateFormatOptions = {},
) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    ...options,
  }).format(new Date(value));
}

export function formatDateTime(
  value: DateValue,
  { locale = "en-US", ...options }: DateFormatOptions = {},
) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(new Date(value));
}
