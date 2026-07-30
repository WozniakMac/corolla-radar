import { randomUUID } from "node:crypto";
import { adapters } from "./adapters";
import type { SourceId, SourceStatus } from "./adapters/types";
import {
  fetchAndParse,
  parseListingHtml,
  verifyListingAvailability,
  type ListingAvailability,
} from "./parser";
import { load, save } from "./store";
import { distanceFromPoznan } from "./distance";
import { notifyNewTopTen } from "./notifications";
import type { Store } from "./store";
import { isDecisionMissing, missingListingFields } from "./codexMissing";
import { equipmentEvidence } from "./equipmentEvidence";
import {
  deletePrunedSnapshotFiles,
  latestSnapshots,
  pruneSnapshots,
  readSnapshot,
  saveSnapshot,
} from "./snapshots";

const hasHeatedSeats = (text: string) =>
  equipmentEvidence(
    text,
    /podgrzewane (?:przednie )?(?:fotele|siedzenia)/i,
    /podgrzewany fotel (?:kierowcy|pasażera)/i,
  ).confirmed;

const hasTechName = (text: string) =>
  /(?:pakiet\s+tech|comfort\s*\+?\s*(?:pakiet\s*)?tech|wersja\s+tech)/i.test(
    text,
  );

type PriceObservation = {
  price: number;
  cashPrice?: number;
  checkedAt?: string;
  priceHistory?: Array<{
    capturedAt: string;
    price: number;
    cashPrice?: number;
  }>;
};

export function recordPriceObservation(
  current: PriceObservation,
  next: PriceObservation,
  capturedAt: string,
) {
  const history = current.priceHistory ? [...current.priceHistory] : [];
  if (!history.length && current.price) {
    history.push({
      capturedAt: current.checkedAt || capturedAt,
      price: current.price,
      ...(current.cashPrice ? { cashPrice: current.cashPrice } : {}),
    });
  }
  const latest = history.at(-1);
  if (
    !latest ||
    latest.price !== next.price ||
    (latest.cashPrice || undefined) !== (next.cashPrice || undefined)
  ) {
    history.push({
      capturedAt,
      price: next.price,
      ...(next.cashPrice ? { cashPrice: next.cashPrice } : {}),
    });
  }
  return history;
}

const equipmentKeys = [
  "heatedWiperArea",
  "rainSensor",
  "autoDimmingMirror",
  "foldingMirrors",
  "lumbarAdjustment",
  "heatedSteeringWheel",
  "keyless",
  "wirelessCharging",
  "ics",
  "hybridHealthCheck",
  "toyotaWarranty",
] as const;

const statuses: Map<SourceId, SourceStatus> = new Map(
  adapters.map((a) => [
    a.id,
    {
      id: a.id,
      name: a.name,
      enabled: true,
      discovered: 0,
      verified: 0,
      rejected: 0,
      errors: [],
    } satisfies SourceStatus,
  ]),
);

const sourcePriority = (source: string) =>
  source === "Toyota Pewne Auto" ? 0 : source === "OTOMOTO" ? 1 : 2;

const prioritizedListings = (listings: any[]) =>
  [...listings].sort(
    (a, b) =>
      sourcePriority(a.source) - sourcePriority(b.source) ||
      String(b.checkedAt).localeCompare(String(a.checkedAt)),
  );

const preferredListingValue = (
  listings: any[],
  key: string,
  fallback?: unknown,
) =>
  prioritizedListings(listings).find(
    (listing) =>
      listing[key] !== undefined &&
      listing[key] !== null &&
      listing[key] !== "",
  )?.[key] ?? fallback;

export type ActiveScan = {
  trigger: "manual" | "automatic" | "cli";
  source?: string;
  startedAt: string;
};

let activeScan: ActiveScan | undefined;
export const getStatuses = () => [...statuses.values()];
export const getActiveScan = () => activeScan;

