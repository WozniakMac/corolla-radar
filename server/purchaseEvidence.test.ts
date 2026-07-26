import { describe, expect, it } from "vitest";
import { testCars } from "../src/data";
import type { ScoreBreakdown } from "../src/types";
import {
  isTrustedPurchaseUrl,
  preparePurchaseEvidence,
} from "./purchaseEvidence";

const score: ScoreBreakdown = {
  deal: 20,
  history: 20,
  equipment: 20,
  location: 10,
  terms: 10,
  total: 80,
  confidence: 90,
};

const listingUrl = "https://www.otomoto.pl/osobowe/oferta/test";
const page = `<!doctype html>
<html>
  <head>
    <title>Toyota Corolla Touring Sports 2023 - 99 000 PLN</title>
    <script type="application/ld+json">
      {
        "@type": "Vehicle",
        "name": "Toyota Corolla Touring Sports",
        "description": "Salon Polska, serwis ASO, kamera cofania.",
        "vehicleColor": "Niebieski metalik",
        "offers": { "price": 99000 },
        "mileageFromOdometer": { "value": 50000 }
      }
    </script>
  </head>
  <body>
    <h1>Toyota Corolla Touring Sports Hybrid</h1>
    Rok produkcji 2023. Przebieg 50 000 km. Salon Polska. Serwisowana w ASO.
  </body>
</html>`;

describe("materiały do analizy zakupowej", () => {
  it("dopuszcza tylko znane serwisy ogłoszeń", () => {
    expect(isTrustedPurchaseUrl(listingUrl)).toBe(true);
    expect(isTrustedPurchaseUrl("https://127.0.0.1/photo.jpg")).toBe(false);
    expect(isTrustedPurchaseUrl("http://www.otomoto.pl/oferta/test")).toBe(
      false,
    );
    expect(isTrustedPurchaseUrl("https://otomoto.pl.attacker.test/x")).toBe(
      false,
    );
  });

  it("odświeża stronę i dodaje wykryty kolor do opisu dla AI", async () => {
    const car = {
      ...structuredClone(testCars[1]),
      id: "car-visual",
      listings: [
        {
          ...structuredClone(testCars[1].listings[0]),
          url: listingUrl,
          active: true,
        },
      ],
    };
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      if (url === listingUrl)
        return new Response(page, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      return new Response("not found", { status: 404 });
    };
    const prepared = await preparePurchaseEvidence(
      [{ car, score, explanations: [] }],
      fetchImpl,
    );
    try {
      expect(prepared.summary).toMatchObject({
        pagesAttempted: 1,
        pagesRefreshed: 1,
        pagesFailed: 0,
        carsWithColor: 1,
      });
      expect(prepared.report.listings[0]).toMatchObject({
        carId: "car-visual",
        requestedUrl: listingUrl,
        status: "refreshed",
        color: "Niebieski metalik",
      });
      expect(prepared.report.listings[0].description).toMatch(
        /^Kolor nadwozia: Niebieski metalik\./,
      );
      expect(prepared.report.listings[0].parsedFacts).toMatchObject({
        hybrid: true,
        polishSalon: true,
        aso: true,
      });
      expect(prepared.report.listings[0].pageText).toContain(
        "Przebieg 50 000 km",
      );
    } finally {
      await prepared.cleanup();
    }
  });

  it("oznacza auto jako niedostępne, gdy wszystkie publikacje zwracają 410", async () => {
    const car = {
      ...structuredClone(testCars[1]),
      id: "car-gone",
      listings: [
        {
          ...structuredClone(testCars[1].listings[0]),
          url: listingUrl,
          active: true,
          images: [],
        },
      ],
    };
    const prepared = await preparePurchaseEvidence(
      [{ car, score, explanations: [] }],
      async () => new Response("gone", { status: 410 }),
    );
    try {
      expect(prepared.report.listings[0].status).toBe("unavailable");
      expect(prepared.unavailableCarIds).toEqual(["car-gone"]);
    } finally {
      await prepared.cleanup();
    }
  });
});
