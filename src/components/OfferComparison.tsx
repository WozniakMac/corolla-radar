import { useEffect, useState } from "react";
import { Calculator, Check, SlidersHorizontal, X } from "lucide-react";
import { distance, money } from "../format";
import {
  calculateLeasing,
  readLeasingSettings,
  saveLeasingSettings,
  type BuyoutDestination,
  type LeasingSettings,
  type PrivateBuyoutMode,
  type VatActivity,
  type VehicleUse,
} from "../leasing";
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

const comparisonMoneyLabels = new Set([
  "Cena brutto",
  "Podstawa rat netto",
  "Rata brutto",
  "Rata po VAT",
  "Rata + utrzymanie / mies.",
  "Wykup z harmonogramu",
  "Faktyczny wykup",
  "VAT do odliczenia",
  "Łączny wypływ gotówki",
  "Realny koszt leasingu",
  "Ubezpieczenie / rok",
  "GAP / rok",
  "Serwis / rok",
  "Utrzymanie przez okres",
  "Cały koszt z utrzymaniem",
  "Koszt finansowania vs gotówka",
  "Oszczędność PIT",
]);

const numberValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

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
  const [leasingSettings, setLeasingSettings] =
    useState<LeasingSettings>(readLeasingSettings);

  useEffect(() => {
    saveLeasingSettings(leasingSettings);
  }, [leasingSettings]);

  const updateLeasing = <K extends keyof LeasingSettings>(
    key: K,
    value: LeasingSettings[K],
  ) =>
    setLeasingSettings((current) => ({
      ...current,
      [key]: value,
    }));

  const leasingResults = offers.map(({ car }) =>
    calculateLeasing({
      ...leasingSettings,
      grossPrice: effectivePrice(car),
      invoiceKind: car.vat23 ? "vat23" : "margin",
    }),
  );
  const comparesDifferentInvoiceKinds =
    offers.some(({ car }) => car.vat23) && offers.some(({ car }) => !car.vat23);

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
      label: "Status faktury VAT",
      values: offers.map(({ car }) =>
        car.vat23 ? "Potwierdzona w ogłoszeniu" : "Niepotwierdzona",
      ),
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

  const leasingRows: ComparisonRow[] = [
    {
      label: "Dokument auta",
      values: offers.map(({ car }) =>
        car.vat23
          ? "Faktura VAT"
          : "Brak potwierdzonej faktury VAT — wariant ostrożny",
      ),
    },
    {
      label: "Podstawa rat netto",
      values: leasingResults.map((result) => Math.round(result.assetBaseNet)),
      best: "lowest",
    },
    {
      label: "Sposób wykupu",
      values: offers.map(() =>
        leasingSettings.buyoutDestination === "private"
          ? leasingSettings.privateBuyoutMode === "market"
            ? "Prywatny — przewidywana cena rynkowa"
            : "Prywatny — umowna cena potwierdzona"
          : "Firmowy — umowna cena",
      ),
    },
    {
      label: "Wykup z harmonogramu",
      values: leasingResults.map((result) =>
        Math.round(result.contractualBuyoutGross),
      ),
    },
    {
      label: "Faktyczny wykup",
      values: leasingResults.map((result) =>
        Math.round(result.actualBuyoutGross),
      ),
      best: "lowest",
    },
    {
      label: "Rata brutto",
      values: leasingResults.map((result) => Math.round(result.monthlyGross)),
      best: "lowest",
    },
    {
      label: "Rata po VAT",
      values: leasingResults.map((result) =>
        Math.round(result.monthlyAfterVat),
      ),
      best: "lowest",
    },
    {
      label: "Rata + utrzymanie / mies.",
      values: leasingResults.map((result) =>
        Math.round(result.monthlyBudgetAfterVat),
      ),
      best: "lowest",
    },
    {
      label: "Ubezpieczenie / rok",
      values: leasingResults.map((result) =>
        Math.round(result.annualInsuranceGross),
      ),
      best: "lowest",
    },
    {
      label: "GAP / rok",
      values: leasingResults.map(() => leasingSettings.annualGapGross),
    },
    {
      label: "Serwis / rok",
      values: leasingResults.map(() => leasingSettings.annualServiceGross),
    },
    {
      label: "Utrzymanie przez okres",
      values: leasingResults.map((result) =>
        Math.round(result.effectiveRunningCost),
      ),
      best: "lowest",
    },
    {
      label: "VAT do odliczenia",
      values: leasingResults.map((result) => Math.round(result.deductibleVat)),
    },
    {
      label: "Oszczędność PIT",
      values: leasingResults.map((result) => result.pitSaving),
    },
    {
      label: "Suma opłat netto",
      values: leasingResults.map(
        (result) =>
          `${new Intl.NumberFormat("pl-PL", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }).format(result.netFeePercent)}%`,
      ),
    },
    {
      label: "Łączny wypływ gotówki",
      values: leasingResults.map((result) =>
        Math.round(result.totalCashOutflow),
      ),
      best: "lowest",
    },
    {
      label: "Realny koszt leasingu",
      values: leasingResults.map((result) =>
        Math.round(result.effectiveLeaseCost),
      ),
      best: "lowest",
    },
    {
      label: "Cały koszt z utrzymaniem",
      values: leasingResults.map((result) =>
        Math.round(result.effectiveOwnershipCost),
      ),
      best: "lowest",
    },
    {
      label: "Koszt finansowania vs gotówka",
      values: leasingResults.map((result) =>
        Math.round(result.financingPremium),
      ),
      best: "lowest",
    },
  ];

  const formatValue = (label: string, value: string | number) => {
    if (comparisonMoneyLabels.has(label) && typeof value === "number")
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
            autoFocus
          >
            <X />
          </button>
        </div>
        <details className="comparisonLeaseSettings">
          <summary>
            <span>
              <SlidersHorizontal />
              <b>Wspólne parametry leasingu</b>
              <small>
                {leasingSettings.upfrontPercent}% wpłaty ·{" "}
                {leasingSettings.termMonths} mies. ·{" "}
                {leasingSettings.buyoutPercent}% wykupu ·{" "}
                {leasingSettings.annualRatePercent}% rocznie ·{" "}
                {leasingSettings.buyoutDestination === "private"
                  ? leasingSettings.privateBuyoutMode === "market"
                    ? "prywatny po cenie rynkowej"
                    : "prywatny 1% potwierdzony"
                  : "wykup firmowy"}
              </small>
            </span>
            <em>Edytuj</em>
          </summary>
          <div className="comparisonLeaseFields">
            <label>
              Wpłata własna
              <span>
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={leasingSettings.upfrontPercent}
                  onChange={(event) =>
                    updateLeasing(
                      "upfrontPercent",
                      numberValue(event.target.value),
                    )
                  }
                />
                <i>%</i>
              </span>
            </label>
            <label>
              Okres
              <select
                value={leasingSettings.termMonths}
                onChange={(event) =>
                  updateLeasing("termMonths", numberValue(event.target.value))
                }
              >
                {[24, 36, 48, 60].map((months) => (
                  <option value={months} key={months}>
                    {months} miesięcy
                  </option>
                ))}
              </select>
            </label>
            <label>
              Wykup
              <span>
                <input
                  type="number"
                  min="0"
                  max="70"
                  value={leasingSettings.buyoutPercent}
                  onChange={(event) =>
                    updateLeasing(
                      "buyoutPercent",
                      numberValue(event.target.value),
                    )
                  }
                />
                <i>%</i>
              </span>
            </label>
            <label>
              Oprocentowanie
              <span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={leasingSettings.annualRatePercent}
                  onChange={(event) =>
                    updateLeasing(
                      "annualRatePercent",
                      numberValue(event.target.value),
                    )
                  }
                />
                <i>% / rok</i>
              </span>
            </label>
            <label>
              Przeznaczenie wykupu
              <select
                value={leasingSettings.buyoutDestination}
                onChange={(event) =>
                  updateLeasing(
                    "buyoutDestination",
                    event.target.value as BuyoutDestination,
                  )
                }
              >
                <option value="private">Prywatny — bez odliczenia VAT</option>
                <option value="business">Firmowy — umowna cena</option>
              </select>
            </label>
            {leasingSettings.buyoutDestination === "private" && (
              <>
                <label>
                  Cena prywatnego wykupu
                  <select
                    value={leasingSettings.privateBuyoutMode}
                    onChange={(event) =>
                      updateLeasing(
                        "privateBuyoutMode",
                        event.target.value as PrivateBuyoutMode,
                      )
                    }
                  >
                    <option value="market">Przewidywana cena rynkowa</option>
                    <option value="contractual-confirmed">
                      Umowny 1% — potwierdzony pisemnie
                    </option>
                  </select>
                </label>
                {leasingSettings.privateBuyoutMode === "market" && (
                  <label>
                    Spadek wartości auta
                    <span>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="0.5"
                        value={leasingSettings.annualDepreciationPercent}
                        onChange={(event) =>
                          updateLeasing(
                            "annualDepreciationPercent",
                            numberValue(event.target.value),
                          )
                        }
                      />
                      <i>% / rok</i>
                    </span>
                  </label>
                )}
              </>
            )}
            <label>
              Opłata administracyjna netto
              <span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={leasingSettings.adminFeeNet}
                  onChange={(event) =>
                    updateLeasing(
                      "adminFeeNet",
                      numberValue(event.target.value),
                    )
                  }
                />
                <i>zł</i>
              </span>
            </label>
            <label>
              OC/AC/NNW rocznie
              <span>
                <input
                  type="number"
                  min="0"
                  max="30"
                  step="0.1"
                  value={leasingSettings.annualInsurancePercent}
                  onChange={(event) =>
                    updateLeasing(
                      "annualInsurancePercent",
                      numberValue(event.target.value),
                    )
                  }
                />
                <i>% ceny</i>
              </span>
            </label>
            <label>
              GAP rocznie
              <span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={leasingSettings.annualGapGross}
                  onChange={(event) =>
                    updateLeasing(
                      "annualGapGross",
                      numberValue(event.target.value),
                    )
                  }
                />
                <i>zł</i>
              </span>
            </label>
            <label>
              Serwis rocznie brutto
              <span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={leasingSettings.annualServiceGross}
                  onChange={(event) =>
                    updateLeasing(
                      "annualServiceGross",
                      numberValue(event.target.value),
                    )
                  }
                />
                <i>zł</i>
              </span>
            </label>
            <label>
              Rodzaj sprzedaży
              <select
                value={leasingSettings.vatActivity}
                onChange={(event) =>
                  updateLeasing(
                    "vatActivity",
                    event.target.value as VatActivity,
                  )
                }
              >
                <option value="uk-services">
                  B2B dla UK — NP z odliczeniem
                </option>
                <option value="taxable">Opodatkowana w Polsce</option>
                <option value="mixed">Sprzedaż mieszana</option>
                <option value="exempt">Zwolniona — bez odliczenia</option>
              </select>
            </label>
            {leasingSettings.vatActivity === "mixed" && (
              <label>
                Proporcja działalności
                <span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={leasingSettings.activityDeductionPercent}
                    onChange={(event) =>
                      updateLeasing(
                        "activityDeductionPercent",
                        numberValue(event.target.value),
                      )
                    }
                  />
                  <i>%</i>
                </span>
              </label>
            )}
            <label>
              Używanie auta
              <select
                value={leasingSettings.vehicleUse}
                onChange={(event) =>
                  updateLeasing("vehicleUse", event.target.value as VehicleUse)
                }
              >
                <option value="mixed">Firmowo i prywatnie — 50% VAT</option>
                <option value="business">Wyłącznie firmowo — 100% VAT</option>
              </select>
            </label>
          </div>
          <p>
            Typ faktury jest brany osobno z każdej oferty. Na ryczałcie
            oszczędność PIT pozostaje zerowa. Ubezpieczenie jest zależne od ceny
            auta; GAP i serwis są wspólne.
          </p>
        </details>
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
              <tr className="comparisonSection leasingComparisonSection">
                <th colSpan={offers.length + 1}>
                  <Calculator /> Leasing — realny koszt
                </th>
              </tr>
              {comparesDifferentInvoiceKinds && (
                <tr className="comparisonLeaseNotice">
                  <td colSpan={offers.length + 1}>
                    <strong>Dlaczego raty tak się różnią?</strong>
                    Dla auta z fakturą VAT kalkulator finansuje cenę netto przy
                    stawce 23%. Gdy ogłoszenie nie potwierdza faktury VAT,
                    ostrożnie przyjmuje całą cenę brutto jako podstawę, a
                    leasing nadal dolicza 23% VAT. Brak znacznika w ogłoszeniu
                    nie dowodzi VAT-marży — dokument sprzedaży trzeba
                    potwierdzić u sprzedawcy.
                  </td>
                </tr>
              )}
              {renderRows(leasingRows)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
