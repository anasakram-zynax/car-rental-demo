import type {
  EnrichedRate,
  EnrichedProviderSection,
  GroupedRoom,
} from "../../api/get-hotel-details";
import { friendlyRoomName } from "@/lib/utils/room-code-names";

/**
 * Compute a stable grouping key for a rate (client-side fallback).
 *
 * Priority (matches backend resolveGroupingKey):
 * 1. `rate.roomKey` — explicit stable key from provider
 * 2. `rate.roomCode` — provider room code
 * 3. `rate.staticRoom?.name` (normalized)
 * 4. `rate.roomName` (normalized)
 * 5. Final fallback: `unknown:${rate.rateId}` — NEVER collapse blank names
 */
function resolveRateGroupKey(rate: EnrichedRate): string {
  if (rate.roomKey) return rate.roomKey;
  if (rate.roomCode) return `roomCode:${rate.roomCode}`;
  if (rate.staticRoom?.name) {
    const n = rate.staticRoom.name.toLowerCase().trim();
    if (n) return n;
  }
  const roomName = (rate.roomName ?? "").toLowerCase().trim();
  if (roomName) return roomName;
  return `unknown:${rate.rateId}`;
}

/**
 * Resolve display name for a room group — never blank.
 */
function resolveRoomDisplayName(
  bestStatic: EnrichedRate | undefined,
  cheapest: EnrichedRate,
): string {
  if (bestStatic?.staticRoom?.name) return bestStatic.staticRoom.name;
  if (cheapest.roomName) {
    const friendly = friendlyRoomName(cheapest.roomName, cheapest.roomCode);
    if (friendly) return friendly;
  }
  return "Standard Room";
}

/**
 * Resolve the display price for a rate — prefer the marked-up + display-
 * converted pricing block, then the marked customerPrice; raw supplierPrice
 * only as a last resort so markup is never leaked / missing on room cards.
 */
function getDisplayPrice(rate: EnrichedRate): { amount: number; currency: string } {
  return rate.pricing?.displayPrice ?? rate.customerPrice ?? rate.supplierPrice;
}

/**
 * Build a flattened GroupedRoom[] from enriched provider sections.
 *
 * Prefers the backend's `rooms[]` (Phase A) but falls back to client-side
 * flat grouping for backward compatibility.
 *
 * Within each room group, rates are sorted cheapest-first.
 * Rooms themselves are sorted by fromPrice cheapest-first.
 */
export function buildRoomView(
  providerSections: EnrichedProviderSection[],
): GroupedRoom[] {
  const allRooms: GroupedRoom[] = [];

  for (const section of providerSections) {
    if (section.status !== "available") continue;

    if (section.rooms && section.rooms.length > 0) {
      // Backend grouped rooms are already sorted cheapest-first
      allRooms.push(...section.rooms);
    } else {
      // Fallback: group flat rates with stable key priority
      allRooms.push(...groupRatesFallback(section.rates));
    }
  }

  // Sort all rooms cheapest-first
  allRooms.sort((a, b) => a.fromPrice.amount - b.fromPrice.amount);

  return allRooms;
}

/**
 * Client-side fallback: group flat rates by stable key.
 * Used when the backend doesn't return rooms[] yet.
 * Uses the same key priority as backend resolveGroupingKey().
 */
function groupRatesFallback(rates: EnrichedRate[]): GroupedRoom[] {
  const groups = new Map<string, EnrichedRate[]>();

  for (const rate of rates) {
    const key = resolveRateGroupKey(rate);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(rate);
  }

  const rooms: GroupedRoom[] = [];

  for (const [key, groupRates] of groups) {
    groupRates.sort(
      (a, b) => getDisplayPrice(a).amount - getDisplayPrice(b).amount,
    );

    const cheapest = groupRates[0];
    // Resolve metadata from first rate with staticRoom, not blind rates[0]
    const bestStatic = groupRates.find((r) => r.staticRoom != null);

    const roomInfo: GroupedRoom["roomInfo"] = {};
    if (bestStatic?.staticRoom) {
      const s = bestStatic.staticRoom;
      if (s.images?.length) roomInfo.images = s.images;
      if (s.amenities?.length) roomInfo.amenities = s.amenities;
      if (s.occupancy) roomInfo.occupancy = s.occupancy;
      if (s.description) roomInfo.description = s.description;
    }

    rooms.push({
      roomKey: key,
      roomName: resolveRoomDisplayName(bestStatic, cheapest),
      roomInfo,
      fromPrice: getDisplayPrice(cheapest),
      rateCount: groupRates.length,
      rates: groupRates,
    });
  }

  rooms.sort((a, b) => a.fromPrice.amount - b.fromPrice.amount);
  return rooms;
}
