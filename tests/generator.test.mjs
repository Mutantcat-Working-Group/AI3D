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
  getAssetLayoutInfo,
  buildAnchoredModel,
  getGameplayInfo,
  getSpawnInfo,
  auditGameAsset,
  repairGameAsset,
  generateVariantSet,
  exportAssetManifest,
  composeGameKit,
  editSceneProp,
  removeSceneProp,
  addSceneProp,
  getGameKits,
  exportGLB,
  exportGLTF,
  exportOBJ,
  getAssetTags,
  getEnginePresets,
  getEnginePreset,
  getColliderShape,
  computeCollider,
  buildColliderModel,
  buildConvexHullGeometry,
  buildGamePackFiles,
  summariseGameReadiness,
  exportGamePack,
  selectAnimations,
  getAssetTextureInfo,
  isModularType,
} from "../src/generator.js";
import { createProceduralTextures } from "../src/procedural-textures.js";
import { unzipSync } from "fflate";

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

function samplePackAsset(overrides = {}) {
  return {
    id: "sword-test-1",
    name: "Sword Test",
    type: "sword",
    size: 1,
    segments: 16,
    style: "lowpoly",
    color: "#ff0000",
    seed: 42,
    stats: { triangles: 120, vertices: 60, parts: 2, drawCalls: 2 },
    glbBytes: new Uint8Array([0x67, 0x6c, 0x62, 0x01]),
    thumbnailBytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    ...overrides,
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
  assert.deepEqual(lods[3].stats, getAssetStats(lods[3].mesh));
  assert.equal(lods[3].vertices, lods[3].stats.vertices);
  assert.equal(lods[3].parts, lods[3].stats.parts);
  assert.equal(lods[3].drawCalls, lods[3].stats.drawCalls);

  const beforeLast = countTriangles(lods[3].mesh);
  decimateMesh(firstMesh(lods[1].mesh), 0.5);
  assert.equal(countTriangles(lods[3].mesh), beforeLast);
  assert.equal(countTriangles(source), original);
});

test("every asset type builds its declared parts, centered and sized", () => {
  for (const type of getAssetTypes()) {
    const info = getAssetTypeInfo(type);
    const modular = isModularType(type);
    const model = generateAsset(type, {
      size: 2,
      segments: 10,
      seed: 7,
      ...(modular
        ? {
            options: {
              cell: 2,
              cells: 4,
              height: 2,
              depth: 2,
              thickness: 0.2,
              steps: 6,
              crenel: true,
            },
          }
        : {}),
    });
    assert.ok(meshCount(model) > 0, `${type} has meshes`);
    const names = nodeNames(model);
    for (const part of info.parts) {
      assert.ok(names.has(part), `${type} has part ${part}`);
    }
    const bounds = modelBounds(model);
    if (modular) {
      assert.ok(
        Math.abs(bounds.size - 8) < 1e-5,
        `${type} keeps the modular grid contract`,
      );
    } else {
      assert.ok(
        Math.abs(bounds.size - 2) < 1e-5,
        `${type} scales to the requested size`,
      );
    }
    assert.ok(bounds.center.length() < 1e-5, `${type} is centered`);
  }
});

/* The size control asks for a real-world scale, and a number only means
   something next to its unit: 2.5 m, 250 cm and 2500 mm are the same crate, and
   the engine that imports the mesh has to see the same 2.5 either way. */
test("the size control converts its unit into metres", () => {
  const metres = generateAsset("crate", { size: 2.5, units: "m", seed: 11 });
  const centimetres = generateAsset("crate", {
    size: 250,
    units: "cm",
    seed: 11,
  });
  const millimetres = generateAsset("crate", {
    size: 2500,
    units: "mm",
    seed: 11,
  });
  const feet = generateAsset("crate", { size: 1, units: "ft", seed: 11 });
  const inches = generateAsset("crate", { size: 12, units: "in", seed: 11 });

  for (const model of [metres, centimetres, millimetres])
    assert.ok(Math.abs(modelBounds(model).size - 2.5) < 1e-6);
  assert.ok(Math.abs(modelBounds(feet).size - 0.3048) < 1e-6);
  assert.ok(Math.abs(modelBounds(inches).size - 0.3048) < 1e-6);
});

/* "Two metres tall" and "two metres wide" are different requests, and a tree
   sized by its height must not come out as tall as a wall sized by its width. */
test("fitAxis decides which dimension the requested size fills", () => {
  for (const type of ["character", "fence", "sword"]) {
    for (const axis of ["width", "height", "depth"]) {
      const bounds = modelBounds(
        generateAsset(type, { size: 3, fitAxis: axis, seed: 5, segments: 8 }),
      );
      const spans = {
        width: bounds.max.x - bounds.min.x,
        height: bounds.max.y - bounds.min.y,
        depth: bounds.max.z - bounds.min.z,
      };
      assert.ok(
        Math.abs(spans[axis] - 3) < 1e-4,
        `${type} fills ${axis} when asked to`,
      );
      assert.ok(
        bounds.size >= 3 - 1e-4,
        `${type} keeps every other dimension within the request`,
      );
    }
  }
});

/* Centred is right for a prop that is dropped into a scene by hand; a character
   has to stand on the origin instead, or it sinks into the floor by half its
   height the moment it is placed at (0, 0, 0). */
test("pivot places the origin where the engine expects it", () => {
  const boundsFor = (pivot) =>
    modelBounds(generateAsset("character", { size: 1.8, pivot, seed: 9 }));

  const centered = boundsFor("center");
  assert.ok(centered.center.length() < 1e-5);
  const height = centered.max.y - centered.min.y;
  for (const pivot of ["ground", "bottom"]) {
    const grounded = boundsFor(pivot);
    assert.ok(Math.abs(grounded.min.y) < 1e-6, `${pivot} sits on the origin`);
    assert.ok(
      Math.abs(grounded.max.y - grounded.min.y - height) < 1e-6,
      `${pivot} only moves the model`,
    );
  }
  assert.ok(Math.abs(boundsFor("top").max.y) < 1e-6);
});

/* The measured span is what the manifest and the reviewer see, so it is read
   off the finished object rather than assumed to be the requested size. */
