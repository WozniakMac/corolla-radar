import { describe, expect, it } from "vitest";
import {
  effectivePrice,
  explainScore,
  isEligible,
  qualifyCar,
  scoreCar,
  worthTrip,
} from "./scoring";
import { testCars } from "./data";

const qualified = (index = 2) => ({
  ...testCars[index],
  hybrid: true,
  parkingSensors: true,
  camera: true,
  ecvt: true,
});

describe("skalibrowany ranking", () => {
  it("uses camera, sensors, hybrid and automatic as a hard gate", () => {
    const car = qualified();
    expect(isEligible(car)).toBe(true);
    expect(qualifyCar({ ...car, parkingSensors: false })).toMatchObject({
      status: "verification",
      reasons: ["czujniki parkowania"],
    });
  });

  it("rejects damaged cars and lease-takeover fees from the purchase ranking", () => {
    expect(
      qualifyCar({
        ...qualified(),
        description: "Auto uszkodzone - prawy przód",
      }),
    ).toMatchObject({ status: "rejected" });
    expect(
      qualifyCar({
        ...qualified(),
        description: "Przejęcie leasingu, odstępne 20 000 zł",
      }),
    ).toMatchObject({ status: "rejected" });
  });

  it("rejects accessory and non-vehicle prices", () => {
    expect(qualifyCar({ ...qualified(), price: 1107 })).toMatchObject({
      status: "rejected",
    });
  });

  it("penalizes cars outside the target budget and model years", () => {
    const target = scoreCar({ ...qualified(), year: 2024, price: 104000 }).deal;
    const expensive2025 = scoreCar({
      ...qualified(),
      year: 2025,
      price: 132000,
    }).deal;
    expect(target).toBeGreaterThan(expensive2025);
  });

  it("does not penalize a Style car within the 120k budget", () => {
    const style = scoreCar({
      ...qualified(),
      year: 2024,
      price: 108000,
      power: 196,
      trim: "Style",
      tech: false,
    }).deal;
    const comfort = scoreCar({
      ...qualified(),
      year: 2024,
      price: 108000,
      power: 196,
      trim: "Comfort",
      tech: false,
    }).deal;
    expect(style).toBeGreaterThan(comfort);
    expect(
      explainScore({
        ...qualified(),
        year: 2024,
        price: 108000,
        power: 196,
        trim: "Style",
      })[0].deductions.join(" "),
    ).not.toContain("preferowanego budżetu");
  });

  it("makes deal quality the largest component", () => {
    const score = scoreCar(qualified());
    expect(score.deal).toBeGreaterThan(score.history);
    expect(score.deal).toBeLessThanOrEqual(50);
  });

  it("rewards a credible discount but caps suspiciously low prices", () => {
    const car = qualified();
    const normal = scoreCar({ ...car, price: 88500 }).deal;
    const credible = scoreCar({ ...car, price: 82000 }).deal;
    const suspicious = scoreCar({ ...car, price: 45000 }).deal;
    expect(credible).toBeGreaterThanOrEqual(normal);
    expect(suspicious).toBeLessThan(credible);
  });

  it("uses a disclosed cash surcharge as part of the effective price", () => {
    const car = {
      ...qualified(),
      price: 90000,
      description:
        "W przypadku zakupu z własnych środków do ceny zostanie doliczona kwota 2000 zł.",
    };
    expect(effectivePrice(car)).toBe(92000);
    expect(scoreCar(car).terms).toBeLessThan(
      scoreCar({ ...car, description: "Cena bez dopłat." }).terms,
    );
  });

  it("reports data confidence separately", () => {
    const complete = scoreCar(qualified()).confidence;
    const incomplete = scoreCar({
      ...qualified(),
      vin: undefined,
      aso: false,
      polishSalon: false,
      description: undefined,
      listings: [qualified().listings[0]],
    }).confidence;
    expect(complete).toBeGreaterThan(incomplete);
  });

  it("allows a well-priced 2.0 Hybrid to score highly", () => {
    const car = {
      ...qualified(0),
      power: 196,
      price: 95000,
      mileage: 70000,
      trim: "Comfort + Tech",
      tech: true,
    };
    expect(scoreCar(car).deal).toBeGreaterThan(40);
  });

  it("hides distant offers without a value or quality advantage", () => {
    const car = {
      ...qualified(0),
      price: 160000,
      distance: 600,
      tech: false,
      aso: false,
      polishSalon: false,
      oneOwner: false,
      vat23: false,
    };
    expect(worthTrip(car, scoreCar(car))).toBe(false);
  });

  it("never exceeds 100", () => {
    expect(scoreCar(qualified()).total).toBeLessThanOrEqual(100);
  });

  it("explains every category with explicit point deductions", () => {
    const explanation = explainScore({
      ...qualified(),
      tech: false,
      heatedSeats: false,
      distance: 320,
    });
    expect(
      explanation.find((item) => item.key === "equipment")?.deductions,
    ).toContain(
      "Brak potwierdzenia: podgrzewana kierownica (−1 pkt potencjału wyposażenia)",
    );
    expect(
      explanation.find((item) => item.key === "location")?.deductions[0],
    ).toContain("−8 pkt");
  });

  it("treats Style and Executive as Tech-equivalent without a trim-name penalty", () => {
    for (const trim of ["Style", "Executive"]) {
      const equipment = explainScore({
        ...qualified(),
        year: 2023,
        tech: false,
        trim,
      }).find((item) => item.key === "equipment")!;
      expect(equipment.deductions.join(" ")).not.toContain("Tech");
      expect(equipment.deductions.join(" ")).not.toContain("Style/Executive");
      expect(equipment.detail).toContain("wynika z katalogu");
    }
  });

  it("does not apply the post-facelift Tech contents to a 2022 car", () => {
    const equipment = explainScore({
      ...qualified(),
      year: 2022,
      trim: "Comfort + Tech",
      tech: true,
      heatedSeats: false,
    }).find((item) => item.key === "equipment")!;
    expect(equipment.detail).toContain("pakietu Tech MY2022");
    expect(equipment.detail).not.toContain("podgrzewana kierownica +1");
  });
});
