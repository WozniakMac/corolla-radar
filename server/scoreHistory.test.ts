import { describe, expect, it } from "vitest";
import { testCars } from "../src/data";
import { buildMarketBenchmarks } from "../src/scoring";
import { captureAllScoreHistories, captureScoreHistory } from "./scoreHistory";

describe("historia punktów", () => {
  it("zapisuje punkt odniesienia i nie duplikuje identycznego wyniku", () => {
    const car = structuredClone(testCars[0]);
    const market = buildMarketBenchmarks([car]);
    const first = captureScoreHistory(car, market, {
      capturedAt: "2026-07-26T08:00:00.000Z",
      trigger: "manual",
    });
    const duplicate = captureScoreHistory(car, market, {
      capturedAt: "2026-07-26T09:00:00.000Z",
      trigger: "automatic",
    });

    expect(first?.previousTotal).toBeUndefined();
    expect(first?.changes).toEqual([]);
    expect(duplicate).toBeUndefined();
    expect(car.scoreHistory).toHaveLength(1);
  });

  it("zapisuje zmianę składowej wraz z dokładną przyczyną", () => {
    const car = structuredClone(testCars[0]);
    car.aso = false;
    const market = buildMarketBenchmarks([car]);
    captureScoreHistory(car, market, {
      capturedAt: "2026-07-26T08:00:00.000Z",
      trigger: "manual",
    });

    car.aso = true;
    const change = captureScoreHistory(car, market, {
      capturedAt: "2026-07-26T09:00:00.000Z",
      trigger: "codex",
      source: "Toyota Pewne Auto",
    });
    const historyChange = change?.changes.find(({ key }) => key === "history");

    expect(change?.score.history).toBe(car.scoreHistory![0].score.history + 5);
    expect(historyChange).toMatchObject({
      previousPoints: car.scoreHistory![0].score.history,
      points: car.scoreHistory![0].score.history + 5,
      delta: 5,
    });
    expect(historyChange?.reasons).toContain(
      "Przestało obowiązywać: Brak potwierdzonego serwisowania lub historii ASO: −5 pkt",
    );
    expect(change).toMatchObject({
      trigger: "codex",
      source: "Toyota Pewne Auto",
    });
  });

  it("wyjaśnia zmianę punktów wynikającą ze zmiany benchmarku rynku", () => {
    const car = structuredClone(testCars[0]);
    captureScoreHistory(
      car,
      { "2023:1.8": 80_000 },
      {
        capturedAt: "2026-07-26T08:00:00.000Z",
      },
    );

    const change = captureScoreHistory(
      car,
      { "2023:1.8": 130_000 },
      {
        capturedAt: "2026-07-26T09:00:00.000Z",
      },
    );
    const dealChange = change?.changes.find(({ key }) => key === "deal");

    expect(dealChange).toBeDefined();
    expect(dealChange?.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Poprzednio: Cena efektywna"),
        expect.stringContaining("Aktualnie: Cena efektywna"),
      ]),
    );
  });

  it("tworzy historię także dla nieaktywnego auta z kompletnymi danymi", () => {
    const car = structuredClone(testCars[0]);
    car.listings[0].active = false;

    const captured = captureAllScoreHistories(
      [car],
      {},
      {
        trigger: "automatic",
      },
    );

    expect(captured.get(car.id)).toBeDefined();
    expect(car.scoreHistory).toHaveLength(1);
  });
});
