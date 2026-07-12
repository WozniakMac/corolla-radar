import { Bot, ChevronRight, MapPin } from "lucide-react";
import { distance, money } from "../format";
import { effectivePrice, hasTechEquivalent } from "../scoring";
import type { Car, CodexJob, ScoreBreakdown } from "../types";
import { trimVariant } from "../corollaEquipment";

export function CarCard({
  car,
  score,
  rank,
  onSelect,
  codexJob,
  onProcessCodex,
}: {
  car: Car;
  score: ScoreBreakdown;
  rank: number;
  onSelect: () => void;
  codexJob?: CodexJob;
  onProcessCodex: (id: string, force: boolean) => void;
}) {
  const codexStatus = codexJob
    ? {
        pending:
          codexJob.potentialScore >= 70
            ? "Wymaga weryfikacji"
            : "Weryfikacja opcjonalna",
        processing: "W trakcie przetwarzania",
        processed: "Przetworzono",
        failed: "Błąd przetwarzania",
      }[codexJob.status]
    : "Nie wymaga weryfikacji";
  return (
    <article onClick={onSelect}>
      <div className="rank">#{rank}</div>
      <div className="thumb">
        {car.images?.[0] ? (
          <img src={car.images[0]} alt={car.title} loading="lazy" />
        ) : (
          <span>Brak zdjęcia</span>
        )}
      </div>
      <div className={`score ${score.total >= 85 ? "great" : ""}`}>
        <strong>{score.total}</strong>
        <small>/100</small>
        <small>{score.confidence}% pewn.</small>
      </div>
      <div className="carInfo">
        <div className="badges">
          {car.reserved && <span className="reservedBg">ZAREZERWOWANE</span>}
          <span className="trimBg">{trimVariant(car)}</span>
          <span>{car.year}</span>
          <span>{car.power} KM</span>
          {hasTechEquivalent(car) && (
            <span className="blue">{car.tech ? "TECH" : "TECH EQ."}</span>
          )}
          {car.parkingSensors ? (
            <span className="greenBg">CZUJNIKI</span>
          ) : (
            <span className="warnBg">CZUJNIKI?</span>
          )}
          {car.distance <= 150 && <span className="greenBg">LOKALNIE</span>}
        </div>
        <h2>{car.title}</h2>
        <p>
          <MapPin />
          {car.location} · {distance(car.distance)} <b>•</b> {car.seller}
        </p>
        <div className="facts">
          <div>
            <small>PRZEBIEG</small>
            <strong>
              {new Intl.NumberFormat("pl-PL").format(car.mileage)} km
            </strong>
          </div>
          <div>
            <small>HISTORIA</small>
            <strong>{car.aso ? "ASO potwierdzone" : "Brak danych"}</strong>
          </div>
          <div>
            <small>POCHODZENIE</small>
            <strong>{car.polishSalon ? "Salon Polska" : "Import"}</strong>
          </div>
          <div>
            <small>WŁAŚCICIELE</small>
            <strong>{car.oneOwner ? "1 właściciel" : "Brak danych"}</strong>
          </div>
        </div>
      </div>
      <div className="price">
        <small>CENA BRUTTO</small>
        <strong>{money(effectivePrice(car))}</strong>
        {effectivePrice(car) > car.price && <span>CENA GOTÓWKOWA</span>}
        {car.vat23 && <span>FV 23%</span>}
        <small className={`cardCodexStatus ${codexJob?.status || "notNeeded"}`}>
          <Bot /> Codex: {codexStatus}
        </small>
        {codexJob && (
          <button
            className="cardCodexButton"
            disabled={codexJob.status === "processing"}
            onClick={(event) => {
              event.stopPropagation();
              onProcessCodex(codexJob.id, codexJob.status === "processed");
            }}
          >
            <Bot />
            {codexJob.status === "processing"
              ? "Codex pracuje…"
              : codexJob.status === "processed"
                ? "Ponów Codex"
                : "Sprawdź z Codex"}
          </button>
        )}
        <button>
          Szczegóły <ChevronRight />
        </button>
      </div>
    </article>
  );
}
