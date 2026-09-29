import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";

// Asset type definitions with generation parameters
const ASSET_TYPES = {
  sword: { name: "Sword", parts: ["blade", "guard", "handle", "pommel"] },
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

/**
 * Generate a 3D asset based on type and parameters.
 * Returns a THREE.Group containing the generated model.
 * @param {string} type - Asset type
 * @param {object} options - Generation options
 * @param {number} options.size - Asset size
 * @param {number} options.segments - Number of segments
 * @param {string} options.style - Material style
 * @param {string} options.color - Hex color string (e.g. "#ff0000")
 */
export function generateAsset(type, { size = 1, segments = 16, style = "lowpoly", color = null } = {}) {
  const group = new THREE.Group();
  group.name = `asset-${type}`;

  const matStyle = STYLE_MATERIALS[style] || STYLE_MATERIALS.lowpoly;
  const segments = Math.max(4, Math.min(32, segments));
  const customColor = color ? new THREE.Color(color) : null;

  switch (type) {
    case "sword":
      buildSword(group, size, segments, matStyle, customColor);
      break;
    case "tree":
      buildTree(group, size, segments, matStyle, customColor);
      break;
    case "rock":
      buildRock(group, size, segments, matStyle, customColor);
      break;
    case "house":
      buildHouse(group, size, segments, matStyle, customColor);
      break;
    case "car":
      buildCar(group, size, segments, matStyle, customColor);
      break;
    case "character":
      buildCharacter(group, size, segments, matStyle, customColor);
      break;
    case "shield":
      buildShield(group, size, segments, matStyle, customColor);
      break;
    case "potion":
      buildPotion(group, size, segments, matStyle, customColor);
      break;
    case "chest":
      buildChest(group, size, segments, matStyle, customColor);
      break;
    case "key":
      buildKey(group, size, segments, matStyle, customColor);
      break;
    case "gem":
      buildGem(group, size, segments, matStyle, customColor);
      break;
    case "barrel":
      buildBarrel(group, size, segments, matStyle, customColor);
      break;
    case "crate":
      buildCrate(group, size, segments, matStyle, customColor);
      break;
    default:
      buildCube(group, size, segments, matStyle, customColor);
  }

  // Center and scale the model
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);
  const maxDim = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  if (maxDim > 0) {
    const scale = size / maxDim;
    group.scale.setScalar(scale);
  }

  return group;
}

function createMaterial(color, style) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: style.flatShading,
    roughness: style.roughness,
    metalness: style.metalness,
  });
}

function buildSword(group, size, segments, style, customColor = null) {
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
  const handleGeo = new THREE.CylinderGeometry(0.06 * size, 0.06 * size, 0.6 * size, segments);
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

function buildTree(group, size, segments, style, customColor = null) {
  const trunkMat = createMaterial(0x8b4513, style);
  const foliageMat = createMaterial(customColor || 0x228b22, style);

  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.15 * size, 0.25 * size, 2 * size, segments);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 1 * size;
  trunk.name = "trunk";
  group.add(trunk);

  // Foliage layers
  const layers = 3;
  for (let i = 0; i < layers; i++) {
    const radius = (1.2 - i * 0.3) * size;
    const height = 0.8 * size;
    const foliageGeo = new THREE.ConeGeometry(radius, height, segments);
    const foliage = new THREE.Mesh(foliageGeo, foliageMat);
    foliage.position.y = (2 + i * 0.6) * size;
    foliage.name = `foliage-${i}`;
    group.add(foliage);
  }
}

function buildRock(group, size, segments, style, customColor = null) {
  const rockMat = createMaterial(customColor || 0x808080, style);

  // Main body with noise displacement
  const rockGeo = new THREE.IcosahedronGeometry(size, 1);
  const positions = rockGeo.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const noise = 0.8 + Math.random() * 0.4;
    positions.setXYZ(i, x * noise, y * noise * 0.7, z * noise);
  }
  rockGeo.computeVertexNormals();
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.name = "body";
  group.add(rock);
}

