import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { zipSync } from "fflate";
import {
  createProceduralTextures,
  TEXTURE_SIZES,
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
  gate: { name: "Gate", parts: ["posts", "crossbar", "lattice", "handle"] },
  wagon: { name: "Wagon", parts: ["bed", "wheels", "tongue", "cargo"] },
  cannon: { name: "Cannon", parts: ["barrel", "carriage", "wheels", "rammer"] },
  grave: { name: "Grave", parts: ["mound", "stone", "cross", "flowers"] },
  ladder: { name: "Ladder", parts: ["rails", "rungs", "tips"] },
  candelabra: {
    name: "Candelabra",
    parts: ["base", "stem", "arms", "candles"],
  },
  anvil: { name: "Anvil", parts: ["base", "body", "horn", "face"] },
  bookshelf: { name: "Bookshelf", parts: ["frame", "shelves", "books"] },
  cauldron: { name: "Cauldron", parts: ["pot", "legs", "rim", "handles"] },
  throne: { name: "Throne", parts: ["seat", "back", "arms", "base"] },
  bench: { name: "Bench", parts: ["seat", "legs", "backrest"] },
  lantern: { name: "Lantern", parts: ["frame", "glass", "candle", "hook"] },
  table: { name: "Table", parts: ["top", "apron", "legs"] },
  chair: { name: "Chair", parts: ["seat", "back", "legs"] },
  bed: { name: "Bed", parts: ["frame", "mattress", "pillow", "blanket"] },
  chandelier: {
    name: "Chandelier",
    parts: ["chain", "core", "arms", "candles"],
  },
  armor_stand: {
    name: "Armor Stand",
    parts: ["base", "pole", "body", "arms", "helmet"],
  },
  skeleton: { name: "Skeleton", parts: ["skull", "ribcage", "arms", "legs"] },
  bread: { name: "Bread", parts: ["loaf", "score", "board"] },
  pie: { name: "Pie", parts: ["dish", "filling", "lattice"] },
  meat_leg: { name: "Meat Leg", parts: ["meat", "bone", "wrap"] },
  hay_bale: { name: "Hay Bale", parts: ["bale", "bands", "straw"] },
  rope_coil: { name: "Rope Coil", parts: ["coil", "loops", "tail"] },
  bucket: { name: "Bucket", parts: ["body", "handle", "rivets"] },
  windmill: {
    name: "Windmill",
    parts: ["tower", "cap", "sails", "door"],
  },
  coin_pile: { name: "Coin Pile", parts: ["mound", "coins", "glints"] },
  minecart: { name: "Minecart", parts: ["bed", "wheels", "axles", "tongue"] },
  berry_bush: { name: "Berry Bush", parts: ["crown", "berries", "leaves"] },
  stone_coffin: { name: "Stone Coffin", parts: ["body", "lid", "cross"] },
  portcullis: { name: "Portcullis", parts: ["frame", "bars", "winch"] },
  cage: { name: "Cage", parts: ["frame", "bars", "door", "lock"] },
  bone_pile: { name: "Bone Pile", parts: ["mound", "bones", "skull"] },
  cobweb: { name: "Cobweb", parts: ["hub", "strands", "threads"] },
  lever: { name: "Lever", parts: ["base", "post", "handle", "weight"] },
  urn: { name: "Urn", parts: ["body", "rim", "base"] },
  mummy: { name: "Mummy", parts: ["body", "arms", "head"] },
  beehive: { name: "Beehive", parts: ["body", "cap", "base", "bees"] },
  wheat_sheaf: { name: "Wheat Sheaf", parts: ["stalks", "band", "heads"] },
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
  wall: { name: "Wall", parts: ["base", "body", "cap", "crenel"] },
  wall_window: { name: "Wall with Window", parts: ["wall", "frame", "glass"] },
  wall_door: { name: "Wall with Door", parts: ["wall", "frame", "threshold"] },
  wall_corner: { name: "Corner Wall", parts: ["base", "body", "cap"] },
  floor: { name: "Floor Tile", parts: ["slab", "joints", "kerb"] },
  stairs: { name: "Stairs", parts: ["steps", "stringers"] },
  arch: { name: "Arch", parts: ["plinth", "columns", "arch"] },
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
  gate: ["building", "structure", "defense", "outdoor"],
  wagon: ["vehicle", "transport", "outdoor", "wood"],
  cannon: ["weapon", "siege", "defense", "metal"],
  grave: ["item", "decoration", "outdoor"],
  ladder: ["item", "tool", "structure", "outdoor"],
  candelabra: ["item", "light", "decoration", "indoor"],
  anvil: ["item", "tool", "forge", "metal"],
  bookshelf: ["item", "furniture", "indoor", "wood"],
  cauldron: ["item", "container", "cooking", "metal"],
  throne: ["item", "furniture", "decoration", "indoor"],
  bench: ["item", "furniture", "outdoor", "wood"],
  lantern: ["item", "light", "decoration", "indoor"],
  table: ["item", "furniture", "indoor", "wood"],
  chair: ["item", "furniture", "indoor", "wood"],
  bed: ["item", "furniture", "indoor", "wood"],
  chandelier: ["item", "light", "decoration", "indoor", "metal"],
  armor_stand: ["item", "decoration", "armor", "indoor", "metal"],
  skeleton: ["creature", "enemy", "undead", "decoration"],
  bread: ["item", "food", "provision", "indoor"],
  pie: ["item", "food", "provision", "indoor"],
  meat_leg: ["item", "food", "provision", "outdoor"],
  hay_bale: ["item", "terrain", "village", "outdoor"],
  rope_coil: ["item", "tool", "adventure", "outdoor"],
  bucket: ["item", "tool", "container", "outdoor"],
  windmill: ["building", "structure", "village", "outdoor"],
  coin_pile: ["item", "treasure", "collectible", "indoor"],
  minecart: ["vehicle", "transport", "mine", "metal"],
  berry_bush: ["nature", "vegetation", "collectible", "outdoor"],
  stone_coffin: ["dungeon", "structure", "funeral", "indoor"],
  portcullis: ["structure", "defense", "dungeon", "metal"],
  cage: ["structure", "container", "dungeon", "metal"],
  bone_pile: ["item", "dungeon", "decoration", "outdoor"],
  cobweb: ["item", "dungeon", "decoration", "indoor"],
  lever: ["item", "mechanism", "dungeon", "metal"],
  urn: ["item", "container", "funeral", "indoor"],
  mummy: ["creature", "undead", "dungeon", "animated"],
  beehive: ["structure", "nature", "village", "outdoor"],
  wheat_sheaf: ["nature", "vegetation", "village", "outdoor"],
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
  wall: ["building", "modular", "structure", "indoor"],
  wall_window: ["building", "modular", "structure", "indoor"],
  wall_door: ["building", "modular", "structure", "indoor"],
  wall_corner: ["building", "modular", "structure", "indoor"],
  floor: ["building", "modular", "structure", "indoor"],
  stairs: ["building", "modular", "structure", "indoor"],
  arch: ["building", "modular", "structure", "indoor"],
};

/* Modular kit pieces. A wall, a floor tile and a stair run only earn their
   place in a game level if they line up: a wall four cells long has to be
   exactly four cells long, and the next piece has to begin where this one
   ends. So these pieces are built straight from real-world dimensions -
   cell size times cell count - instead of being scaled to a requested size,
   and they keep their own base on the ground. The panel, the prompt parser
   and the normaliser below all read the same numbers, so nothing has to
   translate one convention into another. */
export const MODULAR_TYPES = [
  "wall",
  "wall_window",
  "wall_door",
  "wall_corner",
  "floor",
  "stairs",
  "arch",
];

const MODULAR_DEFAULTS = {
  cell: 2,
  cells: 4,
  height: 2,
  depth: 1,
  thickness: 0.2,
  steps: 6,
  crenel: false,
};

/* The builders assume sane proportions: a cell large enough to stand inside,
   a run of cells a wall can actually tile, and steps a stair can climb. The
   values are clamped rather than rejected so a stray keystroke still produces
   a usable piece. */
const MODULAR_LIMITS = {
  cell: [0.25, 20],
  cells: [1, 24],
  height: [0.5, 16],
  depth: [1, 16],
  thickness: [0.05, 1],
  steps: [2, 24],
};

export function isModularType(type) {
  return MODULAR_TYPES.includes(type);
}

/** Clamp panel values into the ranges the builders rely on. */
export function normalizeModularOptions(options = {}) {
  const value = (key) => {
    const numeric = Number(options?.[key]);
    if (!Number.isFinite(numeric)) return MODULAR_DEFAULTS[key];
    const [min, max] = MODULAR_LIMITS[key];
    return Math.min(max, Math.max(min, numeric));
  };
  const whole = (key) => Math.round(value(key));
  return {
    cell: value("cell"),
    cells: whole("cells"),
    height: value("height"),
    depth: whole("depth"),
    thickness: value("thickness"),
    steps: whole("steps"),
    crenel: !!options?.crenel,
  };
}

/* Real-world sizing. `size` is expressed in the chosen unit, but the geometry
   is always built in metres because every engine preset below assumes metres
   at export time. A caller that leaves the unit out keeps the old behaviour,
   where the number was never converted at all. */
const UNIT_METRES = {
  m: 1,
  cm: 0.01,
  mm: 0.001,
  ft: 0.3048,
  in: 0.0254,
};

/* Where the model's origin sits once it is sized. A character has to stand on
   the origin so it plants on a floor; a wall segment is built from its base
   too; a prop is usually kept centred. */
export const PIVOTS = ["center", "ground", "bottom", "top"];
export const FIT_AXES = ["max", "height", "width", "depth"];

export const UNIT_IDS = Object.keys(UNIT_METRES);

export function unitToMetres(unit) {
  return UNIT_METRES[unit] ?? 1;
}

/**
 * Convert a size in the caller's unit into metres. Unknown units fall back to
 * metres so an old record without a unit still loads at the size it stored.
 */
export function sizeToMetres(size, unit = "m") {
  return size * unitToMetres(unit);
}

/** Pick the bounding-box dimension the requested size should fill. */
export function sizeExtent(box, fitAxis = "max") {
  const dims = [
    box.max.x - box.min.x,
    box.max.y - box.min.y,
    box.max.z - box.min.z,
  ];
  const named = { width: dims[0], height: dims[1], depth: dims[2] };
  const extent = fitAxis === "max" ? Math.max(...dims) : named[fitAxis];
  return Number.isFinite(extent) ? extent : 0;
}

/** Offset that moves the box so the requested pivot lands on the origin. */
export function pivotOffset(box, pivot = "center") {
  const center = box.getCenter(new THREE.Vector3());
  const offset = center.clone().negate();
  if (pivot === "ground" || pivot === "bottom") offset.y = -box.min.y;
  else if (pivot === "top") offset.y = -box.max.y;
  return offset;
}

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
  gate: "box",
  wagon: "box",
  cannon: "box",
  grave: "box",
  ladder: "box",
  candelabra: "cylinder",
  anvil: "box",
  bookshelf: "box",
  cauldron: "cylinder",
  throne: "box",
  bench: "box",
  lantern: "cylinder",
  table: "box",
  chair: "box",
  bed: "box",
  chandelier: "cylinder",
  armor_stand: "capsule",
  skeleton: "capsule",
  bread: "box",
  pie: "cylinder",
  meat_leg: "capsule",
  hay_bale: "box",
  rope_coil: "cylinder",
  bucket: "cylinder",
  windmill: "cylinder",
  coin_pile: "box",
  minecart: "box",
  berry_bush: "capsule",
  stone_coffin: "box",
  portcullis: "box",
  cage: "box",
  bone_pile: "capsule",
  cobweb: "box",
  lever: "box",
  urn: "cylinder",
  mummy: "capsule",
  beehive: "capsule",
  wheat_sheaf: "capsule",
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
  wall: "box",
  wall_window: "box",
  wall_door: "box",
  wall_corner: "box",
  floor: "box",
  stairs: "mesh",
  arch: "mesh",
};

// Animation presets target the named parts every animated asset already
// builds, so the same clips work on generated characters, monsters, dragons
// and animated props without a separate skeleton rig.
const ANIMATION_PRESETS = {
  character: ["idle", "walk", "attack"],
  monster: ["idle", "walk", "attack"],
  dragon: ["idle", "fly", "attack"],
  chest: ["open"],
  campfire: ["flicker"],
  torch: ["flicker"],
  brazier: ["flicker"],
  lantern: ["flicker"],
  chandelier: ["sway"],
  minecart: ["spin"],
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
  stone_coffin: ["open"],
  portcullis: ["raise"],
  cobweb: ["sway"],
  lever: ["pull"],
  mummy: ["lurch"],
  beehive: ["buzz"],
};

// Asset types whose exports carry a real glTF skeleton instead of transform
// tracks over named part groups. The rig builds one bone per joint below and
// re-parents every part mesh as a SkinnedMesh, so engines get deformable
// characters with human-readable bone names.
const RIGGABLE_ASSET_TYPES = new Set(["character", "monster", "dragon"]);

/* Each rig joint is a bone in the export skeleton. `at` names the generated
   mesh used as the joint anchor (its centre is the default joint position);
   `from`/`offset` override that anchor with a world-space offset so elbows,
   knees and wing roots land on the actual geometry. `part` names the mesh
   bound to this joint, and `weightTo` starts a graded vertex influence along
   the bound mesh so limbs bend at the joint instead of at a hard seam. */
const RIG_JOINT_DEFS = {
  character: [
    { name: "root", parent: null, at: "root" },
    { name: "hips", parent: "root", at: "legs" },
    { name: "spine", parent: "hips", at: "body" },
    { name: "chest", parent: "spine", at: "body", part: "body" },
    { name: "neck", parent: "chest", at: "head", part: "head" },
    {
      name: "leftArm",
      parent: "chest",
      from: "body",
      offset: [-0.45, 0.4, 0],
      part: "left-arm",
      weightFrom: "chest",
      weightTo: "leftElbow",
    },
    {
      name: "leftElbow",
      parent: "leftArm",
      from: "left-arm",
      offset: [0, -0.15, 0],
      weightTo: "leftHand",
    },
    {
      name: "leftHand",
      parent: "leftElbow",
      from: "left-arm",
      offset: [0, -0.3, 0],
    },
    {
      name: "rightArm",
      parent: "chest",
      from: "body",
      offset: [0.45, 0.4, 0],
      part: "right-arm",
      weightFrom: "chest",
      weightTo: "rightElbow",
    },
    {
      name: "rightElbow",
      parent: "rightArm",
      from: "right-arm",
      offset: [0, -0.15, 0],
      weightTo: "rightHand",
    },
    {
      name: "rightHand",
      parent: "rightElbow",
      from: "right-arm",
      offset: [0, -0.3, 0],
    },
    {
      name: "leftLeg",
      parent: "hips",
      from: "left-leg",
      offset: [0, 0.3, 0],
      part: "left-leg",
      weightFrom: "hips",
      weightTo: "leftKnee",
    },
    {
      name: "leftKnee",
      parent: "leftLeg",
      from: "left-leg",
      offset: [0, 0.1, 0],
      weightTo: "leftFoot",
    },
    {
      name: "leftFoot",
      parent: "leftKnee",
      from: "left-leg",
      offset: [0, -0.3, 0],
    },
    {
      name: "rightLeg",
      parent: "hips",
      from: "right-leg",
      offset: [0, 0.3, 0],
      part: "right-leg",
      weightFrom: "hips",
      weightTo: "rightKnee",
    },
    {
      name: "rightKnee",
      parent: "rightLeg",
      from: "right-leg",
      offset: [0, 0.1, 0],
      weightTo: "rightFoot",
    },
    {
      name: "rightFoot",
      parent: "rightKnee",
      from: "right-leg",
      offset: [0, -0.3, 0],
    },
  ],
  monster: [
    { name: "root", parent: null, at: "root" },
    { name: "body", parent: "root", at: "body", part: "body" },
    { name: "head", parent: "body", at: "head", part: "head" },
    {
      name: "leftArm",
      parent: "body",
      from: "body",
      offset: [-0.95, 0.1, 0],
      part: "left-arm",
      weightFrom: "body",
      weightTo: "leftElbow",
    },
    {
      name: "leftElbow",
      parent: "leftArm",
      from: "left-arm",
      offset: [0, -0.175, 0],
      weightTo: "leftHand",
    },
    {
      name: "leftHand",
      parent: "leftElbow",
      from: "left-arm",
      offset: [0, -0.35, 0],
    },
    {
      name: "rightArm",
      parent: "body",
      from: "body",
      offset: [0.95, 0.1, 0],
      part: "right-arm",
      weightFrom: "body",
      weightTo: "rightElbow",
    },
    {
      name: "rightElbow",
      parent: "rightArm",
      from: "right-arm",
      offset: [0, -0.175, 0],
      weightTo: "rightHand",
    },
    {
      name: "rightHand",
      parent: "rightElbow",
      from: "right-arm",
      offset: [0, -0.35, 0],
    },
    {
      name: "leftLeg",
      parent: "body",
      from: "left-leg",
      offset: [0, 0.25, 0],
      part: "left-leg",
      weightFrom: "body",
      weightTo: "leftKnee",
    },
    {
      name: "leftKnee",
      parent: "leftLeg",
      from: "left-leg",
      offset: [0, 0.06, 0],
      weightTo: "leftFoot",
    },
    {
      name: "leftFoot",
      parent: "leftKnee",
      from: "left-leg",
      offset: [0, -0.25, 0],
    },
    {
      name: "rightLeg",
      parent: "body",
      from: "right-leg",
      offset: [0, 0.25, 0],
      part: "right-leg",
      weightFrom: "body",
      weightTo: "rightKnee",
    },
    {
      name: "rightKnee",
      parent: "rightLeg",
      from: "right-leg",
      offset: [0, 0.06, 0],
      weightTo: "rightFoot",
    },
    {
      name: "rightFoot",
      parent: "rightKnee",
      from: "right-leg",
      offset: [0, -0.25, 0],
    },
    { name: "tail", parent: "body", at: "tail", part: "tail" },
  ],
  dragon: [
    { name: "root", parent: null, at: "root" },
    { name: "body", parent: "root", at: "body", part: "body" },
    { name: "belly", parent: "body", at: "belly", part: "belly" },
    { name: "neck", parent: "body", at: "head", part: "head" },
    {
      name: "leftWing",
      parent: "body",
      from: "body",
      offset: [-0.95, 0.3, 0],
      part: "left-wing",
      weightFrom: "body",
      weightTo: "leftWingTip",
    },
    { name: "leftWingTip", parent: "leftWing", at: "left-wing" },
    {
      name: "rightWing",
      parent: "body",
      from: "body",
      offset: [0.95, 0.3, 0],
      part: "right-wing",
      weightFrom: "body",
      weightTo: "rightWingTip",
    },
    { name: "rightWingTip", parent: "rightWing", at: "right-wing" },
    {
      name: "leftLeg",
      parent: "body",
      from: "leg-0",
      offset: [0, 0.2, 0],
      part: "leg-0",
      weightFrom: "body",
      weightTo: "leftKnee",
    },
    {
      name: "leftKnee",
      parent: "leftLeg",
      from: "leg-0",
      offset: [0, 0.032, 0],
    },
    {
      name: "rightLeg",
      parent: "body",
      from: "leg-1",
      offset: [0, 0.2, 0],
      part: "leg-1",
      weightFrom: "body",
      weightTo: "rightKnee",
    },
    {
      name: "rightKnee",
      parent: "rightLeg",
      from: "leg-1",
      offset: [0, 0.032, 0],
    },
    { name: "tail", parent: "body", at: "tail", part: "tail" },
  ],
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
 * Resolve a rig joint's world anchor. `from`/`offset` place the joint at an
 * explicit world-space offset from a generated part; otherwise the centre of
 * the `at` mesh is used.
 */
function jointAnchorWorld(joint, object) {
  const anchor = object.getObjectByName(joint.from || joint.at);
  const world = new THREE.Vector3();
  if (!anchor) return world;
  anchor.updateWorldMatrix(true, false);
  world.setFromMatrixPosition(anchor.matrixWorld);
  if (joint.offset) {
    const scale = object.scale.x || 1;
    world.addScaledVector(new THREE.Vector3(...joint.offset), scale);
  }
  return world;
}

/**
 * Convert a world-space joint position into a 0..1 fraction along a part
 * mesh's local Y geometry. Limbs are modelled along their local Y axis, so
 * this is the coordinate the graded skin weights key off of.
 */
function jointLocalYFraction(world, mesh, out = new THREE.Vector3()) {
  if (!mesh?.isMesh) return 0.5;
  mesh.updateWorldMatrix(true, false);
  const inverse = mesh.matrixWorld.clone().invert();
  out.copy(world).applyMatrix4(inverse);
  const pos = mesh.geometry.attributes.position;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minY) || maxY - minY < 1e-9) return 0.5;
  return Math.max(0, Math.min(1, (out.y - minY) / (maxY - minY)));
}

/**
 * Build and bind a procedural glTF skeleton for riggable assets. Bone
 * positions come from the generated geometry, part meshes become
 * SkinnedMeshes with graded limb weights, and the exported model then carries
 * a real skin with JOINTS_0/WEIGHTS_0 attributes.
 * @param {THREE.Group} model - Generated model (already scaled and pivoted)
 * @param {string} type - Asset type key
 * @returns {THREE.Skeleton|null} Bound skeleton, or null when not riggable
 */
export function buildProceduralRig(model, type) {
  const defs = RIG_JOINT_DEFS[type];
  if (!defs || !model?.isObject3D) return null;

  const skeletonGroup = new THREE.Group();
  skeletonGroup.name = "skeleton";
  model.add(skeletonGroup);

  const bones = new Map();
  for (const def of defs) {
    const bone = new THREE.Bone();
    bone.name = def.name;
    bones.set(def.name, bone);
  }

  // Bone local positions are relative to the parent bone, so resolve world
  // anchors first, then transform each into its parent's frame.
  const jointWorld = new Map();
  model.updateMatrixWorld(true);
  for (const def of defs) {
    const world = jointAnchorWorld(def, model);
    jointWorld.set(def.name, world);
  }
  for (const def of defs) {
    const bone = bones.get(def.name);
    const parent = def.parent ? bones.get(def.parent) : null;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      bone.position
        .copy(jointWorld.get(def.name))
        .applyMatrix4(parent.matrixWorld.clone().invert());
      parent.add(bone);
    } else {
      skeletonGroup.add(bone);
    }
  }

  model.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(Array.from(bones.values()));
  const bindByPart = new Map();
  for (const def of defs) {
    if (!def.part) continue;
    bindByPart.set(def.part, def);
  }

  const meshes = [];
  model.traverse((node) => {
    if (!node.isMesh) return;
    meshes.push(node);
  });
  for (const mesh of meshes) {
    const def = bindByPart.get(mesh.name);
    const joint = def ? bones.get(def.name) : null;
    const skinned = new THREE.SkinnedMesh(mesh.geometry.clone(), mesh.material);
    skinned.name = mesh.name;
    skinned.position.copy(mesh.position);
    skinned.rotation.copy(mesh.rotation);
    skinned.scale.copy(mesh.scale);
    skinned.userData = mesh.userData ? { ...mesh.userData } : {};
    mesh.parent.add(skinned);
    mesh.parent.remove(mesh);
    mesh.geometry.dispose();
    skinned.bind(skeleton, skinned.matrixWorld.clone());
    // SkinnedMesh.computeBoundingBox resolves the skin immediately, so every
    // mesh needs a valid default skin before any measurement runs. The orphan
    // and chain passes below replace these weights where they apply.
    const defaultPos = skinned.geometry.attributes.position;
    const defaultIndex = new Uint16Array(defaultPos.count * 4);
    const defaultWeight = new Float32Array(defaultPos.count * 4);
    for (let i = 0; i < defaultPos.count; i++) {
      defaultIndex[i * 4] = 0;
      defaultWeight[i * 4] = 1;
    }
    skinned.geometry.setAttribute(
      "skinIndex",
      new THREE.BufferAttribute(defaultIndex, 4),
    );
    skinned.geometry.setAttribute(
      "skinWeight",
      new THREE.BufferAttribute(defaultWeight, 4),
    );
    if (!joint) {
      // Bind orphan meshes (eyes, ornaments) to the nearest joint so the
      // exported skin has no static stragglers.
      const centre = new THREE.Box3()
        .setFromObject(skinned)
        .getCenter(new THREE.Vector3());
      let nearest = null;
      let nearestDistance = Infinity;
      for (const bone of bones.values()) {
        const distance = centre.distanceToSquared(
          new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld),
        );
        if (distance < nearestDistance) {
          nearest = bone;
          nearestDistance = distance;
        }
      }
      const geometry = skinned.geometry;
      const pos = geometry.attributes.position;
      const index = skeleton.bones.indexOf(nearest);
      const skinIndex = new Uint16Array(pos.count * 4);
      const skinWeight = new Float32Array(pos.count * 4);
      for (let i = 0; i < pos.count; i++) {
        skinIndex[i * 4] = index;
        skinWeight[i * 4] = 1;
      }
      geometry.setAttribute(
        "skinIndex",
        new THREE.BufferAttribute(skinIndex, 4),
      );
      geometry.setAttribute(
        "skinWeight",
        new THREE.BufferAttribute(skinWeight, 4),
      );
    }
  }

  // Bind every skinned mesh, then grade weights for the limb chains that
  // declared weightTo joints. Meshes without a bind keep their full-weight
  // nearest-joint skin from the pass above.
  for (const def of defs) {
    if (!def.part) continue;
    const skinned = model.getObjectByName(def.part);
    if (!skinned?.isSkinnedMesh) continue;
    const chain = [];
    let cursor = def;
    while (cursor && !chain.includes(cursor)) {
      chain.push(cursor);
      cursor = cursor.weightTo
        ? defs.find((d) => d.name === cursor.weightTo)
        : null;
    }
    if (chain.length < 2) continue;
    const stops = chain
      .map((d) => ({
        def: d,
        f: jointLocalYFraction(
          jointWorld.get(d.name),
          model.getObjectByName(def.part),
        ),
      }))
      .sort((a, b) => a.f - b.f);
    const geometry = skinned.geometry;
    const pos = geometry.attributes.position;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const ySpan = maxY - minY;
    const skinIndex = new Uint16Array(pos.count * 4);
    const skinWeight = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      let fraction = ySpan < 1e-9 ? 0.5 : (pos.getY(i) - minY) / ySpan;
      fraction = Math.max(0, Math.min(1, fraction));
      let index = 0;
      while (index < stops.length - 2 && fraction > stops[index + 1].f) {
        index++;
      }
      const low = stops[index].f;
      const high = stops[index + 1].f;
      const t = high === low ? 1 : (fraction - low) / (high - low);
      const boneA = bones.get(stops[index].def.name);
      const boneB = bones.get(stops[index + 1].def.name);
      const idxA = skeleton.bones.indexOf(boneA);
      const idxB = skeleton.bones.indexOf(boneB);
      skinIndex[i * 4] = idxA;
      skinIndex[i * 4 + 1] = idxB;
      skinWeight[i * 4] = 1 - t;
      skinWeight[i * 4 + 1] = t;
    }
    geometry.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndex, 4));
    geometry.setAttribute(
      "skinWeight",
      new THREE.BufferAttribute(skinWeight, 4),
    );
  }

  model.userData.rig = {
    type,
    joints: defs.map((d) => d.name),
    boneCount: bones.size,
  };
  return skeleton;
}

/**
 * Build a quaternion track that keeps the node's base pose and adds the
 * per-frame Euler offsets, so exported clips play identically in a game
 * engine instead of snapping a named part back to the origin.
 */
