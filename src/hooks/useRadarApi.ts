import { useCallback, useEffect, useState } from "react";
import type { Car, CodexJob, MonitoringStats } from "../types";

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
  const [reprocessing, setReprocessing] = useState(false);
  const [codexJobs, setCodexJobs] = useState<CodexJob[]>([]);
  const [currentCodexJobId, setCurrentCodexJobId] = useState<string | null>(
    null,
  );
  const [monitoringStats, setMonitoringStats] = useState<MonitoringStats>({
    scheduled: false,
    intervalMinutes: 240,
    runs: [],
  });

  const refresh = useCallback(async () => {
    try {
      const [stored, sourceState, codexState, statsState] = await Promise.all([
        fetch("/api/cars").then((response) => response.json()),
        fetch("/api/sources").then((response) => response.json()),
        fetch("/api/codex/jobs").then((response) => response.json()),
        fetch("/api/stats").then((response) => response.json()),
      ]);
      setCars(stored as Car[]);
      setSources(sourceState);
      setCodexJobs(codexState.jobs);
      setCurrentCodexJobId(codexState.currentJobId);
      setMonitoringStats(statsState);
    } catch {
      // Static production preview can work without the API.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

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
      setSources(body);
      await refresh();
    } finally {
      setScanning(false);
    }
  };

  const processCodex = async (id: string, force = false) => {
    await fetch(`/api/codex/jobs/${id}/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force }),
    });
    await refresh();
  };

  const processAllCodex = async () => {
    await fetch("/api/codex/jobs/process-all", { method: "POST" });
    await refresh();
  };

  const reprocessSnapshots = async () => {
    setReprocessing(true);
    try {
      const response = await fetch("/api/snapshots/reprocess", {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await refresh();
      return body;
    } finally {
      setReprocessing(false);
    }
  };

  return {
    cars,
    sources,
    scanning,
    runScan,
    codexJobs,
    currentCodexJobId,
    processCodex,
    processAllCodex,
    monitoringStats,
    reprocessing,
    reprocessSnapshots,
  };
}
