import { load } from "cheerio";
import type { Candidate, SourceAdapter, SourceId } from "./types";

const allowedPaths: Record<SourceId, RegExp> = {
  pewneauto: /^\/oferta\/toyota-corolla\/\d+\/?$/,
  otomoto: /^\/osobowe\/oferta\//,
  olx: /^\/d\/oferta\//,
};

export function extractCandidates(html: string, baseUrl: string, id: SourceId) {
  const candidates = new Map<string, Candidate>();
  const add = (href: string) => {
    try {
      const url = new URL(href.replaceAll("\\/", "/"), baseUrl);
      if (!allowedPaths[id].test(url.pathname)) return;
      url.search = "";
      url.hash = "";
      const normalized = url.origin + url.pathname.replace(/\/$/, "");
      candidates.set(normalized, { source: id, url: normalized });
    } catch {
      /* malformed URL */
    }
  };
  const $ = load(html);
  $("a[href]").each((_, element) => add($(element).attr("href")!));
  if (id === "olx") {
    for (const match of html.matchAll(
      /https:\/\/(?:www\.)?olx\.pl\/d\/oferta\/[^"<\s]+?\.html/gi,
    ))
      add(match[0]);
    for (const match of html.matchAll(
      /https:\\?\/\\?\/(?:www\.)?olx\.pl\\?\/d\\?\/oferta\\?\/[^"<]+?\.html/gi,
    ))
      add(match[0]);
  }
  return [...candidates.values()];
}

export function createHtmlAdapter(
  id: SourceId,
  name: string,
  searchUrls: string[],
): SourceAdapter {
  return {
    id,
    name,
    searchUrls,
    pagesScanned: 0,
    discoveryComplete: false,
    async discover() {
      const candidates = new Map<string, Candidate>();
      const maxPages = Math.max(1, Number(process.env.SCAN_MAX_PAGES || 20));
      const discoveryLimit = Math.max(
        1,
        Number(process.env.SCAN_DISCOVERY_LIMIT || 500),
      );
      const baseUrl = searchUrls[0];
      this.pagesScanned = 0;
      this.discoveryComplete = false;
      for (let page = 1; page <= maxPages; page++) {
        const searchUrl = paginatedUrl(baseUrl, id, page);
        const response = await fetch(searchUrl, {
          redirect: "follow",
          headers: {
            "user-agent":
              "Mozilla/5.0 CorollaRadar/1.0 (private purchase assistant)",
            "accept-language": "pl-PL,pl;q=.9",
          },
          signal: AbortSignal.timeout(20_000),
        });
        if (page > 1 && response.status === 404) {
          this.discoveryComplete = true;
          break;
        }
        if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
        this.pagesScanned++;
        const pageCandidates = extractCandidates(
          await response.text(),
          response.url,
          id,
        );
        let newOnPage = 0;
        for (const candidate of pageCandidates) {
          if (!candidates.has(candidate.url)) newOnPage++;
          candidates.set(candidate.url, candidate);
        }
        if (pageCandidates.length === 0 || newOnPage === 0) {
          this.discoveryComplete = true;
          break;
        }
        if (candidates.size >= discoveryLimit) break;
      }
      return [...candidates.values()].slice(0, discoveryLimit);
    },
  };
}

export function paginatedUrl(baseUrl: string, id: SourceId, page: number) {
  const url = new URL(baseUrl);
  const parameter = id === "pewneauto" ? "strona" : "page";
  if (page <= 1) url.searchParams.delete(parameter);
  else url.searchParams.set(parameter, String(page));
  return url.toString();
}
