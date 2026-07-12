import { describe, expect, it } from "vitest";
import { isDecisionMissing } from "./codexMissing";

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
});
