import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  composeModularScene,
  getModularScenePresets,
  getAssetStats,
  exportGamePack,
  normalizeModularOptions,
  MODULAR_SCENE_PRESETS,
  editSceneProp,
  removeSceneProp,
  addSceneProp,
} from "../src/generator.js";

function bounds(model) {
  const box = new THREE.Box3().setFromObject(model);
  return {
    min: box.min.clone(),
    max: box.max.clone(),
    size: box.getSize(new THREE.Vector3()),
  };
}

const presetOptions = {
  courtyard: { cell: 2, cells: 4, height: 2, depth: 4, thickness: 0.2 },
  tower_room: { cell: 2, cells: 3, height: 2, depth: 3, thickness: 0.2 },
  corridor: { cell: 2, cells: 6, height: 2, depth: 2, thickness: 0.2 },
};

test("modular scene presets expose required types and options", () => {
  const presets = getModularScenePresets();
  assert.equal(presets.length, 3);
  for (const preset of presets) {
    assert.ok(MODULAR_SCENE_PRESETS[preset.id]);
    assert.ok(preset.required.length > 0);
    assert.ok(preset.options.cell > 0);
  }
  assert.deepEqual(MODULAR_SCENE_PRESETS.courtyard.required, [
    "wall",
    "wall_door",
    "floor",
    "arch",
  ]);
  assert.ok(MODULAR_SCENE_PRESETS.corridor.required.includes("stairs"));
});

test("same preset and seed compose identically", () => {
  const first = composeModularScene("courtyard", {
    seed: 42,
    modular: presetOptions.courtyard,
  });
  const second = composeModularScene("courtyard", {
    seed: 42,
    modular: presetOptions.courtyard,
  });
  assert.equal(
    first.userData.pieceList.length,
    second.userData.pieceList.length,
  );
  assert.equal(first.userData.propList.length, second.userData.propList.length);
  for (let i = 0; i < first.userData.propList.length; i++) {
    assert.deepEqual(first.userData.propList[i], second.userData.propList[i]);
  }
  assert.ok(
    Math.abs(first.userData.extent.width - second.userData.extent.width) < 1e-9,
  );
});

test("preset pieces line up on the modular grid", () => {
  for (const [id, options] of Object.entries(presetOptions)) {
    const scene = composeModularScene(id, { seed: 5, modular: options });
    for (const piece of scene.userData.pieceList) {
      if (piece.type === "floor") {
        assert.ok(
          Math.abs(
            piece.x - Math.round(piece.x / options.cell) * options.cell,
          ) < 1e-9,
          `${id} floor x should sit on the grid`,
        );
        assert.ok(
          Math.abs(
            piece.z - Math.round(piece.z / options.cell) * options.cell,
          ) < 1e-9,
          `${id} floor z should sit on the grid`,
        );
      }
    }
  }
});

test("composed scenes contain every required modular type", () => {
  for (const [id, preset] of Object.entries(MODULAR_SCENE_PRESETS)) {
    const scene = composeModularScene(id, {
      seed: 9,
      modular: presetOptions[id],
    });
    const types = new Set(scene.userData.pieceList.map((piece) => piece.type));
    for (const required of preset.required) {
      assert.ok(types.has(required), `${id} should contain ${required}`);
    }
    assert.equal(scene.userData.sceneKind, "modular-scene");
    assert.ok(scene.userData.props > 0 || id === "corridor");
  }
});

test("saved prop placements rebuild the same scene", () => {
  const original = composeModularScene("tower_room", {
    seed: 17,
    modular: presetOptions.tower_room,
  });
  const savedProps = original.userData.propList.map((prop) => ({ ...prop }));
  const rebuilt = composeModularScene("tower_room", {
    seed: 99,
    modular: presetOptions.tower_room,
    props: savedProps,
  });
  assert.deepEqual(rebuilt.userData.propList, savedProps);
  assert.equal(
    rebuilt.userData.pieceList.length,
    original.userData.pieceList.length,
  );
  const firstBox = bounds(original);
  const secondBox = bounds(rebuilt);
  for (const axis of ["x", "y", "z"]) {
    assert.ok(
      Math.abs(firstBox.min[axis] - secondBox.min[axis]) < 1e-6,
      `${axis} min should match after rebuild`,
    );
  }
});

