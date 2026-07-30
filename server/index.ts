import express from "express";
import { resolve } from "node:path";
import {
  getActiveScan,
  getStatuses,
  reprocessSavedSnapshots,
  runSources,
} from "./pipeline";
import { load, save } from "./store";
import { loadSavedFilters, resetFilters, saveFilters } from "./preferences";
import {
  publicJobs,
  queueAllPending,
  queueOne,
  recoverInterruptedJobs,
  workerState,
} from "./codexWorker";
import { retryCepik, startCepikWorker } from "./cepikWorker";
import { loadServerConfig } from "./config";
import { limitMutations, rejectCrossSiteMutations } from "./security";
import {
  analyzeTopTenPurchase,
  publicPurchaseCandidates,
  rankTopTenForPurchase,
} from "./purchaseAnalysis";
import type { Car } from "../src/types";
import { preparePurchaseEvidence } from "./purchaseEvidence";
import {
  purchaseAnalysisHistory,
  savePurchaseAnalysis,
} from "./purchaseHistory";
import { applyTechOverride, type TechOverride } from "./techOverride";
import {
  applyCommunicationUpdate,
  CommunicationValidationError,
  emptyCommunication,
} from "./communication";
import { findCarByListingUrl } from "./listingLookup";

const config = loadServerConfig();
const app = express();
let purchaseAnalysisRunning = false;
app.disable("x-powered-by");
void recoverInterruptedJobs().catch(console.error);
startCepikWorker();
app.use((_req, res, next) => {
  res.set({
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data: https:; style-src 'self'; " +
      "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use(rejectCrossSiteMutations);
app.use(limitMutations());
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, node: process.version }),
);
app.get("/api/cars", async (_req, res) => res.json((await load()).cars));
app.get("/api/cars/resolve", async (req, res) => {
  if (typeof req.query.url !== "string" || !req.query.url)
    return res.status(400).json({ error: "Brak parametru url" });
  try {
    const result = findCarByListingUrl(
      (await load()).cars as Car[],
      req.query.url,
    );
    if (!result)
      return res
        .status(404)
        .json({ error: "Nie znaleziono auta dla tego URL" });
    res.json({
      carId: result.car.id,
      matchedUrl: result.listing.url,
      source: result.listing.source,
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Nieprawidłowy URL",
    });
  }
});
app.get("/api/cars/:id/communication", async (req, res) => {
  const car = ((await load()).cars as Car[]).find(
    (item) => item.id === req.params.id,
  );
  if (!car) return res.status(404).json({ error: "Nie znaleziono auta" });
  res.json({
    carId: car.id,
    communication: car.communication || emptyCommunication(),
  });
});
app.patch("/api/cars/:id/communication", async (req, res) => {
  try {
    const store = await load();
    const car = applyCommunicationUpdate(store, req.params.id, req.body);
    if (!car) return res.status(404).json({ error: "Nie znaleziono auta" });
    await save(store);
    res.json({ carId: car.id, communication: car.communication });
  } catch (error) {
    if (error instanceof CommunicationValidationError)
      return res.status(400).json({ error: error.message });
    res.status(409).json({
      error:
        error instanceof Error
          ? error.message
          : "Nie udało się zapisać komunikacji",
    });
  }
});
app.get("/api/sources", (_req, res) => res.json(getStatuses()));
app.get("/api/preferences/filters", async (_req, res) =>
  res.json({ filters: await loadSavedFilters() }),
);
app.put("/api/preferences/filters", async (req, res) => {
  res.json({ filters: await saveFilters(req.body) });
});
app.delete("/api/preferences/filters", async (_req, res) => {
  await resetFilters();
  res.json({ filters: null });
});
app.get("/api/stats", async (_req, res) => {
  const store = await load();
  res.json({
    scheduled: process.env.ENABLE_SCHEDULED_SCAN === "true",
    intervalMinutes: config.scanIntervalMinutes,
    activeScan: getActiveScan(),
    runs: [...(store.scanRuns || [])].reverse(),
    cepikRuns: [...(store.cepikRuns || [])]
      .reverse()
      .map(({ rawData: _rawData, ...run }) => run),
    snapshots: store.snapshots?.length || 0,
    snapshotBytes: (store.snapshots || []).reduce(
      (sum, snapshot) => sum + snapshot.bytes,
      0,
    ),
  });
});
app.get("/api/status", async (_req, res) => {
  const store = await load();
  res.json({
    sources: getStatuses(),
    codex: { jobs: await publicJobs(store), ...workerState() },
    stats: {
      scheduled: process.env.ENABLE_SCHEDULED_SCAN === "true",
      intervalMinutes: config.scanIntervalMinutes,
      activeScan: getActiveScan(),
      runs: [...(store.scanRuns || [])].reverse(),
      cepikRuns: [...(store.cepikRuns || [])]
        .reverse()
        .map(({ rawData: _rawData, ...run }) => run),
      snapshots: store.snapshots?.length || 0,
      snapshotBytes: (store.snapshots || []).reduce(
        (sum, snapshot) => sum + snapshot.bytes,
        0,
      ),
    },
  });
});
app.get("/api/codex/jobs", async (_req, res) =>
  res.json({ jobs: await publicJobs(), ...workerState() }),
);
app.get("/api/cepik/runs/:id/raw", async (req, res) => {
  const run = (await load()).cepikRuns?.find(
    (item) => item.id === req.params.id,
  );
  if (!run) return res.status(404).json({ error: "Nie znaleziono zapytania" });
  res.json(run.rawData);
});
app.post("/api/codex/jobs/process-all", async (_req, res) => {
  try {
    res.status(202).json({ queued: await queueAllPending() });
  } catch (error) {
    res.status(409).json({
      error:
        error instanceof Error ? error.message : "Błąd konfiguracji OpenAI",
    });
  }
});
app.post("/api/codex/jobs/:id/process", async (req, res) => {
  try {
    await queueOne(req.params.id, req.body?.force === true);
    res.status(202).json({ queued: true });
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : "Błąd kolejki OpenAI",
    });
  }
});
app.post("/api/cars/:id/cepik", async (req, res) => {
  try {
    await retryCepik(req.params.id);
    res.status(202).json({ queued: true });
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : "Błąd kolejki CEPiK",
    });
  }
});
app.patch("/api/cars/:id/tech", async (req, res) => {
  const override = req.body?.override as TechOverride;
  if (override !== null && override !== "confirmed" && override !== "excluded")
    return res.status(400).json({ error: "Nieprawidłowa decyzja Tech" });
  try {
    const store = await load();
    const car = applyTechOverride(store, req.params.id, override);
    if (!car) return res.status(404).json({ error: "Nie znaleziono auta" });
    await save(store);
    res.json({ car });
  } catch (error) {
    res.status(409).json({
      error:
        error instanceof Error
          ? error.message
          : "Nie udało się zapisać decyzji Tech",
    });
  }
});
app.post("/api/sources/run", async (req, res) => {
  if (getActiveScan()) return res.status(409).json({ error: "Cykl już trwa" });
  const source = req.body?.source;
  void runSources(source, "manual").catch((error) =>
    console.error("Manual scan failed:", error),
  );
  res.status(202).json({ started: true, activeScan: getActiveScan() });
});
app.post("/api/snapshots/reprocess", async (_req, res) => {
  try {
    res.json(await reprocessSavedSnapshots());
  } catch (error) {
    res.status(409).json({
      error:
        error instanceof Error
          ? error.message
          : "Nie udało się przetworzyć snapshotów",
    });
  }
});
app.get("/api/purchase-analyses", async (_req, res) =>
  res.json({ analyses: await purchaseAnalysisHistory() }),
);
app.post("/api/purchase-analysis", async (req, res) => {
  if (purchaseAnalysisRunning)
    return res.status(409).json({ error: "Analiza TOP 10 już trwa" });
  if (!workerState().authConfigured)
    return res.status(409).json({
      error: "Brak OPENAI_API_KEY. Ustaw klucz jako zmienną ENV kontenera.",
    });
  const store = await load();
  let selection = rankTopTenForPurchase(store.cars as Car[], req.body?.filters);
  if (selection.ranked.length !== 10)
    return res.status(422).json({
      error: `Bieżące filtry dają ${selection.available} kwalifikujących się aut; analiza wymaga dokładnie 10.`,
      available: selection.available,
    });
  purchaseAnalysisRunning = true;
  let evidence: Awaited<ReturnType<typeof preparePurchaseEvidence>> | undefined;
  try {
    const unavailableCarIds = new Set<string>();
    for (let attempt = 0; attempt < 5; attempt++) {
      evidence = await preparePurchaseEvidence(selection.ranked);
      if (!evidence.unavailableCarIds.length) break;
      if (attempt === 4) break;
      for (const carId of evidence.unavailableCarIds)
        unavailableCarIds.add(carId);
      await evidence.cleanup();
      evidence = undefined;
      selection = rankTopTenForPurchase(
        store.cars as Car[],
        req.body?.filters,
        unavailableCarIds,
      );
      if (selection.ranked.length !== 10)
        throw new Error(
          `Po odrzuceniu niedostępnych ogłoszeń zostało ${selection.available} kwalifikujących się aut; potrzeba 10.`,
        );
    }
    if (!evidence)
      throw new Error("Nie udało się przygotować materiałów TOP 10");
    if (evidence.unavailableCarIds.length)
      throw new Error(
        "Zbyt wiele ogłoszeń TOP 10 okazało się niedostępnych. Uruchom skan i spróbuj ponownie.",
      );
    const analysis = await analyzeTopTenPurchase(
      selection.ranked,
      selection.filters,
      evidence.report,
    );
    const response = {
      analysis,
      candidates: publicPurchaseCandidates(selection.ranked),
      filters: selection.filters,
      evidence: evidence.summary,
    };
    res.json(await savePurchaseAnalysis(response));
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Nie udało się wykonać analizy",
    });
  } finally {
    await evidence
      ?.cleanup()
      .catch((error) =>
        console.error("Nie udało się usunąć tymczasowych materiałów:", error),
      );
    purchaseAnalysisRunning = false;
  }
});

app.use(express.static(resolve("dist")));
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api/"))
    return res.sendFile(resolve("dist/index.html"));
  next();
});

app.listen(config.port, config.host, () =>
  console.log(`Corolla Radar http://${config.host}:${config.port}`),
);

if (process.env.ENABLE_SCHEDULED_SCAN === "true") {
  setTimeout(
    () => void runSources(undefined, "automatic").catch(console.error),
    5_000,
  );
  setInterval(
    () => void runSources(undefined, "automatic").catch(console.error),
    config.scanIntervalMinutes * 60_000,
  );
}
