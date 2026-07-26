import express from "express";
import { resolve } from "node:path";
import {
  getActiveScan,
  getStatuses,
  reprocessSavedSnapshots,
  runSources,
} from "./pipeline";
import { load } from "./store";
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
import {
  basicAuth,
  limitMutations,
  rejectCrossSiteMutations,
} from "./security";

const config = loadServerConfig();
const app = express();
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
app.use(express.json({ limit: "32kb" }));
app.use(basicAuth(config.username, config.password));
app.use(rejectCrossSiteMutations);
app.use(limitMutations());
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, node: process.version }),
);
app.get("/api/cars", async (_req, res) => res.json((await load()).cars));
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
      error: error instanceof Error ? error.message : "Błąd konfiguracji Codex",
    });
  }
});
app.post("/api/codex/jobs/:id/process", async (req, res) => {
  try {
    await queueOne(req.params.id, req.body?.force === true);
    res.status(202).json({ queued: true });
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : "Błąd kolejki Codex",
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
