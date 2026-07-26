import { randomUUID } from "node:crypto";
import type {
  PurchaseAnalysisRecord,
  PurchaseAnalysisResponse,
} from "../src/types";
import { load, save, type Store } from "./store";

export function appendPurchaseAnalysis(
  store: Store,
  record: PurchaseAnalysisRecord,
) {
  (store.purchaseAnalyses ||= []).push(record);
  return record;
}

export async function savePurchaseAnalysis(
  response: PurchaseAnalysisResponse,
): Promise<PurchaseAnalysisRecord> {
  const record = { id: randomUUID(), ...response };
  for (let attempt = 0; attempt < 5; attempt++) {
    const store = await load();
    appendPurchaseAnalysis(store, record);
    try {
      await save(store);
      return record;
    } catch (error) {
      if (
        attempt === 4 ||
        !(error instanceof Error) ||
        !/Magazyn zmienił się/.test(error.message)
      )
        throw error;
    }
  }
  throw new Error("Nie udało się zapisać historii analizy");
}

export async function purchaseAnalysisHistory() {
  return [...((await load()).purchaseAnalyses || [])].reverse();
}
