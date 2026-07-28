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

const DECISION_REASONS: Record<string, string> = {
  cena: "Nie udało się wiarygodnie odczytać ceny samochodu.",
  przebieg: "Nie udało się wiarygodnie odczytać przebiegu.",
  rocznik: "Nie udało się potwierdzić rocznika.",
  nadwozie: "Nie udało się potwierdzić, że to Corolla Touring Sports / kombi.",
  Hybrid: "Nie udało się potwierdzić napędu hybrydowego.",
  "e-CVT": "Nie udało się potwierdzić automatycznej skrzyni e-CVT.",
  kamera: "Nie udało się potwierdzić kamery cofania wymaganej do rankingu.",
  "czujniki parkowania":
    "Nie udało się potwierdzić czujników parkowania wymaganych do rankingu.",
};

export function codexVerificationReasons(
  missing: string[],
  input: Record<string, unknown> = {},
) {
  return missing
    .filter((field) => DECISION_FIELDS.has(field))
    .map((field) => {
      if (field === "kamera" && input.cameraMentionRejectedAsMarketing)
        return "Strona wspomina o kamerze tylko w ogólnym tekście marketingowym; brak dowodu, że ma ją ten egzemplarz.";
      if (
        field === "czujniki parkowania" &&
        input.sensorsMentionRejectedAsMarketing
      )
        return "Strona wspomina o czujnikach tylko w ogólnym tekście marketingowym; brak dowodu, że ma je ten egzemplarz.";
      return DECISION_REASONS[field];
    })
    .filter(Boolean);
}

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
