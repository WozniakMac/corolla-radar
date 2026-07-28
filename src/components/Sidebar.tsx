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
          aria-label="Ranking"
          className={view === "ranking" ? "active" : ""}
          onClick={() => onView("ranking")}
        >
          <CarFront />
          <span className="navLabel navLabelDesktop">Ranking</span>
          <span className="navLabel navLabelMobile" aria-hidden="true">
            Ranking
          </span>
          <span className="navCount">{rankedCount}</span>
        </button>
        <button
          aria-label="Leasing"
          className={view === "leasing" ? "active" : ""}
          onClick={() => onView("leasing")}
        >
          <Calculator />
          <span className="navLabel navLabelDesktop">Leasing</span>
          <span className="navLabel navLabelMobile" aria-hidden="true">
            Leasing
          </span>
        </button>
        <button
          aria-label="Doradca TOP 10"
          className={view === "advisor" ? "active" : ""}
          onClick={() => onView("advisor")}
        >
          <ListChecks />
          <span className="navLabel navLabelDesktop">Doradca TOP 10</span>
          <span className="navLabel navLabelMobile" aria-hidden="true">
            Doradca
          </span>
        </button>
        <button
          aria-label="Statystyki"
          className={view === "stats" ? "active" : ""}
          onClick={() => onView("stats")}
        >
          <BarChart3 />
          <span className="navLabel navLabelDesktop">Statystyki</span>
          <span className="navLabel navLabelMobile" aria-hidden="true">
            Statystyki
          </span>
        </button>
        <button
          aria-label="Weryfikacja OpenAI"
          className={view === "codex" ? "active" : ""}
          onClick={() => onView("codex")}
        >
          <Bot />
          <span className="navLabel navLabelDesktop">Weryfikacja OpenAI</span>
          <span className="navLabel navLabelMobile" aria-hidden="true">
            OpenAI
          </span>
          <span className="navCount">{codexPending}</span>
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
