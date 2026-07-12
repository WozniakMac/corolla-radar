import { describe, expect, it } from "vitest";
import { reconcileSourcePresence } from "./pipeline";
import type { Store } from "./store";

const url = "https://example.com/oferta/1";
const store = (): Store => ({
  cars: [
    {
      id: "car-1",
      listings: [{ source: "OTOMOTO", url, active: true }],
    },
  ],
  jobs: [
    {
      id: "job-1",
      source: "OTOMOTO",
      url,
      title: "Corolla",
      status: "pending",
      missing: [],
      input: {},
      createdAt: new Date().toISOString(),
    },
  ],
  snapshots: [
    {
      id: "a".repeat(64),
      source: "OTOMOTO",
      url,
      capturedAt: new Date().toISOString(),
      bytes: 1,
      active: true,
    },
  ],
});

describe("wygaszanie ofert", () => {
  it("nie nalicza nieobecności po skanie częściowym", () => {
    const db = store();
    reconcileSourcePresence(db, "OTOMOTO", new Set(), false);
    expect((db.cars[0] as any).listings[0]).toMatchObject({ active: true });
    expect((db.cars[0] as any).listings[0].missedScans).toBeUndefined();
  });

  it("wygasza dopiero po trzech pełnych skanach", () => {
    const db = store();
    for (let scan = 1; scan <= 2; scan++)
      reconcileSourcePresence(db, "OTOMOTO", new Set(), true);
    expect((db.cars[0] as any).listings[0].active).toBe(true);
    reconcileSourcePresence(db, "OTOMOTO", new Set(), true);
    expect((db.cars[0] as any).listings[0].active).toBe(false);
    expect(db.cars).toHaveLength(1);
    expect(db.jobs).toHaveLength(0);
    expect(db.snapshots?.[0].active).toBe(false);
  });

  it("resetuje licznik, gdy oferta wraca", () => {
    const db = store();
    reconcileSourcePresence(db, "OTOMOTO", new Set(), true);
    reconcileSourcePresence(db, "OTOMOTO", new Set(), true);
    reconcileSourcePresence(db, "OTOMOTO", new Set([url]), true);
    expect((db.cars[0] as any).listings[0]).toMatchObject({
      active: true,
      missedScans: 0,
    });
  });
});
