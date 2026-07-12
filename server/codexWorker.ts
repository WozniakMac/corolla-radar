import { parseWithCodex } from "./codexFallback";
import { calculateCodexPotential } from "./codexPotential";
import { isDecisionMissing, missingListingFields } from "./codexMissing";
import { fetchAndParse } from "./parser";
import { upsertParsedCar } from "./pipeline";
import { load, save, type Job } from "./store";

let workerRunning = false;
let currentJobId: string | null = null;

export const publicJobs = async () => {
  const store = await load();
  const jobs = store.jobs
    .map((job) => ({
      ...job,
      missing: job.missing.filter((field) => field !== "1.8 Hybrid"),
    }))
    .filter(
      (job) =>
        job.status === "processed" ||
        job.status === "processing" ||
        isDecisionMissing(job.missing),
    );
  const order = { processing: 0, pending: 1, failed: 2, processed: 3 };
  return jobs
    .map((job) => ({ ...job, ...calculateCodexPotential(job) }))
    .sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        b.potentialScore - a.potentialScore,
    )
    .map(({ input: _input, ...job }) => job);
};

export const workerState = () => ({ workerRunning, currentJobId });

export async function recoverInterruptedJobs() {
  const db = await load();
  let changed = false;
  for (const job of db.jobs) {
    const beforeMissing = job.missing.length;
    job.missing = job.missing.filter((field) => field !== "1.8 Hybrid");
    changed ||= job.missing.length !== beforeMissing;
  }
  const before = db.jobs.length;
  db.jobs = db.jobs.filter(
    (job) =>
      job.status === "processed" ||
      job.status === "processing" ||
      isDecisionMissing(job.missing),
  );
  changed ||= db.jobs.length !== before;
  for (const job of db.jobs) {
    if (job.status === "processing") {
      job.status = "pending";
      job.error = "Przetwarzanie przerwane przez restart serwera";
      changed = true;
    }
  }
  if (changed) await save(db);
}

export async function queueOne(id: string, force = false) {
  const db = await load();
  const job = db.jobs.find((item) => item.id === id);
  if (!job) throw new Error("Nie znaleziono zadania Codex");
  if (job.status === "processing") return;
  if (job.status === "processed" && !force)
    throw new Error("Oferta była już przetworzona; wymagane jest ponowienie");
  Object.assign(job, {
    status: "pending",
    error: undefined,
    startedAt: undefined,
    finishedAt: undefined,
  } satisfies Partial<Job>);
  await save(db);
  void runWorker([id]);
}

export async function queueAllPending() {
  const db = await load();
  let count = 0;
  for (const job of db.jobs) {
    if (job.status === "failed") {
      job.status = "pending";
      job.error = undefined;
      count++;
    } else if (job.status === "pending") count++;
  }
  await save(db);
  if (count) void runWorker();
  return count;
}

async function runWorker(onlyJobIds?: string[]) {
  if (workerRunning) return;
  workerRunning = true;
  try {
    while (true) {
      let db = await load();
      const job = db.jobs
        .filter(
          (item) =>
            item.status === "pending" &&
            (!onlyJobIds || onlyJobIds.includes(item.id)),
        )
        .sort(
          (a, b) =>
            calculateCodexPotential(b).potentialScore -
            calculateCodexPotential(a).potentialScore,
        )[0];
      if (!job) break;
      currentJobId = job.id;
      job.status = "processing";
      job.startedAt = new Date().toISOString();
      await save(db);
      try {
        const p = await fetchAndParse(job.url);
        const ai = await parseWithCodex(p.text, true);
        if (!ai)
          throw new Error("Codex nie zwrócił wyniku o pewności min. 80%");
        p.price ||= ai.price || 0;
        p.mileage ||= ai.mileage || 0;
        p.year ||= ai.year || 0;
        p.power ||= ai.power || 0;
        p.camera ||= ai.camera === true;
        p.parkingSensors ||= ai.parkingSensors === true;
        p.ecvt ||= ai.ecvt === true;
        p.hybrid ||= ai.hybrid === true;
        p.eligibleBody ||= /touring sports|kombi/i.test(ai.body || "");
        p.vin ||= ai.vin || undefined;
        p.location ||= ai.location || undefined;
        p.trim ||= ai.trim || undefined;
        p.seller ||= ai.seller || undefined;
        db = await load();
        const freshJob = db.jobs.find((item) => item.id === job.id)!;
        freshJob.input = p;
        freshJob.status = "processed";
        freshJob.finishedAt = new Date().toISOString();
        freshJob.missing = missingListingFields(p);
        if (p.active && p.eligibleBody && p.price && p.year && p.mileage)
          freshJob.carId = upsertParsedCar(db, p, freshJob.source);
        await save(db);
      } catch (error) {
        db = await load();
        const failed = db.jobs.find((item) => item.id === job.id);
        if (failed) {
          failed.status = "failed";
          failed.finishedAt = new Date().toISOString();
          failed.error = error instanceof Error ? error.message : "Błąd Codex";
          await save(db);
        }
      }
    }
  } finally {
    currentJobId = null;
    workerRunning = false;
  }
}
