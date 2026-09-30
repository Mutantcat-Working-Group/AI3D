import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { zipSync } from "fflate";
import {
  createProceduralTextures,
  resolveTextureKind,
  ensureNodeCanvasPolyfill,
} from "./procedural-textures.js";

// Asset type definitions with generation parameters
const ASSET_TYPES = {
  sword: {
    name: "Sword",
    parts: ["blade", "tip", "guard", "handle", "pommel"],
  },
  tree: { name: "Tree", parts: ["trunk", "foliage"] },
  rock: { name: "Rock", parts: ["body"] },
  house: { name: "House", parts: ["walls", "roof", "door", "windows"] },
  car: { name: "Car", parts: ["body", "wheels", "windows"] },
  character: { name: "Character", parts: ["head", "body", "arms", "legs"] },
  cube: { name: "Cube", parts: ["body"] },
  shield: { name: "Shield", parts: ["body", "boss", "rim"] },
  potion: { name: "Potion", parts: ["body", "neck", "cork"] },
  chest: { name: "Chest", parts: ["body", "lid", "lock"] },
  key: { name: "Key", parts: ["bow", "shaft", "bit"] },
  gem: { name: "Gem", parts: ["body"] },
  barrel: { name: "Barrel", parts: ["body", "hoops"] },
  crate: { name: "Crate", parts: ["body"] },
  tower: { name: "Tower", parts: ["shaft", "roof", "windows"] },
  flag: { name: "Flag", parts: ["pole", "cloth", "tail"] },
  torch: { name: "Torch", parts: ["handle", "cup", "flame"] },
  fence: { name: "Fence", parts: ["posts", "rails"] },
  bridge: { name: "Bridge", parts: ["deck", "rails", "legs"] },
  fountain: {
    name: "Fountain",
    parts: ["basin", "water", "pillar", "bowl", "jet"],
  },
  brazier: { name: "Brazier", parts: ["basin", "legs", "coals", "flame"] },
  runestone: { name: "Runestone", parts: ["stone", "rune"] },
  trap: { name: "Trap", parts: ["frame", "spikes"] },
  turret: { name: "Turret", parts: ["base", "body", "barrel", "eye"] },
  drone: { name: "Drone", parts: ["body", "rotors", "camera"] },
  antenna: { name: "Antenna", parts: ["mast", "dish", "arm", "light"] },
  axe: { name: "Axe", parts: ["head", "handle", "wrap"] },
  bow: { name: "Bow", parts: ["limb", "riser", "string"] },
  hammer: { name: "Hammer", parts: ["head", "handle", "grip"] },
  spear: { name: "Spear", parts: ["head", "shaft", "butt"] },
  tent: { name: "Tent", parts: ["canopy", "pole", "floor"] },
  statue: { name: "Statue", parts: ["base", "body", "head"] },
  pillar: { name: "Pillar", parts: ["column", "capital", "base"] },
  well: { name: "Well", parts: ["rim", "posts", "roof", "bucket"] },
  monster: { name: "Monster", parts: ["body", "head", "arms", "legs", "tail"] },
  dragon: { name: "Dragon", parts: ["body", "head", "wings", "legs", "tail"] },
  boat: { name: "Boat", parts: ["hull", "mast", "sail", "deck"] },
  plane: { name: "Plane", parts: ["fuselage", "wings", "tail", "engines"] },
  bike: { name: "Bike", parts: ["frame", "wheels", "handlebars", "seat"] },
  campfire: {
    name: "Campfire",
    base: "logs",
    parts: ["logs", "stones", "flame"],
  },
  sign: { name: "Sign", parts: ["post", "board", "text"] },
  barrel_variants: { name: "Barrel Variants", parts: ["body", "hoops", "lid"] },
  crystal: { name: "Crystal", parts: ["base", "shard", "tip"] },
  mushroom: { name: "Mushroom", parts: ["stem", "cap", "spots"] },
  tree_stump: { name: "Tree Stump", parts: ["stump", "rings", "roots"] },
};

// Asset category tags for game engine classification
const ASSET_TAGS = {
  sword: ["weapon", "melee", "metal"],
  axe: ["weapon", "melee", "metal"],
  bow: ["weapon", "ranged", "wood"],
  hammer: ["weapon", "melee", "metal"],
  spear: ["weapon", "melee", "wood"],
  shield: ["weapon", "defense", "metal"],
  tree: ["nature", "vegetation", "outdoor"],
  rock: ["nature", "terrain", "outdoor"],
  gem: ["nature", "mineral", "collectible"],
  house: ["building", "structure", "indoor"],
  tower: ["building", "structure", "defense"],
  tent: ["building", "structure", "outdoor"],
  statue: ["building", "decoration", "indoor"],
  pillar: ["building", "structure", "indoor"],
  well: ["building", "structure", "outdoor"],
  fountain: ["building", "decoration", "outdoor"],
  bridge: ["building", "structure", "outdoor"],
  fence: ["building", "structure", "outdoor"],
  car: ["vehicle", "transport", "outdoor"],
  character: ["creature", "character", "animated"],
  cube: ["primitive", "basic", "indoor"],
  potion: ["item", "consumable", "indoor"],
  chest: ["item", "container", "indoor"],
  key: ["item", "tool", "indoor"],
  barrel: ["item", "container", "outdoor"],
  crate: ["item", "container", "outdoor"],
  flag: ["item", "decoration", "outdoor"],
  torch: ["item", "light", "outdoor"],
  brazier: ["item", "light", "outdoor"],
  runestone: ["item", "magic", "outdoor"],
  trap: ["item", "hazard", "outdoor"],
  turret: ["scifi", "defense", "metal"],
  drone: ["scifi", "vehicle", "metal"],
  antenna: ["scifi", "structure", "metal"],
  monster: ["creature", "monster", "animated"],
  dragon: ["creature", "monster", "flying"],
  boat: ["vehicle", "water", "outdoor"],
  plane: ["vehicle", "flying", "metal"],
  bike: ["vehicle", "transport", "outdoor"],
  campfire: ["item", "light", "outdoor"],
  sign: ["item", "decoration", "outdoor"],
  barrel_variants: ["item", "container", "outdoor"],
  crystal: ["nature", "mineral", "collectible"],
  mushroom: ["nature", "vegetation", "collectible"],
  tree_stump: ["nature", "terrain", "outdoor"],
};

// Collider presets are per asset type so game teams get a sensible physics
// proxy without tuning one manually. The computed size still comes from the
// actual generated model, so presets only decide the primitive shape.
const ASSET_COLLIDERS = {
  sword: "capsule",
  tree: "capsule",
  rock: "sphere",
  house: "box",
  car: "box",
  character: "capsule",
  cube: "box",
  shield: "mesh",
  potion: "sphere",
  chest: "box",
  key: "mesh",
  gem: "sphere",
  barrel: "cylinder",
  crate: "box",
  tower: "box",
  flag: "box",
  torch: "cylinder",
  fence: "box",
  bridge: "box",
  fountain: "box",
  brazier: "cylinder",
  runestone: "box",
  trap: "box",
  turret: "box",
  drone: "box",
  antenna: "cylinder",
  axe: "capsule",
  bow: "mesh",
  hammer: "capsule",
  spear: "capsule",
  tent: "box",
  statue: "box",
  pillar: "cylinder",
  well: "cylinder",
  monster: "capsule",
  dragon: "capsule",
  boat: "capsule",
  plane: "box",
  bike: "box",
  campfire: "cylinder",
  sign: "box",
  barrel_variants: "cylinder",
  crystal: "sphere",
  mushroom: "capsule",
  tree_stump: "cylinder",
};

// Animation presets target the named limbs every animated asset already
// builds, so the same clips work on generated characters, monsters and
// dragons without a separate skeleton rig.
const ANIMATION_PRESETS = {
  character: ["idle", "walk", "attack"],
  monster: ["idle", "walk", "attack"],
  dragon: ["idle", "fly", "attack"],
};

/**
 * Get category tags for an asset type.
 * @param {string} type - Asset type key
 * @returns {string[]} Array of tag strings
 */
export function getAssetTags(type) {
  return ASSET_TAGS[type] || ["misc"];
}

/**
 * Get the recommended collision primitive for an asset type.
 * @param {string} type - Asset type key
 * @returns {string} "box", "sphere", "capsule", "cylinder" or "mesh"
 */
export function getColliderShape(type) {
  return ASSET_COLLIDERS[type] || "mesh";
}

/**
 * Build a quaternion track from per-frame Euler rotations.
 */
function quaternionTrack(nodeName, frames) {
  const times = new Float32Array(frames.length);
  const values = new Float32Array(frames.length * 4);
  const euler = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  frames.forEach((frame, index) => {
    times[index] = frame.t;
    euler.set(frame.rot[0], frame.rot[1], frame.rot[2]);
    quaternion.setFromEuler(euler);
    values.set(quaternion.toArray(), index * 4);
  });
  return new THREE.QuaternionKeyframeTrack(
    `${nodeName}.quaternion`,
    times,
    values,
  );
}

/**
 * Build a position track from per-frame offsets.
 */
function positionTrack(nodeName, frames) {
  const times = new Float32Array(frames.length);
  const values = new Float32Array(frames.length * 3);
  frames.forEach((frame, index) => {
    times[index] = frame.t;
    values.set(frame.pos, index * 3);
  });
  return new THREE.VectorKeyframeTrack(`${nodeName}.position`, times, values);
}

/**
 * Add ready-to-play procedural clips to an animated asset. The clips are
 * embedded in exported GLBs so engines get movement without extra files.
 * @param {THREE.Group} model - Generated model
 * @param {string} type - Asset type key
 * @param {number} size - Model size in game units
 * @returns {THREE.AnimationClip[]}
 */
export function buildAssetAnimations(model, type, size = 1) {
  const bob = 0.07 * size;
  const clips = [];
  const addClip = (name, duration, tracksByNode) => {
    const tracks = [];
    for (const [nodeName, frames] of Object.entries(tracksByNode)) {
      if (!model.getObjectByName(nodeName)) continue;
      if (frames.some((frame) => frame.rot)) {
        tracks.push(quaternionTrack(nodeName, frames));
      }
      if (frames.some((frame) => frame.pos)) {
        tracks.push(positionTrack(nodeName, frames));
      }
    }
    if (tracks.length)
      clips.push(new THREE.AnimationClip(name, duration, tracks));
  };

  if (type === "character" || type === "monster") {
    addClip("idle", 2.4, {
      head: [
        { t: 0, pos: [0, 0, 0] },
        { t: 0.6, pos: [0, bob, 0] },
        { t: 1.2, pos: [0, 0, 0] },
        { t: 1.8, pos: [0, -bob * 0.6, 0] },
        { t: 2.4, pos: [0, 0, 0] },
      ],
      arms: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.6, rot: [0, 0, 0.07] },
        { t: 1.2, rot: [0, 0, 0] },
        { t: 1.8, rot: [0, 0, -0.07] },
        { t: 2.4, rot: [0, 0, 0] },
      ],
      body: [
        { t: 0, pos: [0, 0, 0] },
        { t: 0.6, pos: [0, bob * 0.4, 0] },
        { t: 2.4, pos: [0, 0, 0] },
      ],
      tail: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.6, rot: [0, 0, 0.16] },
        { t: 1.2, rot: [0, 0, 0] },
        { t: 1.8, rot: [0, 0, -0.16] },
        { t: 2.4, rot: [0, 0, 0] },
      ],
    });

    addClip("walk", 0.8, {
      arms: [
        { t: 0, rot: [0, 0, 0.35] },
        { t: 0.4, rot: [0, 0, -0.35] },
        { t: 0.8, rot: [0, 0, 0.35] },
      ],
      legs: [
        { t: 0, rot: [0, 0, -0.35] },
        { t: 0.4, rot: [0, 0, 0.35] },
        { t: 0.8, rot: [0, 0, -0.35] },
      ],
      body: [
        { t: 0, pos: [0, 0, 0] },
        { t: 0.4, pos: [0, bob, 0] },
        { t: 0.8, pos: [0, 0, 0] },
      ],
      head: [
        { t: 0, rot: [0, 0, 0.05] },
        { t: 0.4, rot: [0, 0, -0.05] },
        { t: 0.8, rot: [0, 0, 0.05] },
      ],
      tail: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.4, rot: [0, 0, -0.2] },
        { t: 0.8, rot: [0, 0, 0] },
      ],
    });

    addClip("attack", 1, {
      arms: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.35, rot: [-0.7, 0, 0] },
        { t: 0.65, rot: [0.9, 0, 0] },
        { t: 1, rot: [0, 0, 0] },
      ],
      head: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.35, rot: [0.12, 0, 0] },
        { t: 0.65, rot: [-0.18, 0, 0] },
        { t: 1, rot: [0, 0, 0] },
      ],
      body: [
        { t: 0, pos: [0, 0, 0] },
        { t: 0.35, pos: [0, 0, -0.05 * size] },
        { t: 0.65, pos: [0, 0, 0.08 * size] },
        { t: 1, pos: [0, 0, 0] },
      ],
      tail: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.65, rot: [0, 0, -0.3] },
        { t: 1, rot: [0, 0, 0] },
      ],
    });
  }

  if (type === "dragon") {
    addClip("idle", 2.4, {
      head: [
        { t: 0, pos: [0, 0, 0] },
        { t: 0.6, pos: [0, bob, 0] },
        { t: 2.4, pos: [0, 0, 0] },
      ],
      wings: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.6, rot: [0, 0, 0.08] },
        { t: 1.2, rot: [0, 0, 0] },
        { t: 1.8, rot: [0, 0, -0.08] },
        { t: 2.4, rot: [0, 0, 0] },
      ],
      tail: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.6, rot: [0, 0, 0.18] },
        { t: 1.2, rot: [0, 0, 0] },
        { t: 1.8, rot: [0, 0, -0.18] },
        { t: 2.4, rot: [0, 0, 0] },
      ],
    });

    addClip("fly", 2, {
      wings: [
        { t: 0, rot: [0, 0, 0.55] },
        { t: 1, rot: [0, 0, -0.55] },
        { t: 2, rot: [0, 0, 0.55] },
      ],
      body: [
        { t: 0, pos: [0, 0, 0] },
        { t: 1, pos: [0, 0.05 * size, 0] },
        { t: 2, pos: [0, 0, 0] },
      ],
      tail: [
        { t: 0, rot: [0, 0, 0] },
        { t: 1, rot: [0, 0, -0.2] },
        { t: 2, rot: [0, 0, 0] },
      ],
    });

    addClip("attack", 1.2, {
      head: [
        { t: 0, pos: [0, 0, 0] },
        { t: 0.45, pos: [0, 0, -0.08 * size] },
        { t: 0.8, pos: [0, 0, 0.14 * size] },
        { t: 1.2, pos: [0, 0, 0] },
      ],
      wings: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.45, rot: [0, 0, 0.4] },
        { t: 0.8, rot: [0, 0, -0.25] },
        { t: 1.2, rot: [0, 0, 0] },
      ],
      tail: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.8, rot: [0, 0, -0.3] },
        { t: 1.2, rot: [0, 0, 0] },
      ],
    });
  }

  return clips;
}

/**
 * Pick animation clips for an export. "auto" keeps everything the model has,
 * "none" strips animation, and a named clip keeps only that take.
 * @param {THREE.Object3D|Array} model - Model carrying .animations
 * @param {string} choice - "auto", "none" or a clip name
 * @returns {THREE.AnimationClip[]}
 */
export function selectAnimations(model, choice = "auto") {
  const clips = Array.isArray(model?.animations) ? model.animations : [];
  if (!choice || choice === "auto" || choice === "all") return clips;
  if (choice === "none") return [];
  return clips.filter((clip) => clip.name === choice);
}

// Material presets for different styles
const STYLE_MATERIALS = {
  lowpoly: {
    flatShading: true,
    roughness: 0.8,
    metalness: 0.1,
  },
  realistic: {
    flatShading: false,
    roughness: 0.3,
    metalness: 0.6,
  },
  stylized: {
    flatShading: true,
    roughness: 0.5,
    metalness: 0.2,
  },
};

// Import presets for the game engines AI3D ships against. Unity and Godot
// work Y-up in meters; Unreal is Z-up in centimeters, so the pack scales by
// 100 to keep one generated unit reading as one meter there.
const ENGINE_PRESETS = {
  unity: {
    id: "unity",
    name: "Unity",
    upAxis: "Y",
    scale: 1,
    units: "meters",
  },
  godot: {
    id: "godot",
    name: "Godot",
    upAxis: "Y",
    scale: 1,
    units: "meters",
  },
  unreal: {
    id: "unreal",
    name: "Unreal",
    upAxis: "Z",
    scale: 100,
    units: "centimeters",
  },
};

/**
 * List the engine presets a game pack can target.
 * @returns {Array<{id: string, name: string, upAxis: string, scale: number}>}
 */
export function getEnginePresets() {
  return Object.entries(ENGINE_PRESETS).map(([id, preset]) => ({
    id,
    ...preset,
  }));
}

