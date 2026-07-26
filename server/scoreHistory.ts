import { explainScore, scoreCar, type MarketBenchmarks } from "../src/scoring";
import type {
  Car,
  ScoreBreakdown,
  ScoreCategoryChange,
  ScoreCategoryKey,
  ScoreExplanationSnapshot,
  ScoreHistoryEntry,
} from "../src/types";

export type ScoreCaptureContext = {
  capturedAt?: string;
  trigger?: ScoreHistoryEntry["trigger"];
  source?: string;
};

const categoryKeys: ScoreCategoryKey[] = [
  "deal",
  "history",
  "equipment",
  "location",
  "terms",
];

function scorePointsChanged(previous: ScoreBreakdown, current: ScoreBreakdown) {
  return categoryKeys.some((key) => previous[key] !== current[key]);
}

function reasonChanges(
  previous: ScoreExplanationSnapshot,
  current: ScoreExplanationSnapshot,
) {
  const removed = previous.deductions.filter(
    (item) => !current.deductions.includes(item),
  );
  const added = current.deductions.filter(
    (item) => !previous.deductions.includes(item),
  );
  const reasons = [
    ...removed.map((item) => `Przestało obowiązywać: ${item}`),
    ...added.map((item) => `Zaczęło obowiązywać: ${item}`),
  ];
  if (previous.detail !== current.detail) {
    reasons.push(`Poprzednio: ${previous.detail}`);
    reasons.push(`Aktualnie: ${current.detail}`);
  }
  return reasons.length
    ? reasons
    : ["Zmieniły się dane wejściowe lub benchmark używany przez punktację."];
}

export function buildScoreChanges(
  previous: ScoreHistoryEntry,
  currentExplanations: ScoreExplanationSnapshot[],
): ScoreCategoryChange[] {
  return currentExplanations.flatMap((current) => {
    const previousExplanation = previous.explanations.find(
      ({ key }) => key === current.key,
    );
    if (!previousExplanation || previousExplanation.points === current.points)
      return [];
    return [
      {
        key: current.key,
        label: current.label,
        previousPoints: previousExplanation.points,
        points: current.points,
        delta: current.points - previousExplanation.points,
        reasons: reasonChanges(previousExplanation, current),
      },
    ];
  });
}

export function captureScoreHistory(
  car: Car,
  market: MarketBenchmarks,
  context: ScoreCaptureContext = {},
) {
  const score = scoreCar(car, market);
  const previous = car.scoreHistory?.at(-1);
  if (previous && !scorePointsChanged(previous.score, score)) return undefined;

  const explanations = explainScore(car, market) as ScoreExplanationSnapshot[];
  const entry: ScoreHistoryEntry = {
    capturedAt: context.capturedAt || new Date().toISOString(),
    ...(context.trigger ? { trigger: context.trigger } : {}),
    ...(context.source ? { source: context.source } : {}),
    ...(previous ? { previousTotal: previous.score.total } : {}),
    score,
    explanations,
    changes: previous ? buildScoreChanges(previous, explanations) : [],
  };
  car.scoreHistory = [...(car.scoreHistory || []), entry].slice(-100);
  return entry;
}

export function captureAllScoreHistories(
  cars: Car[],
  market: MarketBenchmarks,
  context: ScoreCaptureContext = {},
) {
  const captured = new Map<string, ScoreHistoryEntry>();
  for (const car of cars) {
    if (!car.price || !car.year || !car.mileage) continue;
    const entry = captureScoreHistory(car, market, context);
    if (entry) captured.set(car.id, entry);
  }
  return captured;
}
