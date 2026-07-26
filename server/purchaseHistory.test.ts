import { describe, expect, it } from "vitest";
import type { PurchaseAnalysisRecord } from "../src/types";
import { appendPurchaseAnalysis } from "./purchaseHistory";
import type { Store } from "./store";

const record = (id: string): PurchaseAnalysisRecord =>
  ({
    id,
    analysis: {
      generatedAt: `2026-07-26T20:00:0${id}.000Z`,
      winnerId: `car-${id}`,
      verdict: "Werdykt",
      comparisonSummary: "Podsumowanie",
      confidence: 80,
      rankings: [],
      commonChecks: [],
      dealBreakers: [],
    },
    candidates: [],
    filters: {},
    evidence: {
      inspectedAt: "2026-07-26T20:00:00.000Z",
      pagesAttempted: 10,
      pagesRefreshed: 10,
      pagesFailed: 0,
      carsWithColor: 8,
      warnings: [],
    },
  }) as PurchaseAnalysisRecord;

describe("historia analiz zakupowych", () => {
  it("dopisuje kolejne wyniki bez usuwania poprzednich", () => {
    const store: Store = { cars: [], jobs: [] };
    appendPurchaseAnalysis(store, record("1"));
    appendPurchaseAnalysis(store, record("2"));

    expect(store.purchaseAnalyses?.map((item) => item.id)).toEqual(["1", "2"]);
  });
});
