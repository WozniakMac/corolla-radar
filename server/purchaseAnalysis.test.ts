import { describe, expect, it } from "vitest";
import { testCars } from "../src/data";
import type { PurchaseAnalysis } from "../src/types";
import {
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
    rationale: "Ocena na podstawie przekazanych danych.",
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

  it("wymaga zgodności zwycięzcy z pierwszą pozycją", () => {
    const ids = purchaseCars.slice(0, 10).map((car) => car.id);
    const invalid = { ...modelResult(ids), winnerId: ids[1] };
    expect(() => validatePurchaseAnalysis(invalid, ids)).toThrow(/Zwycięzca/);
  });
});
