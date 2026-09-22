export const BOOKING_REFERENCES_KEY = "car-rental-booking-references";

function normalizeReference(reference: string) {
  return reference.trim().toUpperCase();
}

export function readBookingReferences() {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(BOOKING_REFERENCES_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];

    if (!Array.isArray(parsed)) return [];

    return [...new Set(parsed.filter((item): item is string => typeof item === "string").map(normalizeReference).filter(Boolean))];
  } catch {
    return [];
  }
}

export function saveBookingReference(reference: string) {
  if (typeof window === "undefined") return;

  const normalized = normalizeReference(reference);
  if (!normalized) return;

  try {
    const references = readBookingReferences();
    if (!references.includes(normalized)) {
      window.localStorage.setItem(BOOKING_REFERENCES_KEY, JSON.stringify([...references, normalized]));
    }
  } catch {
    // Remembering references is optional; server-side booking data remains valid.
  }
}

export function removeBookingReference(reference: string) {
  if (typeof window === "undefined") return;

  const normalized = normalizeReference(reference);
  try {
    window.localStorage.setItem(
      BOOKING_REFERENCES_KEY,
      JSON.stringify(readBookingReferences().filter((item) => item !== normalized)),
    );
  } catch {
    // A stale local value must never block the rest of the page.
  }
}