function quaternionTrack(nodeName, frames, base = new THREE.Euler()) {
  const times = new Float32Array(frames.length);
  const values = new Float32Array(frames.length * 4);
  const euler = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  frames.forEach((frame, index) => {
    times[index] = frame.t;
    euler.set(
      base.x + frame.rot[0],
      base.y + frame.rot[1],
      base.z + frame.rot[2],
    );
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
 * Build a position track that keeps the node's base position and adds the
 * per-frame offsets.
 */
function positionTrack(nodeName, frames, base = new THREE.Vector3()) {
  const times = new Float32Array(frames.length);
  const values = new Float32Array(frames.length * 3);
  frames.forEach((frame, index) => {
    times[index] = frame.t;
    values.set(
      [base.x + frame.pos[0], base.y + frame.pos[1], base.z + frame.pos[2]],
      index * 3,
    );
  });
  return new THREE.VectorKeyframeTrack(`${nodeName}.position`, times, values);
}

/**
 * Build a scale track that multiplies the node's base scale per frame.
 */
function scaleTrack(nodeName, frames, base = new THREE.Vector3(1, 1, 1)) {
  const times = new Float32Array(frames.length);
  const values = new Float32Array(frames.length * 3);
  frames.forEach((frame, index) => {
    times[index] = frame.t;
    values.set(
      [
        base.x * frame.scale[0],
        base.y * frame.scale[1],
        base.z * frame.scale[2],
      ],
      index * 3,
    );
  });
  return new THREE.VectorKeyframeTrack(`${nodeName}.scale`, times, values);
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
  const skeletonGroup = model.getObjectByName("skeleton");
  let skinnedAnchorName = null;
  if (skeletonGroup) {
    model.traverse((node) => {
      if (!skinnedAnchorName && node.isSkinnedMesh) {
        skinnedAnchorName = node.name;
      }
    });
  }
  const rigged = !!skeletonGroup && !!skinnedAnchorName;
  const addClip = (name, duration, tracksByNode) => {
    const tracks = [];
    for (const [nodeName, frames] of Object.entries(tracksByNode)) {
      const node = model.getObjectByName(nodeName);
      if (!node) continue;
      if (frames.some((frame) => frame.rot)) {
        tracks.push(quaternionTrack(nodeName, frames, node.rotation));
      }
      if (frames.some((frame) => frame.pos)) {
        tracks.push(positionTrack(nodeName, frames, node.position));
      }
      if (frames.some((frame) => frame.scale)) {
        tracks.push(scaleTrack(nodeName, frames, node.scale));
      }
    }
    if (tracks.length)
      clips.push(new THREE.AnimationClip(name, duration, tracks));
  };
  const addRiggedClip = (name, duration, tracksByBone) => {
    const tracks = [];
    for (const [boneName, frames] of Object.entries(tracksByBone)) {
      const bone = skeletonGroup.getObjectByName(boneName);
      if (!bone) continue;
      const boundName = `${skinnedAnchorName}.bones[${boneName}]`;
      if (frames.some((frame) => frame.rot)) {
        tracks.push(quaternionTrack(boundName, frames, bone.rotation));
      }
      if (frames.some((frame) => frame.pos)) {
        tracks.push(positionTrack(boundName, frames, bone.position));
      }
    }
    if (tracks.length)
      clips.push(new THREE.AnimationClip(name, duration, tracks));
  };

  if (rigged && (type === "character" || type === "monster")) {
    const headBone = type === "character" ? "neck" : "head";
    const bodyBone = type === "character" ? "hips" : "body";
    addRiggedClip("idle", 2.4, {
      [headBone]: [
        { t: 0, pos: [0, 0, 0] },
        { t: 0.6, pos: [0, bob, 0] },
        { t: 1.2, pos: [0, 0, 0] },
        { t: 1.8, pos: [0, -bob * 0.6, 0] },
        { t: 2.4, pos: [0, 0, 0] },
      ],
      leftArm: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.6, rot: [0, 0, 0.07] },
        { t: 1.2, rot: [0, 0, 0] },
        { t: 1.8, rot: [0, 0, -0.07] },
        { t: 2.4, rot: [0, 0, 0] },
      ],
      rightArm: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.6, rot: [0, 0, -0.07] },
        { t: 1.2, rot: [0, 0, 0] },
        { t: 1.8, rot: [0, 0, 0.07] },
        { t: 2.4, rot: [0, 0, 0] },
      ],
      [bodyBone]: [
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

    addRiggedClip("walk", 0.8, {
      leftArm: [
        { t: 0, rot: [0, 0, 0.35] },
        { t: 0.4, rot: [0, 0, -0.35] },
        { t: 0.8, rot: [0, 0, 0.35] },
      ],
      rightArm: [
        { t: 0, rot: [0, 0, -0.35] },
        { t: 0.4, rot: [0, 0, 0.35] },
        { t: 0.8, rot: [0, 0, -0.35] },
      ],
      leftLeg: [
        { t: 0, rot: [0.35, 0, 0] },
        { t: 0.4, rot: [-0.35, 0, 0] },
        { t: 0.8, rot: [0.35, 0, 0] },
      ],
      rightLeg: [
        { t: 0, rot: [-0.35, 0, 0] },
        { t: 0.4, rot: [0.35, 0, 0] },
        { t: 0.8, rot: [-0.35, 0, 0] },
      ],
      [bodyBone]: [
        { t: 0, pos: [0, 0, 0] },
        { t: 0.4, pos: [0, bob, 0] },
        { t: 0.8, pos: [0, 0, 0] },
      ],
      [headBone]: [
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

    addRiggedClip("attack", 1, {
      leftArm: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.35, rot: [-0.7, 0, 0] },
        { t: 0.65, rot: [0.9, 0, 0] },
        { t: 1, rot: [0, 0, 0] },
      ],
      rightArm: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.35, rot: [-0.7, 0, 0] },
        { t: 0.65, rot: [0.9, 0, 0] },
        { t: 1, rot: [0, 0, 0] },
      ],
      [headBone]: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.35, rot: [0.12, 0, 0] },
        { t: 0.65, rot: [-0.18, 0, 0] },
        { t: 1, rot: [0, 0, 0] },
      ],
      [bodyBone]: [
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
  } else if (type === "character" || type === "monster") {
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

  if (rigged && type === "dragon") {
    addRiggedClip("idle", 2.4, {
      neck: [
        { t: 0, pos: [0, 0, 0] },
        { t: 0.6, pos: [0, bob, 0] },
        { t: 2.4, pos: [0, 0, 0] },
      ],
      leftWing: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.6, rot: [0, 0, 0.08] },
        { t: 1.2, rot: [0, 0, 0] },
        { t: 1.8, rot: [0, 0, -0.08] },
        { t: 2.4, rot: [0, 0, 0] },
      ],
      rightWing: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.6, rot: [0, 0, -0.08] },
        { t: 1.2, rot: [0, 0, 0] },
        { t: 1.8, rot: [0, 0, 0.08] },
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

    addRiggedClip("fly", 2, {
      leftWing: [
        { t: 0, rot: [0, 0, 0.55] },
        { t: 1, rot: [0, 0, -0.55] },
        { t: 2, rot: [0, 0, 0.55] },
      ],
      rightWing: [
        { t: 0, rot: [0, 0, -0.55] },
        { t: 1, rot: [0, 0, 0.55] },
        { t: 2, rot: [0, 0, -0.55] },
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

    addRiggedClip("attack", 1.2, {
      neck: [
        { t: 0, pos: [0, 0, 0] },
        { t: 0.45, pos: [0, 0, -0.08 * size] },
        { t: 0.8, pos: [0, 0, 0.14 * size] },
        { t: 1.2, pos: [0, 0, 0] },
      ],
      leftWing: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.45, rot: [0, 0, 0.4] },
        { t: 0.8, rot: [0, 0, -0.25] },
        { t: 1.2, rot: [0, 0, 0] },
      ],
      rightWing: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.45, rot: [0, 0, -0.4] },
        { t: 0.8, rot: [0, 0, 0.25] },
        { t: 1.2, rot: [0, 0, 0] },
      ],
      tail: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.8, rot: [0, 0, -0.3] },
        { t: 1.2, rot: [0, 0, 0] },
      ],
    });
  } else if (type === "dragon") {
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

  const spinOnce = [
    { t: 0, rot: [0, 0, 0] },
    { t: 0.5, rot: [0, 0, Math.PI] },
    { t: 1, rot: [0, 0, Math.PI * 2] },
  ];
  const rollOnce = [
    { t: 0, rot: [0, 0, 0] },
    { t: 0.5, rot: [Math.PI, 0, 0] },
    { t: 1, rot: [Math.PI * 2, 0, 0] },
  ];

  if (type === "chest") {
    addClip("open", 2.2, {
      lid: [
        { t: 0, rot: [0, 0, 0], pos: [0, 0, 0] },
        { t: 0.7, rot: [0, 0, 0.9], pos: [0, 0.06 * size, 0] },
        { t: 1.4, rot: [0, 0, 0.9], pos: [0, 0.06 * size, 0] },
        { t: 2.2, rot: [0, 0, 0], pos: [0, 0, 0] },
      ],
    });
  }

  if (
    type === "campfire" ||
    type === "torch" ||
    type === "brazier" ||
    type === "lantern"
  ) {
    addClip("flicker", 1.6, {
      flame: [
        { t: 0, pos: [0, 0, 0], scale: [1, 1, 1] },
        { t: 0.32, pos: [0, 0.04 * size, 0], scale: [1.08, 1.16, 1.08] },
        { t: 0.64, pos: [0, 0.015 * size, 0], scale: [0.9, 0.94, 0.9] },
        { t: 0.96, pos: [0, 0.045 * size, 0], scale: [1.12, 1.08, 1.12] },
        { t: 1.28, pos: [0, 0.025 * size, 0], scale: [0.94, 1.1, 0.94] },
        { t: 1.6, pos: [0, 0, 0], scale: [1, 1, 1] },
      ],
    });
  }

  if (type === "chandelier") {
    const swing = [
      { t: 0, rot: [0.02, 0, 0.03] },
      { t: 0.8, rot: [-0.03, 0, 0.06] },
      { t: 1.6, rot: [0.02, 0, 0.03] },
      { t: 2.4, rot: [0.01, 0, -0.04] },
      { t: 3.2, rot: [0.02, 0, 0.03] },
    ];
    addClip("sway", 3.2, {
      chain: swing,
      core: swing,
      arms: swing,
      candles: swing,
    });
  }

  if (type === "minecart") {
    addClip("spin", 1, {
      "wheel-0": spinOnce,
      "wheel-1": spinOnce,
      "wheel-2": spinOnce,
      "wheel-3": spinOnce,
    });
  }

  if (type === "flag") {
    const wave = [
      { t: 0, rot: [0, 0, 0] },
      { t: 0.5, rot: [0, 0.2, 0.05] },
      { t: 1, rot: [0, 0, 0] },
      { t: 1.5, rot: [0, -0.2, -0.05] },
      { t: 2, rot: [0, 0, 0] },
    ];
    addClip("wave", 2, {
      cloth: wave,
      tail: wave,
    });
  }

  if (type === "fountain") {
    addClip("flow", 2.4, {
      jet: [
        { t: 0, pos: [0, 0, 0], scale: [1, 1, 1] },
        { t: 0.6, pos: [0, 0.08 * size, 0], scale: [0.82, 1.28, 0.82] },
        { t: 1.2, pos: [0, 0.02 * size, 0], scale: [1.06, 0.9, 1.06] },
        { t: 1.8, pos: [0, 0.09 * size, 0], scale: [0.9, 1.2, 0.9] },
        { t: 2.4, pos: [0, 0, 0], scale: [1, 1, 1] },
      ],
      water: [
        { t: 0, scale: [1, 1, 1] },
        { t: 1.2, scale: [1.03, 1.06, 1.03] },
        { t: 2.4, scale: [1, 1, 1] },
      ],
    });
  }

  if (type === "car") {
    addClip("spin", 1, {
      "wheel-0": spinOnce,
      "wheel-1": spinOnce,
      "wheel-2": spinOnce,
      "wheel-3": spinOnce,
    });
  }

  if (type === "bike") {
    addClip("spin", 1, {
      "front-wheel": rollOnce,
      "rear-wheel": rollOnce,
    });
  }

  if (type === "plane") {
    addClip("spin", 1, {
      propeller: spinOnce,
    });
  }

  if (type === "drone") {
    addClip("spin", 1, {
      "rotor-0": spinOnce,
      "rotor-1": spinOnce,
      "rotor-2": spinOnce,
      "rotor-3": spinOnce,
    });
  }

  if (type === "turret") {
    addClip("sweep", 3.2, {
      barrel: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.8, rot: [0, 0.35, 0] },
        { t: 1.6, rot: [0, 0, 0] },
        { t: 2.4, rot: [0, -0.35, 0] },
        { t: 3.2, rot: [0, 0, 0] },
      ],
      eye: [
        { t: 0, scale: [1, 1, 1] },
        { t: 0.5, scale: [1.25, 1.25, 1.25] },
        { t: 1, scale: [1, 1, 1] },
        { t: 1.5, scale: [1.25, 1.25, 1.25] },
        { t: 2, scale: [1, 1, 1] },
        { t: 2.5, scale: [1.25, 1.25, 1.25] },
        { t: 3.2, scale: [1, 1, 1] },
      ],
    });
  }

  if (type === "antenna") {
    addClip("sway", 2.8, {
      dish: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.7, rot: [0, 0.22, 0.05] },
        { t: 1.4, rot: [0, 0, 0] },
        { t: 2.1, rot: [0, -0.22, -0.05] },
        { t: 2.8, rot: [0, 0, 0] },
      ],
      light: [
        { t: 0, scale: [1, 1, 1] },
        { t: 0.35, scale: [1.5, 1.5, 1.5] },
        { t: 0.7, scale: [1, 1, 1] },
        { t: 1.05, scale: [1.5, 1.5, 1.5] },
        { t: 1.4, scale: [1, 1, 1] },
        { t: 1.75, scale: [1.5, 1.5, 1.5] },
        { t: 2.1, scale: [1, 1, 1] },
        { t: 2.45, scale: [1.5, 1.5, 1.5] },
        { t: 2.8, scale: [1, 1, 1] },
      ],
    });
  }

  if (type === "crystal") {
    addClip("pulse", 1.8, {
      shard: [
        { t: 0, scale: [1, 1, 1] },
        { t: 0.45, scale: [1.08, 1.2, 1.08] },
        { t: 0.9, scale: [1, 1, 1] },
        { t: 1.35, scale: [1.08, 1.2, 1.08] },
        { t: 1.8, scale: [1, 1, 1] },
      ],
      tip: [
        { t: 0, scale: [1, 1, 1] },
        { t: 0.45, scale: [1.12, 1.25, 1.12] },
        { t: 0.9, scale: [1, 1, 1] },
        { t: 1.35, scale: [1.12, 1.25, 1.12] },
        { t: 1.8, scale: [1, 1, 1] },
      ],
    });
  }

  if (type === "runestone") {
    addClip("pulse", 2.2, {
      rune: [
        { t: 0, scale: [1, 1, 1] },
        { t: 0.55, scale: [1.1, 1.18, 1.1] },
        { t: 1.1, scale: [1, 1, 1] },
        { t: 1.65, scale: [1.1, 1.18, 1.1] },
        { t: 2.2, scale: [1, 1, 1] },
      ],
      stone: [
        { t: 0, pos: [0, 0, 0] },
        { t: 0.55, pos: [0, 0.03 * size, 0] },
        { t: 1.1, pos: [0, 0, 0] },
        { t: 1.65, pos: [0, 0.03 * size, 0] },
        { t: 2.2, pos: [0, 0, 0] },
      ],
    });
  }

  if (type === "tree") {
    addClip("sway", 2.6, {
      foliage: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.65, rot: [0.04, 0, 0.03] },
        { t: 1.3, rot: [0, 0, 0] },
        { t: 1.95, rot: [-0.04, 0, -0.03] },
        { t: 2.6, rot: [0, 0, 0] },
      ],
    });
  }

  if (type === "boat") {
    addClip("bob", 2.4, {
      hull: [
        { t: 0, pos: [0, 0, 0], rot: [0, 0, 0] },
        { t: 0.6, pos: [0, 0.05 * size, 0], rot: [0, 0, 0.04] },
        { t: 1.2, pos: [0, 0, 0], rot: [0, 0, 0] },
        { t: 1.8, pos: [0, 0.05 * size, 0], rot: [0, 0, -0.04] },
        { t: 2.4, pos: [0, 0, 0], rot: [0, 0, 0] },
      ],
      sail: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.6, rot: [0, 0.08, 0] },
        { t: 1.2, rot: [0, 0, 0] },
        { t: 1.8, rot: [0, -0.08, 0] },
        { t: 2.4, rot: [0, 0, 0] },
      ],
    });
  }

  if (type === "stone_coffin") {
    addClip("open", 2.2, {
      lid: [
        { t: 0, rot: [0, 0, 0], pos: [0, 0, 0] },
        { t: 0.7, rot: [0, 0, 0.55], pos: [0.36 * size, 0.05 * size, 0] },
        { t: 1.4, rot: [0, 0, 0.55], pos: [0.36 * size, 0.05 * size, 0] },
        { t: 2.2, rot: [0, 0, 0], pos: [0, 0, 0] },
      ],
    });
  }

  if (type === "portcullis") {
    addClip("raise", 2.4, {
      bars: [
        { t: 0, pos: [0, 0, 0] },
        { t: 0.8, pos: [0, 0.55 * size, 0] },
        { t: 1.4, pos: [0, 0.55 * size, 0] },
        { t: 2.4, pos: [0, 0, 0] },
      ],
    });
  }

  if (type === "cobweb") {
    addClip("sway", 3, {
      hub: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.75, rot: [0.04, 0, 0.06] },
        { t: 1.5, rot: [0, 0, 0] },
        { t: 2.25, rot: [-0.04, 0, -0.05] },
        { t: 3, rot: [0, 0, 0] },
      ],
      strands: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.75, rot: [0.08, 0, 0.1] },
        { t: 1.5, rot: [0, 0, 0] },
        { t: 2.25, rot: [-0.08, 0, -0.08] },
        { t: 3, rot: [0, 0, 0] },
      ],
    });
  }

  if (type === "lever") {
    addClip("pull", 2.4, {
      handle: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.5, rot: [0.55, 0, 0] },
        { t: 1.2, rot: [0.55, 0, 0] },
        { t: 1.9, rot: [0, 0, 0] },
        { t: 2.4, rot: [0, 0, 0] },
      ],
    });
  }

  if (type === "mummy") {
    addClip("lurch", 2.6, {
      body: [
        { t: 0, rot: [0, 0, 0], pos: [0, 0, 0] },
        { t: 0.65, rot: [0.12, 0, 0], pos: [0, 0.03 * size, -0.03 * size] },
        { t: 1.3, rot: [0, 0, 0], pos: [0, 0, 0] },
        { t: 1.95, rot: [0.12, 0, 0], pos: [0, 0.03 * size, -0.03 * size] },
        { t: 2.6, rot: [0, 0, 0], pos: [0, 0, 0] },
      ],
      arms: [
        { t: 0, rot: [0, 0, 0] },
        { t: 0.65, rot: [0.28, 0, 0] },
        { t: 1.3, rot: [0, 0, 0] },
        { t: 1.95, rot: [0.28, 0, 0] },
        { t: 2.6, rot: [0, 0, 0] },
      ],
    });
  }

  if (type === "beehive") {
    addClip("buzz", 1.8, {
      bees: [
        { t: 0, pos: [0, 0, 0], scale: [1, 1, 1] },
        { t: 0.45, pos: [0, 0.04 * size, 0], scale: [1.12, 1.12, 1.12] },
        { t: 0.9, pos: [0, -0.02 * size, 0], scale: [0.94, 0.94, 0.94] },
        { t: 1.35, pos: [0, 0.05 * size, 0], scale: [1.08, 1.08, 1.08] },
        { t: 1.8, pos: [0, 0, 0], scale: [1, 1, 1] },
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
 * @param {number} options.size - Asset size, in `units` (default metres)
 * @param {string} options.units - "m", "cm", "mm", "ft" or "in"
 * @param {string} options.fitAxis - "max", "height", "width" or "depth"
 * @param {string} options.pivot - "center", "ground", "bottom" or "top"
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
 * @param {number} options.textureSize - Procedural map size (64/128/256/512)
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
    textureSize = 256,
    units = "m",
    fitAxis = "max",
    pivot = "center",
    options = {},
  } = {},
) {
  const group = new THREE.Group();
  group.name = `asset-${type}`;

  const matStyle = STYLE_MATERIALS[style] || STYLE_MATERIALS.lowpoly;
  segments = Math.max(4, Math.min(32, segments));
  const customColor = color ? new THREE.Color(color) : null;
  const rng = seed !== null ? mulberry32(seed) : Math.random;
  // Modular pieces are measured, not scaled: their dimensions are the contract,
  // so they are built straight from the cell maths below and skip the size
  // normalisation every other type goes through.
  const modular = isModularType(type);
  const modularOptions = normalizeModularOptions(options);

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
    case "gate":
      buildGate(group, size, segments, matStyle, customColor, rng);
      break;
    case "wagon":
      buildWagon(group, size, segments, matStyle, customColor, rng);
      break;
    case "cannon":
      buildCannon(group, size, segments, matStyle, customColor, rng);
      break;
    case "grave":
      buildGrave(group, size, segments, matStyle, customColor, rng);
      break;
    case "ladder":
      buildLadder(group, size, segments, matStyle, customColor, rng);
      break;
    case "candelabra":
      buildCandelabra(group, size, segments, matStyle, customColor, rng);
      break;
    case "anvil":
      buildAnvil(group, size, segments, matStyle, customColor, rng);
      break;
    case "bookshelf":
      buildBookshelf(group, size, segments, matStyle, customColor, rng);
      break;
    case "cauldron":
      buildCauldron(group, size, segments, matStyle, customColor, rng);
      break;
    case "throne":
      buildThrone(group, size, segments, matStyle, customColor, rng);
      break;
    case "bench":
      buildBench(group, size, segments, matStyle, customColor, rng);
      break;
    case "lantern":
      buildLantern(group, size, segments, matStyle, customColor, rng);
      break;
    case "table":
      buildTable(group, size, segments, matStyle, customColor, rng);
      break;
    case "chair":
      buildChair(group, size, segments, matStyle, customColor, rng);
      break;
    case "bed":
      buildBed(group, size, segments, matStyle, customColor, rng);
      break;
    case "chandelier":
      buildChandelier(group, size, segments, matStyle, customColor, rng);
      break;
    case "armor_stand":
      buildArmorStand(group, size, segments, matStyle, customColor, rng);
      break;
    case "skeleton":
      buildSkeleton(group, size, segments, matStyle, customColor, rng);
      break;
    case "bread":
      buildBread(group, size, segments, matStyle, customColor, rng);
      break;
    case "pie":
      buildPie(group, size, segments, matStyle, customColor, rng);
      break;
    case "meat_leg":
      buildMeatLeg(group, size, segments, matStyle, customColor, rng);
      break;
    case "hay_bale":
      buildHayBale(group, size, segments, matStyle, customColor, rng);
      break;
    case "rope_coil":
      buildRopeCoil(group, size, segments, matStyle, customColor, rng);
      break;
    case "bucket":
      buildBucket(group, size, segments, matStyle, customColor, rng);
      break;
    case "windmill":
      buildWindmill(group, size, segments, matStyle, customColor, rng);
      break;
    case "coin_pile":
      buildCoinPile(group, size, segments, matStyle, customColor, rng);
      break;
    case "minecart":
      buildMinecart(group, size, segments, matStyle, customColor, rng);
      break;
    case "berry_bush":
      buildBerryBush(group, size, segments, matStyle, customColor, rng);
      break;
    case "stone_coffin":
      buildStoneCoffin(group, size, segments, matStyle, customColor, rng);
      break;
    case "portcullis":
      buildPortcullis(group, size, segments, matStyle, customColor, rng);
      break;
    case "cage":
      buildCage(group, size, segments, matStyle, customColor, rng);
      break;
    case "bone_pile":
      buildBonePile(group, size, segments, matStyle, customColor, rng);
      break;
    case "cobweb":
      buildCobweb(group, size, segments, matStyle, customColor, rng);
      break;
    case "lever":
      buildLever(group, size, segments, matStyle, customColor, rng);
      break;
    case "urn":
      buildUrn(group, size, segments, matStyle, customColor, rng);
      break;
    case "mummy":
      buildMummy(group, size, segments, matStyle, customColor, rng);
      break;
    case "beehive":
      buildBeehive(group, size, segments, matStyle, customColor, rng);
      break;
    case "wheat_sheaf":
      buildWheatSheaf(group, size, segments, matStyle, customColor, rng);
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
    case "wall":
      buildWall(group, modularOptions, matStyle, customColor, rng);
      break;
    case "wall_window":
      buildWallWindow(group, modularOptions, matStyle, customColor, rng);
      break;
    case "wall_door":
      buildWallDoor(group, modularOptions, matStyle, customColor, rng);
      break;
    case "wall_corner":
      buildWallCorner(group, modularOptions, matStyle, customColor, rng);
      break;
    case "floor":
      buildFloor(group, modularOptions, matStyle, customColor, rng);
      break;
    case "stairs":
      buildStairs(group, modularOptions, matStyle, customColor, rng);
      break;
    case "arch":
      buildArch(group, modularOptions, matStyle, customColor, rng);
      break;
    default:
      buildCube(group, size, segments, matStyle, customColor, rng);
  }

  applyMaterialOverrides(group, material);
  applyProceduralTextureSet(group, type, {
    texture,
    strength: textureStrength,
    size: textureSize,
    seed,
  });

  const metres = sizeToMetres(size, units);
  // Scale first, then place the pivot in scaled space. Centering before scaling
  // would leave the box offset whenever the requested size is not exactly the
  // model span, which matters when a game engine drops the asset into a scene.
  if (!modular) {
    const box = new THREE.Box3().setFromObject(group);
    const extent = sizeExtent(box, fitAxis);
    if (extent > 0) group.scale.setScalar(metres / extent);
  }
  const scaledBox = new THREE.Box3().setFromObject(group);
  group.position.add(pivotOffset(scaledBox, pivot));
  if (RIGGABLE_ASSET_TYPES.has(type)) {
    buildProceduralRig(group, type);
  }
  // Engine import reads these, and a reviewer can see the real span without
  // re-measuring the mesh.
  const finalSize = new THREE.Box3()
    .setFromObject(group)
    .getSize(new THREE.Vector3());
  group.userData.dimensions = {
    width: Math.round(finalSize.x * 10000) / 10000,
    height: Math.round(finalSize.y * 10000) / 10000,
    depth: Math.round(finalSize.z * 10000) / 10000,
  };
  group.animations = buildAssetAnimations(group, type, metres);

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
 * @param {number} options.textureSize - Procedural map size (64/128/256/512)
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
    textureSize = 256,
    count = 4,
    baseSeed = 0,
    units = "m",
    fitAxis = "max",
    pivot = "center",
    options = {},
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
      textureSize,
      units,
      fitAxis,
      pivot,
      options,
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
 * grayscale so the per-part material color tints it; normal, roughness,
 * metalness and ambient-occlusion maps then modulate the engine material.
 * AO samples the same UV set as albedo, so the mesh gets an explicit uv2 copy.
 */
function applyProceduralTextureSet(
  object,
  type,
  { texture = "auto", strength = 0.8, size = 256, seed = null } = {},
) {
  const kind = resolveTextureKind(type, texture);
  if (!kind) return;
  const textureSeed = seed == null ? 1 : Math.max(1, Math.floor(seed) + 1);
  const set = createProceduralTextures(kind, {
    size: TEXTURE_SIZES.includes(Math.round(Number(size) || 256))
      ? Math.round(Number(size))
      : 256,
    strength: Math.max(0, Math.min(1, Number(strength) || 0)),
    seed: textureSeed,
  });
  object.traverse((child) => {
    if (!child.isMesh) return;
    if (child.geometry?.attributes?.uv && !child.geometry.attributes.uv2) {
      child.geometry.setAttribute("uv2", child.geometry.attributes.uv);
    }
    const mats = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const mat of mats) {
      if (!mat?.isMaterial) continue;
      mat.map = set.textures.albedo;
      mat.normalMap = set.textures.normal;
      mat.roughnessMap = set.textures.roughness;
      mat.metalnessMap = set.textures.metalness;
      mat.aoMap = set.textures.ao;
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
  const textureSize = TEXTURE_SIZES.includes(
    Math.round(Number(asset.textureSize) || 0),
  )
    ? Math.round(Number(asset.textureSize))
    : 256;
  const set = createProceduralTextures(kind, {
    size: textureSize,
    strength,
    seed: textureSeed,
    png: true,
  });
  return {
    texture: {
      kind,
      strength,
      size: textureSize,
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
      { type: "torch", size: 1 },
      { type: "stone_coffin", size: 1.15 },
      { type: "portcullis", size: 0.95 },
      { type: "cage", size: 1.05 },
      { type: "bone_pile", size: 1 },
      { type: "cobweb", size: 0.9 },
      { type: "lever", size: 0.9 },
      { type: "urn", size: 0.85 },
      { type: "mummy", size: 1.05 },
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
      { type: "portcullis", size: 1.1 },
      { type: "cage", size: 1.05 },
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
      { type: "wheat_sheaf", size: 1.15 },
      { type: "beehive", size: 1 },
      { type: "crate", size: 0.85 },
      { type: "barrel", size: 0.8 },
      { type: "flag", size: 0.9 },
      { type: "torch", size: 1 },
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
      { type: "beehive", size: 1.05 },
      { type: "wheat_sheaf", size: 1.15 },
      { type: "tent", size: 1.1 },
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
 * @param {number} options.textureSize - Procedural map size (64/128/256/512)
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
    textureSize = 256,
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
    textureSize,
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
    size: textureSize,
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
      textureSize,
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

/* Modular scene presets snap the measured kit pieces together. A courtyard,
   a tower room and a corridor are the three spaces a team usually starts
   with: an open yard, an enclosed cell, and a run between two others. Every
   preset states which piece types it needs, so the panel and the tests can
   check a scene actually contains its promised building blocks. */
export const MODULAR_SCENE_PRESETS = {
  courtyard: {
    name: "Courtyard",
    required: ["wall", "wall_door", "floor", "arch"],
    options: { cell: 2, cells: 4, height: 2, depth: 4, thickness: 0.2 },
    pieces({ cell, cells, depth }) {
      const length = cells * cell;
      const width = depth * cell;
      const edge = width / 2;
      return [
        { name: "courtyard-floor", type: "floor" },
        { name: "courtyard-wall-south", type: "wall", z: -edge },
        { name: "courtyard-wall-north", type: "wall_door", z: edge },
        {
          name: "courtyard-wall-west",
          type: "wall",
          x: -edge,
          rotationY: Math.PI / 2,
        },
        {
          name: "courtyard-wall-east",
          type: "wall",
          x: edge,
          rotationY: Math.PI / 2,
        },
        { name: "courtyard-arch-north", type: "arch", z: edge + cell },
      ];
    },
    props() {
      return [
        { type: "crate", size: 0.85, x: -1.6, z: -1.6 },
        { type: "brazier", size: 1.05, x: 1.6, z: 1.6 },
        { type: "torch", size: 1, x: -2.6, z: 2.4 },
      ];
    },
  },
  tower_room: {
    name: "Tower Room",
    required: ["wall", "wall_door", "floor"],
    options: { cell: 2, cells: 3, height: 2, depth: 3, thickness: 0.2 },
    pieces({ cell, cells, depth }) {
      const length = cells * cell;
      const width = depth * cell;
      const edge = width / 2;
      return [
        { name: "tower-room-floor", type: "floor" },
        { name: "tower-room-wall-south", type: "wall", z: -edge },
        { name: "tower-room-wall-north", type: "wall", z: edge },
        {
          name: "tower-room-wall-west",
          type: "wall",
          x: -edge,
          rotationY: Math.PI / 2,
        },
        {
          name: "tower-room-wall-east",
          type: "wall_door",
          x: edge,
          rotationY: Math.PI / 2,
        },
      ];
    },
    props() {
      return [
        { type: "crate", size: 0.8, x: 0, z: 0 },
        { type: "brazier", size: 1.05, x: -1.8, z: 1.6 },
      ];
    },
  },
  corridor: {
    name: "Corridor",
    required: ["wall", "wall_door", "floor", "arch", "stairs"],
    options: { cell: 2, cells: 6, height: 2, depth: 2, thickness: 0.2 },
    pieces({ cell, cells, depth }) {
      const length = cells * cell;
      const width = depth * cell;
      const edge = width / 2;
      return [
        { name: "corridor-floor", type: "floor" },
        { name: "corridor-wall-north", type: "wall", z: -edge },
        { name: "corridor-wall-south", type: "wall", z: edge },
        { name: "corridor-arch-end", type: "arch", x: length / 2 },
        {
          name: "corridor-door-end",
          type: "wall_door",
          x: -length / 2,
          rotationY: Math.PI,
        },
        { name: "corridor-stairs", type: "stairs" },
      ];
    },
  },
};

export function getModularScenePresets() {
  return Object.entries(MODULAR_SCENE_PRESETS).map(([id, preset]) => ({
    id,
    name: preset.name,
    required: [...preset.required],
    options: { ...preset.options },
  }));
}

/**
 * Compose a preset modular scene from measured kit pieces. The returned group
 * is centered, every piece keeps its ground pivot, and the same preset plus
 * the same options and seed always rebuilds the same layout.
 * @param {string} presetId - Preset id from MODULAR_SCENE_PRESETS
 * @param {object} options - Composition options
 * @param {number} options.seed - Deterministic arrangement seed
 * @param {number} options.segments - Mesh segment budget shared by props
 * @param {number} options.quality - Scene quality pass-through
 * @param {string} options.style - Material style passed to every piece
 * @param {string} options.color - Hex colour passed to every piece
 * @param {object} options.material - Material overrides passed to every piece
 * @param {string} options.texture - Procedural texture preset or "auto"/"none"
 * @param {number} options.textureStrength - Procedural texture strength 0..1
 * @param {number} options.textureSize - Procedural map size (64/128/256/512)
 * @param {number} options.spacing - Grid spacing multiplier
 * @param {number} options.groundPadding - Ground margin on each side
 * @param {number} options.propScale - Global prop scale multiplier
 * @param {object} options.modular - Modular grid options (cell, cells, ...)
 * @param {Array<object>} options.props - Saved prop placements. When supplied,
 *   these replace the preset defaults so deleted or edited props survive a
 *   reload.
 */
export function composeModularScene(
  presetId,
  {
    seed = 1,
    segments = 12,
    quality = 1,
    style = "lowpoly",
    color = null,
    material = null,
    texture = "auto",
    textureStrength = 0.8,
    textureSize = 256,
    spacing = 1,
    groundPadding = 0.6,
    propScale = 1,
    modular = {},
    props = null,
  } = {},
) {
  const preset = MODULAR_SCENE_PRESETS[presetId];
  if (!preset) throw new Error(`Unknown modular scene preset: ${presetId}`);
  const clamp = (value, fallback, min, max) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
  };
  const spacingScale = clamp(spacing, 1, 0.5, 2);
  const groundMargin = clamp(groundPadding, 0.6, 0, 3);
  const propScaleValue = clamp(propScale, 1, 0.25, 3);
  const modularOptions = normalizeModularOptions({
    ...preset.options,
    ...(modular || {}),
  });
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = `modular-scene-${presetId}`;
  group.userData.preset = presetId;
  group.userData.kit = presetId;
  group.userData.sceneKind = "modular-scene";
  group.userData.theme = {
    style,
    color,
    material,
    texture,
    textureStrength,
    textureSize,
    segments,
    quality,
    spacing: spacingScale,
    groundPadding: groundMargin,
    propScale: propScaleValue,
  };
  group.userData.modular = { ...modularOptions, preset: presetId };

  const cell = modularOptions.cell;
  const length = modularOptions.cells * cell;
  const width = modularOptions.depth * cell;
  const slab = Math.min(Math.max(modularOptions.thickness, 0.05), 0.5);
  group.userData.floorY = slab;
  const pieceList = [];
  for (const placement of preset.pieces(modularOptions)) {
    const model = generateAsset(placement.type, {
      options: modularOptions,
      pivot: "ground",
      style,
      color,
      seed,
      material,
      texture,
      textureStrength,
      textureSize,
    });
    model.name = placement.name;
    model.traverse((child) => {
      if (child.isMesh) child.name = `${placement.name}-${child.name}`;
    });
    model.position.set(placement.x ?? 0, placement.y ?? 0, placement.z ?? 0);
    if (placement.rotationY) model.rotation.y = placement.rotationY;
    const placedBox = new THREE.Box3().setFromObject(model);
    pieceList.push({
      name: model.name,
      type: placement.type,
      x: Math.round(model.position.x * 1000) / 1000,
      y: Math.round(model.position.y * 1000) / 1000,
      z: Math.round(model.position.z * 1000) / 1000,
      rotationY: Math.round(model.rotation.y * 10000) / 10000,
      bounds: {
        width: Math.round((placedBox.max.x - placedBox.min.x) * 1000) / 1000,
        height: Math.round((placedBox.max.y - placedBox.min.y) * 1000) / 1000,
        depth: Math.round((placedBox.max.z - placedBox.min.z) * 1000) / 1000,
      },
    });
    group.add(model);
  }
  group.userData.pieceList = pieceList;

  const propList = [];
  const usingSavedProps = Array.isArray(props);
  const sourceProps = usingSavedProps
    ? props
    : preset.props
      ? preset.props(rng, { length, width })
      : [];
  sourceProps.forEach((placement, index) => {
    const requestedType =
      placement && ASSET_TYPES[placement.type] ? placement.type : "crate";
    const requestedSize = Number(placement?.size);
    const sizeValue = Number.isFinite(requestedSize)
      ? requestedSize
      : (propScaleValue * (0.7 + rng() * 0.6)).toFixed(3);
    const size =
      Math.round(Math.min(100, Math.max(0.01, sizeValue)) * 1000) / 1000;
    const randomX = (rng() - 0.5) * (length - cell * 1.6);
    const randomZ = (rng() - 0.5) * (width - cell * 1.6);
    const x = Number.isFinite(Number(placement?.x))
      ? Number(placement.x)
      : randomX;
    const z = Number.isFinite(Number(placement?.z))
      ? Number(placement.z)
      : randomZ;
    const propSeed = Number.isFinite(Number(placement?.seed))
      ? Math.floor(Number(placement.seed))
      : Math.floor(rng() * 100000);
    const model = generateAsset(requestedType, {
      size,
      segments,
      style,
      color,
      seed: propSeed,
      material,
      texture,
      textureStrength,
      textureSize,
    });
    model.name = `${presetId}-${requestedType}-${index + 1}`;
    model.traverse((child) => {
      if (child.isMesh) child.name = `${model.name}-${child.name}`;
    });
    const randomRotation = Math.floor(rng() * 8) * (Math.PI / 4);
    const rotationY = Number.isFinite(Number(placement?.rotationY))
      ? Number(placement.rotationY)
      : randomRotation;
    model.rotation.y = rotationY;
    const restingBox = new THREE.Box3().setFromObject(model);
    const restingY = Number.isFinite(Number(placement?.y))
      ? Number(placement.y)
      : slab - restingBox.min.y;
    model.position.set(x, restingY, z);
    const placedBox = new THREE.Box3().setFromObject(model);
    propList.push({
      name: model.name,
      type: requestedType,
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
      collision: getColliderShape(requestedType),
    });
    group.add(model);
  });
  group.userData.propList = propList;
  group.userData.props = propList.length;

  // Center the whole scene after pieces and props settle, then measure it.
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);
  const centeredBox = new THREE.Box3().setFromObject(group);
  group.userData.extent = {
    width: centeredBox.max.x - centeredBox.min.x,
    depth: centeredBox.max.z - centeredBox.min.z,
    height: centeredBox.max.y - centeredBox.min.y,
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
      textureSize: theme.textureSize ?? 256,
    });
    model.name = `${scene.userData.kit || "kit"}-${requestedType}-${index + 1}`;
    model.traverse((child) => {
      if (child.isMesh) child.name = `${model.name}-${child.name}`;
    });
    currentModel.removeFromParent();
    scene.add(model);
  }

  model.position.set(x, y ?? 0, z);
  model.rotation.y = rotationY;
  // The composed scene group is centered after assembly, so measure the prop
  // against its own geometry instead of the shifted world bounds. Otherwise
  // edits inherit the centering offset and float above the floor.
  const restingBox = new THREE.Box3().setFromObject(model);
  if (y === null)
    model.position.y =
      (scene.userData.floorY ?? 0.06) -
      (restingBox.min.y - (scene.position.y || 0));

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
    textureSize: theme.textureSize ?? 256,
  });
  const kit = scene.userData.kit || "kit";
  model.name = `${kit}-${type}-${index + 1}`;
  model.traverse((child) => {
    if (child.isMesh) child.name = `${model.name}-${child.name}`;
  });
  model.position.set(x, 0, z);
  model.rotation.y = rotationY;
  // Generated assets are centered on their origin, so an unset height rests the
  // prop on the ground instead of sinking half of it below the pavers.
  const restingBox = new THREE.Box3().setFromObject(model);
  const requestedY = Number(placement.y);
  model.position.y = Number.isFinite(requestedY)
    ? requestedY
    : (scene.userData.floorY ?? 0.06) - restingBox.min.y;
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

  // Propeller
  const propellerGroup = new THREE.Group();
  propellerGroup.position.set(0, 0, 1.45 * size);
  propellerGroup.name = "propeller";
  const bladeGeo = new THREE.BoxGeometry(0.06 * size, 0.9 * size, 0.03 * size);
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(bladeGeo, engineMat);
    blade.rotation.z = (i * Math.PI) / 2;
    blade.name = `blade-${i}`;
    propellerGroup.add(blade);
  }
  group.add(propellerGroup);
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

function buildGate(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const woodMat = createMaterial(customColor || 0x795548, style);
  const metalMat = createMaterial(0x546e7a, style);

  const posts = new THREE.Group();
  posts.name = "posts";
  const postGeo = new THREE.BoxGeometry(0.18 * size, 2.2 * size, 0.18 * size);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, woodMat);
    post.position.set(side * 1.12 * size, 0, 0);
    post.name = side < 0 ? "post-left" : "post-right";
    posts.add(post);
  }
  group.add(posts);

  const crossbarGeo = new THREE.BoxGeometry(
    2.5 * size,
    0.2 * size,
    0.14 * size,
  );
  const crossbar = new THREE.Mesh(crossbarGeo, woodMat);
  crossbar.position.y = 2.02 * size;
  crossbar.name = "crossbar";
  group.add(crossbar);

  const lattice = new THREE.Group();
  lattice.name = "lattice";
  const plankGeo = new THREE.BoxGeometry(0.08 * size, 0.92 * size, 0.08 * size);
  for (let i = 0; i < 4; i++) {
    const x = (-0.8 + i * 0.53 + rng() * 0.08) * size;
    const plank = new THREE.Mesh(plankGeo, woodMat);
    plank.position.set(x, 1.25 * size, 0);
    plank.rotation.z = (rng() - 0.5) * 0.06;
    plank.name = `plank-${i}`;
    lattice.add(plank);
  }
  const railGeo = new THREE.BoxGeometry(1.9 * size, 0.1 * size, 0.08 * size);
  const rail = new THREE.Mesh(railGeo, woodMat);
  rail.position.y = 1.72 * size;
  rail.name = "rail";
  lattice.add(rail);
  group.add(lattice);

  const handleGeo = new THREE.TorusGeometry(0.09 * size, 0.025 * size, 8, 12);
  const handle = new THREE.Mesh(handleGeo, metalMat);
  handle.position.set(0.72 * size, 1.12 * size, 0.11 * size);
  handle.name = "handle";
  group.add(handle);
}

