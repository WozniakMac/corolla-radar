import { describe, expect, it } from "vitest";
import { testCars } from "../src/data";
import type { ScoreBreakdown, ScoreHistoryEntry } from "../src/types";
import {
  hasTopTenChanged,
  localCarUrl,
  notificationKeys,
  positionChangeLabel,
  scoreChangeMessage,
  topTenMessage,
} from "./notifications";

const breakdown = (
  total: number,
  overrides: Partial<ScoreBreakdown> = {},
): ScoreBreakdown => ({
  deal: total - 50,
  history: 20,
  equipment: 10,
  location: 10,
  terms: 10,
  total,
  confidence: 90,
  ...overrides,
});

describe("notification identity", () => {
  it("recognizes the same car by VIN across different portals", () => {
    const first = {
      ...testCars[0],
      id: "portal-a",
      vin: "SB1ZB3AE20E040424",
    };
    const second = {
      ...testCars[0],
      id: "portal-b",
      vin: "SB1ZB3AE20E040424",
      listings: [
        {
          ...testCars[0].listings[0],
          url: "https://example.test/inne-ogloszenie",
        },
      ],
    };
    const firstKeys = notificationKeys(first);
    expect(
      notificationKeys(second).some((key) => firstKeys.includes(key)),
    ).toBe(true);
  });

  it("normalizes tracking parameters in listing URLs", () => {
    const car = {
      ...testCars[0],
      listings: [
        {
          ...testCars[0].listings[0],
          url: "https://example.test/oferta/123?utm_source=radar",
        },
      ],
    };
    expect(notificationKeys(car)).toContain("url:example.test/oferta/123");
  });
});

describe("TOP 10 notification summary", () => {
  const previous = [
    { id: "a", score: 90 },
    { id: "b", score: 88 },
    { id: "c", score: 86 },
  ];

  it("detects membership, order and score changes", () => {
    expect(hasTopTenChanged(previous, previous)).toBe(false);
    expect(
      hasTopTenChanged(previous, [
        { id: "a", score: 91 },
        { id: "b", score: 88 },
        { id: "c", score: 86 },
      ]),
    ).toBe(true);
    expect(
      hasTopTenChanged(previous, [
        { id: "b", score: 88 },
        { id: "a", score: 90 },
        { id: "c", score: 86 },
      ]),
    ).toBe(true);
    expect(
      hasTopTenChanged(previous, [
        { id: "a", score: 90 },
        { id: "b", score: 88 },
        { id: "d", score: 84 },
      ]),
    ).toBe(true);
  });

  it("detects a changed component even when the total stays the same", () => {
    expect(
      hasTopTenChanged(
        [{ id: "a", score: 90, breakdown: breakdown(90) }],
        [
          {
            id: "a",
            score: 90,
            breakdown: breakdown(90, { deal: 39, history: 21 }),
          },
        ],
      ),
    ).toBe(true);
  });

  it("describes moves and new cars relative to the previous ranking", () => {
    const previousIds = ["a", "b", "c", "d", "e"];
    expect(positionChangeLabel(previousIds, "c", 0)).toBe("↑2");
    expect(positionChangeLabel(previousIds, "a", 2)).toBe("↓2");
    expect(positionChangeLabel(previousIds, "d", 3)).toBe("→");
    expect(positionChangeLabel(previousIds, "new", 4)).toBe("NOWE");
  });

  it("builds one ranked list with positions and points", () => {
    const first = { ...testCars[0], id: "c", title: "Corolla C" };
    const second = { ...testCars[1], id: "new", title: "Corolla Nowa" };

    expect(
      topTenMessage(
        [
          { car: first, score: breakdown(92) },
          { car: second, score: breakdown(89) },
        ],
        ["a", "b", "c"],
        "http://192.168.2.47:4174",
      ),
    ).toBe(
      `1 ↑2 92p
http://192.168.2.47:4174/cars/c

2 NOWE 89p
http://192.168.2.47:4174/cars/new`,
    );
  });

  it("omits offer links and car names", () => {
    const car = {
      ...testCars[0],
      id: "merged",
      title: "Corolla scalona",
      listings: [
        { ...testCars[0].listings[0], price: 105_000 },
        {
          ...testCars[0].listings[0],
          url: "https://example.test/najtansza",
          price: 99_000,
        },
        {
          ...testCars[0].listings[0],
          url: "https://example.test/nieaktywna",
          price: 95_000,
          active: false,
        },
      ],
    };

    const message = topTenMessage([{ car, score: breakdown(90) }], []);
    expect(message).not.toContain("https://example.test/");
    expect(message).not.toContain("Corolla scalona");
    expect(message).toContain("/cars/merged");
  });

  it("links to the car route and safely encodes its id", () => {
    expect(localCarUrl("VIN/ABC 123", "http://192.168.2.47:4174/")).toBe(
      "http://192.168.2.47:4174/cars/VIN%2FABC%20123",
    );
  });

  it("summarizes the point delta", () => {
    const change: ScoreHistoryEntry = {
      capturedAt: "2026-07-26T10:00:00.000Z",
      previousTotal: 84,
      score: breakdown(89),
      explanations: [],
      changes: [
        {
          key: "history",
          label: "Historia i stan",
          previousPoints: 13,
          points: 18,
          delta: 5,
          reasons: [
            "Przestało obowiązywać: Brak potwierdzonego serwisowania lub historii ASO: −5 pkt",
            "Poprzednio: salon Polska",
            "Aktualnie: ASO • salon Polska",
          ],
        },
      ],
    };

    expect(scoreChangeMessage(change)).toBe("+5");
  });
});