function buildHouse(group, size, segments, style, customColor = null) {
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
  const windowLeft = new THREE.Mesh(windowGeo, windowMat);
  windowLeft.position.set(-0.6 * size, 0.9 * size, 0.76 * size);
  windowLeft.name = "window-left";
  group.add(windowLeft);

  const windowRight = new THREE.Mesh(windowGeo, windowMat);
  windowRight.position.set(0.6 * size, 0.9 * size, 0.76 * size);
  windowRight.name = "window-right";
  group.add(windowRight);
}

function buildCar(group, size, segments, style, customColor = null) {
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
  const wheelGeo = new THREE.CylinderGeometry(0.25 * size, 0.25 * size, 0.2 * size, segments);
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
    group.add(wheel);
  });
}

function buildCharacter(group, size, segments, style, customColor = null) {
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
  const bodyGeo = new THREE.CylinderGeometry(0.25 * size, 0.3 * size, 0.8 * size, segments);
  const body = new THREE.Mesh(bodyGeo, shirtMat);
  body.position.y = 1.1 * size;
  body.name = "body";
  group.add(body);

  // Arms
  const armGeo = new THREE.CylinderGeometry(0.08 * size, 0.08 * size, 0.6 * size, segments);
  const leftArm = new THREE.Mesh(armGeo, skinMat);
  leftArm.position.set(-0.4 * size, 1.1 * size, 0);
  leftArm.rotation.z = Math.PI / 6;
  leftArm.name = "left-arm";
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, skinMat);
  rightArm.position.set(0.4 * size, 1.1 * size, 0);
  rightArm.rotation.z = -Math.PI / 6;
  rightArm.name = "right-arm";
  group.add(rightArm);

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.1 * size, 0.1 * size, 0.6 * size, segments);
  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.set(-0.15 * size, 0.4 * size, 0);
  leftLeg.name = "left-leg";
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.set(0.15 * size, 0.4 * size, 0);
  rightLeg.name = "right-leg";
  group.add(rightLeg);
}

function buildCube(group, size, segments, style, customColor = null) {
  const mat = createMaterial(customColor || 0x808080, style);
  const geo = new THREE.BoxGeometry(size, size, size);
  const cube = new THREE.Mesh(geo, mat);
  cube.name = "body";
  group.add(cube);
}

function buildShield(group, size, segments, style, customColor = null) {
  const bodyMat = createMaterial(customColor || 0x8b4513, style);
  const bossMat = createMaterial(0xffd700, style);
  const rimMat = createMaterial(0xc0c0c0, style);

  // Body
  const bodyGeo = new THREE.CylinderGeometry(0.8 * size, 0.8 * size, 0.1 * size, segments);
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
  const rimGeo = new THREE.TorusGeometry(0.8 * size, 0.05 * size, segments, segments);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.name = "rim";
  group.add(rim);
}

function buildPotion(group, size, segments, style, customColor = null) {
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
  const neckGeo = new THREE.CylinderGeometry(0.1 * size, 0.15 * size, 0.3 * size, segments);
  const neck = new THREE.Mesh(neckGeo, neckMat);
  neck.position.y = 0.9 * size;
  neck.name = "neck";
  group.add(neck);

  // Cork
  const corkGeo = new THREE.CylinderGeometry(0.08 * size, 0.08 * size, 0.15 * size, segments);
  const cork = new THREE.Mesh(corkGeo, corkMat);
  cork.position.y = 1.1 * size;
  cork.name = "cork";
  group.add(cork);
}

