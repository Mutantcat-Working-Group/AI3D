import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  cloneModelDeep,
  decimateMesh,
  generateLOD,
  countTriangles,
  generateAsset,
  getAssetTypes,
  getAssetTypeInfo,
  countVertices,
  getAssetStats,
  generateVariantSet,
  exportAssetManifest,
  composeGameKit,
  getGameKits,
  exportGLB,
  exportOBJ,
} from "../src/generator.js";

function sampleModel() {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh.name = "sample";
  mesh.position.set(1, 2, 3);
  group.add(mesh);
  return group;
}

function firstMesh(object) {
  let hit = null;
  object.traverse((child) => {
    if (child.isMesh && !hit) hit = child;
  });
  return hit;
}

function nodeNames(object) {
  const names = new Set();
  object.traverse((child) => {
    if (child.name) names.add(child.name);
  });
  return names;
}

function meshCount(object) {
  let count = 0;
  object.traverse((child) => {
    if (child.isMesh) count += 1;
  });
  return count;
}

function meshMaterials(object) {
  const materials = [];
  object.traverse((child) => {
    if (!child.isMesh) return;
    if (Array.isArray(child.material)) materials.push(...child.material);
    else if (child.material) materials.push(child.material);
  });
  return materials;
}

function modelFingerprint(object) {
  const parts = [];
  object.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes.position) return;
    const color = Array.isArray(child.material)
      ? child.material[0]?.color
      : child.material?.color;
    parts.push([
      child.name,
      child.geometry.type,
      [...child.geometry.attributes.position.array],
      [...child.position.toArray(), ...child.rotation.toArray()],
      color ? color.getHexString() : null,
    ]);
  });
  return JSON.stringify(parts);
}

function modelBounds(object) {
  const box = new THREE.Box3().setFromObject(object);
  return {
    size: Math.max(
      box.max.x - box.min.x,
      box.max.y - box.min.y,
      box.max.z - box.min.z,
    ),
    center: box.getCenter(new THREE.Vector3()),
    min: box.min.clone(),
    max: box.max.clone(),
  };
}

test("cloneModelDeep edits its own geometry without touching the source", () => {
  const source = sampleModel();
  const original = countTriangles(source);
  const clone = cloneModelDeep(source);

  decimateMesh(firstMesh(clone), 0.5);

  assert.ok(countTriangles(clone) < original);
  assert.equal(countTriangles(source), original);
  const mesh = firstMesh(clone);
  assert.equal(mesh.name, "sample");
  assert.equal(mesh.position.x, 1);
  assert.equal(mesh.position.y, 2);
  assert.equal(mesh.position.z, 3);
  assert.equal(mesh.material.color.getHexString(), "888888");
});

test("generateLOD keeps the original as level 0 and owns each level", () => {
  const source = sampleModel();
  const original = countTriangles(source);
  const lods = generateLOD(source, 4);

  assert.equal(lods.length, 4);
  assert.equal(lods[0].triangles, original);
  const tris = lods.map((lod) => lod.triangles);
  assert.ok(tris[0] >= tris[1]);
  assert.ok(tris[1] >= tris[2]);
  assert.ok(tris[2] >= tris[3]);
  assert.ok(tris[3] < tris[0]);

  const beforeLast = countTriangles(lods[3].mesh);
  decimateMesh(firstMesh(lods[1].mesh), 0.5);
  assert.equal(countTriangles(lods[3].mesh), beforeLast);
  assert.equal(countTriangles(source), original);
});

test("every asset type builds its declared parts, centered and sized", () => {
  for (const type of getAssetTypes()) {
    const info = getAssetTypeInfo(type);
    const model = generateAsset(type, { size: 2, segments: 10, seed: 7 });
    assert.ok(meshCount(model) > 0, `${type} has meshes`);
    const names = nodeNames(model);
    for (const part of info.parts) {
      assert.ok(names.has(part), `${type} has part ${part}`);
    }
    const bounds = modelBounds(model);
    assert.ok(
      Math.abs(bounds.size - 2) < 1e-5,
      `${type} scales to the requested size`,
    );
    assert.ok(bounds.center.length() < 1e-5, `${type} is centered`);
  }
});

