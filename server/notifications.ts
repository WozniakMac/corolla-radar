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

const normalizeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`.toLowerCase();
  } catch {
    return value.split("?")[0].toLowerCase();
  }
};

export function notificationKeys(car: Car) {
  const keys = new Set<string>([`id:${car.id}`]);
  if (car.vin) keys.add(`vin:${car.vin.toUpperCase()}`);
  for (const listing of car.listings) {
    keys.add(`url:${normalizeUrl(listing.url)}`);
  }
  if (car.seller && car.year && car.mileage) {
    keys.add(
      `fingerprint:${car.year}:${car.mileage}:${car.price}:${normalizeIdentity(car.seller)}`,
    );
  }
  return [...keys];
}

export type PriceDrop = {
  key: string;
  source: string;
  url: string;
  capturedAt: string;
  previousPrice: number;
  price: number;
};

export function priceDrops(car: Car): PriceDrop[] {
  const listingDrops = car.listings.flatMap((listing) => {
    const history = listing.priceHistory || [];
    return history.slice(1).flatMap((entry, index) => {
      const previous = history[index];
      const previousPrice = previous.cashPrice || previous.price;
      const price = entry.cashPrice || entry.price;
      if (price >= previousPrice) return [];
      return [
        {
          key: `drop:${normalizeUrl(listing.url)}:${entry.capturedAt}:${previousPrice}:${price}`,
          source: listing.source,
          url: listing.url,
          capturedAt: entry.capturedAt,
          previousPrice,
          price,
        },
      ];
    });
  });
  const aggregateDrops = (car.priceHistory || [])
    .slice(1)
    .flatMap((entry, index) => {
      const previous = car.priceHistory![index];
      if (entry.price >= previous.price) return [];
      if (
        listingDrops.some(
          (drop) =>
            drop.capturedAt === entry.capturedAt && drop.price === entry.price,
        )
      )
        return [];
      return [
        {
          key: `drop:car:${notificationKeys(car)[0]}:${entry.capturedAt}:${previous.price}:${entry.price}`,
          source: entry.source,
          url: entry.url,
          capturedAt: entry.capturedAt,
          previousPrice: previous.price,
          price: entry.price,
        },
      ];
    });
  return [...listingDrops, ...aggregateDrops].sort((a, b) =>
    a.capturedAt.localeCompare(b.capturedAt),
  );
}

export function pendingPriceDrops(car: Car, notifiedKeys: string[]) {
  return priceDrops(car).filter((drop) => !notifiedKeys.includes(drop.key));
}

async function sendNotification(
  ntfyUrl: string,
  title: string,
  message: string,
  link: string | undefined,
  tags: string,
) {
  const response = await fetch(ntfyUrl, {
    method: "POST",
    body: message,
    headers: {
      Title: title,
      Tags: tags,
      ...(link ? { Click: link } : {}),
    },
  });
  if (!response.ok) throw new Error(`ntfy HTTP ${response.status}`);
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
  store.notifiedPriceDropKeys ||= [];
  await save(store);
  if (previousIds === undefined) {
    store.notifiedCarKeys.push(
      ...top.flatMap(({ car }) => notificationKeys(car)),
    );
    store.notifiedCarKeys = [...new Set(store.notifiedCarKeys)];
    store.notifiedPriceDropKeys = [
      ...new Set([
        ...store.notifiedPriceDropKeys,
        ...(store.cars as Car[]).flatMap((car) =>
          priceDrops(car).map((drop) => drop.key),
        ),
      ]),
    ];
    await save(store);
    return;
  }
  const ntfyUrl = process.env.NTFY_URL;
  if (!ntfyUrl) return;
  const notificationErrors: Error[] = [];
  for (const { car, score } of top) {
    const keys = notificationKeys(car);
    const drops = pendingPriceDrops(car, store.notifiedPriceDropKeys!);
    if (drops.length) {
      // Obniżka jest osobnym zdarzeniem od pierwszego znalezienia auta.
      // Zapisujemy ją przed wysłaniem, zachowując semantykę at-most-once.
      store.notifiedPriceDropKeys.push(...drops.map((drop) => drop.key));
      store.notifiedCarKeys.push(...keys);
      store.notifiedCarKeys = [...new Set(store.notifiedCarKeys)];
      await save(store);
      const latest = drops.at(-1)!;
      const totalDrop = latest.previousPrice - latest.price;
      const changes = drops
        .map(
          (drop) =>
            `${drop.source}: ${drop.previousPrice.toLocaleString("pl-PL")} → ${drop.price.toLocaleString("pl-PL")} zł (−${(drop.previousPrice - drop.price).toLocaleString("pl-PL")} zł)`,
        )
        .join("\n");
      try {
        await sendNotification(
          ntfyUrl,
          `Obniżka ceny w TOP 5: −${totalDrop.toLocaleString("pl-PL")} zł`,
          `${car.year} • ${car.mileage.toLocaleString("pl-PL")} km • ${score}/100\n${car.title}\n${changes}`,
          latest.url,
          "car,money_with_wings",
        );
      } catch (error) {
        notificationErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
      continue;
    }
    if (keys.some((key) => store.notifiedCarKeys!.includes(key))) continue;
    // Zapis przed wysłaniem daje semantykę at-most-once: nawet restart po
    // wysłaniu ntfy nie spowoduje ponownego powiadomienia o tym aucie.
    store.notifiedCarKeys.push(...keys);
    await save(store);
    const link = car.listings.find((listing) => listing.active)?.url;
    const message = `${car.year} • ${car.mileage.toLocaleString("pl-PL")} km • ${effectivePrice(car).toLocaleString("pl-PL")} zł • ${score}/100\n${car.title}`;
    try {
      await sendNotification(
        ntfyUrl,
        savedFilters
          ? "Nowa Corolla w filtrowanym TOP 5"
          : "Nowa Corolla w TOP 5",
        message,
        link,
        "car,rotating_light",
      );
    } catch (error) {
      notificationErrors.push(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
  if (notificationErrors.length) throw notificationErrors[0];
}
