import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";

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
};

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
    default:
      buildCube(group, size, segments, matStyle, customColor, rng);
  }

  applyMaterialOverrides(group, material);

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

  return group;
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
 */
export function composeGameKit(
  kit,
  { seed = 1, segments = 12, quality = 1 } = {},
) {
  const def = GAME_KITS[kit];
  if (!def) throw new Error(`Unknown game kit: ${kit}`);
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = `kit-${kit}`;
  group.userData.kit = kit;

  const grid = 3;
  const cell = 2.4;
  const slot = cell / grid;
  const positions = [];
  const groundW = cell + 1.2;
  const groundD = cell + 1.2;

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
          ...KIT_STYLE,
        }),
      );
      tile.name = "ground";
      tile.position.set(
        -groundW / 2 + groundW / tiles / 2 + i * (groundW / tiles),
        0.03,
        -groundD / 2 + groundD / tiles / 2 + j * (groundD / tiles),
      );
      group.add(tile);
    }
  }

  def.props.forEach((prop, index) => {
    const row = Math.floor(index / grid);
    const col = index % grid;
    const baseX = (col - (grid - 1) / 2) * slot;
    const baseZ = (row - (grid - 1) / 2) * slot;
    const jitter = 0.16 * cell;
    const x = baseX + (rng() - 0.5) * jitter;
    const z = baseZ + (rng() - 0.5) * jitter;
    const model = generateAsset(prop.type, {
      size: prop.size,
      segments,
      style: "lowpoly",
      seed: Math.floor(rng() * 100000),
    });
    model.name = `${kit}-${prop.type}-${index + 1}`;
    model.traverse((child) => {
      if (child.isMesh) child.name = `${model.name}-${child.name}`;
    });
    // Generated assets are centered on their origin, so lift each prop until
    // its lowest vertex rests on the ground instead of sinking into it.
    const propBox = new THREE.Box3().setFromObject(model);
    const groundLift = 0.06 - propBox.min.y;
    model.position.set(x, model.position.y + groundLift, z);
    model.rotation.y = Math.floor(rng() * 8) * (Math.PI / 4);
    group.add(model);
    positions.push({ index, x, z });
  });

  // Center the whole kit after the ground and props settle.
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);
  group.userData.props = positions.length;
  group.userData.extent = {
    width: box.max.x - box.min.x,
    depth: box.max.z - box.min.z,
    height: box.max.y - box.min.y,
  };
  return group;
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

/**
 * Clone an object tree with geometry that is safe to edit or dispose: the
 * clones keep their own buffers instead of sharing the source geometry.
 */
export function cloneModelDeep(object) {
  const clone = object.clone(true);
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
    lodLevels.push({
      level: i,
      triangles: countTriangles(lodGroup),
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
  const { upAxis = "Y", scale = 1 } = options;
  // GLTFExporter converts the up axis itself; only the scale needs a wrapper.
  const wrapped = scale !== 1 ? wrapForExport(object, options, false) : object;
  ensureNodeFileReader();
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      wrapped,
      (result) => resolve(result),
      (error) => reject(error),
      { binary: true, upAxis },
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
  return ASSET_TYPES[type] || ASSET_TYPES.cube;
}

/**
 * Get all available asset types.
 */
export function getAssetTypes() {
  return Object.keys(ASSET_TYPES);
}
