import { chromium, type Browser } from "playwright";
import { randomUUID } from "node:crypto";
import { getActiveScan } from "./pipeline";
import { load, save } from "./store";
import {
  buildMarketBenchmarks,
  qualifyCar,
  scoreCar,
  worthTrip,
} from "../src/scoring";

let browser: Browser | undefined;
let busy = false;

const formatDate = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}.${month}.${year}`;
  }
  return value.replaceAll("/", ".").replaceAll("-", ".");
};

const valueAfter = (text: string, label: string) =>
  text.match(new RegExp(`${label}:?\\s*([^\\n]+)`, "i"))?.[1]?.trim();

export function parseCepikTimeline(timelineText: string) {
  const numberAfter = (pattern: RegExp) => {
    const value = Number(timelineText.match(pattern)?.[1]);
    return Number.isFinite(value) ? value : undefined;
  };
  return {
    ownersTotal: numberAfter(
      /Właściciele \(od rejestracji do wygenerowania raportu\):\s*(\d+)/i,
    ),
    currentOwners: numberAfter(/Liczba aktualnych właścicieli:\s*(\d+)/i),
    coOwnersTotal: numberAfter(
      /Współwłaściciele \(od rejestracji do wygenerowania raportu\):\s*(\d+)/i,
    ),
  };
}

export async function checkCepik(car: any) {
  browser ||= await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: "pl-PL" });
  try {
    await page.goto(
      "https://moj.gov.pl/nforms/engine/ng/index?nfWidReset=true&xFormsAppName=HistoriaPojazdu&xFormsOrigin=EXTERNAL#/search",
      { waitUntil: "domcontentloaded", timeout: 45_000 },
    );
    await page.getByLabel("Numer rejestracyjny", { exact: true }).waitFor();
    await page
      .getByLabel("Numer rejestracyjny", { exact: true })
      .fill(car.registrationNumber);
    await page
      .getByLabel("Numer VIN, nadwozia, podwozia lub ramy", { exact: true })
      .fill(car.vin);
    await page
      .getByLabel("Data pierwszej rejestracji", { exact: true })
      .fill(formatDate(car.firstRegistrationDate));
    await page.getByRole("button", { name: "Sprawdź pojazd" }).click();
    await page
      .getByText("Dane zostały załadowane.", { exact: true })
      .waitFor({ state: "visible", timeout: 45_000 });
    const summary = await page.locator("main").innerText();
    await page.getByRole("tab", { name: "Oś czasu", exact: true }).click();
    const timelinePanel = page.getByRole("tabpanel", {
      name: "Oś czasu",
      exact: true,
    });
    await timelinePanel.waitFor({ state: "visible", timeout: 10_000 });
    await page
      .getByRole("heading", { name: "Podsumowanie zdarzeń", exact: true })
      .waitFor({ state: "visible", timeout: 10_000 });
    const timelineText = await page.locator("main").innerText();
    const owners = parseCepikTimeline(timelineText);
    const warning =
      !/Status rejestracji:\s*zarejestrowany/i.test(summary) ||
      !/Badanie techniczne:\s*aktualne/i.test(summary) ||
      !/Polisa OC:\s*aktualna/i.test(summary) ||
      /uszkodzenie|szkoda|kradzież|wyrejestrowanie/i.test(timelineText);
    return {
      status: warning ? "warning" : "ok",
      checkedAt: new Date().toISOString(),
      registrationStatus: valueAfter(summary, "Status rejestracji"),
      inspectionStatus: valueAfter(summary, "Badanie techniczne"),
      insuranceStatus: valueAfter(summary, "Polisa OC"),
      ...owners,
      timeline: timelineText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 120),
      rawSummary: summary.slice(0, 12_000),
    };
  } finally {
    await page.close();
  }
}

async function tick() {
  if (busy || getActiveScan()) return;
  busy = true;
  try {
    const db = await load();
    const cars = db.cars as any[];
    const market = buildMarketBenchmarks(cars);
    const topTenIds = new Set(
      cars
        .filter(
          (item) =>
            item.listings?.some((listing: any) => listing.active) &&
            qualifyCar(item).status === "qualified",
        )
        .map((item) => ({ item, score: scoreCar(item, market) }))
        .filter(({ item, score }) => worthTrip(item, score, market))
        .sort((left, right) => right.score.total - left.score.total)
        .slice(0, 10)
        .map(({ item }) => item.id),
    );
    const car: any = cars.find(
      (item) =>
        topTenIds.has(item.id) &&
        item.vin &&
        item.registrationNumber &&
        item.firstRegistrationDate &&
        item.listings?.some(
          (listing: any) =>
            listing.active && /pewne auto/i.test(listing.source),
        ) &&
        (!item.cepik || item.cepik.status === "pending"),
    );
    if (!car) return;
    car.cepik = { status: "processing" };
    await save(db);
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    let rawData: unknown;
    try {
      car.cepik = await checkCepik(car);
      rawData = car.cepik;
    } catch (error) {
      car.cepik = {
        status: "failed",
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Błąd CEPiK",
      };
      rawData = { error: car.cepik.error };
    }
    db.cepikRuns ||= [];
    db.cepikRuns.push({
      id: randomUUID(),
      carId: car.id,
      offerUrl: car.listings?.find((listing: any) =>
        /pewne auto/i.test(listing.source),
      )?.url,
      vin: car.vin,
      registrationNumber: car.registrationNumber,
      firstRegistrationDate: car.firstRegistrationDate,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      outcome:
        car.cepik.status === "ok"
          ? "success"
          : car.cepik.status === "warning"
            ? "warning"
            : "failed",
      error: car.cepik.error,
      rawData,
    });
    db.cepikRuns = db.cepikRuns.slice(-500);
    await save(db);
  } finally {
    busy = false;
  }
}

export function startCepikWorker() {
  if (process.env.ENABLE_CEPIK !== "true") return;
  setTimeout(() => void tick(), 15_000);
  setInterval(
    () => void tick(),
    Math.max(60, Number(process.env.CEPIK_INTERVAL_SECONDS || 300)) * 1000,
  );
}

export async function retryCepik(carId: string) {
  const db = await load();
  const car: any = (db.cars as any[]).find((item) => item.id === carId);
  if (!car) throw new Error("Nie znaleziono auta");
  car.cepik = { status: "pending" };
  await save(db);
}
