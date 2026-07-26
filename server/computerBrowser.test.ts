import { describe, expect, it } from "vitest";
import {
  isAllowedBrowserNavigation,
  normalizedListingUrl,
} from "./computerBrowser";

describe("ograniczenia headless Chrome dla analizy TOP 10", () => {
  const allowed = new Set([
    normalizedListingUrl(
      "https://www.otomoto.pl/osobowe/oferta/toyota-corolla-ID123?ref=top",
    ),
  ]);

  it("pozwala na dokładne ogłoszenie niezależnie od query i fragmentu", () => {
    expect(
      isAllowedBrowserNavigation(
        "https://www.otomoto.pl/osobowe/oferta/toyota-corolla-ID123?foo=bar#gallery",
        allowed,
      ),
    ).toBe(true);
  });

  it("blokuje inną ofertę, inny host i protokół bez TLS", () => {
    expect(
      isAllowedBrowserNavigation(
        "https://www.otomoto.pl/osobowe/oferta/inne-auto",
        allowed,
      ),
    ).toBe(false);
    expect(
      isAllowedBrowserNavigation(
        "https://example.com/osobowe/oferta/toyota-corolla-ID123",
        allowed,
      ),
    ).toBe(false);
    expect(
      isAllowedBrowserNavigation(
        "http://www.otomoto.pl/osobowe/oferta/toyota-corolla-ID123",
        allowed,
      ),
    ).toBe(false);
  });
});