/**
 * Resolve one engine preset, falling back to the Unity conventions when the
 * id is unknown so a stale selection still exports a usable pack.
 */
export function getEnginePreset(id) {
  return ENGINE_PRESETS[id] || ENGINE_PRESETS.unity;
}

/** Deterministic PRNG so the same seed always produces the same asset. */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a 3D asset based on type and parameters.
 * Returns a THREE.Group containing the generated model.
 * @param {string} type - Asset type
 * @param {object} options - Generation options
 * @param {number} options.size - Asset size
 * @param {number} options.segments - Number of segments
 * @param {string} options.style - Material style
 * @param {string} options.color - Hex color string (e.g. "#ff0000")
 * @param {number} options.seed - Deterministic variation seed
 * @param {object} options.material - Material overrides
 * @param {number} options.material.roughness - Surface roughness 0..1
 * @param {number} options.material.metalness - Metallness 0..1
 * @param {string} options.material.emissive - Hex emissive color or null
 * @param {string} options.texture - Texture preset or "auto"/"none"
 * @param {number} options.textureStrength - Procedural texture strength 0..1
 */
export function generateAsset(
  type,
  {
    size = 1,
    segments = 16,
    style = "lowpoly",
    color = null,
    seed = null,
    material = null,
    texture = "auto",
    textureStrength = 0.8,
  } = {},
) {
  const group = new THREE.Group();
  group.name = `asset-${type}`;

  const matStyle = STYLE_MATERIALS[style] || STYLE_MATERIALS.lowpoly;
  segments = Math.max(4, Math.min(32, segments));
  const customColor = color ? new THREE.Color(color) : null;
  const rng = seed !== null ? mulberry32(seed) : Math.random;

  switch (type) {
    case "sword":
      buildSword(group, size, segments, matStyle, customColor, rng);
      break;
    case "tree":
      buildTree(group, size, segments, matStyle, customColor, rng);
      break;
    case "rock":
      buildRock(group, size, segments, matStyle, customColor, rng);
      break;
    case "house":
      buildHouse(group, size, segments, matStyle, customColor, rng);
      break;
    case "car":
      buildCar(group, size, segments, matStyle, customColor, rng);
      break;
    case "character":
      buildCharacter(group, size, segments, matStyle, customColor, rng);
      break;
    case "shield":
      buildShield(group, size, segments, matStyle, customColor, rng);
      break;
    case "potion":
      buildPotion(group, size, segments, matStyle, customColor, rng);
      break;
    case "chest":
      buildChest(group, size, segments, matStyle, customColor, rng);
      break;
    case "key":
      buildKey(group, size, segments, matStyle, customColor, rng);
      break;
    case "gem":
      buildGem(group, size, segments, matStyle, customColor, rng);
      break;
    case "barrel":
      buildBarrel(group, size, segments, matStyle, customColor, rng);
      break;
    case "crate":
      buildCrate(group, size, segments, matStyle, customColor, rng);
      break;
    case "tower":
      buildTower(group, size, segments, matStyle, customColor, rng);
      break;
    case "flag":
      buildFlag(group, size, segments, matStyle, customColor, rng);
      break;
    case "torch":
      buildTorch(group, size, segments, matStyle, customColor, rng);
      break;
    case "fence":
      buildFence(group, size, segments, matStyle, customColor, rng);
      break;
    case "bridge":
      buildBridge(group, size, segments, matStyle, customColor, rng);
      break;
    case "fountain":
      buildFountain(group, size, segments, matStyle, customColor, rng);
      break;
    case "brazier":
      buildBrazier(group, size, segments, matStyle, customColor, rng);
      break;
    case "runestone":
      buildRunestone(group, size, segments, matStyle, customColor, rng);
      break;
    case "trap":
      buildTrap(group, size, segments, matStyle, customColor, rng);
      break;
    case "turret":
      buildTurret(group, size, segments, matStyle, customColor, rng);
      break;
    case "drone":
      buildDrone(group, size, segments, matStyle, customColor, rng);
      break;
    case "antenna":
      buildAntenna(group, size, segments, matStyle, customColor, rng);
      break;
    case "axe":
      buildAxe(group, size, segments, matStyle, customColor, rng);
      break;
    case "bow":
      buildBow(group, size, segments, matStyle, customColor, rng);
      break;
    case "hammer":
      buildHammer(group, size, segments, matStyle, customColor, rng);
      break;
    case "spear":
      buildSpear(group, size, segments, matStyle, customColor, rng);
      break;
    case "tent":
      buildTent(group, size, segments, matStyle, customColor, rng);
      break;
    case "statue":
      buildStatue(group, size, segments, matStyle, customColor, rng);
      break;
    case "pillar":
      buildPillar(group, size, segments, matStyle, customColor, rng);
      break;
    case "well":
      buildWell(group, size, segments, matStyle, customColor, rng);
      break;
    case "monster":
      buildMonster(group, size, segments, matStyle, customColor, rng);
      break;
    case "dragon":
      buildDragon(group, size, segments, matStyle, customColor, rng);
      break;
    case "boat":
      buildBoat(group, size, segments, matStyle, customColor, rng);
      break;
    case "plane":
      buildPlane(group, size, segments, matStyle, customColor, rng);
      break;
    case "bike":
      buildBike(group, size, segments, matStyle, customColor, rng);
      break;
    case "campfire":
      buildCampfire(group, size, segments, matStyle, customColor, rng);
      break;
    case "sign":
      buildSign(group, size, segments, matStyle, customColor, rng);
      break;
    case "crystal":
      buildCrystal(group, size, segments, matStyle, customColor, rng);
      break;
    case "mushroom":
      buildMushroom(group, size, segments, matStyle, customColor, rng);
      break;
    case "tree_stump":
      buildTreeStump(group, size, segments, matStyle, customColor, rng);
      break;
    case "barrel_variants":
      buildBarrelVariants(group, size, segments, matStyle, customColor, rng);
      break;
    default:
      buildCube(group, size, segments, matStyle, customColor, rng);
  }

  applyMaterialOverrides(group, material);
  applyProceduralTextureSet(group, type, {
    texture,
    strength: textureStrength,
    seed,
  });

  // Scale first, then center in scaled space. Centering before scaling would
  // leave the box offset whenever the requested size is not exactly the model
  // span, which matters when a game engine drops the asset into a scene.
  const box = new THREE.Box3().setFromObject(group);
  const maxDim = Math.max(
    box.max.x - box.min.x,
    box.max.y - box.min.y,
    box.max.z - box.min.z,
  );
  if (maxDim > 0) {
    const scale = size / maxDim;
    group.scale.setScalar(scale);
  }
  const scaledBox = new THREE.Box3().setFromObject(group);
  const center = scaledBox.getCenter(new THREE.Vector3());
  group.position.sub(center);
  group.animations = buildAssetAnimations(group, type, size);

  return group;
}

/**
 * Generate a deterministic batch of seed variants for one asset type.
 * Game teams can quickly produce several takes on a prop and compare them
 * before deciding which one to keep.
 * @param {string} type - Asset type
 * @param {object} options - Generation options shared by every variant
 * @param {number} options.count - Number of variants (clamped to 1..12)
 * @param {number} options.baseSeed - First seed in the batch
 * @param {string} options.texture - Texture preset or "auto"/"none"
 * @param {number} options.textureStrength - Procedural texture strength 0..1
 * @returns {Array<{seed: number, index: number, model: THREE.Group, stats: object}>}
 */
export function generateVariantSet(
  type,
  {
    size = 1,
    segments = 16,
    style = "lowpoly",
    color = null,
    material = null,
    texture = "auto",
    textureStrength = 0.8,
    count = 4,
    baseSeed = 0,
  } = {},
) {
  const total = Math.max(1, Math.min(12, Math.floor(count || 1)));
  const start = Math.max(0, Math.floor(baseSeed || 0));
  const variants = [];
  for (let index = 0; index < total; index++) {
    const seed = start + index;
    const model = generateAsset(type, {
      size,
      segments,
      style,
      color,
      seed,
      material,
      texture,
      textureStrength,
    });
    variants.push({ seed, index, model, stats: getAssetStats(model) });
  }
  return variants;
}

/**
 * Apply user-facing material overrides to every mesh in an object.
 * Runs after the generator builds its materials so style presets stay intact
 * where the user did not choose a replacement.
 */
function applyMaterialOverrides(object, overrides = null) {
  if (!overrides) return;
  object.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const mat of mats) {
      if (!mat?.isMaterial) continue;
      if (overrides.roughness != null)
        mat.roughness = THREE.MathUtils.clamp(
          Number(overrides.roughness) || 0,
          0,
          1,
        );
      if (overrides.metalness != null)
        mat.metalness = THREE.MathUtils.clamp(
          Number(overrides.metalness) || 0,
          0,
          1,
        );
      // A chosen emissive replaces the glow on every material; leaving the
      // picker at black keeps the generator's built-in emissive parts (fire,
      // runes, lights) instead of erasing them.
      if (overrides.emissive) {
        mat.emissive = new THREE.Color(overrides.emissive);
        mat.emissiveIntensity = overrides.emissiveIntensity ?? 0.8;
      }
    }
  });
}

function createMaterial(color, style) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: style.flatShading,
    roughness: style.roughness,
    metalness: style.metalness,
  });
}

/**
 * Apply one procedural PBR texture set to every mesh in an object. Albedo is
 * grayscale so the per-part material color tints it; normal, roughness and
 * metalness maps then modulate the engine material.
 */
function applyProceduralTextureSet(
  object,
  type,
  { texture = "auto", strength = 0.8, seed = null } = {},
) {
  const kind = resolveTextureKind(type, texture);
  if (!kind) return;
  const textureSeed = seed == null ? 1 : Math.max(1, Math.floor(seed) + 1);
  const set = createProceduralTextures(kind, {
    size: 128,
    strength: Math.max(0, Math.min(1, Number(strength) || 0)),
    seed: textureSeed,
  });
  object.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const mat of mats) {
      if (!mat?.isMaterial) continue;
      mat.map = set.textures.albedo;
      mat.normalMap = set.textures.normal;
      mat.roughnessMap = set.textures.roughness;
      mat.metalnessMap = set.textures.metalness;
      mat.normalScale.set(1, 1);
      mat.needsUpdate = true;
    }
  });
}

/**
 * Rebuild the PNG texture files for an asset record. Engine packs keep both
 * the GLB-embedded maps and standalone PNGs so teams can rewire shaders.
 * @returns {object|null} { texture, textures } or null when disabled
 */
export function getAssetTextureInfo(asset = {}, seed = null) {
  const kind = resolveTextureKind(asset.type, asset.texture ?? "auto");
  if (!kind) return null;
  const strength = Math.max(
    0,
    Math.min(1, Number(asset.textureStrength ?? 0.8) || 0),
  );
  const textureSeed = seed == null ? 1 : Math.max(1, Math.floor(seed) + 1);
  const set = createProceduralTextures(kind, {
    size: 128,
    strength,
    seed: textureSeed,
    png: true,
  });
  return {
    texture: {
      kind,
      strength,
      size: set.size,
    },
    textures: set.pngs,
  };
}

// Preset game-scene kits. Props are placed on a fixed grid and given small
// seeded jitter so the same kit and seed always produce the same scene.
const GAME_KITS = {
  dungeon: {
    name: "Dungeon",
    groundColor: 0x6b625a,
    props: [
      { type: "brazier", size: 1.1 },
      { type: "runestone", size: 1.05 },
      { type: "crate", size: 0.9 },
      { type: "torch", size: 1 },
      { type: "trap", size: 1.1 },
      { type: "barrel", size: 0.85 },
      { type: "fence", size: 1.2 },
      { type: "chest", size: 0.95 },
      { type: "tower", size: 0.9 },
    ],
  },
  camp: {
    name: "Camp",
    groundColor: 0x7d8a6a,
    props: [
      { type: "house", size: 1.15 },
      { type: "torch", size: 1 },
      { type: "brazier", size: 1.05 },
      { type: "tree", size: 1.1 },
      { type: "rock", size: 0.85 },
      { type: "fence", size: 1.2 },
      { type: "crate", size: 0.85 },
      { type: "barrel", size: 0.8 },
      { type: "flag", size: 0.95 },
    ],
  },
  outpost: {
    name: "Outpost",
    groundColor: 0x54606e,
    props: [
      { type: "turret", size: 1.2 },
      { type: "antenna", size: 1.1 },
      { type: "drone", size: 1 },
      { type: "crate", size: 0.9 },
      { type: "barrel", size: 0.85 },
      { type: "fountain", size: 1 },
      { type: "bridge", size: 1.2 },
      { type: "car", size: 1.05 },
      { type: "flag", size: 0.9 },
    ],
  },
  village: {
    name: "Village",
    groundColor: 0x9a8f6f,
    props: [
      { type: "house", size: 1.1 },
      { type: "tent", size: 1 },
      { type: "tree", size: 1.15 },
      { type: "fence", size: 1.2 },
      { type: "crate", size: 0.85 },
      { type: "barrel", size: 0.8 },
      { type: "flag", size: 0.9 },
      { type: "torch", size: 1 },
      { type: "bridge", size: 1.2 },
    ],
  },
  temple: {
    name: "Temple",
    groundColor: 0x8d8577,
    props: [
      { type: "pillar", size: 1.05 },
      { type: "statue", size: 1 },
      { type: "fountain", size: 1 },
      { type: "runestone", size: 1.05 },
      { type: "brazier", size: 1.1 },
      { type: "torch", size: 0.95 },
      { type: "chest", size: 0.9 },
      { type: "trap", size: 1.1 },
      { type: "tower", size: 0.9 },
    ],
  },
  battle: {
    name: "Battlefield",
    groundColor: 0x6e5647,
    props: [
      { type: "monster", size: 1.1 },
      { type: "dragon", size: 1 },
      { type: "shield", size: 0.95 },
      { type: "spear", size: 1 },
      { type: "sword", size: 0.9 },
      { type: "axe", size: 0.95 },
      { type: "brazier", size: 1.1 },
      { type: "flag", size: 1.05 },
      { type: "trap", size: 1.1 },
    ],
  },
  wilderness: {
    name: "Wilderness",
    groundColor: 0x5d7d58,
    props: [
      { type: "campfire", size: 1.1 },
      { type: "mushroom", size: 0.9 },
      { type: "tree", size: 1.2 },
      { type: "rock", size: 0.9 },
      { type: "crystal", size: 0.95 },
      { type: "tree_stump", size: 1.05 },
      { type: "tent", size: 1.1 },
      { type: "sign", size: 0.9 },
      { type: "well", size: 1.05 },
    ],
  },
  town: {
    name: "Town",
    groundColor: 0x8b8372,
    props: [
      { type: "house", size: 1.1 },
      { type: "tower", size: 0.95 },
      { type: "fountain", size: 1.05 },
      { type: "statue", size: 0.95 },
      { type: "sign", size: 0.85 },
      { type: "crate", size: 0.85 },
      { type: "barrel", size: 0.8 },
      { type: "torch", size: 1 },
      { type: "bridge", size: 1.2 },
    ],
  },
};

const KIT_STYLE = { flatShading: true, roughness: 0.75, metalness: 0.15 };

/**
 * Compose a preset game scene from generated props. The returned group is
 * centered, stands on a themed ground, and names every prop instance so game
 * engines can pick them up by name.
 * @param {string} kit - Kit id from GAME_KITS
 * @param {object} options - Composition options
 * @param {number} options.seed - Deterministic arrangement seed
 * @param {number} options.segments - Mesh segment budget shared by props
 * @param {number} options.quality - 1 places 3x3 props, 2 adds a wider ground
 * @param {string} options.style - Material style passed to every prop
 * @param {string} options.color - Hex colour passed to every prop
 * @param {object} options.material - Material overrides passed to every prop
 * @param {string} options.texture - Procedural texture preset or "auto"/"none"
 * @param {number} options.textureStrength - Procedural texture strength 0..1
 * @param {number} options.spacing - Grid spacing multiplier
 * @param {number} options.groundPadding - Ground margin on each side
 * @param {number} options.propScale - Global prop scale multiplier
 * @param {Array<object>} options.props - Saved prop placements. When supplied,
 *   these replace the kit defaults so deleted or edited props survive a reload.
 */
