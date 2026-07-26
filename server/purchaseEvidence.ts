import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import type { Car, Listing, PurchaseEvidenceSummary } from "../src/types";
import { fetchAndParse } from "./parser";
import type { RankedPurchaseCandidate } from "./purchaseAnalysis";

const trustedListingHosts = ["pewneauto.pl", "otomoto.pl", "olx.pl"];
const trustedImageHosts = [
  "pewneauto.pl",
  "otomoto.pl",
  "olx.pl",
  "olxcdn.com",
];
const maxImageBytes = 6 * 1024 * 1024;

export type LiveListingEvidence = {
  carId: string;
  source: string;
  requestedUrl: string;
  finalUrl?: string;
  fetchedAt: string;
  status: "refreshed" | "unavailable" | "failed";
  error?: string;
  active?: boolean;
  title?: string;
  price?: number;
  cashPrice?: number;
  year?: number;
  mileage?: number;
  power?: number;
  description?: string;
  pageText?: string;
  imageUrls: string[];
};

export type VisualEvidence = {
  attachmentIndex: number;
  carId: string;
  attachment: string;
  sourceUrl: string;
};

export type PurchaseEvidenceReport = {
  inspectedAt: string;
  listings: LiveListingEvidence[];
  visualEvidence: VisualEvidence[];
};

export type PreparedPurchaseEvidence = {
  report: PurchaseEvidenceReport;
  summary: PurchaseEvidenceSummary;
  imagePaths: string[];
  unavailableCarIds: string[];
  cleanup: () => Promise<void>;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const hostMatches = (hostname: string, suffix: string) =>
  hostname === suffix || hostname.endsWith(`.${suffix}`);

export function isTrustedPurchaseUrl(value: string, kind: "listing" | "image") {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const allowed =
      kind === "listing" ? trustedListingHosts : trustedImageHosts;
    return allowed.some((suffix) => hostMatches(url.hostname, suffix));
  } catch {
    return false;
  }
}

async function mapLimit<T, R>(
  values: T[],
  limit: number,
  work: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (next < values.length) {
        const index = next++;
        results[index] = await work(values[index]);
      }
    }),
  );
  return results;
}

const activeListings = (car: Car) =>
  car.listings.filter((listing) => listing.active);

async function refreshListing(
  carId: string,
  listing: Listing,
  fetchImpl: FetchLike,
): Promise<LiveListingEvidence> {
  const fetchedAt = new Date().toISOString();
  if (!isTrustedPurchaseUrl(listing.url, "listing"))
    return {
      carId,
      source: listing.source,
      requestedUrl: listing.url,
      fetchedAt,
      status: "failed",
      error: "Adres ogłoszenia spoza zaufanych serwisów",
      imageUrls: listing.images || [],
    };
  try {
    const page = await fetchAndParse(listing.url, fetchImpl);
    return {
      carId,
      source: listing.source,
      requestedUrl: listing.url,
      finalUrl: page.finalUrl,
      fetchedAt,
      status: "refreshed",
      active: page.active,
      title: page.title,
      price: page.price,
      cashPrice: page.cashPrice,
      year: page.year,
      mileage: page.mileage,
      power: page.power,
      description: page.description.slice(0, 8000),
      pageText: page.text.slice(0, 12000),
      imageUrls: page.images,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Błąd pobierania strony";
    return {
      carId,
      source: listing.source,
      requestedUrl: listing.url,
      fetchedAt,
      status: /^HTTP (?:404|410)$/.test(message) ? "unavailable" : "failed",
      error: message,
      imageUrls: listing.images || [],
    };
  }
}

function imagePool(
  car: Car,
  liveListings: LiveListingEvidence[],
  maxAttempts: number,
) {
  const sources = [
    ...liveListings.map((listing) => ({
      sourceUrl: listing.finalUrl || listing.requestedUrl,
      images: listing.imageUrls,
    })),
    ...activeListings(car).map((listing) => ({
      sourceUrl: listing.url,
      images: listing.images || [],
    })),
  ];
  const seen = new Set<string>();
  const selected: Array<{ url: string; sourceUrl: string }> = [];
  for (let imageIndex = 0; selected.length < maxAttempts; imageIndex++) {
    let found = false;
    for (const source of sources) {
      const url = source.images[imageIndex];
      if (!url) continue;
      found = true;
      if (
        seen.has(url) ||
        !isTrustedPurchaseUrl(url, "image") ||
        !isTrustedPurchaseUrl(source.sourceUrl, "listing")
      )
        continue;
      seen.add(url);
      selected.push({ url, sourceUrl: source.sourceUrl });
      if (selected.length >= maxAttempts) break;
    }
    if (!found) break;
  }
  return selected;
}

async function responseBytes(response: Response) {
  if (!response.body) throw new Error("Pusta odpowiedź obrazu");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxImageBytes) {
      await reader.cancel();
      throw new Error("Obraz przekracza limit 6 MB");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function imageExtension(bytes: Buffer) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return "jpg";
  if (
    bytes.length >= 8 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "webp";
  throw new Error("Nieobsługiwany format obrazu");
}

const safeCarId = (value: string) =>
  value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) || "car";

async function downloadCarImages(
  car: Car,
  liveListings: LiveListingEvidence[],
  directory: string,
  limit: number,
  fetchImpl: FetchLike,
) {
  const paths: string[] = [];
  const visualEvidence: Array<Omit<VisualEvidence, "attachmentIndex">> = [];
  const candidates = imagePool(car, liveListings, limit * 2);
  for (const candidate of candidates) {
    if (paths.length >= limit) break;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const response = await fetchImpl(candidate.url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          accept: "image/jpeg,image/png,image/webp;q=0.8,*/*;q=0.1",
          "user-agent":
            "Mozilla/5.0 CorollaRadar/1.0 (private purchase assistant)",
        },
      }).finally(() => clearTimeout(timer));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (response.url && !isTrustedPurchaseUrl(response.url, "image"))
        throw new Error("Przekierowanie obrazu poza zaufany serwis");
      const bytes = await responseBytes(response);
      const extension = imageExtension(bytes);
      const path = resolve(
        directory,
        `${safeCarId(car.id)}-${paths.length + 1}.${extension}`,
      );
      await writeFile(path, bytes);
      paths.push(path);
      visualEvidence.push({
        carId: car.id,
        attachment: basename(path),
        sourceUrl: candidate.sourceUrl,
      });
    } catch {
      // Nieudane zdjęcie nie blokuje analizy; próbujemy kolejnego z galerii.
    }
  }
  return { paths, visualEvidence };
}

