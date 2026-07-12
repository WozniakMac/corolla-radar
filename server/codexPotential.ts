import { distanceFromPoznan } from "./distance";
import type { Job } from "./store";

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

export function calculateCodexPotential(job: Job) {
  const p = job.input || {};
  const reasons: string[] = [];

  const yearPoints =
    p.year === 2022
      ? 20
      : p.year === 2023 || p.year === 2024
        ? 19
        : p.year === 2021
          ? 18
          : p.year === 2020 || p.year === 2025
            ? 10
            : p.year
              ? 4
              : 9;
  if ([2021, 2022, 2023, 2024].includes(p.year))
    reasons.push(`dobry rocznik ${p.year}`);

  const target =
    p.year === 2021
      ? 80_000
      : p.year === 2022
        ? 88_500
        : p.year === 2023 || p.year === 2024
          ? 101_500
          : 95_000;
  let pricePoints = 12;
  const price = p.cashPrice || p.price;
  if (price) {
    const difference = price - target;
    pricePoints =
      price < 50_000
        ? 8
        : difference <= 0
          ? clamp(32 + difference / 5_000, 15, 35)
          : clamp(32 - difference / 2_500, 0, 32);
    if (Math.abs(difference) <= 10_000)
      reasons.push(`cena blisko celu (${Math.round(price / 1000)} tys. zł)`);
    else if (difference < -10_000 && price >= 50_000)
      reasons.push(
        `cena ${Math.round(-difference / 1000)} tys. zł poniżej celu`,
      );
  }

  let mileagePoints = 10;
  if (p.mileage) {
    mileagePoints =
      p.mileage <= 50_000
        ? 25
        : p.mileage <= 90_000
          ? 25 - ((p.mileage - 50_000) / 40_000) * 7
          : p.mileage <= 100_000
            ? 15
            : p.mileage <= 130_000
              ? 10
              : clamp(8 - (p.mileage - 130_000) / 15_000, 0, 8);
    if (p.mileage <= 90_000)
      reasons.push(
        `preferowany przebieg ${Math.round(p.mileage / 1000)} tys. km`,
      );
    else if (p.mileage > 130_000)
      reasons.push(`wysoki przebieg ${Math.round(p.mileage / 1000)} tys. km`);
  }

  const fitPoints =
    (p.eligibleBody ? 3 : 0) +
    (p.hybrid ? 3 : 0) +
    (p.ecvt ? 2 : 0) +
    (p.camera ? 1 : 0) +
    (p.parkingSensors ? 1 : 0);
  if (fitPoints >= 7) reasons.push("większość wymagań już potwierdzona");

  const distance = distanceFromPoznan(p.location);
  const locationPoints =
    distance === 999
      ? 4
      : distance <= 150
        ? 10
        : distance <= 300
          ? 7
          : distance <= 500
            ? 3
            : 0;
  if (distance <= 150) reasons.push("blisko Poznania");

  const qualityScore = Math.round(
    clamp(
      yearPoints + pricePoints + mileagePoints + fitPoints + locationPoints,
    ),
  );
  const missingWeights: Record<string, number> = {
    cena: 4,
    przebieg: 4,
    rocznik: 4,
    nadwozie: 3,
    Hybrid: 3,
    "czujniki parkowania": 3,
    "e-CVT": 2,
    kamera: 2,
    moc: 1,
    lokalizacja: 1,
    wersja: 1,
    VIN: 0,
  };
  const rawInformationValue = job.missing.reduce(
    (sum, field) => sum + (missingWeights[field] || 0),
    0,
  );
  const informationValue = Math.round(clamp(rawInformationValue * 2.5, 0, 15));
  const potentialScore = Math.round(
    clamp(qualityScore * 0.85 + informationValue),
  );
  if (rawInformationValue >= 5)
    reasons.push("Codex może rozstrzygnąć ważne braki");
  if (job.missing.length === 1 && job.missing[0] === "VIN")
    reasons.push("brakuje tylko VIN — niski zwrot z użycia Codex");

  return {
    potentialScore,
    qualityScore,
    informationValue,
    potentialReasons: reasons.slice(0, 4),
  };
}
