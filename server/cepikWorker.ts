import { chromium, type Browser } from "playwright";
import { getActiveScan } from "./pipeline";
import { load, save } from "./store";

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
    const ownersTotal = Number(
      timelineText.match(
        /Właściciele \(od rejestracji do wygenerowania raportu\):\s*(\d+)/i,
      )?.[1],
    );
    const currentOwners = Number(
      timelineText.match(/Liczba aktualnych właścicieli:\s*(\d+)/i)?.[1],
    );
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
      ownersTotal: Number.isFinite(ownersTotal) ? ownersTotal : undefined,
      currentOwners: Number.isFinite(currentOwners) ? currentOwners : undefined,
      coOwnersTotal: (() => {
        const value = Number(
          timelineText.match(
            /Współwłaściciele \(od rejestracji do wygenerowania raportu\):\s*(\d+)/i,
          )?.[1],
        );
        return Number.isFinite(value) ? value : undefined;
      })(),
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
    const car: any = (db.cars as any[]).find(
      (item) =>
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
    try {
      car.cepik = await checkCepik(car);
    } catch (error) {
      car.cepik = {
        status: "failed",
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Błąd CEPiK",
      };
    }
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
