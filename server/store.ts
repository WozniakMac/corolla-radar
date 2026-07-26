import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { detectEngineSpec } from "../src/engine";
import type { ScoreBreakdown } from "../src/types";
const path = resolve("data/store.json");
const backupPath = `${path}.bak`;
const revision = Symbol("storeRevision");
const recoveredFromBackup = Symbol("recoveredFromBackup");
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
export type TopFiveSnapshotEntry = {
  id: string;
  score: number;
  breakdown?: ScoreBreakdown;
};
export type Store = {
  cars: unknown[];
  jobs: Job[];
  scanRuns?: ScanRun[];
  top5Ids?: string[];
  top5Snapshot?: TopFiveSnapshotEntry[];
  notifiedCarKeys?: string[];
  notifiedPriceDropKeys?: string[];
  snapshots?: SnapshotMeta[];
  cepikRuns?: CepikRun[];
};

type VersionedStore = Store & {
  [revision]?: string;
  [recoveredFromBackup]?: boolean;
};

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function parseStore(contents: string): Store {
  const data = JSON.parse(contents);
  if (!data || typeof data !== "object" || !Array.isArray(data.cars))
    throw new Error("Nieprawidłowy format magazynu danych");
  const cars = data.cars.map((car: any) => {
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
                ...(listing.cashPrice ? { cashPrice: listing.cashPrice } : {}),
              },
            ]
          : [];
      return {
        ...listing,
        ...(engine ? { power: engine.power, engineVersion: engine.label } : {}),
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
        (a: any, b: any) => (a.cashPrice || a.price) - (b.cashPrice || b.price),
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
}

export async function load(): Promise<Store> {
  try {
    const contents = await readFile(path, "utf8");
    const store = parseStore(contents) as VersionedStore;
    store[revision] = hash(contents);
    return store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { cars: [], jobs: [], snapshots: [], cepikRuns: [] };
    try {
      const contents = await readFile(backupPath, "utf8");
      const store = parseStore(contents) as VersionedStore;
      store[recoveredFromBackup] = true;
      console.error("Odtworzono magazyn z kopii zapasowej:", error);
      return store;
    } catch {
      throw new Error("Nie można odczytać magazynu ani jego kopii zapasowej", {
        cause: error,
      });
    }
  }
}
export async function save(data: Store) {
  await mkdir(dirname(path), { recursive: true });
  const expectedRevision = (data as VersionedStore)[revision];
  let currentContents: string | undefined;
  try {
    currentContents = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (
    expectedRevision &&
    currentContents &&
    hash(currentContents) !== expectedRevision
  )
    throw new Error(
      "Magazyn zmienił się od czasu odczytu; zapis został bezpiecznie przerwany",
    );

  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const contents = JSON.stringify(data, null, 2);
  await writeFile(temporary, contents);
  if (currentContents && !(data as VersionedStore)[recoveredFromBackup])
    await copyFile(path, backupPath).catch((error) => {
      console.error("Nie udało się utworzyć kopii magazynu:", error);
    });
  await rename(temporary, path);
  (data as VersionedStore)[revision] = hash(contents);
  (data as VersionedStore)[recoveredFromBackup] = false;
}
