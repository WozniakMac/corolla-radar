import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
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

export function snapshotsToRetain(
  snapshots: SnapshotMeta[],
  maxVersions: number,
  retentionDays: number,
  now = Date.now(),
) {
  if (maxVersions <= 0 && retentionDays <= 0) return new Set(snapshots);
  const cutoff =
    retentionDays > 0 ? now - retentionDays * 24 * 60 * 60 * 1000 : -Infinity;
  const groups = new Map<string, SnapshotMeta[]>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.source}:${snapshot.url}`;
    const group = groups.get(key) || [];
    group.push(snapshot);
    groups.set(key, group);
  }
  const retained = new Set<SnapshotMeta>();
  for (const group of groups.values()) {
    group
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
      .forEach((snapshot, index) => {
        const withinCount = maxVersions <= 0 || index < maxVersions;
        const withinAge =
          retentionDays <= 0 ||
          new Date(snapshot.capturedAt).getTime() >= cutoff;
        if (index === 0 || (withinCount && withinAge)) retained.add(snapshot);
      });
  }
  return retained;
}

export async function pruneSnapshots(
  db: Store,
  maxVersions = Number(process.env.SNAPSHOT_VERSIONS_PER_URL || 0),
  retentionDays = Number(process.env.SNAPSHOT_RETENTION_DAYS || 0),
) {
  const snapshots = db.snapshots || [];
  const retained = snapshotsToRetain(
    snapshots,
    Number.isFinite(maxVersions) ? Math.max(0, Math.floor(maxVersions)) : 0,
    Number.isFinite(retentionDays) ? Math.max(0, retentionDays) : 0,
  );
  if (retained.size === snapshots.length) return [];
  const retainedIds = new Set([...retained].map((snapshot) => snapshot.id));
  const removedIds = new Set(
    snapshots
      .filter((snapshot) => !retained.has(snapshot))
      .map((snapshot) => snapshot.id),
  );
  db.snapshots = snapshots.filter((snapshot) => retained.has(snapshot));
  return [...removedIds].filter((id) => !retainedIds.has(id));
}

export async function deletePrunedSnapshotFiles(ids: string[]) {
  for (const id of ids) {
    await unlink(resolve(directory, `${id}.html.gz`)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      },
    );
  }
}
