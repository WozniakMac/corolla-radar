import { describe, expect, it } from "vitest";
import { equipmentEvidence } from "./equipmentEvidence";

const sensors = (text: string) =>
  equipmentEvidence(
    text,
    /czujniki? parkowania/i,
    /kontrola odległości z przodu|kontrola odległości z tyłu/i,
  );

describe("dowody wyposażenia", () => {
  it("odrzuca reklamę promocyjną akcesoriów", () => {
    const result = sensors(`Oferta Promocyjna! Szukasz dodatkowych akcesoriów?
      Oferujemy haki, opony i czujniki parkowania. Przykładowe ceny:
      Czujniki parkowania przednie: cena regularna 1600 zł, w ofercie specjalnej 800 zł (zależnie od modelu).`);
    expect(result.confirmed).toBe(false);
    expect(result.rejectedAsMarketing).toBe(true);
  });

  it("akceptuje zwykłą listę wyposażenia auta", () => {
    expect(
      sensors(
        "Wyposażenie auta: kamera cofania, przednie i tylne czujniki parkowania, tempomat.",
      ),
    ).toMatchObject({ confirmed: true, rejectedAsMarketing: false });
  });

  it("preferuje strukturalne określenie systemu parkowania", () => {
    expect(
      sensors(
        "Systemy wspomagania: kontrola odległości z przodu, kontrola odległości z tyłu.",
      ),
    ).toMatchObject({ confirmed: true });
  });
});
