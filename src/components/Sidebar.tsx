import { BarChart3, Bot, CarFront } from "lucide-react";

type Props = {
  rankedCount: number;
  onPreset: (preset: "tech2022" | "local" | "vat") => void;
  view: "ranking" | "codex" | "stats";
  onView: (view: "ranking" | "codex" | "stats") => void;
  codexPending: number;
};

export function Sidebar({
  rankedCount,
  onPreset,
  view,
  onView,
  codexPending,
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
          className={view === "stats" ? "active" : ""}
          onClick={() => onView("stats")}
        >
          <BarChart3 /> Statystyki
        </button>
        <button
          className={view === "codex" ? "active" : ""}
          onClick={() => onView("codex")}
        >
          <Bot /> Weryfikacja Codex <span>{codexPending}</span>
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
        <span className="pulse" /> Monitoring aktywny
        <small>Odświeżanie co 5 sekund</small>
      </div>
    </aside>
  );
}