test("same seed produces identical geometry for every type", () => {
  for (const type of getAssetTypes()) {
    const a = generateAsset(type, { size: 1.4, segments: 10, seed: 123 });
    const b = generateAsset(type, { size: 1.4, segments: 10, seed: 123 });
    assert.equal(
      modelFingerprint(a),
      modelFingerprint(b),
      `${type} is deterministic per seed`,
    );
  }
});

test("seeded variation changes shapes built on the PRNG", () => {
  const variantTypes = [
    "rock",
    "tower",
    "flag",
    "torch",
    "fence",
    "brazier",
    "runestone",
    "trap",
    "antenna",
  ];
  for (const type of variantTypes) {
    const a = generateAsset(type, { size: 1, seed: 1 });
    const b = generateAsset(type, { size: 1, seed: 2 });
    assert.notEqual(
      modelFingerprint(a),
      modelFingerprint(b),
      `${type} changes with the seed`,
    );
  }
});

test("styles and material overrides reach every mesh", () => {
  const realistic = generateAsset("sword", { size: 1, style: "realistic" });
  for (const mat of meshMaterials(realistic)) {
    assert.equal(mat.flatShading, false);
    assert.equal(mat.roughness, 0.3);
    assert.equal(mat.metalness, 0.6);
  }

  const stylized = generateAsset("tree", { size: 1, style: "stylized" });
  for (const mat of meshMaterials(stylized)) {
    assert.equal(mat.flatShading, true);
  }

  const overridden = generateAsset("shield", {
    size: 1,
    style: "lowpoly",
    material: { roughness: 0.2, metalness: 0.9, emissive: "#00ff00" },
  });
  for (const mat of meshMaterials(overridden)) {
    assert.equal(mat.roughness, 0.2);
    assert.equal(mat.metalness, 0.9);
    assert.equal(mat.emissive.getHexString(), "00ff00");
  }
});

test("custom color lands on every asset type", () => {
  for (const type of getAssetTypes()) {
    const model = generateAsset(type, {
      size: 1,
      color: "#123456",
      seed: 5,
    });
    const hexes = meshMaterials(model).map((m) => m.color.getHexString());
    assert.ok(hexes.includes("123456"), `${type} applies the custom color`);
  }
});

test("built-in emissive parts keep their glow by default", () => {
  const glowTypes = ["brazier", "runestone", "turret", "drone", "antenna"];
  for (const type of glowTypes) {
    const model = generateAsset(type, {
      size: 1,
      seed: 5,
      material: { roughness: 0.7, metalness: 0.3, emissive: null },
    });
    const glowing = meshMaterials(model).some(
      (m) => m.emissive.getHexString() !== "000000",
    );
    assert.ok(glowing, `${type} keeps a built-in glow`);
  }
});

test("getAssetStats reports the mesh budget for game engines", () => {
  const model = generateAsset("turret", {
    size: 1.5,
    segments: 12,
    seed: 9,
  });
  const stats = getAssetStats(model);
  assert.equal(stats.triangles, countTriangles(model));
  assert.equal(stats.vertices, countVertices(model));
  assert.ok(stats.triangles > 0);
  assert.ok(stats.vertices > 0);
  assert.ok(stats.parts >= 4);
  assert.equal(stats.parts, stats.drawCalls);
});

test("countVertices counts every mesh buffer", () => {
  const model = sampleModel();
  assert.ok(countVertices(model) > 0);
});

test("game kits compose a named, centred scene on a ground", () => {
  const kits = getGameKits();
  assert.ok(kits.length >= 3);
  for (const kit of kits) {
    const scene = composeGameKit(kit.id, { seed: 7 });
    assert.ok(meshCount(scene) > 9, `${kit.id} has ground plus props`);
    assert.ok(nodeNames(scene).has("ground"), `${kit.id} has a ground`);
    const propNodes = scene.children.filter((child) =>
      child.name.startsWith(`${kit.id}-`),
    );
    assert.equal(propNodes.length, 9, `${kit.id} places every prop`);
    const bounds = modelBounds(scene);
    assert.ok(bounds.center.length() < 1e-5, `${kit.id} is centred`);
    const groundTile = firstMesh(scene);
    const groundBox = new THREE.Box3().setFromObject(groundTile);
    const propBottom = Math.min(
      ...scene.children
        .filter((child) => child.name.startsWith(`${kit.id}-`))
        .map((prop) => new THREE.Box3().setFromObject(prop).min.y),
    );
    assert.ok(
      Math.abs(propBottom - groundBox.max.y) < 1e-4,
      `${kit.id} props sit on the ground`,
    );
  }
});

