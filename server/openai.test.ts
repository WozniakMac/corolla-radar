import { describe, expect, it } from "vitest";
import {
  buildResponsesRequest,
  extractResponseText,
  openAiApiKeyConfigured,
  openAiBaseUrl,
  openAiModel,
  requireOpenAiApiKey,
  runOpenAiStructured,
} from "./openai";

describe("bezpośrednia integracja OpenAI Responses API", () => {
  it("czyta klucz i ustawienia z ENV", () => {
    const env = {
      OPENAI_API_KEY: " sk-test ",
      OPENAI_MODEL: "gpt-test",
      OPENAI_BASE_URL: "https://example.test/v1/",
    };
    expect(openAiApiKeyConfigured(env)).toBe(true);
    expect(requireOpenAiApiKey(env)).toBe("sk-test");
    expect(openAiModel(env)).toBe("gpt-test");
    expect(openAiBaseUrl(env)).toBe("https://example.test/v1");
  });

  it("odrzuca brak lub pusty klucz czytelnym błędem", () => {
    expect(openAiApiKeyConfigured({ OPENAI_API_KEY: "  " })).toBe(false);
    expect(() => requireOpenAiApiKey({})).toThrow(/OPENAI_API_KEY/);
  });

  it("buduje tekstowe żądanie ze ścisłym schematem bez narzędzi i obrazów", () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["answer"],
      properties: { answer: { type: "string" } },
    };
    const request = buildResponsesRequest("Porównaj auta", schema, {
      OPENAI_MODEL: "gpt-test",
      OPENAI_REASONING_EFFORT: "medium",
    });
    expect(request).toMatchObject({
      model: "gpt-test",
      store: false,
      reasoning: { effort: "medium" },
      text: {
        format: {
          type: "json_schema",
          strict: true,
          schema,
        },
      },
    });
    expect(request.input[0].content).toEqual([
      { type: "input_text", text: "Porównaj auta" },
    ]);
    expect(request).not.toHaveProperty("tools");
  });

  it("odczytuje tekst z surowej odpowiedzi Responses API", () => {
    expect(
      extractResponseText({
        status: "completed",
        output: [
          {
            content: [{ type: "output_text", text: '{"answer":"ok"}' }],
          },
        ],
      }),
    ).toBe('{"answer":"ok"}');
  });

  it("wysyła autoryzowane żądanie bezpośrednio do endpointu Responses", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const result = await runOpenAiStructured<{ confidence: number }>(
      "Odczytaj ogłoszenie",
      "server/codex-output.schema.json",
      1_000,
      {
        OPENAI_API_KEY: "sk-test",
        OPENAI_MODEL: "gpt-test",
        OPENAI_BASE_URL: "https://example.test/v1",
      },
      async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: '{"confidence":0.9}',
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    expect(result).toEqual({ confidence: 0.9 });
    expect(requestUrl).toBe("https://example.test/v1/responses");
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.headers).toMatchObject({
      Authorization: "Bearer sk-test",
    });
  });

  it("zgłasza odmowę i niekompletną odpowiedź", () => {
    expect(() =>
      extractResponseText({
        output: [{ content: [{ type: "refusal", refusal: "Nie mogę" }] }],
      }),
    ).toThrow(/Nie mogę/);
    expect(() =>
      extractResponseText({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      }),
    ).toThrow(/max_output_tokens/);
  });
});