test("modular scenes export a pack with scene metadata", async () => {
  const scene = composeModularScene("corridor", {
    seed: 23,
    modular: presetOptions.corridor,
  });
  const asset = {
    id: "corridor-23",
    name: "Corridor",
    kind: "scene",
    type: "corridor",
    seed: 23,
    segments: 12,
    style: "lowpoly",
    color: null,
    material: null,
    texture: "auto",
    textureStrength: 0.8,
    tags: ["scene", "modular", "corridor"],
    scene: {
      sceneKind: "modular-scene",
      modular: scene.userData.modular,
      quality: 1,
      spacing: 1,
      groundPadding: 0.6,
      propScale: 1,
      groundColor: null,
      theme: scene.userData.theme,
      props: scene.userData.propList,
    },
  };
  const pack = await exportGamePack({
    model: scene,
    asset,
    engine: "unity",
    collision: "none",
    animation: "none",
  });
  const bytes = new Uint8Array(pack);
  assert.ok(bytes.byteLength > 0);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), "PK\x03\x04");

  const { unzipSync } = await import("fflate");
  const files = unzipSync(bytes);
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  const record = manifest.assets[0];
  assert.equal(record.kind, "scene");
  assert.equal(record.scene.sceneKind, "modular-scene");
  assert.equal(record.scene.modular.preset, "corridor");
  assert.equal(record.tags[1], "modular");
});

test("modular scene options clamp like modular pieces", () => {
  const clamped = normalizeModularOptions({
    cell: 999,
    cells: -2,
    height: 99,
    depth: 0,
  });
  assert.equal(clamped.cell, 20);
  assert.equal(clamped.cells, 1);
  assert.equal(clamped.height, 16);
  assert.equal(clamped.depth, 1);
  const scene = composeModularScene("courtyard", {
    seed: 1,
    modular: { cell: 999, cells: -2, height: 99, depth: 0 },
  });
  assert.equal(scene.userData.modular.cell, 20);
  assert.ok(getAssetStats(scene).triangles > 0);
});

test("modular scene props can be edited, added and removed", () => {
  const scene = composeModularScene("courtyard", {
    seed: 11,
    modular: presetOptions.courtyard,
  });
  const floorY = scene.userData.floorY;
  assert.ok(floorY > 0, "modular scenes should know their floor height");

  const edited = editSceneProp(scene, 0, { type: "tower", size: 1.5 });
  const editedModel = scene.children.find(
    (child) => child.name === edited.name,
  );
  assert.ok(editedModel, "edited prop should stay in the scene");
  const localBaseY = (model) => bounds(model).min.y - scene.position.y;
  assert.ok(
    localBaseY(editedModel) >= floorY - 1e-6,
    "edited props should rest on the modular floor",
  );

  const added = addSceneProp(scene, {
    type: "crate",
    size: 0.9,
    x: 2,
    z: 0,
    seed: 7,
  });
  const addedModel = scene.children.find((child) => child.name === added.name);
  assert.ok(addedModel, "added prop should appear in the scene");
  assert.ok(
    localBaseY(addedModel) >= floorY - 1e-6,
    "added props should sit on the modular floor",
  );

  const removed = removeSceneProp(scene, 0);
  assert.ok(removed);
  const saved = scene.userData.propList.map((prop) => ({ ...prop }));
  const rebuilt = composeModularScene("courtyard", {
    seed: 99,
    modular: presetOptions.courtyard,
    props: saved,
  });
  assert.deepEqual(rebuilt.userData.propList, saved);
});
