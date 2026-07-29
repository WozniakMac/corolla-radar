import { describe, expect, it } from "vitest";
import {
  catalogInferredComponents,
  hasCatalogBlindSpot,
  hasLikelyTech,
  likelyTechConfidence,
  likelyTechEvidence,
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

  it("przewiduje Tech po charakterystycznej kombinacji wyposażenia", () => {
    const likely = {
      ...car(2024, "Comfort"),
      tech: false,
      parkingSensors: true,
      heatedSeats: true,
    };
    expect(hasLikelyTech(likely)).toBe(true);
    expect(likelyTechEvidence(likely)).toEqual([
      "parkingSensors",
      "heatedSeats",
    ]);
    expect(likelyTechConfidence(likely)).toBe(50);
  });

  it("podnosi pewność Tech od 50% do maksymalnie 90%", () => {
    const base = {
      ...car(2024, "Comfort"),
      tech: false,
      parkingSensors: true,
      heatedSeats: true,
    };
    expect(likelyTechConfidence(base)).toBe(50);
    expect(likelyTechConfidence({ ...base, rainSensor: true })).toBe(60);
    expect(
      likelyTechConfidence({
        ...base,
        rainSensor: true,
        foldingMirrors: true,
      }),
    ).toBe(70);
    expect(likelyTechConfidence({ ...base, wirelessCharging: true })).toBe(80);
    expect(
      likelyTechConfidence({
        ...base,
        wirelessCharging: true,
        rainSensor: true,
      }),
    ).toBe(90);
  });

  it("nie przewiduje Tech na podstawie jednego słabego sygnału", () => {
    expect(
      hasLikelyTech({
        ...car(2024, "Comfort"),
        tech: false,
        parkingSensors: true,
        heatedSeats: false,
        rainSensor: true,
      }),
    ).toBe(false);
  });

  it("skaluje wartość przewidywanego Tech według pewności", () => {
    const likely = {
      ...car(2024, "Comfort"),
      tech: false,
      parkingSensors: true,
      heatedSeats: true,
    };
    expect(trimMarketPremium(likely)).toBe(2500);
    expect(
      trimMarketPremium({ ...likely, trim: "Comfort + Tech", tech: true }),
    ).toBe(5000);
  });
});