export function reconcileSourcePresence(
  db: Store,
  source: string,
  candidateUrls: Set<string>,
  complete: boolean,
  missingThreshold = 3,
  unavailableUrls = new Set<string>(),
) {
  const now = new Date().toISOString();
  const listings = (db.cars as any[]).flatMap((car) => car.listings || []);
  for (const listing of listings) {
    if (listing.source !== source) continue;
    const normalizedUrl = normalize(listing.url);
    const found = candidateUrls.has(normalizedUrl);
    if (unavailableUrls.has(normalizedUrl)) {
      listing.missedScans = missingThreshold;
      listing.active = false;
      listing.inactiveAt ||= now;
    } else if (found) {
      listing.missedScans = 0;
      listing.active = true;
      delete listing.inactiveAt;
    } else if (complete) {
      listing.missedScans = (listing.missedScans || 0) + 1;
      if (listing.missedScans >= missingThreshold) {
        listing.active = false;
        listing.inactiveAt ||= now;
      }
    }
  }
  for (const job of db.jobs) {
    if (job.source !== source) continue;
    if (candidateUrls.has(normalize(job.url))) job.missedScans = 0;
    else if (complete) job.missedScans = (job.missedScans || 0) + 1;
  }
  db.jobs = db.jobs.filter((job) => (job.missedScans || 0) < missingThreshold);
  for (const snapshot of db.snapshots || []) {
    if (snapshot.source !== source) continue;
    const listing = listings.find(
      (item) =>
        item.source === source &&
        normalize(item.url) === normalize(snapshot.url),
    );
    if (listing) snapshot.active = listing.active;
  }
}

export async function verifyMissingSourceListings(
  db: Store,
  source: string,
  candidateUrls: Set<string>,
  verify: (
    url: string,
  ) => Promise<ListingAvailability> = verifyListingAvailability,
) {
  const missingUrls = [
    ...new Set(
      (db.cars as any[])
        .flatMap((car) => car.listings || [])
        .filter(
          (listing) =>
            listing.source === source &&
            listing.active !== false &&
            !candidateUrls.has(normalize(listing.url)),
        )
        .map((listing) => listing.url as string),
    ),
  ];
  const unavailableUrls = new Set<string>();
  for (const url of missingUrls) {
    const availability = await verify(url);
    if (availability === "unavailable") unavailableUrls.add(normalize(url));
    else candidateUrls.add(normalize(url));
  }
  return unavailableUrls;
}

