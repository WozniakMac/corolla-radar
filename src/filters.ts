import { trimVariant } from "./corollaEquipment";
import { effectivePrice } from "./scoring";
import type { Car, FilterState } from "./types";
import { detectEngineSpec } from "./engine";

export const defaultFilters: FilterState = {
  query: "",
  source: "all",
  trim: "all",
  engine: "all",
  minPrice: 0,
  maxPrice: 150000,
  maxKm: 200000,
  maxDistance: 0,
  year: "all",
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
    (filters.year === "all" || car.year === Number(filters.year)) &&
    (filters.trim === "all" || trimVariant(car) === filters.trim) &&
    (filters.engine === "all" || engineVersion(car) === filters.engine) &&
    (filters.source === "all" ||
      car.listings.some(
        (listing) => listing.active && listing.source === filters.source,
      )) &&
    (!filters.tech || car.tech) &&
    (!filters.vat || car.vat23)
  );
}

export function normalizeFilters(value: unknown): FilterState {
  if (!value || typeof value !== "object") return defaultFilters;
  const input = value as Partial<FilterState>;
  return {
    ...defaultFilters,
    ...input,
    query: typeof input.query === "string" ? input.query : "",
    source: typeof input.source === "string" ? input.source : "all",
    trim: typeof input.trim === "string" ? input.trim : "all",
    engine: typeof input.engine === "string" ? input.engine : "all",
    year: typeof input.year === "string" ? input.year : "all",
    minPrice: Number(input.minPrice) || 0,
    maxPrice: Number.isFinite(Number(input.maxPrice))
      ? Number(input.maxPrice)
      : defaultFilters.maxPrice,
    maxKm: Number(input.maxKm) || defaultFilters.maxKm,
    maxDistance: Number(input.maxDistance) || 0,
    tech: input.tech === true,
    vat: input.vat === true,
  };
}
