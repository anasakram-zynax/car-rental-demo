/**
 * Parse an ISO 8601 duration (e.g. "PT7H10M", "PT45M", "PT2H") into
 * a human-readable label like "7h 10m" or "45m".
 * Returns undefined for unparseable / empty input.
 */
export function parseIsoDuration(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed.startsWith('PT')) return undefined;

  const match = trimmed.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return undefined;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  if (hours === 0 && minutes === 0 && seconds === 0) return undefined;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (hours === 0 && seconds > 0) parts.push(`${seconds}s`);

  return parts.join(' ') || undefined;
}

/**
 * Sum an array of ISO 8601 duration strings into a single human-readable label.
 * Returns undefined when no durations can be parsed.
 */
export function sumIsoDurations(durations: (string | undefined)[]): string | undefined {
  let totalMinutes = 0;
  let parsedAny = false;

  for (const raw of durations) {
    if (!raw) continue;
    const trimmed = raw.trim().toUpperCase();
    if (!trimmed.startsWith('PT')) continue;

    const match = trimmed.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!match) continue;

    parsedAny = true;
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    totalMinutes += hours * 60 + minutes + (seconds > 0 ? 1 : 0);
  }

  if (!parsedAny) return undefined;

  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(' ') || undefined;
}

/**
 * Format minutes into a human-readable label like "7h 10m".
 */
export function formatMinutes(totalMinutes: number): string | undefined {
  if (totalMinutes <= 0) return undefined;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(' ') || undefined;
}