function toCar(
  p: Awaited<ReturnType<typeof fetchAndParse>>,
  source: string,
  snapshotId?: string,
) {
  const now = new Date().toISOString();
  return {
    id: p.vin || randomUUID(),
    title: p.title,
    year: p.year,
    power: p.power,
    engineVersion: p.engineVersion,
    price: p.price,
    cashPrice: p.cashPrice,
    priceHistory: [
      {
        capturedAt: now,
        price: p.cashPrice || p.price,
        source,
        url: p.finalUrl,
      },
    ],
    mileage: p.mileage,
    location: p.location || "Do uzupełnienia",
    distance: distanceFromPoznan(p.location),
    trim: p.trim || "Do weryfikacji",
    tech: hasTechName(p.text),
    heatedSeats: p.heatedSeats || hasHeatedSeats(p.text),
    ...Object.fromEntries(equipmentKeys.map((key) => [key, p[key]])),
    polishSalon: p.polishSalon,
    aso: p.aso,
    oneOwner: p.oneOwner,
    noStructuralDamage: p.noStructuralDamage,
    vat23: /vat\s*23|fv\s*23|faktura vat 23/i.test(p.text),
    camera: p.camera,
    parkingSensors: p.parkingSensors,
    ecvt: p.ecvt,
    hybrid: p.hybrid,
    reserved: p.reserved,
    body: "Touring Sports",
    seller: p.seller || new URL(p.finalUrl).hostname,
    vin: p.vin,
    registrationNumber: p.registrationNumber,
    firstRegistrationDate: p.firstRegistrationDate,
    firstSeen: now.slice(0, 10),
    verifiedAt: now,
    listings: [
      {
        source,
        url: p.finalUrl,
        price: p.price,
        title: p.title,
        year: p.year,
        mileage: p.mileage,
        power: p.power,
        engineVersion: p.engineVersion,
        location: p.location,
        trim: p.trim,
        seller: p.seller,
        cashPrice: p.cashPrice,
        priceHistory: [
          {
            capturedAt: now,
            price: p.price,
            ...(p.cashPrice ? { cashPrice: p.cashPrice } : {}),
          },
        ],
        active: true,
        checkedAt: now,
        description: p.description,
        images: p.images,
        camera: p.camera,
        parkingSensors: p.parkingSensors,
        heatedSeats: p.heatedSeats || hasHeatedSeats(p.text),
        ...Object.fromEntries(equipmentKeys.map((key) => [key, p[key]])),
        polishSalon: p.polishSalon,
        aso: p.aso,
        oneOwner: p.oneOwner,
        noStructuralDamage: p.noStructuralDamage,
        vat23: /vat\s*23|fv\s*23|faktura vat 23/i.test(p.text),
        snapshotId,
        reserved: p.reserved,
        hybrid: p.hybrid,
        ecvt: p.ecvt,
        registrationNumber: p.registrationNumber,
        firstRegistrationDate: p.firstRegistrationDate,
      },
    ],
    notes: [
      "Dane pobrane automatycznie; historię i szkody potwierdź dokumentami.",
      ...(!p.hybrid
        ? ["Nie potwierdzono jednoznacznie napędu hybrydowego."]
        : []),
      ...(!p.camera
        ? ["Nie potwierdzono kamery cofania w treści ogłoszenia."]
        : []),
      ...(!p.parkingSensors
        ? ["Nie potwierdzono przednich ani tylnych czujników parkowania."]
        : []),
      ...(p.sensorsMentionRejectedAsMarketing
        ? [
            "Wzmiankę o czujnikach odrzucono jako reklamę dodatkowych akcesoriów.",
          ]
        : []),
      ...(p.cameraMentionRejectedAsMarketing
        ? ["Wzmiankę o kamerze odrzucono jako reklamę dodatkowych akcesoriów."]
        : []),
      ...(!p.ecvt
        ? ["Nie potwierdzono skrzyni e-CVT w treści ogłoszenia."]
        : []),
      ...(![122, 140, 180, 184, 196].includes(p.power)
        ? [
            `Niestandardowa lub nierozpoznana moc: ${p.power || "brak danych"} KM.`,
          ]
        : []),
      ...(p.mileage > 100000
        ? ["Przebieg przekracza preferowane 100 tys. km."]
        : []),
    ],
    description: p.description,
    images: p.images,
  };
}

