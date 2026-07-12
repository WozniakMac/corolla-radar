import { randomUUID } from "node:crypto";
import { adapters } from "./adapters";
import type { SourceStatus } from "./adapters/types";
import { fetchAndParse, parseListingHtml } from "./parser";
import { load, save } from "./store";
import { distanceFromPoznan } from "./distance";
import { notifyNewTopFive } from "./notifications";
import type { Store } from "./store";
import { isDecisionMissing, missingListingFields } from "./codexMissing";
import { equipmentEvidence } from "./equipmentEvidence";
import { latestSnapshots, readSnapshot, saveSnapshot } from "./snapshots";

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

const descriptionSimilarity = (left = "", right = "") => {
  const tokens = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-ząćęłńóśźż0-9]+/gi, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 4)
        .slice(0, 500),
    );
  const a = tokens(left);
  const b = tokens(right);
  if (a.size < 8 || b.size < 8) return 0;
  const common = [...a].filter((word) => b.has(word)).length;
  return common / Math.min(a.size, b.size);
};

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

const statuses = new Map(
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
export type ActiveScan = {
  trigger: "manual" | "automatic" | "cli";
  source?: string;
  startedAt: string;
};

let activeScan: ActiveScan | undefined;
export const getStatuses = () => [...statuses.values()];
export const getActiveScan = () => activeScan;

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
    price: p.price,
    cashPrice: p.cashPrice,
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
    firstSeen: now.slice(0, 10),
    verifiedAt: now,
    listings: [
      {
        source,
        url: p.finalUrl,
        price: p.price,
        year: p.year,
        mileage: p.mileage,
        power: p.power,
        cashPrice: p.cashPrice,
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
  const duplicate = cars.find(
    (car) =>
      (p.vin && car.vin === p.vin) ||
      car.listings?.some(
        (l: any) => normalize(l.url) === normalize(p.finalUrl),
      ) ||
      ((!p.vin || !car.vin || p.vin === car.vin) &&
        car.year === p.year &&
        car.mileage === p.mileage &&
        car.price === p.price &&
        car.location === (p.location || "Do uzupełnienia") &&
        descriptionSimilarity(car.description, p.description) >= 0.65),
  );
  const listing = {
    source,
    url: p.finalUrl,
    price: p.price,
    year: p.year,
    mileage: p.mileage,
    power: p.power,
    cashPrice: p.cashPrice,
    active: true,
    checkedAt: new Date().toISOString(),
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
  };
  if (!duplicate) {
    const car = toCar(p, source, snapshotId);
    cars.push(car);
    return car.id;
  }
  const old = duplicate.listings.find(
    (l: any) => normalize(l.url) === normalize(p.finalUrl),
  );
  if (old) Object.assign(old, listing);
  else duplicate.listings.push(listing);
  duplicate.price = Math.min(
    ...duplicate.listings.filter((l: any) => l.active).map((l: any) => l.price),
  );
  duplicate.cashPrice = Math.min(
    ...duplicate.listings
      .filter((item: any) => item.active)
      .map((item: any) => item.cashPrice || item.price),
  );
  duplicate.verifiedAt = listing.checkedAt;
  duplicate.title = p.title || duplicate.title;
  if (p.trim) duplicate.trim = p.trim;
  if (p.location) {
    duplicate.location = p.location;
    duplicate.distance = distanceFromPoznan(p.location);
  }
  if (p.seller) duplicate.seller = p.seller;
  duplicate.vin ||= p.vin;
  const activeListings = duplicate.listings.filter((item: any) => item.active);
  duplicate.year = Math.max(
    ...activeListings.map((item: any) => item.year || 0),
  );
  duplicate.mileage = Math.max(
    ...activeListings.map((item: any) => item.mileage || 0),
  );
  duplicate.power = Math.max(
    ...activeListings.map((item: any) => item.power || 0),
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
  duplicate.description = p.description || duplicate.description;
  duplicate.images = [
    ...new Set([...(duplicate.images || []), ...p.images]),
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
      status.discovered = status.verified = status.rejected = 0;
      try {
        const candidates = await adapter.discover();
        status.discovered = candidates.length;
        status.pagesScanned = adapter.pagesScanned;
        const db = await load();
        for (const snapshot of db.snapshots || [])
          if (snapshot.source === adapter.name) snapshot.active = false;
        const activeCandidateUrls = new Set(
          candidates.map((candidate) => normalize(candidate.url)),
        );
        db.jobs = db.jobs.filter(
          (job) =>
            job.source !== adapter.name ||
            activeCandidateUrls.has(normalize(job.url)),
        );
        for (const car of db.cars as any[]) {
          for (const listing of car.listings || []) {
            if (listing.source === adapter.name) listing.active = false;
          }
        }
        const candidateLimit = Number(process.env.SCAN_CANDIDATE_LIMIT || 300);
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
        db.cars = (db.cars as any[]).filter((car) =>
          car.listings?.some((listing: any) => listing.active),
        );
        await save(db);
        status.lastSuccess = new Date().toISOString();
      } catch (error) {
        status.errors.push(
          error instanceof Error ? error.message : "Błąd źródła",
        );
      }
    }
    if (!sourceId)
      await notifyNewTopFive().catch((error) =>
        console.error("Notification failed:", error),
      );
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
    await save(db);
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
    await save(db);
    return { snapshots: snapshots.length, processed, accepted, errors };
  } finally {
    activeScan = undefined;
  }
}
const normalize = (value: string) => {
  const u = new URL(value);
  return u.origin + u.pathname.replace(/\/$/, "");
};
