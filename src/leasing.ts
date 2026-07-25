export const VAT_RATE = 0.23;

export type VehicleUse = "mixed" | "business";
export type VatActivity = "uk-services" | "taxable" | "mixed" | "exempt";
export type InvoiceKind = "vat23" | "margin";
export type Co2Class = "zero" | "below50" | "atLeast50";
export type BuyoutDestination = "private" | "business";

export type LeasingInputs = {
  grossPrice: number;
  invoiceKind: InvoiceKind;
  upfrontPercent: number;
  termMonths: number;
  buyoutPercent: number;
  annualRatePercent: number;
  adminFeeNet: number;
  annualInsurancePercent: number;
  annualGapGross: number;
  annualServiceGross: number;
  vehicleUse: VehicleUse;
  vatActivity: VatActivity;
  activityDeductionPercent: number;
  co2Class: Co2Class;
  buyoutDestination: BuyoutDestination;
};

export type LeasingSettings = Omit<LeasingInputs, "grossPrice" | "invoiceKind">;

export const LEASING_STORAGE_KEY = "corolla-radar:leasing-settings:v4";

export const defaultLeasingSettings: LeasingSettings = {
  upfrontPercent: 10,
  termMonths: 36,
  buyoutPercent: 1,
  annualRatePercent: 7.5,
  adminFeeNet: 1000,
  annualInsurancePercent: 3.5,
  annualGapGross: 900,
  annualServiceGross: 2000,
  vehicleUse: "mixed",
  vatActivity: "uk-services",
  activityDeductionPercent: 100,
  co2Class: "atLeast50",
  buyoutDestination: "private",
};

export function readLeasingSettings(): LeasingSettings {
  try {
    const stored = globalThis.localStorage?.getItem(LEASING_STORAGE_KEY);
    return stored
      ? { ...defaultLeasingSettings, ...JSON.parse(stored) }
      : defaultLeasingSettings;
  } catch {
    return defaultLeasingSettings;
  }
}

export function saveLeasingSettings(settings: LeasingSettings) {
  try {
    globalThis.localStorage?.setItem(
      LEASING_STORAGE_KEY,
      JSON.stringify(settings),
    );
  } catch {
    // Brak localStorage nie powinien blokować kalkulatora.
  }
}

