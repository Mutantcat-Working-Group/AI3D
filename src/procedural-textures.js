import * as THREE from "three";
import { zlibSync } from "fflate";

/* Procedural PBR texture sets for generated game assets. Each set is five
   RGBA maps -- albedo, normal, roughness, metalness, ambient occlusion --
   built from a small deterministic noise model so the same asset seed always
   produces the same material. Albedo maps are grayscale: a material's own
   color tints them, which lets one texture serve many parts of an asset. */

export const TEXTURE_KINDS = [
  "wood",
  "stone",
  "metal",
  "cloth",
  "leather",
  "leaf",
  "scale",
  "crystal",
  "sand",
];

export const TEXTURE_SIZES = [64, 128, 256, 512];

export const TEXTURE_DEFAULTS = {
  sword: "metal",
  axe: "metal",
  bow: "wood",
  hammer: "metal",
  spear: "wood",
  dagger: "metal",
  mace: "metal",
  staff: "wood",
  halberd: "metal",
  shield: "metal",
  tree: "wood",
  rock: "stone",
  gem: "crystal",
  house: "wood",
  tower: "stone",
  tent: "cloth",
  statue: "stone",
  pillar: "stone",
  well: "stone",
  fountain: "stone",
  bridge: "wood",
  fence: "wood",
  gate: "wood",
  wagon: "wood",
  cannon: "metal",
  grave: "stone",
  ladder: "wood",
  candelabra: "metal",
  anvil: "metal",
  bookshelf: "wood",
  cauldron: "metal",
  throne: "wood",
  bench: "wood",
  lantern: "metal",
  table: "wood",
  chair: "wood",
  bed: "wood",
  chandelier: "metal",
  armor_stand: "metal",
  skeleton: "sand",
  bread: "wood",
  pie: "wood",
  meat_leg: "leather",
  helmet: "metal",
  chestplate: "metal",
  gauntlets: "metal",
  boots: "leather",
  hay_bale: "wood",
  rope_coil: "leather",
  bucket: "metal",
  windmill: "stone",
  coin_pile: "metal",
  minecart: "metal",
  berry_bush: "leaf",
  stone_coffin: "stone",
  portcullis: "metal",
  cage: "metal",
  bone_pile: "sand",
  cobweb: "cloth",
  lever: "metal",
  urn: "stone",
  mummy: "cloth",
  beehive: "wood",
  wheat_sheaf: "leaf",
  car: "metal",
  character: "cloth",
  cube: "stone",
  potion: "crystal",
  chest: "wood",
  key: "metal",
  barrel: "wood",
  crate: "wood",
  flag: "cloth",
  torch: "wood",
  brazier: "metal",
  runestone: "stone",
  trap: "metal",
  turret: "metal",
  drone: "metal",
  antenna: "metal",
  monster: "scale",
  dragon: "scale",
  boat: "wood",
  plane: "metal",
  bike: "metal",
  campfire: "wood",
  sign: "wood",
  barrel_variants: "wood",
  crystal: "crystal",
  mushroom: "leaf",
  tree_stump: "wood",
  wall: "stone",
  wall_window: "stone",
  wall_door: "stone",
  wall_corner: "stone",
  floor: "stone",
  stairs: "stone",
  arch: "stone",
};

export function textureKinds() {
  return TEXTURE_KINDS.slice();
}

/** Resolve the UI-level texture choice to a concrete pattern kind. */
export function resolveTextureKind(type, texture = "auto") {
  const choice = texture ?? "auto";
  if (!choice || choice === "none" || choice === false) return null;
  if (choice === "auto") return TEXTURE_DEFAULTS[type] || "stone";
  return TEXTURE_KINDS.includes(choice) ? choice : null;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const ux = smooth(fx);
  const uy = smooth(fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x, y, seed, octaves = 4) {
  let total = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    total += valueNoise(x * freq, y * freq, seed + i * 101) * amp;
    amp *= 0.5;
    freq *= 2;
  }
  return total;
}

