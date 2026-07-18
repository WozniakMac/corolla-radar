import { describe, expect, it } from "vitest";
import { testCars } from "../src/data";
import { notificationKeys } from "./notifications";

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
