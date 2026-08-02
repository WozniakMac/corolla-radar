import { trimVariant } from "./corollaEquipment";
import { effectivePrice, hasTechEquivalent } from "./scoring";
import type { Car, FilterState } from "./types";
import { detectEngineSpec } from "./engine";

export const defaultFilters: FilterState = {
  query: "",
  source: [],
  trim: [],
  engine: [],
  minPrice: 0,
  maxPrice: 150000,
  maxKm: 200000,
  maxDistance: 0,
  ignoreDistance: false,
  year: [],
  tech: false,
  vat: false,
};

export function engineVersion(
  car: Pick<Car, "engineVersion" | "power" | "year" | "title" | "description">,
) {
  if (car.engineVersion) return car.engineVersion;
  const detected = detectEngineSpec(
    car.year,
    `${car.title} ${(car.description || "").slice(0, 2000)}`,
  );
  if (detected) return detected.label;
  if ([122, 140].includes(car.power)) return `1.8 Hybrid ${car.power} KM`;
  if ([178, 180, 184, 196].includes(car.power))
    return `2.0 Hybrid ${car.power} KM`;
  return car.power ? `Inna / ${car.power} KM` : "Nieustalona";
}

export function matchesFilters(car: Car, filters: FilterState) {
  const searchable = `${car.title} ${car.location} ${car.trim}`.toLowerCase();
  return (
    searchable.includes(filters.query.trim().toLowerCase()) &&
    effectivePrice(car) >= filters.minPrice &&
    (filters.maxPrice === 0 || effectivePrice(car) <= filters.maxPrice) &&
    car.mileage <= filters.maxKm &&
    (filters.maxDistance === 0 || car.distance <= filters.maxDistance) &&
    (!filters.year.length || filters.year.includes(String(car.year))) &&
    (!filters.trim.length || filters.trim.includes(trimVariant(car))) &&
    (!filters.engine.length || filters.engine.includes(engineVersion(car))) &&
    (!filters.source.length ||
      car.listings.some(
        (listing) => listing.active && filters.source.includes(listing.source),
      )) &&
    (!filters.tech || hasTechEquivalent(car)) &&
    (!filters.vat || car.vat23)
  );
}

function normalizeSelection(value: unknown) {
  const items = Array.isArray(value) ? value : [value];
  return [
    ...new Set(
      items
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item && item !== "all"),
    ),
  ];
}

export function normalizeFilters(value: unknown): FilterState {
  if (!value || typeof value !== "object") return defaultFilters;
  const input = value as Record<string, unknown>;
  return {
    ...defaultFilters,
    query: typeof input.query === "string" ? input.query : "",
    source: normalizeSelection(input.source),
    trim: normalizeSelection(input.trim),
    engine: normalizeSelection(input.engine),
    year: normalizeSelection(input.year),
    minPrice: Number(input.minPrice) || 0,
    maxPrice: Number.isFinite(Number(input.maxPrice))
      ? Number(input.maxPrice)
      : defaultFilters.maxPrice,
    maxKm: Number(input.maxKm) || defaultFilters.maxKm,
    maxDistance: Number(input.maxDistance) || 0,
    ignoreDistance: input.ignoreDistance === true,
    tech: input.tech === true,
    vat: input.vat === true,
  };
}