export function composeGameKit(
  kit,
  {
    seed = 1,
    segments = 12,
    quality = 1,
    style = "lowpoly",
    color = null,
    material = null,
    texture = "auto",
    textureStrength = 0.8,
    spacing = 1,
    groundPadding = 0.6,
    propScale = 1,
    props = null,
  } = {},
) {
  const def = GAME_KITS[kit];
  if (!def) throw new Error(`Unknown game kit: ${kit}`);
  const clamp = (value, fallback, min, max) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
  };
  const spacingScale = clamp(spacing, 1, 0.5, 2);
  const groundMargin = clamp(groundPadding, 0.6, 0, 3);
  const propScaleValue = clamp(propScale, 1, 0.25, 3);
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = `kit-${kit}`;
  group.userData.kit = kit;
  group.userData.groundColor = def.groundColor;
  group.userData.theme = {
    style,
    color,
    material,
    texture,
    textureStrength,
    segments,
    quality,
    spacing: spacingScale,
    groundPadding: groundMargin,
    propScale: propScaleValue,
  };

  const grid = 3;
  const cell = 2.4 * spacingScale;
  const slot = cell / grid;
  const positions = [];
  const groundW = cell + groundMargin * 2;
  const groundD = cell + groundMargin * 2;
  const groundStyle = STYLE_MATERIALS[style] || KIT_STYLE;
  const ground = new THREE.Group();
  ground.name = "ground";

  // Ground pavers with a deterministic per-tile tint so the floor reads as
  // built terrain instead of a flat colour.
  const tiles = Math.max(2, 2 * quality);
  for (let i = 0; i < tiles; i++) {
    for (let j = 0; j < tiles; j++) {
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(groundW / tiles, 0.06, groundD / tiles),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(def.groundColor).offsetHSL(
            0,
            0,
            (rng() - 0.5) * 0.06,
          ),
          ...groundStyle,
        }),
      );
      tile.name = "ground-tile";
      tile.position.set(
        -groundW / 2 + groundW / tiles / 2 + i * (groundW / tiles),
        0.03,
        -groundD / 2 + groundD / tiles / 2 + j * (groundD / tiles),
      );
      ground.add(tile);
    }
  }
  applyMaterialOverrides(ground, material);
  applyProceduralTextureSet(ground, kit, {
    texture,
    strength: textureStrength,
    seed,
  });
  group.add(ground);

  const propList = [];
  const usingSavedProps = Array.isArray(props);
  const sourceProps = usingSavedProps ? props : def.props;
  sourceProps.forEach((placement, index) => {
    const defaultProp = def.props[index] || {};
    const requestedType =
      placement && ASSET_TYPES[placement.type] ? placement.type : null;
    const type = requestedType || defaultProp.type || "cube";
    const requestedSize = usingSavedProps ? Number(placement?.size) : null;
    const sizeValue = Number.isFinite(requestedSize)
      ? requestedSize
      : (defaultProp.size ?? 1) * propScaleValue;
    const size =
      Math.round(Math.min(100, Math.max(0.01, sizeValue)) * 1000) / 1000;
    const row = Math.floor(index / grid);
    const col = index % grid;
    const baseX = (col - (grid - 1) / 2) * slot;
    const baseZ = (row - (grid - 1) / 2) * slot;
    const jitter = 0.16 * cell;
    const randomX = baseX + (rng() - 0.5) * jitter;
    const randomZ = baseZ + (rng() - 0.5) * jitter;
    const randomPropSeed = Math.floor(rng() * 100000);
    const requestedX = Number(placement?.x);
    const requestedZ = Number(placement?.z);
    const requestedSeed = Number(placement?.seed);
    const requestedRotation = Number(placement?.rotationY);
    const requestedY = Number(placement?.y);
    const x = Number.isFinite(requestedX) ? requestedX : randomX;
    const z = Number.isFinite(requestedZ) ? requestedZ : randomZ;
    const propSeed = Number.isFinite(requestedSeed)
      ? Math.floor(requestedSeed)
      : randomPropSeed;
    const model = generateAsset(type, {
      size,
      segments,
      style,
      color,
      seed: propSeed,
      material,
      texture,
      textureStrength,
    });
    model.name = `${kit}-${type}-${index + 1}`;
    model.traverse((child) => {
      if (child.isMesh) child.name = `${model.name}-${child.name}`;
    });
    // Generated assets are centered on their origin, so lift each prop until
    // its lowest vertex rests on the ground instead of sinking into it.
    const restingBox = new THREE.Box3().setFromObject(model);
    const groundLift = 0.06 - restingBox.min.y;
    const randomRotation = Math.floor(rng() * 8) * (Math.PI / 4);
    const rotationY = Number.isFinite(requestedRotation)
      ? requestedRotation
      : randomRotation;
    model.position.set(
      x,
      Number.isFinite(requestedY) ? requestedY : model.position.y + groundLift,
      z,
    );
    model.rotation.y = rotationY;
    const placedBox = new THREE.Box3().setFromObject(model);
    propList.push({
      name: model.name,
      type,
      size,
      seed: propSeed,
      x: Math.round(x * 1000) / 1000,
      y: Math.round(model.position.y * 1000) / 1000,
      z: Math.round(z * 1000) / 1000,
      rotationY: Math.round(rotationY * 10000) / 10000,
      bounds: {
        width: Math.round((placedBox.max.x - placedBox.min.x) * 1000) / 1000,
        height: Math.round((placedBox.max.y - placedBox.min.y) * 1000) / 1000,
        depth: Math.round((placedBox.max.z - placedBox.min.z) * 1000) / 1000,
      },
      collision: getColliderShape(type),
    });
    group.add(model);
    positions.push({ index, x, z });
  });

  // Center the whole kit after the ground and props settle.
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);
  group.userData.props = positions.length;
  group.userData.propList = propList;
  group.userData.extent = {
    width: box.max.x - box.min.x,
    depth: box.max.z - box.min.z,
    height: box.max.y - box.min.y,
  };
  return group;
}

/**
 * Edit one prop inside a composed scene and keep its export metadata in sync.
 * Coordinates use the same layout space as composeGameKit, so saving the
 * scene and rebuilding it from userData.propList preserves the adjustment.
 * @param {THREE.Group} scene - Scene returned by composeGameKit
 * @param {number} propIndex - Index in scene.userData.propList
 * @param {object} changes - x, z, rotationY, size and/or type overrides
 * @returns {object} The updated prop metadata
 */
export function editSceneProp(scene, propIndex, changes = {}) {
  const index = Math.floor(Number(propIndex));
  const propList = scene?.userData?.propList;
  if (!Array.isArray(propList) || index < 0 || index >= propList.length) {
    throw new Error(`Unknown scene prop: ${propIndex}`);
  }
  const current = propList[index];
  const currentModel = scene.children.find(
    (child) => child.name === current.name,
  );
  if (!currentModel)
    throw new Error(`Missing scene prop model: ${current.name}`);

  const requestedType =
    changes.type && ASSET_TYPES[changes.type] ? changes.type : current.type;
  const requestedSize = Number(changes.size);
  const size = Number.isFinite(requestedSize)
    ? Math.round(Math.min(100, Math.max(0.01, requestedSize)) * 1000) / 1000
    : current.size;
  const x = Number.isFinite(Number(changes.x))
    ? Number(changes.x)
    : currentModel.position.x;
  const z = Number.isFinite(Number(changes.z))
    ? Number(changes.z)
    : currentModel.position.z;
  const rotationY = Number.isFinite(Number(changes.rotationY))
    ? Number(changes.rotationY)
    : currentModel.rotation.y;
  const requestedY = Number(changes.y);
  const y = Number.isFinite(requestedY) ? requestedY : null;
  const theme = scene.userData.theme || {};
  const replaceModel =
    requestedType !== current.type || Math.abs(size - current.size) > 0.0001;

  let model = currentModel;
  if (replaceModel) {
    model = generateAsset(requestedType, {
      size,
      segments: theme.segments ?? 12,
      style: theme.style ?? "lowpoly",
      color: theme.color || null,
      seed: current.seed ?? null,
      material: theme.material || null,
      texture: theme.texture ?? "auto",
      textureStrength: theme.textureStrength ?? 0.8,
    });
    model.name = `${scene.userData.kit || "kit"}-${requestedType}-${index + 1}`;
    model.traverse((child) => {
      if (child.isMesh) child.name = `${model.name}-${child.name}`;
    });
    currentModel.removeFromParent();
    scene.add(model);
  }

  model.position.set(x, y ?? 0, z);
  const restingBox = new THREE.Box3().setFromObject(model);
  if (y === null) model.position.y = 0.06 - restingBox.min.y;
  model.rotation.y = rotationY;

  const placedBox = new THREE.Box3().setFromObject(model);
  const next = {
    name: model.name,
    type: requestedType,
    size,
    seed: current.seed,
    x: Math.round(x * 1000) / 1000,
    y: Math.round(model.position.y * 1000) / 1000,
    z: Math.round(z * 1000) / 1000,
    rotationY: Math.round(rotationY * 10000) / 10000,
    bounds: {
      width: Math.round((placedBox.max.x - placedBox.min.x) * 1000) / 1000,
      height: Math.round((placedBox.max.y - placedBox.min.y) * 1000) / 1000,
      depth: Math.round((placedBox.max.z - placedBox.min.z) * 1000) / 1000,
    },
    collision: getColliderShape(requestedType),
  };
  propList[index] = next;
  scene.userData.props = propList.length;
  const bounds = new THREE.Box3().setFromObject(scene);
  scene.userData.extent = {
    width: bounds.max.x - bounds.min.x,
    depth: bounds.max.z - bounds.min.z,
    height: bounds.max.y - bounds.min.y,
  };
  return next;
}

/**
 * Remove one prop from a composed scene while keeping the remaining metadata
 * serializable as a saved scene recipe.
 * @param {THREE.Group} scene - Scene returned by composeGameKit
 * @param {number} propIndex - Index in scene.userData.propList
 * @returns {object|null} The removed prop metadata, or null when absent
 */
export function removeSceneProp(scene, propIndex) {
  const index = Math.floor(Number(propIndex));
  const propList = scene?.userData?.propList;
  if (!Array.isArray(propList) || index < 0 || index >= propList.length) {
    return null;
  }
  const removed = propList[index];
  const model = scene.children.find((child) => child.name === removed.name);
  model?.removeFromParent();
  propList.splice(index, 1);
  propList.forEach((prop, propIndexValue) => {
    const suffix = `-${propIndexValue + 1}`;
    const oldName = prop.name;
    if (!oldName) return;
    const baseName = oldName.slice(0, oldName.lastIndexOf("-"));
    prop.name = `${baseName}${suffix}`;
    const propModel = scene.children.find((child) => child.name === oldName);
    if (!propModel) return;
    propModel.name = prop.name;
    propModel.traverse((child) => {
      if (child === propModel || !child.name.startsWith(`${oldName}-`)) return;
      child.name = `${prop.name}${child.name.slice(oldName.length)}`;
    });
  });
  scene.userData.props = propList.length;
  const bounds = new THREE.Box3().setFromObject(scene);
  scene.userData.extent = {
    width: bounds.max.x - bounds.min.x,
    depth: bounds.max.z - bounds.min.z,
    height: bounds.max.y - bounds.min.y,
  };
  return removed;
}

/**
 * Append a new prop to a composed scene. The placement lives in the same
 * layout space as composeGameKit, so a saved scene rebuilds with the added prop
 * exactly where the editor left it.
 * @param {THREE.Group} scene - Scene returned by composeGameKit
 * @param {object} placement - type, size, x, y, z, rotationY and seed overrides
 * @returns {object} The new prop metadata
 */
export function addSceneProp(scene, placement = {}) {
  const propList = scene?.userData?.propList;
  if (!Array.isArray(propList)) {
    throw new Error("Scene has no prop list to extend");
  }
  const theme = scene.userData.theme || {};
  const index = propList.length;
  const type =
    placement.type && ASSET_TYPES[placement.type] ? placement.type : "cube";
  const requestedSize = Number(placement.size);
  const fallbackSize = theme.propScale ?? 1;
  const size =
    Math.round(
      Math.min(
        100,
        Math.max(
          0.01,
          Number.isFinite(requestedSize) ? requestedSize : fallbackSize,
        ),
      ) * 1000,
    ) / 1000;
  const requestedSeed = Number(placement.seed);
  const seed = Number.isFinite(requestedSeed)
    ? Math.floor(requestedSeed)
    : Math.floor(Math.random() * 100000);
  const x = Number.isFinite(Number(placement.x)) ? Number(placement.x) : 0;
  const z = Number.isFinite(Number(placement.z)) ? Number(placement.z) : 0;
  const rotationY = Number.isFinite(Number(placement.rotationY))
    ? Number(placement.rotationY)
    : 0;

  const model = generateAsset(type, {
    size,
    segments: theme.segments ?? 12,
    style: theme.style ?? "lowpoly",
    color: theme.color || null,
    seed,
    material: theme.material || null,
    texture: theme.texture ?? "auto",
    textureStrength: theme.textureStrength ?? 0.8,
  });
  const kit = scene.userData.kit || "kit";
  model.name = `${kit}-${type}-${index + 1}`;
  model.traverse((child) => {
    if (child.isMesh) child.name = `${model.name}-${child.name}`;
  });
  model.position.set(x, 0, z);
  // Generated assets are centered on their origin, so an unset height rests the
  // prop on the ground instead of sinking half of it below the pavers.
  const restingBox = new THREE.Box3().setFromObject(model);
  const requestedY = Number(placement.y);
  model.position.y = Number.isFinite(requestedY)
    ? requestedY
    : 0.06 - restingBox.min.y;
  model.rotation.y = rotationY;
  scene.add(model);

  const placedBox = new THREE.Box3().setFromObject(model);
  const next = {
    name: model.name,
    type,
    size,
    seed,
    x: Math.round(x * 1000) / 1000,
    y: Math.round(model.position.y * 1000) / 1000,
    z: Math.round(z * 1000) / 1000,
    rotationY: Math.round(rotationY * 10000) / 10000,
    bounds: {
      width: Math.round((placedBox.max.x - placedBox.min.x) * 1000) / 1000,
      height: Math.round((placedBox.max.y - placedBox.min.y) * 1000) / 1000,
      depth: Math.round((placedBox.max.z - placedBox.min.z) * 1000) / 1000,
    },
    collision: getColliderShape(type),
  };
  propList.push(next);
  scene.userData.props = propList.length;
  const bounds = new THREE.Box3().setFromObject(scene);
  scene.userData.extent = {
    width: bounds.max.x - bounds.min.x,
    depth: bounds.max.z - bounds.min.z,
    height: bounds.max.y - bounds.min.y,
  };
  return next;
}

export function getGameKits() {
  return Object.entries(GAME_KITS).map(([id, def]) => ({
    id,
    name: def.name,
  }));
}

function buildSword(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const bladeMat = createMaterial(customColor || 0xc0c0c0, style);
  const guardMat = createMaterial(0x8b4513, style);
  const handleMat = createMaterial(0x4a3728, style);
  const pommelMat = createMaterial(0xffd700, style);

  // Blade
  const bladeGeo = new THREE.BoxGeometry(0.15 * size, 2.5 * size, 0.05 * size);
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.position.y = 1.5 * size;
  blade.name = "blade";
  group.add(blade);

  // Tip
  const tipGeo = new THREE.ConeGeometry(0.075 * size, 0.3 * size, 4);
  const tip = new THREE.Mesh(tipGeo, bladeMat);
  tip.position.y = 2.9 * size;
  tip.name = "tip";
  group.add(tip);

  // Guard
  const guardGeo = new THREE.BoxGeometry(0.6 * size, 0.1 * size, 0.15 * size);
  const guard = new THREE.Mesh(guardGeo, guardMat);
  guard.position.y = 0.2 * size;
  guard.name = "guard";
  group.add(guard);

  // Handle
  const handleGeo = new THREE.CylinderGeometry(
    0.06 * size,
    0.06 * size,
    0.6 * size,
    segments,
  );
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.y = -0.15 * size;
  handle.name = "handle";
  group.add(handle);

  // Pommel
  const pommelGeo = new THREE.SphereGeometry(0.1 * size, segments, segments);
  const pommel = new THREE.Mesh(pommelGeo, pommelMat);
  pommel.position.y = -0.5 * size;
  pommel.name = "pommel";
  group.add(pommel);
}

function buildTree(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const trunkMat = createMaterial(0x8b4513, style);
  const foliageMat = createMaterial(customColor || 0x228b22, style);

  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(
    0.15 * size,
    0.25 * size,
    2 * size,
    segments,
  );
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 1 * size;
  trunk.name = "trunk";
  group.add(trunk);

  // Foliage layers
  const foliageGroup = new THREE.Group();
  foliageGroup.name = "foliage";
  const layers = 3;
  for (let i = 0; i < layers; i++) {
    const radius = (1.2 - i * 0.3) * size;
    const height = 0.8 * size;
    const foliageGeo = new THREE.ConeGeometry(radius, height, segments);
    const foliage = new THREE.Mesh(foliageGeo, foliageMat);
    foliage.position.y = (2 + i * 0.6) * size;
    foliage.name = `foliage-${i}`;
    foliageGroup.add(foliage);
  }
  group.add(foliageGroup);
}

function buildRock(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const rockMat = createMaterial(customColor || 0x808080, style);

  // Main body with noise displacement
  const rockGeo = new THREE.IcosahedronGeometry(size, 1);
  const positions = rockGeo.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const noise = 0.8 + rng() * 0.4;
    positions.setXYZ(i, x * noise, y * noise * 0.7, z * noise);
  }
  rockGeo.computeVertexNormals();
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.name = "body";
  group.add(rock);
}

