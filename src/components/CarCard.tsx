import {
  Bot,
  Calculator,
  Check,
  ChevronRight,
  MapPin,
  MessageCircle,
  Plus,
  ShieldCheck,
  StickyNote,
} from "lucide-react";
import {
  communicationStatusLabels,
  communicationStatusTone,
  manualCommunicationStatuses,
} from "../communication";
import { distance, money } from "../format";
import { effectivePrice, hasTechEquivalent } from "../scoring";
import type {
  Car,
  CodexJob,
  CommunicationStatus,
  ScoreBreakdown,
} from "../types";
import { trimVariant } from "../corollaEquipment";

export function CarCard({
  car,
  score,
  rank,
  onSelect,
  codexJob,
  onProcessCodex,
  onProcessCepik,
  comparisonMode = false,
  comparisonSelected = false,
  comparisonDisabled = false,
  onToggleComparison,
  onCalculateLease,
  communicationSaving = false,
  onUpdateCommunication,
}: {
  car: Car;
  score: ScoreBreakdown;
  rank: number;
  onSelect: () => void;
  codexJob?: CodexJob;
  onProcessCodex: (id: string, force: boolean) => void;
  onProcessCepik: (id: string) => void;
  comparisonMode?: boolean;
  comparisonSelected?: boolean;
  comparisonDisabled?: boolean;
  onToggleComparison?: () => void;
  onCalculateLease?: () => void;
  communicationSaving?: boolean;
  onUpdateCommunication: (
    id: string,
    update: { status?: CommunicationStatus; note?: string },
  ) => Promise<void>;
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
  const communicationStatus = car.communication?.status || "not_contacted";
  return (
    <article
      className={`${comparisonMode ? "comparisonMode" : ""} ${
        comparisonSelected ? "comparisonSelected" : ""
      }`}
      onClick={comparisonMode ? onToggleComparison : onSelect}
      onKeyDown={(event) => {
        if (
          comparisonMode ||
          event.currentTarget !== event.target ||
          !["Enter", " "].includes(event.key)
        )
          return;
        event.preventDefault();
        onSelect();
      }}
      role="group"
      tabIndex={comparisonMode ? -1 : 0}
      aria-label={`Oferta: ${car.title}. Naciśnij Enter, aby otworzyć szczegóły.`}
    >
      {comparisonMode && (
        <button
          type="button"
          className="compareSelect"
          disabled={comparisonDisabled}
          onClick={(event) => {
            event.stopPropagation();
            onToggleComparison?.();
          }}
          aria-pressed={comparisonSelected}
          aria-label={
            comparisonSelected
              ? `Usuń ${car.title} z porównania`
              : `Dodaj ${car.title} do porównania`
          }
        >
          {comparisonSelected ? <Check /> : <Plus />}
          {comparisonSelected ? "Wybrano" : "Dodaj"}
        </button>
      )}
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
          <label
            className={`communicationBadge ${communicationStatusTone(
              communicationStatus,
            )}`}
            title="Aktualny status komunikacji ze sprzedającym"
            onClick={(event) => event.stopPropagation()}
          >
            <MessageCircle />
            <select
              aria-label={`Status auta ${car.title}`}
              value={communicationStatus}
              disabled={communicationSaving}
              onChange={(event) =>
                void onUpdateCommunication(car.id, {
                  status: event.target.value as CommunicationStatus,
                })
              }
            >
              {!manualCommunicationStatuses.includes(communicationStatus) && (
                <option value={communicationStatus}>
                  {communicationStatusLabels[communicationStatus]}
                </option>
              )}
              {manualCommunicationStatuses.map((status) => (
                <option value={status} key={status}>
                  {communicationStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
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
          {hasTechEquivalent(car) && <span className="blue">TECH</span>}
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
        {car.communication?.note && (
          <div className="cardCommunicationNote" title={car.communication.note}>
            <StickyNote />
            <span>{car.communication.note}</span>
          </div>
        )}
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
        {car.vat23 && <span>FAKTURA VAT</span>}
        <small className={`cardCodexStatus ${codexJob?.status || "notNeeded"}`}>
          <Bot /> OpenAI: {codexStatus}
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
              ? "OpenAI pracuje…"
              : codexJob.status === "processed"
                ? "Ponów OpenAI"
                : "Sprawdź z OpenAI"}
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
        <button
          className="cardLeaseButton"
          onClick={(event) => {
            event.stopPropagation();
            onCalculateLease?.();
          }}
        >
          <Calculator />
          Policz leasing
        </button>
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
