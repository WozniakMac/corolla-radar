import {
  buildMarketBenchmarks,
  effectivePrice,
  isEligible,
  scoreCar,
} from "../src/scoring";
import type { Car } from "../src/types";
import { matchesFilters } from "../src/filters";
import { load, save } from "./store";
import { loadSavedFilters } from "./preferences";

const normalizeIdentity = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function notificationKeys(car: Car) {
  const keys = new Set<string>([`id:${car.id}`]);
  if (car.vin) keys.add(`vin:${car.vin.toUpperCase()}`);
  for (const listing of car.listings) {
    try {
      const url = new URL(listing.url);
      keys.add(`url:${url.hostname}${url.pathname}`.toLowerCase());
    } catch {
      keys.add(`url:${listing.url.split("?")[0].toLowerCase()}`);
    }
  }
  if (car.seller && car.year && car.mileage) {
    keys.add(
      `fingerprint:${car.year}:${car.mileage}:${car.price}:${normalizeIdentity(car.seller)}`,
    );
  }
  return [...keys];
}

export async function notifyNewTopFive() {
  const store = await load();
  const savedFilters = await loadSavedFilters();
  const market = buildMarketBenchmarks(store.cars as Car[]);
  const top = (store.cars as Car[])
    .filter(isEligible)
    .filter((car) => !savedFilters || matchesFilters(car, savedFilters))
    .map((car) => ({ car, score: scoreCar(car, market).total }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const currentIds = top.map(({ car }) => car.id);
  const previousIds = store.top5Ids;
  store.top5Ids = currentIds;
  if (!store.notifiedCarKeys) {
    // Migracja istniejącej instalacji: wszystkie już znane auta stają się
    // bazą, więc aktualizacja aplikacji nie odtworzy starych powiadomień.
    store.notifiedCarKeys = [
      ...new Set((store.cars as Car[]).flatMap(notificationKeys)),
    ];
    await save(store);
    return;
  }
  await save(store);
  if (!previousIds?.length) {
    store.notifiedCarKeys.push(
      ...top.flatMap(({ car }) => notificationKeys(car)),
    );
    store.notifiedCarKeys = [...new Set(store.notifiedCarKeys)];
    await save(store);
    return;
  }
  const ntfyUrl = process.env.NTFY_URL;
  if (!ntfyUrl) return;
  for (const { car, score } of top) {
    const keys = notificationKeys(car);
    if (keys.some((key) => store.notifiedCarKeys!.includes(key))) continue;
    // Zapis przed wysłaniem daje semantykę at-most-once: nawet restart po
    // wysłaniu ntfy nie spowoduje ponownego powiadomienia o tym aucie.
    store.notifiedCarKeys.push(...keys);
    await save(store);
    const link = car.listings.find((listing) => listing.active)?.url;
    const message = `${car.year} • ${car.mileage.toLocaleString("pl-PL")} km • ${effectivePrice(car).toLocaleString("pl-PL")} zł • ${score}/100\n${car.title}`;
    const response = await fetch(ntfyUrl, {
      method: "POST",
      body: message,
      headers: {
        Title: savedFilters
          ? "Nowa Corolla w filtrowanym TOP 5"
          : "Nowa Corolla w TOP 5",
        Tags: "car,rotating_light",
        ...(link ? { Click: link } : {}),
      },
    });
    if (!response.ok) throw new Error(`ntfy HTTP ${response.status}`);
  }
}
