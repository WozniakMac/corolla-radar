import { describe, expect, it } from "vitest";
import { testCars } from "../src/data";
import type { PurchaseAnalysis } from "../src/types";
import {
  buildPurchaseAnalysisInput,
  calculatePurchaseScore,
  rankTopTenForPurchase,
  validatePurchaseAnalysis,
} from "./purchaseAnalysis";

const purchaseCars = Array.from({ length: 11 }, (_, index) => ({
  ...structuredClone(testCars[1]),
  id: `car-${index + 1}`,
  title: `Corolla ${index + 1}`,
  price: 85_000 + index * 1_000,
  cashPrice: undefined,
  distance: 100,
  parkingSensors: true,
  hybrid: true,
  listings: [
    {
      ...structuredClone(testCars[1].listings[0]),
      url: `https://example.test/car-${index + 1}`,
      price: 85_000 + index * 1_000,
    },
  ],
}));

const modelResult = (ids: string[]): Omit<PurchaseAnalysis, "generatedAt"> => ({
  winnerId: ids[0],
  verdict: "Pierwsze auto ma najlepszy bilans.",
  comparisonSummary: "Porównano wszystkie auta.",
  confidence: 85,
  rankings: ids.map((carId, index) => ({
    rank: index + 1,
    carId,
    recommendation: index === 0 ? "kup" : "shortlista",
    purchaseScore: 100 - index,
    scoreBreakdown: {
      value: 30,
      history: 25,
      equipment: 15,
      convenience: 10,
      evidence: 20,
      riskPenalty: index,
    },
    rationale: "Ocena na podstawie przekazanych danych.",
    visualAssessment: "Zdjęcia nie pokazują oczywistych problemów.",
    visualRisks: [],
    strengths: [],
    risks: [],
    nextSteps: [],
    negotiationTarget: null,
    maxRecommendedPrice: null,
  })),
  commonChecks: [],
  dealBreakers: [],
});

