import { describe, expect, it } from "vitest";
import { loadServerConfig } from "./config";

describe("konfiguracja serwera", () => {
  it("pozwala na lokalny development bez hasła", () => {
    expect(loadServerConfig({ HOST: "127.0.0.1" })).toMatchObject({
      port: 4174,
      scanIntervalMinutes: 240,
    });
  });

  it("wymaga uwierzytelnienia przy nasłuchiwaniu w sieci", () => {
    expect(() => loadServerConfig({ HOST: "0.0.0.0" })).toThrow(
      /wymaga APP_USERNAME/,
    );
  });

  it("odrzuca niepełne i błędne ustawienia", () => {
    expect(() =>
      loadServerConfig({ APP_USERNAME: "radar", HOST: "127.0.0.1" }),
    ).toThrow(/muszą być ustawione razem/);
    expect(() => loadServerConfig({ PORT: "abc", HOST: "127.0.0.1" })).toThrow(
      /PORT/,
    );
  });
});