test("the model reports its measured dimensions", () => {
  const model = generateAsset("crate", { size: 2, units: "m", seed: 2 });
  const dimensions = getAssetStats(model).dimensions;
  assert.deepEqual(dimensions, model.userData.dimensions);
  const spans = [dimensions.width, dimensions.height, dimensions.depth];
  assert.ok(Math.abs(Math.max(...spans) - 2) < 1e-3);
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

test("generated assets carry a full procedural PBR texture set", () => {
  const model = generateAsset("sword", { size: 1, seed: 7 });
  const mats = meshMaterials(model);
  assert.ok(mats.length > 0);
  for (const mat of mats) {
    assert.ok(mat.map, "materials have an albedo map");
    assert.ok(mat.normalMap, "materials have a normal map");
    assert.ok(mat.roughnessMap, "materials have a roughness map");
    assert.ok(mat.metalnessMap, "materials have a metalness map");
    assert.ok(mat.aoMap, "materials have an ambient-occlusion map");
  }
});

test("textureSize selects the procedural map resolution", () => {
  const model = generateAsset("sword", {
    size: 1,
    seed: 7,
    textureSize: 512,
  });
  const mats = meshMaterials(model);
  assert.ok(mats.length > 0);
  const texture = mats[0].map;
  assert.equal(texture.image.width, 512);
  assert.equal(texture.image.height, 512);

  const small = generateAsset("sword", {
    size: 1,
    seed: 7,
    textureSize: 64,
  });
  const smallTexture = meshMaterials(small)[0].map;
  assert.equal(smallTexture.image.width, 64);
});

test("texture PNGs are deterministic per seed", () => {
  const a = getAssetTextureInfo(
    { type: "sword", texture: "metal", textureStrength: 0.8 },
    9,
  );
  const b = getAssetTextureInfo(
    { type: "sword", texture: "metal", textureStrength: 0.8 },
    9,
  );
  const c = getAssetTextureInfo(
    { type: "sword", texture: "metal", textureStrength: 0.8 },
    10,
  );
  assert.ok(a);
  assert.deepEqual(a.textures.albedo, b.textures.albedo);
  assert.deepEqual(a.textures.normal, b.textures.normal);
  assert.notDeepEqual(a.textures.albedo, c.textures.albedo);
  for (const name of ["albedo", "normal", "roughness", "metalness", "ao"]) {
    const png = a.textures[name];
    assert.deepEqual(
      [...png.slice(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      `${name} starts with a PNG signature`,
    );
  }
  assert.equal(
    getAssetTextureInfo({ type: "sword", texture: "none" }, 9),
    null,
  );
});

test("texture PNGs honour the requested resolution", () => {
  const info = getAssetTextureInfo(
    { type: "sword", texture: "metal", textureSize: 512 },
    9,
  );
  assert.ok(info);
  assert.equal(info.texture.size, 512);
  const png = info.textures.albedo;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  // PNG IHDR width and height are the first two big-endian uint32s after the
  // 8-byte signature and 4-byte length + 4-byte "IHDR" type.
  assert.equal(view.getUint32(16, false), 512);
  assert.equal(view.getUint32(20, false), 512);
});

test("ambient-occlusion maps darken crevices and keep flat areas white", () => {
  const set = createProceduralTextures("stone", {
    size: 64,
    seed: 5,
    strength: 1,
  });
  const data = set.textures.ao.image.data;
  let dark = 0;
  let flat = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 245) dark += 1;
    if (data[i] === 255) flat += 1;
  }
  assert.ok(dark > 0, "AO map shades concave detail");
  assert.ok(flat > 0, "AO map leaves flat areas unshaded");
});

test("getAssetLayoutInfo reports named parts and attachment points", () => {
  const model = generateAsset("character", {
    size: 1,
    seed: 11,
    pivot: "ground",
  });
  const layout = getAssetLayoutInfo(model, "character");
  assert.ok(layout);
  assert.equal(layout.root.min.y, 0);
  assert.deepEqual(
    new Set(layout.parts.map((p) => p.name)),
    new Set(["head", "body", "arms", "legs"]),
  );
  const foot = layout.attachments.find((a) => a.role === "foot");
  assert.ok(foot);
  assert.ok(Math.abs(foot.position.y) < 1e-6);
  for (const part of layout.parts) {
    assert.ok(part.extent.width > 0, `${part.name} has measurable bounds`);
  }
});

test("buildAnchoredModel adds named attachment anchor nodes", () => {
  const model = generateAsset("sword", { size: 1, seed: 7 });
  const anchored = buildAnchoredModel(model, "sword");
  assert.ok(anchored);
  assert.notEqual(anchored, model, "anchor export uses a clone");
  const anchors = [];
  anchored.traverse((node) => {
    if (node.name.startsWith("anchor_")) anchors.push(node);
  });
  const grip = anchors.find((node) => node.name === "anchor_grip");
  assert.ok(grip, "grip anchor node exists");
  assert.equal(grip.userData.ai3d.role, "grip");
  assert.ok(grip.userData.ai3d.part);
  assert.ok(anchors.length >= 1);
});

test("GLB export embeds procedural texture images", async () => {
  const model = generateAsset("tree", { size: 1, seed: 4 });
  const raw = await exportGLB(model, { upAxis: "Y", scale: 1 });
  const glb = new Uint8Array(raw);
  assert.ok(glb.byteLength > 0);
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(
    new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)),
  );
  assert.ok(
    JSON.stringify(json).includes("image/png"),
    "GLB carries PNG texture data",
  );
});

test("glTF export writes one portable JSON scene with embedded resources", async () => {
  const raw = await exportGLTF(sampleModel(), { upAxis: "Y", scale: 1 });
  assert.equal(typeof raw, "string");
  const gltf = JSON.parse(raw);
  assert.equal(gltf.asset.version, "2.0");
  assert.ok(gltf.scenes.length >= 1);
  assert.ok(gltf.nodes.some((node) => node.mesh !== undefined));
  assert.match(gltf.buffers[0].uri, /^data:/);
});

test("riggable assets export a real skinned glTF skeleton", async () => {
  for (const type of ["character", "monster", "dragon"]) {
    const model = generateAsset(type, {
      size: 1.2,
      seed: 7,
      segments: 10,
    });
    assert.equal(model.userData.rig?.type, type);

    let boneCount = 0;
    let skinnedCount = 0;
    model.traverse((node) => {
      if (node.isBone) boneCount += 1;
      if (!node.isSkinnedMesh) return;
      skinnedCount += 1;
      assert.ok(node.geometry.attributes.skinIndex, `${type} carries JOINTS_0`);
      assert.ok(
        node.geometry.attributes.skinWeight,
        `${type} carries WEIGHTS_0`,
      );
    });
    assert.ok(boneCount > 4, `${type} builds a bone chain`);
    assert.ok(skinnedCount >= 5, `${type} converts parts to skinned meshes`);

    const clone = cloneModelDeep(model);
    let cloneSkinned = 0;
    clone.traverse((node) => {
      if (node.isSkinnedMesh) {
        cloneSkinned += 1;
        assert.ok(node.skeleton, `${type} clone keeps its skeleton`);
      }
    });
    assert.equal(cloneSkinned, skinnedCount);

    for (const clip of model.animations || []) {
      for (const track of clip.tracks) {
        assert.match(
          track.name,
          /\.bones\[[^\]]+\]\.(quaternion|position)$/,
          `${type} animates skeleton bones`,
        );
      }
    }

    const raw = await exportGLB(model, { upAxis: "Y", scale: 1 });
    const glb = new Uint8Array(raw);
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(
      new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)),
    );
    assert.ok(
      Array.isArray(json.skins) && json.skins.length >= 1,
      `${type} exports skins`,
    );
    assert.ok(json.skins[0].joints.length > 4, `${type} exports joints`);
    assert.ok(
      json.nodes.some(
        (node) => node.mesh !== undefined && node.skin !== undefined,
      ),
      `${type} binds a mesh to the skin`,
    );
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

test("game kits include battle, wilderness and town presets", () => {
  const ids = getGameKits().map((k) => k.id);
  assert.ok(ids.includes("battle"));
  assert.ok(ids.includes("wilderness"));
  assert.ok(ids.includes("town"));
  const themed = {
    battle: ["monster"],
    wilderness: ["campfire", "beehive", "wheat_sheaf"],
    town: ["house"],
    dungeon: [
      "stone_coffin",
      "portcullis",
      "cage",
      "bone_pile",
      "cobweb",
      "lever",
      "urn",
      "mummy",
    ],
    outpost: ["portcullis", "cage"],
    village: ["wheat_sheaf", "beehive"],
  };
  for (const [id, expected] of Object.entries(themed)) {
    const scene = composeGameKit(id, { seed: 23 });
    const propNodes = scene.children.filter((child) =>
      child.name.startsWith(`${id}-`),
    );
    assert.equal(propNodes.length, 9, `${id} places every prop`);
    for (const type of expected) {
      assert.ok(
        propNodes.some((node) => node.name.includes(type)),
        `${id} keeps themed ${type}`,
      );
    }
  }
});

test("game kit presets only reference supported asset types", () => {
  const supported = new Set(getAssetTypes());
  for (const kit of getGameKits()) {
    const scene = composeGameKit(kit.id, { seed: 7 });
    for (const prop of scene.userData.propList) {
      assert.ok(
        supported.has(prop.type),
        `${kit.id} references supported type ${prop.type}`,
      );
    }
  }
});

test("game kits apply the chosen theme to every prop", () => {
  const material = { roughness: 0.2, metalness: 0.85, emissive: null };
  const scene = composeGameKit("dungeon", {
    seed: 5,
    style: "realistic",
    color: "#2b3a4a",
    material,
    texture: "metal",
    textureStrength: 0.9,
  });
  assert.deepEqual(scene.userData.theme, {
    style: "realistic",
    color: "#2b3a4a",
    material,
    texture: "metal",
    textureStrength: 0.9,
    textureSize: 256,
    segments: 12,
    quality: 1,
    spacing: 1,
    groundPadding: 0.6,
    propScale: 1,
  });
  assert.equal(scene.userData.propList.length, 9);
  const prop = scene.children.find((child) =>
    child.name.startsWith("dungeon-"),
  );
  assert.ok(prop, "kit props stay direct children");
  let seen = 0;
  prop.traverse((child) => {
    if (!child.isMesh) return;
    seen += 1;
    const mat = Array.isArray(child.material)
      ? child.material[0]
      : child.material;
    assert.equal(mat.roughness, 0.2);
    assert.equal(mat.metalness, 0.85);
    assert.ok(mat.map, "prop receives the chosen procedural texture");
  });
  assert.ok(seen > 0);
  const groundMat = firstMesh(scene).material;
  assert.equal(groundMat.roughness, 0.2);
  assert.ok(groundMat.map, "ground follows the scene theme");
});