test("game kits are deterministic per seed and vary with it", () => {
  for (const kit of getGameKits()) {
    const a = composeGameKit(kit.id, { seed: 11 });
    const b = composeGameKit(kit.id, { seed: 11 });
    const c = composeGameKit(kit.id, { seed: 12 });
    assert.equal(
      modelFingerprint(a),
      modelFingerprint(b),
      `${kit.id} is stable`,
    );
    assert.notEqual(
      modelFingerprint(a),
      modelFingerprint(c),
      `${kit.id} varies`,
    );
  }
});

test("scene export options wrap without mutating the original", async () => {
  const scene = composeGameKit("camp", { seed: 3 });
  const before = modelFingerprint(scene);
  const glb = await exportGLB(scene, { upAxis: "Z", scale: 2 });
  const obj = exportOBJ(scene, { upAxis: "Z", scale: 2 });
  assert.ok(glb.byteLength > 0);
  assert.ok(obj.includes("camp-house"));
  assert.equal(
    modelFingerprint(scene),
    before,
    "export leaves the scene alone",
  );
});

test("generateVariantSet returns the requested batch with matching stats", () => {
  const variants = generateVariantSet("tower", {
    size: 1.2,
    segments: 10,
    style: "lowpoly",
    count: 4,
    baseSeed: 100,
  });
  assert.equal(variants.length, 4);
  assert.deepEqual(
    variants.map((v) => v.seed),
    [100, 101, 102, 103],
  );
  for (const variant of variants) {
    assert.ok(meshCount(variant.model) > 0);
    assert.deepEqual(variant.stats, getAssetStats(variant.model));
  }
});

test("generateVariantSet is deterministic per base seed", () => {
  const a = generateVariantSet("statue", { count: 4, baseSeed: 77 });
  const b = generateVariantSet("statue", { count: 4, baseSeed: 77 });
  assert.deepEqual(
    a.map((v) => modelFingerprint(v.model)),
    b.map((v) => modelFingerprint(v.model)),
  );
});

test("generateVariantSet produces distinct takes for seeded shapes", () => {
  const variants = generateVariantSet("rock", {
    count: 4,
    baseSeed: 20,
    segments: 8,
  });
  const fingerprints = variants.map((v) => modelFingerprint(v.model));
  assert.equal(new Set(fingerprints).size, fingerprints.length);
});

test("exportAssetManifest produces valid JSON with all asset fields", () => {
  const assets = [
    {
      id: "test-1",
      type: "sword",
      seed: 42,
      size: 1.5,
      segments: 12,
      style: "lowpoly",
      color: "#ff0000",
      material: { roughness: 0.5, metalness: 0.3, emissive: null },
      stats: { triangles: 100, vertices: 50, parts: 3, drawCalls: 3 },
    },
    {
      id: "test-2",
      type: "tree",
      seed: null,
      size: 2,
      segments: 8,
      style: "realistic",
      color: null,
      material: null,
      stats: { triangles: 200, vertices: 100, parts: 5, drawCalls: 5 },
    },
  ];
  const json = exportAssetManifest(assets, "json");
  const parsed = JSON.parse(json);
  assert.equal(parsed.version, "1.0");
  assert.equal(parsed.count, 2);
  assert.equal(parsed.assets.length, 2);
  assert.equal(parsed.assets[0].type, "sword");
  assert.equal(parsed.assets[0].seed, 42);
  assert.equal(parsed.assets[0].triangles, 100);
  assert.equal(parsed.assets[1].type, "tree");
  assert.equal(parsed.assets[1].seed, null);
});

test("exportAssetManifest produces valid CSV with headers and rows", () => {
  const assets = [
    {
      id: "test-1",
      type: "sword",
      seed: 42,
      size: 1.5,
      segments: 12,
      style: "lowpoly",
      color: "#ff0000",
      material: { roughness: 0.5, metalness: 0.3, emissive: null },
      stats: { triangles: 100, vertices: 50, parts: 3, drawCalls: 3 },
    },
  ];
  const csv = exportAssetManifest(assets, "csv");
  const lines = csv.split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes("id,type,seed,size,segments,style"));
  assert.ok(lines[1].includes("test-1,sword,42,1.5,12,lowpoly"));
  assert.ok(lines[1].includes("100,50,3"));
});
