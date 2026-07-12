import type { Car, ScoreBreakdown } from "./types";
import {
  confirmedTechComponents,
  equipmentLabel,
  equipmentSource,
  hasCatalogBlindSpot,
  hasTechEquivalent,
  trimMarketPremium,
  trimVariant,
  type TechComponent,
} from "./corollaEquipment";

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

export type MarketBenchmarks = Record<string, number>;

const engineGroup = (car: Car) =>
  /(?:^|\D)2[.,]0(?:\D|$)/.test(`${car.title} ${car.description || ""}`) ||
  [178, 180, 184, 196].includes(car.power)
    ? "2.0"
    : "1.8";
const nonStandardSale = (car: Car) =>
  /auto uszkodzone|pojazd uszkodzony|sprzedam uszkodzon|uszkodzon.{0,40}(?:przód|tył|bok)|przejęcie leasingu|odstępne/i.test(
    `${car.title} ${car.description || ""} ${car.notes.join(" ")}`,
  );
const mileageFactor = (mileage: number) =>
  clamp(1 - ((mileage - 70000) / 10000) * 0.035, 0.68, 1.12);

export function buildMarketBenchmarks(cars: Car[]): MarketBenchmarks {
  const groups = new Map<string, number[]>();
  const standardGroups = new Map<string, number[]>();
  for (const car of cars) {
    const price = effectivePrice(car);
    if (
      !active(car) ||
      price < 50000 ||
      price > 180000 ||
      car.mileage <= 0 ||
      car.mileage > 220000 ||
      !hybridConfirmed(car) ||
      nonStandardSale(car)
    )
      continue;
    const key = `${car.year}:${engineGroup(car)}`;
    const values = groups.get(key) || [];
    const normalized = price / mileageFactor(car.mileage);
    values.push(normalized);
    groups.set(key, values);
    if (["Active", "Comfort", "Nieustalona"].includes(trimVariant(car))) {
      const standard = standardGroups.get(key) || [];
      standard.push(normalized);
      standardGroups.set(key, standard);
    }
  }
  return Object.fromEntries(
    [...groups.entries()]
      .filter(([, values]) => values.length >= 5)
      .map(([key, allValues]) => {
        const values =
          (standardGroups.get(key)?.length || 0) >= 5
            ? standardGroups.get(key)!
            : allValues;
        values.sort((a, b) => a - b);
        const trim = Math.floor(values.length * 0.1);
        const robust = values.slice(trim, values.length - trim || undefined);
        return [key, robust[Math.floor(robust.length / 2)]];
      }),
  );
}

export type Qualification = {
  status: "qualified" | "verification" | "rejected";
  reasons: string[];
};

const active = (car: Car) => car.listings.some((listing) => listing.active);
const hybridConfirmed = (car: Car) =>
  car.hybrid === true ||
  /hybryd|hybrid/i.test(car.title) ||
  [122, 140, 180, 184, 196].includes(car.power);

export function qualifyCar(car: Car): Qualification {
  if (
    car.body !== "Touring Sports" ||
    !car.price ||
    car.price < 50000 ||
    car.price > 180000 ||
    !car.year ||
    !car.mileage ||
    !active(car)
  )
    return { status: "rejected", reasons: ["niepełne dane podstawowe"] };
  const saleText = `${car.title} ${car.description || ""} ${car.notes.join(" ")}`;
  if (nonStandardSale(car))
    return {
      status: "rejected",
      reasons: [
        /przejęcie leasingu|odstępne/i.test(saleText)
          ? "odstępne/przejęcie leasingu zamiast ceny auta"
          : "samochód sprzedawany jako uszkodzony",
      ],
    };
  const reasons = [
    !hybridConfirmed(car) && "napęd Hybrid",
    !car.ecvt && "automat/e-CVT",
    !car.camera && "kamera cofania",
    !car.parkingSensors && "czujniki parkowania",
  ].filter(Boolean) as string[];
  return reasons.length
    ? { status: "verification", reasons }
    : { status: "qualified", reasons: [] };
}

export const isEligible = (car: Car) => qualifyCar(car).status === "qualified";

export function effectivePrice(car: Car) {
  if (car.cashPrice) return car.cashPrice;
  const text = `${car.description || ""} ${car.notes.join(" ")}`;
  const surcharge = text.match(
    /(?:zakup(?:u)? (?:z własnych środków|gotówkowego)|gotówk)[^.!]{0,140}(?:doliczon|wyższ)[^0-9]{0,30}(\d[\d .]{2,})\s*zł/i,
  )?.[1];
  return car.price + (surcharge ? Number(surcharge.replace(/\D/g, "")) : 0);
}