test("scene kit options scale spacing, ground and props with placement metadata", () => {
  const compact = composeGameKit("camp", {
    seed: 4,
    segments: 8,
    spacing: 0.6,
    groundPadding: 0.2,
    propScale: 0.5,
  });
  const roomy = composeGameKit("camp", {
    seed: 4,
    segments: 8,
    spacing: 1.4,
    groundPadding: 1.2,
    propScale: 1.5,
  });

  assert.ok(
    roomy.userData.extent.width > compact.userData.extent.width,
    "wider spacing and ground margin produce a larger scene",
  );
  assert.equal(compact.userData.theme.spacing, 0.6);
  assert.equal(compact.userData.theme.groundPadding, 0.2);
  assert.equal(compact.userData.theme.propScale, 0.5);
  assert.ok(
    roomy.userData.propList[0].bounds.height >
      compact.userData.propList[0].bounds.height,
    "prop scale reaches the placement bounds",
  );
  assert.ok(compact.userData.propList[0].name.startsWith("camp-"));
  assert.equal(
    compact.userData.propList[0].collision,
    getColliderShape("house"),
  );
  assert.ok(compact.userData.propList[0].bounds.width > 0);
  assert.ok(compact.userData.propList[0].bounds.depth > 0);
});

test("saved scene placements rebuild edited and removed props", () => {
  const original = composeGameKit("camp", { seed: 18 });
  const saved = original.userData.propList.map((prop) => ({ ...prop }));
  saved[0] = {
    ...saved[0],
    type: "tower",
    size: 1.75,
    x: 2.25,
    z: -1.5,
    rotationY: Math.PI / 3,
  };
  saved.splice(2, 1);

  const rebuilt = composeGameKit("camp", { seed: 18, props: saved });
  assert.equal(rebuilt.userData.propList.length, saved.length);
  const first = rebuilt.userData.propList[0];
  assert.equal(first.type, "tower");
  assert.equal(first.size, 1.75);
  assert.equal(first.x, 2.25);
  assert.equal(first.z, -1.5);
  assert.ok(Math.abs(first.rotationY - Math.PI / 3) < 0.0001);
  assert.ok(first.name.includes("-tower-"));
  assert.ok(
    rebuilt.children.some((child) => child.name === first.name),
    "the edited placement gets a matching model",
  );
});

test("editSceneProp updates one model and its export metadata", () => {
  const scene = composeGameKit("dungeon", { seed: 14 });
  const updated = editSceneProp(scene, 1, {
    type: "tower",
    size: 1.6,
    x: 1.4,
    z: -2.1,
    rotationY: Math.PI / 4,
  });
  const model = scene.children.find((child) => child.name === updated.name);

  assert.ok(model, "the replacement model is in the scene");
  assert.equal(updated.type, "tower");
  assert.equal(updated.size, 1.6);
  assert.equal(updated.x, 1.4);
  assert.equal(updated.z, -2.1);
  assert.ok(Math.abs(updated.rotationY - Math.PI / 4) < 0.0001);
  assert.equal(model.position.x, 1.4);
  assert.equal(model.position.z, -2.1);
  assert.equal(scene.userData.propList[1], updated);
});

test("removeSceneProp removes a model and compacts placement names", () => {
  const scene = composeGameKit("town", { seed: 16 });
  const removedName = scene.userData.propList[1].name;
  const removed = removeSceneProp(scene, 1);

  assert.equal(removed.name, removedName);
  assert.equal(scene.userData.propList.length, 8);
  assert.equal(
    scene.children.some((child) => child.name === removedName),
    false,
  );
  const next = scene.userData.propList[1];
  assert.ok(next.name.endsWith("-2"));
  const nextModel = scene.children.find((child) => child.name === next.name);
  assert.ok(nextModel, "the following prop is renumbered with its model");
  nextModel.traverse((child) => {
    if (child !== nextModel)
      assert.ok(
        child.name.startsWith(`${next.name}-`) || child.name === next.name,
      );
  });
});

test("addSceneProp appends a model and export metadata", () => {
  const scene = composeGameKit("camp", { seed: 21, propScale: 1.5 });
  const before = scene.userData.propList.length;
  const added = addSceneProp(scene, {
    type: "tower",
    size: 1.25,
    seed: 4242,
    x: 3.1,
    z: -2.4,
    rotationY: Math.PI / 2,
  });

  assert.equal(scene.userData.propList.length, before + 1);
  assert.equal(scene.userData.propList.at(-1), added);
  assert.equal(added.type, "tower");
  assert.equal(added.size, 1.25);
  assert.equal(added.seed, 4242);
  assert.equal(added.x, 3.1);
  assert.equal(added.z, -2.4);
  assert.ok(Math.abs(added.rotationY - Math.PI / 2) < 0.0001);
  assert.equal(added.collision, getColliderShape("tower"));
  assert.ok(added.bounds.width > 0);
  const model = scene.children.find((child) => child.name === added.name);
  assert.ok(model, "the added prop gets a model in the scene");
  assert.equal(model.position.x, 3.1);
  assert.equal(model.position.z, -2.4);

  // A saved scene rebuilds the added prop from its stored placement.
  const rebuilt = composeGameKit("camp", {
    seed: 21,
    props: scene.userData.propList.map((prop) => ({ ...prop })),
  });
  assert.equal(rebuilt.userData.propList.length, before + 1);
  const last = rebuilt.userData.propList.at(-1);
  assert.equal(last.type, "tower");
  assert.equal(last.size, 1.25);
  assert.equal(last.x, 3.1);
  assert.ok(rebuilt.children.some((child) => child.name === last.name));
});

test("exportGamePack exports composed scenes with props and theme", async () => {
  const scene = composeGameKit("camp", {
    seed: 8,
    style: "realistic",
    color: "#3c2f2a",
    material: { roughness: 0.4, metalness: 0.3, emissive: null },
    texture: "wood",
    textureStrength: 0.75,
  });
  const zip = await exportGamePack({
    model: scene,
    asset: {
      kind: "scene",
      id: "camp-scene",
      name: "Camp Scene",
      type: "camp",
      seed: 8,
      style: "realistic",
      color: "#3c2f2a",
      material: { roughness: 0.4, metalness: 0.3, emissive: null },
      texture: "wood",
      textureStrength: 0.75,
      scene: {
        groundColor: scene.userData.groundColor,
        quality: 1,
        theme: scene.userData.theme,
        props: scene.userData.propList,
      },
    },
    engine: "unity",
    exportedAt: "2026-09-30T00:00:00.000Z",
  });
  const files = unzipSync(zip);
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));

  assert.equal(manifest.assets[0].kind, "scene");
  assert.equal(manifest.assets[0].scene.kit, "camp");
  assert.equal(manifest.assets[0].scene.props.length, 9);
  assert.equal(manifest.assets[0].scene.theme.style, "realistic");
  assert.equal(manifest.assets[0].scene.theme.texture, "wood");
  assert.equal(manifest.assets[0].scene.spacing, 1);
  assert.equal(manifest.assets[0].scene.groundPadding, 0.6);
  assert.equal(manifest.assets[0].scene.propScale, 1);
  assert.equal(manifest.assets[0].gameplay, null);
  assert.ok(manifest.assets[0].scene.props[0].rotationY >= 0);
  assert.ok(manifest.assets[0].scene.props[0].bounds.width > 0);
  assert.equal(manifest.assets[0].collision, null);
  assert.ok(files["models/camp-scene/LOD0.glb"]);
  const readme = new TextDecoder().decode(files["README.md"]);
  assert.ok(readme.includes("Camp Scene"));
  assert.ok(readme.includes("house"));
});

