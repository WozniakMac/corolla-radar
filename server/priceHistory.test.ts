import { describe, expect, it } from "vitest";
import { testCars } from "../src/data";
import { pendingPriceDrops, priceDrops } from "./notifications";
import { recordPriceObservation, upsertParsedCar } from "./pipeline";
import type { Store } from "./store";

describe("historia cen", () => {
  it("nie zapisuje kolejnego odczytu, gdy cena się nie zmieniła", () => {
    const history = recordPriceObservation(
      {
        price: 99_900,
        cashPrice: 102_500,
        checkedAt: "2026-07-20T08:00:00.000Z",
      },
      { price: 99_900, cashPrice: 102_500 },
      "2026-07-21T08:00:00.000Z",
    );

    expect(history).toEqual([
      {
        capturedAt: "2026-07-20T08:00:00.000Z",
        price: 99_900,
        cashPrice: 102_500,
      },
    ]);
  });

  it("zapisuje dokładnie każdą zmianę ceny", () => {
    const first = recordPriceObservation(
      { price: 102_500, checkedAt: "2026-07-20T08:00:00.000Z" },
      { price: 99_900 },
      "2026-07-21T08:00:00.000Z",
    );
    const second = recordPriceObservation(
      { price: 99_900, priceHistory: first },
      { price: 100_900 },
      "2026-07-22T08:00:00.000Z",
    );

    expect(second.map((entry) => entry.price)).toEqual([
      102_500, 99_900, 100_900,
    ]);
  });

  it("wykrywa tylko obniżki efektywnej ceny", () => {
    const car = {
      ...testCars[0],
      listings: [
        {
          ...testCars[0].listings[0],
          priceHistory: [
            { capturedAt: "2026-07-20T08:00:00.000Z", price: 105_000 },
            { capturedAt: "2026-07-21T08:00:00.000Z", price: 99_900 },
            { capturedAt: "2026-07-22T08:00:00.000Z", price: 100_900 },
          ],
        },
      ],
    };

    expect(priceDrops(car)).toMatchObject([
      { previousPrice: 105_000, price: 99_900 },
    ]);
  });

  it("wykrywa niższą cenę auta także po dodaniu drugiego portalu", () => {
    const car = {
      ...testCars[0],
      priceHistory: [
        {
          capturedAt: "2026-07-20T08:00:00.000Z",
          price: 105_000,
          source: "Toyota Pewne Auto",
          url: "https://pewneauto.pl/oferta/123",
        },
        {
          capturedAt: "2026-07-21T08:00:00.000Z",
          price: 99_900,
          source: "OTOMOTO",
          url: "https://otomoto.pl/oferta/abc",
        },
      ],
    };

    expect(priceDrops(car)).toContainEqual(
      expect.objectContaining({
        source: "OTOMOTO",
        previousPrice: 105_000,
        price: 99_900,
      }),
    );
  });

  it("każdą obniżkę powiadamia tylko raz", () => {
    const car = {
      ...testCars[0],
      listings: [
        {
          ...testCars[0].listings[0],
          priceHistory: [
            { capturedAt: "2026-07-20T08:00:00.000Z", price: 105_000 },
            { capturedAt: "2026-07-21T08:00:00.000Z", price: 99_900 },
          ],
        },
      ],
    };
    const pending = pendingPriceDrops(car, []);

    expect(pending).toHaveLength(1);
    expect(pendingPriceDrops(car, [pending[0].key])).toHaveLength(0);
  });

  it("upsert zachowuje poprzednią cenę publikacji", () => {
    const original = structuredClone(testCars[0]);
    const db: Store = { cars: [original], jobs: [] };

    upsertParsedCar(
      db,
      {
        finalUrl: original.listings[0].url,
        title: original.title,
        year: original.year,
        power: original.power,
        engineVersion: original.engineVersion,
        price: 89_900,
        cashPrice: 91_900,
        mileage: original.mileage,
        location: original.location,
        trim: original.trim,
        text: "Toyota Corolla Touring Sports Hybrid automat",
        description: "Toyota Corolla Touring Sports Hybrid automat",
        images: [],
        active: true,
        eligibleBody: true,
      } as any,
      "Toyota Pewne Auto",
    );

    const listing = (db.cars[0] as any).listings[0];
    expect(listing.priceHistory.map((entry: any) => entry.price)).toEqual([
      92_900, 89_900,
    ]);
    expect(listing.priceHistory.at(-1).cashPrice).toBe(91_900);
  });
});
