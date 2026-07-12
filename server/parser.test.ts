import { describe, expect, it } from "vitest";
import { parseListingHtml } from "./parser";

const validOffer = `<!doctype html><html><head><title>Toyota Corolla Touring Sports 2023</title>
<script type="application/ld+json">{"@type":"Product","description":"Zadbana Corolla z pełną historią serwisową.","image":["https://cdn.example/car-1.jpg","https://cdn.example/car-2.jpg"],"offers":{"price":"101900"}}</script></head><body>
<h1>Corolla Touring Sports 1.8 Hybrid 140 KM Comfort + Tech</h1>
<p>Rok produkcji: 2023. Przebieg: 61 200 km. Automatyczna skrzynia e-CVT. Kamera cofania.
Salon Polska, pełna historia ASO, 1 właściciel, bezwypadkowy, FV 23%.
VIN SB1ZB3AE20E040424.</p></body></html>`;

describe("listing parser", () => {
  it("parses the wording used by Toyota Pewne Auto offer 409278", () => {
    const parsed = parseListingHtml(`
      <html><head><title>Toyota Corolla Kombi 2023 99 900 zł</title></head><body>
      <h1>Toyota Corolla 1.8 Hybrid Style</h1>
      Rok produkcji 2023. Przebieg 47 627 km. Rodzaj nadwozia Kombi.
      Moc 140 KM. Skrzynia biegów Automatyczna. Kraj pochodzenia Polska.
      Promocyjna cena samochodu 99.900 zł dotyczy zakupu samochodu w finansowaniu Toyota Leasing Polska.
      Regularna cena samochodu 102.500 zł przy zakupie za gotówkę.
      Samochód zakupiony w polskim salonie pochodzący z polskiej sieci dealerskiej.
      Udokumentowana historia serwisowa ASO. 1 Właściciel. Auto zawsze serwisowane. Rok Gwarancji.
      Kamera cofania. Czujniki parkowania przednie. Czujniki parkowania tylne.
      </body></html>
    `);

    expect(parsed.price).toBe(99900);
    expect(parsed.cashPrice).toBe(102500);
    expect(parsed.aso).toBe(true);
    expect(parsed.polishSalon).toBe(true);
    expect(parsed.oneOwner).toBe(true);
    expect(parsed.toyotaWarranty).toBe(true);
    expect(parsed.noStructuralDamage).toBe(false);
  });

  it("prefers the real Pewne Auto description and parses concise dealer wording", () => {
    const parsed = parseListingHtml(`
      <html><head>
        <title>Oferta Toyota Corolla 2.0 Hybryda 2024</title>
        <script type="application/ld+json">{"@type":"Product","description":"Samochody używane marki Toyota","offers":{"price":107900}}</script>
      </head><body>
        <strong>Toyota Corolla 2.0 Style, Hybryda, salon Polska, serwis ASO, FV 23%.</strong>
        <div class="vdp-description"><div class="vdp-description__content">
          Opis samochodu: Toyota Corolla 2.0 Style, Hybryda, salon Polska, serwis ASO, FV 23%.
          Gwarancja Pewne Auto/Lexus Select. Przebieg 60 000 km. Nadwozie Kombi.
          Kamera cofania. Czujniki parkowania przednie i tylne. Skrzynia automatyczna.
        </div></div>
      </body></html>
    `);

    expect(parsed.description).toContain("Opis samochodu");
    expect(parsed.description).not.toBe("Samochody używane marki Toyota");
    expect(parsed.trim).toBe("Style");
    expect(parsed.aso).toBe(true);
    expect(parsed.toyotaWarranty).toBe(true);
  });

  it("recognizes the Pewne Auto warranty badge", () => {
    const parsed = parseListingHtml(`
      <html><head><title>Toyota Corolla Kombi 2023 95 000 zł</title></head><body>
        <div class="vdp-header__title__tags"><span>VAT 23%</span><span>Gwarancja</span></div>
        <div class="vdp-description__content">Toyota Corolla 1.8 Hybrid Comfort. Rok produkcji 2023. Przebieg 60 000 km. Kombi. Automat. Kamera cofania. Czujniki parkowania.</div>
      </body></html>
    `);
    expect(parsed.toyotaWarranty).toBe(true);
  });

  it("recognizes a standalone ASO tag in the Pewne Auto header", () => {
    const parsed = parseListingHtml(`
      <html><head><title>Oferta samochodu Toyota Corolla 2023</title></head><body>
        <h1>Toyota Corolla</h1>
        <strong>1.8 Hybrid Style | ASO | VAT 23% | Bezwypadkowy | Salon PL |</strong>
        <div class="vdp-description__content">
          Toyota Corolla Hybrid Kombi. Rok produkcji 2023. Przebieg 46 255 km.
          Skrzynia automatyczna. Kamera cofania. Czujniki parkowania.
        </div>
      </body></html>
    `);
    expect(parsed.aso).toBe(true);
    expect(parsed.oneOwner).toBe(false);
  });

  it("extracts identifiers required by Historia Pojazdu", () => {
    const parsed = parseListingHtml(`
      <html><head><title>Toyota Corolla Kombi 2023 109 900 zł</title></head><body>
        Rok produkcji 2023. Przebieg 46 255 km. Numer rejestracyjny PL9316G.
        VIN SB1ZB3AEX0E073865. Data pierwszej rejestracji 2024-01-12.
      </body></html>
    `);
    expect(parsed.registrationNumber).toBe("PL9316G");
    expect(parsed.vin).toBe("SB1ZB3AEX0E073865");
    expect(parsed.firstRegistrationDate).toBe("2024-01-12");
  });

  it("recognizes a reserved offer without treating a reserve button as status", () => {
    const reserved = parseListingHtml(`
      <html><head><title>Toyota Corolla Kombi 2023 95 000 zł</title></head><body>
        <div class="vdp-header__title__tags">Zarezerwowany</div>
        Toyota Corolla Hybrid Kombi. Przebieg 60 000 km. Automat.
      </body></html>
    `);
    const available = parseListingHtml(`
      <html><head><title>Toyota Corolla Kombi 2023 95 000 zł</title></head><body>
        Toyota Corolla Hybrid Kombi. Przebieg 60 000 km. <button>Zarezerwuj</button>
      </body></html>
    `);
    expect(reserved.reserved).toBe(true);
    expect(available.reserved).toBe(false);
  });

  it("does not confuse a financing mileage limit with vehicle mileage", () => {
    const parsed = parseListingHtml(`
      <html><head>
        <title>Toyota Corolla Kombi 2024 107 900 zł</title>
        <meta property="og:description" content="Rejestracja 16.04.2024 | Przebieg 74 386 km | Moc 196 KM">
      </head><body>
        Toyota Corolla 2.0 Hybrid Style. Automat. Kamera cofania. Czujniki parkowania.
        Wpłata własna 15%, umowa 36 miesięcy, limit przebiegu: 15000 km.
        Program obejmuje auta posiadające przebieg nie większy niż 185 000 km.
      </body></html>
    `);
    expect(parsed.mileage).toBe(74386);
  });

  it("normalizes hybrid system power and cash surcharge wording", () => {
    const parsed = parseListingHtml(`
      <html><head><title>Toyota Corolla 2.0 Hybryda 2025 132 000 zł</title></head><body>
        Toyota Corolla 2.0 Hybrid Style Kombi. Rok produkcji 2025. Przebieg 28 646 km.
        Moc 133 KM. Automat. Kamera cofania. Czujniki parkowania. I właściciel.
        Dokonując płatności gotówką do podanej ceny należy doliczyć 4000 zł brutto.
      </body></html>
    `);
    expect(parsed.power).toBe(196);
    expect(parsed.oneOwner).toBe(true);
    expect(parsed.cashPrice).toBe(136000);
  });

  it("does not use accessory JSON-LD as the vehicle price", () => {
    const parsed = parseListingHtml(`
      <html><head><title>Toyota Corolla 2.0 Hybryda 2025 138 900 zł</title>
      <script type="application/ld+json">{"@type":"Product","name":"Nakładki progowe","offers":{"price":1107}}</script>
      </head><body>Toyota Corolla 2.0 Hybrid Kombi. Rok produkcji 2025. Przebieg 13 761 km.</body></html>
    `);
    expect(parsed.price).toBe(138900);
  });

  it("prefers Pewne Auto retail price over installment and accessory prices", () => {
    const parsed = parseListingHtml(`
      <html><head><title>Toyota Corolla 2.0 Hybryda 2025 1 583 zł brutto/mies.</title>
      <script type="application/ld+json">{"@type":"Product","name":"Nakładki progowe","offers":{"price":1107}}</script>
      </head><body><p class="retail-price"><strong>138 900</strong><small>zł brutto</small></p>
      Toyota Corolla 2.0 Hybrid Kombi. Rok produkcji 2025. Przebieg 13 761 km.</body></html>
    `);
    expect(parsed.price).toBe(138900);
  });

  it("does not accept Auris or portal-wide hybrid marketing as a hybrid Corolla", () => {
    const auris = parseListingHtml(`
      <html><head><title>Toyota Auris Kombi 2013 30 000 zł</title></head><body>
      Toyota Auris Hybrid Kombi. Rok produkcji 2013. Przebieg 335 000 km.
      </body></html>
    `);
    const petrol = parseListingHtml(`
      <html><head><title>Toyota Corolla 1.2 Benzyna Kombi 2021 69 900 zł</title></head><body>
      <div class="vdp-description__content">Toyota Corolla 1.2 Benzyna Kombi. Rok produkcji 2021. Przebieg 67 004 km.</div>
      <footer>Poznaj zalety napędu Hybrid</footer>
      </body></html>
    `);
    expect(auris.eligibleBody).toBe(false);
    expect(petrol.hybrid).toBe(false);
  });

  it("extracts critical fields from a valid Touring Sports offer", () => {
    const result = parseListingHtml(validOffer);
    expect(result).toMatchObject({
      price: 101900,
      mileage: 61200,
      year: 2023,
      power: 140,
      eligibleBody: true,
      camera: true,
      ecvt: true,
      hybrid: true,
      vin: "SB1ZB3AE20E040424",
      description: "Zadbana Corolla z pełną historią serwisową.",
      images: [
        "https://cdn.example/car-1.jpg",
        "https://cdn.example/car-2.jpg",
      ],
    });
  });

  it("rejects Corolla Cross even when generic page text mentions kombi", () => {
    const result = parseListingHtml(
      validOffer.replace(
        "Corolla Touring Sports 2023",
        "Toyota Corolla Cross 2023",
      ),
    );
    expect(result.eligibleBody).toBe(false);
  });

  it("reads a Pewne Auto price containing a non-breaking space before falling back to installments", () => {
    const html = `<title>Oferta samochodu Toyota Corolla 1.8 Hybryda 2024 109 900 zł brutto Toyota Warszawa</title><body>Rata 1 107 zł. Rok produkcji 2024. Przebieg 45 302 km. Touring Sports 1.8 Hybrid 140 KM e-CVT kamera cofania.</body>`;
    expect(parseListingHtml(html).price).toBe(109900);
  });

  it("distinguishes parking sensors from a reversing camera", () => {
    const cameraOnly = parseListingHtml(
      "<title>Corolla 2023 99 900 zł</title><body>Touring Sports, kamera cofania</body>",
    );
    const withSensors = parseListingHtml(
      "<title>Corolla 2023 99 900 zł</title><body>Touring Sports, kamera cofania, przednie i tylne czujniki parkowania</body>",
    );
    expect(cameraOnly.parkingSensors).toBe(false);
    expect(withSensors.parkingSensors).toBe(true);
  });

  it("does not mistake a mileage ending in km for engine power", () => {
    const parsed = parseListingHtml(
      "<title>Corolla 2023 99 900 zł</title><body>Przebieg 44 356 km. Moc 140 KM.</body>",
    );
    expect(parsed.power).toBe(140);
  });

  it("accepts a 2.0 Hybrid as a hybrid candidate", () => {
    const parsed = parseListingHtml(
      "<title>Corolla Touring Sports 2.0 Hybrid Style</title><body>Rok produkcji 2023. Przebieg 65 000 km. Cena 104 900 zł. Moc 196 KM. Automatyczna e-CVT. Kamera cofania. Czujniki parkowania.</body>",
    );
    expect(parsed.hybrid).toBe(true);
    expect(parsed.power).toBe(196);
    expect(parsed.eligibleBody).toBe(true);
  });

  it("does not treat an accessory promotion as installed parking sensors", () => {
    const parsed =
      parseListingHtml(`<title>Corolla Touring Sports Hybrid</title><body>
      Oferta Promocyjna! Szukasz dodatkowych akcesoriów? Oferujemy haki, opony i czujniki parkowania.
      Przykładowe ceny: Czujniki parkowania przednie: cena regularna 1600 zł,
      w ofercie specjalnej 800 zł (zależnie od modelu).
    </body>`);
    expect(parsed.parkingSensors).toBe(false);
    expect(parsed.sensorsMentionRejectedAsMarketing).toBe(true);
  });

  it("extracts a cash surcharge from a financing-only promotional price", () => {
    const parsed = parseListingHtml(`<title>Corolla 2023 89 899 zł</title><body>
      Rok produkcji 2023. Przebieg 44 356 km. Cena 89 899 zł.
      W przypadku zakupu z własnych środków do ceny zostanie doliczona kwota 2000 zł.
    </body>`);
    expect(parsed.price).toBe(89899);
    expect(parsed.cashPrice).toBe(91899);
  });
});
