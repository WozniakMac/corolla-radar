import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { detectEngineSpec } from "../src/engine";
const path = resolve("data/store.json");
export type Job = {
  id: string;
  url: string;
  source: string;
  title: string;
  status: "pending" | "processing" | "processed" | "failed";
  missing: string[];
  input: Record<string, any>;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  carId?: string;
  missedScans?: number;
};
export type ScanRun = {
  id: string;
  trigger: "manual" | "automatic" | "cli";
  source?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  discovered: number;
  verified: number;
  rejected: number;
  errors: number;
};
export type SnapshotMeta = {
  id: string;
  source: string;
  url: string;
  capturedAt: string;
  bytes: number;
  active?: boolean;
};
export type CepikRun = {
  id: string;
  carId: string;
  offerUrl?: string;
  vin: string;
  registrationNumber: string;
  firstRegistrationDate: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outcome: "success" | "warning" | "failed";
  error?: string;
  rawData: unknown;
};
export type Store = {
  cars: unknown[];
  jobs: Job[];
  scanRuns?: ScanRun[];
  top5Ids?: string[];
  notifiedCarKeys?: string[];
  notifiedPriceDropKeys?: string[];
  snapshots?: SnapshotMeta[];
  cepikRuns?: CepikRun[];
};
export async function load(): Promise<Store> {
  try {
    const data = JSON.parse(await readFile(path, "utf8"));
    const cars = (data.cars || []).map((car: any) => {
      const listings = (car.listings || []).map((listing: any) => {
        const engine = detectEngineSpec(
          listing.year || car.year,
          `${car.title || ""} ${(listing.description || "").slice(0, 2000)}`,
        );
        const priceHistory = listing.priceHistory?.length
          ? listing.priceHistory
          : listing.price
            ? [
                {
                  capturedAt:
                    listing.checkedAt || car.verifiedAt || car.firstSeen,
                  price: listing.price,
                  ...(listing.cashPrice
                    ? { cashPrice: listing.cashPrice }
                    : {}),
                },
              ]
            : [];
        return {
          ...listing,
          ...(engine
            ? { power: engine.power, engineVersion: engine.label }
            : {}),
          priceHistory,
        };
      });
      const newestEngine = [...listings]
        .filter((listing: any) => listing.active && listing.engineVersion)
        .sort((a: any, b: any) =>
          String(b.checkedAt).localeCompare(String(a.checkedAt)),
        )[0];
      const effectiveListing = [...listings]
        .filter((listing: any) => listing.active !== false && listing.price)
        .sort(
          (a: any, b: any) =>
            (a.cashPrice || a.price) - (b.cashPrice || b.price),
        )[0];
      const priceHistory = car.priceHistory?.length
        ? car.priceHistory
        : effectiveListing
          ? [
              {
                capturedAt:
                  car.verifiedAt || effectiveListing.checkedAt || car.firstSeen,
                price: effectiveListing.cashPrice || effectiveListing.price,
                source: effectiveListing.source,
                url: effectiveListing.url,
              },
            ]
          : [];
      return newestEngine
        ? {
            ...car,
            listings,
            priceHistory,
            power: newestEngine.power,
            engineVersion: newestEngine.engineVersion,
          }
        : { ...car, listings, priceHistory };
    });
    return {
      ...data,
      cars,
      jobs: data.jobs || [],
      scanRuns: data.scanRuns || [],
      snapshots: data.snapshots || [],
      cepikRuns: data.cepikRuns || [],
      notifiedPriceDropKeys: data.notifiedPriceDropKeys || [],
    };
  } catch {
    return { cars: [], jobs: [], snapshots: [], cepikRuns: [] };
  }
}
export async function save(data: Store) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2));
  await rename(temporary, path);
}
