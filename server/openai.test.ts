import { describe, expect, it } from "vitest";
import {
  buildResponsesRequest,
  extractResponseText,
  openAiApiKeyConfigured,
  openAiBaseUrl,
  openAiModel,
  requireOpenAiApiKey,
  runOpenAiComputerStructured,
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

  it("buduje żądanie ze ścisłym schematem i obrazami", () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["answer"],
      properties: { answer: { type: "string" } },
    };
    const request = buildResponsesRequest(
      "Porównaj auta",
      schema,
      ["data:image/jpeg;base64,abc"],
      {
        OPENAI_MODEL: "gpt-test",
        OPENAI_REASONING_EFFORT: "medium",
      },
    );
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
      {
        type: "input_image",
        image_url: "data:image/jpeg;base64,abc",
        detail: "high",
      },
    ]);
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
      [],
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

  it("wykonuje pętlę Computer Use i odsyła zrzut headless Chrome", async () => {
    const requests: Array<Record<string, any>> = [];
    const actions: unknown[] = [];
    let closed = false;
    const result = await runOpenAiComputerStructured<{ confidence: number }>(
      "Obejrzyj ogłoszenie",
      "server/codex-output.schema.json",
      5_000,
      [],
      [
        {
          carId: "car-1",
          label: "Otomoto • car-1",
          url: "https://www.otomoto.pl/osobowe/oferta/car-1",
        },
      ],
      {
        OPENAI_API_KEY: "sk-test",
        OPENAI_MODEL: "gpt-test",
        OPENAI_BASE_URL: "https://example.test/v1",
      },
      async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)));
        if (requests.length === 1)
          return new Response(
            JSON.stringify({
              id: "resp-browser-1",
              status: "completed",
              output: [
                {
                  type: "computer_call",
                  call_id: "call-browser-1",
                  actions: [{ type: "screenshot" }],
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        return new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: '{"confidence":0.95}',
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
      async () => ({
        runActions: async (nextActions) => {
          actions.push(...nextActions);
        },
        screenshot: async () => Buffer.from("png"),
        missingListings: () => [],
        close: async () => {
          closed = true;
        },
      }),
    );

    expect(result).toEqual({ confidence: 0.95 });
    expect(actions).toEqual([{ type: "screenshot" }]);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      store: true,
      tools: [{ type: "computer" }],
    });
    expect(requests[1].previous_response_id).toBe("resp-browser-1");
    expect(requests[1].input.at(-1)).toMatchObject({
      type: "computer_call_output",
      call_id: "call-browser-1",
      output: {
        type: "computer_screenshot",
        detail: "original",
      },
    });
    expect(requests[1].input.at(-1).output.image_url).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(closed).toBe(true);
  });
});
