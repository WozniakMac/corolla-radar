import { describe, expect, it } from "vitest";
import { hasAcceptableVatInvoice } from "./saleTerms";

describe("akceptowalna faktura VAT", () => {
  it("akceptuje jednoznaczną fakturę VAT 23%", () => {
    expect(
      hasAcceptableVatInvoice(
        "Wersja Comfort + Tech. Faktura VAT 23% - cena brutto.",
      ),
    ).toBe(true);
    expect(
      hasAcceptableVatInvoice(
        "Toyota Corolla GR Sport. Sprzedaż na podstawie FV23.",
      ),
    ).toBe(true);
  });

  it("akceptuje fakturę VAT 23% także jako alternatywę dla VAT-marża", () => {
    expect(
      hasAcceptableVatInvoice(
        "Sprzedaż w oparciu o fakturę VAT 23% / VAT-marża.",
      ),
    ).toBe(true);
    expect(
      hasAcceptableVatInvoice(
        "Forma sprzedaży: VAT-marża lub faktura VAT 23%, zależnie od oferty.",
      ),
    ).toBe(true);
    expect(
      hasAcceptableVatInvoice("FV23 albo VAT-marża — wybór formy sprzedaży."),
    ).toBe(true);
  });

  it("akceptuje zwykłą fakturę VAT bez podanej stawki", () => {
    expect(hasAcceptableVatInvoice("Forma sprzedaży: faktura VAT.")).toBe(true);
    expect(hasAcceptableVatInvoice("Możliwa FVAT i leasing.")).toBe(true);
  });

  it("nie akceptuje samej faktury VAT-marża", () => {
    expect(hasAcceptableVatInvoice("Forma sprzedaży: Faktura VAT-marża.")).toBe(
      false,
    );
    expect(hasAcceptableVatInvoice("Sprzedaż wyłącznie FVAT marża.")).toBe(
      false,
    );
    expect(hasAcceptableVatInvoice("Umowa kupna-sprzedaży.")).toBe(false);
  });
});
