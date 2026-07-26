import { BarChart3, Bot, Calculator, CarFront, ListChecks } from "lucide-react";

export type AppView = "ranking" | "leasing" | "advisor" | "codex" | "stats";

type Props = {
  rankedCount: number;
  onPreset: (preset: "tech2022" | "local" | "vat") => void;
  view: AppView;
  onView: (view: AppView) => void;
  codexPending: number;
  monitoringActive: boolean;
};

export function Sidebar({
  rankedCount,
  onPreset,
  view,
  onView,
  codexPending,
  monitoringActive,
}: Props) {
  return (
    <aside>
      <div className="brand">
        <div className="logo">R</div>
        <div>
          <b>Corolla Radar</b>
          <small>Twój asystent zakupu</small>
        </div>
      </div>
      <nav aria-label="Główna nawigacja">
        <button
          className={view === "ranking" ? "active" : ""}
          onClick={() => onView("ranking")}
        >
          <CarFront /> Ranking <span>{rankedCount}</span>
        </button>
        <button
          className={view === "leasing" ? "active" : ""}
          onClick={() => onView("leasing")}
        >
          <Calculator /> Leasing
        </button>
        <button
          className={view === "advisor" ? "active" : ""}
          onClick={() => onView("advisor")}
        >
          <ListChecks /> Doradca TOP 10
        </button>
        <button
          className={view === "stats" ? "active" : ""}
          onClick={() => onView("stats")}
        >
          <BarChart3 /> Statystyki
        </button>
        <button
          className={view === "codex" ? "active" : ""}
          onClick={() => onView("codex")}
        >
          <Bot /> Weryfikacja OpenAI <span>{codexPending}</span>
        </button>
      </nav>
      <div className="saved">
        <small>ZAPISANE WIDOKI</small>
        <button onClick={() => onPreset("tech2022")}>
          2022 Comfort + Tech
        </button>
        <button onClick={() => onPreset("local")}>Najlepsze lokalne</button>
        <button onClick={() => onPreset("vat")}>FV 23%</button>
      </div>
      <div className="asideFoot">
        <span className={`pulse ${monitoringActive ? "" : "off"}`} /> Monitoring
        automatyczny {monitoringActive ? "aktywny" : "wyłączony"}
        <small>Odświeżanie co 5 sekund</small>
      </div>
    </aside>
  );
}
