import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Calculator,
  CircleAlert,
  ExternalLink,
  Info,
  Landmark,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import {
  calculateLeasing,
  readLeasingSettings,
  saveLeasingSettings,
  type BuyoutDestination,
  type Co2Class,
  type InvoiceKind,
  type LeasingInputs,
  type LeasingSettings,
  type PrivateBuyoutMode,
  type VatActivity,
  type VehicleUse,
} from "../leasing";
import { money } from "../format";
import { effectivePrice, qualifyCar } from "../scoring";
import type { Car } from "../types";

const percent = (value: number) =>
  `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(
    value * 100,
  )}%`;

const numberValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function LeasingCalculator({
  cars,
  initialCarId,
}: {
  cars: Car[];
  initialCarId?: string | null;
}) {
  const availableCars = useMemo(
    () =>
      cars
        .filter(
          (car) =>
            car.price > 0 &&
            qualifyCar(car).status !== "rejected" &&
            car.listings.some((listing) => listing.active),
        )
        .sort((a, b) => effectivePrice(a) - effectivePrice(b)),
    [cars],
  );
  const initialCar =
    availableCars.find((car) => car.id === initialCarId) || availableCars[0];
  const [selectedCarId, setSelectedCarId] = useState(initialCar?.id || "");
  const [grossPrice, setGrossPrice] = useState(
    initialCar ? effectivePrice(initialCar) : 100_000,
  );
  const [invoiceKind, setInvoiceKind] = useState<InvoiceKind>(
    initialCar?.vat23 ? "vat23" : "margin",
  );
  const [settings, setSettings] =
    useState<LeasingSettings>(readLeasingSettings);

  useEffect(() => {
    if (!initialCarId) return;
    const car = availableCars.find((item) => item.id === initialCarId);
    if (!car) return;
    setSelectedCarId(car.id);
    setGrossPrice(effectivePrice(car));
    setInvoiceKind(car.vat23 ? "vat23" : "margin");
  }, [availableCars, initialCarId]);

  useEffect(() => {
    saveLeasingSettings(settings);
  }, [settings]);

  const input: LeasingInputs = {
    grossPrice,
    invoiceKind,
    ...settings,
  };
  const result = calculateLeasing(input);
  const selectedCar = availableCars.find((car) => car.id === selectedCarId);
  const update = <K extends keyof LeasingSettings>(
    key: K,
    value: LeasingSettings[K],
  ) => setSettings((current) => ({ ...current, [key]: value }));

  const selectCar = (id: string) => {
    const car = availableCars.find((item) => item.id === id);
    if (!car) return;
    setSelectedCarId(id);
    setGrossPrice(effectivePrice(car));
    setInvoiceKind(car.vat23 ? "vat23" : "margin");
  };

  return (
    <section className="leasingPage">
      <div className="taxProfileBanner">
        <div className="taxProfileIcon">
          <BadgeCheck />
        </div>
        <div>
          <small>TWÓJ PROFIL PODATKOWY</small>
          <strong>JDG · ryczałt 12% · VAT czynny · usługi B2B dla UK</strong>
          <p>
            Domyślnie traktujemy „NP” jako miejsce świadczenia poza Polską
            (reverse charge), z zachowanym prawem do odliczenia. To nie jest to
            samo co sprzedaż zwolniona z VAT.
          </p>
        </div>
        <span>Stan zasad: 2026</span>
      </div>

      <div className="leasingAskBanner">
        <Landmark />
        <div>
          <small>REALISTYCZNY SCENARIUSZ BAZOWY DLA UŻYWANEJ COROLLI</small>
          <strong>
            10% wpłaty · 36 miesięcy · firmowy wykup 1% · ok. 7,5% rocznie
          </strong>
          <p>
            Przyjmujemy ok. 112% sumy opłat netto, czyli ofertę możliwą do
            uzyskania bez zakładania najlepszej promocji. Wynik do 110% traktuj
            jako dobrą ofertę. Prywatny nabywca zwykle płaci cenę rynkową, a nie
            1% z harmonogramu.
          </p>
        </div>
        <span>Szacunek rynkowy, nie oferta</span>
      </div>

      <div className="leasingLayout">
        <div className="leasingForm">
          <div className="leasingSectionHead">
            <Calculator />
            <div>
              <h2>Parametry oferty</h2>
              <p>Szacunek porównawczy, nie harmonogram leasingodawcy.</p>
            </div>
          </div>

          <label className="leasingWideField">
            Samochód z rankingu
            <select
              value={selectedCarId}
              onChange={(e) => selectCar(e.target.value)}
            >
              {availableCars.map((car) => (
                <option value={car.id} key={car.id}>
                  {car.title} · {money(effectivePrice(car))}
                  {car.vat23 ? " · FV 23%" : " · bez FV 23%"}
                </option>
              ))}
            </select>
          </label>

          <div className="leasingFields">
            <label>
              Cena auta brutto
              <span className="inputWithSuffix">
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={grossPrice}
                  onChange={(e) => setGrossPrice(numberValue(e.target.value))}
                />
                <i>zł</i>
              </span>
            </label>
            <label>
              Dokument sprzedaży auta
              <select
                value={invoiceKind}
                onChange={(e) => setInvoiceKind(e.target.value as InvoiceKind)}
              >
                <option value="vat23">Faktura VAT 23%</option>
                <option value="margin">VAT-marża / bez wykazanego VAT</option>
              </select>
            </label>
            <label>
              Wpłata własna
              <span className="inputWithSuffix">
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={settings.upfrontPercent}
                  onChange={(e) =>
                    update("upfrontPercent", numberValue(e.target.value))
                  }
                />
                <i>%</i>
              </span>
            </label>
            <label>
              Okres
              <select
                value={settings.termMonths}
                onChange={(e) =>
                  update("termMonths", numberValue(e.target.value))
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
              <span className="inputWithSuffix">
                <input
                  type="number"
                  min="0"
                  max="70"
                  value={settings.buyoutPercent}
                  onChange={(e) =>
                    update("buyoutPercent", numberValue(e.target.value))
                  }
                />
                <i>%</i>
              </span>
            </label>
            <label>
              Przeznaczenie wykupu
              <select
                value={settings.buyoutDestination}
                onChange={(e) =>
                  update(
                    "buyoutDestination",
                    e.target.value as BuyoutDestination,
                  )
                }
              >
                <option value="private">
                  Prywatny — zwykle cena rynkowa, bez odliczenia VAT
                </option>
                <option value="business">
                  Firmowy — umowny wykup, odliczenie VAT według profilu
                </option>
              </select>
            </label>
            {settings.buyoutDestination === "private" && (
              <>
                <label>
                  Cena prywatnego wykupu
                  <select
                    value={settings.privateBuyoutMode}
                    onChange={(e) =>
                      update(
                        "privateBuyoutMode",
                        e.target.value as PrivateBuyoutMode,
                      )
                    }
                  >
                    <option value="market">
                      Przewidywana cena rynkowa — standard
                    </option>
                    <option value="contractual-confirmed">
                      Umowny 1% — mam pisemne potwierdzenie
                    </option>
                  </select>
                </label>
                {settings.privateBuyoutMode === "market" && (
                  <label>
                    Zakładany spadek wartości auta
                    <span className="inputWithSuffix">
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="0.5"
                        value={settings.annualDepreciationPercent}
                        onChange={(e) =>
                          update(
                            "annualDepreciationPercent",
                            numberValue(e.target.value),
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
              Oprocentowanie nominalne
              <span className="inputWithSuffix">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={settings.annualRatePercent}
                  onChange={(e) =>
                    update("annualRatePercent", numberValue(e.target.value))
                  }
                />
                <i>% / rok</i>
              </span>
            </label>
            <label>
              Opłata administracyjna netto
              <span className="inputWithSuffix">
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={settings.adminFeeNet}
                  onChange={(e) =>
                    update("adminFeeNet", numberValue(e.target.value))
                  }
                />
                <i>zł</i>
              </span>
            </label>
            <label>
              Emisja CO₂ (limit PIT 2026)
              <select
                value={settings.co2Class}
                onChange={(e) => update("co2Class", e.target.value as Co2Class)}
              >
                <option value="atLeast50">50 g/km lub więcej</option>
                <option value="below50">Poniżej 50 g/km</option>
                <option value="zero">Elektryczny / wodór</option>
              </select>
            </label>
          </div>

          <div className="leasingSectionHead taxSettingsHead">
            <ReceiptText />
            <div>
              <h2>Prawo do odliczenia VAT</h2>
              <p>Sama rejestracja jako VAT czynny nie wystarcza.</p>
            </div>
          </div>
          <div className="leasingFields">
            <label>
              Rodzaj sprzedaży
              <select
                value={settings.vatActivity}
                onChange={(e) =>
                  update("vatActivity", e.target.value as VatActivity)
                }
              >
                <option value="uk-services">
                  Usługi B2B dla UK — NP z prawem do odliczenia
                </option>
                <option value="taxable">Sprzedaż opodatkowana w Polsce</option>
                <option value="mixed">
                  Sprzedaż mieszana — własna proporcja
                </option>
                <option value="exempt">
                  Sprzedaż zwolniona — bez odliczenia
                </option>
              </select>
            </label>
            {settings.vatActivity === "mixed" && (
              <label>
                Proporcja odliczenia z działalności
                <span className="inputWithSuffix">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={settings.activityDeductionPercent}
                    onChange={(e) =>
                      update(
                        "activityDeductionPercent",
                        numberValue(e.target.value),
                      )
                    }
                  />
                  <i>%</i>
                </span>
              </label>
            )}
            <label>
              Sposób używania auta
              <select
                value={settings.vehicleUse}
                onChange={(e) =>
                  update("vehicleUse", e.target.value as VehicleUse)
                }
              >
                <option value="mixed">Firmowo i prywatnie — limit 50%</option>
                <option value="business">
                  Wyłącznie firmowo — potencjalnie 100%
                </option>
              </select>
            </label>
          </div>
          {settings.vehicleUse === "business" && (
            <div className="leasingWarning">
              <CircleAlert />
              <span>
                100% VAT wymaga realnego wykluczenia użytku prywatnego, zasad
                używania, ewidencji przebiegu dla VAT i zgłoszenia VAT-26.
              </span>
            </div>
          )}

          <div className="leasingSectionHead taxSettingsHead">
            <ShieldCheck />
            <div>
              <h2>Ubezpieczenie i serwis</h2>
              <p>
                Koszty dodatkowe przez cały okres umowy, poza ratą leasingową.
              </p>
            </div>
          </div>
          <div className="leasingFields">
            <label>
              OC/AC/NNW rocznie
              <span className="inputWithSuffix">
                <input
                  type="number"
                  min="0"
                  max="30"
                  step="0.1"
                  value={settings.annualInsurancePercent}
                  onChange={(e) =>
                    update(
                      "annualInsurancePercent",
                      numberValue(e.target.value),
                    )
                  }
                />
                <i>% ceny auta</i>
              </span>
            </label>
            <label>
              GAP rocznie
              <span className="inputWithSuffix">
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={settings.annualGapGross}
                  onChange={(e) =>
                    update("annualGapGross", numberValue(e.target.value))
                  }
                />
                <i>zł</i>
              </span>
            </label>
            <label>
              Serwis i przeglądy rocznie brutto
              <span className="inputWithSuffix">
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={settings.annualServiceGross}
                  onChange={(e) =>
                    update("annualServiceGross", numberValue(e.target.value))
                  }
                />
                <i>zł</i>
              </span>
            </label>
          </div>
          <div className="leasingWarning">
            <Info />
            <span>
              Domyślnie: pełne OC/AC/NNW 3,5% wartości auta rocznie, GAP 900 zł
              i serwis 2000 zł. Ubezpieczenie nie ma VAT; z faktur serwisowych
              kalkulator odlicza VAT zgodnie ze sposobem używania auta. Paliwo,
              opony i nieplanowane naprawy nie są uwzględnione.
            </span>
          </div>
        </div>

        <div className="leasingResults">
          <div className="leasingResultHero">
            <small>EFEKTYWNA RATA PO ODLICZENIU VAT</small>
            <strong>{money(Math.round(result.monthlyAfterVat))}</strong>
            <span>
              rata na fakturze: {money(Math.round(result.monthlyGross))} brutto
            </span>
          </div>
          <div className="leasingMetrics">
            <div>
              <small>ŁĄCZNY WYPŁYW GOTÓWKI</small>
              <strong>{money(Math.round(result.totalCashOutflow))}</strong>
            </div>
            <div className="positive">
              <small>VAT DO ODLICZENIA</small>
              <strong>−{money(Math.round(result.deductibleVat))}</strong>
              <span>
                {percent(result.deductibleVatPercent)} VAT z rat i opłat
                {settings.buyoutDestination === "private"
                  ? "; bez VAT z wykupu"
                  : ""}
              </span>
            </div>
            <div>
              <small>OSZCZĘDNOŚĆ W PIT</small>
              <strong>{money(result.pitSaving)}</strong>
              <span>ryczałt nie uwzględnia kosztów</span>
            </div>
            <div className="total">
              <small>REALNY KOSZT LEASINGU</small>
              <strong>{money(Math.round(result.effectiveLeaseCost))}</strong>
              <span>wpłata + raty + wykup + opłata − odliczony VAT</span>
            </div>
          </div>
          <div className="leaseVsCash">
            <WalletCards />
            <div>
              <small>FINANSOWANIE VS ZAKUP ZA GOTÓWKĘ</small>
              <strong>
                +{money(Math.max(0, Math.round(result.financingPremium)))}
              </strong>
              <span>
                koszt kapitału przy podanych parametrach; zakup gotówkowy po
                VAT: {money(Math.round(result.effectiveCashCost))}
              </span>
            </div>
          </div>
          <div className="leaseVsCash">
            <ShieldCheck />
            <div>
              <small>RATA + UBEZPIECZENIE + GAP + SERWIS</small>
              <strong>
                {money(Math.round(result.monthlyBudgetAfterVat))} / mies.
              </strong>
              <span>
                rata po VAT + średnio{" "}
                {money(Math.round(result.monthlyRunningCost))} utrzymania
                miesięcznie
              </span>
            </div>
          </div>
          <div className="leasingBreakdown">
            <span>
              Wpłata brutto
              <b>{money(Math.round(result.upfrontNet * 1.23))}</b>
            </span>
            <span>
              {settings.termMonths} rat brutto
              <b>
                {money(Math.round(result.monthlyGross * settings.termMonths))}
              </b>
            </span>
            <span>
              {settings.buyoutDestination === "private" &&
              settings.privateBuyoutMode === "market"
                ? "Przewidywany wykup prywatny"
                : "Wykup brutto"}
              <b>{money(Math.round(result.actualBuyoutGross))}</b>
              {settings.buyoutDestination === "private" && (
                <em>
                  VAT z prywatnego wykupu nie jest odliczany
                  {settings.privateBuyoutMode === "market"
                    ? `; umowny wykup dla JDG: ${money(
                        Math.round(result.contractualBuyoutGross),
                      )}`
                    : ""}
                </em>
              )}
            </span>
            <span>
              Suma opłat netto
              <b>
                {new Intl.NumberFormat("pl-PL", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                }).format(result.netFeePercent)}
                %
              </b>
              <em>
                {settings.buyoutDestination === "private" &&
                settings.privateBuyoutMode === "market"
                  ? "harmonogram firmowy; nie obejmuje prywatnej ceny rynkowej"
                  : result.netFeePercent <= 110
                    ? "dobra oferta — poniżej 110%"
                    : result.netFeePercent <= 113
                      ? "realistyczny przedział rynkowy: 110–113%"
                      : "drogo — porównaj ofertę z innym leasingodawcą"}
              </em>
            </span>
            <span>
              Limit kosztowy PIT 2026
              <b>{money(result.pitLimit2026)}</b>
              <em>informacyjnie — na ryczałcie nie daje korzyści</em>
            </span>
            <span>
              OC/AC/NNW przez {settings.termMonths} mies.
              <b>{money(Math.round(result.totalInsuranceGross))}</b>
              <em>{money(Math.round(result.annualInsuranceGross))} rocznie</em>
            </span>
            <span>
              GAP przez {settings.termMonths} mies.
              <b>{money(Math.round(result.totalGapGross))}</b>
              <em>opcjonalny, chyba że wymaga go oferta lub promocja</em>
            </span>
            <span>
              Serwis przez {settings.termMonths} mies.
              <b>
                {money(
                  Math.round(
                    result.totalServiceGross - result.deductibleServiceVat,
                  ),
                )}
              </b>
              <em>
                po odliczeniu {money(Math.round(result.deductibleServiceVat))}{" "}
                VAT
              </em>
            </span>
            <span>
              Cały koszt z utrzymaniem
              <b>{money(Math.round(result.effectiveOwnershipCost))}</b>
              <em>leasing + ubezpieczenie + GAP + serwis, bez paliwa i opon</em>
            </span>
          </div>
          {invoiceKind === "margin" && (
            <div className="leasingWarning strong">
              <CircleAlert />
              <span>
                Dla oferty bez potwierdzonej FV 23% liczymy wariant ostrożny:
                cała cena brutto staje się bazą finansowania, a usługa leasingu
                nadal jest fakturowana z 23% VAT. Brak znacznika FV 23% w
                ogłoszeniu nie dowodzi VAT-marży — potwierdź dokument sprzedaży
                i możliwość finansowania u leasingodawcy.
              </span>
            </div>
          )}
          {settings.buyoutDestination === "private" &&
            settings.privateBuyoutMode === "market" && (
              <div className="leasingWarning strong">
                <CircleAlert />
                <span>
                  Prywatny wykup jest liczony po przewidywanej wartości rynkowej
                  auta. Przy takim wariancie leasing zazwyczaj przestaje być
                  ekonomiczny, bo umowny wykup 1% przysługuje JDG, a nie
                  prywatnemu nabywcy. Kalkulacja nie zakłada zwrotu nadwyżki ze
                  sprzedaży na rzecz JDG — jeśli leasingodawca go przewiduje,
                  musi to wynikać z indywidualnego rozliczenia umowy.
                </span>
              </div>
            )}
          {settings.buyoutDestination === "private" &&
            settings.privateBuyoutMode === "contractual-confirmed" && (
              <div className="leasingWarning strong">
                <CircleAlert />
                <span>
                  Ten wariant jest wyjątkiem. Używaj go tylko, jeśli
                  leasingodawca potwierdził w umowie lub OWUL fakturę bez NIP po
                  umownej cenie wykupu — nie wystarczy ustna deklaracja
                  sprzedawcy.
                </span>
              </div>
            )}
          {selectedCar && (
            <a
              className="selectedLeaseOffer"
              href={selectedCar.listings.find((listing) => listing.active)?.url}
              target="_blank"
              rel="noreferrer"
            >
              <span>
                Wybrana oferta
                <b>{selectedCar.title}</b>
              </span>
              <ExternalLink />
            </a>
          )}
        </div>
      </div>

      <div className="leasingKnowledge">
        <div className="leasingSectionHead">
          <Info />
          <div>
            <h2>Co sprawdzić przed podpisaniem</h2>
            <p>Najniższa rata nie oznacza najtańszej umowy.</p>
          </div>
        </div>
        <div className="leasingChecklist">
          <div>
            <strong>Całkowity koszt</strong>
            <p>
              Porównaj sumę opłat brutto, prowizję, oprocentowanie
              stałe/zmienne, wykup i obowiązkowe pakiety — nie samą ratę.
            </p>
          </div>
          <div>
            <strong>Ubezpieczenie i GAP</strong>
            <p>
              Sprawdź koszt AC/OC/GAP, udział własny, możliwość polisy
              zewnętrznej i opłatę za jej obsługę.
            </p>
          </div>
          <div>
            <strong>Wyjście z umowy</strong>
            <p>
              Przeczytaj zasady wcześniejszej spłaty, cesji, szkody całkowitej,
              opóźnienia w płatności i tabelę opłat dodatkowych.
            </p>
          </div>
          <div>
            <strong>Wykup i późniejsza sprzedaż</strong>
            <p>
              Ustal firmowy lub prywatny wykup przed końcem umowy. Prywatny
              wykup nie daje odliczenia VAT, a sprzedaż przed upływem 6 lat
              wraca do przychodu firmowego (na ryczałcie co do zasady 3%
              przychodu z ruchomości).
            </p>
          </div>
          <div>
            <strong>Oferta i pojazd</strong>
            <p>
              Potwierdź FV 23%, brak zastawu, właściciela, VIN, historię szkód,
              zgodę na auto używane oraz maksymalny wiek na koniec umowy.
            </p>
          </div>
          <div>
            <strong>Płynność</strong>
            <p>
              Zostaw bufor na wpłatę, VAT przed jego zwrotem, pierwszą polisę,
              serwis, opony i kilka rat przy spadku przychodów.
            </p>
          </div>
        </div>
        <div className="legalSources">
          <span>
            To kalkulacja orientacyjna, nie porada podatkowa. Przy usługach dla
            UK zachowaj dokumenty związku zakupu z działalnością i potwierdź
            klasyfikację usługi z księgową.
          </span>
          <a
            href="https://www.podatki.gov.pl/podatki-firmowe/pit/informacje-podstawowe/co-jest-opodatkowane/opodatkowanie-ryczaltem-od-przychodow-ewidencjonowanych"
            target="_blank"
            rel="noreferrer"
          >
            Ryczałt — podatki.gov.pl <ExternalLink />
          </a>
          <a
            href="https://biznes.gov.pl/pl/portal/001436"
            target="_blank"
            rel="noreferrer"
          >
            Leasing i VAT — biznes.gov.pl <ExternalLink />
          </a>
          <a
            href="https://www.podatki.gov.pl/jednolity-plik-kontrolny/pytania-i-odpowiedzi/obrot-zagraniczny/czy-w-jpk_vat-powinny-byc-prezentowane-faktury-dokumentujace-sprzedaz-uslug-dla-ktorych-miejscem-swiadczenia-jest-kraj/"
            target="_blank"
            rel="noreferrer"
          >
            Usługi poza Polską — podatki.gov.pl <ExternalLink />
          </a>
        </div>
      </div>
    </section>
  );
}