function buildWagon(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const woodMat = createMaterial(customColor || 0x8d6e63, style);
  const wheelMat = createMaterial(0x4e342e, style);
  const cargoMat = createMaterial(0xa1887f, style);

  const bedGeo = new THREE.BoxGeometry(1.9 * size, 0.16 * size, 1.1 * size);
  const bed = new THREE.Mesh(bedGeo, woodMat);
  bed.name = "bed";
  group.add(bed);

  const sideGeo = new THREE.BoxGeometry(1.9 * size, 0.34 * size, 0.07 * size);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(sideGeo, woodMat);
    wall.position.set(0, 0.25 * size, side * 0.55 * size);
    wall.name = side < 0 ? "side-back" : "side-front";
    group.add(wall);
  }

  const wheels = new THREE.Group();
  wheels.name = "wheels";
  const wheelGeo = new THREE.CylinderGeometry(
    0.42 * size,
    0.42 * size,
    0.09 * size,
    10,
  );
  for (let i = 0; i < 4; i++) {
    const x = (i % 2 === 0 ? -0.72 : 0.72) * size;
    const z = (i < 2 ? -1 : 1) * 0.58 * size;
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, -0.42 * size, z);
    wheel.name = `wheel-${i}`;
    wheels.add(wheel);
  }
  group.add(wheels);

  const tongueGeo = new THREE.BoxGeometry(
    1.15 * size,
    0.09 * size,
    0.14 * size,
  );
  const tongue = new THREE.Mesh(tongueGeo, woodMat);
  tongue.position.set(1.12 * size, -0.24 * size, 0);
  tongue.name = "tongue";
  group.add(tongue);

  const cargo = new THREE.Group();
  cargo.name = "cargo";
  const crateGeo = new THREE.BoxGeometry(0.72 * size, 0.62 * size, 0.72 * size);
  const crate = new THREE.Mesh(crateGeo, cargoMat);
  crate.position.y = 0.55 * size;
  crate.name = "crate";
  cargo.add(crate);
  if (rng() > 0.5) {
    const sackGeo = new THREE.SphereGeometry(
      0.2 * size,
      Math.max(8, segments),
      Math.max(6, segments >> 1),
    );
    const sack = new THREE.Mesh(sackGeo, cargoMat);
    sack.position.set(0.35 * size, 0.45 * size, 0);
    sack.scale.set(1, 0.8, 1);
    sack.name = "sack";
    cargo.add(sack);
  }
  group.add(cargo);
}

function buildCannon(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const barrelMat = createMaterial(customColor || 0x6d4c41, style);
  const ironMat = createMaterial(0x37474f, style);
  const woodMat = createMaterial(0x6d4c2f, style);

  const barrelGeo = new THREE.CylinderGeometry(
    0.13 * size,
    0.19 * size,
    1.7 * size,
    segments,
  );
  const barrel = new THREE.Mesh(barrelGeo, barrelMat);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.y = 0.26 * size;
  barrel.name = "barrel";
  group.add(barrel);

  const muzzleGeo = new THREE.TorusGeometry(
    0.15 * size,
    0.06 * size,
    8,
    segments,
  );
  const muzzle = new THREE.Mesh(muzzleGeo, ironMat);
  muzzle.rotation.y = Math.PI / 2;
  muzzle.position.set(-0.98 * size, 0.26 * size, 0);
  muzzle.name = "muzzle";
  group.add(muzzle);

  const carriage = new THREE.Group();
  carriage.name = "carriage";
  const sideGeo = new THREE.BoxGeometry(0.08 * size, 0.5 * size, 1.15 * size);
  for (const side of [-1, 1]) {
    const sideWall = new THREE.Mesh(sideGeo, woodMat);
    sideWall.position.set(0, -0.12 * size, side * 0.42 * size);
    sideWall.name = side < 0 ? "wall-left" : "wall-right";
    carriage.add(sideWall);
  }
  const axleGeo = new THREE.CylinderGeometry(
    0.06 * size,
    0.06 * size,
    1.2 * size,
    8,
  );
  const axle = new THREE.Mesh(axleGeo, ironMat);
  axle.rotation.x = Math.PI / 2;
  axle.position.y = -0.34 * size;
  axle.name = "axle";
  carriage.add(axle);
  group.add(carriage);

  const wheels = new THREE.Group();
  wheels.name = "wheels";
  const wheelGeo = new THREE.CylinderGeometry(
    0.48 * size,
    0.48 * size,
    0.12 * size,
    10,
  );
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(wheelGeo, woodMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, -0.48 * size, side * 0.55 * size);
    wheel.name = side < 0 ? "wheel-left" : "wheel-right";
    wheels.add(wheel);
  }
  group.add(wheels);

  const rammerGeo = new THREE.CylinderGeometry(
    0.035 * size,
    0.05 * size,
    1.6 * size,
    8,
  );
  const rammer = new THREE.Mesh(rammerGeo, woodMat);
  rammer.position.set(0.55 * size, -0.38 * size, 0);
  rammer.rotation.z = 0.25;
  rammer.name = "rammer";
  group.add(rammer);
}

function buildGrave(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const earthMat = createMaterial(0x6d4c41, style);
  const stoneMat = createMaterial(customColor || 0x9e9e9e, style);
  const woodMat = createMaterial(0x795548, style);
  const flowerMat = createMaterial(0xff8a65, style);

  const moundGeo = new THREE.SphereGeometry(
    0.7 * size,
    segments,
    Math.max(6, segments >> 1),
  );
  const mound = new THREE.Mesh(moundGeo, earthMat);
  mound.position.y = -0.13 * size;
  mound.scale.set(1.25, 0.3, 0.85);
  mound.name = "mound";
  group.add(mound);

  const stoneGeo = new THREE.BoxGeometry(0.62 * size, 0.86 * size, 0.14 * size);
  const stone = new THREE.Mesh(stoneGeo, stoneMat);
  stone.position.set(-0.22 * size, 0.3 * size, 0);
  stone.rotation.z = 0.06;
  stone.name = "stone";
  group.add(stone);

  const cross = new THREE.Group();
  cross.name = "cross";
  const armGeo = new THREE.BoxGeometry(0.34 * size, 0.08 * size, 0.06 * size);
  const arm = new THREE.Mesh(armGeo, woodMat);
  arm.position.y = 0.75 * size;
  arm.name = "arm";
  cross.add(arm);
  const postGeo = new THREE.BoxGeometry(0.1 * size, 0.5 * size, 0.06 * size);
  const post = new THREE.Mesh(postGeo, woodMat);
  post.position.y = 0.38 * size;
  post.name = "post";
  cross.add(post);
  cross.position.set(0.3 * size, 0.03 * size, 0);
  group.add(cross);

  const flowers = new THREE.Group();
  flowers.name = "flowers";
  const bloomGeo = new THREE.SphereGeometry(0.07 * size, 8, 6);
  for (let i = 0; i < 3; i++) {
    const bloom = new THREE.Mesh(bloomGeo, flowerMat);
    const angle = -0.9 + i * 0.9;
    bloom.position.set(
      Math.cos(angle) * 0.42 * size,
      -0.02 * size,
      Math.sin(angle) * 0.42 * size,
    );
    bloom.name = `bloom-${i}`;
    flowers.add(bloom);
  }
  group.add(flowers);
}

function buildLadder(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const railMat = createMaterial(customColor || 0xa1887f, style);
  const rungMat = createMaterial(0x795548, style);
  const tipMat = createMaterial(0x37474f, style);

  const rails = new THREE.Group();
  rails.name = "rails";
  const railGeo = new THREE.BoxGeometry(0.09 * size, 2.35 * size, 0.07 * size);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(side * 0.36 * size, 0, 0);
    rail.rotation.z = side * 0.08;
    rail.name = side < 0 ? "rail-left" : "rail-right";
    rails.add(rail);
  }
  group.add(rails);

  const rungs = new THREE.Group();
  rungs.name = "rungs";
  const rungGeo = new THREE.BoxGeometry(0.66 * size, 0.07 * size, 0.07 * size);
  for (let i = 0; i < 6; i++) {
    const rung = new THREE.Mesh(rungGeo, rungMat);
    rung.position.y = (-1.0 + i * 0.42) * size;
    rung.name = `rung-${i}`;
    rungs.add(rung);
  }
  group.add(rungs);

  const tips = new THREE.Group();
  tips.name = "tips";
  const tipGeo = new THREE.CylinderGeometry(
    0.06 * size,
    0.06 * size,
    0.08 * size,
    8,
  );
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.set(side * 0.36 * size, -1.2 * size, 0);
    tip.name = side < 0 ? "tip-left" : "tip-right";
    tips.add(tip);
  }
  group.add(tips);
}

function buildCandelabra(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const metalMat = createMaterial(customColor || 0xb08d57, style);
  const candleMat = createMaterial(0xfff8e1, style);
  const flameMat = createMaterial(0xffb300, style);
  flameMat.emissive = new THREE.Color(0xff6f00);
  flameMat.emissiveIntensity = 1.5;

  const baseGeo = new THREE.CylinderGeometry(
    0.34 * size,
    0.42 * size,
    0.16 * size,
    segments,
  );
  const base = new THREE.Mesh(baseGeo, metalMat);
  base.position.y = -0.62 * size;
  base.name = "base";
  group.add(base);

  const stemGeo = new THREE.CylinderGeometry(
    0.07 * size,
    0.12 * size,
    1.05 * size,
    segments,
  );
  const stem = new THREE.Mesh(stemGeo, metalMat);
  stem.position.y = -0.05 * size;
  stem.name = "stem";
  group.add(stem);

  const arms = new THREE.Group();
  arms.name = "arms";
  const armGeo = new THREE.CylinderGeometry(
    0.035 * size,
    0.055 * size,
    0.42 * size,
    8,
  );
  const angles = [-0.7, 0.7];
  for (let i = 0; i < 2; i++) {
    const arm = new THREE.Mesh(armGeo, metalMat);
    arm.position.set(Math.sin(angles[i]) * 0.16 * size, 0.12 * size, 0);
    arm.rotation.z = Math.PI / 2 + angles[i];
    arm.name = `arm-${i}`;
    arms.add(arm);
  }
  group.add(arms);

  const candles = new THREE.Group();
  candles.name = "candles";
  const candleGeo = new THREE.CylinderGeometry(
    0.06 * size,
    0.06 * size,
    0.3 * size,
    8,
  );
  const candlePositions = [
    [0, 0.42 * size],
    [0.6 * size, 0.34 * size],
    [-0.6 * size, 0.34 * size],
  ];
  for (let i = 0; i < 3; i++) {
    const [x, y] = candlePositions[i];
    const candle = new THREE.Mesh(candleGeo, candleMat);
    candle.position.set(x, y, 0);
    candle.name = `candle-${i}`;
    candles.add(candle);

    const flameGeo = new THREE.ConeGeometry(0.045 * size, 0.13 * size, 6);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(x, y + 0.21 * size, 0);
    flame.name = `flame-${i}`;
    candles.add(flame);
  }
  group.add(candles);
}