function buildHouse(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const wallMat = createMaterial(customColor || 0xf5f5dc, style);
  const roofMat = createMaterial(0xb22222, style);
  const doorMat = createMaterial(0x8b4513, style);
  const windowMat = createMaterial(0x87ceeb, style);

  // Walls
  const wallsGeo = new THREE.BoxGeometry(2 * size, 1.5 * size, 1.5 * size);
  const walls = new THREE.Mesh(wallsGeo, wallMat);
  walls.position.y = 0.75 * size;
  walls.name = "walls";
  group.add(walls);

  // Roof
  const roofGeo = new THREE.ConeGeometry(1.5 * size, 1 * size, 4);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 2 * size;
  roof.rotation.y = Math.PI / 4;
  roof.name = "roof";
  group.add(roof);

  // Door
  const doorGeo = new THREE.BoxGeometry(0.4 * size, 0.8 * size, 0.1 * size);
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 0.4 * size, 0.76 * size);
  door.name = "door";
  group.add(door);

  // Windows
  const windowGeo = new THREE.BoxGeometry(0.3 * size, 0.3 * size, 0.1 * size);
  const windowGroup = new THREE.Group();
  windowGroup.name = "windows";
  const windowLeft = new THREE.Mesh(windowGeo, windowMat);
  windowLeft.position.set(-0.6 * size, 0.9 * size, 0.76 * size);
  windowLeft.name = "window-left";
  windowGroup.add(windowLeft);

  const windowRight = new THREE.Mesh(windowGeo, windowMat);
  windowRight.position.set(0.6 * size, 0.9 * size, 0.76 * size);
  windowRight.name = "window-right";
  windowGroup.add(windowRight);
  group.add(windowGroup);
}

function buildCar(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const bodyMat = createMaterial(customColor || 0xff0000, style);
  const wheelMat = createMaterial(0x333333, style);
  const windowMat = createMaterial(0x87ceeb, style);

  // Body
  const bodyGeo = new THREE.BoxGeometry(2 * size, 0.5 * size, 1 * size);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.5 * size;
  body.name = "body";
  group.add(body);

  // Cabin
  const cabinGeo = new THREE.BoxGeometry(1 * size, 0.4 * size, 0.9 * size);
  const cabin = new THREE.Mesh(cabinGeo, bodyMat);
  cabin.position.set(-0.2 * size, 0.95 * size, 0);
  cabin.name = "cabin";
  group.add(cabin);

  // Windows
  const windowGeo = new THREE.BoxGeometry(0.8 * size, 0.3 * size, 0.95 * size);
  const windows = new THREE.Mesh(windowGeo, windowMat);
  windows.position.set(-0.2 * size, 0.95 * size, 0);
  windows.name = "windows";
  group.add(windows);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(
    0.25 * size,
    0.25 * size,
    0.2 * size,
    segments,
  );
  const wheelGroup = new THREE.Group();
  wheelGroup.name = "wheels";
  const wheelPositions = [
    [-0.7 * size, 0.25 * size, 0.55 * size],
    [0.7 * size, 0.25 * size, 0.55 * size],
    [-0.7 * size, 0.25 * size, -0.55 * size],
    [0.7 * size, 0.25 * size, -0.55 * size],
  ];
  wheelPositions.forEach((pos, i) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(...pos);
    wheel.rotation.x = Math.PI / 2;
    wheel.name = `wheel-${i}`;
    wheelGroup.add(wheel);
  });
  group.add(wheelGroup);
}

function buildCharacter(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const skinMat = createMaterial(0xffdbac, style);
  const shirtMat = createMaterial(customColor || 0x4169e1, style);
  const pantsMat = createMaterial(0x2f4f4f, style);

  // Head
  const headGeo = new THREE.SphereGeometry(0.3 * size, segments, segments);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.7 * size;
  head.name = "head";
  group.add(head);

  // Body
  const bodyGeo = new THREE.CylinderGeometry(
    0.25 * size,
    0.3 * size,
    0.8 * size,
    segments,
  );
  const body = new THREE.Mesh(bodyGeo, shirtMat);
  body.position.y = 1.1 * size;
  body.name = "body";
  group.add(body);

  // Arms
  const armGeo = new THREE.CylinderGeometry(
    0.08 * size,
    0.08 * size,
    0.6 * size,
    segments,
  );
  const armGroup = new THREE.Group();
  armGroup.name = "arms";
  const leftArm = new THREE.Mesh(armGeo, skinMat);
  leftArm.position.set(-0.4 * size, 1.1 * size, 0);
  leftArm.rotation.z = Math.PI / 6;
  leftArm.name = "left-arm";
  armGroup.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, skinMat);
  rightArm.position.set(0.4 * size, 1.1 * size, 0);
  rightArm.rotation.z = -Math.PI / 6;
  rightArm.name = "right-arm";
  armGroup.add(rightArm);
  group.add(armGroup);

  // Legs
  const legGeo = new THREE.CylinderGeometry(
    0.1 * size,
    0.1 * size,
    0.6 * size,
    segments,
  );
  const legGroup = new THREE.Group();
  legGroup.name = "legs";
  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.set(-0.15 * size, 0.4 * size, 0);
  leftLeg.name = "left-leg";
  legGroup.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.set(0.15 * size, 0.4 * size, 0);
  rightLeg.name = "right-leg";
  legGroup.add(rightLeg);
  group.add(legGroup);
}

function buildMonster(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const bodyMat = createMaterial(customColor || 0x8b4513, style);
  const accentMat = createMaterial(0x654321, style);

  // Body
  const bodyGeo = new THREE.SphereGeometry(0.5 * size, segments, segments);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.8 * size;
  body.scale.set(1, 1.2, 0.8);
  body.name = "body";
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.35 * size, segments, segments);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, 1.5 * size, 0.3 * size);
  head.name = "head";
  group.add(head);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.08 * size, 8, 8);
  const eyeMat = createMaterial(0xff0000, style);
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.15 * size, 1.6 * size, 0.55 * size);
  leftEye.name = "left-eye";
  group.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.15 * size, 1.6 * size, 0.55 * size);
  rightEye.name = "right-eye";
  group.add(rightEye);

  // Arms
  const armGeo = new THREE.CylinderGeometry(
    0.1 * size,
    0.1 * size,
    0.7 * size,
    segments,
  );
  const armGroup = new THREE.Group();
  armGroup.name = "arms";
  const leftArm = new THREE.Mesh(armGeo, accentMat);
  leftArm.position.set(-0.6 * size, 0.9 * size, 0);
  leftArm.rotation.z = Math.PI / 4;
  leftArm.name = "left-arm";
  armGroup.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, accentMat);
  rightArm.position.set(0.6 * size, 0.9 * size, 0);
  rightArm.rotation.z = -Math.PI / 4;
  rightArm.name = "right-arm";
  armGroup.add(rightArm);
  group.add(armGroup);

  // Legs
  const legGeo = new THREE.CylinderGeometry(
    0.12 * size,
    0.12 * size,
    0.5 * size,
    segments,
  );
  const legGroup = new THREE.Group();
  legGroup.name = "legs";
  const leftLeg = new THREE.Mesh(legGeo, accentMat);
  leftLeg.position.set(-0.25 * size, 0.25 * size, 0);
  leftLeg.name = "left-leg";
  legGroup.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, accentMat);
  rightLeg.position.set(0.25 * size, 0.25 * size, 0);
  rightLeg.name = "right-leg";
  legGroup.add(rightLeg);
  group.add(legGroup);

  // Tail
  const tailGeo = new THREE.ConeGeometry(0.15 * size, 0.8 * size, segments);
  const tail = new THREE.Mesh(tailGeo, accentMat);
  tail.position.set(0, 0.6 * size, -0.5 * size);
  tail.rotation.x = -Math.PI / 3;
  tail.name = "tail";
  group.add(tail);
}

function buildDragon(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const bodyMat = createMaterial(customColor || 0x228b22, style);
  const wingMat = createMaterial(0x006400, style);
  const bellyMat = createMaterial(0x90ee90, style);

  // Body
  const bodyGeo = new THREE.CylinderGeometry(
    0.3 * size,
    0.4 * size,
    1.2 * size,
    segments,
  );
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1 * size;
  body.rotation.x = Math.PI / 2;
  body.name = "body";
  group.add(body);

  // Belly
  const bellyGeo = new THREE.CylinderGeometry(
    0.25 * size,
    0.35 * size,
    1 * size,
    segments,
  );
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  belly.position.set(0, 0.85 * size, 0.1 * size);
  belly.rotation.x = Math.PI / 2;
  belly.name = "belly";
  group.add(belly);

  // Head
  const headGeo = new THREE.SphereGeometry(0.3 * size, segments, segments);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, 1.2 * size, 0.8 * size);
  head.name = "head";
  group.add(head);

  // Snout
  const snoutGeo = new THREE.ConeGeometry(0.15 * size, 0.4 * size, segments);
  const snout = new THREE.Mesh(snoutGeo, bodyMat);
  snout.position.set(0, 1.1 * size, 1.1 * size);
  snout.rotation.x = Math.PI / 2;
  snout.name = "snout";
  group.add(snout);

  // Wings
  const wingGeo = new THREE.PlaneGeometry(0.8 * size, 0.5 * size);
  const wingGroup = new THREE.Group();
  wingGroup.name = "wings";
  const leftWing = new THREE.Mesh(wingGeo, wingMat);
  leftWing.position.set(-0.5 * size, 1.3 * size, 0);
  leftWing.rotation.z = Math.PI / 6;
  leftWing.name = "left-wing";
  wingGroup.add(leftWing);

  const rightWing = new THREE.Mesh(wingGeo, wingMat);
  rightWing.position.set(0.5 * size, 1.3 * size, 0);
  rightWing.rotation.z = -Math.PI / 6;
  rightWing.name = "right-wing";
  wingGroup.add(rightWing);
  group.add(wingGroup);

  // Legs
  const legGeo = new THREE.CylinderGeometry(
    0.08 * size,
    0.08 * size,
    0.4 * size,
    segments,
  );
  const legGroup = new THREE.Group();
  legGroup.name = "legs";
  const positions = [
    [-0.25 * size, 0.2 * size, 0.3 * size],
    [0.25 * size, 0.2 * size, 0.3 * size],
    [-0.25 * size, 0.2 * size, -0.3 * size],
    [0.25 * size, 0.2 * size, -0.3 * size],
  ];
  positions.forEach((pos, i) => {
    const leg = new THREE.Mesh(legGeo, bodyMat);
    leg.position.set(...pos);
    leg.name = `leg-${i}`;
    legGroup.add(leg);
  });
  group.add(legGroup);

  // Tail
  const tailGeo = new THREE.ConeGeometry(0.1 * size, 0.8 * size, segments);
  const tail = new THREE.Mesh(tailGeo, bodyMat);
  tail.position.set(0, 0.8 * size, -0.8 * size);
  tail.rotation.x = -Math.PI / 2;
  tail.name = "tail";
  group.add(tail);
}

function buildBoat(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const hullMat = createMaterial(customColor || 0x8b4513, style);
  const sailMat = createMaterial(0xf5f5dc, style);
  const mastMat = createMaterial(0x654321, style);

  // Hull
  const hullGeo = new THREE.CylinderGeometry(
    0.3 * size,
    0.5 * size,
    1.5 * size,
    segments,
  );
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 0.5 * size;
  hull.scale.set(1, 1, 0.4);
  hull.name = "hull";
  group.add(hull);

  // Deck
  const deckGeo = new THREE.BoxGeometry(0.8 * size, 0.1 * size, 1.4 * size);
  const deck = new THREE.Mesh(deckGeo, mastMat);
  deck.position.y = 0.8 * size;
  deck.name = "deck";
  group.add(deck);

  // Mast
  const mastGeo = new THREE.CylinderGeometry(
    0.05 * size,
    0.05 * size,
    1.5 * size,
    segments,
  );
  const mast = new THREE.Mesh(mastGeo, mastMat);
  mast.position.y = 1.5 * size;
  mast.name = "mast";
  group.add(mast);

  // Sail
  const sailGeo = new THREE.PlaneGeometry(0.8 * size, 1 * size);
  const sail = new THREE.Mesh(sailGeo, sailMat);
  sail.position.set(0, 1.3 * size, 0.1 * size);
  sail.name = "sail";
  group.add(sail);
}

function buildPlane(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const bodyMat = createMaterial(customColor || 0xc0c0c0, style);
  const wingMat = createMaterial(0xa9a9a9, style);
  const engineMat = createMaterial(0x404040, style);

  // Fuselage
  const fuselageGeo = new THREE.CylinderGeometry(
    0.2 * size,
    0.3 * size,
    2 * size,
    segments,
  );
  const fuselage = new THREE.Mesh(fuselageGeo, bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.name = "fuselage";
  group.add(fuselage);

  // Nose
  const noseGeo = new THREE.ConeGeometry(0.2 * size, 0.5 * size, segments);
  const nose = new THREE.Mesh(noseGeo, bodyMat);
  nose.position.z = 1.2 * size;
  nose.rotation.x = Math.PI / 2;
  nose.name = "nose";
  group.add(nose);

  // Wings
  const wingGeo = new THREE.BoxGeometry(2 * size, 0.05 * size, 0.6 * size);
  const wings = new THREE.Mesh(wingGeo, wingMat);
  wings.position.y = 0.1 * size;
  wings.name = "wings";
  group.add(wings);

  // Tail
  const tailGeo = new THREE.BoxGeometry(0.8 * size, 0.05 * size, 0.4 * size);
  const tail = new THREE.Mesh(tailGeo, wingMat);
  tail.position.z = -1 * size;
  tail.name = "tail";
  group.add(tail);

  // Vertical stabilizer
  const stabGeo = new THREE.BoxGeometry(0.05 * size, 0.5 * size, 0.4 * size);
  const stabilizer = new THREE.Mesh(stabGeo, wingMat);
  stabilizer.position.set(0, 0.3 * size, -1 * size);
  stabilizer.name = "vertical-stabilizer";
  group.add(stabilizer);

  // Engines
  const engineGeo = new THREE.CylinderGeometry(
    0.1 * size,
    0.1 * size,
    0.4 * size,
    segments,
  );
  const engineGroup = new THREE.Group();
  engineGroup.name = "engines";
  const leftEngine = new THREE.Mesh(engineGeo, engineMat);
  leftEngine.position.set(-0.6 * size, 0, 0.2 * size);
  leftEngine.rotation.x = Math.PI / 2;
  leftEngine.name = "left-engine";
  engineGroup.add(leftEngine);

  const rightEngine = new THREE.Mesh(engineGeo, engineMat);
  rightEngine.position.set(0.6 * size, 0, 0.2 * size);
  rightEngine.rotation.x = Math.PI / 2;
  rightEngine.name = "right-engine";
  engineGroup.add(rightEngine);
  group.add(engineGroup);
}

function buildBike(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const frameMat = createMaterial(customColor || 0xff4500, style);
  const wheelMat = createMaterial(0x1a1a1a, style);
  const seatMat = createMaterial(0x4a4a4a, style);

  // Wheels
  const wheelGeo = new THREE.TorusGeometry(
    0.3 * size,
    0.05 * size,
    8,
    segments,
  );
  const wheelGroup = new THREE.Group();
  wheelGroup.name = "wheels";
  const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
  frontWheel.position.set(0, 0.3 * size, 0.6 * size);
  frontWheel.name = "front-wheel";
  wheelGroup.add(frontWheel);

  const rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
  rearWheel.position.set(0, 0.3 * size, -0.6 * size);
  rearWheel.name = "rear-wheel";
  wheelGroup.add(rearWheel);
  group.add(wheelGroup);

  // Frame
  const frameGeo = new THREE.CylinderGeometry(
    0.05 * size,
    0.05 * size,
    1 * size,
    segments,
  );
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.position.y = 0.5 * size;
  frame.rotation.x = Math.PI / 2;
  frame.name = "frame";
  group.add(frame);

  // Handlebars
  const handleGeo = new THREE.CylinderGeometry(
    0.03 * size,
    0.03 * size,
    0.5 * size,
    segments,
  );
  const handlebars = new THREE.Mesh(handleGeo, frameMat);
  handlebars.position.set(0, 0.8 * size, 0.5 * size);
  handlebars.rotation.z = Math.PI / 2;
  handlebars.name = "handlebars";
  group.add(handlebars);

  // Seat
  const seatGeo = new THREE.BoxGeometry(0.2 * size, 0.05 * size, 0.3 * size);
  const seat = new THREE.Mesh(seatGeo, seatMat);
  seat.position.set(0, 0.7 * size, -0.2 * size);
  seat.name = "seat";
  group.add(seat);
}

function buildCampfire(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const logMat = createMaterial(0x8b4513, style);
  const stoneMat = createMaterial(0x696969, style);
  const flameMat = createMaterial(customColor || 0xff4500, style);
  flameMat.emissive = new THREE.Color(0xff2200);
  flameMat.emissiveIntensity = 0.5;

  // Logs
  const logGeo = new THREE.CylinderGeometry(
    0.08 * size,
    0.08 * size,
    0.6 * size,
    segments,
  );
  const logGroup = new THREE.Group();
  logGroup.name = "logs";
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(logGeo, logMat);
    const angle = (i / 5) * Math.PI * 2;
    log.position.set(
      Math.cos(angle) * 0.15 * size,
      0.15 * size,
      Math.sin(angle) * 0.15 * size,
    );
    log.rotation.z = Math.PI / 4;
    log.rotation.y = angle;
    log.name = `log-${i}`;
    logGroup.add(log);
  }
  group.add(logGroup);

  // Stones
  const stoneGeo = new THREE.DodecahedronGeometry(0.1 * size, 0);
  const stoneGroup = new THREE.Group();
  stoneGroup.name = "stones";
  for (let i = 0; i < 8; i++) {
    const stone = new THREE.Mesh(stoneGeo, stoneMat);
    const angle = (i / 8) * Math.PI * 2;
    stone.position.set(
      Math.cos(angle) * 0.4 * size,
      0.05 * size,
      Math.sin(angle) * 0.4 * size,
    );
    stone.name = `stone-${i}`;
    stoneGroup.add(stone);
  }
  group.add(stoneGroup);

  // Flame
  const flameGeo = new THREE.ConeGeometry(0.2 * size, 0.5 * size, segments);
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.y = 0.4 * size;
  flame.name = "flame";
  group.add(flame);
}