test("buildGamePackFiles records saved scene library assets", () => {
  const zip = buildGamePackFiles({
    assets: [
      samplePackAsset({
        kind: "scene",
        id: "town-scene-1",
        name: "Town Kit",
        type: "town",
        tags: ["scene", "town"],
        scene: {
          kit: "town",
          seed: 9,
          quality: 1,
          theme: { style: "stylized", texture: "stone" },
          props: [
            { type: "house", size: 1.1 },
            { type: "tower", size: 0.95 },
          ],
        },
      }),
    ],
    engine: "unity",
    exportedAt: "2026-09-30T00:00:00.000Z",
  });
  const files = unzipSync(zip);
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));

  assert.equal(manifest.assets[0].kind, "scene");
  assert.equal(manifest.assets[0].scene.props.length, 2);
  assert.equal(manifest.assets[0].scene.theme.style, "stylized");
  assert.deepEqual(manifest.assets[0].tags, ["scene", "town"]);
  assert.ok(files["models/town-scene-1/LOD0.glb"]);
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
  assert.equal(parsed.assets[0].drawCalls, 3);
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
  assert.ok(
    lines[0].includes("id,name,type,favorite,seed,size,segments,style"),
  );
  assert.ok(lines[0].includes("tags"));
  assert.ok(lines[0].includes("lodLevels"));
  assert.ok(lines[0].includes("drawCalls"));
  assert.ok(lines[1].includes("test-1,,sword,false,42,1.5,12,lowpoly"));
  assert.ok(lines[1].includes("100,50,3,3"));
  assert.ok(lines[1].includes("weapon"));
});

test("getAssetTags returns correct category tags for asset types", () => {
  assert.deepEqual(getAssetTags("sword"), ["weapon", "melee", "metal"]);
  assert.deepEqual(getAssetTags("tree"), ["nature", "vegetation", "outdoor"]);
  assert.deepEqual(getAssetTags("house"), ["building", "structure", "indoor"]);
  assert.deepEqual(getAssetTags("turret"), ["scifi", "defense", "metal"]);
  assert.deepEqual(getAssetTags("character"), [
    "creature",
    "character",
    "animated",
  ]);
  assert.deepEqual(getAssetTags("car"), ["vehicle", "transport", "outdoor"]);
  assert.deepEqual(getAssetTags("monster"), [
    "creature",
    "monster",
    "animated",
  ]);
  assert.deepEqual(getAssetTags("dragon"), ["creature", "monster", "flying"]);
  assert.deepEqual(getAssetTags("boat"), ["vehicle", "water", "outdoor"]);
  assert.deepEqual(getAssetTags("plane"), ["vehicle", "flying", "metal"]);
  assert.deepEqual(getAssetTags("bike"), ["vehicle", "transport", "outdoor"]);
  assert.deepEqual(getAssetTags("campfire"), ["item", "light", "outdoor"]);
  assert.deepEqual(getAssetTags("crystal"), [
    "nature",
    "mineral",
    "collectible",
  ]);
  assert.deepEqual(getAssetTags("mushroom"), [
    "nature",
    "vegetation",
    "collectible",
  ]);
  assert.deepEqual(getAssetTags("tree_stump"), [
    "nature",
    "terrain",
    "outdoor",
  ]);
});

test("new game asset types build their declared parts", () => {
  const newTypes = [
    "monster",
    "dragon",
    "boat",
    "plane",
    "bike",
    "campfire",
    "sign",
    "crystal",
    "mushroom",
    "tree_stump",
    "gate",
    "wagon",
    "cannon",
    "grave",
    "ladder",
    "candelabra",
    "anvil",
    "bookshelf",
    "cauldron",
    "throne",
    "bench",
    "lantern",
    "table",
    "chair",
    "bed",
    "chandelier",
    "armor_stand",
    "skeleton",
    "bread",
    "pie",
    "meat_leg",
    "hay_bale",
    "rope_coil",
    "bucket",
    "windmill",
    "coin_pile",
    "minecart",
    "berry_bush",
    "stone_coffin",
    "portcullis",
    "cage",
    "bone_pile",
    "cobweb",
    "lever",
    "urn",
    "mummy",
    "beehive",
    "wheat_sheaf",
  ];
  newTypes.forEach((type) => {
    const model = generateAsset(type, { seed: 42 });
    assert.ok(model, `${type} should generate a model`);
    const stats = getAssetStats(model);
    assert.ok(stats.triangles > 0, `${type} should have triangles`);
    assert.ok(stats.parts > 0, `${type} should have parts`);
  });
});

test("exportAssetManifest includes tags and lodLevels when present", () => {
  const assets = [
    {
      id: "lod-test",
      type: "rock",
      seed: 99,
      stats: { triangles: 500, vertices: 250, parts: 1 },
      lodLevels: [
        { level: 0, triangles: 500 },
        { level: 1, triangles: 120 },
        { level: 2, triangles: 30 },
      ],
    },
  ];

  const json = exportAssetManifest(assets, "json");
  const manifest = JSON.parse(json);
  assert.equal(manifest.count, 1);
  assert.equal(manifest.assets[0].tags.length, 3);
  assert.equal(manifest.assets[0].tags[0], "nature");
  assert.equal(manifest.assets[0].lodLevels.length, 3);
  assert.equal(manifest.assets[0].lodLevels[0].triangles, 500);
  assert.equal(manifest.assets[0].lodLevels[2].triangles, 30);
});

test("exportAssetManifest handles missing lodLevels gracefully", () => {
  const assets = [
    {
      id: "no-lod",
      type: "cube",
      seed: 1,
      stats: { triangles: 24, vertices: 8, parts: 1 },
    },
  ];
  const json = exportAssetManifest(assets, "json");
  const manifest = JSON.parse(json);
  assert.equal(manifest.assets[0].lodLevels, null);
});

test("exportAssetManifest includes names and favorite flags", () => {
  const assets = [
    {
      id: "named",
      name: "Hero Blade",
      type: "sword",
      favorite: true,
      seed: 3,
      stats: { triangles: 10, vertices: 6, parts: 1 },
    },
    {
      id: "plain",
      type: "rock",
      seed: 4,
      stats: { triangles: 20, vertices: 8, parts: 1 },
    },
  ];
  const json = exportAssetManifest(assets, "json");
  const manifest = JSON.parse(json);
  assert.equal(manifest.assets[0].name, "Hero Blade");
  assert.equal(manifest.assets[0].favorite, true);
  assert.equal(manifest.assets[1].name, null);
  assert.equal(manifest.assets[1].favorite, false);
});

test("engine presets resolve Unity conventions by default", () => {
  const presets = getEnginePresets();
  assert.deepEqual(
    presets.map((p) => p.id),
    ["unity", "godot", "unreal"],
  );
  assert.equal(getEnginePreset("unity").upAxis, "Y");
  assert.equal(getEnginePreset("unity").scale, 1);
  assert.equal(getEnginePreset("godot").upAxis, "Y");
  assert.equal(getEnginePreset("unreal").upAxis, "Z");
  assert.equal(getEnginePreset("unreal").scale, 100);
  assert.equal(getEnginePreset("missing").id, "unity");
});

test("collider presets recommend a physics shape for every asset type", () => {
  const shapes = new Set(["box", "sphere", "capsule", "cylinder", "mesh"]);
  for (const type of getAssetTypes()) {
    const shape = getColliderShape(type);
    assert.ok(shapes.has(shape), `${type} has a supported collider preset`);
    assert.equal(getAssetTypeInfo(type).collider, shape);
  }
});

test("gameplay metadata describes how engines should treat every prop", () => {
  const cases = {
    chest: { interaction: "open", role: "container" },
    lever: { interaction: "pull", role: "switch" },
    portcullis: { interaction: "raise", role: "door" },
    monster: { interaction: "enemy", role: "enemy" },
    torch: { interaction: "light", role: "light" },
    coin_pile: { interaction: "collect", role: "collectible" },
    beehive: { interaction: "harvest", role: "resource" },
    sword: { interaction: "attack", role: "weapon" },
    minecart: { interaction: "ride", role: "mount" },
    bed: { interaction: "sleep", role: "furniture" },
  };
  for (const [type, expected] of Object.entries(cases)) {
    assert.deepEqual(
      getAssetTypeInfo(type).gameplay,
      expected,
      `${type} carries its gameplay preset`,
    );
  }
  for (const type of getAssetTypes()) {
    const gameplay = getGameplayInfo(type);
    assert.ok(gameplay.interaction, `${type} has an interaction hint`);
    assert.ok(gameplay.role, `${type} has a role hint`);
  }
  assert.deepEqual(getGameplayInfo("not_a_type"), {
    interaction: "none",
    role: "prop",
  });
});

