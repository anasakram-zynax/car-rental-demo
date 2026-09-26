/**
 * Small, reusable validators for booking forms (shared by flight + hotel
 * booking pages). Each returns `true` when the value is valid.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Letters, spaces, hyphens and apostrophes — at least 2 characters. */
const NAME_RE = /^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F' -]{1,}$/;
// Optional +/00 international prefix, followed by digits and common
// formatting characters. The first and last characters must be digits so
// values such as "+", "++971", and "50 123 4567 ext 2" are rejected.
const PHONE_INPUT_RE = /^(?:(?:\+|00)\s*)?\(?\d(?:[\d\s().-]*\d)?\)?$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface NormalizedPhoneParts {
  countryCode: string;
  subscriberNumber: string;
  e164: string;
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function isValidName(value: string): boolean {
  return NAME_RE.test(value.trim());
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Split a phone field into the country calling code and subscriber number.
 *
 * Users may paste either a local number or a full international number with
 * `+`/`00`. Known calling codes are optional so this helper remains useful to
 * other forms; the booking form passes the API's complete country list to
 * detect pasted full numbers without duplicating the calling code.
 */
export function normalizePhoneParts(
  countryCode: string,
  phone: string,
  knownDialCodes: string[] = [],
): NormalizedPhoneParts {
  const selectedCode = digitsOnly(countryCode);
  const raw = phone.trim();
  const explicitInternational = raw.startsWith('+') || raw.startsWith('00');
  const rawDigits = digitsOnly(raw);
  const phoneDigits = raw.startsWith('00') ? rawDigits.slice(2) : rawDigits;
  const candidates = Array.from(
    new Set([selectedCode, ...knownDialCodes.map(digitsOnly).filter(Boolean)]),
  ).sort((a, b) => b.length - a.length);

  let matchedCode = selectedCode;
  let subscriberNumber = phoneDigits;
  const canContainCallingCode = explicitInternational || phoneDigits.length >= 11;

  if (canContainCallingCode) {
    const matched = candidates.find(
      (candidate) => phoneDigits.startsWith(candidate) && phoneDigits.length - candidate.length >= 6,
    );
    if (matched) {
      matchedCode = matched;
      subscriberNumber = phoneDigits.slice(matched.length);
    }
  }

  // A national trunk prefix is not part of an E.164 number. Removing one
  // leading zero makes common local formats (e.g. 020...) supplier-safe while
  // leaving the user's selected calling code intact.
  if (!explicitInternational && subscriberNumber.startsWith('0')) {
    subscriberNumber = subscriberNumber.slice(1);
  }

  return {
    countryCode: matchedCode,
    subscriberNumber,
    e164: matchedCode && subscriberNumber ? `+${matchedCode}${subscriberNumber}` : '',
  };
}

/**
 * Supplier-compatible E.164 validation. Formatting characters are accepted in
 * the field, but letters, extensions, repeated signs, and invalid lengths are
 * rejected before checkout.
 */
export function isValidPhone(
  countryCode: string,
  phone: string,
  knownDialCodes: string[] = [],
): boolean {
  const raw = phone.trim();
  if (!raw || !PHONE_INPUT_RE.test(raw)) return false;
  const openingParentheses = (raw.match(/\(/g) ?? []).length;
  const closingParentheses = (raw.match(/\)/g) ?? []).length;
  if (openingParentheses !== closingParentheses || openingParentheses > 1) return false;
  if (openingParentheses > 0 && raw.indexOf(')') < raw.indexOf('(')) return false;

  const normalized = normalizePhoneParts(countryCode, raw, knownDialCodes);
  if (!/^\d{1,3}$/.test(normalized.countryCode)) return false;
  if (knownDialCodes.length > 0) {
    const knownCodes = new Set(knownDialCodes.map(digitsOnly).filter(Boolean));
    if (!knownCodes.has(normalized.countryCode)) return false;
  }
  if (!/^\d{6,14}$/.test(normalized.subscriberNumber)) return false;

  const totalDigits = normalized.countryCode.length + normalized.subscriberNumber.length;
  if (totalDigits < 8 || totalDigits > 15) return false;

  // NANP (+1) rules: area code cannot start with 0 or 1.
  if (normalized.countryCode === '1' && /^[01]/.test(normalized.subscriberNumber)) return false;

  return true;
}

/** 1-based day string, month string ("Jan"), year string ("1990"). */
function isValidCalendarDate(day: string, month: string, year: string): boolean {
  const dayNum = Number(day);
  const monthNum = MONTHS.indexOf(month) + 1;
  const yearNum = Number(year);
  if (!dayNum || !monthNum || !/^\d{4}$/.test(year)) return false;

  const date = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
  return (
    date.getUTCFullYear() === yearNum &&
    date.getUTCMonth() === monthNum - 1 &&
    date.getUTCDate() === dayNum
  );
}

/** Minimum age (in full years) required to book as an adult traveler. */
export const MIN_BOOKING_AGE = 12;

export function isValidDateOfBirth(day: string, month: string, year: string): boolean {
  if (!isValidCalendarDate(day, month, year)) return false;

  const birthYear = Number(year);
  const monthIndex = MONTHS.indexOf(month);
  const dayNum = Number(day);
  const now = new Date();

  // Must not be in the future.
  if (new Date(Date.UTC(birthYear, monthIndex, dayNum)).getTime() > now.getTime()) return false;

  // Full-year age (accounts for month/day) — the guest must be old enough to book.
  let age = now.getUTCFullYear() - birthYear;
  const monthDiff = now.getUTCMonth() - monthIndex;
  const dayDiff = now.getUTCDate() - dayNum;
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;

  return age >= MIN_BOOKING_AGE && age <= 120;
}

/** Passport expiry must be a real date after today. */
export function isValidPassportExpiry(day: string, month: string, year: string): boolean {
  if (!isValidCalendarDate(day, month, year)) return false;

  const expiry = new Date(Date.UTC(Number(year), MONTHS.indexOf(month), Number(day)));
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return expiry.getTime() > todayUtc;
}

export function isValidPassportNumber(value: string): boolean {
  return /^[A-Za-z0-9]{6,15}$/.test(value.trim());
}
