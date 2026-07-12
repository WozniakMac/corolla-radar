import { createHtmlAdapter } from "./discovery";

export const adapters = [
  createHtmlAdapter("pewneauto", "Toyota Pewne Auto", [
    "https://pewneauto.pl/oferty?brand=toyota&model=corolla",
  ]),
  createHtmlAdapter("otomoto", "OTOMOTO", [
    "https://www.otomoto.pl/osobowe/toyota/corolla?search%5Bfilter_enum_body_type%5D=combi&search%5Bfilter_enum_fuel_type%5D=hybrid",
  ]),
  createHtmlAdapter("olx", "OLX", [
    "https://www.olx.pl/motoryzacja/samochody/toyota/q-corolla-touring-sports-hybrid/",
  ]),
];
