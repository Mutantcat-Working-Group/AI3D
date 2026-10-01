/* Agent-side asset generation: take one sentence or a template id, run the
 * same deterministic generator the browser workbench uses, and write a
 * game-engine pack plus a standalone GLB into the workspace. The service is
 * deliberately thin -- every rule about types, styles, sizes and packs still
 * lives in the generator so a call from MCP, a CLI and the UI cannot drift.
 */
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import {
  generateAsset,
  exportGamePack,
  exportGLB,
  getAssetStats,
  getAssetTypes,
  getEnginePresets,
} from "./generator.js";
import { CATALOGUES } from "./i18n/index.js";
import { parseAssetPrompt, buildPromptLexicon } from "./asset-prompt.js";

export const GENERATION_ERROR = "GENERATION_ERROR";
export const BAD_PARAMETER = "BAD_PARAMETER";
export const BAD_OUTPUT = "BAD_OUTPUT";

const ENGINE_IDS = new Set(getEnginePresets().map((preset) => preset.id));
const STYLES = new Set(["lowpoly", "stylized", "realistic"]);
const UNITS = new Set(["m", "cm", "mm", "ft", "in"]);
const TEXTURE_SIZES = new Set([64, 128, 256, 512]);
const COLLISION_CHOICES = new Set([
  "auto",
  "none",
  "box",
  "sphere",
  "capsule",
  "cylinder",
  "convex",
  "mesh",
]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const TYPE_IDS = new Set(getAssetTypes());
const promptLexicon = buildPromptLexicon(CATALOGUES);

export class GenerationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GenerationError";
    this.code = code;
  }
}

function requireChoice(value, choices, field, fallback) {
  if (value == null || value === "") return fallback;
  if (choices.has(value)) return value;
  throw new GenerationError(
    BAD_PARAMETER,
    `${field} must be one of: ${[...choices].join(", ")}.`,
  );
}

function requireHexColor(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !HEX_COLOR.test(value))
    throw new GenerationError(
      BAD_PARAMETER,
      "color must be a hex string such as #ff0000.",
    );
  return value.toLowerCase();
}

function requireNumber(value, field, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new GenerationError(
      BAD_PARAMETER,
      `${field} must be a positive number.`,
    );
  return parsed;
}

function requireStrength(value, fallback = 0.8) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new GenerationError(
      BAD_PARAMETER,
      "textureStrength must be a number.",
    );
  return Math.max(0, Math.min(1, parsed));
}

function requireSeed(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new GenerationError(BAD_PARAMETER, "seed must be a whole number.");
  return parsed;
}

/* Prompts may resolve a type the caller never named, but an explicit `type`
 * always wins so the tool stays deterministic about what was asked. */
function resolveType(prompt, type, parsed) {
  if (type) {
    if (!TYPE_IDS.has(type))
      throw new GenerationError(
        BAD_PARAMETER,
        `Unknown asset type "${type}". Available: ${[...TYPE_IDS].join(", ")}.`,
      );
    return type;
  }
  const resolved = parsed?.type || "cube";
  if (!TYPE_IDS.has(resolved))
    throw new GenerationError(
      BAD_PARAMETER,
      `Prompt did not name a known asset type ("${resolved}").`,
    );
  return resolved;
}

function assetSlug(value) {
  const slug = String(value || "asset")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "asset";
}

/* The output directory is a workspace-relative path. Absolute paths and any
 * path that resolves outside the workspace are refused before anything is
 * written, because this entry point can be driven by an agent. */
