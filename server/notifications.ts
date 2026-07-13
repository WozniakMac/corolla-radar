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
  await save(store);
  if (!previousIds?.length) return;
  const ntfyUrl = process.env.NTFY_URL;
  if (!ntfyUrl) return;
  for (const { car, score } of top.filter(
    ({ car }) => !previousIds.includes(car.id),
  )) {
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