export { hasTechEquivalent } from "./corollaEquipment";

function expectedValue(car: Car, market?: MarketBenchmarks) {
  const baseByYear: Record<number, number> = {
    2019: 68000,
    2020: 74000,
    2021: 80000,
    2022: 88500,
    2023: 101500,
    2024: 104000,
    2025: 116000,
    2026: 125000,
  };
  const marketBase = market?.[`${car.year}:${engineGroup(car)}`];
  let base =
    marketBase ??
    baseByYear[car.year] ??
    Math.max(55000, 80000 + (car.year - 2021) * 8000);
  if (!marketBase && car.power >= 180) base += 8000;
  // Benchmark bazuje, gdy to możliwe, na najczęstszej wersji Comfort.
  // Bogatsze odmiany nie są "przepłacone" tylko dlatego, że kosztują więcej.
  base += trimMarketPremium(car);
  return base * mileageFactor(car.mileage);
}

function dealMetrics(car: Car, market?: MarketBenchmarks) {
  const expectedPrice = expectedValue(car, market);
  const price = effectivePrice(car);
  const ratio = price / expectedPrice;
  const pricePoints =
    ratio < 0.72
      ? clamp((ratio / 0.72) * 15, 0, 15)
      : ratio < 0.85
        ? 15 + ((ratio - 0.72) / 0.13) * 20
        : ratio <= 0.95
          ? 35
          : ratio <= 1
            ? 35 - ((ratio - 0.95) / 0.05) * 6
            : clamp(29 - ((ratio - 1) / 0.15) * 29, 0, 29);
  const mileage =
    car.mileage <= 50000
      ? 10
      : car.mileage <= 70000
        ? 8
        : car.mileage <= 90000
          ? 6
          : car.mileage <= 100000
            ? 4
            : car.mileage <= 130000
              ? 2
              : 0;
  const year =
    car.year >= 2022 && car.year <= 2024
      ? 5
      : car.year === 2021
        ? 4
        : car.year === 2025
          ? 3
          : car.year >= 2019
            ? 2
            : 0;
  const budgetPenalty = price > 130000 ? 6 : price > 120000 ? 3 : 0;
  const targetYearPenalty = car.year >= 2025 ? 3 : 0;
  return {
    deal: Math.round(
      clamp(
        pricePoints + mileage + year - budgetPenalty - targetYearPenalty,
        0,
        50,
      ),
    ),
    pricePoints,
    mileagePoints: mileage,
    yearPoints: year,
    expectedPrice,
    price,
    ratio,
    budgetPenalty,
    targetYearPenalty,
  };
}

const dealerToyota = (car: Car) =>
  /toyota/i.test(car.seller) ||
  car.listings.some((listing) => /toyota/i.test(listing.source));

export function scoreCar(car: Car, market?: MarketBenchmarks): ScoreBreakdown {
  const { deal } = dealMetrics(car, market);
  const dealer = dealerToyota(car);
  const batteryProtected =
    car.hybridHealthCheck === true ||
    (car.year >= 2022 && car.mileage <= 100000);
  const history =
    (car.aso ? 5 : 0) +
    (car.polishSalon ? 3 : 0) +
    (car.oneOwner ? 2 : 0) +
    (car.vin ? 2 : 0) +
    (car.noStructuralDamage ? 2 : 0) +
    (dealer ? 2 : 0) +
    (batteryProtected ? 2 : 0) +
    (car.toyotaWarranty ? 2 : 0);
  const techComponents = confirmedTechComponents(car);
  const hasBlindSpot =
    hasCatalogBlindSpot(car) ||
    /martwe.{0,15}pole|blind spot/i.test(car.description || "");
  const equipment = Math.min(
    10,
    techComponents.filter((key) => key !== "parkingSensors" && key !== "ics")
      .length + (hasBlindSpot ? 1 : 0),
  );
  const location =
    car.distance <= 50
      ? 10
      : car.distance <= 150
        ? 8
        : car.distance <= 300
          ? 5
          : car.distance <= 500
            ? 2
            : 0;
  const hasCashSurcharge = effectivePrice(car) > car.price;
  const financingOnlyPrice =
    /cena.{0,80}(?:dotyczy|obowiązuje).{0,60}finansowa|cena podana.{0,100}finansowa|zakup gotówkowy.{0,50}(?:szczegóły|ustalenia)/i.test(
      car.description || "",
    );
  const terms =
    (car.vat23 ? 3 : 0) +
    (dealer ? 2 : 0) +
    (car.listings.some((listing) => /pewne auto/i.test(listing.source))
      ? 2
      : 0) +
    (!hasCashSurcharge && !financingOnlyPrice ? 2 : 0) +
    (car.description ? 1 : 0);
  const confidence = Math.round(
    clamp(
      25 +
        (car.vin ? 15 : 0) +
        (car.aso ? 10 : 0) +
        (dealer ? 10 : 0) +
        (car.listings.length > 1 ? 5 : 0) +
        (car.camera ? 10 : 0) +
        (car.parkingSensors ? 10 : 0) +
        (car.polishSalon ? 5 : 0) +
        (car.distance !== 999 ? 5 : 0) +
        (car.description ? 5 : 0),
    ),
  );
  return {
    deal,
    history,
    equipment,
    location,
    terms,
    total: Math.min(100, deal + history + equipment + location + terms),
    confidence,
  };
}