function buildAnvil(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const ironMat = createMaterial(customColor || 0x455a64, style);
  const darkMat = createMaterial(0x37474f, style);

  const baseGeo = new THREE.BoxGeometry(0.9 * size, 0.18 * size, 0.48 * size);
  const base = new THREE.Mesh(baseGeo, darkMat);
  base.position.y = -0.42 * size;
  base.name = "base";
  group.add(base);

  const waistGeo = new THREE.BoxGeometry(0.58 * size, 0.2 * size, 0.34 * size);
  const waist = new THREE.Mesh(waistGeo, ironMat);
  waist.position.y = -0.23 * size;
  waist.name = "waist";
  group.add(waist);

  const bodyGeo = new THREE.BoxGeometry(0.44 * size, 0.3 * size, 0.3 * size);
  const body = new THREE.Mesh(bodyGeo, ironMat);
  body.position.y = 0.02 * size;
  body.name = "body";
  group.add(body);

  const faceGeo = new THREE.BoxGeometry(0.34 * size, 0.1 * size, 0.26 * size);
  const face = new THREE.Mesh(faceGeo, ironMat);
  face.position.y = 0.24 * size;
  face.name = "face";
  group.add(face);

  const hornGeo = new THREE.ConeGeometry(0.1 * size, 0.56 * size, 8);
  const horn = new THREE.Mesh(hornGeo, ironMat);
  horn.rotation.z = -Math.PI / 2;
  horn.position.set(0.52 * size, 0.08 * size, 0);
  horn.name = "horn";
  group.add(horn);
}

function buildBookshelf(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const woodMat = createMaterial(customColor || 0x8d6e63, style);
  const darkMat = createMaterial(0x5d4037, style);
  const bookColors = [
    0xc62828, 0x2e7d32, 0x1565c0, 0xf9a825, 0x6a1b9a, 0x00838f,
  ];

  const frame = new THREE.Group();
  frame.name = "frame";
  const sideGeo = new THREE.BoxGeometry(0.1 * size, 1.9 * size, 0.36 * size);
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(sideGeo, woodMat);
    panel.position.set(side * 0.55 * size, 0, 0);
    panel.name = side < 0 ? "side-left" : "side-right";
    frame.add(panel);
  }
  const railGeo = new THREE.BoxGeometry(1.2 * size, 0.12 * size, 0.36 * size);
  for (const end of [-1, 1]) {
    const rail = new THREE.Mesh(railGeo, woodMat);
    rail.position.y = end * 0.95 * size;
    rail.name = end < 0 ? "rail-bottom" : "rail-top";
    frame.add(rail);
  }
  group.add(frame);

  const shelves = new THREE.Group();
  shelves.name = "shelves";
  const shelfGeo = new THREE.BoxGeometry(1.08 * size, 0.08 * size, 0.34 * size);
  for (let i = 0; i < 4; i++) {
    const shelf = new THREE.Mesh(shelfGeo, darkMat);
    shelf.position.y = (-0.65 + i * 0.44) * size;
    shelf.name = `shelf-${i}`;
    shelves.add(shelf);
  }
  group.add(shelves);

  const books = new THREE.Group();
  books.name = "books";
  const heights = [0.34, 0.28, 0.4, 0.31];
  for (let row = 0; row < 3; row++) {
    const shelfY = -0.65 + row * 0.44;
    for (let i = 0; i < 5; i++) {
      const bookMat = createMaterial(
        bookColors[(i + row * 2) % bookColors.length],
        style,
      );
      const bookGeo = new THREE.BoxGeometry(
        0.11 * size,
        heights[i % heights.length] * size,
        0.22 * size,
      );
      const book = new THREE.Mesh(bookGeo, bookMat);
      book.position.set((-0.4 + i * 0.16) * size, (shelfY + 0.18) * size, 0);
      if (i === 4 && rng() > 0.4) book.rotation.z = 0.12;
      book.name = `book-${row}-${i}`;
      books.add(book);
    }
  }
  group.add(books);
}

function buildCauldron(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const ironMat = createMaterial(customColor || 0x37474f, style);
  const rimMat = createMaterial(0x546e7a, style);
  const brewMat = createMaterial(0x2e7d32, style);

  const potGeo = new THREE.SphereGeometry(
    0.42 * size,
    segments,
    Math.max(6, segments >> 1),
  );
  const pot = new THREE.Mesh(potGeo, ironMat);
  pot.position.y = -0.05 * size;
  pot.scale.set(1, 0.82, 1);
  pot.name = "pot";
  group.add(pot);

  const rimGeo = new THREE.TorusGeometry(
    0.42 * size,
    0.055 * size,
    8,
    segments,
  );
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.3 * size;
  rim.name = "rim";
  group.add(rim);

  const brewGeo = new THREE.CylinderGeometry(
    0.3 * size,
    0.3 * size,
    0.07 * size,
    segments,
  );
  const brew = new THREE.Mesh(brewGeo, brewMat);
  brew.position.y = 0.26 * size;
  brew.name = "brew";
  group.add(brew);

  const legs = new THREE.Group();
  legs.name = "legs";
  const legGeo = new THREE.CylinderGeometry(
    0.045 * size,
    0.07 * size,
    0.3 * size,
    6,
  );
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(legGeo, ironMat);
    leg.position.set(
      Math.cos(angle) * 0.24 * size,
      -0.52 * size,
      Math.sin(angle) * 0.24 * size,
    );
    leg.rotation.z = Math.cos(angle) * 0.2;
    leg.rotation.x = -Math.sin(angle) * 0.2;
    leg.name = `leg-${i}`;
    legs.add(leg);
  }
  group.add(legs);

  const handles = new THREE.Group();
  handles.name = "handles";
  const handleGeo = new THREE.TorusGeometry(0.09 * size, 0.022 * size, 6, 10);
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(handleGeo, rimMat);
    handle.position.set(side * 0.42 * size, 0.24 * size, 0);
    handle.rotation.z = Math.PI / 2;
    handle.name = side < 0 ? "handle-left" : "handle-right";
    handles.add(handle);
  }
  group.add(handles);
}

function buildThrone(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const woodMat = createMaterial(customColor || 0x6d4c41, style);
  const clothMat = createMaterial(0x8e24aa, style);
  const goldMat = createMaterial(0xffb300, style);

  const baseGeo = new THREE.BoxGeometry(1.05 * size, 0.14 * size, 0.72 * size);
  const base = new THREE.Mesh(baseGeo, woodMat);
  base.position.y = -0.55 * size;
  base.name = "base";
  group.add(base);

  const seatGeo = new THREE.BoxGeometry(0.78 * size, 0.18 * size, 0.58 * size);
  const seat = new THREE.Mesh(seatGeo, clothMat);
  seat.position.y = -0.38 * size;
  seat.name = "seat";
  group.add(seat);

  const backGeo = new THREE.BoxGeometry(0.9 * size, 0.92 * size, 0.12 * size);
  const back = new THREE.Mesh(backGeo, woodMat);
  back.position.set(0, 0.16 * size, -0.3 * size);
  back.rotation.x = 0.08;
  back.name = "back";
  group.add(back);

  const crestGeo = new THREE.BoxGeometry(0.96 * size, 0.14 * size, 0.16 * size);
  const crest = new THREE.Mesh(crestGeo, goldMat);
  crest.position.set(0, 0.68 * size, -0.28 * size);
  crest.name = "crest";
  group.add(crest);

  const finialGeo = new THREE.SphereGeometry(0.07 * size, 8, 6);
  const finial = new THREE.Mesh(finialGeo, goldMat);
  finial.position.set(0, 0.78 * size, -0.26 * size);
  finial.name = "finial";
  group.add(finial);

  const arms = new THREE.Group();
  arms.name = "arms";
  const armGeo = new THREE.BoxGeometry(0.16 * size, 0.34 * size, 0.5 * size);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, woodMat);
    arm.position.set(side * 0.5 * size, -0.18 * size, 0.03 * size);
    arm.name = side < 0 ? "arm-left" : "arm-right";
    arms.add(arm);
  }
  group.add(arms);
}

function buildBench(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const woodMat = createMaterial(customColor || 0x8d6e63, style);
  const darkMat = createMaterial(0x5d4037, style);

  const seatGeo = new THREE.BoxGeometry(1.5 * size, 0.1 * size, 0.46 * size);
  const seat = new THREE.Mesh(seatGeo, woodMat);
  seat.position.y = 0.42 * size;
  seat.name = "seat";
  group.add(seat);

  const legs = new THREE.Group();
  legs.name = "legs";
  const legGeo = new THREE.BoxGeometry(0.1 * size, 0.42 * size, 0.08 * size);
  const legSpots = [
    [-0.62, -0.19],
    [0.62, -0.19],
    [-0.62, 0.19],
    [0.62, 0.19],
  ];
  for (let i = 0; i < legSpots.length; i++) {
    const [x, z] = legSpots[i];
    const leg = new THREE.Mesh(legGeo, darkMat);
    leg.position.set(x * size, 0.21 * size, z * size);
    leg.name = `leg-${i}`;
    legs.add(leg);
  }
  const braceGeo = new THREE.BoxGeometry(0.07 * size, 0.4 * size, 0.07 * size);
  const brace = new THREE.Mesh(braceGeo, darkMat);
  brace.position.set(0, 0.2 * size, 0);
  brace.rotation.y = Math.PI / 2;
  brace.name = "brace";
  legs.add(brace);
  group.add(legs);

  const backrest = new THREE.Group();
  backrest.name = "backrest";
  const topGeo = new THREE.BoxGeometry(1.42 * size, 0.1 * size, 0.07 * size);
  const top = new THREE.Mesh(topGeo, woodMat);
  top.position.set(0, 0.74 * size, -0.2 * size);
  top.name = "top";
  backrest.add(top);
  const slatGeo = new THREE.BoxGeometry(1.4 * size, 0.07 * size, 0.06 * size);
  for (let i = 0; i < 2; i++) {
    const slat = new THREE.Mesh(slatGeo, woodMat);
    slat.position.set(0, (0.6 + i * 0.14) * size, -0.2 * size);
    slat.name = `slat-${i}`;
    backrest.add(slat);
  }
  const supportGeo = new THREE.BoxGeometry(
    0.1 * size,
    0.42 * size,
    0.07 * size,
  );
  for (const side of [-1, 1]) {
    const support = new THREE.Mesh(supportGeo, darkMat);
    support.position.set(side * 0.64 * size, 0.56 * size, -0.2 * size);
    support.name = side < 0 ? "support-left" : "support-right";
    backrest.add(support);
  }
  group.add(backrest);
}

function buildLantern(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const metalMat = createMaterial(customColor || 0x455a64, style);
  const glassMat = createMaterial(0xffe082, style);
  glassMat.transparent = true;
  glassMat.opacity = 0.5;
  const candleMat = createMaterial(0xfff8e1, style);
  const flameMat = createMaterial(0xffb300, style);
  flameMat.emissive = new THREE.Color(0xff6f00);
  flameMat.emissiveIntensity = 1.6;

  const frame = new THREE.Group();
  frame.name = "frame";
  const capGeo = new THREE.ConeGeometry(0.2 * size, 0.12 * size, segments);
  const cap = new THREE.Mesh(capGeo, metalMat);
  cap.position.y = 0.32 * size;
  cap.name = "cap";
  frame.add(cap);
  const baseGeo = new THREE.CylinderGeometry(
    0.2 * size,
    0.22 * size,
    0.08 * size,
    segments,
  );
  const base = new THREE.Mesh(baseGeo, metalMat);
  base.position.y = -0.24 * size;
  base.name = "base";
  frame.add(base);
  const postGeo = new THREE.BoxGeometry(0.035 * size, 0.6 * size, 0.035 * size);
  const postSpots = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (let i = 0; i < postSpots.length; i++) {
    const [sx, sz] = postSpots[i];
    const post = new THREE.Mesh(postGeo, metalMat);
    post.position.set(0.15 * sx * size, 0.02 * size, 0.15 * sz * size);
    post.name = `post-${i}`;
    frame.add(post);
  }
  group.add(frame);

  const glassGeo = new THREE.BoxGeometry(0.28 * size, 0.46 * size, 0.28 * size);
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.y = 0.02 * size;
  glass.name = "glass";
  group.add(glass);

  const candleGeo = new THREE.CylinderGeometry(
    0.05 * size,
    0.06 * size,
    0.16 * size,
    8,
  );
  const candle = new THREE.Mesh(candleGeo, candleMat);
  candle.position.y = 0.08 * size;
  candle.name = "candle";
  group.add(candle);

  const flameGeo = new THREE.ConeGeometry(0.045 * size, 0.14 * size, 6);
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.y = 0.22 * size;
  flame.name = "flame";
  group.add(flame);

  const hookGeo = new THREE.TorusGeometry(0.06 * size, 0.015 * size, 6, 10);
  const hook = new THREE.Mesh(hookGeo, metalMat);
  hook.position.y = 0.42 * size;
  hook.name = "hook";
  group.add(hook);
}

function buildTable(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const woodMat = createMaterial(customColor || 0x8d6e63, style);
  const darkMat = createMaterial(0x5d4037, style);

  const topGeo = new THREE.BoxGeometry(1.5 * size, 0.08 * size, 0.9 * size);
  const top = new THREE.Mesh(topGeo, woodMat);
  top.position.y = 0.78 * size;
  top.name = "top";
  group.add(top);

  const apronGeo = new THREE.BoxGeometry(1.38 * size, 0.1 * size, 0.78 * size);
  const apron = new THREE.Mesh(apronGeo, darkMat);
  apron.position.y = 0.69 * size;
  apron.name = "apron";
  group.add(apron);

  const legs = new THREE.Group();
  legs.name = "legs";
  const legGeo = new THREE.BoxGeometry(0.09 * size, 0.7 * size, 0.09 * size);
  const legSpots = [
    [-0.65, -0.36],
    [0.65, -0.36],
    [-0.65, 0.36],
    [0.65, 0.36],
  ];
  for (let i = 0; i < legSpots.length; i++) {
    const [x, z] = legSpots[i];
    const leg = new THREE.Mesh(legGeo, darkMat);
    leg.position.set(x * size, 0.35 * size, z * size);
    leg.name = `leg-${i}`;
    legs.add(leg);
  }
  group.add(legs);
}

function buildChair(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const woodMat = createMaterial(customColor || 0x8d6e63, style);
  const darkMat = createMaterial(0x5d4037, style);

  const seatGeo = new THREE.BoxGeometry(0.55 * size, 0.08 * size, 0.5 * size);
  const seat = new THREE.Mesh(seatGeo, woodMat);
  seat.position.y = 0.46 * size;
  seat.name = "seat";
  group.add(seat);

  const legs = new THREE.Group();
  legs.name = "legs";
  const legGeo = new THREE.BoxGeometry(0.06 * size, 0.46 * size, 0.06 * size);
  const legSpots = [
    [-0.22, -0.19],
    [0.22, -0.19],
    [-0.22, 0.19],
    [0.22, 0.19],
  ];
  for (let i = 0; i < legSpots.length; i++) {
    const [x, z] = legSpots[i];
    const leg = new THREE.Mesh(legGeo, darkMat);
    leg.position.set(x * size, 0.23 * size, z * size);
    leg.name = `leg-${i}`;
    legs.add(leg);
  }
  group.add(legs);

  const back = new THREE.Group();
  back.name = "back";
  const topGeo = new THREE.BoxGeometry(0.55 * size, 0.1 * size, 0.06 * size);
  const top = new THREE.Mesh(topGeo, woodMat);
  top.position.set(0, 0.82 * size, -0.24 * size);
  top.name = "top";
  back.add(top);
  const slatGeo = new THREE.BoxGeometry(0.06 * size, 0.36 * size, 0.05 * size);
  for (let i = 0; i < 3; i++) {
    const slat = new THREE.Mesh(slatGeo, darkMat);
    slat.position.set((-0.17 + i * 0.17) * size, 0.62 * size, -0.24 * size);
    slat.name = `slat-${i}`;
    back.add(slat);
  }
  group.add(back);
}

function buildBed(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const woodMat = createMaterial(customColor || 0x6d4c41, style);
  const clothMat = createMaterial(0xcfd8dc, style);
  const blanketMat = createMaterial(0x8e24aa, style);
  const pillowMat = createMaterial(0xfafafa, style);

  const frame = new THREE.Group();
  frame.name = "frame";
  const baseGeo = new THREE.BoxGeometry(1.5 * size, 0.16 * size, 0.9 * size);
  const base = new THREE.Mesh(baseGeo, woodMat);
  base.position.y = 0.08 * size;
  base.name = "base";
  frame.add(base);
  const headGeo = new THREE.BoxGeometry(1.5 * size, 0.42 * size, 0.08 * size);
  const head = new THREE.Mesh(headGeo, woodMat);
  head.position.set(0, 0.35 * size, -0.45 * size);
  head.name = "headboard";
  frame.add(head);
  const footGeo = new THREE.BoxGeometry(1.5 * size, 0.24 * size, 0.07 * size);
  const foot = new THREE.Mesh(footGeo, woodMat);
  foot.position.set(0, 0.2 * size, 0.45 * size);
  foot.name = "footboard";
  frame.add(foot);
  group.add(frame);

  const mattressGeo = new THREE.BoxGeometry(
    1.4 * size,
    0.2 * size,
    0.82 * size,
  );
  const mattress = new THREE.Mesh(mattressGeo, clothMat);
  mattress.position.y = 0.26 * size;
  mattress.name = "mattress";
  group.add(mattress);

  const pillowGeo = new THREE.BoxGeometry(0.42 * size, 0.1 * size, 0.24 * size);
  const pillow = new THREE.Mesh(pillowGeo, pillowMat);
  pillow.position.set(0, 0.37 * size, -0.32 * size);
  pillow.rotation.x = 0.06;
  pillow.name = "pillow";
  group.add(pillow);

  const blanketGeo = new THREE.BoxGeometry(
    1.38 * size,
    0.08 * size,
    0.55 * size,
  );
  const blanket = new THREE.Mesh(blanketGeo, blanketMat);
  blanket.position.set(0, 0.37 * size, 0.16 * size);
  blanket.name = "blanket";
  group.add(blanket);
}

function buildChandelier(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const metalMat = createMaterial(customColor || 0xbfa468, style);
  const candleMat = createMaterial(0xfff8e1, style);
  const flameMat = createMaterial(0xffb300, style);
  flameMat.emissive = new THREE.Color(0xff6f00);
  flameMat.emissiveIntensity = 1.4;

  const chain = new THREE.Group();
  chain.name = "chain";
  const linkGeo = new THREE.TorusGeometry(0.035 * size, 0.012 * size, 6, 8);
  for (let i = 0; i < 5; i++) {
    const link = new THREE.Mesh(linkGeo, metalMat);
    link.position.y = (0.62 - i * 0.09) * size;
    link.name = `link-${i}`;
    chain.add(link);
  }
  group.add(chain);

  const coreGeo = new THREE.SphereGeometry(
    0.1 * size,
    segments,
    Math.max(6, segments >> 1),
  );
  const core = new THREE.Mesh(coreGeo, metalMat);
  core.position.y = 0.18 * size;
  core.name = "core";
  group.add(core);

  const arms = new THREE.Group();
  arms.name = "arms";
  const armCount = 6;
  for (let i = 0; i < armCount; i++) {
    const angle = (i / armCount) * Math.PI * 2;
    const armGeo = new THREE.CylinderGeometry(
      0.02 * size,
      0.03 * size,
      0.3 * size,
      6,
    );
    const arm = new THREE.Mesh(armGeo, metalMat);
    arm.position.set(
      Math.cos(angle) * 0.15 * size,
      0.14 * size,
      Math.sin(angle) * 0.15 * size,
    );
    arm.rotation.z = Math.cos(angle) * 0.5;
    arm.rotation.x = Math.sin(angle) * 0.5;
    arm.name = `arm-${i}`;
    arms.add(arm);
  }
  group.add(arms);

  const candles = new THREE.Group();
  candles.name = "candles";
  for (let i = 0; i < armCount; i++) {
    const angle = (i / armCount) * Math.PI * 2;
    const candleGeo = new THREE.CylinderGeometry(
      0.025 * size,
      0.028 * size,
      0.09 * size,
      6,
    );
    const candle = new THREE.Mesh(candleGeo, candleMat);
    candle.position.set(
      Math.cos(angle) * 0.28 * size,
      0.09 * size,
      Math.sin(angle) * 0.28 * size,
    );
    candle.name = `candle-${i}`;
    candles.add(candle);

    const flameGeo = new THREE.ConeGeometry(0.022 * size, 0.07 * size, 6);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(
      Math.cos(angle) * 0.28 * size,
      0.16 * size,
      Math.sin(angle) * 0.28 * size,
    );
    flame.name = `flame-${i}`;
    candles.add(flame);
  }
  group.add(candles);
}

function buildArmorStand(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const metalMat = createMaterial(customColor || 0x90a4ae, style);
  const darkMat = createMaterial(0x37474f, style);
  const woodMat = createMaterial(0x6d4c41, style);

  const baseGeo = new THREE.CylinderGeometry(
    0.3 * size,
    0.36 * size,
    0.08 * size,
    segments,
  );
  const base = new THREE.Mesh(baseGeo, woodMat);
  base.position.y = 0.04 * size;
  base.name = "base";
  group.add(base);

  const poleGeo = new THREE.CylinderGeometry(
    0.035 * size,
    0.05 * size,
    1.5 * size,
    8,
  );
  const pole = new THREE.Mesh(poleGeo, darkMat);
  pole.position.y = 0.8 * size;
  pole.name = "pole";
  group.add(pole);

  const bodyGeo = new THREE.BoxGeometry(0.34 * size, 0.42 * size, 0.18 * size);
  const body = new THREE.Mesh(bodyGeo, metalMat);
  body.position.y = 1.05 * size;
  body.name = "body";
  group.add(body);

  const arms = new THREE.Group();
  arms.name = "arms";
  const armGeo = new THREE.BoxGeometry(0.09 * size, 0.34 * size, 0.09 * size);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, metalMat);
    arm.position.set(side * 0.24 * size, 1.02 * size, 0);
    arm.rotation.z = side * -0.08;
    arm.name = side < 0 ? "left-arm" : "right-arm";
    arms.add(arm);
  }
  group.add(arms);

  const helmetGeo = new THREE.SphereGeometry(
    0.11 * size,
    segments,
    Math.max(6, segments >> 1),
  );
  const helmet = new THREE.Mesh(helmetGeo, metalMat);
  helmet.position.y = 1.4 * size;
  helmet.scale.y = 1.15;
  helmet.name = "helmet";
  group.add(helmet);
}

function buildSkeleton(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const boneMat = createMaterial(customColor || 0xe0e0e0, style);
  const darkMat = createMaterial(0xbdbdbd, style);

  const skullGeo = new THREE.SphereGeometry(
    0.16 * size,
    segments,
    Math.max(6, segments >> 1),
  );
  const skull = new THREE.Mesh(skullGeo, boneMat);
  skull.position.y = 1.28 * size;
  skull.scale.set(0.9, 1.15, 1);
  skull.name = "skull";
  group.add(skull);

  const jawGeo = new THREE.BoxGeometry(0.12 * size, 0.05 * size, 0.1 * size);
  const jaw = new THREE.Mesh(jawGeo, boneMat);
  jaw.position.y = 1.12 * size;
  jaw.name = "jaw";
  group.add(jaw);

  const neckGeo = new THREE.CylinderGeometry(
    0.045 * size,
    0.05 * size,
    0.14 * size,
    6,
  );
  const neck = new THREE.Mesh(neckGeo, boneMat);
  neck.position.y = 1.03 * size;
  neck.name = "neck";
  group.add(neck);

  const ribcage = new THREE.Group();
  ribcage.name = "ribcage";
  const ribGeo = new THREE.TorusGeometry(
    0.13 * size,
    0.022 * size,
    6,
    8,
    Math.PI * 1.2,
  );
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(ribGeo, boneMat);
    rib.position.y = (0.82 - i * 0.08) * size;
    rib.scale.set(1, 1.25, 0.75);
    rib.name = `rib-${i}`;
    ribcage.add(rib);
  }
  group.add(ribcage);

  const spineGeo = new THREE.CylinderGeometry(
    0.05 * size,
    0.05 * size,
    0.5 * size,
    6,
  );
  const spine = new THREE.Mesh(spineGeo, boneMat);
  spine.position.y = 0.75 * size;
  spine.name = "spine";
  group.add(spine);

  const arms = new THREE.Group();
  arms.name = "arms";
  for (const side of [-1, 1]) {
    const upperGeo = new THREE.CylinderGeometry(
      0.035 * size,
      0.045 * size,
      0.3 * size,
      6,
    );
    const upper = new THREE.Mesh(upperGeo, boneMat);
    upper.position.set(side * 0.19 * size, 0.86 * size, 0);
    upper.rotation.z = side * -0.25;
    upper.name = side < 0 ? "left-upper" : "right-upper";
    arms.add(upper);

    const foreGeo = new THREE.CylinderGeometry(
      0.03 * size,
      0.035 * size,
      0.3 * size,
      6,
    );
    const fore = new THREE.Mesh(foreGeo, boneMat);
    fore.position.set(side * 0.29 * size, 0.6 * size, 0);
    fore.rotation.z = side * -0.25;
    fore.name = side < 0 ? "left-forearm" : "right-forearm";
    arms.add(fore);
  }
  group.add(arms);

  const legs = new THREE.Group();
  legs.name = "legs";
  for (const side of [-1, 1]) {
    const thighGeo = new THREE.CylinderGeometry(
      0.04 * size,
      0.05 * size,
      0.35 * size,
      6,
    );
    const thigh = new THREE.Mesh(thighGeo, boneMat);
    thigh.position.set(side * 0.11 * size, 0.4 * size, 0);
    thigh.name = side < 0 ? "left-thigh" : "right-thigh";
    legs.add(thigh);

    const shinGeo = new THREE.CylinderGeometry(
      0.03 * size,
      0.04 * size,
      0.35 * size,
      6,
    );
    const shin = new THREE.Mesh(shinGeo, boneMat);
    shin.position.set(side * 0.11 * size, 0.05 * size, 0);
    shin.name = side < 0 ? "left-shin" : "right-shin";
    legs.add(shin);
  }
  group.add(legs);
}

function buildBread(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const crustMat = createMaterial(customColor || 0xc68a4e, style);
  const boardMat = createMaterial(0x795548, style);
  const scoreMat = createMaterial(0x8d5a2b, style);

  const loafGeo = new THREE.CylinderGeometry(
    0.32 * size,
    0.4 * size,
    0.62 * size,
    segments,
  );
  const loaf = new THREE.Mesh(loafGeo, crustMat);
  loaf.position.y = 0.34 * size;
  loaf.name = "loaf";
  group.add(loaf);

  const domeGeo = new THREE.SphereGeometry(
    0.33 * size,
    segments,
    Math.max(6, segments >> 1),
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.5,
  );
  const dome = new THREE.Mesh(domeGeo, crustMat);
  dome.position.y = 0.6 * size;
  dome.scale.set(1.05, 0.85, 1);
  dome.name = "dome";
  group.add(dome);

  const scores = new THREE.Group();
  scores.name = "score";
  const scoreGeo = new THREE.BoxGeometry(
    0.34 * size,
    0.04 * size,
    0.025 * size,
  );
  for (let i = 0; i < 3; i++) {
    const cut = new THREE.Mesh(scoreGeo, scoreMat);
    cut.position.set(0, (0.54 + i * 0.08) * size, (0.12 - i * 0.12) * size);
    cut.rotation.x = -0.5 + i * 0.42;
    cut.name = `cut-${i}`;
    scores.add(cut);
  }
  group.add(scores);

  const boardGeo = new THREE.BoxGeometry(1.0 * size, 0.05 * size, 0.75 * size);
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.position.y = 0.025 * size;
  board.name = "board";
  group.add(board);
}