function resolveOutputDir(workspace, output) {
  if (typeof output !== "string" || !output.trim()) output = "generated-assets";
  if (path.isAbsolute(output))
    throw new GenerationError(
      BAD_OUTPUT,
      "output must be a workspace-relative directory path.",
    );
  const root = path.resolve(workspace);
  const target = path.resolve(root, output);
  const relative = path.relative(root, target);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`))
    throw new GenerationError(
      BAD_OUTPUT,
      "output must stay inside the workspace.",
    );
  return target;
}

function writeZipContents(zip, packDir) {
  const unpacked = unzipSync(
    new Uint8Array(zip.buffer, zip.byteOffset, zip.byteLength),
  );
  for (const [name, bytes] of Object.entries(unpacked)) {
    const file = path.join(
      packDir,
      ...name.split("/").map((segment) => path.normalize(segment)),
    );
    const relative = path.relative(packDir, file);
    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    )
      throw new GenerationError(
        GENERATION_ERROR,
        `Refusing to write an unsafe pack entry: ${name}.`,
      );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    );
  }
}

export async function generateAssetToPack({
  workspace,
  output,
  prompt,
  type,
  style,
  color,
  size,
  units,
  seed,
  engine = "unity",
  withLod = false,
  anchors = false,
  exportClips = false,
  collision = "auto",
  animation = "auto",
  name,
  texture = "auto",
  textureStrength = 0.8,
  textureSize = 256,
} = {}) {
  if (!workspace || typeof workspace !== "string")
    throw new GenerationError(BAD_PARAMETER, "workspace is required.");
  if (!prompt && !type)
    throw new GenerationError(
      BAD_PARAMETER,
      "Either prompt or type is required.",
    );

  const parsed = prompt
    ? parseAssetPrompt(prompt, style || "stylized", promptLexicon)
    : null;
  const resolvedType = resolveType(prompt, type, parsed);
  const resolvedStyle = requireChoice(
    style || parsed?.style || null,
    STYLES,
    "style",
    "stylized",
  );
  const resolvedSize =
    size == null || size === ""
      ? (parsed?.size ?? 1)
      : requireNumber(size, "size", 1);
  const resolvedUnits = requireChoice(
    units || parsed?.sizeUnit || null,
    UNITS,
    "units",
    "m",
  );
  const resolvedColor = requireHexColor(color || parsed?.color || null);
  const resolvedSeed = requireSeed(seed);
  const resolvedTextureSize = requireChoice(
    textureSize,
    TEXTURE_SIZES,
    "textureSize",
    256,
  );

  const segments = parsed?.segments ?? 16;
  const resolvedStrength = requireStrength(textureStrength);
  const model = generateAsset(resolvedType, {
    size: resolvedSize,
    segments,
    style: resolvedStyle,
    color: resolvedColor,
    seed: resolvedSeed,
    texture,
    textureStrength: resolvedStrength,
    textureSize: resolvedTextureSize,
    units: resolvedUnits,
    fitAxis: "max",
    pivot: "center",
  });

  const id = assetSlug(name || resolvedType);
  const asset = {
    id,
    name: name || resolvedType,
    kind: "asset",
    type: resolvedType,
    seed: resolvedSeed,
    size: resolvedSize,
    units: resolvedUnits,
    fitAxis: "max",
    pivot: "center",
    segments,
    style: resolvedStyle,
    color: resolvedColor,
    material: null,
    texture,
    textureStrength: resolvedStrength,
    textureSize: resolvedTextureSize,
  };
  const resolvedEngine = requireChoice(engine, ENGINE_IDS, "engine", "unity");
  const resolvedCollision = requireChoice(
    collision,
    COLLISION_CHOICES,
    "collision",
    "auto",
  );

  const pack = await exportGamePack({
    model,
    asset,
    engine: resolvedEngine,
    withLod: Boolean(withLod),
    anchors: Boolean(anchors),
    exportClips: Boolean(exportClips),
    collision: resolvedCollision,
    animation,
  });

  const outDir = resolveOutputDir(workspace, output);
  const itemDir = path.join(outDir, id);
  const packDir = path.join(itemDir, "pack");
  fs.mkdirSync(packDir, { recursive: true });

  const zipPath = path.join(itemDir, `${id}.zip`);
  const glbPath = path.join(itemDir, `${id}.glb`);
  const summaryPath = path.join(itemDir, "summary.json");
  fs.writeFileSync(zipPath, Buffer.from(pack));
  const enginePreset = getEnginePresets().find(
    (preset) => preset.id === resolvedEngine,
  );
  fs.writeFileSync(
    glbPath,
    Buffer.from(
      await exportGLB(model, {
        upAxis: enginePreset?.upAxis || "Y",
        scale: enginePreset?.scale || 1,
      }),
    ),
  );
  writeZipContents(pack, packDir);

  const stats = getAssetStats(model);
  const summary = {
    schema: "ai3d-generated-asset",
    id,
    name: asset.name,
    type: resolvedType,
    style: resolvedStyle,
    color: resolvedColor,
    size: resolvedSize,
    units: resolvedUnits,
    seed: resolvedSeed,
    segments,
    engine: resolvedEngine,
    withLod: Boolean(withLod),
    anchors: Boolean(anchors),
    exportClips: Boolean(exportClips),
    collision: resolvedCollision,
    animation,
    stats,
    dimensions: model.userData?.dimensions || null,
    prompt: prompt || null,
    files: {
      packZip: zipPath,
      glb: glbPath,
      packDir,
      summary: summaryPath,
    },
  };
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  return {
    ok: true,
    asset: {
      id,
      name: asset.name,
      type: resolvedType,
      style: resolvedStyle,
      color: resolvedColor,
      size: resolvedSize,
      units: resolvedUnits,
      seed: resolvedSeed,
      engine: resolvedEngine,
      stats,
    },
    files: summary.files,
  };
}