export type ScoreExplanation = {
  key: "deal" | "history" | "equipment" | "location" | "terms";
  label: string;
  points: number;
  max: number;
  detail: string;
  deductions: string[];
};

export function explainScore(
  car: Car,
  market?: MarketBenchmarks,
): ScoreExplanation[] {
  const score = scoreCar(car, market);
  const metrics = dealMetrics(car, market);
  const { expectedPrice, price, ratio } = metrics;
  const dealer = dealerToyota(car);
  const description = car.description || "";
  const hasBlindSpot =
    hasCatalogBlindSpot(car) ||
    /martwe.{0,15}pole|blind spot/i.test(description);
  const hasKeyless = /keyless|bezkluczyk/i.test(description);
  const components = confirmedTechComponents(car);
  const scoredComponents = components.filter(
    (key) => key !== "parkingSensors" && key !== "ics",
  );
  const missingComponents = (
    [
      "heatedSeats",
      "heatedWiperArea",
      "heatedSteeringWheel",
      "keyless",
      "wirelessCharging",
      "foldingMirrors",
      "rainSensor",
      "autoDimmingMirror",
      "lumbarAdjustment",
    ] as TechComponent[]
  ).filter((key) => !components.includes(key));
  const pewneAuto = car.listings.some((listing) =>
    /pewne auto/i.test(listing.source),
  );
  const batteryProtected =
    car.hybridHealthCheck === true ||
    (car.year >= 2022 && car.mileage <= 100000);
  const financingOnlyPrice =
    /cena.{0,80}(?:dotyczy|obowiązuje).{0,60}finansowa|cena podana.{0,100}finansowa|zakup gotówkowy.{0,50}(?:szczegóły|ustalenia)/i.test(
      car.description || "",
    );
  return [
    {
      key: "deal",
      label: "Opłacalność",
      points: score.deal,
      max: 50,
      detail: `Cena efektywna ${Math.round(price).toLocaleString("pl-PL")} zł, oczekiwana ok. ${Math.round(expectedPrice).toLocaleString("pl-PL")} zł (${Math.round((ratio - 1) * 100)}% względem modelu); ${car.mileage.toLocaleString("pl-PL")} km, rocznik ${car.year}.`,
      deductions: [
        metrics.pricePoints < 35 &&
          (metrics.ratio <= 1
            ? `Cena uczciwa, ale bez pełnej premii za okazję: −${Math.round(35 - metrics.pricePoints)} pkt`
            : `Cena powyżej modelu rynkowego: −${Math.round(35 - metrics.pricePoints)} pkt`),
        metrics.mileagePoints < 10 &&
          `Przebieg ${car.mileage.toLocaleString("pl-PL")} km: −${10 - metrics.mileagePoints} pkt`,
        metrics.yearPoints < 5 &&
          `Rocznik ${car.year}: −${5 - metrics.yearPoints} pkt`,
        metrics.budgetPenalty > 0 &&
          `Cena powyżej preferowanego budżetu: −${metrics.budgetPenalty} pkt`,
        metrics.targetYearPenalty > 0 &&
          `Rocznik poza głównym zakresem 2021–2024: −${metrics.targetYearPenalty} pkt`,
      ].filter(Boolean) as string[],
    },
    {
      key: "history",
      label: "Historia i stan",
      points: score.history,
      max: 20,
      detail:
        [
          car.aso && "ASO",
          car.polishSalon && "salon Polska",
          car.oneOwner && "1 właściciel",
          car.vin && "VIN",
          car.noStructuralDamage && "deklaracja bezwypadkowości",
          car.hybridHealthCheck
            ? "Hybrid Health Check/test baterii"
            : batteryProtected &&
              "młode auto w podstawowym okresie ochrony hybrydy",
          car.toyotaWarranty && "ochrona Toyota",
        ]
          .filter(Boolean)
          .join(" • ") || "Brak mocnych dowodów historii.",
      deductions: [
        !car.aso && "Brak potwierdzonego serwisowania lub historii ASO: −5 pkt",
        !car.polishSalon && "Brak potwierdzenia salonu Polska: −3 pkt",
        !car.oneOwner && "Brak potwierdzenia jednego właściciela: −2 pkt",
        !car.vin && "Brak VIN-u: −2 pkt",
        !car.noStructuralDamage &&
          "Brak deklaracji braku szkód konstrukcyjnych: −2 pkt",
        !dealer && "Sprzedawca poza siecią Toyota: −2 pkt",
        !batteryProtected &&
          "Brak potwierdzonego Hybrid Health Check/testu baterii: −2 pkt",
        !car.toyotaWarranty &&
          "Brak potwierdzonej gwarancji Pewne Auto/Relax/Battery Care: −2 pkt",
      ].filter(Boolean) as string[],
    },
    {
      key: "equipment",
      label: "Wyposażenie dodatkowe",
      points: score.equipment,
      max: 10,
      detail:
        [
          ...scoredComponents.map(
            (key) => `${equipmentLabel[key]} +1 (${equipmentSource(car, key)})`,
          ),
          hasBlindSpot && "monitorowanie martwego pola +1",
        ]
          .filter(Boolean)
          .join(" • ") || "Brak dodatkowych premii wyposażenia.",
      deductions: [
        ...missingComponents.map(
          (key) =>
            `Brak potwierdzenia: ${equipmentLabel[key]} (−1 pkt potencjału wyposażenia)`,
        ),
        !hasBlindSpot &&
          "Brak potwierdzonego monitorowania martwego pola: −1 pkt",
      ].filter(Boolean) as string[],
    },
    {
      key: "location",
      label: "Lokalizacja",
      points: score.location,
      max: 10,
      detail:
        car.distance === 999
          ? "Odległość nieustalona."
          : `${car.location}, około ${car.distance} km od Poznania.`,
      deductions:
        score.location < 10
          ? [
              car.distance === 999
                ? "Nieustalona odległość: −10 pkt"
                : `Odległość ${car.distance} km od Poznania: −${10 - score.location} pkt`,
            ]
          : [],
    },
    {
      key: "terms",
      label: "Warunki sprzedaży",
      points: score.terms,
      max: 10,
      detail: `${car.vat23 ? "FV 23%" : "bez FV 23%"} • ${dealerToyota(car) ? "dealer Toyota" : "inny sprzedawca"} • ${effectivePrice(car) > car.price ? "dopłata przy zakupie bez finansowania" : financingOnlyPrice ? "cena gotówkowa niepodana" : "brak wykrytej dopłaty gotówkowej"}`,
      deductions: [
        !car.vat23 && "Brak FV 23%: −3 pkt",
        !dealer && "Sprzedawca poza siecią Toyota: −2 pkt",
        !pewneAuto && "Brak gwarancji/programu Toyota Pewne Auto: −2 pkt",
        effectivePrice(car) > car.price &&
          "Dopłata za zakup bez finansowania: −2 pkt",
        financingOnlyPrice &&
          effectivePrice(car) === car.price &&
          "Cena dotyczy finansowania; brak ceny gotówkowej: −2 pkt",
        !car.description && "Brak kompletnego opisu oferty: −1 pkt",
      ].filter(Boolean) as string[],
    },
  ];
}

export function worthTrip(
  car: Car,
  score: ScoreBreakdown,
  market?: MarketBenchmarks,
) {
  const { ratio } = dealMetrics(car, market);
  return (
    car.distance === 999 ||
    car.distance <= 300 ||
    ratio <= 0.95 ||
    score.total >= 85 ||
    (car.tech && car.aso && car.polishSalon && car.oneOwner && car.vat23)
  );
}
