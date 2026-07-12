export type EquipmentEvidence = {
  confirmed: boolean;
  rejectedAsMarketing: boolean;
  evidence?: string;
};

const marketing =
  /(oferta promocyjna|dodatkow(?:e|ych) akcesori|oferujemy|szeroki wybór produktów|cena regularna|cena specjalna|w ofercie specjalnej|zależnie od modelu|możliwość montażu|usługa montażu|dokupić|doposażenie)/i;

export function equipmentEvidence(
  text: string,
  phrase: RegExp,
  strongEvidence?: RegExp,
): EquipmentEvidence {
  if (strongEvidence) {
    const match = text.match(strongEvidence);
    if (match)
      return {
        confirmed: true,
        rejectedAsMarketing: false,
        evidence: match[0].slice(0, 180),
      };
  }

  const flags = phrase.flags.includes("g") ? phrase.flags : `${phrase.flags}g`;
  const globalPhrase = new RegExp(phrase.source, flags);
  let rejectedAsMarketing = false;
  for (const match of text.matchAll(globalPhrase)) {
    const start = Math.max(0, (match.index || 0) - 320);
    const end = Math.min(
      text.length,
      (match.index || 0) + match[0].length + 320,
    );
    const context = text.slice(start, end);
    const explicitInstallation =
      /(?:auto|samochód|pojazd).{0,100}(?:ma|posiada|wyposażon[ey]|jest wyposażon[ey]).{0,100}$/i.test(
        text.slice(Math.max(0, (match.index || 0) - 220), match.index),
      );
    if (marketing.test(context) && !explicitInstallation) {
      rejectedAsMarketing = true;
      continue;
    }
    return {
      confirmed: true,
      rejectedAsMarketing,
      evidence: match[0].slice(0, 180),
    };
  }
  return { confirmed: false, rejectedAsMarketing };
}
