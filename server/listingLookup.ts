import type { Car } from "../src/types";

export function normalizeListingUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Nieprawidłowy URL ogłoszenia");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("URL ogłoszenia musi używać protokołu HTTP lub HTTPS");
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.origin}${pathname}`;
}

export function findCarByListingUrl(cars: Car[], value: string) {
  const normalized = normalizeListingUrl(value);
  for (const car of cars) {
    const listing = car.listings.find((item) => {
      try {
        return normalizeListingUrl(item.url) === normalized;
      } catch {
        return false;
      }
    });
    if (listing) return { car, listing };
  }
  return undefined;
}
