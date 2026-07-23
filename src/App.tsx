import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, GitCompareArrows } from "lucide-react";
import { CarCard } from "./components/CarCard";
import { CodexQueue } from "./components/CodexQueue";
import { Filters } from "./components/Filters";
import { MonitoringStats } from "./components/MonitoringStats";
import { ComparisonBar, OfferComparison } from "./components/OfferComparison";
import { ScoreDrawer } from "./components/ScoreDrawer";
import { Sidebar } from "./components/Sidebar";
import { SourcePanel } from "./components/SourcePanel";
import { money } from "./format";
import { useRadarApi } from "./hooks/useRadarApi";
import {
  buildMarketBenchmarks,
  effectivePrice,
  qualifyCar,
  scoreCar,
  worthTrip,
} from "./scoring";
import type { Car } from "./types";
import { defaultFilters, engineVersion, matchesFilters } from "./filters";
import { TRIM_VARIANTS, trimVariant } from "./corollaEquipment";
import "./styles.css";

export default function App() {
  const {
    cars,
    ready,
    notice,
    sources,
    scanning,
    runScan,
    codexJobs,
    currentCodexJobId,
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
  } = useRadarApi();
  const [filters, setFilters] = useState(defaultFilters);
  const carIdFromPath = () => {
    const match = window.location.pathname.match(/^\/cars\/(.+)$/);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  };
  const [selectedId, setSelectedId] = useState<string | null>(carIdFromPath);
  const [view, setView] = useState<"ranking" | "codex" | "stats">("ranking");
  const [visibleCount, setVisibleCount] = useState(30);
  const [verificationVisibleCount, setVerificationVisibleCount] = useState(15);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const filtersHydrated = useRef(false);
  useEffect(() => {
    if (!preferencesLoaded || filtersHydrated.current) return;
    filtersHydrated.current = true;
    if (savedFilters) setFilters(savedFilters);
  }, [preferencesLoaded, savedFilters]);
  useEffect(() => {
    const onPopState = () => setSelectedId(carIdFromPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    setVisibleCount(30);
    setVerificationVisibleCount(15);
  }, [filters]);
  useEffect(() => {
    if (!selectedId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      window.history.pushState({}, "", "/");
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedId]);
  useEffect(() => {
    if (!comparisonOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setComparisonOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [comparisonOpen]);
  const selected = cars.find((car) => car.id === selectedId) || null;
  const openCar = (car: Car) => {
    window.history.pushState({}, "", `/cars/${encodeURIComponent(car.id)}`);
    setSelectedId(car.id);
  };
  const closeCar = () => {
    window.history.pushState({}, "", "/");
    setSelectedId(null);
  };
  const market = useMemo(() => buildMarketBenchmarks(cars), [cars]);
  const comparedOffers = comparisonIds
    .map((id) => cars.find((car) => car.id === id))
    .filter((car): car is Car => Boolean(car));
  const toggleComparison = (id: string) => {
    setComparisonIds((current) => {
      if (current.includes(id))
        return current.filter((selectedId) => selectedId !== id);
      if (current.length >= 4) return current;
      return [...current, id];
    });
  };
  const cancelComparison = () => {
    setComparisonMode(false);
    setComparisonOpen(false);
    setComparisonIds([]);
  };

  const evaluated = useMemo(
    () =>
      cars
        .filter(
          (car) =>
            car.body === "Touring Sports" &&
            car.price > 0 &&
            car.year > 0 &&
            car.mileage > 0 &&
            car.listings.some((listing) => listing.active),
        )
        .map((car) => ({ car, score: scoreCar(car, market) }))
        .filter(
          ({ car, score }) =>
            matchesFilters(car, filters) && worthTrip(car, score, market),
        )
        .sort((a, b) => b.score.total - a.score.total),
    [cars, filters, market],
  );
  const ranked = evaluated.filter(
    ({ car }) => qualifyCar(car).status === "qualified",
  );
  const verification = evaluated.filter(
    ({ car }) => qualifyCar(car).status === "verification",
  );

  const applyPreset = (preset: "tech2022" | "local" | "vat") => {
    if (preset === "tech2022")
      setFilters({ ...defaultFilters, year: "2022", tech: true });
    if (preset === "local") setFilters({ ...defaultFilters, maxDistance: 150 });
    if (preset === "vat") setFilters({ ...defaultFilters, vat: true });
  };
  const median = ranked.length
    ? effectivePrice(
        [...ranked].sort(
          (a, b) => effectivePrice(a.car) - effectivePrice(b.car),
        )[Math.floor(ranked.length / 2)].car,
      )
    : 0;
  const listingSources = useMemo(
    () =>
      [
        ...new Set(
          cars.flatMap((car) =>
            car.listings
              .filter((listing) => listing.active)
              .map((listing) => listing.source),
          ),
        ),
      ].sort(),
    [cars],
  );
  const availableTrims = useMemo(() => {
    const present = new Set(cars.map(trimVariant));
    return TRIM_VARIANTS.filter((trim) => present.has(trim));
  }, [cars]);
  const availableEngines = useMemo(
    () =>
      [
        ...new Set(
          cars
            .filter(
              (car) =>
                car.listings.some((listing) => listing.active) &&
                (car.hybrid || [122, 140, 178, 184, 196].includes(car.power)),
            )
            .map(engineVersion),
        ),
      ].sort(),
    [cars],
  );

  return (
    <div className="app">
      <Sidebar
        rankedCount={ranked.length}
        onPreset={(preset) => {
          applyPreset(preset);
          setView("ranking");
        }}
        view={view}
        onView={setView}
        codexPending={
          codexJobs.filter((job) => ["pending", "failed"].includes(job.status))
            .length
        }
        monitoringActive={monitoringStats.scheduled}
      />
      <main>
        <header>
          <div>
            <h1>
              {view === "ranking"
                ? "Ranking ofert"
                : view === "codex"
                  ? "Weryfikacja Codex"
                  : "Statystyki monitoringu"}
            </h1>
            <p>
              {view === "ranking"
                ? "Zweryfikowane Corolle Touring Sports, dopasowane do Twoich kryteriów."
                : view === "codex"
                  ? "Ręczna kolejka uzupełniania brakujących danych w ofertach."
                  : "Historia skanów ręcznych i automatycznego monitoringu ofert."}
            </p>
          </div>
          {view === "ranking" && ready && (
            <button
              type="button"
              className={`comparisonEntry ${comparisonMode ? "active" : ""}`}
              onClick={() => {
                if (comparisonMode) {
                  cancelComparison();
                } else {
                  setComparisonMode(true);
                }
              }}
            >
              <GitCompareArrows />
              {comparisonMode ? "Anuluj porównanie" : "Porównanie"}
              {comparisonIds.length > 0 && <span>{comparisonIds.length}</span>}
            </button>
          )}
        </header>
        {view === "stats" ? (
          <MonitoringStats
            stats={monitoringStats}
            reprocessing={reprocessing}
            onReprocess={() => void reprocessSnapshots()}
          />
        ) : view === "codex" ? (
          <CodexQueue
            jobs={codexJobs}
            currentJobId={currentCodexJobId}
            onProcess={(id, force) => void processCodex(id, force)}
            onProcessAll={() => void processAllCodex()}
          />
        ) : !ready ? (
          <section className="loadingState" aria-live="polite">
            <span className="loadingPulse" />
            <strong>Wczytuję aktualny ranking…</strong>
            <small>
              Pobieram zapisane oferty, filtry i status monitoringu.
            </small>
          </section>
        ) : (
          <>
            <section className="summary">
              <div>
                <small>AKTYWNE OFERTY</small>
                <strong>{ranked.length}</strong>
                <em>z {cars.length} zweryfikowanych</em>
              </div>
              <div>
                <small>NAJLEPSZY WYNIK</small>
                <strong>
                  {ranked[0]?.score.total ?? 0}
                  <i>/100</i>
                </strong>
                <em className="green">Bardzo dobre dopasowanie</em>
              </div>
              <div>
                <small>MEDIANA CENY</small>
                <strong>{money(median)}</strong>
                <em>dla wybranych filtrów</em>
              </div>
              <div>
                <small>NOWE DZISIAJ</small>
                <strong>
                  {
                    cars.filter(
                      (car) =>
                        car.firstSeen === new Date().toISOString().slice(0, 10),
                    ).length
                  }
                </strong>
                <em className="green">Monitoring działa</em>
              </div>
            </section>
            <Filters
              value={filters}
              sources={listingSources}
              trims={availableTrims}
              engines={availableEngines}
              saved={savedFilters !== null}
              dirty={
                savedFilters !== null &&
                JSON.stringify(filters) !== JSON.stringify(savedFilters)
              }
              onChange={setFilters}
              onSave={() => void saveFilters(filters)}
              onReset={() => {
                setFilters(defaultFilters);
                void resetFilters();
              }}
            />
            <SourcePanel
              sources={sources}
              scanning={scanning}
              onRun={() => void runScan()}
            />
            <div className="resultsHead">
              <span>{ranked.length} ofert spełnia kryteria</span>
              <span>
                <ArrowDown /> Sortowanie: ocena punktowa
              </span>
            </div>
            <section className="cards">
              {ranked.slice(0, visibleCount).map(({ car, score }, index) => (
                <CarCard
                  key={car.id}
                  car={car}
                  score={score}
                  rank={index + 1}
                  onSelect={() => openCar(car)}
                  codexJob={codexJobs.find(
                    (job) =>
                      job.carId === car.id ||
                      car.listings.some((listing) => listing.url === job.url),
                  )}
                  onProcessCodex={(id, force) => void processCodex(id, force)}
                  onProcessCepik={(id) => void processCepik(id)}
                  comparisonMode={comparisonMode}
                  comparisonSelected={comparisonIds.includes(car.id)}
                  comparisonDisabled={
                    comparisonIds.length >= 4 && !comparisonIds.includes(car.id)
                  }
                  onToggleComparison={() => toggleComparison(car.id)}
                />
              ))}
            </section>
            {ranked.length > visibleCount && (
              <button
                className="loadMoreButton"
                onClick={() => setVisibleCount((count) => count + 30)}
              >
                Pokaż kolejne 30 ofert
                <small>
                  Wyświetlono {visibleCount} z {ranked.length}
                </small>
              </button>
            )}
            {ranked.length === 0 && verification.length === 0 && (
              <section className="emptyResults">
                <strong>Brak ofert dla tych filtrów</strong>
                <span>
                  Poszerz zakres ceny lub odległości albo zresetuj filtry.
                </span>
              </section>
            )}
            {verification.length > 0 && (
              <details className="verificationResults">
                <summary>
                  {verification.length} obiecujących ofert wymaga potwierdzenia
                  warunków obowiązkowych
                </summary>
                <section className="cards">
                  {verification
                    .slice(0, verificationVisibleCount)
                    .map(({ car, score }, index) => (
                      <CarCard
                        key={`verify-${car.id}`}
                        car={car}
                        score={score}
                        rank={index + 1}
                        onSelect={() => openCar(car)}
                        codexJob={codexJobs.find(
                          (job) =>
                            job.carId === car.id ||
                            car.listings.some(
                              (listing) => listing.url === job.url,
                            ),
                        )}
                        onProcessCodex={(id, force) =>
                          void processCodex(id, force)
                        }
                        onProcessCepik={(id) => void processCepik(id)}
                        comparisonMode={comparisonMode}
                        comparisonSelected={comparisonIds.includes(car.id)}
                        comparisonDisabled={
                          comparisonIds.length >= 4 &&
                          !comparisonIds.includes(car.id)
                        }
                        onToggleComparison={() => toggleComparison(car.id)}
                      />
                    ))}
                </section>
                {verification.length > verificationVisibleCount && (
                  <button
                    className="loadMoreButton"
                    onClick={() =>
                      setVerificationVisibleCount((count) => count + 15)
                    }
                  >
                    Pokaż więcej ofert do weryfikacji
                  </button>
                )}
              </details>
            )}
          </>
        )}
      </main>
      {selected && (
        <ScoreDrawer car={selected} market={market} onClose={closeCar} />
      )}
      {comparisonMode && view === "ranking" && (
        <ComparisonBar
          offers={comparedOffers}
          onRemove={toggleComparison}
          onCancel={cancelComparison}
          onCompare={() => setComparisonOpen(true)}
        />
      )}
      {comparisonOpen && (
        <OfferComparison
          offers={comparedOffers.map((car) => ({
            car,
            score: scoreCar(car, market),
          }))}
          onClose={() => setComparisonOpen(false)}
          onRemove={(id) => {
            toggleComparison(id);
            if (comparisonIds.length <= 2) setComparisonOpen(false);
          }}
        />
      )}
      {notice && (
        <div className={`toast ${notice.type}`} role="status">
          {notice.text}
        </div>
      )}
    </div>
  );
}
