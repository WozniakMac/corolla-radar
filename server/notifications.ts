import { buildMarketBenchmarks, isEligible, scoreCar } from "../src/scoring";
import type { Car, ScoreBreakdown, ScoreHistoryEntry } from "../src/types";
import { matchesFilters } from "../src/filters";
import { load, save, type TopTenSnapshotEntry } from "./store";
import { loadSavedFilters } from "./preferences";
import {
  captureAllScoreHistories,
  type ScoreCaptureContext,
} from "./scoreHistory";

const DEFAULT_APP_PUBLIC_URL = "http://192.168.2.47:4174";
const scoreKeys = [
  "deal",
  "history",
  "equipment",
  "location",
  "terms",
] as const;

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

type RankedCar = {
  car: Car;
  score: ScoreBreakdown;
  scoreChange?: ScoreHistoryEntry;
};

function breakdownChanged(
  previous: ScoreBreakdown | undefined,
  current: ScoreBreakdown | undefined,
) {
  if (!previous || !current) return false;
  return scoreKeys.some((key) => previous[key] !== current[key]);
}

export function hasTopTenChanged(
  previous: TopTenSnapshotEntry[],
  current: TopTenSnapshotEntry[],
) {
  return (
    previous.length !== current.length ||
    current.some(
      (entry, index) =>
        previous[index]?.id !== entry.id ||
        previous[index]?.score !== entry.score ||
        breakdownChanged(previous[index]?.breakdown, entry.breakdown),
    )
  );
}

export function positionChangeLabel(
  previousIds: string[],
  id: string,
  index: number,
) {
  const previousIndex = previousIds.indexOf(id);
  if (previousIndex === -1) return "NOWE";
  const movement = previousIndex - index;
  if (movement > 0) return `↑${movement}`;
  if (movement < 0) return `↓${Math.abs(movement)}`;
  return "→";
}

const signedPoints = (value: number) => `${value > 0 ? "+" : ""}${value}`;

export function scoreChangeMessage(change: ScoreHistoryEntry | undefined) {
  if (!change || change.previousTotal === undefined) return "";
  const totalDelta = change.score.total - change.previousTotal;
  return totalDelta === 0 ? "Δ skł." : signedPoints(totalDelta);
}

export function localCarUrl(
  carId: string,
  appPublicUrl = process.env.APP_PUBLIC_URL || DEFAULT_APP_PUBLIC_URL,
) {
  return `${appPublicUrl.replace(/\/+$/, "")}/cars/${encodeURIComponent(carId)}`;
}

export function topTenMessage(
  top: RankedCar[],
  previousIds: string[],
  appPublicUrl?: string,
) {
  if (!top.length) return "Brak aut spełniających warunki TOP 10.";
  return top
    .map(({ car, score, scoreChange }, index) => {
      const scoreChangeLabel = scoreChangeMessage(scoreChange);
      return [
        `${index + 1} ${positionChangeLabel(previousIds, car.id, index)} ${score.total}p${scoreChangeLabel ? ` ${scoreChangeLabel}` : ""}`,
        localCarUrl(car.id, appPublicUrl),
      ].join("\n");
    })
    .join("\n\n");
}

export async function notifyNewTopTen(context: ScoreCaptureContext = {}) {
  const store = await load();
  const savedFilters = await loadSavedFilters();
  const cars = store.cars as Car[];
  const market = buildMarketBenchmarks(cars);
  const scoreChanges = captureAllScoreHistories(cars, market, context);
  const top = cars
    .filter(isEligible)
    .filter((car) => !savedFilters || matchesFilters(car, savedFilters))
    .map((car) => ({
      car,
      score: scoreCar(car, market, savedFilters || undefined),
      scoreChange: scoreChanges.get(car.id),
    }))
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, 10);
  const currentIds = top.map(({ car }) => car.id);
  const currentSnapshot = top.map(({ car, score }) => ({
    id: car.id,
    score: score.total,
    breakdown: score,
  }));
  const previousSnapshot = store.top10Snapshot || store.top5Snapshot;
  const previousIds =
    previousSnapshot?.map(({ id }) => id) ||
    store.top10Ids ||
    store.top5Ids ||
    [];
  const changed = previousSnapshot
    ? hasTopTenChanged(previousSnapshot, currentSnapshot)
    : store.top10Ids !== undefined &&
      (store.top10Ids.length !== currentIds.length ||
        currentIds.some((id, index) => store.top10Ids![index] !== id));

  store.top10Ids = currentIds;
  store.top10Snapshot = currentSnapshot;
  delete store.top5Ids;
  delete store.top5Snapshot;
  await save(store);

  // Pierwszy skan ustala punkt odniesienia. Kolejne wysyłają jeden zbiorczy
  // alert, jeśli zmienił się skład, kolejność albo punktacja TOP 10.
  if (!changed) return;
  const ntfyUrl = process.env.NTFY_URL;
  if (!ntfyUrl) return;
  await sendNotification(
    ntfyUrl,
    "TOP 10",
    topTenMessage(top, previousIds),
    undefined,
    "car,bar_chart",
  );
}
