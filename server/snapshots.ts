import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import type { SnapshotMeta, Store } from "./store";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const directory = resolve("data/snapshots");

export async function saveSnapshot(
  db: Store,
  source: string,
  url: string,
  html: string,
): Promise<SnapshotMeta> {
  const capturedAt = new Date().toISOString();
  const hash = createHash("sha256").update(html).digest("hex");
  const id = hash;
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, `${id}.html.gz`), await gzipAsync(html), {
    flag: "wx",
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  const existing = db.snapshots?.find(
    (item) => item.id === id && item.url === url && item.source === source,
  );
  if (existing) {
    existing.capturedAt = capturedAt;
    existing.active = true;
    return existing;
  }
  const meta = {
    id,
    source,
    url,
    capturedAt,
    bytes: Buffer.byteLength(html),
    active: true,
  };
  (db.snapshots ||= []).push(meta);
  return meta;
}

export async function readSnapshot(id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Nieprawidłowy snapshot");
  return (
    await gunzipAsync(await readFile(resolve(directory, `${id}.html.gz`)))
  ).toString("utf8");
}

export function latestSnapshots(snapshots: SnapshotMeta[]) {
  const latest = new Map<string, SnapshotMeta>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.source}:${snapshot.url}`;
    const previous = latest.get(key);
    if (!previous || previous.capturedAt < snapshot.capturedAt)
      latest.set(key, snapshot);
  }
  return [...latest.values()];
}