export function upsertParsedCar(
  db: Store,
  p: Awaited<ReturnType<typeof fetchAndParse>>,
  source: string,
  snapshotId?: string,
) {
  const cars = db.cars as any[];
  const checkedAt = new Date().toISOString();
  const duplicate = cars.find(
    (car) =>
      (p.vin && car.vin === p.vin) ||
      car.listings?.some(
        (l: any) => normalize(l.url) === normalize(p.finalUrl),
      ),
  );
  const listing = {
    source,
    url: p.finalUrl,
    price: p.price,
    title: p.title,
    year: p.year,
    mileage: p.mileage,
    power: p.power,
    engineVersion: p.engineVersion,
    location: p.location,
    trim: p.trim,
    seller: p.seller,
    cashPrice: p.cashPrice,
    active: true,
    checkedAt,
    description: p.description,
    images: p.images,
    camera: p.camera,
    parkingSensors: p.parkingSensors,
    heatedSeats: p.heatedSeats || hasHeatedSeats(p.text),
    ...Object.fromEntries(equipmentKeys.map((key) => [key, p[key]])),
    polishSalon: p.polishSalon,
    aso: p.aso,
    oneOwner: p.oneOwner,
    noStructuralDamage: p.noStructuralDamage,
    vat23: /vat\s*23|fv\s*23|faktura vat 23/i.test(p.text),
    snapshotId,
    reserved: p.reserved,
    hybrid: p.hybrid,
    ecvt: p.ecvt,
    registrationNumber: p.registrationNumber,
    firstRegistrationDate: p.firstRegistrationDate,
  };
  if (!duplicate) {
    const car = toCar(p, source, snapshotId);
    cars.push(car);
    return car.id;
  }
  const previousEffectivePrice = duplicate.cashPrice || duplicate.price;
  const old = duplicate.listings.find(
    (l: any) => normalize(l.url) === normalize(p.finalUrl),
  );
  if (old) {
    const priceHistory = recordPriceObservation(old, listing, checkedAt);
    Object.assign(old, listing, { priceHistory });
  } else {
    duplicate.listings.push({
      ...listing,
      priceHistory: [
        {
          capturedAt: checkedAt,
          price: listing.price,
          ...(listing.cashPrice ? { cashPrice: listing.cashPrice } : {}),
        },
      ],
    });
  }
  duplicate.price = Math.min(
    ...duplicate.listings.filter((l: any) => l.active).map((l: any) => l.price),
  );
  duplicate.cashPrice = Math.min(
    ...duplicate.listings
      .filter((item: any) => item.active)
      .map((item: any) => item.cashPrice || item.price),
  );
  const effectiveListing = duplicate.listings
    .filter((item: any) => item.active)
    .sort(
      (a: any, b: any) => (a.cashPrice || a.price) - (b.cashPrice || b.price),
    )[0];
  const nextEffectivePrice = duplicate.cashPrice || duplicate.price;
  duplicate.priceHistory ||= [
    {
      capturedAt: duplicate.verifiedAt || duplicate.firstSeen,
      price: previousEffectivePrice,
      source: effectiveListing?.source || source,
      url: effectiveListing?.url || p.finalUrl,
    },
  ];
  if (
    duplicate.priceHistory.at(-1)?.price !== nextEffectivePrice &&
    effectiveListing
  ) {
    duplicate.priceHistory.push({
      capturedAt: checkedAt,
      price: nextEffectivePrice,
      source: effectiveListing.source,
      url: effectiveListing.url,
    });
  }
  duplicate.verifiedAt = listing.checkedAt;
  const activeListings = duplicate.listings.filter((item: any) => item.active);
  duplicate.title = preferredListingValue(
    activeListings,
    "title",
    duplicate.title,
  );
  duplicate.trim = preferredListingValue(
    activeListings,
    "trim",
    duplicate.trim,
  );
  const preferredLocation = preferredListingValue(
    activeListings,
    "location",
    duplicate.location,
  );
  if (preferredLocation) {
    duplicate.location = preferredLocation;
    duplicate.distance = distanceFromPoznan(preferredLocation);
  }
  duplicate.seller = preferredListingValue(
    activeListings,
    "seller",
    duplicate.seller,
  );
  duplicate.year = preferredListingValue(
    activeListings,
    "year",
    duplicate.year,
  );
  duplicate.mileage = preferredListingValue(
    activeListings,
    "mileage",
    duplicate.mileage,
  );
  duplicate.power = preferredListingValue(
    activeListings,
    "power",
    p.power || duplicate.power || 0,
  );
  duplicate.engineVersion = preferredListingValue(
    activeListings,
    "engineVersion",
    p.engineVersion || duplicate.engineVersion,
  );
  duplicate.vin ||= p.vin;
  duplicate.registrationNumber = preferredListingValue(
    activeListings,
    "registrationNumber",
    duplicate.registrationNumber || p.registrationNumber,
  );
  duplicate.firstRegistrationDate = preferredListingValue(
    activeListings,
    "firstRegistrationDate",
    duplicate.firstRegistrationDate || p.firstRegistrationDate,
  );
  duplicate.camera = activeListings.some((item: any) => item.camera === true);
  duplicate.parkingSensors = activeListings.some(
    (item: any) => item.parkingSensors === true,
  );
  duplicate.ecvt = activeListings.some((item: any) => item.ecvt === true);
  duplicate.hybrid = activeListings.some((item: any) => item.hybrid === true);
  duplicate.tech ||= hasTechName(p.text);
  duplicate.heatedSeats = activeListings.some(
    (item: any) => item.heatedSeats === true,
  );
  for (const key of equipmentKeys)
    duplicate[key] = activeListings.some((item: any) => item[key] === true);
  duplicate.polishSalon = activeListings.some(
    (item: any) => item.polishSalon === true,
  );
  duplicate.aso = activeListings.some((item: any) => item.aso === true);
  duplicate.oneOwner = activeListings.some(
    (item: any) => item.oneOwner === true,
  );
  duplicate.noStructuralDamage = activeListings.some(
    (item: any) => item.noStructuralDamage === true,
  );
  duplicate.vat23 = activeListings.some((item: any) => item.vat23 === true);
  duplicate.reserved = activeListings.some(
    (item: any) => item.reserved === true,
  );
  duplicate.description = preferredListingValue(
    activeListings,
    "description",
    duplicate.description,
  );
  const preferredImages = prioritizedListings(activeListings).flatMap(
    (item: any) => item.images || [],
  );
  duplicate.images = [
    ...new Set([...preferredImages, ...(duplicate.images || [])]),
  ].slice(0, 20);
  duplicate.notes = (duplicate.notes || []).filter(
    (note: string) =>
      !(p.hybrid && /napędu hybrydowego/i.test(note)) &&
      !(p.camera && /kamery cofania/i.test(note)) &&
      !(p.parkingSensors && /czujników parkowania/i.test(note)) &&
      !(p.ecvt && /skrzyni e-CVT/i.test(note)) &&
      !(p.power && /nierozpoznana moc/i.test(note)),
  );
  if (p.sensorsMentionRejectedAsMarketing) {
    const note =
      "Wzmiankę o czujnikach odrzucono jako reklamę dodatkowych akcesoriów.";
    if (!duplicate.notes.includes(note)) duplicate.notes.push(note);
  }
  if (p.cameraMentionRejectedAsMarketing) {
    const note =
      "Wzmiankę o kamerze odrzucono jako reklamę dodatkowych akcesoriów.";
    if (!duplicate.notes.includes(note)) duplicate.notes.push(note);
  }
  return duplicate.id as string;
}

