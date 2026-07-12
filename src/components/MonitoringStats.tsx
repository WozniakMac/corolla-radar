import {
  Activity,
  Clock3,
  Database,
  RefreshCw,
  ScanSearch,
} from "lucide-react";
import type { MonitoringStats as Stats } from "../types";
import { useState } from "react";

const date = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date(value))
    : "—";
const duration = (ms: number) => `${Math.round(ms / 1000)} s`;
const trigger = { manual: "Ręczny", automatic: "Automatyczny", cli: "CLI" };

function RawCepikData({ id }: { id: string }) {
  const [raw, setRaw] = useState<unknown>();
  const [loading, setLoading] = useState(false);
  return (
    <details
      className="rawData"
      onToggle={(event) => {
        if (!event.currentTarget.open || raw !== undefined || loading) return;
        setLoading(true);
        void fetch(`/api/cepik/runs/${id}/raw`)
          .then((response) => response.json())
          .then(setRaw)
          .finally(() => setLoading(false));
      }}
    >
      <summary>Raw JSON</summary>
      <pre>
        {loading
          ? "Pobieranie…"
          : raw === undefined
            ? "Brak danych"
            : JSON.stringify(raw, null, 2)}
      </pre>
    </details>
  );
}

export function MonitoringStats({
  stats,
  reprocessing,
  onReprocess,
}: {
  stats: Stats;
  reprocessing: boolean;
  onReprocess: () => void;
}) {
  const manual = stats.runs.filter((run) => run.trigger === "manual");
  const automatic = stats.runs.filter((run) => run.trigger === "automatic");
  const totalVerified = stats.runs.reduce((sum, run) => sum + run.verified, 0);
  const successRate = stats.runs.reduce((sum, run) => sum + run.discovered, 0)
    ? Math.round(
        (totalVerified /
          stats.runs.reduce((sum, run) => sum + run.discovered, 0)) *
          100,
      )
    : 0;
  const lastAutomatic = automatic[0];
  const nextAutomatic =
    stats.scheduled && lastAutomatic
      ? new Date(
          new Date(lastAutomatic.finishedAt).getTime() +
            stats.intervalMinutes * 60_000,
        ).toISOString()
      : undefined;
  const activeTrigger = stats.activeScan
    ? trigger[stats.activeScan.trigger]
    : undefined;
  const cepikRuns = stats.cepikRuns || [];
  const cepikSuccess = cepikRuns.filter(
    (run) => run.outcome === "success",
  ).length;

  return (
    <>
      {stats.activeScan && (
        <section className="activeScanNotice">
          <RefreshCw className="spinning" />
          <div>
            <strong>{activeTrigger} skan jest w toku</strong>
            <span>
              Uruchomiono {date(stats.activeScan.startedAt)} · wyniki i wpis w
              historii pojawią się po zakończeniu
            </span>
          </div>
        </section>
      )}
      <section className="monitorSummary">
        <div>
          <Activity />
          <small>MONITORING</small>
          <strong>{stats.scheduled ? "Aktywny" : "Wyłączony"}</strong>
          <em>co {stats.intervalMinutes / 60} godz.</em>
        </div>
        <div>
          <ScanSearch />
          <small>SKANY RĘCZNE</small>
          <strong>{manual.length}</strong>
          <em>ostatni: {date(manual[0]?.finishedAt)}</em>
        </div>
        <div>
          <Clock3 />
          <small>SKANY AUTOMATYCZNE</small>
          <strong>{automatic.length}</strong>
          <em>następny: {date(nextAutomatic)}</em>
        </div>
        <div>
          <Database />
          <small>ZWERYFIKOWANE</small>
          <strong>{totalVerified}</strong>
          <em>{successRate}% odkrytych ofert</em>
        </div>
      </section>
      <section className="scanHistory">
        <div className="scanHistoryHead">
          <div>
            <h2>Historia skanowań</h2>
            <span>
              {stats.snapshots || 0} snapshotów pełnych stron ·{" "}
              {Math.round((stats.snapshotBytes || 0) / 1024 / 1024)} MB przed
              kompresją
            </span>
          </div>
          <button
            className="reprocessButton"
            onClick={onReprocess}
            disabled={reprocessing || !stats.snapshots}
          >
            <RefreshCw className={reprocessing ? "spinning" : ""} />
            {reprocessing ? "Przeliczanie…" : "Przelicz zapisane dane"}
          </button>
        </div>
        {stats.runs.length ? (
          <div className="scanTableWrap">
            <table>
              <thead>
                <tr>
                  <th>Typ</th>
                  <th>Źródło</th>
                  <th>Zakończono</th>
                  <th>Czas</th>
                  <th>Odkryte</th>
                  <th>Dodane / aktywne</th>
                  <th>Odrzucone</th>
                  <th>Błędy</th>
                </tr>
              </thead>
              <tbody>
                {stats.runs.slice(0, 100).map((run) => (
                  <tr key={run.id}>
                    <td>
                      <span className={`runType ${run.trigger}`}>
                        {trigger[run.trigger]}
                      </span>
                    </td>
                    <td>{run.source || "Wszystkie"}</td>
                    <td>{date(run.finishedAt)}</td>
                    <td>{duration(run.durationMs)}</td>
                    <td>{run.discovered}</td>
                    <td>{run.verified}</td>
                    <td>{run.rejected}</td>
                    <td className={run.errors ? "errorCount" : ""}>
                      {run.errors}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="emptyStats">
            Historia zacznie się zapisywać po następnym skanowaniu.
          </div>
        )}
      </section>
      <section className="scanHistory cepikHistory">
        <div className="scanHistoryHead">
          <div>
            <h2>Zapytania Historia Pojazdu / CEPiK</h2>
            <span>
              {cepikRuns.length} prób · {cepikSuccess} sukcesów ·{" "}
              {cepikRuns.length - cepikSuccess} ostrzeżeń lub błędów
            </span>
          </div>
        </div>
        {cepikRuns.length ? (
          <div className="scanTableWrap">
            <table>
              <thead>
                <tr>
                  <th>Wynik</th>
                  <th>Zakończono</th>
                  <th>Oferta</th>
                  <th>Rejestracja</th>
                  <th>VIN</th>
                  <th>Czas</th>
                  <th>Dane surowe</th>
                </tr>
              </thead>
              <tbody>
                {cepikRuns.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <span className={`cepikOutcome ${run.outcome}`}>
                        {run.outcome === "success"
                          ? "Sukces"
                          : run.outcome === "warning"
                            ? "Ostrzeżenie"
                            : "Błąd"}
                      </span>
                      {run.error && <small>{run.error}</small>}
                    </td>
                    <td>{date(run.finishedAt)}</td>
                    <td>
                      {run.offerUrl ? (
                        <a href={run.offerUrl} target="_blank" rel="noreferrer">
                          Otwórz
                        </a>
                      ) : (
                        run.carId
                      )}
                    </td>
                    <td>{run.registrationNumber}</td>
                    <td className="mono">{run.vin}</td>
                    <td>{duration(run.durationMs)}</td>
                    <td>
                      <RawCepikData id={run.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="emptyStats">
            Historia pojawi się po pierwszym zapytaniu CEPiK.
          </div>
        )}
      </section>
    </>
  );
}