function buildPie(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const crustMat = createMaterial(customColor || 0xc68432, style);
  const dishMat = createMaterial(0x90a4ae, style);
  const fillingMat = createMaterial(0x8d3b1f, style);
  const goldMat = createMaterial(0xd7a03c, style);

  const dishGeo = new THREE.CylinderGeometry(
    0.42 * size,
    0.34 * size,
    0.13 * size,
    segments,
  );
  const dish = new THREE.Mesh(dishGeo, dishMat);
  dish.position.y = 0.065 * size;
  dish.name = "dish";
  group.add(dish);

  const fillingGeo = new THREE.CylinderGeometry(
    0.34 * size,
    0.38 * size,
    0.14 * size,
    segments,
  );
  const filling = new THREE.Mesh(fillingGeo, fillingMat);
  filling.position.y = 0.16 * size;
  filling.name = "filling";
  group.add(filling);

  const crustGeo = new THREE.SphereGeometry(
    0.36 * size,
    segments,
    Math.max(6, segments >> 1),
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.6,
  );
  const crust = new THREE.Mesh(crustGeo, goldMat);
  crust.position.y = 0.2 * size;
  crust.scale.set(1, 0.72, 1);
  crust.name = "crust";
  group.add(crust);

  const lattice = new THREE.Group();
  lattice.name = "lattice";
  const bandGeo = new THREE.BoxGeometry(0.6 * size, 0.025 * size, 0.06 * size);
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(bandGeo, crustMat);
    const offset = (-0.18 + i * 0.18) * size;
    band.rotation.y = (i === 1 ? Math.PI / 3 : -Math.PI / 6) + rng() * 0.04;
    band.position.set(offset, 0.34 * size, 0);
    band.name = `band-${i}`;
    lattice.add(band);
  }
  const crossGeo = new THREE.BoxGeometry(
    0.025 * size,
    0.03 * size,
    0.55 * size,
  );
  const cross = new THREE.Mesh(crossGeo, crustMat);
  cross.position.y = 0.34 * size;
  cross.name = "cross";
  lattice.add(cross);
  group.add(lattice);
}

function buildMeatLeg(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const meatMat = createMaterial(customColor || 0xc94f2d, style);
  const boneMat = createMaterial(0xe8e2d5, style);
  const wrapMat = createMaterial(0x4e342e, style);

  const boneGeo = new THREE.CylinderGeometry(
    0.035 * size,
    0.045 * size,
    0.55 * size,
    8,
  );
  const bone = new THREE.Mesh(boneGeo, boneMat);
  bone.position.y = 0.72 * size;
  bone.rotation.z = -0.15;
  bone.name = "bone";
  group.add(bone);

  const knobGeo = new THREE.SphereGeometry(0.06 * size, 8, 6);
  const knob = new THREE.Mesh(knobGeo, boneMat);
  knob.position.set(0.05 * size, 1.0 * size, 0);
  knob.name = "knob";
  group.add(knob);

  const meatGeo = new THREE.CapsuleGeometry(0.18 * size, 0.4 * size, 8, 10);
  const meat = new THREE.Mesh(meatGeo, meatMat);
  meat.position.y = 0.24 * size;
  meat.scale.set(1.15, 1.05, 0.9);
  meat.rotation.z = -0.1;
  meat.name = "meat";
  group.add(meat);

  const wrapGeo = new THREE.TorusGeometry(0.17 * size, 0.025 * size, 6, 12);
  const wrap = new THREE.Mesh(wrapGeo, wrapMat);
  wrap.position.y = 0.38 * size;
  wrap.rotation.x = Math.PI / 2;
  wrap.name = "wrap";
  group.add(wrap);
}

function buildHayBale(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const strawMat = createMaterial(customColor || 0xc8a44d, style);
  const bandMat = createMaterial(0x6d4c41, style);

  const baleGeo = new THREE.CylinderGeometry(
    0.38 * size,
    0.38 * size,
    0.78 * size,
    segments,
  );
  const bale = new THREE.Mesh(baleGeo, strawMat);
  bale.position.y = 0.38 * size;
  bale.rotation.z = Math.PI / 2;
  bale.name = "bale";
  group.add(bale);

  const bands = new THREE.Group();
  bands.name = "bands";
  const bandGeo = new THREE.TorusGeometry(
    0.39 * size,
    0.025 * size,
    8,
    segments,
  );
  for (const offset of [-0.27, 0, 0.27]) {
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.set(offset * size, 0.38 * size, 0);
    band.name = `band-${offset}`;
    bands.add(band);
  }
  group.add(bands);

  const straw = new THREE.Group();
  straw.name = "straw";
  const stalkGeo = new THREE.CylinderGeometry(
    0.012 * size,
    0.018 * size,
    0.18 * size,
    4,
  );
  for (let i = 0; i < 10; i++) {
    const stalk = new THREE.Mesh(stalkGeo, strawMat);
    const angle = rng() * Math.PI * 2;
    const r = 0.3 + rng() * 0.16;
    stalk.position.set(
      Math.cos(angle) * r * size,
      (0.42 + rng() * 0.4) * size,
      Math.sin(angle) * r * size,
    );
    stalk.rotation.z = (rng() - 0.5) * 1.1;
    stalk.rotation.x = (rng() - 0.5) * 1.1;
    stalk.name = `stalk-${i}`;
    straw.add(stalk);
  }
  group.add(straw);
}

function buildRopeCoil(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const ropeMat = createMaterial(customColor || 0xb58a57, style);

  const coil = new THREE.Group();
  coil.name = "coil";
  const ringGeo = new THREE.TorusGeometry(
    0.22 * size,
    0.045 * size,
    8,
    segments,
  );
  for (let layer = 0; layer < 3; layer++) {
    const ring = new THREE.Mesh(ringGeo, ropeMat);
    ring.position.y = (0.055 + layer * 0.055) * size;
    ring.rotation.x = Math.PI / 2;
    ring.name = `ring-${layer}`;
    coil.add(ring);
  }
  group.add(coil);

  const loops = new THREE.Group();
  loops.name = "loops";
  const loopGeo = new THREE.TorusGeometry(0.12 * size, 0.035 * size, 8, 12);
  for (let i = 0; i < 2; i++) {
    const loop = new THREE.Mesh(loopGeo, ropeMat);
    loop.position.set((i === 0 ? -0.22 : 0.3) * size, 0.2 * size, 0.1 * size);
    loop.rotation.x = Math.PI / 2 + (i === 0 ? 0.3 : -0.25);
    loop.name = `loop-${i}`;
    loops.add(loop);
  }
  group.add(loops);

  const tailGeo = new THREE.CylinderGeometry(
    0.035 * size,
    0.04 * size,
    0.44 * size,
    6,
  );
  const tail = new THREE.Mesh(tailGeo, ropeMat);
  tail.position.set(0.34 * size, 0.08 * size, 0.18 * size);
  tail.rotation.z = 0.8;
  tail.name = "tail";
  group.add(tail);
}

function buildBucket(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const metalMat = createMaterial(customColor || 0x90a4ae, style);
  const darkMat = createMaterial(0x546e7a, style);

  const bodyGeo = new THREE.CylinderGeometry(
    0.3 * size,
    0.24 * size,
    0.5 * size,
    segments,
  );
  const body = new THREE.Mesh(bodyGeo, metalMat);
  body.position.y = 0.25 * size;
  body.name = "body";
  group.add(body);

  const handleGeo = new THREE.TorusGeometry(0.19 * size, 0.028 * size, 6, 14);
  const handle = new THREE.Mesh(handleGeo, darkMat);
  handle.position.y = 0.52 * size;
  handle.rotation.z = Math.PI / 2;
  handle.name = "handle";
  group.add(handle);

  const rivets = new THREE.Group();
  rivets.name = "rivets";
  const rivetGeo = new THREE.SphereGeometry(0.035 * size, 6, 4);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const rivet = new THREE.Mesh(rivetGeo, darkMat);
    rivet.position.set(
      Math.cos(angle) * 0.28 * size,
      0.26 * size,
      Math.sin(angle) * 0.28 * size,
    );
    rivet.name = `rivet-${i}`;
    rivets.add(rivet);
  }
  group.add(rivets);
}

function buildWindmill(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const stoneMat = createMaterial(customColor || 0xbdbdbd, style);
  const woodMat = createMaterial(0x795548, style);
  const roofMat = createMaterial(0x455a64, style);
  const sailMat = createMaterial(0xe0d7c3, style);

  const towerBase = new THREE.CylinderGeometry(
    0.46 * size,
    0.62 * size,
    0.9 * size,
    segments,
  );
  const tower = new THREE.Mesh(towerBase, stoneMat);
  tower.position.y = 0.45 * size;
  tower.name = "tower";
  group.add(tower);

  const capGeo = new THREE.ConeGeometry(0.5 * size, 0.34 * size, segments);
  const cap = new THREE.Mesh(capGeo, roofMat);
  cap.position.y = 1.02 * size;
  cap.name = "cap";
  group.add(cap);

  const sails = new THREE.Group();
  sails.name = "sails";
  sails.position.y = 0.98 * size;
  const frameGeo = new THREE.BoxGeometry(0.08 * size, 1.7 * size, 0.08 * size);
  const frame = new THREE.Mesh(frameGeo, woodMat);
  frame.name = "frame";
  sails.add(frame);
  const crossGeo = new THREE.BoxGeometry(1.7 * size, 0.08 * size, 0.08 * size);
  const cross = new THREE.Mesh(crossGeo, woodMat);
  cross.name = "cross";
  sails.add(cross);
  const sailGeo = new THREE.BoxGeometry(0.74 * size, 0.68 * size, 0.04 * size);
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.position.set(
      Math.cos(angle) * 0.62 * size,
      Math.sin(angle) * 0.44 * size,
      0,
    );
    sail.rotation.z = angle;
    sail.name = `sail-${i}`;
    sails.add(sail);
  }
  group.add(sails);

  const doorGeo = new THREE.BoxGeometry(0.3 * size, 0.42 * size, 0.06 * size);
  const door = new THREE.Mesh(doorGeo, woodMat);
  door.position.z = 0.5 * size;
  door.name = "door";
  group.add(door);
}

function buildCoinPile(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const coinMat = createMaterial(customColor || 0xdaa520, style);
  coinMat.metalness = 0.8;
  const glintMat = createMaterial(0xfff59d, style);
  glintMat.emissive = new THREE.Color(0xffd54f);
  glintMat.emissiveIntensity = 0.45;

  const moundGeo = new THREE.SphereGeometry(
    0.34 * size,
    segments,
    Math.max(6, segments >> 1),
  );
  const mound = new THREE.Mesh(moundGeo, coinMat);
  mound.position.y = 0.2 * size;
  mound.scale.set(1.45, 0.52, 1.35);
  mound.name = "mound";
  group.add(mound);

  const coins = new THREE.Group();
  coins.name = "coins";
  const coinGeo = new THREE.CylinderGeometry(
    0.12 * size,
    0.12 * size,
    0.018 * size,
    12,
  );
  for (let i = 0; i < 16; i++) {
    const coin = new THREE.Mesh(coinGeo, coinMat);
    const angle = rng() * Math.PI * 2;
    const radius = 0.2 + rng() * 0.34;
    coin.position.set(
      Math.cos(angle) * radius * size,
      (0.08 + rng() * 0.34) * size,
      Math.sin(angle) * radius * size,
    );
    coin.rotation.z = (rng() - 0.5) * 0.2;
    coin.rotation.x = (rng() - 0.5) * 0.2;
    coin.name = `coin-${i}`;
    coins.add(coin);
  }
  group.add(coins);

  const glints = new THREE.Group();
  glints.name = "glints";
  const glintGeo = new THREE.SphereGeometry(0.022 * size, 6, 4);
  for (let i = 0; i < 5; i++) {
    const glint = new THREE.Mesh(glintGeo, glintMat);
    glint.position.set(
      (rng() - 0.5) * 0.7 * size,
      (0.34 + rng() * 0.16) * size,
      (rng() - 0.5) * 0.6 * size,
    );
    glint.name = `glint-${i}`;
    glints.add(glint);
  }
  group.add(glints);
}

function buildMinecart(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const metalMat = createMaterial(customColor || 0x607d8b, style);
  const ironMat = createMaterial(0x455a64, style);
  const woodMat = createMaterial(0x5d4037, style);

  const bedGeo = new THREE.BoxGeometry(1.1 * size, 0.18 * size, 0.72 * size);
  const bed = new THREE.Mesh(bedGeo, metalMat);
  bed.position.y = 0.46 * size;
  bed.name = "bed";
  group.add(bed);

  const sideGeo = new THREE.BoxGeometry(1.12 * size, 0.4 * size, 0.16 * size);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(sideGeo, ironMat);
    wall.position.set(0, 0.55 * size, side * 0.36 * size);
    wall.rotation.x = side * -0.18;
    wall.name = side < 0 ? "side-back" : "side-front";
    group.add(wall);
  }

  const axles = new THREE.Group();
  axles.name = "axles";
  const axleGeo = new THREE.CylinderGeometry(
    0.045 * size,
    0.045 * size,
    0.7 * size,
    8,
  );
  for (const z of [-0.36, 0.36]) {
    const axle = new THREE.Mesh(axleGeo, ironMat);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(0, 0.25 * size, z * size);
    axle.name = z < 0 ? "axle-rear" : "axle-front";
    axles.add(axle);
  }
  group.add(axles);

  const wheels = new THREE.Group();
  wheels.name = "wheels";
  const wheelGeo = new THREE.CylinderGeometry(
    0.25 * size,
    0.25 * size,
    0.1 * size,
    10,
  );
  for (let i = 0; i < 4; i++) {
    const z = (i % 2 === 0 ? -0.36 : 0.36) * size;
    const x = (i < 2 ? -0.58 : 0.58) * size;
    const wheel = new THREE.Mesh(wheelGeo, metalMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.25 * size, z);
    wheel.name = `wheel-${i}`;
    wheels.add(wheel);
  }
  group.add(wheels);

  const tongueGeo = new THREE.BoxGeometry(0.5 * size, 0.06 * size, 0.1 * size);
  const tongue = new THREE.Mesh(tongueGeo, woodMat);
  tongue.position.set(0.55 * size, 0.5 * size, 0);
  tongue.name = "tongue";
  group.add(tongue);
}

function buildBerryBush(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const leafMat = createMaterial(customColor || 0x2e7d32, style);
  const berryMat = createMaterial(0xc62828, style);
  const stemMat = createMaterial(0x4e342e, style);

  const stems = new THREE.Group();
  stems.name = "stems";
  const stemGeo = new THREE.CylinderGeometry(
    0.025 * size,
    0.04 * size,
    0.42 * size,
    6,
  );
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(
      Math.cos(angle) * 0.16 * size,
      (0.18 + rng() * 0.12) * size,
      Math.sin(angle) * 0.16 * size,
    );
    stem.rotation.z = Math.cos(angle) * 0.4;
    stem.rotation.x = -Math.sin(angle) * 0.4;
    stem.name = `stem-${i}`;
    stems.add(stem);
  }
  group.add(stems);

  const crownGeo = new THREE.SphereGeometry(
    0.4 * size,
    segments,
    Math.max(6, segments >> 1),
  );
  const crown = new THREE.Mesh(crownGeo, leafMat);
  crown.position.y = 0.38 * size;
  crown.scale.set(1.15, 0.7, 1.05);
  crown.name = "crown";
  group.add(crown);

  const berries = new THREE.Group();
  berries.name = "berries";
  const berryGeo = new THREE.SphereGeometry(0.065 * size, 8, 6);
  for (let i = 0; i < 12; i++) {
    const berry = new THREE.Mesh(berryGeo, berryMat);
    const angle = rng() * Math.PI * 2;
    const radius = 0.18 + rng() * 0.28;
    berry.position.set(
      Math.cos(angle) * radius * size,
      (0.32 + rng() * 0.28) * size,
      Math.sin(angle) * radius * size,
    );
    berry.name = `berry-${i}`;
    berries.add(berry);
  }
  group.add(berries);

  const leaves = new THREE.Group();
  leaves.name = "leaves";
  const leafGeo = new THREE.SphereGeometry(0.09 * size, 6, 4);
  for (let i = 0; i < 8; i++) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    const angle = (i / 8) * Math.PI * 2;
    leaf.position.set(
      Math.cos(angle) * 0.36 * size,
      (0.42 + rng() * 0.22) * size,
      Math.sin(angle) * 0.36 * size,
    );
    leaf.scale.set(1.4, 0.55, 1);
    leaf.name = `leaf-${i}`;
    leaves.add(leaf);
  }
  group.add(leaves);
}

function buildStoneCoffin(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const stoneMat = createMaterial(customColor || 0x8d9aa8, style);
  const darkMat = createMaterial(0x5d6d7e, style);

  const bodyGeo = new THREE.BoxGeometry(1.9 * size, 0.44 * size, 0.72 * size);
  const body = new THREE.Mesh(bodyGeo, stoneMat);
  body.position.y = 0.22 * size;
  body.name = "body";
  group.add(body);

  const skirtGeo = new THREE.BoxGeometry(2 * size, 0.12 * size, 0.82 * size);
  const skirt = new THREE.Mesh(skirtGeo, darkMat);
  skirt.position.y = 0.06 * size;
  skirt.name = "skirt";
  group.add(skirt);

  const lidGeo = new THREE.BoxGeometry(1.92 * size, 0.16 * size, 0.74 * size);
  const lid = new THREE.Mesh(lidGeo, stoneMat);
  lid.position.y = 0.52 * size;
  lid.name = "lid";
  group.add(lid);

  const ridgeGeo = new THREE.BoxGeometry(1.66 * size, 0.1 * size, 0.42 * size);
  const ridge = new THREE.Mesh(ridgeGeo, darkMat);
  ridge.position.y = 0.66 * size;
  ridge.rotation.z = 0.06;
  ridge.name = "ridge";
  group.add(ridge);

  const crossGeo = new THREE.BoxGeometry(0.34 * size, 0.34 * size, 0.08 * size);
  const cross = new THREE.Mesh(crossGeo, darkMat);
  cross.position.set(0.62 * size, 0.9 * size, 0);
  cross.name = "cross";
  group.add(cross);
}

function buildPortcullis(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const ironMat = createMaterial(customColor || 0x455a64, style);
  const darkMat = createMaterial(0x2d3a45, style);

  const frame = new THREE.Group();
  frame.name = "frame";
  const postGeo = new THREE.BoxGeometry(0.16 * size, 1.7 * size, 0.16 * size);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, darkMat);
    post.position.set(side * 0.62 * size, 0.85 * size, 0);
    post.name = side < 0 ? "post-left" : "post-right";
    frame.add(post);
  }
  const topGeo = new THREE.BoxGeometry(1.4 * size, 0.14 * size, 0.2 * size);
  const top = new THREE.Mesh(topGeo, darkMat);
  top.position.y = 1.68 * size;
  top.name = "top";
  frame.add(top);
  group.add(frame);

  const bars = new THREE.Group();
  bars.name = "bars";
  const barGeo = new THREE.BoxGeometry(0.07 * size, 1.3 * size, 0.06 * size);
  for (let i = 0; i < 7; i++) {
    const bar = new THREE.Mesh(barGeo, ironMat);
    bar.position.set((-0.58 + i * 0.193) * size, 0.68 * size, 0);
    bar.rotation.z = (rng() - 0.5) * 0.02;
    bar.name = `bar-${i}`;
    bars.add(bar);
  }
  const crossbarGeo = new THREE.BoxGeometry(
    1.2 * size,
    0.1 * size,
    0.05 * size,
  );
  for (let i = 0; i < 4; i++) {
    const crossbar = new THREE.Mesh(crossbarGeo, ironMat);
    crossbar.position.y = (0.2 + i * 0.36) * size;
    crossbar.name = `crossbar-${i}`;
    bars.add(crossbar);
  }
  group.add(bars);

  const winch = new THREE.Group();
  winch.name = "winch";
  const cylinderGeo = new THREE.CylinderGeometry(
    0.09 * size,
    0.11 * size,
    0.18 * size,
    segments,
  );
  cylinderGeo.rotateZ(Math.PI / 2);
  const drum = new THREE.Mesh(cylinderGeo, darkMat);
  drum.position.y = 1.38 * size;
  drum.name = "drum";
  winch.add(drum);
  for (const side of [-1, 1]) {
    const crankGeo = new THREE.BoxGeometry(
      0.3 * size,
      0.04 * size,
      0.04 * size,
    );
    const crank = new THREE.Mesh(crankGeo, ironMat);
    crank.position.set(side * 0.36 * size, 1.38 * size, 0);
    crank.rotation.z = side * 0.25;
    crank.name = side < 0 ? "crank-left" : "crank-right";
    winch.add(crank);
  }
  group.add(winch);
}

function buildCage(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const ironMat = createMaterial(customColor || 0x4e5d6c, style);
  const darkMat = createMaterial(0x2f3a45, style);

  const frame = new THREE.Group();
  frame.name = "frame";
  const cornerGeo = new THREE.BoxGeometry(0.12 * size, 1.2 * size, 0.12 * size);
  const corners = [
    [-0.52, -0.52],
    [-0.52, 0.52],
    [0.52, -0.52],
    [0.52, 0.52],
  ];
  for (let i = 0; i < corners.length; i++) {
    const [x, z] = corners[i];
    const corner = new THREE.Mesh(cornerGeo, darkMat);
    corner.position.set(x * size, 0.6 * size, z * size);
    corner.name = `corner-${i}`;
    frame.add(corner);
  }
  const topGeo = new THREE.BoxGeometry(1.2 * size, 0.1 * size, 1.2 * size);
  const top = new THREE.Mesh(topGeo, ironMat);
  top.position.y = 1.24 * size;
  top.name = "top";
  frame.add(top);
  group.add(frame);

  const bars = new THREE.Group();
  bars.name = "bars";
  const barGeo = new THREE.BoxGeometry(0.045 * size, 1.05 * size, 0.045 * size);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const bar = new THREE.Mesh(barGeo, ironMat);
      bar.position.set(
        side * 0.52 * size,
        0.58 * size,
        (-0.4 + i * 0.2) * size,
      );
      bar.name = side < 0 ? `bar-left-${i}` : `bar-right-${i}`;
      bars.add(bar);
    }
  }
  for (let i = 1; i < 5; i++) {
    const bar = new THREE.Mesh(barGeo, ironMat);
    bar.position.set((-0.52 + i * 0.26) * size, 0.58 * size, 0.52 * size);
    bar.rotation.y = Math.PI / 2;
    bar.name = `bar-front-${i}`;
    bars.add(bar);
  }
  group.add(bars);

  const doorGeo = new THREE.BoxGeometry(0.56 * size, 0.07 * size, 0.56 * size);
  const door = new THREE.Mesh(doorGeo, ironMat);
  door.position.set(0, 0.42 * size, 0.52 * size);
  door.name = "door";
  group.add(door);

  const lockGeo = new THREE.BoxGeometry(0.12 * size, 0.18 * size, 0.06 * size);
  const lock = new THREE.Mesh(lockGeo, darkMat);
  lock.position.set(0, 0.24 * size, 0.56 * size);
  lock.name = "lock";
  group.add(lock);
}

function buildBonePile(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const boneMat = createMaterial(customColor || 0xd7cbb0, style);
  const darkMat = createMaterial(0xa89f8c, style);

  const moundGeo = new THREE.SphereGeometry(
    0.62 * size,
    segments,
    Math.max(6, segments >> 1),
  );
  const mound = new THREE.Mesh(moundGeo, darkMat);
  mound.position.y = 0.1 * size;
  mound.scale.set(1.3, 0.36, 1);
  mound.name = "mound";
  group.add(mound);

  const bones = new THREE.Group();
  bones.name = "bones";
  const longGeo = new THREE.CylinderGeometry(
    0.035 * size,
    0.05 * size,
    0.55 * size,
    6,
  );
  for (let i = 0; i < 6; i++) {
    const bone = new THREE.Mesh(longGeo, boneMat);
    const angle = (i / 6) * Math.PI * 2 + rng() * 0.5;
    bone.position.set(
      Math.cos(angle) * (0.3 + rng() * 0.18) * size,
      (0.16 + rng() * 0.24) * size,
      Math.sin(angle) * (0.3 + rng() * 0.18) * size,
    );
    bone.rotation.set(rng() * 0.8 - 0.4, rng() * Math.PI, rng() * 0.8 - 0.4);
    bone.name = `bone-${i}`;
    bones.add(bone);
  }
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(0.14 * size, 0.025 * size, 6, 8, Math.PI),
      boneMat,
    );
    const angle = rng() * Math.PI * 2;
    rib.position.set(
      Math.cos(angle) * (0.18 + rng() * 0.2) * size,
      (0.16 + rng() * 0.16) * size,
      Math.sin(angle) * (0.18 + rng() * 0.2) * size,
    );
    rib.rotation.set(rng(), rng() * Math.PI, rng());
    rib.name = `rib-${i}`;
    bones.add(rib);
  }
  group.add(bones);

  const skullGeo = new THREE.SphereGeometry(
    0.14 * size,
    segments,
    Math.max(6, segments >> 1),
  );
  const skull = new THREE.Mesh(skullGeo, boneMat);
  skull.position.set(0.3 * size, 0.42 * size, -0.14 * size);
  skull.scale.set(1.12, 0.9, 1);
  skull.rotation.set(-0.3, 0.8, 0.2);
  skull.name = "skull";
  group.add(skull);
}

function buildCobweb(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const webMat = createMaterial(customColor || 0xe3ddcc, style);
  webMat.transparent = true;
  webMat.opacity = 0.42;

  const hubGeo = new THREE.SphereGeometry(0.045 * size, 8, 6);
  const hub = new THREE.Mesh(hubGeo, webMat);
  hub.position.y = 0.92 * size;
  hub.name = "hub";
  group.add(hub);

  const strands = new THREE.Group();
  strands.name = "strands";
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const strandGeo = new THREE.CylinderGeometry(
      0.008 * size,
      0.012 * size,
      0.95 * size,
      4,
    );
    const strand = new THREE.Mesh(strandGeo, webMat);
    strand.position.set(
      Math.cos(angle) * 0.48 * size,
      (0.92 - Math.sin(angle) * 0.34) * size,
      Math.sin(angle) * 0.44 * size,
    );
    strand.rotation.z = Math.cos(angle) * 0.68;
    strand.rotation.x = -Math.sin(angle) * 0.62;
    strand.name = `strand-${i}`;
    strands.add(strand);
  }
  group.add(strands);

  const threads = new THREE.Group();
  threads.name = "threads";
  for (let ring = 0; ring < 4; ring++) {
    const radius = 0.16 + ring * 0.16;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + ring * 0.2;
      const a = angle;
      const b = angle + Math.PI / 8;
      const ma = (a + b) / 2;
      const ax = Math.cos(a) * radius;
      const az = Math.sin(a) * radius * 0.85;
      const bx = Math.cos(b) * radius;
      const bz = Math.sin(b) * radius * 0.85;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const len = Math.hypot(bx - ax, bz - az) * size;
      if (len < 0.01 * size) continue;
      const threadGeo = new THREE.CylinderGeometry(
        0.006 * size,
        0.006 * size,
        len,
        4,
      );
      const thread = new THREE.Mesh(threadGeo, webMat);
      thread.position.set(
        mx * size,
        (0.92 - Math.sin(ma) * radius * 0.6) * size,
        mz * size,
      );
      const dir = new THREE.Vector3(
        bx - ax,
        Math.sin(ma) * radius * 0.6,
        bz - az,
      ).normalize();
      thread.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      thread.name = `thread-${ring}-${i}`;
      threads.add(thread);
    }
  }
  group.add(threads);
}

