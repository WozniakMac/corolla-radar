import { describe, expect, it } from "vitest";
import {
  catalogInferredComponents,
  hasCatalogBlindSpot,
  hasLikelyTech,
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

  it("wycenia przewidywany Tech tak samo jak nazwany pakiet Tech", () => {
    const likely = {
      ...car(2024, "Comfort"),
      tech: false,
      parkingSensors: true,
      heatedSeats: true,
    };
    expect(trimMarketPremium(likely)).toBe(
      trimMarketPremium({ ...likely, trim: "Comfort + Tech", tech: true }),
    );
  });
});
