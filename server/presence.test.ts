import { describe, expect, it } from "vitest";
import {
  reconcileSourcePresence,
  verifyMissingSourceListings,
} from "./pipeline";
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

  it("wygasza po pierwszym skanie, gdy bezpośredni URL potwierdza brak oferty", async () => {
    const db = store();
    const candidates = new Set<string>();
    const unavailable = await verifyMissingSourceListings(
      db,
      "OTOMOTO",
      candidates,
      async () => "unavailable",
    );

    reconcileSourcePresence(db, "OTOMOTO", candidates, true, 3, unavailable);

    expect((db.cars[0] as any).listings[0]).toMatchObject({
      active: false,
      missedScans: 3,
    });
    expect((db.cars[0] as any).listings[0].inactiveAt).toBeTruthy();
    expect(db.snapshots?.[0].active).toBe(false);
  });

  it("nie wygasza oferty, gdy bezpośredni URL nadal działa", async () => {
    const db = store();
    const candidates = new Set<string>();
    const unavailable = await verifyMissingSourceListings(
      db,
      "OTOMOTO",
      candidates,
      async () => "available",
    );

    reconcileSourcePresence(db, "OTOMOTO", candidates, true, 3, unavailable);

    expect(candidates).toContain(url);
    expect((db.cars[0] as any).listings[0]).toMatchObject({
      active: true,
      missedScans: 0,
    });
  });

  it("nie wygasza oferty, gdy weryfikacja URL-a jest nierozstrzygnięta", async () => {
    const db = store();
    const candidates = new Set<string>();
    const unavailable = await verifyMissingSourceListings(
      db,
      "OTOMOTO",
      candidates,
      async () => "unknown",
    );

    reconcileSourcePresence(db, "OTOMOTO", candidates, true, 3, unavailable);

    expect((db.cars[0] as any).listings[0]).toMatchObject({
      active: true,
      missedScans: 0,
    });
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
