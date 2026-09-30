import type { CarSearchMode, CarSearchQuery } from "../types";

export type CarResultsContext =
  | {
      serviceType: "rental";
      pickupLocationId: string;
      returnLocationId: string;
      pickupAt: string;
      dropoffAt: string;
    }
  | {
      serviceType: "transfer";
      pickupLocationId: string;
      dropoffLocationId: string;
      pickupAt: string;
    };

const segment = (value: string) => value;

export function decodeCarsPathValue(value: string) {
  let decoded = value;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

export function buildCarsResultsPath(context: CarResultsContext) {
  if (context.serviceType === "rental") {
    return `/cars/rental/${segment(context.pickupLocationId)}/${segment(context.returnLocationId)}/${segment(context.pickupAt)}/${segment(context.dropoffAt)}`;
  }
  return `/cars/transfer/${segment(context.pickupLocationId)}/${segment(context.dropoffLocationId)}/${segment(context.pickupAt)}`;
}

export function toCarsSearchQuery(
  context: CarResultsContext,
  params: URLSearchParams,
): CarSearchQuery {
  const pickupAt = decodeCarsPathValue(context.pickupAt);
  const numeric = (key: string, minimum: number) => {
    const raw = params.get(key);
    if (raw === null || raw.trim() === "") return undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value >= minimum ? value : undefined;
  };
  const modifiers = {
    page: numeric("page", 1) ?? 1,
    pageSize: 8,
    minPrice: numeric("minPrice", 0),
    maxPrice: numeric("maxPrice", 0),
    passengerCapacity: numeric("passengerCapacity", 1),
    luggageCapacity: numeric("luggageCapacity", 1),
    transmission: params.get("transmission") || undefined,
    category: params.get("category") || undefined,
    sort: (params.get("sort") as CarSearchQuery["sort"]) || "recommended",
  };
  return context.serviceType === "rental"
    ? {
        serviceType: "rental",
        locationId: context.pickupLocationId,
        pickupAt,
        dropoffAt: decodeCarsPathValue(context.dropoffAt),
        ...modifiers,
      }
    : {
        serviceType: "transfer",
        pickupLocationId: context.pickupLocationId,
        dropoffLocationId: context.dropoffLocationId,
        pickupAt,
        ...modifiers,
      };
}

export function isCarSearchMode(value: string): value is CarSearchMode {
  return value === "rental" || value === "transfer";
}