function buildChest(group, size, segments, style, customColor = null) {
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

function buildKey(group, size, segments, style, customColor = null) {
  const mat = createMaterial(customColor || 0xffd700, style);

  // Bow
  const bowGeo = new THREE.TorusGeometry(0.2 * size, 0.05 * size, segments, segments);
  const bow = new THREE.Mesh(bowGeo, mat);
  bow.position.y = 0.3 * size;
  bow.name = "bow";
  group.add(bow);

  // Shaft
  const shaftGeo = new THREE.CylinderGeometry(0.05 * size, 0.05 * size, 0.6 * size, segments);
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

function buildGem(group, size, segments, style, customColor = null) {
  const mat = createMaterial(customColor || 0xff00ff, style);
  const geo = new THREE.OctahedronGeometry(size, 0);
  const gem = new THREE.Mesh(geo, mat);
  gem.name = "body";
  group.add(gem);
}

function buildBarrel(group, size, segments, style, customColor = null) {
  const bodyMat = createMaterial(customColor || 0x8b4513, style);
  const hoopMat = createMaterial(0x333333, style);

  // Body
  const bodyGeo = new THREE.CylinderGeometry(0.4 * size, 0.4 * size, 1 * size, segments);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.name = "body";
  group.add(body);

  // Hoops
  const hoopGeo = new THREE.TorusGeometry(0.42 * size, 0.03 * size, segments, segments);
  const hoopPositions = [-0.3 * size, 0, 0.3 * size];
  hoopPositions.forEach((y, i) => {
    const hoop = new THREE.Mesh(hoopGeo, hoopMat);
    hoop.position.y = y;
    hoop.rotation.x = Math.PI / 2;
    hoop.name = `hoop-${i}`;
    group.add(hoop);
  });
}

function buildCrate(group, size, segments, style, customColor = null) {
  const mat = createMaterial(customColor || 0x8b4513, style);
  const geo = new THREE.BoxGeometry(size, size, size);
  const crate = new THREE.Mesh(geo, mat);
  crate.name = "body";
  group.add(crate);
}

/**
 * Decimate a mesh by merging vertices based on a threshold.
 * This is a simple vertex clustering decimation.
 */
export function decimateMesh(mesh, threshold = 0.1) {
  const geometry = mesh.geometry;
  if (!geometry || !geometry.attributes.position) return mesh;

  const positions = geometry.attributes.position;
  const vertexMap = new Map();
  const newPositions = [];
  const indices = [];

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    // Quantize position to grid
    const qx = Math.round(x / threshold);
    const qy = Math.round(y / threshold);
    const qz = Math.round(z / threshold);
    const key = `${qx},${qy},${qz}`;

    if (!vertexMap.has(key)) {
      vertexMap.set(key, newPositions.length / 3);
      newPositions.push(x, y, z);
    }
    indices.push(vertexMap.get(key));
  }

  const newGeometry = new THREE.BufferGeometry();
  newGeometry.setAttribute("position", new THREE.Float32BufferAttribute(newPositions, 3));
  newGeometry.setIndex(indices);
  newGeometry.computeVertexNormals();

  const newMesh = new THREE.Mesh(newGeometry, mesh.material);
  newMesh.name = mesh.name;
  return newMesh;
}

/**
 * Generate LOD levels for a model.
 * Returns an array of { level, mesh } objects.
 */
export function generateLOD(group, levels = 3) {
  const lodLevels = [];
  const thresholds = [0.05, 0.15, 0.3];

  for (let i = 0; i < levels; i++) {
    const lodGroup = group.clone();
    const threshold = thresholds[i] || 0.3;

    lodGroup.traverse((child) => {
      if (child.isMesh) {
        const decimated = decimateMesh(child, threshold);
        child.geometry = decimated.geometry;
      }
    });

    lodLevels.push({ level: i, mesh: lodGroup });
  }

  return lodLevels;
}

/**
 * Export a Three.js object to GLB format.
 */
export function exportGLB(object) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      object,
      (result) => resolve(result),
      (error) => reject(error),
      { binary: true }
    );
  });
}

/**
 * Export a Three.js object to OBJ format.
 */
export function exportOBJ(object) {
  const exporter = new OBJExporter();
  return exporter.parse(object);
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
