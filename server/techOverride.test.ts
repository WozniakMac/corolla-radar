import { describe, expect, it } from "vitest";
import { hasTechEquivalent, scoreCar } from "../src/scoring";
import type { Car } from "../src/types";
import { testCars } from "../src/data";
import type { Store } from "./store";
import { applyTechOverride } from "./techOverride";

const comfortCar = (): Car => ({
  ...testCars[0],
  id: "likely-tech",
  year: 2024,
  trim: "Comfort",
  tech: false,
  parkingSensors: true,
  heatedSeats: true,
});

const storeWith = (car: Car): Store => ({
  cars: [car],
  jobs: [],
});

describe("ręczna decyzja Tech", () => {
  it("wyklucza Tech i obniża punktację wersji Comfort + Tech", () => {
    const car = {
      ...comfortCar(),
      trim: "Comfort + Tech",
      tech: true,
    };
    const store = storeWith(car);
    const previous = scoreCar(car).equipment;

    const updated = applyTechOverride(store, car.id, "excluded")!;

    expect(updated.techOverride).toBe("excluded");
    expect(hasTechEquivalent(updated)).toBe(false);
    expect(scoreCar(updated).equipment).toBeLessThan(previous);
    expect(updated.scoreHistory?.at(-1)?.trigger).toBe("manual-edit");
  });

  it("nadaje pełne Tech i zwiększa punktację", () => {
    const car = comfortCar();
    const store = storeWith(car);
    const previous = scoreCar(car).equipment;

    const updated = applyTechOverride(store, car.id, "confirmed")!;

    expect(updated.techOverride).toBe("confirmed");
    expect(hasTechEquivalent(updated)).toBe(true);
    expect(scoreCar(updated).equipment).toBe(9);
    expect(scoreCar(updated).equipment).toBeGreaterThan(previous);
  });

  it("cofa ręczną decyzję i wraca do binarnej oceny wersji", () => {
    const car = { ...comfortCar(), techOverride: "excluded" as const };
    const updated = applyTechOverride(storeWith(car), car.id, null)!;

    expect(updated.techOverride).toBeUndefined();
    expect(hasTechEquivalent(updated)).toBe(false);
    expect(scoreCar(updated).equipment).toBe(1);
  });

  it("ręczne wykluczenie jest nadrzędne wobec nazwy Tech", () => {
    const car = {
      ...comfortCar(),
      tech: true,
      trim: "Comfort + Tech",
    };
    const updated = applyTechOverride(storeWith(car), car.id, "excluded")!;

    expect(hasTechEquivalent(updated)).toBe(false);
    expect(scoreCar(updated).equipment).toBe(1);
  });
});
