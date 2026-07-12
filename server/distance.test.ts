import { describe, expect, it } from "vitest";
import {
  distanceFromPoznan,
  polishPlacesCount,
  resolvePolishCity,
} from "./distance";

describe("polska baza miejscowości", () => {
  it("zawiera dziesiątki tysięcy miejscowości", () => {
    expect(polishPlacesCount).toBeGreaterThan(45_000);
  });

  it("rozpoznaje miasto z pola, tytułu i treści", () => {
    expect(resolvePolishCity("Konstancin-Jeziorna")?.name).toBe(
      "Konstancin-Jeziorna",
    );
    expect(
      resolvePolishCity(undefined, "Toyota Corolla - Września")?.name,
    ).toBe("Września");
    expect(
      resolvePolishCity(
        undefined,
        undefined,
        "Informacje o sprzedającym. Znajdź na mapie Bielsko-Biała",
      )?.name,
    ).toBe("Bielsko-Biała");
  });

  it("oblicza przybliżoną odległość od Poznania", () => {
    expect(distanceFromPoznan("Poznań")).toBe(0);
    expect(distanceFromPoznan("Września")).toBeGreaterThan(40);
    expect(distanceFromPoznan("Września")).toBeLessThan(70);
    expect(distanceFromPoznan("Nieistniejące Miasto XYZ")).toBe(999);
  });
});
