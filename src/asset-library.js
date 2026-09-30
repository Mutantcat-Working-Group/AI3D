/* The asset library lives in browser storage, which a game team cannot hand to
 * a teammate, copy to a build machine, or keep when a browser profile is
 * cleared. These helpers turn the stored records into a small portable file
 * and read one back.
 *
 * They stay free of DOM and Three.js so the same round trip can be verified
 * without a browser, and so a record that arrives from a file is held to the
 * same shape the library prefers: a live `threeObject` never survives a save,
 * and a record that names no asset type we can rebuild is refused rather than
 * loaded into a library that would later fail to draw it.
 */

import { getAssetTypes, getGameKits } from "./generator.js";

export const ASSET_LIBRARY_FILE_KIND = "ai3d-asset-library";
export const ASSET_LIBRARY_FILE_VERSION = 1;

const knownTypes = new Set(getAssetTypes());
const knownKits = new Set(getGameKits().map((kit) => kit.id));

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* A saved record carries everything the generator needs to rebuild the mesh
 * from a seed, which is why the file stays small. It must not carry the Three
 * object itself: that is a live scene graph, not data, and serialising it
 * would bloat the file and resurrect a stale mesh on import. */
function cleanAsset(record, id) {
  const { threeObject, ...rest } = record;
  return {
    ...rest,
    id,
    kind: record.kind === "scene" ? "scene" : "asset",
    name:
      typeof record.name === "string" && record.name.trim()
        ? record.name
        : record.type,
    prompt: typeof record.prompt === "string" ? record.prompt : "",
    style:
      typeof record.style === "string" && record.style
        ? record.style
        : "lowpoly",
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag) => typeof tag === "string" && tag)
      : [],
    favorite: record.favorite === true,
    createdAt: Number.isFinite(record.createdAt)
      ? record.createdAt
      : Date.now(),
  };
}

function isKnownRecord(record) {
  if (!record || typeof record !== "object") return false;
  if (typeof record.type !== "string" || !record.type) return false;
  return record.kind === "scene"
    ? knownKits.has(record.type)
    : knownTypes.has(record.type);
}

/* Ids make the file mergeable instead of overwriting: a second import of the
 * same backup adds nothing. Duplicates inside one file get a fresh id so the
 * two records do not collide in the library. */
function claimId(record, used) {
  const candidate =
    typeof record.id === "string" && record.id.trim() ? record.id.trim() : null;
  if (candidate && !used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  let id = newId();
  while (used.has(id)) id = newId();
  used.add(id);
  return id;
}

/**
 * Wrap library records in the file format written by the export control.
 * @param {object[]} assets - Library records, live Three objects included.
 * @param {{ exportedAt?: string }} [options]
 * @returns {object} A JSON-serialisable backup object.
 */
export function serializeAssetLibrary(assets, { exportedAt } = {}) {
  const list = Array.isArray(assets) ? assets : [];
  const used = new Set();
  return {
    kind: ASSET_LIBRARY_FILE_KIND,
    version: ASSET_LIBRARY_FILE_VERSION,
    app: "AI3D",
    exportedAt: exportedAt || new Date().toISOString(),
    count: list.length,
    assets: list.map((record) => cleanAsset(record, claimId(record, used))),
  };
}

/**
 * Read a backup file back into library records.
 * @param {string} text - File contents, a wrapper object or a bare array.
 * @returns {{ ok: boolean, reason: string, assets: object[], skipped: number }}
 */
export function parseAssetLibraryFile(text) {
  let data;
  try {
    data = JSON.parse(typeof text === "string" ? text : String(text ?? ""));
  } catch {
    return { ok: false, reason: "invalid-json", assets: [], skipped: 0 };
  }
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.assets)
      ? data.assets
      : null;
  if (!list)
    return { ok: false, reason: "missing-assets", assets: [], skipped: 0 };
  if (
    !Array.isArray(data) &&
    data.kind != null &&
    data.kind !== ASSET_LIBRARY_FILE_KIND
  ) {
    return { ok: false, reason: "unknown-kind", assets: [], skipped: 0 };
  }
  const used = new Set();
  const assets = [];
  let skipped = 0;
  for (const entry of list) {
    if (!isKnownRecord(entry)) {
      skipped++;
      continue;
    }
    assets.push(cleanAsset(entry, claimId(entry, used)));
  }
  return { ok: true, reason: "", assets, skipped };
}

/**
 * Add imported records to a library without moving or duplicating what is
 * already there. Existing records win on an id clash, so re-importing a backup
 * is a no-op rather than a half overwrite of work done since it was written.
 * @param {object[]} existing
 * @param {object[]} incoming
 * @returns {{ assets: object[], added: number }}
 */
export function mergeAssetLibrary(existing, incoming) {
  const assets = Array.isArray(existing) ? existing.slice() : [];
  const seen = new Set(assets.map((asset) => asset?.id));
  let added = 0;
  for (const record of Array.isArray(incoming) ? incoming : []) {
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    assets.push(record);
    added++;
  }
  return { assets, added };
}
