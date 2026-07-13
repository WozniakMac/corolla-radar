import { load as htmlLoad } from "cheerio";
import { detectEngineSpec } from "../src/engine";
import { resolvePolishCity } from "./distance";
import { equipmentEvidence } from "./equipmentEvidence";
const textMatch = (text: string, re: RegExp) => re.test(text.toLowerCase());
const numberNear = (text: string, re: RegExp) => {
  const m = text.match(re);
  return m ? Number(m[1].replace(/[^0-9]/g, "")) : 0;
};
const priceFromTitle = (title: string) => {
  for (const match of title.matchAll(
    /(?<!\d)(\d{2,3}(?:[\s.]\d{3})+)\s*(?:PLN|zł)/gi,
  )) {
    const value = Number(match[1].replace(/[^0-9]/g, ""));
    if (value >= 50000 && value <= 300000) return value;
  }
  return 0;
};
const mileageFromOfferText = (text: string) => {
  for (const match of text.matchAll(
    /(?:przebieg)[^0-9]{0,20}([0-9][0-9 .\u00a0]{2,})\s*km/gi,
  )) {
    const before = text.slice(
      Math.max(0, (match.index || 0) - 100),
      match.index,
    );
    const context = `${before} ${match[0]}`;
    if (
      /limit(?:u|em)?\s+przebiegu|limit[^.!]{0,30}przebiegu|roczny przebieg|przebieg nie (?:większy|wiekszy)|maksymalny przebieg/i.test(
        context,
      )
    )
      continue;
    const value = Number(match[1].replace(/[^0-9]/g, ""));
    if (value >= 1000 && value <= 500000) return value;
  }
  return 0;
};
export async function fetchAndParse(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const response = await fetch(url, {
    redirect: "follow",
    signal: controller.signal,
    headers: {
      "user-agent": "Mozilla/5.0 CorollaRadar/1.0 (private purchase assistant)",
      "accept-language": "pl-PL,pl;q=.9",
    },
  });
  clearTimeout(timer);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const finalUrl = response.url;
  const html = await response.text();
  return { ...parseListingHtml(html, finalUrl), rawHtml: html };
}