function buildLever(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const metalMat = createMaterial(customColor || 0x546e7a, style);
  const darkMat = createMaterial(0x37474f, style);

  const baseGeo = new THREE.CylinderGeometry(
    0.3 * size,
    0.34 * size,
    0.1 * size,
    segments,
  );
  const base = new THREE.Mesh(baseGeo, darkMat);
  base.position.y = 0.05 * size;
  base.name = "base";
  group.add(base);

  const postGeo = new THREE.CylinderGeometry(
    0.07 * size,
    0.09 * size,
    0.72 * size,
    segments,
  );
  const post = new THREE.Mesh(postGeo, metalMat);
  post.position.y = 0.44 * size;
  post.name = "post";
  group.add(post);

  const handleGeo = new THREE.CylinderGeometry(
    0.035 * size,
    0.045 * size,
    0.4 * size,
    segments,
  );
  const handle = new THREE.Mesh(handleGeo, metalMat);
  handle.position.set(0.2 * size, 0.72 * size, 0);
  handle.rotation.z = -1.25;
  handle.name = "handle";
  group.add(handle);

  const knobGeo = new THREE.SphereGeometry(0.06 * size, 10, 8);
  const knob = new THREE.Mesh(knobGeo, darkMat);
  knob.position.set(0.53 * size, 0.9 * size, 0);
  knob.name = "knob";
  group.add(knob);

  const weightGeo = new THREE.BoxGeometry(0.2 * size, 0.3 * size, 0.2 * size);
  const weight = new THREE.Mesh(weightGeo, darkMat);
  weight.position.y = 0.24 * size;
  weight.name = "weight";
  group.add(weight);
}

function buildUrn(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const clayMat = createMaterial(customColor || 0x9a6b4f, style);
  const darkMat = createMaterial(0x6d4c41, style);

  const bodyGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.16 * size, 0),
      new THREE.Vector2(0.46 * size, 0.16 * size),
      new THREE.Vector2(0.5 * size, 0.5 * size),
      new THREE.Vector2(0.4 * size, 0.78 * size),
      new THREE.Vector2(0.22 * size, 0.92 * size),
      new THREE.Vector2(0.2 * size, 1 * size),
    ],
    segments,
  );
  const body = new THREE.Mesh(bodyGeo, clayMat);
  body.scale.y = 0.9;
  body.position.y = 0.44 * size;
  body.name = "body";
  group.add(body);

  const rimGeo = new THREE.TorusGeometry(
    0.22 * size,
    0.035 * size,
    8,
    segments,
  );
  const rim = new THREE.Mesh(rimGeo, darkMat);
  rim.position.y = 1.04 * size;
  rim.rotation.x = Math.PI / 2;
  rim.name = "rim";
  group.add(rim);

  const baseGeo = new THREE.CylinderGeometry(
    0.22 * size,
    0.28 * size,
    0.08 * size,
    segments,
  );
  const base = new THREE.Mesh(baseGeo, darkMat);
  base.position.y = 0.04 * size;
  base.name = "base";
  group.add(base);
}

function buildMummy(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const wrapMat = createMaterial(customColor || 0xc8b69a, style);
  const darkMat = createMaterial(0x9c8a70, style);

  const legs = new THREE.Group();
  legs.name = "legs";
  const legGeo = new THREE.CylinderGeometry(
    0.12 * size,
    0.14 * size,
    0.52 * size,
    segments,
  );
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, wrapMat);
    leg.position.set(side * 0.11 * size, 0.26 * size, 0);
    leg.scale.x = 1.4;
    leg.name = side < 0 ? "leg-left" : "leg-right";
    legs.add(leg);
  }
  group.add(legs);

  const bodyGeo = new THREE.CylinderGeometry(
    0.2 * size,
    0.16 * size,
    0.66 * size,
    segments,
  );
  const body = new THREE.Mesh(bodyGeo, wrapMat);
  body.position.y = 0.85 * size;
  body.scale.x = 1.35;
  body.name = "body";
  group.add(body);

  const arms = new THREE.Group();
  arms.name = "arms";
  const armGeo = new THREE.CylinderGeometry(
    0.06 * size,
    0.075 * size,
    0.5 * size,
    6,
  );
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, wrapMat);
    arm.position.set(side * 0.26 * size, 0.92 * size, 0);
    arm.rotation.z = side * 0.4;
    arm.rotation.x = (rng() - 0.5) * 0.3;
    arm.name = side < 0 ? "arm-left" : "arm-right";
    arms.add(arm);
  }
  group.add(arms);

  const headGeo = new THREE.SphereGeometry(
    0.13 * size,
    segments,
    Math.max(6, segments >> 1),
  );
  const head = new THREE.Mesh(headGeo, darkMat);
  head.position.y = 1.32 * size;
  head.scale.set(1.15, 1.1, 0.85);
  head.name = "head";
  group.add(head);

  const bandGeo = new THREE.TorusGeometry(
    0.13 * size,
    0.02 * size,
    6,
    segments,
  );
  const band = new THREE.Mesh(bandGeo, wrapMat);
  band.position.y = 1.32 * size;
  band.rotation.x = Math.PI / 2;
  band.scale.set(1.2, 0.85, 1);
  band.name = "band";
  group.add(band);
}

function buildBeehive(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const strawMat = createMaterial(customColor || 0xd2a45c, style);
  const darkMat = createMaterial(0xb98a3e, style);
  const beeMat = createMaterial(0x3e2723, style);
  const wingMat = createMaterial(0xffffff, style);

  const baseGeo = new THREE.CylinderGeometry(
    0.38 * size,
    0.44 * size,
    0.08 * size,
    segments,
  );
  const base = new THREE.Mesh(baseGeo, darkMat);
  base.position.y = 0.04 * size;
  base.name = "base";
  group.add(base);

  const body = new THREE.Group();
  body.name = "body";
  const tierGeo = new THREE.CylinderGeometry(
    0.42 * size,
    0.38 * size,
    0.3 * size,
    10,
  );
  for (let i = 0; i < 3; i++) {
    const tier = new THREE.Mesh(tierGeo, strawMat);
    tier.position.y = (0.28 + i * 0.26) * size;
    if (i > 0) tier.scale.set(1 - i * 0.1, 1, 1 - i * 0.1);
    tier.name = `tier-${i}`;
    body.add(tier);
  }
  const ringGeo = new THREE.TorusGeometry(0.36 * size, 0.025 * size, 6, 10);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(ringGeo, darkMat);
    ring.position.y = (0.42 + i * 0.26) * size;
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1 - i * 0.1, 1, 1 - i * 0.1);
    ring.name = `ring-${i}`;
    body.add(ring);
  }
  group.add(body);

  const capGeo = new THREE.ConeGeometry(0.3 * size, 0.26 * size, 10);
  const cap = new THREE.Mesh(capGeo, strawMat);
  cap.position.y = 1.18 * size;
  cap.name = "cap";
  group.add(cap);

  const bees = new THREE.Group();
  bees.name = "bees";
  const beeGeo = new THREE.SphereGeometry(0.045 * size, 8, 6);
  for (let i = 0; i < 7; i++) {
    const bee = new THREE.Mesh(beeGeo, beeMat);
    const angle = rng() * Math.PI * 2;
    bee.position.set(
      Math.cos(angle) * (0.3 + rng() * 0.34) * size,
      (0.5 + rng() * 0.9) * size,
      Math.sin(angle) * (0.3 + rng() * 0.34) * size,
    );
    bee.name = `bee-${i}`;
    const wing = new THREE.Mesh(
      new THREE.SphereGeometry(0.03 * size, 6, 4),
      wingMat,
    );
    wing.position.y = 0.05 * size;
    wing.scale.set(0.5, 0.15, 1);
    wing.name = `wing-${i}`;
    bee.add(wing);
    bees.add(bee);
  }
  group.add(bees);
}

function buildWheatSheaf(
  group,
  size,
  segments,
  style,
  customColor = null,
  rng = Math.random,
) {
  const strawMat = createMaterial(customColor || 0xd9a441, style);
  const grainMat = createMaterial(0x8d6a2f, style);
  const bandMat = createMaterial(0x6d4c2f, style);

  const stalks = new THREE.Group();
  stalks.name = "stalks";
  const stalkGeo = new THREE.CylinderGeometry(
    0.015 * size,
    0.022 * size,
    1.1 * size,
    5,
  );
  for (let i = 0; i < 22; i++) {
    const stalk = new THREE.Mesh(stalkGeo, strawMat);
    const angle = rng() * Math.PI * 2;
    const radius = (i % 4) * 0.13 + rng() * 0.08;
    stalk.position.set(
      Math.cos(angle) * radius * size,
      0.55 * size,
      Math.sin(angle) * radius * size,
    );
    stalk.rotation.z = Math.cos(angle) * (0.12 + radius * 0.5);
    stalk.rotation.x = Math.sin(angle) * (0.12 + radius * 0.5);
    stalk.name = `stalk-${i}`;
    stalks.add(stalk);
  }
  group.add(stalks);

  const heads = new THREE.Group();
  heads.name = "heads";
  const grainGeo = new THREE.CylinderGeometry(
    0.03 * size,
    0.045 * size,
    0.28 * size,
    5,
  );
  for (let i = 0; i < 16; i++) {
    const head = new THREE.Mesh(grainGeo, grainMat);
    const angle = rng() * Math.PI * 2;
    const radius = (i % 4) * 0.14 + rng() * 0.1;
    head.position.set(
      Math.cos(angle) * radius * size,
      (1.05 + rng() * 0.14) * size,
      Math.sin(angle) * radius * size,
    );
    head.rotation.z = Math.cos(angle) * (0.2 + radius * 0.5);
    head.rotation.x = Math.sin(angle) * (0.2 + radius * 0.5);
    head.name = `head-${i}`;
    heads.add(head);
  }
  group.add(heads);

  const band = new THREE.Group();
  band.name = "band";
  const bandGeo = new THREE.TorusGeometry(0.2 * size, 0.03 * size, 6, 10);
  const lower = new THREE.Mesh(bandGeo, bandMat);
  lower.position.y = 0.34 * size;
  lower.rotation.x = Math.PI / 2;
  lower.scale.y = 1.15;
  lower.name = "lower";
  band.add(lower);
  const upper = new THREE.Mesh(bandGeo, bandMat);
  upper.position.y = 0.52 * size;
  upper.rotation.x = Math.PI / 2;
  upper.scale.y = 1.04;
  upper.name = "upper";
  band.add(upper);
  group.add(band);
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
  const clonedBones = new Map();
  clone.traverse((child) => {
    if (child.isBone) clonedBones.set(child.name, child);
  });
  const sourceMeshes = [];
  object.traverse((child) => {
    if (child.isSkinnedMesh) sourceMeshes.push(child);
  });
  const clonedMeshes = [];
  clone.traverse((child) => {
    if (child.isSkinnedMesh) clonedMeshes.push(child);
  });
  for (let i = 0; i < sourceMeshes.length; i++) {
    const source = sourceMeshes[i];
    const skinned = clonedMeshes[i];
    if (!source?.skeleton || !skinned) continue;
    const bones = source.skeleton.bones
      .map((bone) => clonedBones.get(bone.name))
      .filter(Boolean);
    if (bones.length) {
      skinned.bind(new THREE.Skeleton(bones), source.bindMatrix.clone());
    }
  }
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
  const normal = geometry.attributes.normal;
  const cellMap = new Map();
  const representatives = [];
  const representativeNormals = [];
  const cellOf = new Int32Array(positions.count);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const nx = normal ? normal.getX(i) : 0;
    const ny = normal ? normal.getY(i) : 0;
    const nz = normal ? normal.getZ(i) : 0;
    const key = `${Math.round(x / step)},${Math.round(y / step)},${Math.round(z / step)}`;
    let representative = cellMap.get(key);
    if (representative === undefined) {
      representative = representatives.length / 3;
      cellMap.set(key, representative);
      representatives.push(x, y, z);
      representativeNormals.push(nx, ny, nz);
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
  if (normal) {
    next.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(representativeNormals, 3),
    );
  }
  if (kept.length) next.setIndex(kept);
  if (!normal) next.computeVertexNormals();

  // Decimated geometry keeps the mapped attributes a game import needs. Skin
  // data keeps the imported LOD deforming, and UVs (plus optional color/UV2)
  // keep the material mapping intact when this mesh becomes the main model
  // after a budget repair instead of a separate LOD level.
  for (const name of [
    "uv",
    "uv1",
    "color",
    "skinIndex",
    "skinWeight",
    "joints0",
    "weights0",
  ]) {
    const source = geometry.attributes[name];
    if (!source) continue;
    const itemSize = source.itemSize || 1;
    const data = new Float32Array((representatives.length / 3) * itemSize);
    for (let i = 0; i < cellOf.length; i++) {
      const out = cellOf[i] * itemSize;
      for (let k = 0; k < itemSize; k++) {
        data[out + k] = source.array[i * itemSize + k];
      }
    }
    next.setAttribute(name, new THREE.BufferAttribute(data, itemSize));
  }

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

/* Modular pieces share one material vocabulary: a stone body, a darker trim
   course, and the wood and glass an opening needs. A picked colour tints the
   stone, because that is the surface a player actually looks at. */
function modularMaterials(style, customColor = null) {
  return {
    stone: createMaterial(customColor ?? 0x918b80, style),
    trim: createMaterial(0x6c675f, style),
    shade: createMaterial(0x2f333a, style),
    wood: createMaterial(0x8d6e63, style),
    glass: new THREE.MeshStandardMaterial({
      color: 0x39505f,
      flatShading: style.flatShading,
      roughness: 0.12,
      metalness: 0.05,
      transparent: true,
      opacity: 0.32,
    }),
  };
}

function modBox(group, name, material, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.name = name;
  group.add(mesh);
  return mesh;
}

/* Course heights are proportional to the cell so a half-metre wall and a
   three-metre wall both keep a plinth that reads as a plinth. */
function modCourses(cell) {
  return {
    base: Math.min(Math.max(cell * 0.14, 0.08), 0.4),
    cap: Math.min(Math.max(cell * 0.16, 0.1), 0.5),
  };
}

function buildWall(group, options, style, customColor = null) {
  const { cell, cells, height, thickness, crenel } = options;
  const mats = modularMaterials(style, customColor);
  const length = cells * cell;
  const span = height * cell;
  const { base: baseH, cap: capH } = modCourses(cell);
  const bodyH = Math.max(0.1, span - baseH - capH);
  // The courses step outward in depth only. A course that also overhung the
  // ends would leave a gap between neighbours, which is the one thing a
  // modular wall cannot do.
  const courseD = thickness + cell * 0.06;

  modBox(group, "base", mats.trim, length, baseH, courseD, 0, baseH / 2, 0);
  modBox(
    group,
    "body",
    mats.stone,
    length,
    bodyH,
    thickness,
    0,
    baseH + bodyH / 2,
    0,
  );
  modBox(group, "cap", mats.trim, length, capH, courseD, 0, span - capH / 2, 0);

  if (!crenel) return;
  // Crenellations repeat once per cell with a half-cell gap, so a row of any
  // length finishes level with the one it started from.
  const merlons = new THREE.Group();
  merlons.name = "crenel";
  const merlonW = cell * 0.5;
  const merlonH = Math.min(Math.max(cell * 0.3, 0.12), 0.8);
  for (let i = 0; i < cells; i++) {
    const x = -length / 2 + merlonW / 2 + i * cell;
    modBox(
      merlons,
      `crenel-${i}`,
      mats.trim,
      merlonW,
      merlonH,
      thickness,
      x,
      span + merlonH / 2,
      0,
    );
  }
  group.add(merlons);
}

function buildWallWindow(group, options, style, customColor = null) {
  const { cell, cells, height, thickness } = options;
  const mats = modularMaterials(style, customColor);
  const length = cells * cell;
  const span = height * cell;
  const openW = Math.min(cell * 0.9, length * 0.45);
  const sill = Math.min(Math.max(cell * 0.55, 0.3), span * 0.45);
  const openH = Math.min(cell * 0.9, Math.max(0.35, span - sill - 0.3));
  const sideW = (length - openW) / 2;
  const aboveH = span - sill - openH;
  const walls = new THREE.Group();
  walls.name = "wall";
  const frame = new THREE.Group();
  frame.name = "frame";

  modBox(
    walls,
    "wall-left",
    mats.stone,
    sideW,
    span,
    thickness,
    -(openW + sideW) / 2,
    span / 2,
    0,
  );
  modBox(
    walls,
    "wall-right",
    mats.stone,
    sideW,
    span,
    thickness,
    (openW + sideW) / 2,
    span / 2,
    0,
  );
  modBox(
    walls,
    "wall-below",
    mats.stone,
    openW,
    sill,
    thickness,
    0,
    sill / 2,
    0,
  );
  if (aboveH > 0.01)
    modBox(
      walls,
      "wall-above",
      mats.stone,
      openW,
      aboveH,
      thickness,
      0,
      sill + openH + aboveH / 2,
      0,
    );

  const frameD = thickness + 0.06;
  modBox(
    frame,
    "frame-jamb-left",
    mats.trim,
    0.1,
    openH,
    frameD,
    -openW / 2 - 0.05,
    sill + openH / 2,
    0,
  );
  modBox(
    frame,
    "frame-jamb-right",
    mats.trim,
    0.1,
    openH,
    frameD,
    openW / 2 + 0.05,
    sill + openH / 2,
    0,
  );
  modBox(
    frame,
    "frame-sill",
    mats.trim,
    openW + 0.2,
    0.08,
    frameD,
    0,
    sill + 0.04,
    0,
  );
  modBox(
    frame,
    "frame-lintel",
    mats.trim,
    openW + 0.24,
    0.1,
    frameD,
    0,
    sill + openH + 0.05,
    0,
  );
  modBox(
    group,
    "glass",
    mats.glass,
    openW * 0.94,
    openH * 0.94,
    0.02,
    0,
    sill + openH / 2,
    0,
  );
  group.add(walls, frame);
}

function buildWallDoor(group, options, style, customColor = null) {
  const { cell, cells, height, thickness } = options;
  const mats = modularMaterials(style, customColor);
  const length = cells * cell;
  const span = height * cell;
  const openW = Math.min(cell * 1.2, length * 0.6);
  const openH = Math.min(span * 0.78, Math.max(0.6, span - 0.3));
  const sideW = (length - openW) / 2;
  const aboveH = span - openH;
  const walls = new THREE.Group();
  walls.name = "wall";
  const frame = new THREE.Group();
  frame.name = "frame";

  modBox(
    walls,
    "wall-left",
    mats.stone,
    sideW,
    span,
    thickness,
    -(openW + sideW) / 2,
    span / 2,
    0,
  );
  modBox(
    walls,
    "wall-right",
    mats.stone,
    sideW,
    span,
    thickness,
    (openW + sideW) / 2,
    span / 2,
    0,
  );
  if (aboveH > 0.01)
    modBox(
      walls,
      "wall-above",
      mats.stone,
      openW,
      aboveH,
      thickness,
      0,
      openH + aboveH / 2,
      0,
    );
  // A dark panel just inside the opening reads as depth behind the doorway
  // rather than a hole punched clean through the wall.
  modBox(
    group,
    "interior",
    mats.shade,
    openW * 0.96,
    openH * 0.98,
    thickness * 0.5,
    0,
    openH / 2,
    thickness * 0.1,
  );
  const frameD = thickness + 0.06;
  modBox(
    frame,
    "frame-jamb-left",
    mats.wood,
    0.12,
    openH,
    frameD,
    -openW / 2 - 0.06,
    openH / 2,
    0,
  );
  modBox(
    frame,
    "frame-jamb-right",
    mats.wood,
    0.12,
    openH,
    frameD,
    openW / 2 + 0.06,
    openH / 2,
    0,
  );
  modBox(
    frame,
    "frame-lintel",
    mats.wood,
    openW + 0.24,
    0.12,
    frameD,
    0,
    openH + 0.06,
    0,
  );
  modBox(
    group,
    "threshold",
    mats.wood,
    openW + 0.4,
    0.08,
    thickness + 0.12,
    0,
    0.04,
    0,
  );
  group.add(walls, frame);
}

/* The corner is the one piece that is not centred on its own origin: the two
   legs run out along +X and +Z from the corner line, which is where a
   straight wall reaching the corner leaves off. */
function buildWallCorner(group, options, style, customColor = null) {
  const { cell, cells, height, thickness, crenel } = options;
  const mats = modularMaterials(style, customColor);
  const leg = cells * cell;
  const span = height * cell;
  const { base: baseH, cap: capH } = modCourses(cell);
  const bodyH = Math.max(0.1, span - baseH - capH);
  const courseW = leg;
  const courseD = thickness + cell * 0.06;
  const inset = thickness / 2 + cell * 0.03;
  const bases = new THREE.Group();
  bases.name = "base";
  const bodies = new THREE.Group();
  bodies.name = "body";
  const caps = new THREE.Group();
  caps.name = "cap";

  const legs = [
    { axis: "x", w: courseW, d: courseD, x: leg / 2, z: inset },
    { axis: "z", w: courseD, d: courseW, x: inset, z: leg / 2 },
  ];
  for (const { axis, w, d, x, z } of legs) {
    const bx = axis === "x" ? x : thickness / 2;
    const bz = axis === "x" ? thickness / 2 : z;
    modBox(bases, `base-${axis}`, mats.trim, w, baseH, d, x, baseH / 2, z);
    modBox(
      bodies,
      `body-${axis}`,
      mats.stone,
      axis === "x" ? leg : thickness,
      bodyH,
      axis === "x" ? thickness : leg,
      bx,
      baseH + bodyH / 2,
      bz,
    );
    modBox(caps, `cap-${axis}`, mats.trim, w, capH, d, x, span - capH / 2, z);
  }
  group.add(bases, bodies, caps);

  if (!crenel) return;
  const merlons = new THREE.Group();
  merlons.name = "crenel";
  const merlonW = cell * 0.5;
  const merlonH = Math.min(Math.max(cell * 0.3, 0.12), 0.8);
  for (let i = 0; i < cells; i++) {
    const t = merlonW / 2 + i * cell;
    modBox(
      merlons,
      `crenel-x-${i}`,
      mats.trim,
      merlonW,
      merlonH,
      thickness,
      t,
      span + merlonH / 2,
      thickness / 2,
    );
    modBox(
      merlons,
      `crenel-z-${i}`,
      mats.trim,
      thickness,
      merlonH,
      merlonW,
      thickness / 2,
      span + merlonH / 2,
      t,
    );
  }
  group.add(merlons);
}

/* Joints are dark strips sunk a hair below the surface. One mesh per tile
   would buy nothing a strip does not already show, and a 12 x 12 floor stays
   three dozen meshes rather than two hundred. */
function buildFloor(group, options, style, customColor = null) {
  const { cell, cells, depth, thickness } = options;
  const mats = modularMaterials(style, customColor);
  const width = cells * cell;
  const length = depth * cell;
  const slab = Math.min(Math.max(thickness, 0.05), 0.5);
  modBox(group, "slab", mats.stone, width, slab, length, 0, slab / 2, 0);
  const joints = new THREE.Group();
  joints.name = "joints";
  const kerbs = new THREE.Group();
  kerbs.name = "kerb";

  const jointW = Math.min(0.03, cell * 0.02);
  for (let i = 1; i < cells; i++) {
    const x = -width / 2 + (i * width) / cells;
    modBox(
      joints,
      `joint-x-${i}`,
      mats.shade,
      jointW,
      0.02,
      length - 0.04,
      x,
      slab - 0.001,
      0,
    );
  }
  for (let j = 1; j < depth; j++) {
    const z = -length / 2 + (j * length) / depth;
    modBox(
      joints,
      `joint-z-${j}`,
      mats.shade,
      width - 0.04,
      0.02,
      jointW,
      0,
      slab - 0.001,
      z,
    );
  }

  // The kerb sits inside the footprint: a tile that overhangs its cell stops
  // the row behind it from lining up.
  const kerbH = Math.min(0.05, cell * 0.05);
  const kerbW = Math.min(0.1, cell * 0.08);
  modBox(
    kerbs,
    "kerb-north",
    mats.trim,
    width - kerbW * 2,
    kerbH,
    kerbW,
    0,
    slab,
    -length / 2 + kerbW / 2,
  );
  modBox(
    kerbs,
    "kerb-south",
    mats.trim,
    width - kerbW * 2,
    kerbH,
    kerbW,
    0,
    slab,
    length / 2 - kerbW / 2,
  );
  modBox(
    kerbs,
    "kerb-west",
    mats.trim,
    kerbW,
    kerbH,
    length - kerbW * 2,
    -width / 2 + kerbW / 2,
    slab,
    0,
  );
  modBox(
    kerbs,
    "kerb-east",
    mats.trim,
    kerbW,
    kerbH,
    length - kerbW * 2,
    width / 2 - kerbW / 2,
    slab,
    0,
  );
  group.add(joints, kerbs);
}

/* Steps are solid blocks rather than floating treads: the shape you can
   actually walk up, and the only one a stair needs a collider for at all. */
function buildStairs(group, options, style, customColor = null) {
  const { cell, cells, height, depth, steps } = options;
  const mats = modularMaterials(style, customColor);
  const run = cells * cell;
  const rise = height * cell;
  const width = depth * cell;
  const count = Math.max(2, Math.round(steps));
  const stepD = run / count;
  const stepH = rise / count;
  const stepsGroup = new THREE.Group();
  stepsGroup.name = "steps";
  const stringers = new THREE.Group();
  stringers.name = "stringers";

  for (let i = 0; i < count; i++) {
    const blockH = stepH * (i + 1);
    modBox(
      stepsGroup,
      `step-${i}`,
      mats.stone,
      stepD,
      blockH,
      width,
      -run / 2 + stepD * (i + 0.5),
      blockH / 2,
      0,
    );
  }

  const stringerW = Math.min(0.1, Math.max(0.04, cell * 0.06));
  const sides = [
    ["left", -1],
    ["right", 1],
  ];
  for (const [name, side] of sides) {
    modBox(
      stringers,
      `stringer-${name}`,
      mats.trim,
      run,
      rise,
      stringerW,
      0,
      rise / 2,
      (side * (width + stringerW)) / 2,
    );
  }
  group.add(stepsGroup, stringers);
}

/* The arc is cut into voussoirs, one block per wedge, each turned to face the
   centre, so the arch reads as masonry instead of a smooth tube. The spring
   line is placed so the crown lands exactly on the requested height. */
function buildArch(group, options, style, customColor = null) {
  const { cell, cells, height, thickness } = options;
  const mats = modularMaterials(style, customColor);
  const span = cells * cell;
  const totalH = height * cell;
  const columnW = Math.min(cell * 0.4, span * 0.3);
  const openingW = Math.max(0.2, span - columnW * 2);
  const radius = openingW / 2;
  const ringDepth = Math.min(thickness * 0.6, radius * 0.5);
  const baseH = Math.min(Math.max(cell * 0.12, 0.1), 0.35);
  const blocks = Math.max(6, Math.round(cells * 2));
  const mid = radius + ringDepth / 2;
  const wedgeW = (Math.PI * mid) / blocks;
  let crownOffset = 0;
  for (let i = 0; i < blocks; i++) {
    const angle = ((i + 0.5) * Math.PI) / blocks;
    const top =
      Math.sin(angle) * mid +
      (ringDepth / 2) * Math.abs(Math.sin(angle)) +
      (wedgeW / 2) * Math.abs(Math.cos(angle));
    crownOffset = Math.max(crownOffset, top);
  }
  const springH = Math.max(baseH + 0.2, totalH - crownOffset);
  const columns = new THREE.Group();
  columns.name = "columns";
  const archGroup = new THREE.Group();
  archGroup.name = "arch";

  modBox(
    group,
    "plinth",
    mats.stone,
    span,
    baseH,
    thickness + 0.12,
    0,
    baseH / 2,
    0,
  );
  const columnH = Math.max(0.1, springH - baseH);
  modBox(
    columns,
    "column-left",
    mats.stone,
    columnW,
    columnH,
    thickness,
    -(openingW / 2 + columnW / 2),
    baseH + columnH / 2,
    0,
  );
  modBox(
    columns,
    "column-right",
    mats.stone,
    columnW,
    columnH,
    thickness,
    openingW / 2 + columnW / 2,
    baseH + columnH / 2,
    0,
  );

  for (let i = 0; i < blocks; i++) {
    const angle = ((i + 0.5) * Math.PI) / blocks;
    const block = modBox(
      archGroup,
      `voussoir-${i}`,
      mats.stone,
      ringDepth,
      wedgeW,
      thickness,
      Math.cos(angle) * mid,
      springH + Math.sin(angle) * mid,
      0,
    );
    block.rotation.z = angle;
  }

  const impostW = ringDepth * 1.4;
  const impostH = Math.min(0.12, cell * 0.1);
  modBox(
    archGroup,
    "impost-left",
    mats.trim,
    impostW,
    impostH,
    thickness + 0.06,
    -(openingW / 2 + impostW / 2 - 0.02),
    springH - impostH / 2,
    0,
  );
  modBox(
    archGroup,
    "impost-right",
    mats.trim,
    impostW,
    impostH,
    thickness + 0.06,
    openingW / 2 + impostW / 2 - 0.02,
    springH - impostH / 2,
    0,
  );
  const keystoneH = Math.min(wedgeW * 2.2, cell * 0.8);
  modBox(
    archGroup,
    "keystone",
    mats.trim,
    ringDepth,
    keystoneH,
    thickness + 0.06,
    0,
    springH + mid + ringDepth / 2 - keystoneH / 2,
    0,
  );
  group.add(columns, archGroup);
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
  const exportable = withCanvasMetalRoughMaps(wrapped);
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      exportable,
      (result) => resolve(result),
      (error) => reject(error),
      {
        binary: true,
        upAxis,
        animations: animations || exportable.animations || [],
      },
    );
  });
}