describe("doradca zakupowy TOP 10", () => {
  it("przekazuje modelowi pełne TOP 10 i odświeżone dane strony z kolorem", () => {
    const selection = rankTopTenForPurchase(purchaseCars, {});
    const input = buildPurchaseAnalysisInput(
      selection.ranked,
      selection.filters,
      {
        inspectedAt: "2026-07-26T20:00:00.000Z",
        listings: [
          {
            carId: selection.ranked[0].car.id,
            source: "Otomoto",
            requestedUrl: "https://www.otomoto.pl/oferta/test",
            fetchedAt: "2026-07-26T20:00:00.000Z",
            status: "refreshed",
            color: "Niebieski metalik",
            description: "Kolor nadwozia: Niebieski metalik.\nPełny opis.",
            pageText: "Pełny tekst odświeżonej strony",
            parsedFacts: {
              vin: "SB1ZB3AE20E040424",
              hybrid: true,
              aso: true,
            },
          },
        ],
      },
    );

    expect(input.cars).toHaveLength(10);
    expect(input.liveInspection.listings[0]).toMatchObject({
      color: "Niebieski metalik",
      description: expect.stringContaining("Kolor nadwozia"),
      pageText: "Pełny tekst odświeżonej strony",
      parsedFacts: {
        vin: "SB1ZB3AE20E040424",
        hybrid: true,
        aso: true,
      },
    });
    expect(input.cars[0]).toHaveProperty("priceHistory");
    expect(input.cars[0]).toHaveProperty("cepik");
    expect(input.cars[0]).not.toHaveProperty("radarRank");
    expect(input.cars[0]).not.toHaveProperty("radarScore");
    expect(input.cars[0]).not.toHaveProperty("scoreEvidence");
    expect(input.rules.startingPoint).toContain("Nie znasz pozycji");
    expect(input.cars.map((car) => car.id)).not.toEqual(
      selection.ranked.map(({ car }) => car.id),
    );
  });

  it("wybiera dokładnie pierwsze 10 aut po zastosowaniu filtrów", () => {
    const selection = rankTopTenForPurchase(purchaseCars, {
      maxPrice: 150_000,
      maxKm: 200_000,
    });
    expect(selection.available).toBe(11);
    expect(selection.ranked).toHaveLength(10);
    expect(new Set(selection.ranked.map(({ car }) => car.id)).size).toBe(10);
    expect(selection.ranked[0].score.total).toBeGreaterThanOrEqual(
      selection.ranked[9].score.total,
    );
  });

  it("dobiera kolejne auto po potwierdzeniu niedostępnej oferty", () => {
    const initial = rankTopTenForPurchase(purchaseCars, {});
    const excludedId = initial.ranked[0].car.id;
    const replacement = rankTopTenForPurchase(
      purchaseCars,
      {},
      new Set([excludedId]),
    );
    expect(replacement.ranked).toHaveLength(10);
    expect(replacement.ranked.map(({ car }) => car.id)).not.toContain(
      excludedId,
    );
    expect(replacement.ranked.map(({ car }) => car.id)).toContain("car-11");
  });

  it("odrzuca wynik, który pomija lub podmienia auto", () => {
    const ids = purchaseCars.slice(0, 10).map((car) => car.id);
    expect(
      validatePurchaseAnalysis(modelResult(ids), ids).rankings,
    ).toHaveLength(10);
    const invalid = modelResult(ids);
    invalid.rankings[9].carId = "inne-auto";
    expect(() => validatePurchaseAnalysis(invalid, ids)).toThrow(
      /zmienił skład/,
    );
  });

  it("pozwala ustalić niezależną kolejność i zwycięzcę", () => {
    const ids = purchaseCars.slice(0, 10).map((car) => car.id);
    const independentOrder = [ids[4], ...ids.slice(0, 4), ...ids.slice(5)];
    const result = validatePurchaseAnalysis(modelResult(independentOrder), ids);
    expect(result.winnerId).toBe(ids[4]);
    expect(result.rankings.map((item) => item.carId)).toEqual(independentOrder);
  });

  it("odrzuca ranking niesortowany według oceny zakupowej", () => {
    const ids = purchaseCars.slice(0, 10).map((car) => car.id);
    const invalid = modelResult(ids);
    invalid.rankings[0].purchaseScore = 99;
    invalid.rankings[0].scoreBreakdown!.riskPenalty = 1;
    invalid.rankings[1].purchaseScore = 100;
    invalid.rankings[1].scoreBreakdown!.riskPenalty = 0;
    expect(() => validatePurchaseAnalysis(invalid, ids)).toThrow(
      /nie posortowało/,
    );
  });

  it("odrzuca zwycięzcę, który nie jest pierwszy w rankingu zakupowym", () => {
    const ids = purchaseCars.slice(0, 10).map((car) => car.id);
    const invalid = { ...modelResult(ids), winnerId: ids[1] };
    expect(() => validatePurchaseAnalysis(invalid, ids)).toThrow(
      /nie zgadza się/,
    );
  });

  it("odrzuca ocenę niezgodną z jawnym bilansem punktów", () => {
    const ids = purchaseCars.slice(0, 10).map((car) => car.id);
    const invalid = modelResult(ids);
    invalid.rankings[0].purchaseScore = 99;
    expect(() => validatePurchaseAnalysis(invalid, ids)).toThrow(
      /błędnie obliczyło/,
    );
  });

  it("odrzuca wynik bez jawnego bilansu punktów", () => {
    const ids = purchaseCars.slice(0, 10).map((car) => car.id);
    const invalid = modelResult(ids);
    delete invalid.rankings[0].scoreBreakdown;
    expect(() => validatePurchaseAnalysis(invalid, ids)).toThrow(
      /nie zwróciło bilansu/,
    );
  });

  it("liczy ocenę zakupową z karą za ryzyko i ogranicza ją do zera", () => {
    expect(
      calculatePurchaseScore({
        value: 25,
        history: 20,
        equipment: 10,
        convenience: 8,
        evidence: 15,
        riskPenalty: 12,
      }),
    ).toBe(66);
    expect(
      calculatePurchaseScore({
        value: 0,
        history: 0,
        equipment: 0,
        convenience: 0,
        evidence: 0,
        riskPenalty: 40,
      }),
    ).toBe(0);
  });
});
