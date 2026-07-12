import type { fetchAndParse } from "./parser";

export const DECISION_FIELDS = new Set([
  "cena",
  "przebieg",
  "rocznik",
  "nadwozie",
  "Hybrid",
  "e-CVT",
  "kamera",
  "czujniki parkowania",
]);

export const isDecisionMissing = (missing: string[]) =>
  missing.some((field) => DECISION_FIELDS.has(field));

export function missingListingFields(
  p: Awaited<ReturnType<typeof fetchAndParse>>,
) {
  return [
    !p.price && "cena",
    !p.mileage && "przebieg",
    !p.year && "rocznik",
    !p.power && "moc",
    !p.eligibleBody && "nadwozie",
    !p.hybrid && "Hybrid",
    !p.ecvt && "e-CVT",
    !p.camera && "kamera",
    !p.parkingSensors && "czujniki parkowania",
    !p.vin && "VIN",
    !p.location && "lokalizacja",
    !p.trim && "wersja",
  ].filter(Boolean) as string[];
}
