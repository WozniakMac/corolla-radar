import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type PlaceRow = [
  name: string,
  lat: number,
  lon: number,
  population: number,
  ascii: string,
];
type Place = { name: string; lat: number; lon: number; population: number };

const rows = JSON.parse(
  readFileSync(resolve("server/data/geonames-pl.json"), "utf8"),
) as PlaceRow[];

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("pl")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const byName = new Map<string, Place[]>();
let maxWords = 1;
for (const [name, lat, lon, population, ascii] of rows) {
  const place = { name, lat, lon, population };
  for (const variant of new Set(
    [normalize(name), normalize(ascii)].filter(Boolean),
  )) {
    maxWords = Math.max(maxWords, variant.split(" ").length);
    const list = byName.get(variant) || [];
    list.push(place);
    list.sort((a, b) => b.population - a.population);
    byName.set(variant, list);
  }
}

function candidates(text: string, broad: boolean) {
  const normalized = normalize(text);
  const words = normalized.split(" ").filter(Boolean);
  const found: Array<{ place: Place; score: number }> = [];
  for (let start = 0; start < words.length; start++) {
    for (
      let length = 1;
      length <= maxWords && start + length <= words.length;
      length++
    ) {
      const phrase = words.slice(start, start + length).join(" ");
      if (length === 1 && phrase.length < 4) continue;
      const matches = byName.get(phrase);
      if (!matches) continue;
      const place = matches[0];
      const before = words.slice(Math.max(0, start - 12), start).join(" ");
      const context =
        /lokalizac|sprzedaw|dealer|salon|adres|mapie|zapraszam|miasto/.test(
          before,
        );
      if (broad && length === 1 && !context && place.population < 5000)
        continue;
      found.push({
        place,
        score:
          length * 1000 +
          (context ? 800 : 0) +
          Math.log10(place.population + 10) * 20 +
          (start / Math.max(words.length, 1)) * 100 +
          phrase.length,
      });
    }
  }
  return found.sort((a, b) => b.score - a.score)[0]?.place;
}

export function resolvePolishCity(
  structuredLocation?: string,
  title?: string,
  body?: string,
) {
  return (
    (structuredLocation && candidates(structuredLocation, false)) ||
    (title && candidates(title, false)) ||
    (body && candidates(body, true)) ||
    undefined
  );
}

const poznan = byName.get(normalize("Poznań"))?.[0] ?? {
  name: "Poznań",
  lat: 52.406,
  lon: 16.925,
  population: 0,
};

export function distanceFromPoznan(location?: string) {
  if (!location) return 999;
  const target = candidates(location, false);
  if (!target) return 999;
  const rad = Math.PI / 180;
  const a =
    Math.sin(((target.lat - poznan.lat) * rad) / 2) ** 2 +
    Math.cos(poznan.lat * rad) *
      Math.cos(target.lat * rad) *
      Math.sin(((target.lon - poznan.lon) * rad) / 2) ** 2;
  return Math.round(
    6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.18,
  );
}

export const polishPlacesCount = rows.length;
