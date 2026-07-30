import { useCallback, useEffect, useState } from "react";
import type {
  Car,
  CodexJob,
  FilterState,
  MonitoringStats,
  PurchaseAnalysisRecord,
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
    useState<PurchaseAnalysisRecord | null>(null);
  const [purchaseAnalyses, setPurchaseAnalyses] = useState<
    PurchaseAnalysisRecord[]
  >([]);
  const [purchaseAnalysisError, setPurchaseAnalysisError] = useState<
    string | null
  >(null);
  const [analyzingPurchase, setAnalyzingPurchase] = useState(false);
  const [techOverrideSaving, setTechOverrideSaving] = useState<string | null>(
    null,
  );
  const [communicationSaving, setCommunicationSaving] = useState<string | null>(
    null,
  );
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
        const [stored, preferences, history] = await Promise.all([
          request("/api/cars"),
          request("/api/preferences/filters"),
          request("/api/purchase-analyses"),
        ]);
        setCars(stored as Car[]);
        setSavedFilters(
          preferences.filters ? normalizeFilters(preferences.filters) : null,
        );
        setPreferencesLoaded(true);
        const analyses = history.analyses as PurchaseAnalysisRecord[];
        setPurchaseAnalyses(analyses);
        setPurchaseAnalysis((current) => current || analyses[0] || null);
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

  const updateTechOverride = async (
    id: string,
    override: Car["techOverride"] | null,
  ) => {
    setTechOverrideSaving(id);
    try {
      const response = await fetch(`/api/cars/${encodeURIComponent(id)}/tech`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ override }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Nie udało się zapisać decyzji Tech");
      const updated = body.car as Car;
      setCars((current) =>
        current.map((car) => (car.id === updated.id ? updated : car)),
      );
      setNotice({
        type: "success",
        text:
          override === "confirmed"
            ? "Tech potwierdzony."
            : override === "excluded"
              ? "Tech wykluczony."
              : "Przywrócono automatyczne wykrywanie Tech.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się zapisać decyzji Tech.",
      });
    } finally {
      setTechOverrideSaving(null);
    }
  };

  const updateCommunication = async (
    id: string,
    update: {
      status?: NonNullable<Car["communication"]>["status"];
      note?: string;
    },
  ) => {
    setCommunicationSaving(id);
    try {
      const response = await fetch(
        `/api/cars/${encodeURIComponent(id)}/communication`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(update),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Nie udało się zapisać statusu i uwag");
      setCars((current) =>
        current.map((car) =>
          car.id === id ? { ...car, communication: body.communication } : car,
        ),
      );
      setNotice({
        type: "success",
        text: "Status i uwagi zostały zapisane.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się zapisać statusu i uwag.",
      });
    } finally {
      setCommunicationSaving(null);
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
      const record = body as PurchaseAnalysisRecord;
      setPurchaseAnalysis(record);
      setPurchaseAnalyses((current) => [
        record,
        ...current.filter((item) => item.id !== record.id),
      ]);
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

  const selectPurchaseAnalysis = (id: string) => {
    setPurchaseAnalysis(
      purchaseAnalyses.find((analysis) => analysis.id === id) || null,
    );
    setPurchaseAnalysisError(null);
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
    communicationSaving,
    updateCommunication,
    techOverrideSaving,
    updateTechOverride,
    monitoringStats,
    reprocessing,
    reprocessSnapshots,
    savedFilters,
    preferencesLoaded,
    saveFilters,
    resetFilters,
    purchaseAnalysis,
    purchaseAnalyses,
    purchaseAnalysisError,
    analyzingPurchase,
    analyzePurchase,
    selectPurchaseAnalysis,
  };
}
