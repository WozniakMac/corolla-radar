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
        return engine
          ? { ...listing, power: engine.power, engineVersion: engine.label }
          : listing;
      });
      const newestEngine = [...listings]
        .filter((listing: any) => listing.active && listing.engineVersion)
        .sort((a: any, b: any) =>
          String(b.checkedAt).localeCompare(String(a.checkedAt)),
        )[0];
      return newestEngine
        ? {
            ...car,
            listings,
            power: newestEngine.power,
            engineVersion: newestEngine.engineVersion,
          }
        : { ...car, listings };
    });
    return {
      ...data,
      cars,
      jobs: data.jobs || [],
      scanRuns: data.scanRuns || [],
      snapshots: data.snapshots || [],
      cepikRuns: data.cepikRuns || [],
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
