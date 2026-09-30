import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  generateAsset,
  generateVariantSet,
  getAssetStats,
  exportGLB,
  isModularType,
  normalizeModularOptions,
  MODULAR_TYPES,
} from "../src/generator.js";

const baseOptions = {
  cell: 2,
  cells: 4,
  height: 2,
  depth: 2,
  thickness: 0.2,
  steps: 6,
  crenel: false,
};

function bounds(model) {
  const box = new THREE.Box3().setFromObject(model);
  return {
    min: box.min.clone(),
    max: box.max.clone(),
    size: box.getSize(new THREE.Vector3()),
  };
}

test("every modular type generates a renderable model", () => {
  for (const type of MODULAR_TYPES) {
    const model = generateAsset(type, {
      options: baseOptions,
      seed: 11,
      pivot: "ground",
    });
    const stats = getAssetStats(model);
    assert.ok(stats.triangles > 0, `${type} should emit triangles`);
    assert.ok(stats.parts > 0, `${type} should contain parts`);
  }
});

test("modular pieces follow the grid contract", () => {
  const expected = {
    wall: { x: 8, y: 4 },
    wall_window: { x: 8, y: 4 },
    wall_door: { x: 8, y: 4 },
    wall_corner: { x: 8, z: 8, y: 4 },
    floor: { x: 8, z: 4, y: 0.225 },
    stairs: { x: 8, y: 4 },
    arch: { x: 8, y: 4 },
  };
  for (const type of MODULAR_TYPES) {
    const model = generateAsset(type, {
      options: baseOptions,
      seed: 3,
      pivot: "ground",
    });
    const { min, size } = bounds(model);
    assert.ok(Math.abs(min.y) < 1e-9, `${type} starts at ground`);
    const dims = expected[type];
    if (dims.x !== undefined) {
      assert.ok(
        Math.abs(size.x - dims.x) < 1e-6,
        `${type} width should be ${dims.x}, got ${size.x}`,
      );
    }
    if (dims.y !== undefined) {
      assert.ok(
        Math.abs(size.y - dims.y) < 1e-6,
        `${type} height should be ${dims.y}, got ${size.y}`,
      );
    }
    if (dims.z !== undefined) {
      assert.ok(
        Math.abs(size.z - dims.z) < 1e-6,
        `${type} depth should be ${dims.z}, got ${size.z}`,
      );
    }
  }
});

test("modular walls butt together on the grid", () => {
  const left = generateAsset("wall", {
    options: baseOptions,
    seed: 1,
    pivot: "ground",
  });
  const right = generateAsset("wall", {
    options: baseOptions,
    seed: 1,
    pivot: "ground",
  });
  right.position.x = baseOptions.cell * baseOptions.cells;
  const leftBox = bounds(left);
  const rightBox = bounds(right);
  assert.ok(
    Math.abs(leftBox.max.x - rightBox.min.x) < 1e-6,
    "neighbouring walls should touch without a gap",
  );
});

test("crenellations add height and parts to walls", () => {
  const plain = generateAsset("wall", {
    options: { ...baseOptions, crenel: false },
    seed: 5,
    pivot: "ground",
  });
  const crenel = generateAsset("wall", {
    options: { ...baseOptions, crenel: true },
    seed: 5,
    pivot: "ground",
  });
  const plainStats = getAssetStats(plain);
  const crenelStats = getAssetStats(crenel);
  assert.ok(crenelStats.parts > plainStats.parts);
  assert.ok(Math.abs(bounds(crenel).size.y - 4.6) < 1e-6);
});

test("modular options are clamped to safe limits", () => {
  const normalized = normalizeModularOptions({
    cell: 999,
    cells: -4,
    height: "large",
    steps: 99,
  });
  assert.deepEqual(normalized, {
    cell: 20,
    cells: 1,
    height: 2,
    depth: 1,
    thickness: 0.2,
    steps: 24,
    crenel: false,
  });
});

test("variant sets forward modular options", () => {
  const variants = generateVariantSet("wall", {
    options: baseOptions,
    count: 2,
    baseSeed: 0,
    pivot: "ground",
  });
  assert.equal(variants.length, 2);
  assert.equal(getAssetStats(variants[0].model).parts, 3);
  assert.ok(Math.abs(bounds(variants[1].model).size.x - 8) < 1e-6);
});

test("modular models export to GLB bytes", async () => {
  const wall = generateAsset("wall", {
    options: baseOptions,
    seed: 2,
    pivot: "ground",
  });
  const raw = await exportGLB(wall, { upAxis: "Y", scale: 1 });
  const glb = new Uint8Array(raw);
  assert.ok(glb.byteLength > 0);
  assert.equal(new TextDecoder().decode(glb.subarray(0, 4)), "glTF");
});
