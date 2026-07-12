import { describe, expect, it } from "vitest";
import { parseCepikTimeline } from "./cepikWorker";

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
