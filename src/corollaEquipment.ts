import type { Car } from "./types";

export const TECH_COMPONENTS = [
  "parkingSensors",
  "heatedWiperArea",
  "rainSensor",
  "autoDimmingMirror",
  "foldingMirrors",
  "heatedSeats",
  "lumbarAdjustment",
  "heatedSteeringWheel",
  "keyless",
  "wirelessCharging",
  "ics",
] as const;

export type TechComponent = (typeof TECH_COMPONENTS)[number];

export const TRIM_VARIANTS = [
  "Active",
  "Comfort",
  "Comfort + Tech",
  "Comfort + Style",
  "Style",
  "GR Sport",
  "Executive",
  "Nieustalona",
] as const;

export type TrimVariant = (typeof TRIM_VARIANTS)[number];

export function trimVariant(car: Pick<Car, "trim" | "year">): TrimVariant {
  const trim = car.trim || "";
  if (/executive/i.test(trim)) return "Executive";
  if (/gr[ -]?sport/i.test(trim)) return "GR Sport";
  if (/comfort.{0,12}style|style.{0,12}comfort/i.test(trim))
    return "Comfort + Style";
  // Przed liftingiem Style występował jako pakiet do Comfort, a nie ta sama
  // samodzielna wersja, którą Toyota wprowadziła w gamie MY2023.
  if (/style/i.test(trim))
    return car.year <= 2022 ? "Comfort + Style" : "Style";
  if (/tech/i.test(trim)) return "Comfort + Tech";
  if (/comfort/i.test(trim)) return "Comfort";
  if (/active/i.test(trim)) return "Active";
  return "Nieustalona";
}

// Korekta wartości używanego auta względem najczęstszej wersji Comfort.
// To celowo tylko część różnicy ceny katalogowej: wyposażenie traci wartość,
// ale bogatszej wersji nie można porównywać cenowo jak gołego Comforta.
export function trimMarketPremium(car: Pick<Car, "trim" | "year">) {
  const postFacelift = car.year >= 2023;
  const premiums: Record<TrimVariant, number> = {
    Active: -2000,
    Comfort: 0,
    "Comfort + Tech": postFacelift ? 5000 : 4000,
    "Comfort + Style": postFacelift ? 8000 : 6000,
    Style: postFacelift ? 11000 : 6000,
    "GR Sport": postFacelift ? 16000 : 10000,
    Executive: postFacelift ? 20000 : 14000,
    Nieustalona: 0,
  };
  return premiums[trimVariant(car)];
}

export const equipmentLabel: Record<TechComponent, string> = {
  parkingSensors: "czujniki parkowania przód i tył",
  heatedWiperArea: "podgrzewana strefa wycieraczek przedniej szyby",
  rainSensor: "czujnik deszczu",
  autoDimmingMirror: "lusterko elektrochromatyczne",
  foldingMirrors: "elektrycznie składane lusterka",
  heatedSeats: "podgrzewane przednie fotele",
  lumbarAdjustment: "elektryczna regulacja lędźwiowa kierowcy",
  heatedSteeringWheel: "podgrzewana kierownica",
  keyless: "system bezkluczykowy",
  wirelessCharging: "bezprzewodowa ładowarka",
  ics: "ICS – wykrywanie przeszkód",
};

export const hasExplicitTechName = (car: Car) => car.tech;

function techNamedComponents(car: Car): TechComponent[] {
  // Oficjalny opis TS Kombi MY2022 potwierdzał krótszy Tech niż po liftingu:
  // m.in. lusterko elektrochromatyczne, czujniki i podgrzewane fotele.
  if (car.year <= 2022)
    return ["parkingSensors", "autoDimmingMirror", "heatedSeats"];
  return [...TECH_COMPONENTS];
}

// Po liftingu MY2023 katalog Toyoty potwierdza podstawowe elementy pakietu Tech
// jako standard w Style/Executive. W starszych autach nazwa "Style" bywa nazwą
// pakietu do Comfort, więc nie wolno na jej podstawie zakładać pełnego Tech.
export function catalogInferredComponents(car: Car): TechComponent[] {
  const variant = trimVariant(car);
  if (car.year < 2023) return [];
  if (["Style", "GR Sport", "Executive"].includes(variant))
    return [...TECH_COMPONENTS];
  return [];
}

export const hasCatalogBlindSpot = (car: Car) =>
  car.year >= 2023 && trimVariant(car) === "Executive";

export function confirmedTechComponents(car: Car): TechComponent[] {
  const inferred = new Set(catalogInferredComponents(car));
  const namedTech = new Set(car.tech ? techNamedComponents(car) : []);
  return TECH_COMPONENTS.filter(
    (key) => car[key] === true || inferred.has(key) || namedTech.has(key),
  );
}

export const hasTechEquivalent = (car: Car) =>
  car.tech || confirmedTechComponents(car).length >= 8;

export function equipmentSource(car: Car, key: TechComponent) {
  if (car[key] === true) return "potwierdzone w ogłoszeniu";
  if (car.tech && techNamedComponents(car).includes(key))
    return `wynika z pakietu Tech MY${car.year}`;
  if (catalogInferredComponents(car).includes(key))
    return `wynika z katalogu dla ${car.trim}, MY${car.year}`;
  return undefined;
}