/* GLTFExporter merges separate metalness/roughness maps by drawing both
   images onto one canvas. That assumes `texture.image` is a drawable, but
   the procedural maps are DataTextures whose image is raw pixels, so the
   browser canvas rejects them. Convert just the maps that would hit the
   merge path into canvas-backed clones before handing the scene over; the
   rest of the scene keeps its normal texture handling. */
function withCanvasMetalRoughMaps(object) {
  let needsConversion = false;
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      if (
        material?.metalnessMap &&
        material?.roughnessMap &&
        material.metalnessMap !== material.roughnessMap &&
        (isRawDataImage(material.metalnessMap.image) ||
          isRawDataImage(material.roughnessMap.image))
      ) {
        needsConversion = true;
        return;
      }
    }
  });
  if (!needsConversion) return object;

  const clone = cloneModelDeep(object);
  const textureClones = new Map();
  clone.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const originalMaterials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    let changed = false;
    const materials = originalMaterials.map((material) => {
      if (
        !material?.metalnessMap ||
        !material?.roughnessMap ||
        material.metalnessMap === material.roughnessMap ||
        (!isRawDataImage(material.metalnessMap.image) &&
          !isRawDataImage(material.roughnessMap.image))
      ) {
        return material;
      }
      const next = material.clone();
      if (isRawDataImage(material.metalnessMap.image)) {
        next.metalnessMap = dataTextureAsCanvas(
          material.metalnessMap,
          textureClones,
        );
      }
      if (isRawDataImage(material.roughnessMap.image)) {
        next.roughnessMap = dataTextureAsCanvas(
          material.roughnessMap,
          textureClones,
        );
      }
      next.needsUpdate = true;
      changed = true;
      return next;
    });
    if (changed) {
      child.material = Array.isArray(child.material) ? materials : materials[0];
    }
  });
  return clone;
}

function isRawDataImage(image) {
  return Boolean(
    image && image.width > 0 && image.height > 0 && image.data !== undefined,
  );
}

