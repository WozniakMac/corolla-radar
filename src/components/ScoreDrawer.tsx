import { CheckCircle2, ExternalLink, X } from "lucide-react";
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
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Zamknij">
          <X />
        </button>
        <small>
          ZWERYFIKOWANO {new Date(car.verifiedAt).toLocaleString("pl-PL")}
        </small>
        <h2>{car.title}</h2>
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
