import { buildMarketBenchmarks } from "../src/scoring";
import type { Car } from "../src/types";
import type { Store } from "./store";
import { captureScoreHistory } from "./scoreHistory";

export type TechOverride = NonNullable<Car["techOverride"]> | null;

export function applyTechOverride(
  store: Store,
  carId: string,
  override: TechOverride,
) {
  const cars = store.cars as Car[];
  const car = cars.find((item) => item.id === carId);
  if (!car) return undefined;

  if (override === null) delete car.techOverride;
  else car.techOverride = override;

  captureScoreHistory(car, buildMarketBenchmarks(cars), {
    trigger: "manual-edit",
    source:
      override === "confirmed"
        ? "Tech potwierdzony"
        : override === "excluded"
          ? "Tech wykluczony"
          : "Automatyczna decyzja Tech na podstawie wersji",
  });
  return car;
}
