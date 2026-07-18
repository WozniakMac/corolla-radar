import { describe, expect, it } from "vitest";
import { cepikTopIds, parseCepikTimeline } from "./cepikWorker";
import { defaultFilters } from "../src/filters";
import { testCars } from "../src/data";

describe("CEPiK timeline", () => {
  it("extracts total and current owners from the real report layout", () => {
    expect(
      parseCepikTimeline(`
        28.12.2023\nPierwszy właściciel w Polsce (pozostał właścicielem do 14.04.2026)
        14.04.2026\nZmiana właściciela
        Podsumowanie zdarzeń
        Właściciele (od rejestracji do wygenerowania raportu):\n2
        Współwłaściciele (od rejestracji do wygenerowania raportu):\n0
        Liczba aktualnych właścicieli:\n1
      `),
    ).toEqual({ ownersTotal: 2, currentOwners: 1, coOwnersTotal: 0 });
  });
});

describe("CEPiK candidate rankings", () => {
  it("uses the union of general top 10 and saved-filter top 10", async () => {
    const cars = Array.from({ length: 15 }, (_, index) => ({
      ...testCars[2],
      id: `car-${index}`,
      hybrid: true,
      camera: true,
      parkingSensors: true,
      ecvt: true,
      price: 100000,
      mileage: 60000,
      listings: [
        {
          ...testCars[2].listings[0],
          active: true,
          source: index >= 10 ? "Filtrowane" : "Ogólne",
        },
      ],
    }));
    const ids = await cepikTopIds(cars, {
      ...defaultFilters,
      source: "Filtrowane",
    });
    expect(ids.size).toBe(15);
    expect(ids.has("car-0")).toBe(true);
    expect(ids.has("car-14")).toBe(true);
  });
});
