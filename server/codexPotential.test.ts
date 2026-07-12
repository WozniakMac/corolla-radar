import { describe, expect, it } from "vitest";
import { calculateCodexPotential } from "./codexPotential";
import type { Job } from "./store";

const job = (input: Record<string, unknown>, missing: string[] = []): Job => ({
  id: "test",
  url: "https://example.com/car",
  source: "test",
  title: "Toyota Corolla",
  status: "pending",
  missing,
  input,
  createdAt: new Date(0).toISOString(),
});

describe("potencjał kolejki Codex", () => {
  it("preferuje auto z docelową ceną, rocznikiem i przebiegiem", () => {
    const strong = calculateCodexPotential(
      job(
        {
          year: 2022,
          price: 88_000,
          mileage: 70_000,
          eligibleBody: true,
          location: "Poznań",
        },
        ["kamera", "czujniki parkowania"],
      ),
    );
    const weak = calculateCodexPotential(
      job(
        {
          year: 2019,
          price: 105_000,
          mileage: 190_000,
          eligibleBody: true,
          location: "Rzeszów",
        },
        ["VIN"],
      ),
    );
    expect(strong.potentialScore).toBeGreaterThan(weak.potentialScore);
  });

  it("nadaje większą wartość ważnym brakom niż samemu VIN", () => {
    const input = { year: 2023, price: 100_000, mileage: 70_000 };
    expect(
      calculateCodexPotential(job(input, ["kamera", "czujniki parkowania"]))
        .informationValue,
    ).toBeGreaterThan(
      calculateCodexPotential(job(input, ["VIN"])).informationValue,
    );
  });
});