function buildSign(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const postMat = createMaterial(0x8b4513, style);
  const boardMat = createMaterial(customColor || 0xdeb887, style);
  const textMat = createMaterial(0x000000, style);

  // Post
  const postGeo = new THREE.CylinderGeometry(
    0.05 * size,
    0.05 * size,
    1.2 * size,
    segments,
  );
  const post = new THREE.Mesh(postGeo, postMat);
  post.position.y = 0.6 * size;
  post.name = "post";
  group.add(post);

  // Board
  const boardGeo = new THREE.BoxGeometry(0.8 * size, 0.4 * size, 0.05 * size);
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.position.y = 1 * size;
  board.name = "board";
  group.add(board);

  // Text (simple line to represent text)
  const textGeo = new THREE.BoxGeometry(0.6 * size, 0.1 * size, 0.06 * size);
  const text = new THREE.Mesh(textGeo, textMat);
  text.position.y = 1 * size;
  text.name = "text";
  group.add(text);
}

function buildCrystal(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const crystalMat = createMaterial(customColor || 0x9370db, style);
  crystalMat.transparent = true;
  crystalMat.opacity = 0.8;

  // Base
  const baseGeo = new THREE.CylinderGeometry(
    0.3 * size,
    0.4 * size,
    0.2 * size,
    segments,
  );
  const base = new THREE.Mesh(baseGeo, crystalMat);
  base.position.y = 0.1 * size;
  base.name = "base";
  group.add(base);

  // Main shard
  const shardGeo = new THREE.ConeGeometry(0.2 * size, 0.8 * size, segments);
  const shard = new THREE.Mesh(shardGeo, crystalMat);
  shard.position.y = 0.6 * size;
  shard.name = "shard";
  group.add(shard);

  // Tip
  const tipGeo = new THREE.ConeGeometry(0.1 * size, 0.3 * size, segments);
  const tip = new THREE.Mesh(tipGeo, crystalMat);
  tip.position.y = 1.1 * size;
  tip.name = "tip";
  group.add(tip);
}

function buildMushroom(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const stemMat = createMaterial(0xf5f5dc, style);
  const capMat = createMaterial(customColor || 0xff0000, style);
  const spotMat = createMaterial(0xffffff, style);

  // Stem
  const stemGeo = new THREE.CylinderGeometry(
    0.15 * size,
    0.2 * size,
    0.5 * size,
    segments,
  );
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.position.y = 0.25 * size;
  stem.name = "stem";
  group.add(stem);

  // Cap
  const capGeo = new THREE.SphereGeometry(0.4 * size, segments, segments);
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.position.y = 0.5 * size;
  cap.scale.set(1, 0.6, 1);
  cap.name = "cap";
  group.add(cap);

  // Spots
  const spotGeo = new THREE.SphereGeometry(0.05 * size, 8, 8);
  const spotGroup = new THREE.Group();
  spotGroup.name = "spots";
  for (let i = 0; i < 5; i++) {
    const spot = new THREE.Mesh(spotGeo, spotMat);
    const angle = (i / 5) * Math.PI * 2;
    spot.position.set(
      Math.cos(angle) * 0.25 * size,
      0.65 * size,
      Math.sin(angle) * 0.25 * size,
    );
    spot.name = `spot-${i}`;
    spotGroup.add(spot);
  }
  group.add(spotGroup);
}

function buildTreeStump(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const woodMat = createMaterial(customColor || 0x8b4513, style);
  const ringMat = createMaterial(0x654321, style);

  // Stump
  const stumpGeo = new THREE.CylinderGeometry(
    0.3 * size,
    0.35 * size,
    0.4 * size,
    segments,
  );
  const stump = new THREE.Mesh(stumpGeo, woodMat);
  stump.position.y = 0.2 * size;
  stump.name = "stump";
  group.add(stump);

  // Rings
  const ringGeo = new THREE.TorusGeometry(0.2 * size, 0.02 * size, 8, segments);
  const ringGroup = new THREE.Group();
  ringGroup.name = "rings";
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.41 * size;
    ring.rotation.x = Math.PI / 2;
    ring.scale.setScalar(1 - i * 0.2);
    ring.name = `ring-${i}`;
    ringGroup.add(ring);
  }
  group.add(ringGroup);

  // Roots
  const rootGeo = new THREE.CylinderGeometry(
    0.05 * size,
    0.08 * size,
    0.3 * size,
    segments,
  );
  const rootGroup = new THREE.Group();
  rootGroup.name = "roots";
  for (let i = 0; i < 4; i++) {
    const root = new THREE.Mesh(rootGeo, woodMat);
    const angle = (i / 4) * Math.PI * 2;
    root.position.set(
      Math.cos(angle) * 0.3 * size,
      0.05 * size,
      Math.sin(angle) * 0.3 * size,
    );
    root.rotation.z = (Math.cos(angle) * Math.PI) / 4;
    root.rotation.x = (-Math.sin(angle) * Math.PI) / 4;
    root.name = `root-${i}`;
    rootGroup.add(root);
  }
  group.add(rootGroup);
}

function buildBarrelVariants(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const bodyMat = createMaterial(customColor || 0x8b4513, style);
  const hoopMat = createMaterial(0x404040, style);
  const lidMat = createMaterial(0x654321, style);

  // Body
  const bodyGeo = new THREE.CylinderGeometry(
    0.35 * size,
    0.35 * size,
    0.8 * size,
    segments,
  );
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.4 * size;
  body.name = "body";
  group.add(body);

  // Hoops
  const hoopGeo = new THREE.TorusGeometry(
    0.36 * size,
    0.03 * size,
    8,
    segments,
  );
  const hoopGroup = new THREE.Group();
  hoopGroup.name = "hoops";
  const positions = [0.15, 0.4, 0.65];
  positions.forEach((y, i) => {
    const hoop = new THREE.Mesh(hoopGeo, hoopMat);
    hoop.position.y = y * size;
    hoop.rotation.x = Math.PI / 2;
    hoop.name = `hoop-${i}`;
    hoopGroup.add(hoop);
  });
  group.add(hoopGroup);

  // Lid
  const lidGeo = new THREE.CylinderGeometry(
    0.3 * size,
    0.3 * size,
    0.05 * size,
    segments,
  );
  const lid = new THREE.Mesh(lidGeo, lidMat);
  lid.position.y = 0.82 * size;
  lid.name = "lid";
  group.add(lid);
}

function buildCube(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const mat = createMaterial(customColor || 0x808080, style);
  const geo = new THREE.BoxGeometry(size, size, size);
  const cube = new THREE.Mesh(geo, mat);
  cube.name = "body";
  group.add(cube);
}

function buildShield(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const bodyMat = createMaterial(customColor || 0x8b4513, style);
  const bossMat = createMaterial(0xffd700, style);
  const rimMat = createMaterial(0xc0c0c0, style);

  // Body
  const bodyGeo = new THREE.CylinderGeometry(
    0.8 * size,
    0.8 * size,
    0.1 * size,
    segments,
  );
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.rotation.x = Math.PI / 2;
  body.name = "body";
  group.add(body);

  // Boss
  const bossGeo = new THREE.SphereGeometry(0.2 * size, segments, segments);
  const boss = new THREE.Mesh(bossGeo, bossMat);
  boss.position.z = 0.1 * size;
  boss.name = "boss";
  group.add(boss);

  // Rim
  const rimGeo = new THREE.TorusGeometry(
    0.8 * size,
    0.05 * size,
    segments,
    segments,
  );
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.name = "rim";
  group.add(rim);
}

function buildPotion(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const bodyMat = createMaterial(customColor || 0x87ceeb, style);
  const neckMat = createMaterial(customColor || 0x87ceeb, style);
  const corkMat = createMaterial(0x8b4513, style);

  // Body
  const bodyGeo = new THREE.SphereGeometry(0.4 * size, segments, segments);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.4 * size;
  body.name = "body";
  group.add(body);

  // Neck
  const neckGeo = new THREE.CylinderGeometry(
    0.1 * size,
    0.15 * size,
    0.3 * size,
    segments,
  );
  const neck = new THREE.Mesh(neckGeo, neckMat);
  neck.position.y = 0.9 * size;
  neck.name = "neck";
  group.add(neck);

  // Cork
  const corkGeo = new THREE.CylinderGeometry(
    0.08 * size,
    0.08 * size,
    0.15 * size,
    segments,
  );
  const cork = new THREE.Mesh(corkGeo, corkMat);
  cork.position.y = 1.1 * size;
  cork.name = "cork";
  group.add(cork);
}

function buildChest(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const bodyMat = createMaterial(customColor || 0x8b4513, style);
  const lidMat = createMaterial(customColor || 0x8b4513, style);
  const lockMat = createMaterial(0xffd700, style);

  // Body
  const bodyGeo = new THREE.BoxGeometry(1 * size, 0.6 * size, 0.6 * size);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.3 * size;
  body.name = "body";
  group.add(body);

  // Lid
  const lidGeo = new THREE.BoxGeometry(1 * size, 0.2 * size, 0.6 * size);
  const lid = new THREE.Mesh(lidGeo, lidMat);
  lid.position.y = 0.7 * size;
  lid.name = "lid";
  group.add(lid);

  // Lock
  const lockGeo = new THREE.BoxGeometry(0.15 * size, 0.2 * size, 0.1 * size);
  const lock = new THREE.Mesh(lockGeo, lockMat);
  lock.position.set(0, 0.5 * size, 0.35 * size);
  lock.name = "lock";
  group.add(lock);
}

function buildKey(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const mat = createMaterial(customColor || 0xffd700, style);

  // Bow
  const bowGeo = new THREE.TorusGeometry(
    0.2 * size,
    0.05 * size,
    segments,
    segments,
  );
  const bow = new THREE.Mesh(bowGeo, mat);
  bow.position.y = 0.3 * size;
  bow.name = "bow";
  group.add(bow);

  // Shaft
  const shaftGeo = new THREE.CylinderGeometry(
    0.05 * size,
    0.05 * size,
    0.6 * size,
    segments,
  );
  const shaft = new THREE.Mesh(shaftGeo, mat);
  shaft.position.y = -0.1 * size;
  shaft.name = "shaft";
  group.add(shaft);

  // Bit
  const bitGeo = new THREE.BoxGeometry(0.15 * size, 0.1 * size, 0.05 * size);
  const bit = new THREE.Mesh(bitGeo, mat);
  bit.position.set(0.1 * size, -0.35 * size, 0);
  bit.name = "bit";
  group.add(bit);
}

function buildGem(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const mat = createMaterial(customColor || 0xff00ff, style);
  const geo = new THREE.OctahedronGeometry(size, 0);
  const gem = new THREE.Mesh(geo, mat);
  gem.name = "body";
  group.add(gem);
}

function buildBarrel(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const bodyMat = createMaterial(customColor || 0x8b4513, style);
  const hoopMat = createMaterial(0x333333, style);

  // Body
  const bodyGeo = new THREE.CylinderGeometry(
    0.4 * size,
    0.4 * size,
    1 * size,
    segments,
  );
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.name = "body";
  group.add(body);

  // Hoops
  const hoopGeo = new THREE.TorusGeometry(
    0.42 * size,
    0.03 * size,
    segments,
    segments,
  );
  const hoopGroup = new THREE.Group();
  hoopGroup.name = "hoops";
  const hoopPositions = [-0.3 * size, 0, 0.3 * size];
  hoopPositions.forEach((y, i) => {
    const hoop = new THREE.Mesh(hoopGeo, hoopMat);
    hoop.position.y = y;
    hoop.rotation.x = Math.PI / 2;
    hoop.name = `hoop-${i}`;
    hoopGroup.add(hoop);
  });
  group.add(hoopGroup);
}

function buildCrate(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const mat = createMaterial(customColor || 0x8b4513, style);
  const geo = new THREE.BoxGeometry(size, size, size);
  const crate = new THREE.Mesh(geo, mat);
  crate.name = "body";
  group.add(crate);
}

function buildTower(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const stoneMat = createMaterial(customColor || 0x9e9e9e, style);
  const roofMat = createMaterial(0x7f3f2f, style);
  const windowMat = createMaterial(0xffd27f, style);
  const tall = 2.5 + rng() * 0.8;

  const shaftGeo = new THREE.CylinderGeometry(
    0.45 * size,
    0.6 * size,
    tall * size,
    segments,
  );
  const shaft = new THREE.Mesh(shaftGeo, stoneMat);
  shaft.position.y = (tall / 2) * size;
  shaft.name = "shaft";
  group.add(shaft);

  const roofGeo = new THREE.ConeGeometry(0.75 * size, 1.1 * size, segments);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = (tall + 0.55) * size;
  roof.name = "roof";
  group.add(roof);

  const windowGeo = new THREE.BoxGeometry(
    0.18 * size,
    0.32 * size,
    0.05 * size,
  );
  const windowGroup = new THREE.Group();
  windowGroup.name = "windows";
  for (let i = 0; i < 3; i++) {
    const win = new THREE.Mesh(windowGeo, windowMat);
    const wy = (0.45 + i * 0.62) * size;
    win.position.set(0, wy, 0.46 * size);
    win.name = `window-${i}`;
    windowGroup.add(win);
  }
  group.add(windowGroup);
}

function buildFlag(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const poleMat = createMaterial(0x8d6e63, style);
  const clothMat = createMaterial(customColor || 0xd32f2f, style);
  const tall = 3 + rng() * 0.8;

  const poleGeo = new THREE.CylinderGeometry(
    0.04 * size,
    0.05 * size,
    tall * size,
    segments,
  );
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = (tall / 2) * size;
  pole.name = "pole";
  group.add(pole);

  const flagGeo = new THREE.BoxGeometry(1.1 * size, 0.55 * size, 0.05 * size);
  const flagMesh = new THREE.Mesh(flagGeo, clothMat);
  flagMesh.position.set(0.55 * size, (tall - 0.3) * size, 0);
  flagMesh.rotation.z = -0.06 + rng() * 0.12;
  flagMesh.name = "cloth";
  group.add(flagMesh);

  // Tail notch
  const notchGeo = new THREE.BoxGeometry(0.3 * size, 0.4 * size, 0.06 * size);
  const notch = new THREE.Mesh(notchGeo, clothMat);
  notch.position.set(1.05 * size, (tall - 0.55) * size, 0);
  notch.name = "tail";
  group.add(notch);
}

function buildTorch(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const handleMat = createMaterial(customColor || 0x6d4c41, style);
  const metalMat = createMaterial(0x757575, style);
  const flameMat = createMaterial(0xff9800, style);

  const handleGeo = new THREE.CylinderGeometry(
    0.06 * size,
    0.08 * size,
    2.2 * size,
    segments,
  );
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.y = 1.1 * size;
  handle.name = "handle";
  group.add(handle);

  const cupGeo = new THREE.CylinderGeometry(
    0.14 * size,
    0.1 * size,
    0.3 * size,
    segments,
    1,
    true,
  );
  const cup = new THREE.Mesh(cupGeo, metalMat);
  cup.position.y = 2.2 * size;
  cup.name = "cup";
  group.add(cup);

  const flameGeo = new THREE.ConeGeometry(
    0.16 + rng() * 0.05 * size,
    0.55 * size,
    segments,
  );
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.y = 2.55 * size;
  flame.name = "flame";
  group.add(flame);
}