const configuredImagesPerCar = () => {
  const parsed = Number(process.env.PURCHASE_ANALYSIS_IMAGES_PER_CAR || 4);
  return Number.isFinite(parsed)
    ? Math.min(6, Math.max(1, Math.floor(parsed)))
    : 4;
};

export async function preparePurchaseEvidence(
  ranked: RankedPurchaseCandidate[],
  fetchImpl: FetchLike = fetch,
): Promise<PreparedPurchaseEvidence> {
  const inspectedAt = new Date().toISOString();
  const listingInputs = ranked.flatMap(({ car }) =>
    activeListings(car).map((listing) => ({ carId: car.id, listing })),
  );
  const listings = await mapLimit(listingInputs, 4, ({ carId, listing }) =>
    refreshListing(carId, listing, fetchImpl),
  );
  const unavailableCarIds = ranked.flatMap(({ car }) => {
    const carListings = listings.filter((listing) => listing.carId === car.id);
    return carListings.length > 0 &&
      carListings.every((listing) => listing.status === "unavailable")
      ? [car.id]
      : [];
  });
  const unavailable = new Set(unavailableCarIds);
  const availableRanked = ranked.filter(({ car }) => !unavailable.has(car.id));
  const directory = await mkdtemp(
    resolve(tmpdir(), "corolla-radar-purchase-images-"),
  );
  const imagesPerCar = configuredImagesPerCar();
  try {
    const imageGroups = await mapLimit(availableRanked, 3, async ({ car }) =>
      downloadCarImages(
        car,
        listings.filter((listing) => listing.carId === car.id),
        directory,
        imagesPerCar,
        fetchImpl,
      ),
    );
    const imagePaths = imageGroups.flatMap((group) => group.paths);
    const visualEvidence = imageGroups
      .flatMap((group) => group.visualEvidence)
      .map((image, index) => ({ ...image, attachmentIndex: index + 1 }));
    const pagesRefreshed = listings.filter(
      (listing) => listing.status === "refreshed",
    ).length;
    const carsWithImages = new Set(visualEvidence.map((image) => image.carId))
      .size;
    const warnings = [
      ...(pagesRefreshed < listings.length
        ? [
            `${listings.length - pagesRefreshed} stron nie udało się odświeżyć; dla nich użyto zapisanych danych.`,
          ]
        : []),
      ...(carsWithImages < ranked.length
        ? [
            `Zdjęcia udało się dołączyć dla ${carsWithImages} z ${ranked.length} aut.`,
          ]
        : []),
    ];
    return {
      report: { inspectedAt, listings, visualEvidence },
      summary: {
        inspectedAt,
        pagesAttempted: listings.length,
        pagesRefreshed,
        pagesFailed: listings.length - pagesRefreshed,
        imagesAttached: imagePaths.length,
        carsWithImages,
        warnings,
      },
      imagePaths,
      unavailableCarIds,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
