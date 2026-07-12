import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const zip = process.argv[2] || "/tmp/geonames-PL.zip";
const rows = execFileSync("unzip", ["-p", zip, "PL.txt"], {
  encoding: "utf8",
  maxBuffer: 20_000_000,
});
const comparable = (value) =>
  value
    .toLocaleLowerCase("pl")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l");
const displayName = (columns) =>
  columns[3]
    .split(",")
    .filter((alias) => comparable(alias) === comparable(columns[1]))
    .sort(
      (a, b) =>
        (b.match(/[ąćęłńóśźż]/gi)?.length || 0) -
        (a.match(/[ąćęłńóśźż]/gi)?.length || 0),
    )[0] || columns[1];
const places = rows
  .split("\n")
  .filter(Boolean)
  .map((line) => line.split("\t"))
  .filter((columns) => columns[6] === "P")
  .map((columns) => [
    displayName(columns),
    Number(columns[4]),
    Number(columns[5]),
    Number(columns[14]) || 0,
    columns[2] === columns[1] ? "" : columns[2],
  ]);

mkdirSync("server/data", { recursive: true });
writeFileSync("server/data/geonames-pl.json", JSON.stringify(places));
console.log(`Zapisano ${places.length} polskich miejscowości.`);