test("spawn metadata equips creatures for engine AI and spawning", () => {
  const cases = {
    character: {
      faction: "friendly",
      ai: "none",
      health: 100,
      moveSpeed: 3.2,
      aggroRange: 0,
      attackDamage: 0,
    },
    monster: {
      faction: "hostile",
      ai: "melee-chase",
      health: 80,
      moveSpeed: 3.5,
      aggroRange: 12,
      attackDamage: 10,
    },
    dragon: {
      faction: "hostile",
      ai: "fly-breathe",
      health: 500,
      moveSpeed: 6,
      aggroRange: 24,
      attackDamage: 40,
    },
    skeleton: {
      faction: "hostile",
      ai: "melee-chase",
      health: 45,
      moveSpeed: 2.8,
      aggroRange: 10,
      attackDamage: 6,
    },
    mummy: {
      faction: "hostile",
      ai: "melee-chase",
      health: 90,
      moveSpeed: 1.6,
      aggroRange: 8,
      attackDamage: 12,
    },
    turret: {
      faction: "defensive",
      ai: "turret-sweep",
      health: 120,
      moveSpeed: 0,
      aggroRange: 20,
      attackDamage: 8,
    },
  };
  for (const [type, expected] of Object.entries(cases)) {
    assert.deepEqual(
      getAssetTypeInfo(type).spawn,
      expected,
      `${type} carries its spawn preset`,
    );
  }
  for (const type of getAssetTypes()) {
    const spawn = getSpawnInfo(type);
    if (!spawn) continue;
    assert.ok(spawn.faction, `${type} has a faction`);
    assert.ok(spawn.ai, `${type} has an AI hint`);
    assert.ok(spawn.health > 0, `${type} has health`);
    assert.ok(spawn.moveSpeed >= 0, `${type} has a move speed`);
    assert.ok(spawn.aggroRange >= 0, `${type} has an aggro range`);
    assert.ok(spawn.attackDamage >= 0, `${type} has attack damage`);
  }
  assert.equal(getSpawnInfo("chest"), null);
  assert.equal(getSpawnInfo("not_a_type"), null);
});

test("computeCollider fits primitives to the generated bounds", () => {
  const box = computeCollider(
    generateAsset("crate", { size: 2, seed: 1 }),
    "box",
  );
  assert.equal(box.shape, "box");
  assert.ok(Math.abs(box.center[0]) < 1e-5);
  assert.ok(Math.abs(box.size[0] - 1.84) < 0.02);

  const sphere = computeCollider(
    generateAsset("rock", { size: 2, seed: 1 }),
    "sphere",
  );
  assert.equal(sphere.shape, "sphere");
  assert.ok(sphere.radius > 0.8 && sphere.radius < 1);

  const capsule = computeCollider(
    generateAsset("character", { size: 2, seed: 1 }),
    "capsule",
  );
  assert.equal(capsule.shape, "capsule");
  assert.equal(capsule.axis, "Y");
  assert.ok(capsule.height >= capsule.radius * 2);

  const cylinder = computeCollider(
    generateAsset("barrel", { size: 2, seed: 1 }),
    "cylinder",
  );
  assert.equal(cylinder.shape, "cylinder");
  assert.ok(cylinder.radius > 0);
  assert.ok(cylinder.height > 0);
});

test("buildColliderModel produces a named, disposable collider scene", () => {
  const collider = computeCollider(
    generateAsset("tower", { size: 1.5, seed: 6 }),
    "capsule",
  );
  const group = buildColliderModel(collider);
  assert.ok(group);
  assert.equal(group.name, "AI3D-Collider");
  assert.equal(meshCount(group), 1);
  const mesh = firstMesh(group);
  assert.equal(mesh.name, "AI3D-Collider");
  assert.equal(mesh.userData.colliderShape, "capsule");
  assert.equal(
    buildColliderModel(computeCollider(generateAsset("sword"), "mesh")),
    null,
  );
});

test("computeCollider resolves auto presets from the prefixed asset name", () => {
  const rock = computeCollider(generateAsset("rock", { size: 2, seed: 2 }));
  assert.equal(rock.shape, "sphere");

  const barrel = computeCollider(generateAsset("barrel", { size: 2, seed: 2 }));
  assert.equal(barrel.shape, "cylinder");
});

test("computeCollider builds a convex hull from the generated mesh", () => {
  const collider = computeCollider(
    generateAsset("rock", { size: 2, seed: 3 }),
    "convex",
  );
  assert.equal(collider.shape, "convex");
  assert.ok(collider.hullPoints.length >= 12);
  assert.equal(collider.hullPoints.length % 3, 0);
  assert.ok(collider.hullPoints.every((value) => Number.isFinite(value)));
  assert.ok(collider.hullTriangles > 0);
  assert.ok(collider.size.every((value) => value > 0));

  const group = buildColliderModel(collider);
  assert.ok(group);
  assert.equal(group.name, "AI3D-Collider");
  assert.equal(meshCount(group), 1);
  assert.equal(firstMesh(group).userData.colliderShape, "convex");
});

test("buildConvexHullGeometry accepts flat point arrays and rejects junk", () => {
  const tetrahedron = [1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1];
  const hull = buildConvexHullGeometry(tetrahedron);
  assert.ok(hull);
  assert.ok(hull.getAttribute("position").count >= 12);
  hull.dispose();

  assert.equal(buildConvexHullGeometry([]), null);
  assert.equal(buildConvexHullGeometry([0, 0, 0, 1, 1, 1]), null);
});

test("convex colliders degrade to a box when the mesh is degenerate", () => {
  const group = new THREE.Group();
  group.name = "asset-degenerate";
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3),
  );
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));

  const collider = computeCollider(group, "convex");
  assert.equal(collider.shape, "box");
  assert.ok(
    collider.size.every((value) => Number.isFinite(value) && value >= 0),
  );
});

