import { describe, expect, it } from "vitest";
import { loadServerConfig } from "./config";

describe("konfiguracja serwera", () => {
  it("pozwala na nasłuchiwanie lokalne i w prywatnej sieci", () => {
    expect(loadServerConfig({ HOST: "127.0.0.1" })).toMatchObject({
      port: 4174,
      scanIntervalMinutes: 240,
    });
    expect(loadServerConfig({ HOST: "0.0.0.0" }).host).toBe("0.0.0.0");
  });

  it("odrzuca błędne ustawienia", () => {
    expect(() => loadServerConfig({ PORT: "abc", HOST: "127.0.0.1" })).toThrow(
      /PORT/,
    );
  });
});
