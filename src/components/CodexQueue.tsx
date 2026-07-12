import { Bot, Play, RefreshCw } from "lucide-react";
import type { CodexJob } from "../types";

const labels = {
  pending: "Do przetworzenia",
  processing: "Przetwarzanie",
  processed: "Przetworzono",
  failed: "Błąd",
} as const;

export function CodexQueue({
  jobs,
  currentJobId,
  onProcess,
  onProcessAll,
}: {
  jobs: CodexJob[];
  currentJobId: string | null;
  onProcess: (id: string, force: boolean) => void;
  onProcessAll: () => void;
}) {
  const pending = jobs.filter((job) =>
    ["pending", "failed"].includes(job.status),
  ).length;
  return (
    <section className="codexQueue">
      <div className="codexQueueHead">
        <div>
          <h2>
            <Bot /> Weryfikacja Codex
          </h2>
          <p>Codex nie uruchamia się automatycznie. W kolejce: {pending}.</p>
          <p className="potentialHint">
            Kolejność: potencjał auta + wartość braków. Zielone warto sprawdzić,
            szare zwykle lepiej pominąć.
          </p>
        </div>
        <button disabled={!pending || !!currentJobId} onClick={onProcessAll}>
          <Play /> Przetwórz wszystkie wymagające
        </button>
      </div>
      {jobs.length > 0 && (
        <div className="codexJobs">
          {jobs.map((job) => (
            <div className={`codexJob ${job.status}`} key={job.id}>
              <div
                className={`potentialScore ${job.potentialScore >= 70 ? "high" : job.potentialScore >= 50 ? "medium" : "low"}`}
              >
                <strong>{job.potentialScore}</strong>
                <small>
                  {job.potentialScore >= 70
                    ? "WARTO"
                    : job.potentialScore >= 50
                      ? "ROZWAŻ"
                      : "POMIŃ"}
                </small>
              </div>
              <div>
                <span>{labels[job.status]}</span>
                <a href={job.url} target="_blank" rel="noreferrer">
                  {job.title || job.url}
                </a>
                <small>
                  {job.source} · Braki:{" "}
                  {job.missing.join(", ") || "uzupełniono"}
                </small>
                <small className="potentialReasons">
                  {job.potentialReasons.join(" · ") ||
                    "Za mało danych do mocnej oceny"}
                </small>
                {job.error && <small className="jobError">{job.error}</small>}
              </div>
              <button
                disabled={
                  job.status === "processing" ||
                  (!!currentJobId && currentJobId !== job.id)
                }
                onClick={() => onProcess(job.id, job.status === "processed")}
              >
                {job.status === "processed" ? <RefreshCw /> : <Play />}
                {job.status === "processed"
                  ? "Przetwórz ponownie"
                  : "Przetwórz"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