export async function runSources(
  sourceId?: string,
  trigger: "manual" | "automatic" | "cli" = "manual",
) {
  if (activeScan) throw new Error("Cykl już trwa");
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  activeScan = { trigger, source: sourceId, startedAt };
  try {
    for (const adapter of adapters.filter(
      (a) => !sourceId || a.id === sourceId,
    )) {
      const status = statuses.get(adapter.id)!;
      status.lastRun = new Date().toISOString();
      status.errors = [];
      status.rejectionReasons = {};
      status.codexAttempted = 0;
      status.codexCompleted = 0;
      status.discoveryComplete = false;
      status.discovered = status.verified = status.rejected = 0;
      try {
        const candidates = await adapter.discover();
        status.discovered = candidates.length;
        status.pagesScanned = adapter.pagesScanned;
        status.discoveryComplete = adapter.discoveryComplete;
        const db = await load();
        const activeCandidateUrls = new Set(
          candidates.map((candidate) => normalize(candidate.url)),
        );
        const configuredCandidateLimit = Number(
          process.env.SCAN_CANDIDATE_LIMIT || 0,
        );
        const candidateLimit =
          configuredCandidateLimit > 0
            ? Math.floor(configuredCandidateLimit)
            : Infinity;
        const complete =
          adapter.discoveryComplete === true &&
          candidates.length <= candidateLimit;
        const unavailableUrls = complete
          ? await verifyMissingSourceListings(
              db,
              adapter.name,
              activeCandidateUrls,
            )
          : new Set<string>();
        reconcileSourcePresence(
          db,
          adapter.name,
          activeCandidateUrls,
          complete,
          3,
          unavailableUrls,
        );
        for (const candidate of candidates.slice(0, candidateLimit)) {
          try {
            const p = await fetchAndParse(candidate.url);
            const snapshot = await saveSnapshot(
              db,
              adapter.name,
              p.finalUrl,
              p.rawHtml,
            );
            const { rawHtml: _rawHtml, ...parsedInput } = p;
            const missing = missingListingFields(p);
            if (
              isDecisionMissing(missing) &&
              !/(rodzaj nadwozia|nadwozie)[^.;]{0,30}(sedan|hatchback|suv)|corolla cross/i.test(
                p.text,
              )
            ) {
              const existing = db.jobs.find(
                (job) => normalize(job.url) === normalize(p.finalUrl),
              );
              if (!existing)
                db.jobs.push({
                  id: randomUUID(),
                  url: p.finalUrl,
                  source: adapter.name,
                  title: p.title,
                  status: "pending",
                  missing,
                  input: parsedInput,
                  createdAt: new Date().toISOString(),
                });
              else if (existing.status !== "processed") {
                existing.missing = missing;
                existing.input = parsedInput;
                existing.title = p.title;
              }
            } else {
              db.jobs = db.jobs.filter(
                (job) =>
                  normalize(job.url) !== normalize(p.finalUrl) ||
                  job.status === "processed",
              );
            }
            const reasons = [
              !p.active && "inactive",
              !p.eligibleBody && "body",
              !p.price && "price",
              !p.year && "year",
              !p.mileage && "mileage",
            ].filter(Boolean) as string[];
            if (reasons.length) {
              status.rejected++;
              for (const reason of reasons)
                status.rejectionReasons![reason] =
                  (status.rejectionReasons![reason] || 0) + 1;
              continue;
            }
            const carId = upsertParsedCar(db, p, adapter.name, snapshot.id);
            const codexJob = db.jobs.find(
              (job) => normalize(job.url) === normalize(p.finalUrl),
            );
            if (codexJob) codexJob.carId = carId;
            status.verified++;
          } catch (error) {
            status.errors.push(
              `${candidate.url}: ${error instanceof Error ? error.message : "błąd"}`,
            );
          }
        }
        const prunedSnapshotIds = await pruneSnapshots(db);
        await save(db);
        await deletePrunedSnapshotFiles(prunedSnapshotIds);
        status.lastSuccess = new Date().toISOString();
      } catch (error) {
        status.errors.push(
          error instanceof Error ? error.message : "Błąd źródła",
        );
      }
    }
    await notifyNewTopTen({
      trigger,
      source: sourceId,
    }).catch((error) => console.error("Notification failed:", error));
    const result = getStatuses();
    const relevant = result.filter(
      (status) => !sourceId || status.id === sourceId,
    );
    const db = await load();
    db.scanRuns ||= [];
    db.scanRuns.push({
      id: randomUUID(),
      trigger,
      source: sourceId,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      discovered: relevant.reduce((sum, item) => sum + item.discovered, 0),
      verified: relevant.reduce((sum, item) => sum + item.verified, 0),
      rejected: relevant.reduce((sum, item) => sum + item.rejected, 0),
      errors: relevant.reduce((sum, item) => sum + item.errors.length, 0),
    });
    db.scanRuns = db.scanRuns.slice(-500);
    const prunedSnapshotIds = await pruneSnapshots(db);
    await save(db);
    await deletePrunedSnapshotFiles(prunedSnapshotIds);
    return result;
  } finally {
    activeScan = undefined;
  }
}