const PATTERNS = {
  wood(u, v, seed, s) {
    const grain = fbm(u * 5, v * 5, seed + 7);
    const ring = Math.sin((u * 14 + grain * 4) * Math.PI * 2);
    const streak = Math.pow(Math.abs(ring), 2.4);
    const speckle = fbm(u * 11, v * 11, seed + 19);
    return {
      albedo: streak * 0.65 - speckle * 0.3,
      height: streak * 0.28 + speckle * 0.22,
      roughness: 0.62 + streak * 0.3 + speckle * 0.08,
      metalness: 0.06 + speckle * 0.04,
    };
  },
  stone(u, v, seed, s) {
    const base = fbm(u * 7, v * 7, seed + 3);
    const detail = fbm(u * 15, v * 15, seed + 11);
    const crack = Math.pow(
      Math.abs(fbm(u * 3.1 + 0.4, v * 3.1 + 0.4, seed + 23)),
      3.2,
    );
    return {
      albedo: (base - 0.5) * 1.1 + crack * 0.55 - detail * 0.2,
      height: (base - 0.5) * 0.6 + crack * 0.95,
      roughness: 0.78 + detail * 0.22 - crack * 0.18,
      metalness: 0.08 + detail * 0.08,
    };
  },
  metal(u, v, seed, s) {
    const brush = Math.sin(v * 46 + fbm(u * 8, v * 4, seed + 5) * 3);
    const patch = fbm(u * 9, v * 5, seed + 13);
    const pit = Math.pow(Math.abs(fbm(u * 21, v * 21, seed + 29)), 2.2);
    return {
      albedo: brush * 0.28 + (patch - 0.5) * 0.45 + pit * 0.2,
      height: brush * 0.14 + (patch - 0.5) * 0.24 + pit * 0.4,
      roughness: 0.34 + patch * 0.3 + Math.abs(brush) * 0.18 + pit * 0.18,
      metalness: 0.74 + patch * 0.2,
    };
  },
  cloth(u, v, seed, s) {
    const weave =
      Math.sin(u * 34) * 0.5 * Math.sin(v * 34) * 0.5 +
      Math.sin(u * 68 + v * 8) * 0.12;
    const soft = fbm(u * 6, v * 6, seed + 17);
    return {
      albedo: weave * 0.55 + (soft - 0.5) * 0.45,
      height: weave * 0.62 + (soft - 0.5) * 0.2,
      roughness: 0.86 + weave * 0.16 + soft * 0.1,
      metalness: 0.04 + soft * 0.04,
    };
  },
  leather(u, v, seed, s) {
    const blotch = fbm(u * 6, v * 6, seed + 9);
    const fine = fbm(u * 17, v * 17, seed + 31);
    const crease =
      smooth(Math.max(0, Math.min(1, (blotch - 0.62) * 3))) *
      Math.sin((u + v) * 13 + blotch * 4);
    return {
      albedo: (blotch - 0.5) * 0.9 + crease * 0.35 + (fine - 0.5) * 0.25,
      height: (blotch - 0.5) * 0.55 + crease * 0.6 + (fine - 0.5) * 0.2,
      roughness: 0.7 + blotch * 0.22 + crease * 0.14,
      metalness: 0.05 + blotch * 0.04,
    };
  },
  leaf(u, v, seed, s) {
    const soft = fbm(u * 8, v * 8, seed + 7);
    const vein =
      Math.sin(u * 12 + fbm(u * 4, v * 4, seed + 13) * 2) *
      Math.sin(v * 12 + fbm(u * 4, v * 4, seed + 17) * 2);
    const speckle = fbm(u * 23, v * 23, seed + 41);
    return {
      albedo: (soft - 0.5) * 0.7 + vein * 0.16 + (speckle - 0.5) * 0.3,
      height: (soft - 0.5) * 0.4 + vein * 0.55,
      roughness: 0.42 + soft * 0.2 + speckle * 0.1,
      metalness: 0.05 + speckle * 0.03,
    };
  },
  scale(u, v, seed, s) {
    const nx = u * 8;
    const ny = v * 8;
    const d1 = Math.hypot(nx - Math.round(nx), ny - Math.round(ny));
    const d2 = Math.hypot(
      nx - Math.round(nx - 0.5),
      ny - Math.round(ny - 0.37),
    );
    const cell = Math.min(d1, d2);
    const edge = smooth(Math.max(0, Math.min(1, (cell - 0.34) * 3.2)));
    const soft = fbm(u * 7, v * 7, seed + 11);
    return {
      albedo: edge * 0.32 + (soft - 0.5) * 0.3,
      height: edge * 0.72 + (soft - 0.5) * 0.2,
      roughness: 0.44 + edge * 0.24 + soft * 0.14,
      metalness: 0.12 + edge * 0.12,
    };
  },
  crystal(u, v, seed, s) {
    const n1 = fbm(u * 8, v * 8, seed + 5);
    const n2 = fbm(u * 11, v * 11, seed + 21);
    const facet = Math.sin(Math.round(n1 * 9) * 2.3 + n2 * 3 + u * 3 - v * 3);
    const sparkle = Math.pow(Math.abs(fbm(u * 31, v * 31, seed + 47)), 3);
    return {
      albedo: facet * 0.34 + (n1 - 0.5) * 0.3 + sparkle * 0.22,
      height: facet * 0.62 + (n1 - 0.5) * 0.25,
      roughness: 0.2 + (n1 - 0.5) * 0.34 + sparkle * 0.08,
      metalness: 0.2 + facet * 0.12,
    };
  },
  sand(u, v, seed, s) {
    const fine = fbm(u * 24, v * 24, seed + 3);
    const ripple = fbm(u * 5, v * 5, seed + 11);
    return {
      albedo: (fine - 0.5) * 0.24 + (ripple - 0.5) * 0.14,
      height: (fine - 0.5) * 0.2,
      roughness: 0.92 + fine * 0.08,
      metalness: 0.02 + fine * 0.02,
    };
  },
};

