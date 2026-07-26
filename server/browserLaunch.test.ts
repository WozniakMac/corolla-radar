import { describe, expect, it } from "vitest";
import { chromiumSandboxEnabled } from "./browserLaunch";

describe("konfiguracja sandboxa Chromium", () => {
  it("domyślnie wyłącza sandbox dla zgodności z kontenerami", () => {
    expect(chromiumSandboxEnabled(undefined)).toBe(false);
    expect(chromiumSandboxEnabled("false")).toBe(false);
  });

  it("pozwala jawnie włączyć sandbox na przygotowanym hoście", () => {
    expect(chromiumSandboxEnabled("true")).toBe(true);
  });
});
