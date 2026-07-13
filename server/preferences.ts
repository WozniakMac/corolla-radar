import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { normalizeFilters } from "../src/filters";
import type { FilterState } from "../src/types";

const path = resolve("data/preferences.json");

export async function loadSavedFilters(): Promise<FilterState | null> {
  try {
    const data = JSON.parse(await readFile(path, "utf8"));
    return data.filters ? normalizeFilters(data.filters) : null;
  } catch {
    return null;
  }
}

export async function saveFilters(value: unknown) {
  const filters = normalizeFilters(value);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ filters }, null, 2));
  await rename(temporary, path);
  return filters;
}

export async function resetFilters() {
  await unlink(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