test("buildGamePackFiles zips models, thumbnail and manifest for Unity", () => {
  const zip = buildGamePackFiles({
    assets: [samplePackAsset()],
    engine: "unity",
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  assert.ok(zip instanceof Uint8Array);
  const files = unzipSync(zip);

  assert.ok(files["models/sword-test-1/LOD0.glb"]);
  assert.equal(files["models/sword-test-1/LOD0.glb"].length, 4);
  assert.ok(files["thumbnails/sword-test-1.png"]);
  assert.ok(files["README.md"]);

  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  assert.equal(manifest.schema, "ai3d-game-pack");
  assert.equal(manifest.engine.id, "unity");
  assert.equal(manifest.engine.upAxis, "Y");
  assert.equal(manifest.engine.scale, 1);
  assert.equal(manifest.assets[0].name, "Sword Test");
  assert.equal(manifest.assets[0].stats.triangles, 120);
  assert.equal(manifest.assets[0].files.model, "models/sword-test-1/LOD0.glb");
  assert.deepEqual(manifest.assets[0].gameplay, {
    interaction: "attack",
    role: "weapon",
  });
  assert.equal(manifest.assets[0].spawn, null);
});

test("game packs carry spawn and AI metadata for creatures", () => {
  const zip = buildGamePackFiles({
    assets: [
      samplePackAsset({
        id: "dungeon-monster-1",
        name: "Dungeon Monster",
        type: "monster",
      }),
    ],
    engine: "unity",
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  const files = unzipSync(zip);
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));

  assert.deepEqual(manifest.assets[0].spawn, {
    faction: "hostile",
    ai: "melee-chase",
    health: 80,
    moveSpeed: 3.5,
    aggroRange: 12,
    attackDamage: 10,
  });
  assert.deepEqual(manifest.assets[0].gameplay, {
    interaction: "enemy",
    role: "enemy",
  });
});

test("Godot packs include an instanceable tscn wrapper for each model", () => {
  const zip = buildGamePackFiles({
    assets: [samplePackAsset()],
    engine: "godot",
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  const files = unzipSync(zip);
  const scene = new TextDecoder().decode(files["scenes/sword-test-1.tscn"]);
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));

  assert.match(scene, /\[gd_scene load_steps=2 format=3\]/);
  assert.match(scene, /path="res:\/\/models\/sword-test-1\/LOD0\.glb"/);
  assert.match(scene, /\[node name="Sword Test" instance=ExtResource/);
  assert.equal(manifest.assets[0].files.scene, "scenes/sword-test-1.tscn");
});

test("buildGamePackFiles stores per-clip animation GLBs and manifest files", () => {
  const zip = buildGamePackFiles({
    assets: [
      samplePackAsset({
        animationFiles: [
          {
            name: "idle",
            duration: 2,
            glbBytes: new Uint8Array([0x67, 0x6c, 0x74, 0x66]),
          },
          {
            name: "attack",
            duration: 1.25,
            glbBytes: new Uint8Array([0x67, 0x6c, 0x62, 0x02]),
          },
        ],
      }),
    ],
    engine: "unity",
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  const files = unzipSync(zip);
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));

  assert.ok(files["animations/sword-test-1/idle.glb"]);
  assert.ok(files["animations/sword-test-1/attack.glb"]);
  assert.deepEqual(manifest.assets[0].files.animations, [
    "animations/sword-test-1/idle.glb",
    "animations/sword-test-1/attack.glb",
  ]);
  assert.deepEqual(manifest.assets[0].clipFiles, [
    {
      name: "idle",
      duration: 2,
      file: "animations/sword-test-1/idle.glb",
    },
    {
      name: "attack",
      duration: 1.25,
      file: "animations/sword-test-1/attack.glb",
    },
  ]);
});

test("game packs include collision metadata and a collider GLB", () => {
  const zip = buildGamePackFiles({
    assets: [
      samplePackAsset({
        collision: {
          shape: "box",
          center: [0, 0, 0],
          size: [0.9, 0.9, 0.9],
        },
        colliderBytes: new Uint8Array([0x67, 0x6c, 0x74, 0x66]),
      }),
    ],
    engine: "unity",
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  const files = unzipSync(zip);
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));

  assert.ok(files["colliders/sword-test-1.glb"]);
  assert.equal(manifest.assets[0].files.collider, "colliders/sword-test-1.glb");
  assert.equal(manifest.assets[0].collision.shape, "box");
  assert.deepEqual(manifest.assets[0].collision.size, [0.9, 0.9, 0.9]);
});

test("game packs preserve convex hull points in the manifest", () => {
  const hullPoints = [1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1];
  const zip = buildGamePackFiles({
    assets: [
      samplePackAsset({
        collision: {
          shape: "convex",
          center: [0, 0.5, 0],
          size: [2, 2, 2],
          hullPoints,
          hullTriangles: 4,
        },
      }),
    ],
    engine: "unity",
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  const files = unzipSync(zip);
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  const collision = manifest.assets[0].collision;

  assert.equal(collision.shape, "convex");
  assert.deepEqual(collision.hullPoints, hullPoints);
  assert.equal(collision.hullTriangles, 4);
  assert.deepEqual(collision.center, [0, 0.5, 0]);
  assert.equal(
    Object.prototype.hasOwnProperty.call(collision, "radius"),
    false,
  );
});

test("game packs carry Unreal conventions and LOD files", () => {
  const lod = [
    {
      level: 0,
      triangles: 120,
      vertices: 60,
      parts: 2,
      drawCalls: 2,
      glbBytes: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
    },
    {
      level: 1,
      triangles: 60,
      vertices: 32,
      parts: 2,
      drawCalls: 2,
      glbBytes: new Uint8Array([0x11, 0x12, 0x13, 0x14]),
    },
  ];
  const zip = buildGamePackFiles({
    assets: [
      samplePackAsset({
        id: "rock-7",
        type: "rock",
        lodLevels: lod,
        glbBytes: lod[0].glbBytes,
      }),
    ],
    engine: "unreal",
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  const files = unzipSync(zip);
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));

  assert.equal(manifest.engine.id, "unreal");
  assert.equal(manifest.engine.upAxis, "Z");
  assert.equal(manifest.engine.scale, 100);
  assert.equal(manifest.engine.units, "centimeters");
  assert.deepEqual(manifest.budget, {
    triangles: 120,
    vertices: 60,
    parts: 2,
    drawCalls: 2,
  });
  assert.equal(manifest.assets[0].lodLevels.length, 2);
  assert.equal(manifest.assets[0].lodLevels[1].vertices, 32);
  assert.equal(manifest.assets[0].lodLevels[1].parts, 2);
  assert.equal(manifest.assets[0].lodLevels[1].drawCalls, 2);
  assert.deepEqual(
    manifest.assets[0].lodLevels.map((l) => l.file),
    ["models/rock-7/LOD0.glb", "models/rock-7/LOD1.glb"],
  );
  assert.ok(files["models/rock-7/LOD0.glb"]);
  assert.ok(files["models/rock-7/LOD1.glb"]);
});

test("game packs carry a readiness summary and game-ready.json", () => {
  const zip = buildGamePackFiles({
    assets: [
      samplePackAsset({
        readiness: { score: 45, fail: 2, fixed: ["uv"], skipped: ["rig"] },
      }),
      samplePackAsset({
        id: "shield-2",
        name: "Shield Two",
        type: "shield",
        readiness: { score: 88, fail: 0, fixed: [], skipped: [] },
      }),
      samplePackAsset({
        id: "pickaxe-3",
        name: "Pickaxe Three",
        type: "pickaxe",
        readiness: { score: 96, fail: 0, fixed: ["collider"], skipped: [] },
      }),
    ],
    engine: "unity",
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  const files = unzipSync(zip);
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  const gameReady = JSON.parse(
    new TextDecoder().decode(files["game-ready.json"]),
  );

  assert.deepEqual(manifest.readiness, {
    count: 3,
    ready: 1,
    repaired: 1,
    issues: 1,
    notAudited: 0,
  });
  assert.deepEqual(manifest.assets[0].readiness, {
    score: 45,
    fail: 2,
    fixed: ["uv"],
    skipped: ["rig"],
  });
  assert.equal(gameReady.count, 3);
  assert.equal(gameReady.ready, 1);
  assert.equal(gameReady.repaired, 1);
  assert.equal(gameReady.issues, 1);
  assert.equal(gameReady.notAudited, 0);
  assert.deepEqual(
    gameReady.rows.map((row) => row.status),
    ["needs-attention", "ready", "repaired"],
  );
});

test("summariseGameReadiness tallies ready, repaired and issue records", () => {
  const summary = summariseGameReadiness([
    {
      id: "sword-a",
      name: "Sword A",
      type: "sword",
      readiness: { score: 95, fail: 0, fixed: [], skipped: [] },
    },
    {
      id: "shield-b",
      name: "Shield B",
      type: "shield",
      readiness: { score: 70, fail: 0, fixed: ["uv"], skipped: [] },
    },
    {
      id: "rock-c",
      name: "Rock C",
      type: "rock",
      readiness: { score: 40, fail: 3, fixed: [], skipped: ["rig"] },
    },
    { id: "pickaxe-d", name: "Pickaxe D", type: "pickaxe" },
  ]);

  assert.deepEqual(
    {
      count: summary.count,
      ready: summary.ready,
      repaired: summary.repaired,
      issues: summary.issues,
      notAudited: summary.notAudited,
    },
    { count: 4, ready: 1, repaired: 1, issues: 1, notAudited: 1 },
  );
  assert.deepEqual(
    summary.rows.map((row) => row.status),
    ["ready", "repaired", "needs-attention", "not-audited"],
  );
});

test("exportGamePack exports a real GLB at the preset scale", async () => {
  const source = generateAsset("tower", {
    size: 1.2,
    segments: 10,
    style: "lowpoly",
    seed: 3,
  });
  const zip = await exportGamePack({
    model: source,
    asset: { id: "tower-pack", type: "tower", seed: 3 },
    engine: "unreal",
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  const files = unzipSync(zip);
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  const glb = files["models/tower-pack/LOD0.glb"];

  assert.equal(manifest.engine.id, "unreal");
  assert.equal(manifest.engine.scale, 100);
  assert.equal(
    manifest.assets[0].stats.triangles,
    getAssetStats(source).triangles,
  );
  assert.equal(String.fromCharCode(...glb.slice(0, 4)), "glTF");
});

test("exportGamePack ships standalone PBR textures and manifest metadata", async () => {
  const source = generateAsset("sword", {
    size: 1,
    seed: 7,
    texture: "metal",
    textureStrength: 0.9,
  });
  const zip = await exportGamePack({
    model: source,
    asset: {
      id: "sword-tex",
      type: "sword",
      seed: 7,
      texture: "metal",
      textureStrength: 0.9,
      textureSize: 128,
    },
    engine: "unity",
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  const files = unzipSync(zip);
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));

  for (const name of ["albedo", "normal", "roughness", "metalness", "ao"]) {
    const png = files[`textures/sword-tex/${name}.png`];
    assert.ok(png, `${name} texture is in the pack`);
    assert.deepEqual(
      [...png.slice(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      `${name} starts with a PNG signature`,
    );
  }
  assert.equal(manifest.assets[0].texture.kind, "metal");
  assert.equal(manifest.assets[0].texture.strength, 0.9);
  assert.equal(manifest.assets[0].textureSize, 128);
  assert.ok(manifest.assets[0].hierarchy?.parts.length >= 5);
  assert.equal(manifest.assets[0].hierarchy.attachments[0].role, "grip");
  assert.deepEqual(manifest.assets[0].files.textures, [
    "textures/sword-tex/albedo.png",
    "textures/sword-tex/normal.png",
    "textures/sword-tex/roughness.png",
    "textures/sword-tex/metalness.png",
    "textures/sword-tex/ao.png",
  ]);
});

test("exportGamePack records exported anchors and leaves them out by default", async () => {
  const source = generateAsset("sword", { size: 1, seed: 7 });
  const anchoredZip = await exportGamePack({
    model: source,
    asset: { id: "sword-anchored", type: "sword", seed: 7 },
    engine: "unity",
    anchors: true,
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  const anchoredFiles = unzipSync(anchoredZip);
  const anchoredManifest = JSON.parse(
    new TextDecoder().decode(anchoredFiles["manifest.json"]),
  );
  assert.equal(anchoredManifest.assets[0].anchors[0].role, "grip");
  assert.equal(anchoredManifest.assets[0].anchors[0].position.z, 0);
  const glb = new Uint8Array(anchoredFiles["models/sword-anchored/LOD0.glb"]);
  const glbView = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const glbJsonLength = glbView.getUint32(12, true);
  const glbJson = JSON.parse(
    new TextDecoder().decode(glb.subarray(20, 20 + glbJsonLength)),
  );
  assert.ok(
    glbJson.nodes.some((node) => node.name === "anchor_grip"),
    "anchor node is written into the exported GLB",
  );

  const plainZip = await exportGamePack({
    model: source,
    asset: { id: "sword-plain", type: "sword", seed: 7 },
    engine: "unity",
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  const plainFiles = unzipSync(plainZip);
  const plainManifest = JSON.parse(
    new TextDecoder().decode(plainFiles["manifest.json"]),
  );
  assert.equal(plainManifest.assets[0].anchors, null);
});

test("exportGamePack writes per-clip animation GLBs when requested and skips them by default", async () => {
  const source = generateAsset("dragon", { size: 2, seed: 9, segments: 10 });
  const clipZip = await exportGamePack({
    model: source,
    asset: { id: "dragon-clips", type: "dragon", seed: 9 },
    engine: "unity",
    exportClips: true,
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  const clipFiles = unzipSync(clipZip);
  const clipManifest = JSON.parse(
    new TextDecoder().decode(clipFiles["manifest.json"]),
  );

  assert.ok(clipManifest.assets[0].clipFiles.length >= 3, "has clip files");
  for (const clip of clipManifest.assets[0].clipFiles) {
    const glb = clipFiles[clip.file];
    assert.ok(glb, `clip exists: ${clip.file}`);
    assert.equal(String.fromCharCode(...glb.slice(0, 4)), "glTF");
    assert.ok(clip.duration > 0, `clip has duration: ${clip.name}`);
  }
  assert.ok(
    clipManifest.assets[0].files.animations.length >= 3,
    "files list includes clips",
  );

  const plainZip = await exportGamePack({
    model: source,
    asset: { id: "dragon-single", type: "dragon", seed: 9 },
    engine: "unity",
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  const plainFiles = unzipSync(plainZip);
  assert.equal(
    Object.keys(plainFiles).some((name) => name.startsWith("animations/")),
    false,
    "no clips written by default",
  );
});

test("exportGamePack writes colliders and respects the none choice", async () => {
  const source = generateAsset("barrel", { size: 1, seed: 4 });
  const autoZip = await exportGamePack({
    model: source,
    asset: { id: "barrel-pack", type: "barrel", seed: 4 },
    engine: "unity",
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  const autoFiles = unzipSync(autoZip);
  const autoManifest = JSON.parse(
    new TextDecoder().decode(autoFiles["manifest.json"]),
  );

  assert.equal(autoManifest.assets[0].collision.shape, "cylinder");
  assert.ok(autoFiles["colliders/barrel-pack.glb"]);
  assert.equal(
    String.fromCharCode(...autoFiles["colliders/barrel-pack.glb"].slice(0, 4)),
    "glTF",
  );

  const noneZip = await exportGamePack({
    model: source,
    asset: { id: "barrel-pack", type: "barrel", seed: 4 },
    engine: "unity",
    collision: "none",
    exportedAt: "2026-09-29T00:00:00.000Z",
  });
  const noneFiles = unzipSync(noneZip);
  const noneManifest = JSON.parse(
    new TextDecoder().decode(noneFiles["manifest.json"]),
  );
  assert.equal(noneManifest.assets[0].collision, null);
  assert.equal(noneFiles["colliders/barrel-pack.glb"], undefined);
});

test("animated props carry procedural clips over their named parts", () => {
  const clipsByType = {
    chest: ["open"],
    campfire: ["flicker"],
    torch: ["flicker"],
    brazier: ["flicker"],
    flag: ["wave"],
    fountain: ["flow"],
    car: ["spin"],
    bike: ["spin"],
    plane: ["spin"],
    drone: ["spin"],
    turret: ["sweep"],
    antenna: ["sway"],
    crystal: ["pulse"],
    runestone: ["pulse"],
    tree: ["sway"],
    boat: ["bob"],
  };
  for (const [type, expected] of Object.entries(clipsByType)) {
    const model = generateAsset(type, { size: 1.4, seed: 7, segments: 10 });
    const names = (model.animations || []).map((clip) => clip.name);
    assert.deepEqual(names, expected, `${type} clips`);
    for (const clip of model.animations) {
      assert.ok(
        clip.duration > 0.4 && clip.duration <= 3.5,
        `${type} duration`,
      );
      for (const track of clip.tracks) {
        const nodeName = track.name.replace(
          /\.(quaternion|position|scale)$/,
          "",
        );
        assert.ok(
          model.getObjectByName(nodeName),
          `${type} missing ${nodeName}`,
        );
        assert.ok(track.times.length >= 3, `${type} ${track.name} keyframes`);
      }
    }
  }
});

test("procedural clips start from each part's base pose", () => {
  const model = generateAsset("car", { size: 1.2, seed: 4, segments: 8 });
  const wheel = model.getObjectByName("wheel-0");
  const spin = model.animations.find((clip) => clip.name === "spin");
  const rotation = spin.tracks.find(
    (track) => track.name === "wheel-0.quaternion",
  );
  const first = Array.from(rotation.values).slice(0, 4);
  const base = wheel.quaternion.toArray();
  assert.deepEqual(
    first.map((value) => Number(value.toFixed(6))),
    base.map((value) => Number(value.toFixed(6))),
  );

  const flameModel = generateAsset("campfire", {
    size: 1,
    seed: 5,
    segments: 8,
  });
  const flicker = flameModel.animations.find((clip) => clip.name === "flicker");
  const scale = flicker.tracks.find((track) => track.name === "flame.scale");
  assert.deepEqual(Array.from(scale.values).slice(0, 3), [1, 1, 1]);
});

test("selectAnimations keeps, strips or narrows generated clips", () => {
  const model = generateAsset("dragon", { size: 2, seed: 9, segments: 10 });
  assert.equal(selectAnimations(model, "auto").length, 3);
  assert.deepEqual(
    selectAnimations(model, "fly").map((clip) => clip.name),
    ["fly"],
  );
  assert.deepEqual(selectAnimations(model, "none"), []);
});

test("auditGameAsset reports game readiness for a prop", () => {
  const model = generateAsset("sword", { size: 1, seed: 7 });
  const report = auditGameAsset(model, "sword", { pivot: "center" });
  const ids = report.checks.map((check) => check.id);
  for (const id of [
    "parts",
    "budget",
    "collision",
    "lod",
    "animation",
    "rig",
    "material",
    "uv",
    "dimensions",
    "origin",
    "mesh",
  ]) {
    assert.ok(ids.includes(id), `${id} is audited`);
  }
  assert.ok(report.readiness >= 0 && report.readiness <= 1);
  assert.equal(typeof report.summary.blocked, "boolean");
  assert.equal(typeof report.summary.ready, "boolean");
  for (const check of report.checks) {
    assert.ok(
      ["pass", "warn", "fail"].includes(check.status),
      `${check.id} has a real status`,
    );
  }
});

test("auditGameAsset scores a rigged character as ready", () => {
  const model = generateAsset("character", {
    size: 1.4,
    seed: 7,
    pivot: "ground",
  });
  const report = auditGameAsset(model, "character", { pivot: "ground" });
  const byId = new Map(report.checks.map((check) => [check.id, check]));
  assert.equal(byId.get("rig").status, "pass");
  assert.equal(byId.get("origin").status, "pass");
  const animation = byId.get("animation");
  assert.equal(animation.status, "pass");
  assert.ok(animation.details.join(" ").includes("idle"));
  assert.ok(animation.details.join(" ").includes("walk"));
  assert.ok(animation.details.join(" ").includes("attack"));
  assert.equal(report.summary.blocked, false);
  assert.equal(report.readiness, 1);
});

test("auditGameAsset honours the requested pivot", () => {
  const model = generateAsset("character", { size: 1.4, seed: 7 });
  const centered = auditGameAsset(model, "character", { pivot: "center" });
  const centeredOrigin = centered.checks.find((check) => check.id === "origin");
  assert.equal(centeredOrigin.status, "pass");

  const mistaken = auditGameAsset(model, "character", { pivot: "ground" });
  const mistakenOrigin = mistaken.checks.find((check) => check.id === "origin");
  assert.equal(mistakenOrigin.status, "fail");
});

test("auditGameAsset blocks when there is no object", () => {
  const report = auditGameAsset(null, "sword");
  assert.equal(report.summary.blocked, true);
  assert.equal(report.summary.fail, 1);
  assert.equal(report.readiness, 0);
});

test("generateLOD keeps skin attributes on rigged levels", () => {
  const model = generateAsset("character", { size: 1.4, seed: 7 });
  const levels = generateLOD(model, 4);
  for (const [index, level] of levels.slice(1).entries()) {
    let skinned = 0;
    level.mesh.traverse((node) => {
      if (!node.isSkinnedMesh) return;
      skinned += 1;
      assert.ok(
        node.geometry.attributes.skinIndex,
        `LOD ${index + 1} keeps JOINTS_0`,
      );
      assert.ok(
        node.geometry.attributes.skinWeight,
        `LOD ${index + 1} keeps WEIGHTS_0`,
      );
    });
    assert.ok(skinned >= 1, `LOD ${index + 1} keeps skinned meshes`);
  }
});

function breakMeshRepairTargets(model) {
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry.deleteAttribute("uv");
    child.material = new THREE.MeshBasicMaterial({
      color: child.material?.color || 0x888888,
    });
  });
}

function findRepairCode(result, code) {
  return result.fixed.find((record) => record.code === code);
}

test("repairGameAsset regenerates UVs and upgrades basic materials", () => {
  const model = generateAsset("sword", { size: 1, seed: 7 });
  breakMeshRepairTargets(model);
  const before = auditGameAsset(model, "sword", { pivot: "center" });
  const uvBefore = before.checks.find((check) => check.id === "uv");
  const materialBefore = before.checks.find((check) => check.id === "material");
  assert.equal(uvBefore.status, "fail");
  assert.equal(materialBefore.status, "fail");

  const result = repairGameAsset(model, "sword", { pivot: "center" });
  const after = result.report;
  const uvAfter = after.checks.find((check) => check.id === "uv");
  const materialAfter = after.checks.find((check) => check.id === "material");
  assert.ok(findRepairCode(result, "uv"), "uv repair is reported");
  assert.ok(findRepairCode(result, "material"), "material repair is reported");
  assert.equal(uvAfter.status, "pass");
  assert.equal(materialAfter.status, "pass");
  assert.ok(after.summary.fail === 0);
});

test("repairGameAsset leaves a healthy prop untouched", () => {
  const model = generateAsset("rock", { size: 2, seed: 7 });
  const beforeStats = getAssetStats(model);

  const result = repairGameAsset(model, "rock", { pivot: "center" });
  assert.equal(result.fixed.length, 0, "no repair is forced onto a ready prop");
  assert.deepEqual(
    getAssetStats(model),
    beforeStats,
    "budget and mesh data stay untouched",
  );
  let colliderCount = 0;
  model.traverse((child) => {
    if (child.name === "AI3D-Collider") colliderCount += 1;
  });
  assert.equal(colliderCount, 0, "no duplicate collider is attached");
  assert.equal(result.report.summary.fail, 0);
});

test("repairGameAsset reports regenerate skips for missing game structure", () => {
  const model = generateAsset("character", { size: 1.4, seed: 7 });
  const skeleton = model.getObjectByName("skeleton");
  skeleton.parent.remove(skeleton);

  const result = repairGameAsset(model, "character", { pivot: "ground" });
  assert.ok(
    result.skipped.some((record) => record.detail === "rig"),
    "a missing skeleton is reported as a regenerate skip",
  );
  assert.ok(
    !result.fixed.some((record) => record.code === "rig"),
    "structure is never faked by the repair pass",
  );
  const rigAfter = result.report.checks.find((check) => check.id === "rig");
  assert.equal(rigAfter.status, "fail");
});

test("repairGameAsset moves a centered model to its ground pivot", () => {
  const model = generateAsset("character", { size: 1.4, seed: 7 });
  const before = auditGameAsset(model, "character", { pivot: "ground" });
  const originBefore = before.checks.find((check) => check.id === "origin");
  assert.equal(originBefore.status, "fail");
  let rootBone;
  model.traverse((child) => {
    if (child.isBone && child.name === "root") rootBone = child;
  });
  assert.ok(rootBone, "rigged characters carry a root bone");
  const boneBefore = rootBone.getWorldPosition(new THREE.Vector3());
  const boxBefore = new THREE.Box3().setFromObject(model);

  const result = repairGameAsset(model, "character", { pivot: "ground" });
  assert.ok(findRepairCode(result, "origin"), "origin repair is reported");
  const originAfter = result.report.checks.find(
    (check) => check.id === "origin",
  );
  assert.equal(originAfter.status, "pass");
  const box = new THREE.Box3().setFromObject(model);
  assert.ok(Math.abs(box.min.y) < 1e-3, "model sits on y=0");
  const boneAfter = rootBone.getWorldPosition(new THREE.Vector3());
  assert.ok(
    Math.abs(boneAfter.y - boneBefore.y - (box.min.y - boxBefore.min.y)) < 1e-6,
    "meshes and the root bone move once together",
  );

  const second = repairGameAsset(model, "character", { pivot: "ground" });
  assert.ok(
    !findRepairCode(second, "origin"),
    "a second repair does not shift the root again",
  );
  const boxTwice = new THREE.Box3().setFromObject(model);
  assert.ok(
    Math.abs(boxTwice.min.y - box.min.y) < 1e-9,
    "the pivot stays put after a repeated repair",
  );
});

test("repairGameAsset reduces triangles when the budget fails", () => {
  const model = generateAsset("sword", {
    size: 0.12,
    seed: 7,
    segments: 32,
  });
  const beforeTriangles = countTriangles(model);
  const before = auditGameAsset(model, "sword", { pivot: "center" });
  const budgetBefore = before.checks.find((check) => check.id === "budget");
  assert.equal(budgetBefore.status, "fail");

  const result = repairGameAsset(model, "sword", { pivot: "center" });
  assert.ok(findRepairCode(result, "budget"), "budget repair is reported");
  const budgetAfter = result.report.checks.find(
    (check) => check.id === "budget",
  );
  assert.ok(budgetAfter.status !== "fail");
  assert.ok(countTriangles(model) < beforeTriangles);
  const uvAfter = result.report.checks.find((check) => check.id === "uv");
  assert.equal(uvAfter.status, "pass", "decimation keeps the UV mapping");
});
