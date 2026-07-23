import { Check, X } from "lucide-react";
import { distance, money } from "../format";
import { effectivePrice, hasTechEquivalent } from "../scoring";
import type { Car, ScoreBreakdown } from "../types";
import { trimVariant } from "../corollaEquipment";

type ComparedOffer = {
  car: Car;
  score: ScoreBreakdown;
};

type ComparisonRow = {
  label: string;
  values: Array<string | number>;
  best?: "highest" | "lowest";
  max?: number;
  percent?: boolean;
};

const yesNo = (value: boolean | undefined) =>
  value === true ? "Tak" : value === false ? "Nie" : "Brak danych";

export function ComparisonBar({
  offers,
  onRemove,
  onCancel,
  onCompare,
}: {
  offers: Car[];
  onRemove: (id: string) => void;
  onCancel: () => void;
  onCompare: () => void;
}) {
  return (
    <div className="comparisonBar" aria-live="polite">
      <div className="comparisonBarTitle">
        <strong>Wybrane oferty</strong>
        <span>{offers.length}/4</span>
      </div>
      <div className="comparisonSlots">
        {Array.from({ length: 4 }, (_, index) => {
          const car = offers[index];
          return car ? (
            <div className="comparisonSlot filled" key={car.id}>
              {car.images?.[0] ? (
                <img src={car.images[0]} alt="" />
              ) : (
                <span className="comparisonSlotFallback">{index + 1}</span>
              )}
              <div>
                <strong>{car.title}</strong>
                <small>{money(effectivePrice(car))}</small>
              </div>
              <button
                type="button"
                onClick={() => onRemove(car.id)}
                aria-label={`Usuń ${car.title} z porównania`}
              >
                <X />
              </button>
            </div>
          ) : (
            <div className="comparisonSlot" key={`empty-${index}`}>
              <span>{index + 1}</span>
              <small>Wybierz ofertę</small>
            </div>
          );
        })}
      </div>
      <div className="comparisonActions">
        <button type="button" className="comparisonCancel" onClick={onCancel}>
          Anuluj
        </button>
        <button
          type="button"
          className="comparisonSubmit"
          disabled={offers.length < 2}
          onClick={onCompare}
        >
          Porównaj
          <small>
            {offers.length < 2
              ? "Wybierz min. 2 oferty"
              : `${offers.length} oferty`}
          </small>
        </button>
      </div>
    </div>
  );
}

