import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASSET_LIBRARY_FILE_KIND,
  serializeAssetLibrary,
  parseAssetLibraryFile,
  mergeAssetLibrary,
} from "../src/asset-library.js";

/* The backup file is the only copy of a library that leaves the browser, so it
 * has to carry enough to rebuild the mesh and nothing that cannot survive
 * JSON. These pin the round trip, the refusals, and the merge that keeps a
 * second import from overwriting work done since the backup was written. */

const record = (over = {}) => ({
  id: "asset-1",
  type: "sword",
  kind: "asset",
  name: "Blade",
  prompt: "a sword",
  style: "lowpoly",
  tags: ["weapon"],
  seed: 42,
  createdAt: 1_700_000_000_000,
  ...over,
});

test("a backup carries the fields that rebuild a mesh and drops the live object", () => {
  const backup = serializeAssetLibrary([
    record({ threeObject: { isObject3D: true }, color: "#c0c0c0" }),
  ]);
  assert.equal(backup.kind, ASSET_LIBRARY_FILE_KIND);
  assert.equal(backup.count, 1);
  const [asset] = backup.assets;
  assert.equal(asset.threeObject, undefined);
  assert.equal(asset.type, "sword");
  assert.equal(asset.seed, 42);
  assert.equal(asset.color, "#c0c0c0");
  // A Three scene graph is not data; the file has to survive JSON.
  assert.doesNotThrow(() => JSON.stringify(backup));
});

test("a backup parses back into the same records", () => {
  const assets = [
    record(),
    record({
      id: "asset-2",
      type: "dungeon",
      kind: "scene",
      prompt: "a crypt",
    }),
  ];
  const parsed = parseAssetLibraryFile(
    JSON.stringify(serializeAssetLibrary(assets)),
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.skipped, 0);
  assert.deepEqual(
    parsed.assets.map((a) => [a.id, a.type, a.kind]),
    [
      ["asset-1", "sword", "asset"],
      ["asset-2", "dungeon", "scene"],
    ],
  );
});

test("a file that is not a backup is refused instead of half loaded", () => {
  assert.equal(parseAssetLibraryFile("not json").ok, false);
  assert.equal(parseAssetLibraryFile("{}").reason, "missing-assets");
  assert.equal(
    parseAssetLibraryFile(
      JSON.stringify({ kind: "something-else", assets: [] }),
    ).reason,
    "unknown-kind",
  );
  // A bare array is the shape an older or hand-written file has.
  assert.equal(parseAssetLibraryFile(JSON.stringify([record()])).ok, true);
});

test("import refuses a record whose type it cannot rebuild", () => {
  const parsed = parseAssetLibraryFile(
    JSON.stringify({
      kind: ASSET_LIBRARY_FILE_KIND,
      assets: [
        record(),
        record({ id: "x", type: "not-a-real-asset" }),
        record({ id: "y", type: "sword", kind: "scene" }),
        { nope: true },
      ],
    }),
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.skipped, 3);
  assert.deepEqual(
    parsed.assets.map((a) => a.id),
    ["asset-1"],
  );
});

test("import fills the blanks a hand-written record leaves", () => {
  const parsed = parseAssetLibraryFile(
    JSON.stringify({ assets: [{ type: "crate" }] }),
  );
  const [asset] = parsed.assets;
  assert.equal(typeof asset.id, "string");
  assert.equal(asset.name, "crate");
  assert.equal(asset.prompt, "");
  assert.equal(asset.style, "lowpoly");
  assert.deepEqual(asset.tags, []);
  assert.equal(asset.favorite, false);
  assert.equal(Number.isFinite(asset.createdAt), true);
});

test("merging a backup twice adds nothing the second time", () => {
  const first = parseAssetLibraryFile(
    JSON.stringify(serializeAssetLibrary([record()])),
  );
  const once = mergeAssetLibrary([], first.assets);
  assert.equal(once.added, 1);
  const twice = mergeAssetLibrary(once.assets, first.assets);
  assert.equal(twice.added, 0);
  assert.equal(twice.assets.length, 1);
});