function samplePattern(kind, u, v, seed, strength) {
  const fn = PATTERNS[kind] || PATTERNS.stone;
  return fn(u, v, seed, strength);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

/** Build an RGBA map for one PBR channel from a per-pixel sample function. */
function buildMap(size, kind, seed, strength, channel) {
  const data = new Uint8Array(size * size * 4);
  const heightField = channel === "normal";
  const step = 1 / (size - 1);
  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const index = (y * size + x) * 4;
      if (heightField) {
        const h = samplePattern(kind, u, v, seed, strength).height;
        const hx = samplePattern(kind, u + step, v, seed, strength).height;
        const hy = samplePattern(kind, u, v + step, seed, strength).height;
        const dx = (hx - h) * strength * 2.4;
        const dy = (hy - h) * strength * 2.4;
        const len = Math.hypot(dx, dy, 1);
        data[index] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
        data[index + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
        data[index + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
        data[index + 3] = 255;
      } else if (channel === "ao") {
        const h = samplePattern(kind, u, v, seed, strength).height;
        const neighbors = [
          samplePattern(kind, u - step, v, seed, strength).height,
          samplePattern(kind, u + step, v, seed, strength).height,
          samplePattern(kind, u, v - step, seed, strength).height,
          samplePattern(kind, u, v + step, seed, strength).height,
        ];
        const peak = Math.max(...neighbors);
        const occlusion = clamp01(1 - (peak - h) * strength * 1.6);
        const value = Math.round(occlusion * 255);
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
        data[index + 3] = 255;
      } else {
        const r = samplePattern(kind, u, v, seed, strength);
        let value = 0;
        if (channel === "albedo") {
          value = 128 + r.albedo * 88 * strength;
        } else if (channel === "roughness") {
          value = 128 + (r.roughness - 0.5) * 255 * strength;
        } else {
          value = 128 + (r.metalness - 0.5) * 255 * strength;
        }
        value = Math.round(clamp01(value / 255) * 255);
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
        data[index + 3] = 255;
      }
    }
  }
  return data;
}

/**
 * Generate a PBR texture set for one material kind.
 * @param {string} kind - Pattern kind from TEXTURE_KINDS
 * @param {object} options
 * @param {number} options.size - Square map size, clamped to 64..256
 * @param {number} options.strength - Map strength 0..1
 * @param {number} options.seed - Deterministic variation seed
 * @param {boolean} options.png - Also encode PNG bytes for engine packs
 * @returns {object} { kind, textures, pngs }
 */
export function createProceduralTextures(
  kind,
  { size = 128, strength = 1, seed = 1, png = false } = {},
) {
  const resolvedKind = TEXTURE_KINDS.includes(kind) ? kind : "stone";
  const requestedSize = Math.round(Number(size) || 128);
  const mapSize = TEXTURE_SIZES.includes(requestedSize) ? requestedSize : 128;
  const mapStrength = clamp01(Number(strength) || 0);
  const mapSeed = Math.floor(Number(seed) || 1) >>> 0 || 1;

  const albedo = buildMap(
    mapSize,
    resolvedKind,
    mapSeed,
    mapStrength,
    "albedo",
  );
  const normal = buildMap(
    mapSize,
    resolvedKind,
    mapSeed,
    mapStrength,
    "normal",
  );
  const roughness = buildMap(
    mapSize,
    resolvedKind,
    mapSeed,
    mapStrength,
    "roughness",
  );
  const metalness = buildMap(
    mapSize,
    resolvedKind,
    mapSeed,
    mapStrength,
    "metalness",
  );
  const ao = buildMap(mapSize, resolvedKind, mapSeed, mapStrength, "ao");

  const makeTexture = (data, name, srgb = false) => {
    const texture = new THREE.DataTexture(
      data,
      mapSize,
      mapSize,
      THREE.RGBAFormat,
    );
    texture.name = `${resolvedKind}-${name}`;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  return {
    kind: resolvedKind,
    size: mapSize,
    strength: mapStrength,
    seed: mapSeed,
    textures: {
      albedo: makeTexture(albedo, "albedo", true),
      normal: makeTexture(normal, "normal"),
      roughness: makeTexture(roughness, "roughness"),
      metalness: makeTexture(metalness, "metalness"),
      ao: makeTexture(ao, "ao"),
    },
    pngs: png
      ? {
          albedo: encodePNG(mapSize, mapSize, albedo),
          normal: encodePNG(mapSize, mapSize, normal),
          roughness: encodePNG(mapSize, mapSize, roughness),
          metalness: encodePNG(mapSize, mapSize, metalness),
          ao: encodePNG(mapSize, mapSize, ao),
        }
      : null,
  };
}

/* --- Minimal PNG encoder. fflate provides zlib; the container is small. --- */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(
    [
      type.charCodeAt(0),
      type.charCodeAt(1),
      type.charCodeAt(2),
      type.charCodeAt(3),
    ],
    4,
  );
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encode RGBA bytes as a PNG file (8-bit, no interlace). */
export function encodePNG(width, height, rgba) {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(
      rgba.subarray(y * width * 4, (y + 1) * width * 4),
      y * (width * 4 + 1) + 1,
    );
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlibSync(raw, { level: 6 });
  const signature = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const head = pngChunk("IHDR", ihdr);
  const data = pngChunk("IDAT", idat);
  const end = pngChunk("IEND", new Uint8Array(0));
  const out = new Uint8Array(
    signature.length + head.length + data.length + end.length,
  );
  let offset = 0;
  out.set(signature, offset);
  offset += signature.length;
  out.set(head, offset);
  offset += head.length;
  out.set(data, offset);
  offset += data.length;
  out.set(end, offset);
  return out;
}

/**
 * Give GLTFExporter the tiny browser canvas surface it needs when running in
 * Node. The exporter encodes DataTextures by drawing into an OffscreenCanvas;
 * this polyfill stores the pixels and serves them back as PNG blobs produced
 * by encodePNG, so CLI/server pipelines can embed textures in GLB too.
 */
export function ensureNodeCanvasPolyfill() {
  if (typeof document !== "undefined") return;
  if (typeof globalThis.OffscreenCanvas !== "undefined") return;

  class ImageDataPoly {
    constructor(data, width, height) {
      this.data = new Uint8ClampedArray(data);
      this.width = width;
      this.height = height;
    }
  }

  class OffscreenCanvasPoly {
    constructor(width, height) {
      this._width = Math.max(1, width | 0);
      this._height = Math.max(1, height | 0);
      this._pixels = new Uint8ClampedArray(this._width * this._height * 4);
      this._context = null;
    }

    get width() {
      return this._width;
    }

    set width(value) {
      this._width = Math.max(1, value | 0);
      this._pixels = new Uint8ClampedArray(this._width * this._height * 4);
    }

    get height() {
      return this._height;
    }

    set height(value) {
      this._height = Math.max(1, value | 0);
      this._pixels = new Uint8ClampedArray(this._width * this._height * 4);
    }

    getContext() {
      if (this._context) return this._context;
      const canvas = this;
      const context = {
        _flipY: false,
        _fill: [0, 255, 255, 255],
        set fillStyle(value) {
          const hex = String(value || "#000000").replace("#", "");
          if (/^[0-9a-fA-F]{6}$/.test(hex)) {
            context._fill = [
              parseInt(hex.slice(0, 2), 16),
              parseInt(hex.slice(2, 4), 16),
              parseInt(hex.slice(4, 6), 16),
              255,
            ];
          }
        },
        translate(_x, y) {
          if (y > 0) context._flipY = !context._flipY;
        },
        scale(_x, y) {
          if (y < 0) context._flipY = !context._flipY;
        },
        fillRect(x, y, w, h) {
          const [r, g, b, a] = context._fill;
          for (let row = y; row < y + h; row++) {
            for (let col = x; col < x + w; col++) {
              const i = (row * canvas.width + col) * 4;
              if (i + 3 >= canvas._pixels.length) continue;
              canvas._pixels[i] = r;
              canvas._pixels[i + 1] = g;
              canvas._pixels[i + 2] = b;
              canvas._pixels[i + 3] = a;
            }
          }
        },
        putImageData(imageData, x, y) {
          const { width, height, data } = imageData;
          for (let row = 0; row < height; row++) {
            const srcRow = context._flipY ? height - 1 - row : row;
            const dstRow = row + y;
            for (let col = 0; col < width; col++) {
              const si = (srcRow * width + col) * 4;
              const di = (dstRow * canvas.width + col + x) * 4;
              if (di + 3 >= canvas._pixels.length) continue;
              canvas._pixels[di] = data[si];
              canvas._pixels[di + 1] = data[si + 1];
              canvas._pixels[di + 2] = data[si + 2];
              canvas._pixels[di + 3] = data[si + 3];
            }
          }
        },
        getImageData(x, y, width, height) {
          const out = new Uint8ClampedArray(width * height * 4);
          for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
              const si = ((row + y) * canvas.width + col + x) * 4;
              const di = (row * width + col) * 4;
              out[di] = canvas._pixels[si];
              out[di + 1] = canvas._pixels[si + 1];
              out[di + 2] = canvas._pixels[si + 2];
              out[di + 3] = canvas._pixels[si + 3];
            }
          }
          return new ImageDataPoly(out, width, height);
        },
        drawImage(image, arg1, arg2, arg3, arg4) {
          const dx = typeof arg1 === "number" ? arg1 : 0;
          const dy = typeof arg2 === "number" ? arg2 : 0;
          const dw =
            typeof arg3 === "number" ? arg3 : image.width || canvas.width;
          const dh =
            typeof arg4 === "number" ? arg4 : image.height || canvas.height;
          const source = image.data
            ? image
            : image instanceof OffscreenCanvasPoly
              ? {
                  data: image._pixels,
                  width: image.width,
                  height: image.height,
                }
              : null;
          if (!source) return;
          for (let row = 0; row < dh; row++) {
            const srcRow = row;
            for (let col = 0; col < dw; col++) {
              const si = (srcRow * source.width + col) * 4;
              const di = ((row + dy) * canvas.width + col + dx) * 4;
              if (di + 3 >= canvas._pixels.length) continue;
              canvas._pixels[di] = source.data[si];
              canvas._pixels[di + 1] = source.data[si + 1];
              canvas._pixels[di + 2] = source.data[si + 2];
              canvas._pixels[di + 3] = source.data[si + 3];
            }
          }
        },
      };
      this._context = context;
      return context;
    }

    convertToBlob({ type = "image/png" } = {}) {
      const png = encodePNG(this._width, this._height, this._pixels);
      return Promise.resolve(new Blob([png], { type }));
    }

    toBlob(callback, type = "image/png") {
      this.convertToBlob({ type }).then(callback);
    }
  }

  globalThis.OffscreenCanvas = OffscreenCanvasPoly;
  globalThis.ImageData = ImageDataPoly;
}
