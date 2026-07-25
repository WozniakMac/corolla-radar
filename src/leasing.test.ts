import { describe, expect, it } from "vitest";
import {
  calculateLeasing,
  effectiveVatDeduction,
  type LeasingInputs,
} from "./leasing";

const base: LeasingInputs = {
  grossPrice: 123_000,
  invoiceKind: "vat23",
  upfrontPercent: 10,
  termMonths: 36,
  buyoutPercent: 20,
  annualRatePercent: 7,
  adminFeeNet: 500,
  annualInsurancePercent: 3.5,
  annualGapGross: 900,
  annualServiceGross: 2000,
  vehicleUse: "mixed",
  vatActivity: "uk-services",
  activityDeductionPercent: 100,
  co2Class: "atLeast50",
  buyoutDestination: "private",
};

describe("kalkulator leasingu JDG", () => {
  it("applies the 50% vehicle VAT limit to deductible UK B2B services", () => {
    expect(effectiveVatDeduction("uk-services", 100, "mixed")).toBe(0.5);
    expect(calculateLeasing(base).deductibleVatPercent).toBe(0.5);
  });

  it("does not invent an income-tax saving on the 12% lump sum", () => {
    expect(calculateLeasing(base).pitSaving).toBe(0);
  });

  it("uses the gross purchase price as the leasing base for VAT-margin cars", () => {
    const vat = calculateLeasing(base);
    const margin = calculateLeasing({ ...base, invoiceKind: "margin" });
    expect(vat.assetBaseNet).toBeCloseTo(100_000);
    expect(margin.assetBaseNet).toBe(123_000);
    expect(margin.effectiveLeaseCost).toBeGreaterThan(vat.effectiveLeaseCost);
  });

  it("supports full vehicle VAT deduction for documented business-only use", () => {
    expect(
      calculateLeasing({ ...base, vehicleUse: "business" })
        .deductibleVatPercent,
    ).toBe(1);
  });

  it("does not deduct VAT from a private buyout", () => {
    const privateBuyout = calculateLeasing(base);
    const businessBuyout = calculateLeasing({
      ...base,
      buyoutDestination: "business",
    });
    expect(privateBuyout.deductibleVatOnBuyout).toBe(0);
    expect(businessBuyout.deductibleVatOnBuyout).toBeGreaterThan(0);
    expect(privateBuyout.effectiveLeaseCost).toBeGreaterThan(
      businessBuyout.effectiveLeaseCost,
    );
  });

  it("removes VAT recovery for VAT-exempt activity", () => {
    expect(
      calculateLeasing({ ...base, vatActivity: "exempt" }).deductibleVat,
    ).toBe(0);
  });

  it("adds insurance, GAP and service across the whole leasing term", () => {
    const result = calculateLeasing(base);
    expect(result.annualInsuranceGross).toBe(4305);
    expect(result.totalInsuranceGross).toBe(12_915);
    expect(result.totalGapGross).toBe(2700);
    expect(result.totalServiceGross).toBe(6000);
    expect(result.effectiveOwnershipCost).toBeGreaterThan(
      result.effectiveLeaseCost,
    );
    expect(result.monthlyBudgetAfterVat).toBeGreaterThan(
      result.monthlyAfterVat,
    );
  });

  it("deducts vehicle VAT from service but not from insurance or GAP", () => {
    const result = calculateLeasing(base);
    expect(result.deductibleServiceVat).toBeCloseTo((6000 * 0.23 * 0.5) / 1.23);
    expect(result.effectiveRunningCost).toBeCloseTo(
      result.additionalRunningCashOutflow - result.deductibleServiceVat,
    );
  });
});