function buildFence(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const woodMat = createMaterial(customColor || 0x8d6e63, style);
  const railingMat = createMaterial(0xa1887f, style);
  const posts = 4 + Math.floor(rng() * 3);
  const width = 3.5 * size;

  const postGroup = new THREE.Group();
  postGroup.name = "posts";
  for (let i = 0; i < posts; i++) {
    const postGeo = new THREE.BoxGeometry(0.12 * size, 1.2 * size, 0.12 * size);
    const post = new THREE.Mesh(postGeo, woodMat);
    post.position.set(-width / 2 + (i / (posts - 1)) * width, 0.6 * size, 0);
    post.rotation.y = (rng() - 0.5) * 0.04;
    post.name = `post-${i}`;
    postGroup.add(post);
  }
  group.add(postGroup);

  const railGeo = new THREE.BoxGeometry(
    width + 0.2 * size,
    0.14 * size,
    0.06 * size,
  );
  const railGroup = new THREE.Group();
  railGroup.name = "rails";
  for (const ry of [0.85, 0.4]) {
    const rail = new THREE.Mesh(railGeo, railingMat);
    rail.position.y = ry * size;
    rail.name = `rail-${ry}`;
    railGroup.add(rail);
  }
  group.add(railGroup);
}

function buildBridge(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const deckMat = createMaterial(customColor || 0x8d6e63, style);
  const railMat = createMaterial(0xa1887f, style);
  const stoneMat = createMaterial(0x757575, style);
  const length = 4.5 * size;

  const deckGeo = new THREE.BoxGeometry(length, 0.35 * size, 1.6 * size);
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = 0.35 * size;
  deck.name = "deck";
  group.add(deck);

  const railGroup = new THREE.Group();
  railGroup.name = "rails";
  for (const side of [-1, 1]) {
    const postGeo = new THREE.BoxGeometry(
      0.08 * size,
      0.55 * size,
      0.08 * size,
    );
    for (let i = 0; i < 5; i++) {
      const post = new THREE.Mesh(postGeo, railMat);
      post.position.set(
        -length / 2 + (i / 4) * length,
        0.75 * size,
        side * 0.8 * size,
      );
      post.name = `rail-post-${side}-${i}`;
      railGroup.add(post);
    }

    const railGeo = new THREE.BoxGeometry(length, 0.08 * size, 0.05 * size);
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(0, 1.0 * size, side * 0.8 * size);
    rail.name = `rail-${side}`;
    railGroup.add(rail);
  }
  group.add(railGroup);

  // Pier legs
  const legGeo = new THREE.BoxGeometry(0.5 * size, 0.6 * size, 1.1 * size);
  const legGroup = new THREE.Group();
  legGroup.name = "legs";
  for (const lx of [-length / 4, length / 4]) {
    const leg = new THREE.Mesh(legGeo, stoneMat);
    leg.position.set(lx, -0.3 * size, 0);
    leg.name = `leg-${lx}`;
    legGroup.add(leg);
  }
  group.add(legGroup);
}

function buildFountain(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const stoneMat = createMaterial(customColor || 0x90a4ae, style);
  const waterMat = createMaterial(0x4fc3f7, style);
  const metric = 2.2 * size;

  const basinGeo = new THREE.CylinderGeometry(
    metric,
    metric * 1.05,
    0.45 * size,
    segments,
  );
  const basin = new THREE.Mesh(basinGeo, stoneMat);
  basin.position.y = 0.225 * size;
  basin.name = "basin";
  group.add(basin);

  const waterGeo = new THREE.CylinderGeometry(
    metric * 0.88,
    metric * 0.88,
    0.12 * size,
    segments,
  );
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = 0.42 * size;
  water.name = "water";
  group.add(water);

  const pillarGeo = new THREE.CylinderGeometry(
    0.22 * size,
    0.35 * size,
    1.4 * size,
    segments,
  );
  const pillar = new THREE.Mesh(pillarGeo, stoneMat);
  pillar.position.y = 1.1 * size;
  pillar.name = "pillar";
  group.add(pillar);

  const bowlGeo = new THREE.CylinderGeometry(
    0.65 * size,
    0.3 * size,
    0.35 * size,
    segments,
  );
  const bowl = new THREE.Mesh(bowlGeo, stoneMat);
  bowl.position.y = 1.85 * size;
  bowl.name = "bowl";
  group.add(bowl);

  const jetGeo = new THREE.CylinderGeometry(
    0.12 * size,
    0.12 * size,
    0.7 * size,
    segments,
  );
  const jet = new THREE.Mesh(jetGeo, waterMat);
  jet.position.y = 2.3 * size;
  jet.name = "jet";
  group.add(jet);
}

function buildBrazier(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const metalMat = createMaterial(customColor || 0x4e342e, style);
  const coalMat = createMaterial(0xbf360c, style);
  const flameMat = createMaterial(0xff9800, style);
  flameMat.emissive = new THREE.Color(0xff6f00);
  flameMat.emissiveIntensity = 1.2;

  const basinGeo = new THREE.CylinderGeometry(
    0.55 * size,
    0.42 * size,
    0.5 * size,
    segments,
    1,
    true,
  );
  const basin = new THREE.Mesh(basinGeo, metalMat);
  basin.position.y = 0.3 * size;
  basin.name = "basin";
  group.add(basin);

  const legs = new THREE.Group();
  legs.name = "legs";
  for (let i = 0; i < 3; i++) {
    const legGeo = new THREE.BoxGeometry(0.09 * size, 0.55 * size, 0.09 * size);
    const leg = new THREE.Mesh(legGeo, metalMat);
    const angle = (i / 3) * Math.PI * 2;
    leg.position.set(
      Math.cos(angle) * 0.34 * size,
      -0.25 * size,
      Math.sin(angle) * 0.34 * size,
    );
    leg.rotation.z = -Math.cos(angle) * 0.18;
    leg.rotation.x = Math.sin(angle) * 0.18;
    leg.name = `leg-${i}`;
    legs.add(leg);
  }
  group.add(legs);

  const coalsGeo = new THREE.SphereGeometry(0.3 * size, segments, segments);
  const coals = new THREE.Mesh(coalsGeo, coalMat);
  coals.position.y = 0.52 * size;
  coals.scale.y = 0.4;
  coals.name = "coals";
  group.add(coals);

  const flameGeo = new THREE.ConeGeometry(
    (0.22 + rng() * 0.08) * size,
    (0.75 + rng() * 0.25) * size,
    segments,
  );
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.y = (0.85 + rng() * 0.1) * size;
  flame.name = "flame";
  group.add(flame);
}

function buildRunestone(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const stoneMat = createMaterial(customColor || 0x78909c, style);
  const runeMat = createMaterial(0x00e5ff, style);
  runeMat.emissive = new THREE.Color(0x00b0ff);
  runeMat.emissiveIntensity = 1.5;

  const tilt = (rng() - 0.5) * 0.14;
  const stoneGeo = new THREE.BoxGeometry(0.75 * size, 2.2 * size, 0.28 * size);
  const stone = new THREE.Mesh(stoneGeo, stoneMat);
  stone.position.y = 1.1 * size;
  stone.rotation.z = tilt;
  stone.name = "stone";
  group.add(stone);

  const runeGeo = new THREE.BoxGeometry(0.3 * size, 1.3 * size, 0.06 * size);
  const rune = new THREE.Mesh(runeGeo, runeMat);
  rune.position.set(0.2 * size, (1.1 + rng() * 0.12) * size, 0.17 * size);
  rune.name = "rune";
  group.add(rune);
}

function buildTrap(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const frameMat = createMaterial(customColor || 0x5d4037, style);
  const spikeMat = createMaterial(0x9e9e9e, style);

  const frameGeo = new THREE.BoxGeometry(2.2 * size, 0.18 * size, 2.2 * size);
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.position.y = 0.09 * size;
  frame.name = "frame";
  group.add(frame);

  const spikes = new THREE.Group();
  spikes.name = "spikes";
  for (let i = 0; i < 9; i++) {
    const spikeGeo = new THREE.ConeGeometry(
      (0.09 + rng() * 0.05) * size,
      (0.5 + rng() * 0.3) * size,
      6,
    );
    const spike = new THREE.Mesh(spikeGeo, spikeMat);
    spike.position.set(
      ((i % 3) - 1) * 0.6 * size,
      0.34 * size,
      (Math.floor(i / 3) - 1) * 0.6 * size,
    );
    spike.rotation.z = (rng() - 0.5) * 0.05;
    spike.name = `spike-${i}`;
    spikes.add(spike);
  }
  group.add(spikes);
}

function buildTurret(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const hullMat = createMaterial(customColor || 0x546e7a, style);
  const accentMat = createMaterial(0xff7043, style);
  const eyeMat = createMaterial(0x00e5ff, style);
  eyeMat.emissive = new THREE.Color(0x00b0ff);
  eyeMat.emissiveIntensity = 2;

  const baseGeo = new THREE.CylinderGeometry(
    0.7 * size,
    0.85 * size,
    0.5 * size,
    segments,
  );
  const base = new THREE.Mesh(baseGeo, hullMat);
  base.position.y = 0.25 * size;
  base.name = "base";
  group.add(base);

  const bodyGeo = new THREE.SphereGeometry(0.55 * size, segments, segments);
  const body = new THREE.Mesh(bodyGeo, hullMat);
  body.position.y = 0.85 * size;
  body.scale.y = 0.8;
  body.name = "body";
  group.add(body);

  const barrelGeo = new THREE.CylinderGeometry(
    0.09 * size,
    0.12 * size,
    1.1 * size,
    segments,
  );
  const barrel = new THREE.Mesh(barrelGeo, accentMat);
  barrel.position.set(0.65 * size, 0.9 * size, 0);
  barrel.rotation.z = Math.PI / 2;
  barrel.name = "barrel";
  group.add(barrel);

  const eyeGeo = new THREE.SphereGeometry(0.12 * size, segments, segments);
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.position.set(0.4 * size, 0.9 * size, 0);
  eye.name = "eye";
  group.add(eye);
}

function buildDrone(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const hullMat = createMaterial(customColor || 0x37474f, style);
  const rotorMat = createMaterial(0xcfd8dc, style);
  const cameraMat = createMaterial(0xff5252, style);
  cameraMat.emissive = new THREE.Color(0xd50000);
  cameraMat.emissiveIntensity = 1.4;

  const bodyGeo = new THREE.SphereGeometry(0.42 * size, segments, segments);
  const body = new THREE.Mesh(bodyGeo, hullMat);
  body.scale.y = 0.62;
  body.name = "body";
  group.add(body);

  const rotors = new THREE.Group();
  rotors.name = "rotors";
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const armGeo = new THREE.BoxGeometry(0.08 * size, 0.06 * size, 0.9 * size);
    const arm = new THREE.Mesh(armGeo, hullMat);
    arm.position.set(
      Math.cos(angle) * 0.35 * size,
      0,
      Math.sin(angle) * 0.35 * size,
    );
    arm.rotation.y = -angle;
    arm.name = `arm-${i}`;
    rotors.add(arm);

    const rotorGeo = new THREE.CylinderGeometry(
      0.34 * size,
      0.34 * size,
      0.03 * size,
      4,
    );
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.position.set(
      Math.cos(angle) * 0.8 * size,
      0,
      Math.sin(angle) * 0.8 * size,
    );
    rotor.rotation.x = Math.PI / 2;
    rotor.name = `rotor-${i}`;
    rotors.add(rotor);
  }
  group.add(rotors);

  const cameraGeo = new THREE.SphereGeometry(0.14 * size, segments, segments);
  const camera = new THREE.Mesh(cameraGeo, cameraMat);
  camera.position.y = -0.3 * size;
  camera.name = "camera";
  group.add(camera);
}

function buildAntenna(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const mastMat = createMaterial(customColor || 0x78909c, style);
  const dishMat = createMaterial(0xe0e0e0, style);
  const lightMat = createMaterial(0xff7043, style);
  lightMat.emissive = new THREE.Color(0xff3d00);
  lightMat.emissiveIntensity = 1.6;

  const mastGeo = new THREE.CylinderGeometry(
    0.06 * size,
    0.09 * size,
    3.4 * size,
    segments,
  );
  const mast = new THREE.Mesh(mastGeo, mastMat);
  mast.position.y = 1.7 * size;
  mast.name = "mast";
  group.add(mast);

  const dishGeo = new THREE.SphereGeometry(
    0.75 * size,
    segments,
    segments,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.5,
  );
  const dish = new THREE.Mesh(dishGeo, dishMat);
  dish.position.set(0.9 * size, (1.15 + rng() * 0.2) * size, 0);
  dish.rotation.z = -Math.PI / 4;
  dish.name = "dish";
  group.add(dish);

  const armGeo = new THREE.CylinderGeometry(
    0.035 * size,
    0.035 * size,
    0.95 * size,
    8,
  );
  const arm = new THREE.Mesh(armGeo, mastMat);
  arm.position.set(0.55 * size, (1.2 + rng() * 0.18) * size, 0);
  arm.rotation.z = -Math.PI / 7;
  arm.name = "arm";
  group.add(arm);

  const lightGeo = new THREE.SphereGeometry(0.12 * size, segments, segments);
  const light = new THREE.Mesh(lightGeo, lightMat);
  light.position.y = 3.4 * size;
  light.name = "light";
  group.add(light);
}

function buildAxe(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const woodMat = createMaterial(0x6d4c2f, style);
  const bladeMat = createMaterial(customColor || 0xb0bec5, style);
  const wrapMat = createMaterial(0x4a3728, style);

  const handleGeo = new THREE.CylinderGeometry(
    0.05 * size,
    0.07 * size,
    1.6 * size,
    segments,
  );
  const handle = new THREE.Mesh(handleGeo, woodMat);
  handle.position.y = -0.1 * size;
  handle.name = "handle";
  group.add(handle);

  const headGeo = new THREE.BoxGeometry(0.75 * size, 0.5 * size, 0.08 * size);
  const head = new THREE.Mesh(headGeo, bladeMat);
  head.position.set(0.32 * size, 0.72 * size, 0);
  head.rotation.z = -0.22;
  head.name = "head";
  group.add(head);

  const wrapGeo = new THREE.TorusGeometry(
    0.075 * size,
    0.035 * size,
    segments,
    segments,
  );
  const wrap = new THREE.Mesh(wrapGeo, wrapMat);
  wrap.position.y = -0.6 * size;
  wrap.rotation.x = Math.PI / 2;
  wrap.name = "wrap";
  group.add(wrap);
}

function buildBow(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const riserMat = createMaterial(0x8d6e63, style);
  const limbMat = createMaterial(customColor || 0xa1887f, style);
  const stringMat = createMaterial(0xe0e0e0, style);

  const riserGeo = new THREE.BoxGeometry(0.22 * size, 0.9 * size, 0.12 * size);
  const riser = new THREE.Mesh(riserGeo, riserMat);
  riser.name = "riser";
  group.add(riser);

  const limbGeo = new THREE.BoxGeometry(0.12 * size, 1.1 * size, 0.1 * size);
  const upper = new THREE.Mesh(limbGeo, limbMat);
  upper.position.y = 0.95 * size;
  upper.rotation.z = 0.42;
  upper.name = "limb";
  group.add(upper);

  const lower = new THREE.Mesh(limbGeo, limbMat);
  lower.position.y = -0.95 * size;
  lower.rotation.z = -0.42;
  lower.name = "limb";
  group.add(lower);

  const stringGeo = new THREE.CylinderGeometry(
    0.015 * size,
    0.015 * size,
    2.9 * size,
    4,
  );
  const string = new THREE.Mesh(stringGeo, stringMat);
  string.name = "string";
  group.add(string);
}

function buildHammer(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const handleMat = createMaterial(0x5d4037, style);
  const headMat = createMaterial(customColor || 0x90a4ae, style);
  const gripMat = createMaterial(0x3e2723, style);

  const handleGeo = new THREE.CylinderGeometry(
    0.06 * size,
    0.08 * size,
    1.5 * size,
    segments,
  );
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.y = -0.1 * size;
  handle.name = "handle";
  group.add(handle);

  const headGeo = new THREE.BoxGeometry(0.7 * size, 0.45 * size, 0.35 * size);
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 0.85 * size;
  head.name = "head";
  group.add(head);

  const gripGeo = new THREE.TorusGeometry(
    0.09 * size,
    0.04 * size,
    segments,
    segments,
  );
  const grip = new THREE.Mesh(gripGeo, gripMat);
  grip.position.y = -0.75 * size;
  grip.rotation.x = Math.PI / 2;
  grip.name = "grip";
  group.add(grip);
}

