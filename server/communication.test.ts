import { describe, expect, it } from "vitest";
import type { Car } from "../src/types";
import { testCars } from "../src/data";
import {
  applyCommunicationUpdate,
  CommunicationValidationError,
} from "./communication";
import type { Store } from "./store";

const storeWithCar = (): Store => ({
  cars: [{ ...testCars[0], listings: [...testCars[0].listings] }],
  jobs: [],
});

describe("komunikacja ze sprzedającym", () => {
  it("zapisuje status, kontakty i raport AI", () => {
    const store = storeWithCar();
    const car = applyCommunicationUpdate(
      store,
      (store.cars[0] as Car).id,
      {
        status: "awaiting_reply",
        contacts: [
          {
            id: "mail-1",
            occurredAt: "2026-07-30T08:30:00Z",
            direction: "outbound",
            channel: "email",
            summary: "Pytania o historię serwisową",
          },
        ],
        aiReport: {
          generatedAt: "2026-07-30T09:00:00Z",
          summary: "Oczekujemy na dokumenty.",
          confidence: 0.9,
          risks: ["Brak odpowiedzi o naprawach"],
        },
      },
      "2026-07-30T09:05:00Z",
    )!;

    expect(car.communication).toMatchObject({
      status: "awaiting_reply",
      statusUpdatedAt: "2026-07-30T09:05:00Z",
      contacts: [{ id: "mail-1", channel: "email" }],
      aiReport: { confidence: 0.9 },
    });
  });

  it("aktualizuje sam status bez usuwania historii i raportu", () => {
    const store = storeWithCar();
    const id = (store.cars[0] as Car).id;
    applyCommunicationUpdate(
      store,
      id,
      {
        contacts: [
          {
            direction: "inbound",
            channel: "phone",
            summary: "Telefon od sprzedającego",
          },
        ],
        aiReport: { summary: "Sprzedający odpowiedział." },
      },
      "2026-07-30T10:00:00Z",
    );
    const car = applyCommunicationUpdate(
      store,
      id,
      { status: "seller_replied" },
      "2026-07-30T11:00:00Z",
    )!;

    expect(car.communication?.contacts).toHaveLength(1);
    expect(car.communication?.aiReport?.summary).toBe(
      "Sprzedający odpowiedział.",
    );
  });

  it("odrzuca nieprawidłowy status i raport", () => {
    const store = storeWithCar();
    const id = (store.cars[0] as Car).id;
    expect(() =>
      applyCommunicationUpdate(store, id, { status: "unknown" }),
    ).toThrow(CommunicationValidationError);
    expect(() =>
      applyCommunicationUpdate(store, id, {
        aiReport: { summary: "Test", confidence: 4 },
      }),
    ).toThrow(/od 0 do 1/);
  });
});
