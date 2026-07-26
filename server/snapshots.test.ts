import { describe, expect, it } from "vitest";
import { snapshotsToRetain } from "./snapshots";
import type { SnapshotMeta } from "./store";

const snapshot = (id: string, capturedAt: string): SnapshotMeta => ({
  id: id.repeat(64).slice(0, 64),
  source: "OTOMOTO",
  url: "https://www.otomoto.pl/osobowe/oferta/corolla",
  capturedAt,
  bytes: 100,
});

describe("retencja snapshotów", () => {
  it("zachowuje najnowszą wersję i respektuje oba limity", () => {
    const values = [
      snapshot("a", "2026-07-25T00:00:00.000Z"),
      snapshot("b", "2026-07-20T00:00:00.000Z"),
      snapshot("c", "2026-06-01T00:00:00.000Z"),
    ];
    const retained = snapshotsToRetain(
      values,
      2,
      30,
      new Date("2026-07-26T00:00:00.000Z").getTime(),
    );
    expect([...retained].map((item) => item.id[0])).toEqual(["a", "b"]);
  });

  it("nigdy nie usuwa jedynej najnowszej wersji", () => {
    const old = snapshot("a", "2020-01-01T00:00:00.000Z");
    expect(
      snapshotsToRetain(
        [old],
        1,
        1,
        new Date("2026-07-26T00:00:00.000Z").getTime(),
      ).has(old),
    ).toBe(true);
  });
});
