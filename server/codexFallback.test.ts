import { describe, expect, it } from "vitest";
import {
  codexEnvironment,
  codexApiKeyConfigured,
  codexStructuredArgs,
  requireCodexApiKey,
} from "./codexFallback";

describe("uwierzytelnienie Codex przez ENV", () => {
  it("rozpoznaje skonfigurowany klucz", () => {
    expect(codexApiKeyConfigured({ OPENAI_API_KEY: "sk-test" })).toBe(true);
    expect(requireCodexApiKey({ OPENAI_API_KEY: " sk-test " })).toBe("sk-test");
  });

  it("odrzuca brak lub pusty klucz czytelnym błędem", () => {
    expect(codexApiKeyConfigured({ OPENAI_API_KEY: "  " })).toBe(false);
    expect(() => requireCodexApiKey({})).toThrow(/OPENAI_API_KEY/);
  });

  it("nie przekazuje pozostałych sekretów aplikacji do procesu Codex", () => {
    const env = codexEnvironment("sk-test", "/tmp/codex", {
      PATH: "/usr/bin",
      SOME_OTHER_SECRET: "secret",
      NTFY_URL: "https://ntfy.example/secret",
    });
    expect(env).toMatchObject({
      PATH: "/usr/bin",
      CODEX_HOME: "/tmp/codex",
      OPENAI_API_KEY: "sk-test",
    });
    expect(env).not.toHaveProperty("SOME_OTHER_SECRET");
    expect(env).not.toHaveProperty("NTFY_URL");
  });

  it("przekazuje obrazy osobnymi flagami, a długi prompt przez stdin", () => {
    const args = codexStructuredArgs("server/schema.json", "/tmp/output.json", [
      "/tmp/car-1.jpg",
      "/tmp/car-2.png",
    ]);
    expect(args).toContain("-");
    expect(args.slice(0, 7)).toEqual([
      "exec",
      "--ephemeral",
      "--image",
      "/tmp/car-1.jpg",
      "--image",
      "/tmp/car-2.png",
      "--sandbox",
    ]);
    expect(args).not.toContain("bardzo długi prompt");
  });
});
