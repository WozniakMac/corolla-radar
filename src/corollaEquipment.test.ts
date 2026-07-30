import { describe, expect, it } from "vitest";
import {
  catalogInferredComponents,
  hasCatalogBlindSpot,
  hasTechEquivalent,
  trimMarketPremium,
  trimVariant,
} from "./corollaEquipment";
import { testCars } from "./data";

const car = (year: number, trim: string) => ({ ...testCars[0], year, trim });

describe("wersje wyposażenia Corolli", () => {
  it("odróżnia starszy pakiet Style od wersji Style po liftingu", () => {
    expect(trimVariant(car(2022, "Comfort + Style"))).toBe("Comfort + Style");
    expect(trimVariant(car(2022, "STYLE"))).toBe("Comfort + Style");
    expect(trimVariant(car(2023, "STYLE"))).toBe("Style");
  });

  it("ręcznie wykluczony Tech pokazuje i wycenia jako Comfort", () => {
    const excluded = {
      ...car(2024, "Comfort + Tech"),
      tech: true,
      techOverride: "excluded" as const,
    };
    expect(trimVariant(excluded)).toBe("Comfort");
    expect(trimMarketPremium(excluded)).toBe(0);
  });

  it("uwzględnia rosnącą wartość wersji ponad Comfort", () => {
    const trims = [
      "Comfort",
      "Comfort + Tech",
      "Style",
      "GR Sport",
      "Executive",
    ];
    const premiums = trims.map((trim) => trimMarketPremium(car(2024, trim)));
    expect(premiums).toEqual([0, 5000, 11000, 16000, 20000]);
  });

  it("traktuje Style, GR Sport i Executive MY2023+ jako odpowiedniki Tech", () => {
    for (const trim of ["Style", "GR Sport", "Executive"])
      expect(catalogInferredComponents(car(2024, trim))).toHaveLength(11);
  });

  it("rozpoznaje BSM katalogowo tylko tam, gdzie jest potwierdzony", () => {
    expect(hasCatalogBlindSpot(car(2024, "Executive"))).toBe(true);
    expect(hasCatalogBlindSpot(car(2024, "Style"))).toBe(false);
  });

  it("nie wyznacza Tech procentowo na podstawie pojedynczych elementów wyposażenia", () => {
    const comfort = {
      ...car(2024, "Comfort"),
      tech: false,
      parkingSensors: true,
      heatedSeats: true,
      heatedSteeringWheel: true,
      wirelessCharging: true,
    };
    expect(hasTechEquivalent(comfort)).toBe(false);
    expect(trimMarketPremium(comfort)).toBe(0);
  });

  it("podejmuje binarną decyzję na podstawie wersji wyposażenia", () => {
    expect(hasTechEquivalent(car(2024, "Comfort + Tech"))).toBe(true);
    expect(hasTechEquivalent(car(2024, "Style"))).toBe(true);
    expect(hasTechEquivalent(car(2024, "GR Sport"))).toBe(true);
    expect(hasTechEquivalent(car(2024, "Executive"))).toBe(true);
    expect(hasTechEquivalent(car(2024, "Comfort"))).toBe(false);
    expect(hasTechEquivalent(car(2024, "Active"))).toBe(false);
  });
});
