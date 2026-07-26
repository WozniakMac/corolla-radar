import type { Car, Listing, PurchaseEvidenceSummary } from "../src/types";
import { fetchAndParse } from "./parser";
import type { RankedPurchaseCandidate } from "./purchaseAnalysis";

const trustedListingHosts = ["pewneauto.pl", "otomoto.pl", "olx.pl"];
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
  color?: string;
  description?: string;
  pageText?: string;
  parsedFacts?: Record<string, unknown>;
};

export type PurchaseEvidenceReport = {
  inspectedAt: string;
  listings: LiveListingEvidence[];
};

export type PreparedPurchaseEvidence = {
  report: PurchaseEvidenceReport;
  summary: PurchaseEvidenceSummary;
  unavailableCarIds: string[];
  cleanup: () => Promise<void>;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const hostMatches = (hostname: string, suffix: string) =>
  hostname === suffix || hostname.endsWith(`.${suffix}`);

export function isTrustedPurchaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return trustedListingHosts.some((suffix) =>
      hostMatches(url.hostname, suffix),
    );
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
  if (!isTrustedPurchaseUrl(listing.url))
    return {
      carId,
      source: listing.source,
      requestedUrl: listing.url,
      fetchedAt,
      status: "failed",
      error: "Adres ogłoszenia spoza zaufanych serwisów",
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
      color: page.color,
      description: [
        page.color ? `Kolor nadwozia: ${page.color}.` : "",
        page.description,
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 12000),
      pageText: page.text.slice(0, 20000),
      parsedFacts: {
        vin: page.vin ?? null,
        registrationNumber: page.registrationNumber ?? null,
        firstRegistrationDate: page.firstRegistrationDate ?? null,
        location: page.location ?? null,
        trim: page.trim ?? null,
        engineVersion: page.engineVersion ?? null,
        seller: page.seller ?? null,
        eligibleBody: page.eligibleBody,
        hybrid: page.hybrid,
        ecvt: page.ecvt,
        reserved: page.reserved,
        camera: page.camera,
        parkingSensors: page.parkingSensors,
        heatedWiperArea: page.heatedWiperArea,
        rainSensor: page.rainSensor,
        autoDimmingMirror: page.autoDimmingMirror,
        foldingMirrors: page.foldingMirrors,
        heatedSeats: page.heatedSeats,
        lumbarAdjustment: page.lumbarAdjustment,
        heatedSteeringWheel: page.heatedSteeringWheel,
        keyless: page.keyless,
        wirelessCharging: page.wirelessCharging,
        ics: page.ics,
        hybridHealthCheck: page.hybridHealthCheck,
        toyotaWarranty: page.toyotaWarranty,
        polishSalon: page.polishSalon,
        aso: page.aso,
        oneOwner: page.oneOwner,
        noStructuralDamage: page.noStructuralDamage,
        cameraMentionRejectedAsMarketing: page.cameraMentionRejectedAsMarketing,
        sensorsMentionRejectedAsMarketing:
          page.sensorsMentionRejectedAsMarketing,
      },
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
    };
  }
}

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
  const pagesRefreshed = listings.filter(
    (listing) => listing.status === "refreshed",
  ).length;
  const carsWithColor = new Set(
    listings.filter((listing) => listing.color).map((listing) => listing.carId),
  ).size;
  const warnings = [
    ...(pagesRefreshed < listings.length
      ? [
          `${listings.length - pagesRefreshed} stron nie udało się odświeżyć; dla nich użyto zapisanych danych.`,
        ]
      : []),
    ...(carsWithColor < ranked.length
      ? [
          `Kolor udało się potwierdzić dla ${carsWithColor} z ${ranked.length} aut.`,
        ]
      : []),
  ];
  return {
    report: { inspectedAt, listings },
    summary: {
      inspectedAt,
      pagesAttempted: listings.length,
      pagesRefreshed,
      pagesFailed: listings.length - pagesRefreshed,
      carsWithColor,
      warnings,
    },
    unavailableCarIds,
    cleanup: async () => undefined,
  };
}
