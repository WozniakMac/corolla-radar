import {
  MapPin,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import type { FilterState } from "../types";
type Props = {
  value: FilterState;
  sources: string[];
  trims: string[];
  engines: string[];
  saved: boolean;
  dirty: boolean;
  onChange: (next: FilterState) => void;
  onSave: () => void;
  onReset: () => void;
};

type MultiSelectFilterProps = {
  label: string;
  allLabel: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
};

function MultiSelectFilter({
  label,
  allLabel,
  values,
  options,
  onChange,
}: MultiSelectFilterProps) {
  const availableOptions = [...new Set([...options, ...values])];
  const selectedValues = availableOptions.filter((option) =>
    values.includes(option),
  );
  const selectedLabel = selectedValues.join(", ");
  const summary =
    values.length === 0
      ? allLabel
      : values.length === 1
        ? values[0]
        : selectedLabel.length <= 20
          ? selectedLabel
          : label;
  const toggle = (option: string) => {
    const next = new Set(values);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(availableOptions.filter((value) => next.has(value)));
  };

  return (
    <details className="multiSelectFilter">
      <summary
        aria-label={`${label}. ${values.length ? `Wybrano: ${selectedLabel}` : allLabel}`}
        title={values.length ? selectedLabel : allLabel}
      >
        <span>{summary}</span>
        {values.length > 0 && <b>{values.length}</b>}
      </summary>
      <div className="multiSelectMenu" role="group" aria-label={label}>
        <label className="multiSelectAll">
          <input
            type="checkbox"
            checked={values.length === 0}
            onChange={() => onChange([])}
          />
          <span>{allLabel}</span>
        </label>
        {availableOptions.map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              checked={values.includes(option)}
              onChange={() => toggle(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export function Filters({
  value,
  sources,
  trims,
  engines,
  saved,
  dirty,
  onChange,
  onSave,
  onReset,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const set = <K extends keyof FilterState>(key: K, next: FilterState[K]) =>
    onChange({ ...value, [key]: next });
  const advancedCount = [
    value.minPrice > 0,
    value.maxPrice > 0 && value.maxPrice !== 150000,
    value.maxDistance > 0,
    value.maxKm !== 200000,
    value.tech,
    value.vat,
  ].filter(Boolean).length;
  const allFilterCount =
    advancedCount +
    [
      value.year.length > 0,
      value.engine.length > 0,
      value.trim.length > 0,
      value.source.length > 0,
    ].filter(Boolean).length;
  return (
    <section className={`filters ${mobileOpen ? "mobileFiltersOpen" : ""}`}>
      <div className="filterPrimary">
        <div className="search">
          <Search />
          <input
            value={value.query}
            onChange={(e) => set("query", e.target.value)}
            placeholder="Szukaj wersji, miasta, sprzedawcy..."
          />
        </div>
        <button
          type="button"
          className="mobileFiltersToggle"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <SlidersHorizontal />
          {mobileOpen ? "Ukryj filtry" : "Filtry"}
          {allFilterCount > 0 && <b>{allFilterCount}</b>}
        </button>
        <MultiSelectFilter
          label="Roczniki"
          allLabel="Wszystkie roczniki"
          values={value.year}
          options={["2021", "2022", "2023", "2024"]}
          onChange={(values) => set("year", values)}
        />
        <MultiSelectFilter
          label="Silniki"
          allLabel="Wszystkie silniki"
          values={value.engine}
          options={engines}
          onChange={(values) => set("engine", values)}
        />
        <MultiSelectFilter
          label="Wersje"
          allLabel="Wszystkie wersje"
          values={value.trim}
          options={trims}
          onChange={(values) => set("trim", values)}
        />
        <MultiSelectFilter
          label="Źródła"
          allLabel="Wszystkie źródła"
          values={value.source}
          options={sources}
          onChange={(values) => set("source", values)}
        />
      </div>
      <details className="advancedFilters">
        <summary>
          <SlidersHorizontal /> Więcej filtrów
          {advancedCount > 0 && <b>{advancedCount}</b>}
        </summary>
        <div className="advancedFiltersBody">
          <div className="priceFilter" aria-label="Przedział cenowy">
            <span>Cena</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={value.minPrice || ""}
              onChange={(e) => set("minPrice", Number(e.target.value) || 0)}
              placeholder="od"
              aria-label="Cena od"
            />
            <i>–</i>
            <input
              type="number"
              min="0"
              step="1000"
              value={value.maxPrice || ""}
              onChange={(e) => set("maxPrice", Number(e.target.value) || 0)}
              placeholder="do"
              aria-label="Cena do"
            />
          </div>
          <div
            className="distanceFilter"
            aria-label="Maksymalna odległość od Poznania"
          >
            <MapPin />
            <input
              type="number"
              min="0"
              step="10"
              value={value.maxDistance || ""}
              onChange={(e) => set("maxDistance", Number(e.target.value) || 0)}
              placeholder="dowolna"
              aria-label="Maksymalna odległość od Poznania w kilometrach"
            />
            <span>km od Poznania</span>
          </div>
          <button
            className={value.maxDistance === 150 ? "on" : ""}
            onClick={() =>
              set("maxDistance", value.maxDistance === 150 ? 0 : 150)
            }
          >
            <MapPin /> Do 150 km
          </button>
          <button
            className={value.tech ? "on" : ""}
            onClick={() => set("tech", !value.tech)}
          >
            Pakiet Tech
          </button>
          <button
            className={value.vat ? "on" : ""}
            onClick={() => set("vat", !value.vat)}
          >
            FV 23%
          </button>
          <label>
            Przebieg do {Math.round(value.maxKm / 1000)} tys. km
            <input
              type="range"
              min="50000"
              max="250000"
              step="5000"
              value={value.maxKm}
              onChange={(e) => set("maxKm", +e.target.value)}
            />
          </label>
        </div>
      </details>
      <div className="filterMemory">
        <span>
          {dirty
            ? "Filtry zostały zmienione — zapisz je, aby wpłynęły na powiadomienia."
            : saved
              ? "Zapisane filtry są używane także w powiadomieniach TOP 5."
              : "Filtry nie są zapisane — powiadomienia używają pełnego rankingu."}
        </span>
        <button type="button" onClick={onSave}>
          <Save /> Zapisz filtry
        </button>
        <button type="button" onClick={onReset}>
          <RotateCcw /> Resetuj pamięć
        </button>
      </div>
    </section>
  );
}