export type LeasingResult = {
  assetBaseNet: number;
  upfrontNet: number;
  monthlyNet: number;
  monthlyGross: number;
  monthlyAfterVat: number;
  buyoutNet: number;
  totalNet: number;
  totalVat: number;
  deductibleVatPercent: number;
  deductibleVat: number;
  deductibleVatOnBuyout: number;
  totalCashOutflow: number;
  effectiveLeaseCost: number;
  effectiveCashCost: number;
  financingPremium: number;
  netFeePercent: number;
  annualInsuranceGross: number;
  totalInsuranceGross: number;
  totalGapGross: number;
  totalServiceGross: number;
  deductibleServiceVat: number;
  additionalRunningCashOutflow: number;
  effectiveRunningCost: number;
  monthlyRunningCost: number;
  monthlyBudgetAfterVat: number;
  totalOwnershipCashOutflow: number;
  effectiveOwnershipCost: number;
  pitSaving: number;
  pitLimit2026: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function activityVatDeduction(
  activity: VatActivity,
  customPercent: number,
) {
  if (activity === "mixed") return clamp(customPercent, 0, 100) / 100;
  if (activity === "exempt") return 0;
  return 1;
}

export function effectiveVatDeduction(
  activity: VatActivity,
  customPercent: number,
  vehicleUse: VehicleUse,
) {
  const vehicleLimit = vehicleUse === "business" ? 1 : 0.5;
  return activityVatDeduction(activity, customPercent) * vehicleLimit;
}

export function pitLimitFor2026(co2Class: Co2Class) {
  if (co2Class === "zero") return 225_000;
  if (co2Class === "below50") return 150_000;
  return 100_000;
}

export function calculateLeasing(input: LeasingInputs): LeasingResult {
  const grossPrice = Math.max(0, input.grossPrice);
  // Przy FV 23% leasingodawca finansuje cenę netto. Przy VAT-marża cała
  // cena zakupu jest dla niego bazą, a leasing jako usługa nadal ma 23% VAT.
  const assetBaseNet =
    input.invoiceKind === "vat23" ? grossPrice / (1 + VAT_RATE) : grossPrice;
  const upfrontNet = assetBaseNet * (clamp(input.upfrontPercent, 0, 90) / 100);
  const buyoutNet = assetBaseNet * (clamp(input.buyoutPercent, 0, 70) / 100);
  const termMonths = Math.max(1, Math.round(input.termMonths));
  const monthlyRate = clamp(input.annualRatePercent, 0, 100) / 100 / 12;
  const financedNet = Math.max(0, assetBaseNet - upfrontNet);
  const balloonPresentValue = buyoutNet / Math.pow(1 + monthlyRate, termMonths);
  const monthlyNet =
    monthlyRate === 0
      ? Math.max(0, financedNet - buyoutNet) / termMonths
      : (Math.max(0, financedNet - balloonPresentValue) * monthlyRate) /
        (1 - Math.pow(1 + monthlyRate, -termMonths));
  const adminFeeNet = Math.max(0, input.adminFeeNet);
  const totalNet =
    upfrontNet + monthlyNet * termMonths + buyoutNet + adminFeeNet;
  const totalVat = totalNet * VAT_RATE;
  const deductibleVatPercent = effectiveVatDeduction(
    input.vatActivity,
    input.activityDeductionPercent,
    input.vehicleUse,
  );
  const buyoutVat = buyoutNet * VAT_RATE;
  const deductibleVatOnBuyout =
    input.buyoutDestination === "business"
      ? buyoutVat * deductibleVatPercent
      : 0;
  const deductibleVat =
    (totalVat - buyoutVat) * deductibleVatPercent + deductibleVatOnBuyout;
  const totalCashOutflow = totalNet + totalVat;
  const effectiveLeaseCost = totalCashOutflow - deductibleVat;
  const monthlyGross = monthlyNet * (1 + VAT_RATE);
  const monthlyAfterVat =
    monthlyGross - monthlyNet * VAT_RATE * deductibleVatPercent;
  const years = termMonths / 12;
  const annualInsuranceGross =
    grossPrice * (clamp(input.annualInsurancePercent, 0, 30) / 100);
  const totalInsuranceGross = annualInsuranceGross * years;
  const totalGapGross = Math.max(0, input.annualGapGross) * years;
  const totalServiceGross = Math.max(0, input.annualServiceGross) * years;
  const deductibleServiceVat =
    (totalServiceGross * VAT_RATE * deductibleVatPercent) / (1 + VAT_RATE);
  const additionalRunningCashOutflow =
    totalInsuranceGross + totalGapGross + totalServiceGross;
  const effectiveRunningCost =
    additionalRunningCashOutflow - deductibleServiceVat;
  const monthlyRunningCost = effectiveRunningCost / termMonths;
  const monthlyBudgetAfterVat = monthlyAfterVat + monthlyRunningCost;
  const totalOwnershipCashOutflow =
    totalCashOutflow + additionalRunningCashOutflow;
  const effectiveOwnershipCost = effectiveLeaseCost + effectiveRunningCost;

  const cashInputVat =
    input.invoiceKind === "vat23"
      ? grossPrice - grossPrice / (1 + VAT_RATE)
      : 0;
  const effectiveCashCost = grossPrice - cashInputVat * deductibleVatPercent;

  return {
    assetBaseNet,
    upfrontNet,
    monthlyNet,
    monthlyGross,
    monthlyAfterVat,
    buyoutNet,
    totalNet,
    totalVat,
    deductibleVatPercent,
    deductibleVat,
    deductibleVatOnBuyout,
    totalCashOutflow,
    effectiveLeaseCost,
    effectiveCashCost,
    financingPremium: effectiveLeaseCost - effectiveCashCost,
    netFeePercent: assetBaseNet > 0 ? (totalNet / assetBaseNet) * 100 : 0,
    annualInsuranceGross,
    totalInsuranceGross,
    totalGapGross,
    totalServiceGross,
    deductibleServiceVat,
    additionalRunningCashOutflow,
    effectiveRunningCost,
    monthlyRunningCost,
    monthlyBudgetAfterVat,
    totalOwnershipCashOutflow,
    effectiveOwnershipCost,
    // Ryczałt 12% jest liczony od przychodu, więc raty nie tworzą KUP.
    pitSaving: 0,
    pitLimit2026: pitLimitFor2026(input.co2Class),
  };
}
