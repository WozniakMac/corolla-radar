import { describe, expect, it } from "vitest";
import { codexVerificationReasons, isDecisionMissing } from "./codexMissing";

describe("kwalifikacja do kolejki Codex", () => {
  it("nie kwalifikuje braków wyłącznie informacyjnych", () => {
    expect(isDecisionMissing(["VIN", "wersja", "moc", "lokalizacja"])).toBe(
      false,
    );
  });

  it("kwalifikuje braki wpływające na decyzję zakupową", () => {
    expect(isDecisionMissing(["VIN", "kamera"])).toBe(true);
    expect(isDecisionMissing(["czujniki parkowania"])).toBe(true);
    expect(isDecisionMissing(["Hybrid"])).toBe(true);
    expect(isDecisionMissing(["1.8 Hybrid"])).toBe(false);
    expect(isDecisionMissing(["cena"])).toBe(true);
  });

  it("wyjaśnia dokładnie każdy brak decyzyjny", () => {
    expect(
      codexVerificationReasons(["kamera", "czujniki parkowania", "VIN"]),
    ).toEqual([
      "Nie udało się potwierdzić kamery cofania wymaganej do rankingu.",
      "Nie udało się potwierdzić czujników parkowania wymaganych do rankingu.",
    ]);
  });

  it("wyjaśnia odrzucenie ogólnego tekstu marketingowego", () => {
    expect(
      codexVerificationReasons(["kamera"], {
        cameraMentionRejectedAsMarketing: true,
      }),
    ).toEqual([
      "Strona wspomina o kamerze tylko w ogólnym tekście marketingowym; brak dowodu, że ma ją ten egzemplarz.",
    ]);
  });
});