export async function reprocessSavedSnapshots() {
  if (activeScan) throw new Error("Cykl już trwa");
  activeScan = {
    trigger: "manual",
    source: "snapshots",
    startedAt: new Date().toISOString(),
  };
  try {
    const db = await load();
    const snapshots = latestSnapshots(
      (db.snapshots || []).filter((snapshot) => snapshot.active !== false),
    );
    for (const car of db.cars as any[])
      for (const listing of car.listings || []) listing.active = false;

    let processed = 0;
    let accepted = 0;
    const errors: string[] = [];
    for (const snapshot of snapshots) {
      try {
        const html = await readSnapshot(snapshot.id);
        const parsed = {
          ...parseListingHtml(html, snapshot.url),
          rawHtml: html,
        };
        processed++;
        if (
          !parsed.active ||
          !parsed.eligibleBody ||
          !parsed.price ||
          !parsed.year ||
          !parsed.mileage
        )
          continue;
        upsertParsedCar(db, parsed, snapshot.source, snapshot.id);
        accepted++;
      } catch (error) {
        errors.push(
          `${snapshot.url}: ${error instanceof Error ? error.message : "błąd"}`,
        );
      }
    }
    db.cars = (db.cars as any[]).filter((car) =>
      car.listings?.some((listing: any) => listing.active),
    );
    const prunedSnapshotIds = await pruneSnapshots(db);
    await save(db);
    await deletePrunedSnapshotFiles(prunedSnapshotIds);
    await notifyNewTopTen({
      trigger: "reprocess",
      source: "snapshots",
    }).catch((error) => console.error("Notification failed:", error));
    return { snapshots: snapshots.length, processed, accepted, errors };
  } finally {
    activeScan = undefined;
  }
}
const normalize = (value: string) => {
  const u = new URL(value);
  return u.origin + u.pathname.replace(/\/$/, "");
};