function dataTextureAsCanvas(texture, cache) {
  if (cache.has(texture)) return cache.get(texture);
  const image = texture.image;
  const width = image.width;
  const height = image.height;
  const canvas =
    typeof document !== "undefined"
      ? document.createElement("canvas")
      : new OffscreenCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const data = new Uint8ClampedArray(
    image.data.buffer,
    image.data.byteOffset,
    image.data.byteLength,
  );
  context.putImageData(new ImageData(data, width, height), 0, 0);
  const clone = texture.clone();
  clone.image = canvas;
  clone.needsUpdate = true;
  cache.set(texture, clone);
  return clone;
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
  const exportable = withCanvasMetalRoughMaps(wrapped);
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      exportable,
      (result) =>
        resolve(
          typeof result === "string" ? result : JSON.stringify(result, null, 2),
        ),
      (error) => reject(error),
      {
        binary: false,
        upAxis,
        animations: animations || exportable.animations || [],
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
  if (object?.isObject3D) {
    const size = new THREE.Box3()
      .setFromObject(object)
      .getSize(new THREE.Vector3());
    stats.dimensions = {
      width: Math.round(size.x * 10000) / 10000,
      height: Math.round(size.y * 10000) / 10000,
      depth: Math.round(size.z * 10000) / 10000,
    };
  }
  return stats;
}

/** Recommended game attachment points, resolved against the generated part
 * nodes by name so the layout metadata stays useful for a real prefab. */
const ATTACHMENT_POINTS = {
  sword: [{ name: "handle", role: "grip" }],
  axe: [{ name: "handle", role: "grip" }],
  hammer: [{ name: "handle", role: "grip" }],
  spear: [{ name: "shaft", role: "grip" }],
  bow: [{ name: "riser", role: "grip" }],
  shield: [{ name: "body", role: "mount" }],
  character: [{ name: "legs", role: "foot" }],
  monster: [{ name: "legs", role: "foot" }],
  dragon: [{ name: "legs", role: "foot" }],
  car: [{ name: "body", role: "mount" }],
  bike: [{ name: "frame", role: "mount" }],
  plane: [{ name: "fuselage", role: "mount" }],
  boat: [{ name: "hull", role: "mount" }],
  drone: [{ name: "body", role: "mount" }],
  chest: [{ name: "lid", role: "hinge" }],
  torch: [{ name: "cup", role: "socket" }],
  brazier: [{ name: "basin", role: "socket" }],
  campfire: [{ name: "logs", role: "socket" }],
  well: [{ name: "bucket", role: "socket" }],
  antenna: [{ name: "dish", role: "socket" }],
  turret: [{ name: "barrel", role: "socket" }],
  crystal: [{ name: "tip", role: "focus" }],
  runestone: [{ name: "rune", role: "focus" }],
  sign: [{ name: "board", role: "surface" }],
  flag: [{ name: "pole", role: "mount" }],
  stone_coffin: [{ name: "lid", role: "hinge" }],
  portcullis: [{ name: "frame", role: "mount" }],
  cage: [{ name: "door", role: "hinge" }],
  lever: [{ name: "handle", role: "grip" }],
  urn: [{ name: "rim", role: "socket" }],
  beehive: [{ name: "cap", role: "mount" }],
};

/**
 * Measure the named part hierarchy of a generated asset. Every part gets a
 * local-space center, extents and recommended attachment point role so a game
 * team can build prefab sockets, weapon grips or foot references without
 * hand-measuring the mesh again.
 * @param {THREE.Object3D} object - Generated model
 * @param {string} type - Asset type key
 * @param {object} [options] - Optional extra placement metadata
 * @returns {object|null} { root, parts, attachments } or null when unknown
 */
export function getAssetLayoutInfo(object, type, options = {}) {
  const def = ASSET_TYPES[type];
  if (!def || !object?.isObject3D) return null;
  object.updateMatrixWorld(true);
  const rootBox = new THREE.Box3().setFromObject(object);
  const root = {
    center: roundVec(rootBox.getCenter(new THREE.Vector3())),
    extent: roundVecToExtent(rootBox.getSize(new THREE.Vector3())),
    min: roundVec(rootBox.min),
    max: roundVec(rootBox.max),
  };
  const parts = def.parts
    .map((part) => {
      const node = object.getObjectByName(part);
      if (!node) return null;
      const box = new THREE.Box3().setFromObject(node);
      if (box.isEmpty()) return null;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      return {
        name: part,
        center: roundVec(center),
        extent: roundVecToExtent(size),
        min: roundVec(box.min),
        max: roundVec(box.max),
      };
    })
    .filter(Boolean);
  const attachments = (ATTACHMENT_POINTS[type] || [])
    .map((point) => {
      const part = parts.find((entry) => entry.name === point.name);
      if (!part) return null;
      const pivot = new THREE.Vector3(
        part.center.x,
        part.center.y,
        part.center.z,
      );
      if (point.role === "foot") pivot.y = part.min.y;
      return {
        name: point.name,
        role: point.role,
        position: roundVec(pivot),
      };
    })
    .filter(Boolean);
  return {
    root,
    parts,
    attachments,
    ...(options.placement ? { placement: options.placement } : {}),
  };
}

/**
 * Clone a generated model and attach empty anchor nodes at its recommended
 * attachment points. The anchors carry `anchor_<role>` names plus `ai3d`
 * userData so a game engine can find sockets by name after import.
 * @param {THREE.Object3D} object - Generated model
 * @param {string} type - Asset type key
 * @returns {THREE.Object3D|null} Anchored clone, or null when not applicable
 */
export function buildAnchoredModel(object, type) {
  const layout = getAssetLayoutInfo(object, type);
  if (!layout || !layout.attachments.length) return null;
  const clone = cloneModelDeep(object);
  for (const point of layout.attachments) {
    const anchor = new THREE.Object3D();
    anchor.name = `anchor_${point.role}`;
    anchor.position.set(point.position.x, point.position.y, point.position.z);
    anchor.userData.ai3d = { role: point.role, part: point.name };
    clone.add(anchor);
  }
  return clone;
}

/** Round a vector to 4 decimals so exported metadata stays compact. */
function roundVec(vec) {
  return {
    x: Math.round(vec.x * 10000) / 10000,
    y: Math.round(vec.y * 10000) / 10000,
    z: Math.round(vec.z * 10000) / 10000,
  };
}

/** Convert a vector into a width/height/depth metadata shape. */
function roundVecToExtent(vec) {
  const rounded = roundVec(vec);
  return {
    width: rounded.x,
    height: rounded.y,
    depth: rounded.z,
  };
}

/* The audit budget is graduated by the model's longest dimension, because a
   sword and a town gate cannot share a poly budget. The numbers are a soft
   line: a desktop scene can often spend more, and a mobile prop should spend
   less. */
const AUDIT_BUDGETS = [
  { max: 0.12, maxTriangles: 700 },
  { max: 0.35, maxTriangles: 1800 },
  { max: 0.7, maxTriangles: 4200 },
  { max: 2, maxTriangles: 15000 },
  { max: 8, maxTriangles: 60000 },
];
const AUDIT_MAX_TRIANGLES = 120000;

/* Most props ride centered on their origin, while playable and architectural
   pieces want to sit on the floor at y=0. The list is intentionally type
   driven, so an imported sword does not get penalised for a centered origin. */
const AUDIT_GROUND_TYPES = new Set([
  "character",
  "monster",
  "dragon",
  "tree",
  "house",
  "tower",
  "tent",
  "statue",
  "well",
  "fountain",
  "bridge",
  "fence",
  "gate",
  "wagon",
  "cannon",
  "grave",
  "ladder",
  "anvil",
  "bookshelf",
  "cauldron",
  "throne",
  "bench",
  "lantern",
  "table",
  "chair",
  "bed",
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
  "flag",
  "sign",
  "car",
  "bike",
  "plane",
  "boat",
  "wall",
  "wall_window",
  "wall_door",
  "wall_corner",
  "floor",
  "stairs",
  "arch",
  "tree_stump",
  "mushroom",
  "campfire",
]);

const AUDIT_REQUIRED_PARTS = {
  character: ["head", "body"],
  monster: ["head", "body"],
  dragon: ["head", "body"],
  sword: ["blade", "handle"],
  axe: ["head", "handle"],
  hammer: ["head", "handle"],
  spear: ["head", "shaft"],
  bow: ["riser"],
  shield: ["body"],
  chest: ["body", "lid"],
  crate: ["body"],
  barrel: ["body"],
  potion: ["body"],
  key: ["shaft"],
  gate: ["posts", "crossbar"],
  wagon: ["bed", "wheels"],
  cannon: ["barrel", "carriage"],
  grave: ["stone", "mound"],
  ladder: ["rails", "rungs"],
  candelabra: ["base", "stem"],
  anvil: ["body", "base"],
  bookshelf: ["frame", "shelves"],
  cauldron: ["pot", "legs"],
  throne: ["seat", "back"],
  bench: ["seat", "legs"],
  lantern: ["frame", "glass"],
  table: ["top", "legs"],
  chair: ["seat", "legs"],
  bed: ["frame", "mattress"],
  chandelier: ["core", "arms"],
  armor_stand: ["base", "body"],
  skeleton: ["skull", "legs"],
  bread: ["loaf", "board"],
  pie: ["dish", "filling"],
  meat_leg: ["meat", "bone"],
  hay_bale: ["bale", "bands"],
  rope_coil: ["coil", "loops"],
  bucket: ["body", "handle"],
  windmill: ["tower", "sails"],
  coin_pile: ["mound", "coins"],
  minecart: ["bed", "wheels"],
  berry_bush: ["crown", "berries"],
  stone_coffin: ["body", "lid"],
  portcullis: ["frame", "bars"],
  cage: ["frame", "bars"],
  bone_pile: ["mound", "bones"],
  cobweb: ["hub", "strands"],
  lever: ["base", "handle"],
  urn: ["body", "rim"],
  mummy: ["body", "head"],
  beehive: ["body", "cap"],
  wheat_sheaf: ["stalks", "band"],
  house: ["walls", "roof"],
  car: ["body", "wheels"],
  bike: ["frame", "wheels"],
  plane: ["fuselage", "wings"],
  boat: ["hull"],
  drone: ["body", "rotors"],
  turret: ["base", "body"],
  tower: ["shaft"],
};

/* Every rigged asset is expected to ship the clips a game character needs.
   Static props and modular kit pieces intentionally stay out of this table. */
const AUDIT_EXPECTED_ANIMATIONS = {
  character: ["idle", "walk", "attack"],
  monster: ["idle", "walk", "attack"],
  dragon: ["idle", "fly", "attack"],
  chest: ["open"],
  campfire: ["flicker"],
  torch: ["flicker"],
  brazier: ["flicker"],
  lantern: ["flicker"],
  chandelier: ["sway"],
  minecart: ["spin"],
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
  stone_coffin: ["open"],
  portcullis: ["raise"],
  cobweb: ["sway"],
  lever: ["pull"],
  mummy: ["lurch"],
  beehive: ["buzz"],
};

const clampScore = (value) => Math.max(0, Math.min(1, value));

function auditScoreFromStatus(score) {
  if (score >= 0.6) return "pass";
  if (score >= 0.3) return "warn";
  return "fail";
}

/**
 * Game-readiness audit for a generated asset. Reports how close a model is to
 * something a Unity/Godot/Unreal import can use directly: named geometry,
 * poly and draw-call budgets, collision proxy, LOD chain, animation clips,
 * skinning, PBR material coverage and origin placement.
 * @param {THREE.Object3D} object - Generated or imported model
 * @param {string} type - Asset type key (or "scene" for composed scenes)
 * @param {object} [options] - Audit options
 * @param {string} [options.pivot] - "center" or "ground"
 * @param {Array} [options.lodLevels] - Precomputed LOD level descriptors
 * @param {string[]} [options.partNames] - Expected part names when a type is
 *   not in ASSET_TYPES (used by composed scenes)
 * @param {object} [options.meta] - Extra record metadata (name, tags)
 * @returns {object} Audit report
 */
export function auditGameAsset(object, type, options = {}) {
  const checks = [];
  if (!object?.isObject3D) {
    return {
      overview: { type: "" },
      stats: { triangles: 0, vertices: 0, parts: 0, drawCalls: 0 },
      checks: [
        {
          id: "mesh",
          label: "mesh",
          category: "mesh",
          score: 0,
          status: "fail",
          details: ["no object"],
        },
      ],
      summary: { pass: 0, warn: 0, fail: 1, blocked: true },
      readiness: 0,
    };
  }

  const stats = getAssetStats(object);
  const def = ASSET_TYPES[type];
  const layout = def ? getAssetLayoutInfo(object, type) : null;
  const declaredParts = options.partNames || (def ? def.parts : []);
  const foundParts = layout?.parts.map((p) => p.name) || [];
  const missingParts = declaredParts.filter(
    (name) => !object.getObjectByName(name),
  );
  const required =
    AUDIT_REQUIRED_PARTS[type] ||
    (type === "scene"
      ? []
      : declaredParts.filter(
          (name) =>
            name === "body" ||
            name === "head" ||
            name === "base" ||
            name === "handle" ||
            name === "grip" ||
            name === "frame" ||
            name === "wheels" ||
            name === "hull" ||
            name === "roof" ||
            name === "walls",
        ));
  const missingRequired = required.filter((name) => !foundParts.includes(name));

  const partScore = declaredParts.length
    ? clampScore(
        (declaredParts.length - missingParts.length) / declaredParts.length,
      )
    : 1;
  const partSeverity = missingRequired.length
    ? Math.max(0, partScore - 0.2)
    : partScore;
  checks.push({
    id: "parts",
    label: "parts",
    category: "parts",
    score: partSeverity,
    status: auditScoreFromStatus(partSeverity),
    details: [
      `${foundParts.length}/${declaredParts.length || 0} named parts`,
      `${layout?.attachments?.length || 0} attachment points`,
      ...(missingParts.length ? [`missing: ${missingParts.join(", ")}`] : []),
      ...(missingRequired.length
        ? [`essential: ${missingRequired.join(", ")}`]
        : []),
    ],
  });

  const longest =
    stats.dimensions &&
    Math.max(
      stats.dimensions.width,
      stats.dimensions.height,
      stats.dimensions.depth,
    );
  let budget = AUDIT_BUDGETS[0]?.maxTriangles || 1800;
  if (Number.isFinite(longest)) {
    for (const entry of AUDIT_BUDGETS) {
      if (longest <= entry.max) {
        budget = entry.maxTriangles;
        break;
      }
      budget = AUDIT_MAX_TRIANGLES;
    }
  }
  const ratio = stats.triangles / budget;
  const budgetScore = ratio <= 1 ? 1 : ratio <= 3 ? 1 - (ratio - 1) / 3 : 0;
  checks.push({
    id: "budget",
    label: "budget",
    category: "budget",
    score: clampScore(budgetScore),
    status: auditScoreFromStatus(budgetScore),
    details: [
      `${stats.triangles} triangles / ${budget} budget`,
      `${stats.drawCalls} draw calls`,
      `longest dimension ${Math.round((longest || 0) * 100) / 100} m`,
    ],
  });

  const recommendedCollider = getColliderShape(type);
  const collider = computeCollider(object, "auto");
  let collisionScore;
  if (recommendedCollider === "none" || recommendedCollider === "mesh") {
    collisionScore = collider ? 1 : 0.6;
  } else {
    collisionScore =
      collider &&
      (recommendedCollider === "box"
        ? collider.shape === "box"
        : collider.shape === recommendedCollider)
        ? 1
        : collider
          ? 0.55
          : 0;
  }
  collisionScore = clampScore(collisionScore);
  checks.push({
    id: "collision",
    label: "collider",
    category: "collision",
    score: collisionScore,
    status: auditScoreFromStatus(collisionScore),
    details: [
      `recommended ${recommendedCollider}`,
      collider
        ? `computed ${collider.shape}${collider.size ? ` ${collider.size.map((v) => Math.round(v * 100) / 100).join("x")}` : ""}`
        : "none",
      recommendedCollider === "convex"
        ? "convex hull physics is heavier than primitives"
        : "",
    ].filter(Boolean),
  });

  const riggable = RIGGABLE_ASSET_TYPES.has(type);
  let lodLevels = options.lodLevels;
  let generatedLods = null;
  if (lodLevels === undefined) {
    generatedLods = generateLOD(object, 4);
    lodLevels = generatedLods;
  }
  const lodCount = Array.isArray(lodLevels) ? lodLevels.length : 0;
  const lodTriangleCounts = lodLevels
    ? lodLevels
        .map((level) =>
          level?.stats ? level.stats.triangles : level?.triangles,
        )
        .filter((value) => typeof value === "number")
    : [];
  const lastReduction =
    lodTriangleCounts.length >= 2
      ? 1 -
        lodTriangleCounts[lodTriangleCounts.length - 1] / lodTriangleCounts[0]
      : 0;
  const meaningfulDrop = lodTriangleCounts.length >= 2 && lastReduction >= 0.15;
  const skinKept =
    lodTriangleCounts.length >= 2 &&
    (generatedLods || lodLevels).slice(1).every((level) => {
      let hasSkin = true;
      level.mesh?.traverse((child) => {
        if (child.isSkinnedMesh) {
          hasSkin =
            hasSkin &&
            !!child.geometry?.attributes?.skinIndex &&
            !!child.geometry?.attributes?.skinWeight;
        }
      });
      return hasSkin;
    });
  const lodScore = riggable
    ? lodTriangleCounts.length >= 2 && meaningfulDrop && skinKept
      ? 1
      : lodTriangleCounts.length >= 2 && meaningfulDrop
        ? 0.45
        : lodTriangleCounts.length >= 2
          ? 0.3
          : 0.25
    : lodTriangleCounts.length >= 2 && meaningfulDrop
      ? 1
      : lodTriangleCounts.length >= 2
        ? 0.6
        : 0.3;
  checks.push({
    id: "lod",
    label: "lod",
    category: "lod",
    score: lodScore,
    status: auditScoreFromStatus(lodScore),
    details: [
      `${lodTriangleCounts.length} levels`,
      lodTriangleCounts.length
        ? lodTriangleCounts.map((v, i) => `LOD${i} ${v}`).join(", ")
        : "none",
      ...(riggable && !skinKept ? ["skinned LOD keeps skin attributes"] : []),
      ...(lodTriangleCounts.length >= 2 && !meaningfulDrop
        ? ["end LOD reduction under 15%"]
        : []),
    ],
  });

  const expectedClips = AUDIT_EXPECTED_ANIMATIONS[type];
  const availableClips = (object.animations || []).map((clip) => clip.name);
  const matchedClips = expectedClips
    ? expectedClips.filter((name) => availableClips.includes(name))
    : [];
  let animationScore;
  if (!expectedClips) {
    animationScore = 1;
  } else if (riggable) {
    const requirement = Math.min(2, expectedClips.length);
    animationScore = matchedClips.length >= requirement ? 1 : 0.35;
  } else {
    animationScore = matchedClips.length >= 1 ? 1 : 0.4;
  }
  animationScore = clampScore(animationScore);
  checks.push({
    id: "animation",
    label: "animation",
    category: "animation",
    score: animationScore,
    status: auditScoreFromStatus(animationScore),
    details: [
      `${matchedClips.length}/${expectedClips?.length || 0} expected clips`,
      expectedClips ? `expected ${expectedClips.join(", ")}` : "static asset",
      availableClips.length ? `found ${availableClips.join(", ")}` : "",
    ].filter(Boolean),
  });

  const skeletonGroup = object.getObjectByName("skeleton");
  const skinned = [];
  const skinCounts = [];
  object.traverse((child) => {
    if (child.isSkinnedMesh) {
      skinned.push(child);
      skinCounts.push({
        name: child.name,
        joints: !!child.geometry?.attributes?.skinIndex,
        weights: !!child.geometry?.attributes?.skinWeight,
        bound: !!child.skeleton,
      });
    }
  });
  let boneCount = 0;
  skeletonGroup?.traverse((child) => {
    if (child.isBone) boneCount += 1;
  });
  const allSkinned =
    (skinCounts.length > 0 &&
      skinCounts.every(
        (entry) => entry.joints && entry.weights && entry.bound,
      )) ||
    skinned.length === 0;
  const rigScore = riggable
    ? skeletonGroup && boneCount >= 3 && allSkinned
      ? 1
      : skeletonGroup
        ? 0.5
        : 0
    : 1;
  checks.push({
    id: "rig",
    label: "rig",
    category: "rig",
    score: rigScore,
    status: auditScoreFromStatus(rigScore),
    details: [
      `${skinCounts.length} skinned meshes`,
      `${boneCount} bones`,
      ...(riggable && !allSkinned
        ? ["some skinned meshes miss joints/weights"]
        : []),
      ...(riggable && !skeletonGroup ? ["no skeleton group"] : []),
    ],
  });

  const meshes = [];
  object.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  const materials = new Set();
  meshes.forEach((mesh) => {
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    list.forEach((mat) => {
      if (mat?.isMaterial) materials.add(mat);
    });
  });
  const materialsList = Array.from(materials);
  const pbrMaterials = materialsList.filter(
    (mat) =>
      typeof mat.roughness === "number" &&
      typeof mat.metalness === "number" &&
      mat.isMeshStandardMaterial,
  ).length;
  const mappedMaterials = materialsList.filter(
    (mat) => mat.map || mat.roughnessMap || mat.metalnessMap || mat.normalMap,
  ).length;
  const uvMeshes = meshes.filter(
    (mesh) => !!mesh.geometry?.attributes?.uv,
  ).length;
  const uvCoverage = meshes.length ? uvMeshes / meshes.length : 0;
  const pbrCoverage = materialsList.length
    ? pbrMaterials / materialsList.length
    : 0;
  const mapCoverage = materialsList.length
    ? mappedMaterials / materialsList.length
    : 0;
  const materialScore = clampScore(
    0.45 * uvCoverage + 0.35 * pbrCoverage + 0.2 * mapCoverage + 0.2,
  );
  checks.push({
    id: "material",
    label: "material",
    category: "material",
    score: materialScore,
    status: auditScoreFromStatus(materialScore),
    details: [
      `${materialsList.length} materials`,
      `${uvMeshes}/${meshes.length} meshes with UVs`,
      `${pbrMaterials}/${materialsList.length} PBR materials`,
      `${mappedMaterials}/${materialsList.length} mapped materials`,
    ],
  });

  checks.push({
    id: "uv",
    label: "uv",
    category: "uv",
    score: clampScore(uvCoverage),
    status: auditScoreFromStatus(uvCoverage),
    details: [`${uvMeshes}/${meshes.length} meshes with UVs`],
  });

  const dims = stats.dimensions || {};
  const dimValues = [dims.width, dims.height, dims.depth].filter((value) =>
    Number.isFinite(value),
  );
  const dimMax = dimValues.length ? Math.max(...dimValues) : 0;
  const degenerate = dimValues.some((value) => value < 1e-4);
  const dimScore =
    dimMax >= 0.01 && dimMax <= 60 && !degenerate ? 1 : dimMax > 0 ? 0.6 : 0;
  checks.push({
    id: "dimensions",
    label: "dimensions",
    category: "dimensions",
    score: clampScore(dimScore),
    status: auditScoreFromStatus(dimScore),
    details: [
      `w ${dims.width || 0} m, h ${dims.height || 0} m, d ${dims.depth || 0} m`,
      dimMax < 0.01 || dimMax > 60 ? "dimensions look outside game scale" : "",
    ].filter(Boolean),
  });

  const box = new THREE.Box3().setFromObject(object);
  const boxMin = box.min.y;
  const boxCenterY = (box.min.y + box.max.y) / 2;
  const groundPivot =
    options.pivot != null
      ? options.pivot === "ground" || options.pivot === "bottom"
      : AUDIT_GROUND_TYPES.has(type);
  const toleranceRaw = Math.max(0.01, dimMax * 0.02);
  const originMismatch = groundPivot ? Math.abs(boxMin) : Math.abs(boxCenterY);
  const originScore =
    originMismatch <= toleranceRaw
      ? 1
      : originMismatch <= toleranceRaw * 2
        ? 0.45
        : 0.1;
  checks.push({
    id: "origin",
    label: "origin",
    category: "origin",
    score: clampScore(originScore),
    status: auditScoreFromStatus(originScore),
    details: [
      groundPivot
        ? `ground asset, bottom at y=${Math.round(boxMin * 1000) / 1000}`
        : `centered asset, center at y=${Math.round(boxCenterY * 1000) / 1000}`,
      `allowed ${Math.round(toleranceRaw * 1000) / 1000} m`,
    ],
  });

  checks.push({
    id: "mesh",
    label: "mesh",
    category: "mesh",
    score: meshes.length ? 1 : 0,
    status: meshes.length ? "pass" : "fail",
    details: [
      `${meshes.length} renderable meshes`,
      `${stats.triangles} triangles`,
      `${stats.vertices} vertices`,
    ],
  });

  const tally = { pass: 0, warn: 0, fail: 0 };
  checks.forEach((check) => {
    tally[check.status] = (tally[check.status] || 0) + 1;
  });
  const readiness = checks.length
    ? checks.reduce((sum, check) => sum + check.score, 0) / checks.length
    : 1;

  return {
    overview: {
      type,
      name:
        options.meta?.name ||
        (def ? def.name : type === "scene" ? "Composed scene" : type),
      tags: options.meta?.tags || getAssetTags(type),
      pivot: options.pivot || (groundPivot ? "ground" : "center"),
    },
    stats,
    checks,
    summary: {
      pass: tally.pass,
      warn: tally.warn,
      fail: tally.fail,
      blocked: tally.fail > 0,
      ready: tally.fail === 0 && tally.warn === 0,
    },
    readiness: Math.round(readiness * 100) / 100,
  };
}

/* The repair pass only touches things an editor can fix mechanically: UV and
   normal data, material class, triangle budget, the LOD chain, the pivot and
   the physics proxy. Missing parts, animation clips and a skeleton are output
   of the generator itself, so the repair report says regenerate instead of
   pretending geometry can conjure them. */
const REPAIR_SKIP_PREFIX = "regenerate-asset";

function repairBudgetFor(object) {
  const stats = getAssetStats(object);
  const longest =
    stats.dimensions &&
    Math.max(
      stats.dimensions.width,
      stats.dimensions.height,
      stats.dimensions.depth,
    );
  let budget = AUDIT_BUDGETS[0]?.maxTriangles || 1800;
  if (Number.isFinite(longest)) {
    for (const entry of AUDIT_BUDGETS) {
      if (longest <= entry.max) {
        budget = entry.maxTriangles;
        break;
      }
      budget = AUDIT_MAX_TRIANGLES;
    }
  }
  return { budget, triangles: stats.triangles };
}

function ensureRepairNormals(mesh) {
  const geometry = mesh.geometry;
  if (!geometry?.attributes.position) return;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
}

function ensureRepairUvs(mesh) {
  const geometry = mesh.geometry;
  if (!geometry?.attributes.position) return;
  if (geometry.attributes.uv) return;
  const position = geometry.attributes.position;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const normal = geometry.attributes.normal;
  const count = position.count;
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const abs = [Math.abs(nx), Math.abs(ny), Math.abs(nz)];
    let u;
    let v;
    if (abs[0] >= abs[1] && abs[0] >= abs[2]) {
      u = z;
      v = y;
    } else if (abs[1] >= abs[2]) {
      u = x;
      v = z;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

function ensureRepairMaterial(mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (let i = 0; i < mats.length; i++) {
    const mat = mats[i];
    if (!mat || mat.isMeshStandardMaterial) continue;
    const next = new THREE.MeshStandardMaterial({
      color: mat.color || 0x888888,
      roughness: mat.roughness ?? 0.85,
      metalness: mat.metalness ?? 0,
      transparent: !!mat.transparent,
      opacity: mat.opacity ?? 1,
      emissive: mat.emissive ?? 0x000000,
    });
    next.name = mat.name;
    next.userData.repairedMaterial = true;
    if (Array.isArray(mesh.material)) mesh.material[i] = next;
    else mesh.material = next;
  }
}

function collectRepairRecords(object, type, report, options = {}) {
  const failed = new Set(
    report.checks
      .filter((check) => check.status === "fail")
      .map((check) => check.id),
  );
  const records = [];

  if (failed.has("uv") || failed.has("material")) {
    let uvCount = 0;
    let normalCount = 0;
    let materialCount = 0;
    object.traverse((child) => {
      if (!child.isMesh) return;
      if (!child.geometry?.attributes.uv) {
        ensureRepairUvs(child);
        uvCount += 1;
      } else if (!child.geometry.attributes.normal) {
        ensureRepairNormals(child);
        normalCount += 1;
      }
      if (
        failed.has("material") &&
        child.material &&
        !(Array.isArray(child.material)
          ? child.material.every((mat) => mat?.isMeshStandardMaterial)
          : child.material.isMeshStandardMaterial)
      ) {
        ensureRepairMaterial(child);
        materialCount += 1;
      }
    });
    if (uvCount) records.push({ code: "uv", count: uvCount });
    if (normalCount) records.push({ code: "normal", count: normalCount });
    if (materialCount) records.push({ code: "material", count: materialCount });
  }

  if (failed.has("budget")) {
    const { budget, triangles } = repairBudgetFor(object);
    const target = Math.max(100, Math.floor(budget * 0.8));
    if (triangles > target) {
      const thresholds = [
        0.01, 0.02, 0.04, 0.06, 0.1, 0.15, 0.25, 0.4, 0.6, 0.9, 1.4, 2.2, 3.2,
        4.5,
      ];
      let current = triangles;
      for (const threshold of thresholds) {
        if (current <= target) break;
        object.traverse((child) => {
          if (child.isMesh) decimateMesh(child, threshold);
        });
        current = getAssetStats(object).triangles;
      }
      records.push({
        code: "budget",
        count: 1,
        detail: `${triangles}->${current} / ${budget}`,
      });
    }
  }

  if (failed.has("lod") && type !== "scene") {
    const levels = generateLOD(object, 4);
    if (levels.length >= 2) {
      object.userData.lods = levels;
      records.push({ code: "lod", count: levels.length });
    }
  }

  if (failed.has("origin")) {
    const groundPivot =
      options.pivot != null
        ? options.pivot === "ground" || options.pivot === "bottom"
        : AUDIT_GROUND_TYPES.has(type);
    const pivot = options.pivot || (groundPivot ? "ground" : "center");
    // Measure the anchor the pivot requests, then move the root by exactly the
    // world-space correction needed to land it on the origin. The correction is
    // re-derived from the box on every call, so a second repair of the same
    // model is a no-op instead of shifting the root twice.
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const anchor =
      pivot === "ground" || pivot === "bottom"
        ? new THREE.Vector3(center.x, box.min.y, center.z)
        : pivot === "top"
          ? new THREE.Vector3(center.x, box.max.y, center.z)
          : center;
    const correction = anchor.clone().negate();
    if (object.parent) {
      object.parent.updateWorldMatrix(true, false);
      correction.applyMatrix4(object.parent.matrixWorld.clone().invert());
    }
    object.position.copy(object.position).add(correction);
    object.updateMatrixWorld(true);
    records.push({ code: "origin", count: 1 });
  }

  if (failed.has("collision") && type !== "scene") {
    const shape = getColliderShape(type);
    if (shape && shape !== "mesh" && shape !== "none") {
      const collider = computeCollider(object, shape);
      if (collider?.shape !== "mesh" && collider?.shape !== "none") {
        const group = buildColliderModel(collider);
        if (group) {
          object.add(group);
          records.push({ code: "collider", count: 1, detail: collider.shape });
        }
      }
    }
  }

  for (const check of report.checks) {
    if (records.some((record) => record.code === check.id)) continue;
    if (check.status === "fail" && check.id !== "mesh") {
      records.push({ code: REPAIR_SKIP_PREFIX, count: 1, detail: check.id });
    }
  }
  return records;
}

/**
 * Apply mechanical game-readiness fixes to a model and report what changed.
 * The audit decides what is broken; this pass only fixes UV/normal data,
 * material class, poly budget, LOD chain, pivot and collision proxy. Missing
 * parts, animation clips and a skeleton are generator output, so they are
 * reported as "regenerate-asset" skips instead of fake fixes.
 * @param {THREE.Object3D} object - Model to repair in place
 * @param {string} type - Asset type key (or "scene")
 * @param {object} [options] - Same pivot/partNames/meta as auditGameAsset
 * @returns {object} { fixed, skipped, report, notes }
 */
export function repairGameAsset(object, type, options = {}) {
  if (!object?.isObject3D) {
    return {
      fixed: [],
      skipped: [{ code: REPAIR_SKIP_PREFIX, detail: "mesh" }],
      report: auditGameAsset(object, type, options),
      notes: [],
    };
  }
  const report = auditGameAsset(object, type, options);
  const records = collectRepairRecords(object, type, report, options);
  const fixed = records.filter((record) => record.code !== REPAIR_SKIP_PREFIX);
  const skipped = records.filter(
    (record) => record.code === REPAIR_SKIP_PREFIX,
  );
  const reportAfter = auditGameAsset(object, type, {
    ...options,
    lodLevels:
      Array.isArray(object.userData?.lods) && object.userData.lods.length > 1
        ? object.userData.lods
        : undefined,
  });
  const notes = [
    ...fixed.map((record) =>
      [
        record.code,
        ...(record.count != null ? [`${record.count}`] : []),
        ...(record.detail != null ? [`${record.detail}`] : []),
      ].join(":"),
    ),
    ...skipped.map((record) =>
      ["skipped", record.detail].filter(Boolean).join(":"),
    ),
  ];
  return { fixed, skipped, report: reportAfter, notes };
}

/* A convex hull only needs the extremes of a mesh, so a dense model is thinned
   before the hull is built. Capping the candidates keeps a browser frame from
   stalling while still leaving every silhouette-defining vertex in place. */
const CONVEX_CANDIDATE_LIMIT = 3000;

function collectColliderPoints(model, limit = CONVEX_CANDIDATE_LIMIT) {
  const sources = [];
  let total = 0;
  model.updateMatrixWorld(true);
  model.traverse((node) => {
    const position = node.isMesh
      ? node.geometry?.getAttribute?.("position")
      : null;
    if (!position || position.count === 0) return;
    sources.push({ node, position });
    total += position.count;
  });
  if (total === 0) return [];

  const stride = Math.max(1, Math.ceil(total / Math.max(4, limit)));
  const vertex = new THREE.Vector3();
  const points = [];
  for (const { node, position } of sources) {
    for (let index = 0; index < position.count; index += stride) {
      vertex
        .fromBufferAttribute(position, index)
        .applyMatrix4(node.matrixWorld);
      if (
        Number.isFinite(vertex.x) &&
        Number.isFinite(vertex.y) &&
        Number.isFinite(vertex.z)
      ) {
        points.push(vertex.clone());
      }
    }
  }
  return points;
}

/**
 * Build a convex hull mesh from world-space points, a flat `[x, y, z, …]`
 * array, or a stored hull payload. Returns null when the input is degenerate,
 * which lets callers fall back to a primitive instead of exporting nothing.
 * @param {THREE.Vector3[]|number[]} points
 * @returns {THREE.BufferGeometry|null}
 */
export function buildConvexHullGeometry(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let vectors;
  if (points[0] instanceof THREE.Vector3) {
    vectors = points;
  } else {
    vectors = [];
    for (let index = 0; index + 2 < points.length; index += 3) {
      vectors.push(
        new THREE.Vector3(points[index], points[index + 1], points[index + 2]),
      );
    }
  }
  if (vectors.length < 4) return null;

  try {
    const geometry = new ConvexGeometry(vectors);
    const position = geometry?.getAttribute?.("position");
    if (!position || position.count < 3) {
      geometry?.dispose?.();
      return null;
    }
    geometry.computeVertexNormals();
    return geometry;
  } catch {
    return null;
  }
}

/**
 * Fit a collision primitive around a generated model. The dimensions are
 * slightly shrunk so physics proxies sit just inside the visible mesh and do
 * not catch stray edges in the game engine. "convex" wraps the sampled mesh
 * vertices in a hull and stores it relative to the collider centre; "mesh"
 * keeps no proxy because the exported model is the collider.
 * @param {THREE.Object3D} model - Generated model
 * @param {string} shape - "box", "sphere", "capsule", "cylinder", "convex", "mesh" or "auto"
 * @returns {object|null} Collision metadata, or null for "none"
 */
export function computeCollider(model, shape = "auto") {
  const resolved =
    shape === "auto" || shape == null
      ? getColliderShape(String(model.name || "").replace(/^asset-/, ""))
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

  if (resolved === "convex") {
    const hull = buildConvexHullGeometry(collectColliderPoints(model));
    if (hull) {
      const position = hull.getAttribute("position");
      const seen = new Set();
      const hullPoints = [];
      for (let index = 0; index < position.count; index++) {
        const x = round(position.getX(index) - center.x);
        const y = round(position.getY(index) - center.y);
        const z = round(position.getZ(index) - center.z);
        const key = `${x}|${y}|${z}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hullPoints.push(x, y, z);
      }
      const hullTriangles = Math.floor(position.count / 3);
      hull.dispose();
      return {
        shape: "convex",
        center: center.toArray().map(round),
        size: size.map(round),
        hullPoints,
        hullTriangles,
      };
    }
    // A degenerate mesh still needs a proxy, so the hull degrades to a box.
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
 * Build a small GLB-exportable visual for a collision primitive or hull. Mesh
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
  } else if (collider.shape === "convex") {
    geometry = buildConvexHullGeometry(collider.hullPoints || []);
    if (!geometry && collider.size) {
      const [w, h, d] = collider.size;
      geometry = new THREE.BoxGeometry(w, h, d);
    }
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
 * Gameplay metadata tells an engine what a prop is for: how a player can
 * interact with it and what role AI, nav and spawning systems should treat it
 * as. Explicit entries win for types with distinctive behaviour; everything
 * else gets a stable default from its category tags.
 */
const GAMEPLAY_PRESETS = {
  character: { interaction: "talk", role: "npc" },
  monster: { interaction: "enemy", role: "enemy" },
  dragon: { interaction: "enemy", role: "enemy" },
  skeleton: { interaction: "enemy", role: "enemy" },
  mummy: { interaction: "enemy", role: "enemy" },
  sword: { interaction: "attack", role: "weapon" },
  axe: { interaction: "attack", role: "weapon" },
  hammer: { interaction: "attack", role: "weapon" },
  spear: { interaction: "attack", role: "weapon" },
  bow: { interaction: "attack", role: "weapon" },
  shield: { interaction: "use", role: "weapon" },
  cannon: { interaction: "attack", role: "weapon" },
  turret: { interaction: "attack", role: "sentry" },
  chest: { interaction: "open", role: "container" },
  stone_coffin: { interaction: "open", role: "container" },
  crate: { interaction: "open", role: "container" },
  barrel: { interaction: "open", role: "container" },
  barrel_variants: { interaction: "open", role: "container" },
  urn: { interaction: "open", role: "container" },
  cage: { interaction: "open", role: "container" },
  gate: { interaction: "open", role: "door" },
  wall_door: { interaction: "open", role: "door" },
  portcullis: { interaction: "raise", role: "door" },
  lever: { interaction: "pull", role: "switch" },
  runestone: { interaction: "activate", role: "switch" },
  trap: { interaction: "damage", role: "hazard" },
  torch: { interaction: "light", role: "light" },
  brazier: { interaction: "light", role: "light" },
  lantern: { interaction: "light", role: "light" },
  candelabra: { interaction: "light", role: "light" },
  chandelier: { interaction: "light", role: "light" },
  campfire: { interaction: "light", role: "light" },
  coin_pile: { interaction: "collect", role: "collectible" },
  gem: { interaction: "collect", role: "collectible" },
  key: { interaction: "collect", role: "collectible" },
  potion: { interaction: "use", role: "consumable" },
  bread: { interaction: "eat", role: "consumable" },
  pie: { interaction: "eat", role: "consumable" },
  meat_leg: { interaction: "eat", role: "consumable" },
  beehive: { interaction: "harvest", role: "resource" },
  wheat_sheaf: { interaction: "harvest", role: "resource" },
  hay_bale: { interaction: "harvest", role: "resource" },
  berry_bush: { interaction: "harvest", role: "resource" },
  crystal: { interaction: "mine", role: "resource" },
  mushroom: { interaction: "collect", role: "resource" },
  table: { interaction: "use", role: "furniture" },
  bookshelf: { interaction: "use", role: "furniture" },
  armor_stand: { interaction: "use", role: "furniture" },
  chair: { interaction: "seat", role: "furniture" },
  throne: { interaction: "seat", role: "furniture" },
  bench: { interaction: "seat", role: "furniture" },
  bed: { interaction: "sleep", role: "furniture" },
  bucket: { interaction: "use", role: "tool" },
  rope_coil: { interaction: "use", role: "tool" },
  anvil: { interaction: "use", role: "tool" },
  cauldron: { interaction: "use", role: "tool" },
  drone: { interaction: "use", role: "tool" },
  minecart: { interaction: "ride", role: "mount" },
  wagon: { interaction: "ride", role: "mount" },
  car: { interaction: "ride", role: "mount" },
  bike: { interaction: "ride", role: "mount" },
  boat: { interaction: "ride", role: "mount" },
  plane: { interaction: "ride", role: "mount" },
  ladder: { interaction: "climb", role: "path" },
  bridge: { interaction: "cross", role: "path" },
  stairs: { interaction: "none", role: "path" },
  well: { interaction: "use", role: "structure" },
  fountain: { interaction: "use", role: "structure" },
  windmill: { interaction: "activate", role: "structure" },
};

const GAMEPLAY_TAG_DEFAULTS = [
  ["enemy", { interaction: "enemy", role: "enemy" }],
  ["weapon", { interaction: "attack", role: "weapon" }],
  ["light", { interaction: "light", role: "light" }],
  ["collectible", { interaction: "collect", role: "collectible" }],
  ["container", { interaction: "open", role: "container" }],
  ["vehicle", { interaction: "ride", role: "mount" }],
  ["furniture", { interaction: "use", role: "furniture" }],
  ["food", { interaction: "collect", role: "consumable" }],
  ["tool", { interaction: "use", role: "tool" }],
  ["structure", { interaction: "none", role: "structure" }],
  ["terrain", { interaction: "none", role: "terrain" }],
  ["decoration", { interaction: "none", role: "decoration" }],
];

/**
 * Spawn metadata tells an engine how a creature enters a scene: which side it
 * belongs to, which AI drives it, and the combat numbers gate and balance
 * systems need. Props and structures get no spawn entry.
 */
const SPAWN_PRESETS = {
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

const SPAWN_TAG_FALLBACKS = [
  [
    "enemy",
    {
      faction: "hostile",
      ai: "melee-chase",
      health: 60,
      moveSpeed: 3,
      aggroRange: 10,
      attackDamage: 8,
    },
  ],
];

/**
 * Get the engine-facing spawn metadata for an asset type, or null for props
 * that are not spawned as creatures.
 * @param {string} type - Asset type id
 * @returns {null | { faction: string, ai: string, health: number, moveSpeed: number, aggroRange: number, attackDamage: number }}
 */
export function getSpawnInfo(type) {
  const explicit = SPAWN_PRESETS[type];
  if (explicit) return { ...explicit };
  const tags = ASSET_TAGS[type] || [];
  for (const [tag, fallback] of SPAWN_TAG_FALLBACKS) {
    if (tags.includes(tag)) return { ...fallback };
  }
  return null;
}

/**
 * Get the engine-facing gameplay metadata for an asset type.
 * @param {string} type - Asset type id
 * @returns {{ interaction: string, role: string }} Interaction and role hints
 */
export function getGameplayInfo(type) {
  const explicit = GAMEPLAY_PRESETS[type];
  if (explicit) return { ...explicit };
  const tags = ASSET_TAGS[type] || [];
  for (const [tag, fallback] of GAMEPLAY_TAG_DEFAULTS) {
    if (tags.includes(tag)) return { ...fallback };
  }
  return { interaction: "none", role: "prop" };
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
    gameplay: getGameplayInfo(type),
    spawn: getSpawnInfo(type),
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

/* A convex collider is the one shape with a variable-length payload, so the
   manifest spells out which key belongs to which shape instead of spreading
   whatever computeCollider happened to return. The hull points are metres,
   relative to the collider centre, and are enough to rebuild the hull in an
   engine that cannot read the collider GLB. */
function colliderRecord(collider) {
  if (!collider) return null;
  const record = {
    shape: collider.shape,
    center: collider.center,
    size: collider.size,
  };
  if (collider.axis) record.axis = collider.axis;
  if (collider.radius != null) record.radius = collider.radius;
  if (collider.height != null) record.height = collider.height;
  if (Array.isArray(collider.hullPoints)) {
    record.hullPoints = collider.hullPoints;
    record.hullTriangles = collider.hullTriangles ?? 0;
  }
  return record;
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
    sceneKind:
      asset.scene?.sceneKind === "modular-scene" ||
      (asset.scene?.modular && asset.scene.modular.preset)
        ? "modular-scene"
        : null,
    seed: asset.seed ?? null,
    groundColor: asset.scene?.groundColor ?? null,
    quality: asset.scene?.quality ?? null,
    spacing: asset.scene?.spacing ?? asset.theme?.spacing ?? 1,
    groundPadding:
      asset.scene?.groundPadding ?? asset.theme?.groundPadding ?? 0.6,
    propScale: asset.scene?.propScale ?? asset.theme?.propScale ?? 1,
    modular: asset.scene?.modular ?? null,
    theme: asset.scene?.theme ||
      (asset.theme ?? null) || {
        style: asset.style ?? "lowpoly",
        color: asset.color || null,
        material: asset.material || null,
        texture: asset.texture ?? "auto",
        textureStrength: asset.textureStrength ?? 0.8,
        textureSize: asset.textureSize ?? 256,
      },
    props: Array.isArray(asset.scene?.props) ? asset.scene.props : [],
  };
}

/* A pack-level readiness report should stay stable whether it was written by
   the UI pipeline, a CLI run or an older record, so the packed shape is
   normalised here and the summary derived from it. */
function normaliseReadiness(readiness) {
  if (!readiness || typeof readiness !== "object") return null;
  const fail = Number(readiness.fail) || 0;
  return {
    score: Number.isFinite(readiness.score)
      ? Math.max(0, Math.min(100, Math.round(readiness.score)))
      : null,
    fail,
    fixed: Array.isArray(readiness.fixed) ? readiness.fixed.map(String) : [],
    skipped: Array.isArray(readiness.skipped)
      ? readiness.skipped.map(String)
      : [],
  };
}

/**
 * Summarise per-asset game readiness into one portable report. Callers pass
 * the pack records (or library records) so the same numbers appear in the
 * manifest, in `game-ready.json` and in the UI status line.
 * @param {object[]} records - Records that may carry a `readiness` block
 * @returns {{count:number,ready:number,repaired:number,issues:number,notAudited:number,rows:object[]}}
 */
export function summariseGameReadiness(records = []) {
  const rows = records.map((record) => {
    const readiness = normaliseReadiness(record?.readiness);
    const status = !readiness
      ? "not-audited"
      : readiness.fail > 0
        ? "needs-attention"
        : readiness.fixed.length > 0
          ? "repaired"
          : "ready";
    return {
      id: record?.id || record?.type || "asset",
      name: record?.name || record?.type || "asset",
      type: record?.type || null,
      kind: record?.kind === "scene" ? "scene" : "asset",
      status,
      score: readiness?.score ?? null,
      fail: readiness?.fail ?? null,
      fixed: readiness?.fixed ?? [],
      skipped: readiness?.skipped ?? [],
    };
  });
  return {
    count: rows.length,
    ready: rows.filter((row) => row.status === "ready").length,
    repaired: rows.filter((row) => row.status === "repaired").length,
    issues: rows.filter((row) => row.status === "needs-attention").length,
    notAudited: rows.filter((row) => row.status === "not-audited").length,
    rows,
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
      gameplay: isScene ? null : getGameplayInfo(asset.type),
      spawn: isScene ? null : getSpawnInfo(asset.type),
      clipFiles: (asset.animationFiles || []).map((clip) => ({
        name: clip.name,
        duration: clip.duration,
        file: `animations/${slug}/${clip.name}.glb`,
      })),
      favorite: asset.favorite ?? false,
      seed: asset.seed ?? null,
      size: asset.size ?? 1,
      units: asset.units ?? "m",
      fitAxis: asset.fitAxis ?? "max",
      pivot: asset.pivot ?? "center",
      dimensions: stats.dimensions || null,
      segments: asset.segments ?? 16,
      style: asset.style ?? "lowpoly",
      color: asset.color || null,
      material: asset.material || null,
      texture: asset.texture || null,
      textureStrength: asset.textureStrength ?? 0.8,
      textureSize: asset.textureSize ?? 256,
      hierarchy: asset.hierarchy || null,
      anchors: asset.anchors || null,
      tags: isScene
        ? Array.isArray(asset.tags)
          ? asset.tags
          : ["scene", asset.type]
        : getAssetTags(asset.type),
      scene: isScene ? buildSceneRecord(asset) : null,
      stats,
      collision: colliderRecord(asset.collision),
      readiness: normaliseReadiness(asset.readiness),
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
        animations: (asset.animationFiles || []).map(
          (clip) => `animations/${slug}/${clip.name}.glb`,
        ),
        textures: asset.textures
          ? ["albedo", "normal", "roughness", "metalness"]
              .concat("ao")
              .filter((name) => asset.textures[name])
              .map((name) => `textures/${slug}/${name}.png`)
          : null,
      },
    };
  });

  const readinessSummary = records.some((record) => record.readiness)
    ? summariseGameReadiness(records)
    : null;

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
        readiness: readinessSummary
          ? {
              count: readinessSummary.count,
              ready: readinessSummary.ready,
              repaired: readinessSummary.repaired,
              issues: readinessSummary.issues,
              notAudited: readinessSummary.notAudited,
            }
          : undefined,
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
  if (readinessSummary) {
    files["game-ready.json"] = encoder.encode(
      JSON.stringify(readinessSummary, null, 2),
    );
  }

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
    for (const clip of asset.animationFiles || []) {
      files[`animations/${slug}/${clip.name}.glb`] = clip.glbBytes;
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
  anchors = false,
  exportClips = false,
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
        sceneKind:
          asset.scene?.sceneKind === "modular-scene" ||
          (asset.scene?.modular && asset.scene.modular.preset)
            ? "modular-scene"
            : null,
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
        modular: asset.scene?.modular ?? model.userData?.modular ?? null,
        theme: asset.scene?.theme ||
          model.userData?.theme || {
            style: asset.style ?? "lowpoly",
            color: asset.color || null,
            material: asset.material || null,
            texture: asset.texture ?? "auto",
            textureStrength: asset.textureStrength ?? 0.8,
            textureSize: asset.textureSize ?? 256,
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
  const hierarchy = getAssetLayoutInfo(model, asset.type);
  const shouldAnchor = anchors && !isScene;
  const anchorExportModel = (object) =>
    shouldAnchor ? buildAnchoredModel(object, asset.type) || object : object;
  const animationFiles = [];
  if (exportClips && selectedAnimations.length) {
    const clipModel = shouldAnchor
      ? buildAnchoredModel(model, asset.type) || model
      : model;
    for (const clip of selectedAnimations) {
      animationFiles.push({
        name: assetSlug(clip.name) || `clip-${animationFiles.length + 1}`,
        duration: Math.round(clip.duration * 100) / 100,
        glbBytes: new Uint8Array(
          await exportGLB(clipModel, {
            ...options,
            animations: [clip],
          }),
        ),
      });
    }
  }
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
      const lodExport = anchorExportModel(lod.mesh);
      lodExport.animations = selectedAnimations;
      const glbBytes = new Uint8Array(
        await exportGLB(lodExport, {
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
          await exportGLB(anchorExportModel(model), {
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
    hierarchy,
    anchors: shouldAnchor && hierarchy ? hierarchy.attachments : null,
    stats: getAssetStats(model),
    lodLevels,
    glbBytes,
    thumbnailBytes,
    animations: animationInfo,
    animationFiles,
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
      textureSize: asset.textureSize ?? 256,
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
      "textureSize",
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
