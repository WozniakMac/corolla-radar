import { Bot, ChevronRight, MapPin, ShieldCheck } from "lucide-react";
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
  onProcessCepik,
}: {
  car: Car;
  score: ScoreBreakdown;
  rank: number;
  onSelect: () => void;
  codexJob?: CodexJob;
  onProcessCodex: (id: string, force: boolean) => void;
  onProcessCepik: (id: string) => void;
}) {
  const canRunCepik = Boolean(
    car.vin && car.registrationNumber && car.firstRegistrationDate,
  );
  const latestPriceChange = [
    ...car.listings.flatMap((listing) => {
      const history = listing.priceHistory || [];
      return history.slice(1).flatMap((entry, index) => {
        const previous = history[index];
        const previousPrice = previous.cashPrice || previous.price;
        const price = entry.cashPrice || entry.price;
        return price !== previousPrice
          ? [{ capturedAt: entry.capturedAt, delta: price - previousPrice }]
          : [];
      });
    }),
    ...(car.priceHistory || []).slice(1).flatMap((entry, index) => {
      const previous = car.priceHistory![index];
      return entry.price !== previous.price
        ? [
            {
              capturedAt: entry.capturedAt,
              delta: entry.price - previous.price,
            },
          ]
        : [];
    }),
  ].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
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
        <div>
          <strong>{score.total}</strong>
          <small>/100</small>
        </div>
        <small>{score.confidence}% pewn.</small>
      </div>
      <div className="carInfo">
        <div className="badges">
          {car.reserved && <span className="reservedBg">ZAREZERWOWANE</span>}
          {car.cepik && (
            <span
              className={car.cepik.status === "ok" ? "greenBg" : "warnBg"}
              title={car.cepik.error || car.cepik.timeline?.join(" • ")}
            >
              CEPiK{" "}
              {car.cepik.status === "ok"
                ? "OK"
                : car.cepik.status.toUpperCase()}
            </span>
          )}
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
          {latestPriceChange && latestPriceChange.delta < 0 && (
            <span className="priceDropBg">
              CENA −{money(Math.abs(latestPriceChange.delta))}
            </span>
          )}
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
            <strong>
              {car.cepik?.ownersTotal !== undefined
                ? `${car.cepik.ownersTotal} wg CEPiK`
                : car.oneOwner
                  ? "1 właściciel"
                  : "Brak danych"}
            </strong>
          </div>
          <div>
            <small>PIERWSZY RAZ</small>
            <strong>
              {car.firstSeen
                ? new Date(car.firstSeen).toLocaleDateString("pl-PL")
                : "Brak danych"}
            </strong>
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
        {canRunCepik && (
          <button
            className="cardCepikButton"
            disabled={
              car.cepik?.status === "processing" ||
              car.cepik?.status === "pending"
            }
            title="Sprawdź ponownie w Historia Pojazdu"
            onClick={(event) => {
              event.stopPropagation();
              onProcessCepik(car.id);
            }}
          >
            <ShieldCheck />
            {car.cepik?.status === "processing"
              ? "CEPiK pracuje…"
              : car.cepik?.status === "pending"
                ? "CEPiK w kolejce"
                : car.cepik
                  ? "Ponów CEPiK"
                  : "Sprawdź CEPiK"}
          </button>
        )}
        <a
          className="carPermalink"
          href={`/cars/${encodeURIComponent(car.id)}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelect();
          }}
        >
          Szczegóły <ChevronRight />
        </a>
      </div>
    </article>
  );
}