export function parseListingHtml(
  html: string,
  finalUrl = "https://example.invalid/oferta",
) {
  const $ = htmlLoad(html);
  const title = $("title").text().trim() || $("h1").first().text().trim();
  const jsonLd = $('script[type="application/ld+json"]')
    .map((_, e) => $(e).text())
    .get()
    .flatMap((raw) => {
      try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v : [v];
      } catch {
        return [];
      }
    });
  $("script,style,noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const product = jsonLd
    .filter((value: any) =>
      ["Product", "Vehicle", "Car"].includes(value?.["@type"]),
    )
    .sort((a: any, b: any) => {
      const score = (value: any) =>
        (["Vehicle", "Car"].includes(value?.["@type"]) ? 10 : 0) +
        (/corolla/i.test(`${value?.name || ""} ${value?.description || ""}`)
          ? 8
          : 0) +
        (Number(value?.offers?.price) >= 40000 ? 6 : 0);
      return score(b) - score(a);
    })[0] as any;
  const metaDescription = $('meta[name="description"]').attr("content")?.trim();
  const ogDescription = $('meta[property="og:description"]')
    .attr("content")
    ?.trim();
  const offerTags = $(".vdp-header__title__tags")
    .text()
    .replace(/\s+/g, " ")
    .trim();
  const descriptionSelectors = [
    ".vdp-description__content",
    ".vdp-description",
    '[data-testid="content-description-section"]',
    '[data-cy="ad_description"]',
    ".offer-description",
    ".description",
    "#description",
  ];
  const selectedDescription = descriptionSelectors
    .map((selector) => $(selector).first().text().replace(/\s+/g, " ").trim())
    .find((value) => value && value.length > 80);
  const description = String(
    selectedDescription || product?.description || metaDescription || "",
  ).slice(0, 12000);
  const imageCandidates: string[] = [];
  const addImage = (value: unknown) => {
    for (const item of Array.isArray(value) ? value : [value]) {
      const url =
        typeof item === "string"
          ? item
          : (item as any)?.url || (item as any)?.contentUrl;
      if (
        typeof url === "string" &&
        /^https?:\/\//.test(url) &&
        !/(logo|icon|avatar|sprite|placeholder)/i.test(url)
      )
        imageCandidates.push(url);
    }
  };
  addImage(product?.image);
  addImage($('meta[property="og:image"]').attr("content"));
  $("img[src], img[data-src], source[srcset]").each((_, element) => {
    const raw =
      $(element).attr("data-src") ||
      $(element).attr("src") ||
      $(element).attr("srcset")?.split(/[ ,]/)[0];
    if (raw && /(image|photo|media|apollo|otomoto|olxcdn|pewneauto)/i.test(raw))
      addImage(raw);
  });
  const images = [...new Set(imageCandidates)].slice(0, 12);
  const pageVehiclePrice = Number(
    $(".retail-price strong")
      .first()
      .text()
      .replace(/[^0-9]/g, ""),
  );
  const price =
    priceFromTitle(title) ||
    (pageVehiclePrice >= 40000 ? pageVehiclePrice : 0) ||
    Number(product?.offers?.price) ||
    numberNear(text, /(?:cena|price)[^0-9]{0,20}([0-9][0-9 .]{3,})/i) ||
    numberNear(text, /([0-9][0-9 .]{3,})\s*zł/i);
  const explicitCashPrice =
    numberNear(
      text,
      /(?:zakupie gotówkowym|zakupie z własnych środków|płatności gotówką)[^.!]{0,100}cena(?: pojazdu)?(?: wynosi)?[^0-9]{0,20}([0-9][0-9 .]{3,})\s*zł/i,
    ) ||
    numberNear(
      text,
      /(?:regularna\s+)?cena(?: samochodu| pojazdu)?[^0-9]{0,20}([0-9][0-9 .]{3,})\s*zł[^.!]{0,80}(?:przy\s+)?zakupie\s+za\s+gotówkę/i,
    );
  const cashSurcharge =
    numberNear(
      text,
      /(?:zakup(?:u|ie)? z własnych środków|zakup(?:u|ie)? gotówkowego|płatności gotówką)[^.!]{0,160}(?:doliczon|dopłat)[^0-9]{0,30}([0-9][0-9 .]{2,})\s*zł/i,
    ) ||
    numberNear(
      text,
      /(?:płatności(?:ą)?|zakupie za) gotówk[^.!]{0,120}(?:dolicz|dopłat)[^0-9]{0,30}([0-9][0-9 .]{2,})\s*zł/i,
    );
  const cashPrice =
    explicitCashPrice || (cashSurcharge ? price + cashSurcharge : price);
  const structuredMileage = Number(
    product?.mileageFromOdometer?.value ||
      product?.mileageFromOdometer ||
      product?.mileage,
  );
  const mileage =
    structuredMileage ||
    mileageFromOfferText(ogDescription || "") ||
    mileageFromOfferText(metaDescription || "") ||
    mileageFromOfferText(text);
  const year =
    numberNear(text, /(?:rok produkcji|rocznik)[^0-9]{0,20}(20\d{2})/i) ||
    numberNear(title, /(20\d{2})/);
  const vin = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/)?.[1];
  const registrationNumber = text.match(
    /(?:numer rejestracyjny|nr rejestracyjny)\s*:?[ ]*([A-Z0-9]{4,10})/i,
  )?.[1];
  const firstRegistrationDate = text.match(
    /(?:data pierwszej rejestracji|pierwsza rejestracja)\s*:?[ ]*(\d{4}-\d{2}-\d{2}|\d{2}[.\/-]\d{2}[.\/-]\d{4})/i,
  )?.[1];
  const rawPower =
    text.match(
      /(?:moc(?: silnika)?|o mocy)\s*:?\s*(\d{2,3})\s*(?:KM|HP)\b/i,
    )?.[1] || text.match(/(?:hybrid|hev|hsd)\s+(\d{2,3})\s*(?:KM|HP)\b/i)?.[1];
  let power = rawPower ? Number(rawPower) : 0;
  const vehicleHeading = `${$("h1").first().text()} ${$(".vdp-header__title strong").first().text()}`;
  // Headers and the beginning of the offer describe the actual car. Full page
  // text often contains generic marketing for both Toyota hybrid engines.
  const modelText = `${title} ${vehicleHeading} ${ogDescription || ""} ${description.slice(0, 1600)}`;
  const engine = detectEngineSpec(year, modelText);
  if (engine) power = engine.power;
  const engineVersion = engine?.label;
  const eligibleBody =
    /corolla/i.test(`${title} ${description}`) &&
    !/\bauris\b/i.test(`${title} ${description}`) &&
    textMatch(title + " " + text.slice(0, 8000), /(touring sports|kombi)/) &&
    !textMatch(title, /(cross|sedan|hatchback)/) &&
    !/(rodzaj nadwozia|nadwozie)[^.;]{0,30}(sedan|hatchback|suv)/i.test(text);
  const cameraEvidence = equipmentEvidence(
    text,
    /(kamera cofania|kamera parkowania tył|rear.?view camera)/i,
    /(kamera parkowania tył|system kamer 360|panoramiczny system monitorowania)/i,
  );
  const sensorsEvidence = equipmentEvidence(
    text,
    /(czujniki? parkowania|czujniki? cofania|parking sensors?|system ics|inteligentne czujniki odległości)/i,
    /(kontrola odległości z przodu|kontrola odległości z tyłu|asystent parkowania \(park assistant\)|system ics)/i,
  );
  const camera = cameraEvidence.confirmed;
  const parkingSensors = sensorsEvidence.confirmed;
  const feature = (pattern: RegExp, strongPattern = pattern) =>
    equipmentEvidence(text, pattern, strongPattern).confirmed;
  const equipment = {
    heatedWiperArea: feature(
      /podgrzewan.{0,25}(?:strefa|obszar|miejsce|wycieraczki).{0,25}(?:szyby|przedniej)/i,
    ),
    rainSensor: feature(/czujnik deszczu|wycieraczki.{0,30}deszczu/i),
    autoDimmingMirror: feature(
      /lusterko.{0,30}(?:elektrochromatyczne|samoczynnie przyciemnia)/i,
    ),
    foldingMirrors: feature(
      /(?:elektrycznie|automatycznie) składane lusterka/i,
    ),
    heatedSeats: feature(/podgrzewane (?:przednie )?(?:fotele|siedzenia)/i),
    lumbarAdjustment: feature(/elektryczn.{0,35}(?:lędźwi|ledzwi)/i),
    heatedSteeringWheel: feature(/podgrzewan.{0,20}kierownic/i),
    keyless: feature(/smart entry|keyless|bezkluczyk/i),
    wirelessCharging: feature(
      /bezprzewodow.{0,30}(?:ładow|ladow)|ładowarka indukcyjna/i,
    ),
    ics: feature(/\bICS\b|inteligentn.{0,35}(?:czujnik|wykrywanie przeszkód)/i),
    hybridHealthCheck:
      /hybrid (?:health )?check|test (?:baterii|akumulatora) hybryd|kontrola akumulatora trakcyjnego/i.test(
        text,
      ),
    toyotaWarranty:
      /\bgwarancja\b/i.test(offerTags) ||
      /toyota relax|battery care|12.{0,15}miesięcy.{0,20}gwarancji|rok gwarancji|gwarancja toyot|pewne auto.{0,80}gwaranc|gwarancja.{0,30}pewne auto/i.test(
        text,
      ),
  };
  const history = {
    polishSalon:
      /salon polska|polski salon|zakupion.{0,30}w polskim salonie|pochodz.{0,30}z polskiej sieci dealerskiej|kraj pochodzenia\s*:?[ ]*polska/i.test(
        text,
      ),
    aso:
      /(?:pełn|udokumentowan).{0,24}histor.{0,30}(?:serwisow.{0,12})?aso|serwisowan.{0,20}(?:w )?aso|serwis(?:owa|owy)?\s*(?:w )?aso/i.test(
        text,
      ) ||
      /(?:^|[|•])\s*ASO\s*(?:[|•]|$)/i.test(
        `${vehicleHeading} ${text.slice(0, 900)}`,
      ),
    oneOwner:
      /(?:^|\W)(?:1|I)\s*(?:właściciel|wlasciciel)|pierwszy właściciel/i.test(
        text,
      ),
    noStructuralDamage:
      /bezwypadkow|bez szkód konstrukcyjnych|brak szkód konstrukcyjnych/i.test(
        text,
      ),
  };
  const ecvt = textMatch(text, /(e-?cvt|bezstopniow|automatyczn)/);
  const explicitlyPetrol = /\b1[.,]2\s*(?:benzyna|turbo|vvti)/i.test(
    `${title} ${vehicleHeading}`,
  );
  const hybrid =
    !explicitlyPetrol &&
    textMatch(modelText, /(hybryd|hybrid|\bhev\b|\bhsd\b)/);
  const active =
    !/(ogłoszenie (?:nie jest|jest już) aktualne|oferta (?:nieaktualna|wygasła|zakończona)|strona nie istnieje|404 not found)/i.test(
      text,
    );
  const reserved =
    /zarezerwow|rezerwacja/i.test(offerTags) ||
    /(?:status|samochód|auto|pojazd|oferta).{0,35}zarezerwowan[ay]|zarezerwowan[ay].{0,35}(?:samochód|auto|pojazd|oferta)/i.test(
      `${title} ${description}`,
    );
  const rawLocation =
    html.match(
      /"(?:addressLocality|city|locationName)"\s*:\s*"([^"]{2,60})"/i,
    )?.[1] ||
    text.match(
      /(?:lokalizacja|miasto|adres)[^A-ZĄĆĘŁŃÓŚŹŻ]{0,12}([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}-]+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}-]+)?)/u,
    )?.[1];
  const location =
    resolvePolishCity(rawLocation, title, text)?.name || rawLocation;
  const trim =
    text.match(
      /(?:wersja wyposażenia|wersja)[^A-ZĄĆĘŁŃÓŚŹŻ0-9]{0,12}((?:Comfort|Active|Style|Executive|GR Sport)(?:\s*\+?\s*(?:Tech|Business))?)/i,
    )?.[1] ||
    `${title} ${text.slice(0, 3000)}`
      .match(
        /Toyota\s+Corolla.{0,80}?\b(Comfort|Active|Style|Executive|GR Sport)(?:\s*\+?\s*(Tech|Business))?/i,
      )
      ?.slice(1, 3)
      .filter(Boolean)
      .join(" + ");
  const seller = text
    .match(
      /(?:sprzedawca|dealer|diler)[^A-ZĄĆĘŁŃÓŚŹŻ0-9]{0,15}([A-ZĄĆĘŁŃÓŚŹŻ][^|•]{2,60})/i,
    )?.[1]
    ?.trim();
  return {
    finalUrl,
    title,
    price,
    cashPrice,
    mileage,
    year,
    vin,
    registrationNumber,
    firstRegistrationDate,
    power,
    engineVersion,
    eligibleBody,
    camera,
    parkingSensors,
    ...equipment,
    ...history,
    cameraMentionRejectedAsMarketing: cameraEvidence.rejectedAsMarketing,
    sensorsMentionRejectedAsMarketing: sensorsEvidence.rejectedAsMarketing,
    ecvt,
    hybrid,
    active,
    reserved,
    location,
    trim,
    seller,
    description,
    images,
    text: text.slice(0, 12000),
  };
}
