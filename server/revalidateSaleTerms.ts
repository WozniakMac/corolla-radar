import { parseListingHtml } from "./parser";
import { hasAcceptableVatInvoice } from "./saleTerms";
import { readSnapshot } from "./snapshots";
import { load, save } from "./store";

async function revalidateSaleTerms() {
  const store = await load();
  let listingsChecked = 0;
  let listingsChanged = 0;
  let carsChanged = 0;
  const errors: string[] = [];

  for (const car of store.cars as any[]) {
    for (const listing of car.listings || []) {
      if (!listing.active || !listing.snapshotId) continue;
      try {
        const html = await readSnapshot(listing.snapshotId);
        const parsed = parseListingHtml(html, listing.url);
        const vat23 = hasAcceptableVatInvoice(`${parsed.title} ${parsed.text}`);
        listingsChecked++;
        if (listing.vat23 === vat23) continue;
        listing.vat23 = vat23;
        listingsChanged++;
      } catch (error) {
        errors.push(
          `${listing.url}: ${error instanceof Error ? error.message : "błąd"}`,
        );
      }
    }

    const vat23 = (car.listings || []).some(
      (listing: any) => listing.active && listing.vat23 === true,
    );
    if (car.vat23 !== vat23) {
      car.vat23 = vat23;
      carsChanged++;
    }
  }

  if (listingsChanged || carsChanged) await save(store);
  return { listingsChecked, listingsChanged, carsChanged, errors };
}

revalidateSaleTerms()
  .then((result) => console.log(result))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
