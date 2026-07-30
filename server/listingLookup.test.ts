import { describe, expect, it } from "vitest";
import { testCars } from "../src/data";
import { findCarByListingUrl, normalizeListingUrl } from "./listingLookup";

describe("wyszukiwanie auta po URL-u ogłoszenia", () => {
  it("ignoruje query string, fragment i końcowy ukośnik", () => {
    expect(
      normalizeListingUrl(
        "https://pewneauto.pl/oferta/toyota-corolla/406431/?utm_source=ai#x",
      ),
    ).toBe("https://pewneauto.pl/oferta/toyota-corolla/406431");
    expect(
      findCarByListingUrl(
        testCars,
        "https://pewneauto.pl/oferta/toyota-corolla/406431?ref=external",
      )?.car.id,
    ).toBe("corolla-2023-tarnow");
  });

  it("odrzuca URL spoza HTTP(S)", () => {
    expect(() => normalizeListingUrl("file:///tmp/listing")).toThrow(/HTTP/);
  });
});
