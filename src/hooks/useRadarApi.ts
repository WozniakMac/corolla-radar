import { useCallback, useEffect, useState } from "react";
import type {
  Car,
  CodexJob,
  FilterState,
  MonitoringStats,
  PurchaseAnalysisResponse,
} from "../types";
import { normalizeFilters } from "../filters";

export function useRadarApi() {
  const [cars, setCars] = useState<Car[]>([]);
  const [sources, setSources] = useState<
    Array<{
      id: string;
      name: string;
      lastRun?: string;
      discovered: number;
      verified: number;
      rejected: number;
      pagesScanned?: number;
      errors: string[];
    }>
  >([]);
  const [scanning, setScanning] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [savedFilters, setSavedFilters] = useState<FilterState | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [codexJobs, setCodexJobs] = useState<CodexJob[]>([]);
  const [currentCodexJobId, setCurrentCodexJobId] = useState<string | null>(
    null,
  );
  const [codexAuthConfigured, setCodexAuthConfigured] = useState(false);
  const [purchaseAnalysis, setPurchaseAnalysis] =
    useState<PurchaseAnalysisResponse | null>(null);
  const [purchaseAnalysisError, setPurchaseAnalysisError] = useState<
    string | null
  >(null);
  const [analyzingPurchase, setAnalyzingPurchase] = useState(false);
  const [monitoringStats, setMonitoringStats] = useState<MonitoringStats>({
    scheduled: false,
    intervalMinutes: 240,
    runs: [],
  });

  const refresh = useCallback(async (full = false) => {
    try {
      const request = async (url: string) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        return response.json();
      };
      const status = await request("/api/status");
      setSources(status.sources);
      setCodexJobs(status.codex.jobs);
      setCurrentCodexJobId(status.codex.currentJobId);
      setCodexAuthConfigured(Boolean(status.codex.authConfigured));
      setMonitoringStats(status.stats);
      setScanning(Boolean(status.stats.activeScan));
      if (full) {
        const [stored, preferences] = await Promise.all([
          request("/api/cars"),
          request("/api/preferences/filters"),
        ]);
        setCars(stored as Car[]);
        setSavedFilters(
          preferences.filters ? normalizeFilters(preferences.filters) : null,
        );
        setPreferencesLoaded(true);
      }
    } catch {
      // Static production preview can work without the API.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
    const statusTimer = window.setInterval(() => void refresh(false), 5_000);
    const dataTimer = window.setInterval(() => void refresh(true), 60_000);
    return () => {
      window.clearInterval(statusTimer);
      window.clearInterval(dataTimer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const runScan = async () => {
    setScanning(true);
    try {
      const response = await fetch("/api/sources/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await refresh(false);
      setNotice({ type: "success", text: "Skan został uruchomiony." });
    } catch (error) {
      setScanning(false);
      console.error("Nie udało się uruchomić skanu:", error);
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się uruchomić skanu.",
      });
    }
  };

  const saveFilters = async (filters: FilterState) => {
    try {
      const response = await fetch("/api/preferences/filters", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(filters),
      });
      if (!response.ok) throw new Error("Nie udało się zapisać filtrów");
      setSavedFilters(normalizeFilters(filters));
      setNotice({
        type: "success",
        text: "Filtry zapisane — będą używane w powiadomieniach i kolejce CEPiK.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się zapisać filtrów.",
      });
    }
  };

  const resetFilters = async () => {
    try {
      const response = await fetch("/api/preferences/filters", {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Nie udało się zresetować filtrów");
      setSavedFilters(null);
      setNotice({
        type: "success",
        text: "Pamięć filtrów została wyczyszczona.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się zresetować filtrów.",
      });
    }
  };

  const processCodex = async (id: string, force = false) => {
    try {
      const response = await fetch(`/api/codex/jobs/${id}/process`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Błąd kolejki OpenAI");
      await refresh(true);
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się uruchomić OpenAI.",
      });
    }
  };

  const processAllCodex = async () => {
    try {
      const response = await fetch("/api/codex/jobs/process-all", {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Błąd kolejki OpenAI");
      await refresh(true);
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się uruchomić OpenAI.",
      });
    }
  };

  const processCepik = async (id: string) => {
    try {
      const response = await fetch(
        `/api/cars/${encodeURIComponent(id)}/cepik`,
        {
          method: "POST",
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Błąd kolejki CEPiK");
      await refresh(true);
      setNotice({
        type: "success",
        text: "Oferta została dodana do kolejki CEPiK.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się uruchomić CEPiK.",
      });
    }
  };

  const reprocessSnapshots = async () => {
    setReprocessing(true);
    try {
      const response = await fetch("/api/snapshots/reprocess", {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await refresh(true);
      return body;
    } finally {
      setReprocessing(false);
    }
  };

  const analyzePurchase = async (filters: FilterState) => {
    setAnalyzingPurchase(true);
    setPurchaseAnalysisError(null);
    try {
      const response = await fetch("/api/purchase-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filters }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Nie udało się przeanalizować TOP 10");
      setPurchaseAnalysis(body as PurchaseAnalysisResponse);
    } catch (error) {
      setPurchaseAnalysisError(
        error instanceof Error
          ? error.message
          : "Nie udało się przeanalizować TOP 10",
      );
    } finally {
      setAnalyzingPurchase(false);
    }
  };

  return {
    cars,
    ready,
    notice,
    sources,
    scanning,
    runScan,
    codexJobs,
    currentCodexJobId,
    codexAuthConfigured,
    processCodex,
    processAllCodex,
    processCepik,
    monitoringStats,
    reprocessing,
    reprocessSnapshots,
    savedFilters,
    preferencesLoaded,
    saveFilters,
    resetFilters,
    purchaseAnalysis,
    purchaseAnalysisError,
    analyzingPurchase,
    analyzePurchase,
  };
}