export function OfferComparison({
  offers,
  onClose,
  onRemove,
}: {
  offers: ComparedOffer[];
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const scoreRows: ComparisonRow[] = [
    {
      label: "Ocena łączna",
      values: offers.map(({ score }) => score.total),
      best: "highest",
      max: 100,
    },
    {
      label: "Opłacalność",
      values: offers.map(({ score }) => score.deal),
      best: "highest",
      max: 50,
    },
    {
      label: "Historia i stan",
      values: offers.map(({ score }) => score.history),
      best: "highest",
      max: 20,
    },
    {
      label: "Wyposażenie dodatkowe",
      values: offers.map(({ score }) => score.equipment),
      best: "highest",
      max: 10,
    },
    {
      label: "Lokalizacja",
      values: offers.map(({ score }) => score.location),
      best: "highest",
      max: 10,
    },
    {
      label: "Warunki zakupu",
      values: offers.map(({ score }) => score.terms),
      best: "highest",
      max: 10,
    },
    {
      label: "Pewność danych",
      values: offers.map(({ score }) => score.confidence),
      best: "highest",
      max: 100,
      percent: true,
    },
  ];

  const parameterRows: ComparisonRow[] = [
    {
      label: "Cena brutto",
      values: offers.map(({ car }) => effectivePrice(car)),
      best: "lowest",
    },
    {
      label: "Rok",
      values: offers.map(({ car }) => car.year),
      best: "highest",
    },
    {
      label: "Przebieg",
      values: offers.map(({ car }) => car.mileage),
      best: "lowest",
    },
    {
      label: "Odległość",
      values: offers.map(({ car }) => car.distance),
      best: "lowest",
    },
    {
      label: "Silnik / moc",
      values: offers.map(
        ({ car }) => car.engineVersion || `Hybrid · ${car.power} KM`,
      ),
    },
    {
      label: "Wersja",
      values: offers.map(({ car }) => trimVariant(car)),
    },
    {
      label: "Pakiet Tech",
      values: offers.map(({ car }) => yesNo(hasTechEquivalent(car))),
    },
    {
      label: "Kamera cofania",
      values: offers.map(({ car }) => yesNo(car.camera)),
    },
    {
      label: "Czujniki parkowania",
      values: offers.map(({ car }) => yesNo(car.parkingSensors)),
    },
    {
      label: "Podgrzewane fotele",
      values: offers.map(({ car }) => yesNo(car.heatedSeats)),
    },
    {
      label: "Historia ASO",
      values: offers.map(({ car }) => yesNo(car.aso)),
    },
    {
      label: "Salon Polska",
      values: offers.map(({ car }) => yesNo(car.polishSalon)),
    },
    {
      label: "Właściciele",
      values: offers.map(({ car }) =>
        car.cepik?.ownersTotal !== undefined
          ? car.cepik.ownersTotal
          : car.oneOwner
            ? 1
            : "Brak danych",
      ),
      best: "lowest",
    },
    {
      label: "Faktura VAT 23%",
      values: offers.map(({ car }) => yesNo(car.vat23)),
    },
    {
      label: "Gwarancja Toyota",
      values: offers.map(({ car }) => yesNo(car.toyotaWarranty)),
    },
    {
      label: "Sprzedający",
      values: offers.map(({ car }) => car.seller),
    },
    {
      label: "Lokalizacja",
      values: offers.map(({ car }) => car.location),
    },
  ];

  const formatValue = (label: string, value: string | number) => {
    if (label === "Cena brutto" && typeof value === "number")
      return money(value);
    if (label === "Przebieg" && typeof value === "number")
      return `${new Intl.NumberFormat("pl-PL").format(value)} km`;
    if (label === "Odległość" && typeof value === "number")
      return distance(value);
    return String(value);
  };

  const renderRows = (rows: ComparisonRow[]) =>
    rows.map((row) => {
      const numericValues = row.values.filter(
        (value): value is number => typeof value === "number",
      );
      const bestValue =
        row.best && numericValues.length
          ? row.best === "highest"
            ? Math.max(...numericValues)
            : Math.min(...numericValues)
          : null;
      return (
        <tr key={row.label}>
          <th>{row.label}</th>
          {row.values.map((value, index) => (
            <td
              className={
                bestValue !== null && value === bestValue
                  ? "comparisonBest"
                  : undefined
              }
              key={offers[index].car.id}
            >
              {row.max !== undefined && typeof value === "number" ? (
                <div className="comparisonMetric">
                  <strong>
                    {row.percent ? `${value}%` : `${value}/${row.max}`}
                  </strong>
                  <span>
                    <i style={{ width: `${(value / row.max) * 100}%` }} />
                  </span>
                </div>
              ) : (
                formatValue(row.label, value)
              )}
            </td>
          ))}
        </tr>
      );
    });

  return (
    <div
      className="comparisonOverlay"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="comparisonModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="comparison-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="comparisonModalHead">
          <div>
            <small>PORÓWNANIE {offers.length} OFERT</small>
            <h2 id="comparison-title">Która Corolla wypada najlepiej?</h2>
            <p>Najkorzystniejsze wartości liczbowe oznaczyliśmy na zielono.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij porównanie"
          >
            <X />
          </button>
        </div>
        <div className="comparisonTableWrap">
          <table className="comparisonTable">
            <thead>
              <tr>
                <th>Cecha</th>
                {offers.map(({ car, score }) => (
                  <th key={car.id}>
                    <div className="comparisonOfferHead">
                      <button
                        type="button"
                        onClick={() => onRemove(car.id)}
                        aria-label={`Usuń ${car.title} z porównania`}
                      >
                        <X />
                      </button>
                      {car.images?.[0] ? (
                        <img src={car.images[0]} alt="" />
                      ) : (
                        <div className="comparisonImageFallback">
                          Brak zdjęcia
                        </div>
                      )}
                      <strong>{car.title}</strong>
                      <span>
                        <Check /> {score.total}/100
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="comparisonSection">
                <th colSpan={offers.length + 1}>Wskaźniki oceny</th>
              </tr>
              {renderRows(scoreRows)}
              <tr className="comparisonSection">
                <th colSpan={offers.length + 1}>Parametry ofert</th>
              </tr>
              {renderRows(parameterRows)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
