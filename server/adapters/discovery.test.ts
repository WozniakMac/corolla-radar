import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHtmlAdapter,
  extractCandidates,
  paginatedUrl,
} from "./discovery";

afterEach(() => vi.unstubAllGlobals());

describe("portal discovery", () => {
  it("extracts OLX detail URLs from anchors and embedded JSON", () => {
    const html = `<a href="https://www.olx.pl/d/oferta/corolla-ts-CID5-ID123.html">auto</a><script>"https:\\/\\/www.olx.pl\\/d\\/oferta\\/corolla-ts-CID5-ID124.html"</script>`;
    expect(extractCandidates(html, "https://www.olx.pl/", "olx")).toHaveLength(
      2,
    );
  });
  it("accepts only direct Toyota Corolla Pewne Auto offers", () => {
    const html = `<a href="/oferta/toyota-corolla/123">Corolla</a><a href="/oferta/toyota-yaris/999">Yaris</a>`;
    expect(
      extractCandidates(html, "https://pewneauto.pl/oferty", "pewneauto"),
    ).toEqual([
      {
        source: "pewneauto",
        url: "https://pewneauto.pl/oferta/toyota-corolla/123",
      },
    ]);
  });

  it("builds portal-specific pagination URLs", () => {
    expect(
      paginatedUrl("https://pewneauto.pl/oferty?brand=toyota", "pewneauto", 4),
    ).toContain("strona=4");
    expect(
      paginatedUrl("https://www.otomoto.pl/osobowe/toyota", "otomoto", 4),
    ).toContain("page=4");
  });

  it("stops dynamic pagination when a page has no new offers", async () => {
    const pages = [
      '<a href="/osobowe/oferta/corolla-one">1</a>',
      '<a href="/osobowe/oferta/corolla-two">2</a>',
      '<a href="/osobowe/oferta/corolla-two">2 again</a>',
    ];
    const fetchMock = vi.fn(async (url: string | URL) => {
      const html = pages[fetchMock.mock.calls.length - 1] || "";
      const response = new Response(html, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
      Object.defineProperty(response, "url", { value: String(url) });
      return response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createHtmlAdapter("otomoto", "OTOMOTO", [
      "https://www.otomoto.pl/osobowe/toyota/corolla",
    ]);
    const found = await adapter.discover();
    expect(found).toHaveLength(2);
    expect(adapter.pagesScanned).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain("page=2");
  });
});