function buildSpear(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const shaftMat = createMaterial(0x8d6e63, style);
  const steelMat = createMaterial(customColor || 0xcfd8dc, style);

  const shaftGeo = new THREE.CylinderGeometry(
    0.05 * size,
    0.07 * size,
    2.2 * size,
    segments,
  );
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.name = "shaft";
  group.add(shaft);

  const tipGeo = new THREE.ConeGeometry(0.16 * size, 0.7 * size, segments);
  const tip = new THREE.Mesh(tipGeo, steelMat);
  tip.position.y = 1.45 * size;
  tip.name = "head";
  group.add(tip);

  const socketGeo = new THREE.CylinderGeometry(
    0.07 * size,
    0.09 * size,
    0.22 * size,
    segments,
  );
  const socket = new THREE.Mesh(socketGeo, steelMat);
  socket.position.y = 1.04 * size;
  socket.name = "head";
  group.add(socket);

  const buttGeo = new THREE.ConeGeometry(0.06 * size, 0.24 * size, segments);
  const butt = new THREE.Mesh(buttGeo, steelMat);
  butt.position.y = -1.2 * size;
  butt.rotation.x = Math.PI;
  butt.name = "butt";
  group.add(butt);
}

function buildTent(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const canvasMat = createMaterial(customColor || 0xc8a35a, style);
  const poleMat = createMaterial(0x6d4c2f, style);
  const floorMat = createMaterial(0x8b7355, style);

  const floorGeo = new THREE.BoxGeometry(1.8 * size, 0.06 * size, 1.6 * size);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = 0.03 * size;
  floor.name = "floor";
  group.add(floor);

  const canopyGeo = new THREE.ConeGeometry(1.3 * size, 1.1 * size, 4);
  const canopy = new THREE.Mesh(canopyGeo, canvasMat);
  canopy.position.y = 0.62 * size;
  canopy.rotation.y = Math.PI / 4;
  canopy.name = "canopy";
  group.add(canopy);

  const poleGeo = new THREE.CylinderGeometry(
    0.03 * size,
    0.04 * size,
    0.7 * size,
    segments,
  );
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.set(0.72 * size, 0.38 * size, 0.65 * size);
  pole.rotation.z = 0.28;
  pole.name = "pole";
  group.add(pole);
}

function buildStatue(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const stoneMat = createMaterial(customColor || 0xbdbdbd, style);

  const baseGeo = new THREE.BoxGeometry(1.2 * size, 0.35 * size, 1.2 * size);
  const base = new THREE.Mesh(baseGeo, stoneMat);
  base.position.y = 0.175 * size;
  base.name = "base";
  group.add(base);

  const bodyGeo = new THREE.CylinderGeometry(
    0.28 * size,
    0.42 * size,
    1.1 * size,
    segments,
  );
  const body = new THREE.Mesh(bodyGeo, stoneMat);
  body.position.y = 0.9 * size;
  body.name = "body";
  group.add(body);

  const headGeo = new THREE.SphereGeometry(0.24 * size, segments, segments);
  const head = new THREE.Mesh(headGeo, stoneMat);
  head.position.y = 1.58 * size;
  head.name = "head";
  group.add(head);
}

function buildPillar(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const stoneMat = createMaterial(customColor || 0xb0a78e, style);

  const baseGeo = new THREE.BoxGeometry(0.8 * size, 0.3 * size, 0.8 * size);
  const base = new THREE.Mesh(baseGeo, stoneMat);
  base.position.y = 0.15 * size;
  base.name = "base";
  group.add(base);

  const columnGeo = new THREE.CylinderGeometry(
    0.32 * size,
    0.38 * size,
    1.9 * size,
    segments,
  );
  const column = new THREE.Mesh(columnGeo, stoneMat);
  column.position.y = 1.1 * size;
  column.name = "column";
  group.add(column);

  const capitalGeo = new THREE.BoxGeometry(0.8 * size, 0.25 * size, 0.8 * size);
  const capital = new THREE.Mesh(capitalGeo, stoneMat);
  capital.position.y = 2.15 * size;
  capital.name = "capital";
  group.add(capital);
}

function buildWell(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const stoneMat = createMaterial(customColor || 0x8d8d8d, style);
  const woodMat = createMaterial(0x6d4c2f, style);
  const roofMat = createMaterial(0x7f3f2f, style);

  const rimGeo = new THREE.TorusGeometry(
    0.55 * size,
    0.14 * size,
    segments,
    segments,
  );
  const rim = new THREE.Mesh(rimGeo, stoneMat);
  rim.position.y = 0.2 * size;
  rim.rotation.x = Math.PI / 2;
  rim.name = "rim";
  group.add(rim);

  const postGeo = new THREE.CylinderGeometry(
    0.05 * size,
    0.06 * size,
    1.7 * size,
    segments,
  );
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, woodMat);
    post.position.set(side * 0.52 * size, 1.05 * size, 0);
    post.name = "posts";
    group.add(post);
  }

  const roofGeo = new THREE.ConeGeometry(0.62 * size, 0.5 * size, 4);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 2.3 * size;
  roof.rotation.y = Math.PI / 4;
  roof.name = "roof";
  group.add(roof);

  const bucketGeo = new THREE.CylinderGeometry(
    0.14 * size,
    0.14 * size,
    0.3 * size,
    segments,
  );
  const bucket = new THREE.Mesh(bucketGeo, woodMat);
  bucket.position.y = 1.05 * size;
  bucket.name = "bucket";
  group.add(bucket);
}

/**
 * Clone an object tree with geometry that is safe to edit or dispose: the
 * clones keep their own buffers instead of sharing the source geometry.
 */
export function cloneModelDeep(object) {
  const clone = object.clone(true);
  if (Array.isArray(object.animations)) {
    clone.animations = object.animations.map((clip) => clip.clone());
  }
  clone.traverse((child) => {
    if (child.isMesh && child.geometry) {
      child.geometry = child.geometry.clone();
    }
  });
  return clone;
}

/**
 * Decimate a mesh by vertex clustering: vertices inside one cell merge, and
 * triangles whose three corners collapse into the same cell are dropped. The
 * mesh keeps its transforms and material; only its geometry is replaced.
 */
export function decimateMesh(mesh, threshold = 0.1) {
  const geometry = mesh.geometry;
  if (!geometry?.attributes.position) return mesh;

  const step = Math.max(Number(threshold) || 0.1, 1e-6);
  const positions = geometry.attributes.position;
  const cellMap = new Map();
  const representatives = [];
  const cellOf = new Int32Array(positions.count);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const key = `${Math.round(x / step)},${Math.round(y / step)},${Math.round(z / step)}`;
    let representative = cellMap.get(key);
    if (representative === undefined) {
      representative = representatives.length / 3;
      cellMap.set(key, representative);
      representatives.push(x, y, z);
    }
    cellOf[i] = representative;
  }

  const sourceIndex = geometry.index ? geometry.index.array : null;
  const triangleCount = sourceIndex ? sourceIndex.length : positions.count;
  const kept = [];
  for (let face = 0; face < triangleCount; face += 3) {
    const a = sourceIndex ? sourceIndex[face] : face;
    const b = sourceIndex ? sourceIndex[face + 1] : face + 1;
    const c = sourceIndex ? sourceIndex[face + 2] : face + 2;
    const ra = cellOf[a];
    const rb = cellOf[b];
    const rc = cellOf[c];
    if (ra === rb || rb === rc || ra === rc) continue;
    kept.push(ra, rb, rc);
  }

  const next = new THREE.BufferGeometry();
  next.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(representatives, 3),
  );
  if (kept.length) next.setIndex(kept);
  next.computeVertexNormals();
  mesh.geometry = next;
  return mesh;
}

/**
 * Generate LOD levels for a model. Level 0 is the untouched original; each
 * later level is a deeper vertex-clustering decimation. Every level owns its
 * geometry, so switching or disposing one never harms the others.
 */
export function generateLOD(group, levels = 3) {
  const lodLevels = [];
  const thresholds = [0, 0.06, 0.15, 0.3];

  for (let i = 0; i < Math.max(1, Math.min(4, levels)); i++) {
    const lodGroup = cloneModelDeep(group);
    const threshold = thresholds[i] ?? 0.3;
    if (threshold > 0) {
      lodGroup.traverse((child) => {
        if (child.isMesh) decimateMesh(child, threshold);
      });
    }
    const stats = getAssetStats(lodGroup);
    lodLevels.push({
      level: i,
      triangles: stats.triangles,
      vertices: stats.vertices,
      parts: stats.parts,
      drawCalls: stats.drawCalls,
      stats,
      mesh: lodGroup,
    });
  }

  return lodLevels;
}

/**
 * Export a Three.js object to GLB format.
 * @param {object} options - { upAxis: "Y" | "Z", scale: number }
 */
export function exportGLB(object, options = {}) {
  const { upAxis = "Y", scale = 1, animations } = options;
  // GLTFExporter converts the up axis itself; only the scale needs a wrapper.
  const wrapped = scale !== 1 ? wrapForExport(object, options, false) : object;
  ensureNodeFileReader();
  ensureNodeCanvasPolyfill();
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      wrapped,
      (result) => resolve(result),
      (error) => reject(error),
      {
        binary: true,
        upAxis,
        animations: animations || wrapped.animations || [],
      },
    );
  });
}

/**
 * Export a Three.js object to JSON glTF format. Buffers and images are
 * embedded as data URIs so one file stays portable between engines and web
 * viewers.
 * @param {object} options - { upAxis: "Y" | "Z", scale: number }
 */
export function exportGLTF(object, options = {}) {
  const { upAxis = "Y", scale = 1, animations } = options;
  const wrapped = scale !== 1 ? wrapForExport(object, options, false) : object;
  ensureNodeFileReader();
  ensureNodeCanvasPolyfill();
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      wrapped,
      (result) =>
        resolve(
          typeof result === "string" ? result : JSON.stringify(result, null, 2),
        ),
      (error) => reject(error),
      {
        binary: false,
        upAxis,
        animations: animations || wrapped.animations || [],
      },
    );
  });
}

/**
 * Export a Three.js object to OBJ format.
 */
export function exportOBJ(object, options = {}) {
  // OBJ has no axis metadata, so rotate the wrapper for Z-up engines.
  const wrapped = wrapForExport(object, options, true);
  const exporter = new OBJExporter();
  return exporter.parse(wrapped);
}

/**
 * Wrap a model for export without mutating it: apply the requested scale and
 * rotate the whole graph so a Z-up engine reads it upright.
 */
function wrapForExport(
  object,
  { upAxis = "Y", scale = 1 } = {},
  rotateZup = false,
) {
  if (scale === 1 && (!rotateZup || upAxis === "Y")) return object;
  const wrapper = new THREE.Group();
  wrapper.name = `${object.name || "model"}-export`;
  wrapper.add(object);
  wrapper.animations = object.animations || [];
  wrapper.scale.setScalar(scale);
  if (rotateZup && upAxis === "Z") wrapper.rotation.x = -Math.PI / 2;
  return wrapper;
}

/**
 * GLTFExporter reads Blobs through the browser FileReader API. Node has Blob
 * but no FileReader, so install a tiny polyfill that keeps binary export
 * working for CLI tests and server-side pipelines.
 */
