import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Minus,
  X,
} from "lucide-react";
import { money } from "../format";
import { explainScore, scoreCar, type MarketBenchmarks } from "../scoring";
import type { Car } from "../types";

export function ScoreDrawer({
  car,
  market,
  onClose,
}: {
  car: Car;
  market: MarketBenchmarks;
  onClose: () => void;
}) {
  const score = scoreCar(car, market);
  const explanation = explainScore(car, market);
  const priceEvents = car.listings
    .flatMap((listing) =>
      (listing.priceHistory || []).map((entry, index, history) => {
        const previous = history[index - 1];
        const amount = entry.cashPrice || entry.price;
        const previousAmount = previous
          ? previous.cashPrice || previous.price
          : undefined;
        return {
          ...entry,
          amount,
          previousAmount,
          delta: previousAmount === undefined ? 0 : amount - previousAmount,
          changed:
            previous === undefined ||
            previous.price !== entry.price ||
            (previous.cashPrice || undefined) !==
              (entry.cashPrice || undefined),
          source: listing.source,
          url: listing.url,
        };
      }),
    )
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const priceChanges = priceEvents.filter((event) => event.changed);
  const overallPriceChanges = (car.priceHistory || [])
    .slice(1)
    .flatMap((entry, index) => {
      const previous = car.priceHistory![index];
      return entry.price !== previous.price
        ? [{ ...entry, previousPrice: previous.price }]
        : [];
    })
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="car-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close" onClick={onClose} aria-label="Zamknij">
          <X />
        </button>
        <small>
          {`PIERWSZY RAZ ${
            car.firstSeen
              ? new Date(car.firstSeen).toLocaleDateString("pl-PL")
              : "BRAK DANYCH"
          } • ZWERYFIKOWANO ${new Date(car.verifiedAt).toLocaleString("pl-PL")}`}
        </small>
        <h2 id="car-detail-title">{car.title}</h2>
        {car.images?.length ? (
          <div className="gallery">
            {car.images.slice(0, 8).map((url, index) => (
              <img
                src={url}
                alt={`${car.title} — zdjęcie ${index + 1}`}
                loading="lazy"
                key={url}
              />
            ))}
          </div>
        ) : (
          <div className="noMedia">Brak zdjęć w danych strony</div>
        )}
        <div className="bigScore">
          {score.total}
          <span>/100</span>
        </div>
        <div className="confidenceScore">
          Pewność danych: <strong>{score.confidence}%</strong>
        </div>
        <h3>Dlaczego ten wynik?</h3>
        <div className="scoreExplanation">
          {explanation.map((item) => (
            <div className="scoreReason" key={item.key}>
              <div className="scoreReasonHead">
                <strong>{item.label}</strong>
                <b>
                  {item.points}/{item.max}
                </b>
              </div>
              <div className="scoreTrack">
                <span style={{ width: `${(item.points / item.max) * 100}%` }} />
              </div>
              <p>{item.detail}</p>
              {item.deductions.length ? (
                <div className="scoreDeductions">
                  <small>ODJĘTE PUNKTY</small>
                  <ul>
                    {item.deductions.map((deduction) => (
                      <li key={deduction}>{deduction}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="noDeductions">Bez odjętych punktów</div>
              )}
            </div>
          ))}
        </div>
        <div
          className={car.parkingSensors ? "sensorConfirmed" : "sensorMissing"}
        >
          {car.parkingSensors
            ? "Czujniki parkowania potwierdzone w treści ogłoszenia"
            : "Brak potwierdzenia czujników parkowania — sprawdź wersję i pakiet Tech"}
        </div>
        <h3>Historia cen</h3>
        <div className="priceHistorySummary">
          <div>
            <small>AKTUALNA NAJNIŻSZA</small>
            <strong>
              {money(
                priceEvents.length
                  ? Math.min(...priceEvents.map((event) => event.amount))
                  : car.cashPrice || car.price,
              )}
            </strong>
          </div>
          <div>
            <small>ZAREJESTROWANE ZMIANY</small>
            <strong>
              {
                priceChanges.filter(
                  (event) => event.previousAmount !== undefined,
                ).length
              }
            </strong>
          </div>
        </div>
        {overallPriceChanges.length > 0 && (
          <div className="overallPriceChanges">
            {overallPriceChanges.map((change) => (
              <div
                className={
                  change.price < change.previousPrice ? "drop" : "rise"
                }
                key={`${change.capturedAt}-${change.price}`}
              >
                <span>
                  Najniższa cena auta • {change.source} •{" "}
                  {new Date(change.capturedAt).toLocaleString("pl-PL")}
                </span>
                <b>
                  {money(change.previousPrice)} → {money(change.price)}
                </b>
              </div>
            ))}
          </div>
        )}
        <div className="priceTimeline">
          {priceChanges.length ? (
            priceChanges.map((event) => (
              <a
                className={`priceEvent ${event.delta < 0 ? "drop" : event.delta > 0 ? "rise" : "initial"}`}
                href={event.url}
                target="_blank"
                rel="noreferrer"
                key={`${event.url}-${event.capturedAt}-${event.price}-${event.cashPrice || 0}`}
              >
                <div className="priceEventIcon">
                  {event.delta < 0 ? (
                    <ArrowDownRight />
                  ) : event.delta > 0 ? (
                    <ArrowUpRight />
                  ) : (
                    <Minus />
                  )}
                </div>
                <div>
                  <b>{event.source}</b>
                  <time>
                    {new Date(event.capturedAt).toLocaleString("pl-PL")}
                  </time>
                  <small>
                    Cena ogłoszeniowa: {money(event.price)}
                    {event.cashPrice
                      ? ` • gotówkowa: ${money(event.cashPrice)}`
                      : ""}
                  </small>
                </div>
                <div className="priceEventValue">
                  <strong>{money(event.amount)}</strong>
                  {event.previousAmount !== undefined && event.delta !== 0 ? (
                    <span>
                      {event.delta > 0 ? "+" : "−"}
                      {money(Math.abs(event.delta))}
                    </span>
                  ) : event.previousAmount === undefined ? (
                    <span>pierwszy odczyt</span>
                  ) : (
                    <span>zmiana rodzaju ceny</span>
                  )}
                </div>
              </a>
            ))
          ) : (
            <div className="noPriceHistory">
              Historia zacznie się od następnego odczytu ceny.
            </div>
          )}
        </div>
        <h3>Aktywne publikacje</h3>
        {car.listings.map((listing) => (
          <a
            className="source"
            href={listing.url}
            target="_blank"
            rel="noreferrer"
            key={`${listing.source}-${listing.url}`}
          >
            <span>
              <CheckCircle2 />
              {listing.source}
            </span>
            <b>{money(listing.cashPrice || listing.price)}</b>
            <ExternalLink />
          </a>
        ))}
        <h3>Uwagi</h3>
        <ul>
          {car.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <h3>Opis z ogłoszenia</h3>
        <p className="listingDescription">
          {car.description || "Portal nie udostępnił opisu w pobranym HTML."}
        </p>
      </div>
    </div>
  );
}
