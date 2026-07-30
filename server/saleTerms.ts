const VAT_23 = /\b(?:fvat|vat|fv)\s*23(?:\s*%)?/i;
const STANDARD_VAT_INVOICE = /\b(?:faktura\s+vat|fvat)\b(?!\s*[-–—]?\s*marż)/i;

export function hasAcceptableVatInvoice(text: string) {
  return VAT_23.test(text) || STANDARD_VAT_INVOICE.test(text);
}
