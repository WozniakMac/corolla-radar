import { describe, expect, it } from "vitest";
import { defaultFilters, engineVersion, matchesFilters } from "./filters";
import type { Car } from "./types";

const car = {
  title: "Toyota Corolla Touring Sports 2.0 Hybrid",
  description: "2.0 Hybrid Style",
  year: 2025,
  power: 178,
  price: 110000,
  mileage: 40000,
  distance: 20,
  location: "Poznań",
  trim: "Style",
  tech: true,
  vat23: true,
  listings: [{ active: true, source: "Toyota Pewne Auto" }],
  notes: [],
} as unknown as Car;

describe("offer filters", () => {
  it("identifies the engine version using model year", () => {
    expect(engineVersion(car)).toBe("2.0 Hybrid 178 KM");
  });

  it("applies a saved engine and price filter", () => {
    expect(
      matchesFilters(car, {
        ...defaultFilters,
        engine: "2.0 Hybrid 178 KM",
        maxPrice: 120000,
      }),
    ).toBe(true);
    expect(
      matchesFilters(car, {
        ...defaultFilters,
        engine: "1.8 Hybrid 140 KM",
      }),
    ).toBe(false);
  });
});