function ensureNodeFileReader() {
  if (typeof globalThis.FileReader !== "undefined") return;
  class BlobFileReader {
    constructor() {
      this.result = null;
      this.onloadend = null;
    }

    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then((buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        this.result = `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
        this.onloadend?.();
      });
    }
  }
  globalThis.FileReader = BlobFileReader;
}

/**
 * Count triangles in a Three.js object.
 */
export function countTriangles(object) {
  let count = 0;
  object.traverse((child) => {
    if (child.isMesh && child.geometry) {
      const geo = child.geometry;
      if (geo.index) {
        count += geo.index.count / 3;
      } else if (geo.attributes.position) {
        count += geo.attributes.position.count / 3;
      }
    }
  });
  return Math.floor(count);
}

/**
 * Count vertices in a Three.js object. Useful for engine poly budgets where
 * draw calls and vertex density matter as much as the triangle count.
 */
export function countVertices(object) {
  let count = 0;
  object.traverse((child) => {
    if (child.isMesh && child.geometry?.attributes.position) {
      count += child.geometry.attributes.position.count;
    }
  });
  return count;
}

/**
 * Mesh budget for a generated asset: triangles, vertices, mesh parts and the
 * draw calls the engine will need. Game teams can read this before export.
 */
export function getAssetStats(object) {
  const stats = { triangles: 0, vertices: 0, parts: 0, drawCalls: 0 };
  object.traverse((child) => {
    if (!child.isMesh) return;
    stats.parts += 1;
    stats.drawCalls += 1;
    const geo = child.geometry;
    if (!geo?.attributes.position) return;
    stats.vertices += geo.attributes.position.count;
    stats.triangles += geo.index
      ? geo.index.count / 3
      : geo.attributes.position.count / 3;
  });
  stats.triangles = Math.floor(stats.triangles);
  return stats;
}

/**
 * Fit a collision primitive around a generated model. The dimensions are
 * slightly shrunk so physics proxies sit just inside the visible mesh and do
 * not catch stray edges in the game engine.
 * @param {THREE.Object3D} model - Generated model
 * @param {string} shape - "box", "sphere", "capsule", "cylinder" or "mesh"
 * @returns {object|null} Collision metadata, or null for "none"
 */
export function computeCollider(model, shape = "auto") {
  const resolved =
    shape === "auto" || shape == null
      ? getColliderShape(model.name || "")
      : shape;
  if (resolved === "none") return null;

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const rawSize = box.getSize(new THREE.Vector3());
  const round = (value) => Math.round(value * 10000) / 10000;
  const size = rawSize.clone().multiplyScalar(0.92).toArray().map(round);
  const maxSize = Math.max(...size, 0.001);

  if (resolved === "sphere") {
    return {
      shape: "sphere",
      center: center.toArray().map(round),
      radius: round(maxSize / 2),
    };
  }

  if (resolved === "capsule") {
    const radius = Math.max(size[0], size[2]) / 2;
    return {
      shape: "capsule",
      axis: "Y",
      center: center.toArray().map(round),
      radius: round(radius),
      height: round(Math.max(size[1], radius * 2)),
    };
  }

  if (resolved === "cylinder") {
    return {
      shape: "cylinder",
      axis: "Y",
      center: center.toArray().map(round),
      radius: round(Math.max(size[0], size[2]) / 2),
      height: round(size[1]),
    };
  }

  if (resolved === "box") {
    return {
      shape: "box",
      center: center.toArray().map(round),
      size: size.map(round),
    };
  }

  return {
    shape: "mesh",
    center: center.toArray().map(round),
    size: size.map(round),
  };
}

/**
 * Build a small GLB-exportable visual for a collision primitive. Mesh
 * colliders do not need a separate file; engines use the model itself.
 * @param {object} collider - Collision metadata from computeCollider
 * @returns {THREE.Group|null} Named collider scene, or null for mesh/none
 */
export function buildColliderModel(collider) {
  if (!collider || collider.shape === "mesh" || collider.shape === "none") {
    return null;
  }

  let geometry = null;
  if (collider.shape === "box") {
    const [w, h, d] = collider.size;
    geometry = new THREE.BoxGeometry(w, h, d);
  } else if (collider.shape === "sphere") {
    geometry = new THREE.SphereGeometry(collider.radius, 24, 12);
  } else if (collider.shape === "capsule") {
    const straight = Math.max(0, collider.height - collider.radius * 2);
    geometry = new THREE.CapsuleGeometry(collider.radius, straight, 6, 12);
  } else if (collider.shape === "cylinder") {
    geometry = new THREE.CylinderGeometry(
      collider.radius,
      collider.radius,
      collider.height,
      16,
    );
  }
  if (!geometry) return null;

  const group = new THREE.Group();
  group.name = "AI3D-Collider";
  const material = new THREE.MeshBasicMaterial({
    color: 0x00e676,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "AI3D-Collider";
  mesh.userData.colliderShape = collider.shape;
  if (collider.center) mesh.position.set(...collider.center);
  group.add(mesh);
  return group;
}

/**
 * Render a small WebGL thumbnail of a model to a PNG data URL.
 * Returns null when WebGL is unavailable so callers can fall back.
 */
export function renderAssetThumbnail(model, width = 120, height = 90) {
  try {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
    keyLight.position.set(1.5, 2.2, 2.6);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.55);
    fillLight.position.set(-2.2, 0.6, -1.8);
    scene.add(fillLight);

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.01, 20);
    const box = new THREE.Box3().setFromObject(model);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.001);
    camera.position.set(
      sphere.center.x + radius * 1.35,
      sphere.center.y + radius * 0.7,
      sphere.center.z + radius * 2.1,
    );
    camera.near = Math.max(0.001, radius * 0.05);
    camera.far = radius * 20;
    camera.lookAt(sphere.center);

    const preview = cloneModelDeep(model);
    scene.add(preview);
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");

    preview.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
    renderer.dispose();
    return dataUrl;
  } catch {
    return null;
  }
}

/**
 * Get asset type information.
 */
export function getAssetTypeInfo(type) {
  const info = ASSET_TYPES[type] || ASSET_TYPES.cube;
  return {
    ...info,
    collider: getColliderShape(type),
    animations: ANIMATION_PRESETS[type] || [],
  };
}

/**
 * Get all available asset types.
 */
export function getAssetTypes() {
  return Object.keys(ASSET_TYPES);
}

/**
 * Normalise an asset id/type into a filesystem-safe slug for pack paths.
 */
function assetSlug(value) {
  const slug = String(value || "asset")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "asset";
}

/**
 * Keep budget fields in one shape whether a caller supplied current stats or
 * an older record that predates one of the counters.
 */
function normaliseAssetStats(stats = {}) {
  return {
    triangles: Number(stats.triangles) || 0,
    vertices: Number(stats.vertices) || 0,
    parts: Number(stats.parts) || 0,
    drawCalls: Number(stats.drawCalls) || 0,
  };
}

/**
 * Copy different generations of LOD records into the manifest shape. New LODs
 * carry both flat counters and a stats block; older saved records carry only
 * triangles, which still exports without inventing measurements.
 */
function lodBudgetRecord(lod, slug) {
  const stats = normaliseAssetStats(lod.stats || lod);
  return {
    level: lod.level,
    triangles: stats.triangles,
    vertices: stats.vertices,
    parts: stats.parts,
    drawCalls: stats.drawCalls,
    file: slug ? `models/${slug}/LOD${lod.level}.glb` : undefined,
  };
}

/**
 * Turn a PNG data URL into raw bytes, or null when no thumbnail was given.
 */
function pngDataUrlToBytes(dataUrl) {
  if (!dataUrl) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const base64 = dataUrl.slice(comma + 1);
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sanitiseAssetName(name, fallback) {
  if (!name) return fallback;
  const cleaned = String(name)
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

function godotString(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, " ");
}

function godotSceneFile(record, slug) {
  return (
    "[gd_scene load_steps=2 format=3]\n\n" +
    `[ext_resource type="PackedScene" path="res://models/${slug}/LOD0.glb" id="1_lod0"]\n\n` +
    `[node name="${godotString(record.name)}" instance=ExtResource("1_lod0")]\n`
  );
}

function engineReadme(preset, records) {
  const count = records.length;
  let heading =
    "# AI3D game engine pack\n" +
    "\u8fd9\u4e2a\u5305\u5305\u542b\u53ef\u76f4\u63a5\u5bfc\u5165\u4e3b\u6d41\u6e38\u620f\u5f15\u64ce\u7684\u6a21\u578b\u3001\u7f29\u7565\u56fe\u548c\u6e05\u5355\u3002\n" +
    "\n" +
    `Engine preset: ${preset.name} (${preset.upAxis}-up, ${preset.scale}x, ${preset.units})\n` +
    `Assets: ${count}\n`;

  const scenes = records.filter(
    (record) => record.kind === "scene" && record.scene,
  );
  if (scenes.length > 0) {
    heading += `Scenes: ${scenes.length}\n`;
    for (const scene of scenes) {
      const props = Array.isArray(scene.scene.props) ? scene.scene.props : [];
      heading +=
        `\n## ${scene.name}\n` +
        `Kit: ${scene.scene.kit} - Seed: ${scene.scene.seed ?? "random"} - Props: ${props.length}\n`;
      if (props.length > 0) {
        heading +=
          props
            .map(
              (prop) => `- ${prop.type}${prop.size ? ` (${prop.size}x)` : ""}`,
            )
            .join("\n") + "\n";
      }
    }
  }

  const unity =
    "\n## Unity\n" +
    "1. Open your project and drag `models/` into the Project window, or use Assets > Import New Asset.\n" +
    "2. Select each imported GLB and set Scale Factor to 1; the pack is already in meters, Y-up.\n" +
    "3. LOD0 is the highest quality and LOD3 the lowest; add the GLBs to a LOD Group if present.\n";
  const godot =
    "\n## Godot\n" +
    "1. Copy this pack into the project root (`res://`) so its paths stay intact.\n" +
    "2. Open or drag `scenes/*.tscn`; each wrapper instances the LOD0 GLB for that asset.\n" +
    "3. Instances are Y-up meters, matching the default 3D scene.\n" +
    "4. Use the generated thumbnail in `thumbnails/` for custom editor icons.\n";
  const unreal =
    "\n## Unreal\n" +
    "1. Drag `models/` into the Content Browser; Unreal imports GLB as a static mesh asset.\n" +
    "2. The pack is Z-up with a 100x scale so one generated unit reads as one centimeter.\n" +
    "3. Set the World Transform scale to 1 and verify the pivot before placing it in a level.\n";

  const china =
    "\n---\n" +
    "\u8fd9\u4e2a\u5305\u7531 AI3D \u751f\u6210\uff0c\u4e3b\u6d41\u6e38\u620f\u5f15\u64ce\u5747\u53ef\u76f4\u63a5\u5bfc\u5165\u3002";

  if (preset.id === "unreal") return `${heading}${unreal}${china}`;
  if (preset.id === "godot") return `${heading}${godot}${china}`;
  return `${heading}${unity}${china}`;
}

/** Build the manifest block for a composed scene pack. */
function buildSceneRecord(asset) {
  return {
    kit: asset.type,
    seed: asset.seed ?? null,
    groundColor: asset.scene?.groundColor ?? null,
    quality: asset.scene?.quality ?? null,
    spacing: asset.scene?.spacing ?? asset.theme?.spacing ?? 1,
    groundPadding:
      asset.scene?.groundPadding ?? asset.theme?.groundPadding ?? 0.6,
    propScale: asset.scene?.propScale ?? asset.theme?.propScale ?? 1,
    theme: asset.scene?.theme ||
      (asset.theme ?? null) || {
        style: asset.style ?? "lowpoly",
        color: asset.color || null,
        material: asset.material || null,
        texture: asset.texture ?? "auto",
        textureStrength: asset.textureStrength ?? 0.8,
      },
    props: Array.isArray(asset.scene?.props) ? asset.scene.props : [],
  };
}

/**
 * Assemble a game engine import pack from already-converted files. The GLB
 * conversion is separate so tests and CLI pipelines can hand in bytes without
 * needing WebGL; callers that want thumbnails should pass PNG data URLs.
 * @param {object} options
 * @returns {Uint8Array} zipped pack contents
 */
export function buildGamePackFiles({
  assets,
  engine = "unity",
  exportedAt = new Date().toISOString(),
}) {
  const preset = getEnginePreset(engine);
  const records = assets.map((asset) => {
    const slug = assetSlug(asset.id || asset.type);
    const name = sanitiseAssetName(asset.name, slug);
    const isScene = asset.kind === "scene";
    const stats = normaliseAssetStats(asset.stats);
    return {
      id: asset.id || `${asset.type}-${slug}`,
      name,
      kind: isScene ? "scene" : asset.kind || "asset",
      type: asset.type,
      animations: Array.isArray(asset.animations) ? asset.animations : [],
      favorite: asset.favorite ?? false,
      seed: asset.seed ?? null,
      size: asset.size ?? 1,
      segments: asset.segments ?? 16,
      style: asset.style ?? "lowpoly",
      color: asset.color || null,
      material: asset.material || null,
      texture: asset.texture || null,
      textureStrength: asset.textureStrength ?? 0.8,
      tags: isScene
        ? Array.isArray(asset.tags)
          ? asset.tags
          : ["scene", asset.type]
        : getAssetTags(asset.type),
      scene: isScene ? buildSceneRecord(asset) : null,
      stats,
      collision: asset.collision || null,
      lodLevels: asset.lodLevels
        ? asset.lodLevels.map((lod) => lodBudgetRecord(lod, slug))
        : null,
      engine: {
        id: preset.id,
        name: preset.name,
        upAxis: preset.upAxis,
        scale: preset.scale,
        units: preset.units,
      },
      files: {
        model: `models/${slug}/LOD0.glb`,
        lod: (asset.lodLevels || []).map((lod) => lodBudgetRecord(lod, slug)),
        scene:
          preset.id === "godot" && asset.glbBytes
            ? `scenes/${slug}.tscn`
            : null,
        thumbnail: asset.thumbnailBytes ? `thumbnails/${slug}.png` : null,
        collider: asset.colliderBytes ? `colliders/${slug}.glb` : null,
        textures: asset.textures
          ? ["albedo", "normal", "roughness", "metalness"]
              .filter((name) => asset.textures[name])
              .map((name) => `textures/${slug}/${name}.png`)
          : null,
      },
    };
  });

  const files = {};
  const encoder = new TextEncoder();
  files["manifest.json"] = encoder.encode(
    JSON.stringify(
      {
        schema: "ai3d-game-pack",
        version: "1.0",
        exportedAt,
        engine: {
          id: preset.id,
          name: preset.name,
          upAxis: preset.upAxis,
          scale: preset.scale,
          units: preset.units,
        },
        count: records.length,
        budget: records.reduce(
          (total, record) => ({
            triangles: total.triangles + record.stats.triangles,
            vertices: total.vertices + record.stats.vertices,
            parts: total.parts + record.stats.parts,
            drawCalls: total.drawCalls + record.stats.drawCalls,
          }),
          { triangles: 0, vertices: 0, parts: 0, drawCalls: 0 },
        ),
        assets: records,
      },
      null,
      2,
    ),
  );
  files["README.md"] = encoder.encode(engineReadme(preset, records));

  for (let index = 0; index < assets.length; index++) {
    const asset = assets[index];
    const record = records[index];
    const slug = assetSlug(asset.id || asset.type);
    if (asset.glbBytes) files[`models/${slug}/LOD0.glb`] = asset.glbBytes;
    if (preset.id === "godot" && asset.glbBytes) {
      files[`scenes/${slug}.tscn`] = encoder.encode(
        godotSceneFile(record, slug),
      );
    }
    for (const lod of asset.lodLevels || []) {
      if (lod.glbBytes) {
        files[`models/${slug}/LOD${lod.level}.glb`] = lod.glbBytes;
      }
    }
    if (asset.thumbnailBytes) {
      files[`thumbnails/${slug}.png`] = asset.thumbnailBytes;
    }
    if (asset.colliderBytes) {
      files[`colliders/${slug}.glb`] = asset.colliderBytes;
    }
    if (asset.textures) {
      for (const [name, bytes] of Object.entries(asset.textures)) {
        files[`textures/${slug}/${name}.png`] = bytes;
      }
    }
  }

  return zipSync(files, { level: 6 });
}

/**
 * Export one Three.js model as a game engine import pack. The GLB conversion
 * reuses the engine preset (Unity/Godot: Y-up meters; Unreal: Z-up at 100x),
 * so the model reads at the right scale and orientation on import.
 * @param {object} options
 * @returns {Promise<Uint8Array>} zipped pack contents
 */
export async function exportGamePack({
  model,
  asset,
  engine = "unity",
  withLod = false,
  thumbnailDataUrl = null,
  collision = "auto",
  animation = "auto",
  exportedAt = new Date().toISOString(),
}) {
  const preset = getEnginePreset(engine);
  const options = { upAxis: preset.upAxis, scale: preset.scale };
  const isScene = asset.kind === "scene";
  const textureInfo = isScene
    ? null
    : getAssetTextureInfo(asset, asset.seed ?? null);
  const sceneMeta = isScene
    ? {
        kit: asset.type,
        seed: asset.seed ?? null,
        groundColor:
          asset.scene?.groundColor ?? model.userData?.groundColor ?? null,
        quality: asset.scene?.quality ?? model.userData?.theme?.quality ?? null,
        spacing: asset.scene?.spacing ?? model.userData?.theme?.spacing ?? 1,
        groundPadding:
          asset.scene?.groundPadding ??
          model.userData?.theme?.groundPadding ??
          0.6,
        propScale:
          asset.scene?.propScale ?? model.userData?.theme?.propScale ?? 1,
        theme: asset.scene?.theme ||
          model.userData?.theme || {
            style: asset.style ?? "lowpoly",
            color: asset.color || null,
            material: asset.material || null,
            texture: asset.texture ?? "auto",
            textureStrength: asset.textureStrength ?? 0.8,
          },
        props: Array.isArray(asset.scene?.props)
          ? asset.scene.props
          : Array.isArray(model.userData?.propList)
            ? model.userData.propList
            : [],
      }
    : null;
  const selectedAnimations = selectAnimations(model, animation);
  const animationInfo = selectedAnimations.map((clip) => ({
    name: clip.name,
    duration: Math.round(clip.duration * 100) / 100,
    tracks: clip.tracks.length,
  }));
  const lodLevels = [];
  let collisionInfo = null;
  let colliderBytes = null;

  const collisionShape =
    collision && collision !== "none" && !(isScene && collision === "auto")
      ? collision === "auto"
        ? getColliderShape(asset.type)
        : collision
      : null;
  if (collisionShape) {
    collisionInfo = computeCollider(model, collisionShape);
    if (collisionInfo?.shape !== "mesh") {
      const colliderModel = buildColliderModel(collisionInfo);
      if (colliderModel) {
        colliderBytes = new Uint8Array(await exportGLB(colliderModel, options));
      }
    }
  }

  if (withLod) {
    const lods = generateLOD(model, 4);
    for (const lod of lods) {
      lod.mesh.animations = selectedAnimations;
      const glbBytes = new Uint8Array(
        await exportGLB(lod.mesh, {
          ...options,
          animations: selectedAnimations,
        }),
      );
      lodLevels.push({
        level: lod.level,
        triangles: lod.triangles,
        vertices: lod.vertices,
        parts: lod.parts,
        drawCalls: lod.drawCalls,
        stats: lod.stats,
        glbBytes,
      });
    }
  }

  const glbBytes =
    lodLevels.length > 0
      ? lodLevels[0].glbBytes
      : new Uint8Array(
          await exportGLB(model, {
            ...options,
            animations: selectedAnimations,
          }),
        );
  if (lodLevels.length === 0) {
    const stats = getAssetStats(model);
    lodLevels.push({
      level: 0,
      triangles: stats.triangles,
      vertices: stats.vertices,
      parts: stats.parts,
      drawCalls: stats.drawCalls,
      stats,
      glbBytes,
    });
  }

  const thumbnailBytes = pngDataUrlToBytes(thumbnailDataUrl);
  const packAsset = {
    ...asset,
    kind: isScene ? "scene" : asset.kind || "asset",
    scene: sceneMeta,
    stats: getAssetStats(model),
    lodLevels,
    glbBytes,
    thumbnailBytes,
    animations: animationInfo,
    collision: collisionInfo,
    colliderBytes,
    ...(textureInfo || {}),
  };
  return buildGamePackFiles({
    assets: [packAsset],
    engine,
    exportedAt,
  });
}

/**
 * Export an asset manifest for game engine import.
 * JSON format includes full metadata; CSV is a flat table for spreadsheets.
 * @param {Array} assets - Asset records from the library or variant batch
 * @param {string} format - "json" or "csv"
 * @returns {string} Manifest content
 */
export function exportAssetManifest(assets, format = "json") {
  const records = assets.map((asset, index) => {
    const isScene = asset.kind === "scene";
    return {
      id: asset.id || `asset-${index}`,
      name: asset.name || null,
      kind: isScene ? "scene" : asset.kind || "asset",
      type: asset.type,
      favorite: asset.favorite ?? false,
      seed: asset.seed ?? null,
      size: asset.size ?? 1,
      segments: asset.segments ?? 16,
      style: asset.style ?? "lowpoly",
      color: asset.color || null,
      roughness: asset.material?.roughness ?? null,
      metalness: asset.material?.metalness ?? null,
      emissive: asset.material?.emissive ?? null,
      texture: asset.texture ?? "auto",
      textureStrength: asset.textureStrength ?? 0.8,
      scene: isScene ? asset.scene || null : null,
      triangles: asset.stats?.triangles ?? null,
      vertices: asset.stats?.vertices ?? null,
      parts: asset.stats?.parts ?? null,
      drawCalls: asset.stats?.drawCalls ?? null,
      tags: isScene
        ? Array.isArray(asset.tags)
          ? asset.tags
          : ["scene", asset.type]
        : getAssetTags(asset.type),
      lodLevels: asset.lodLevels
        ? asset.lodLevels.map((lod) => {
            const stats = normaliseAssetStats(lod.stats || lod);
            return {
              level: lod.level,
              triangles: stats.triangles,
              vertices: stats.vertices,
              parts: stats.parts,
              drawCalls: stats.drawCalls,
            };
          })
        : null,
    };
  });

  if (format === "csv") {
    const headers = [
      "id",
      "name",
      "type",
      "favorite",
      "seed",
      "size",
      "segments",
      "style",
      "color",
      "kind",
      "texture",
      "textureStrength",
      "roughness",
      "metalness",
      "emissive",
      "triangles",
      "vertices",
      "parts",
      "drawCalls",
      "tags",
      "lodLevels",
    ];
    const escape = (value) => {
      if (value === null || value === undefined) return "";
      const str =
        typeof value === "object" ? JSON.stringify(value) : String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const rows = records.map((r) => headers.map((h) => escape(r[h])).join(","));
    return [headers.join(","), ...rows].join("\n");
  }

  return JSON.stringify(
    {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      count: records.length,
      assets: records,
    },
    null,
    2,
  );
}
