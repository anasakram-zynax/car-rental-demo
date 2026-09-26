/**
 * Friendly names for Hotelbeds room codes. The content API frequently returns
 * rooms with only a roomCode (e.g. "DBL.ST") and no human name — map to a
 * display name instead of showing the raw code.
 */
export const ROOM_CODE_NAMES: Record<string, string> = {
  SGL: "Single Room",
  DBL: "Double Room",
  DBT: "Double Twin Room",
  TWN: "Twin Room",
  TPL: "Triple Room",
  TRI: "Triple Room",
  QUA: "Quad Room",
  STU: "Studio",
  STD: "Standard Room",
  SUI: "Suite",
  JSU: "Junior Suite",
  DUS: "Duplex Suite",
  FAM: "Family Room",
  VIL: "Villa",
  APT: "Apartment",
  EXE: "Executive Room",
  ROY: "Royal Suite",
  PRS: "Presidential Suite",
  BNG: "Bungalow",
  CHL: "Chalet",
};

/**
 * Resolve a human-friendly room name from a raw name plus a provider room
 * code. Falls back to the code-mapped name instead of raw codes.
 */
export function friendlyRoomName(
  rawName?: string | null,
  roomCode?: string | null,
): string {
  const trimmed = (rawName ?? "").trim();
  if (trimmed && !/^[A-Z]{2,6}$/.test(trimmed)) return trimmed;

  const code = (roomCode ?? "").trim().toUpperCase();
  if (!code) return trimmed;

  const base = code.split(/[.\- ]/)[0];
  return ROOM_CODE_NAMES[base] ?? ROOM_CODE_NAMES[code] ?? trimmed;
}
