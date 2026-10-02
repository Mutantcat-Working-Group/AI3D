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
  auditSceneDesign,
  composeGameKit,
  generateAsset,
  exportGamePack,
  exportGLB,
  getAssetCatalogueEntry,
  getAssetStats,
  getAssetTypes,
  getEnginePresets,
  getGameKits,
  getKitCatalogue,
  getSceneDesignCatalogue,
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
const SCENE_KITS = getGameKits();
const KIT_IDS = new Set(SCENE_KITS.map((kit) => kit.id));
const KIT_TERMS = SCENE_KITS.map((kit) => ({
  id: kit.id,
  term: kit.id,
  label: String(kit.name || kit.id).toLowerCase(),
}));
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

/* Scene design metadata arrives through JSON-RPC, the CLI or a local caller.
 * Keep the contract deliberately structural: the generator's audit is the
 * source of truth for whether the fields make sense, while this boundary only
 * rejects values that cannot be represented in the generated summary. */
function requireSceneDesign(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new GenerationError(BAD_PARAMETER, "design must be a JSON object.");
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new GenerationError(
      BAD_PARAMETER,
      "design must contain only JSON-serializable values.",
    );
  }
}

const CATALOGUE_MODES = new Set(["all", "types", "kits", "design"]);

const PROP_PLACEMENT_FIELDS = ["size", "x", "y", "z", "rotationY", "seed"];

/* A scene can be laid out prop by prop instead of taking the kit's own
 * arrangement. The caller sends the same placement records the in-app scene
 * editor saves, so a chat or MCP request can pin prop types, counts, sizes,
 * positions, rotations and per-prop seeds; the type is checked here and the
 * scene audit still checks the design that references those props. */
function requireSceneProps(value) {
  if (value == null || value === "") return null;
  if (!Array.isArray(value) || value.length === 0)
    throw new GenerationError(
      BAD_PARAMETER,
      "props must be a non-empty array of placements.",
    );
  if (value.length > 400)
    throw new GenerationError(
      BAD_PARAMETER,
      "props cannot carry more than 400 placements.",
    );
  return value.map((placement, index) => {
    if (!placement || typeof placement !== "object" || Array.isArray(placement))
      throw new GenerationError(
        BAD_PARAMETER,
        `props[${index}] must be a placement object.`,
      );
    if (placement.type != null && !TYPE_IDS.has(placement.type))
      throw new GenerationError(
        BAD_PARAMETER,
        `props[${index}].type is not a known asset type: ${placement.type}.`,
      );
    const copy = {};
    if (placement.type != null) copy.type = placement.type;
    for (const field of PROP_PLACEMENT_FIELDS) {
      const raw = placement[field];
      if (raw == null || raw === "") continue;
      const numeric = Number(raw);
      if (!Number.isFinite(numeric))
        throw new GenerationError(
          BAD_PARAMETER,
          `props[${index}].${field} must be a number.`,
        );
      copy[field] = numeric;
    }
    return copy;
  });
}

const SET_ITEM_FIELDS = new Set([
  "type",
  "prompt",
  "name",
  "size",
  "units",
  "color",
  "seed",
]);

/* A set is a batch of props generated in one request, which is how a caller
 * fills a game's asset list instead of round-tripping per prop. Each entry is
 * the same spec a single ai3d_generate call takes; the shared style, engine and
 * export switches come from the set call and the per-item fields override them.
 * Validate the whole list up front so a bad spec fails before anything is
 * written, rather than leaving a half-built set on disk. */
function requireSetItems(value) {
  if (!Array.isArray(value) || value.length === 0)
    throw new GenerationError(
      BAD_PARAMETER,
      "items must be a non-empty array of asset specs.",
    );
  if (value.length > 32)
    throw new GenerationError(
      BAD_PARAMETER,
      "items cannot carry more than 32 assets.",
    );
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new GenerationError(
        BAD_PARAMETER,
        `items[${index}] must be an asset spec object.`,
      );
    if (!item.type && !item.prompt)
      throw new GenerationError(
        BAD_PARAMETER,
        `items[${index}] needs a type or a prompt.`,
      );
    for (const key of Object.keys(item))
      if (!SET_ITEM_FIELDS.has(key))
        throw new GenerationError(
          BAD_PARAMETER,
          `items[${index}] has an unsupported field: ${key}.`,
        );
    if (item.type && !TYPE_IDS.has(item.type))
      throw new GenerationError(
        BAD_PARAMETER,
        `items[${index}].type is not a known asset type: ${item.type}.`,
      );
    if (item.units != null && item.units !== "" && !UNITS.has(item.units))
      throw new GenerationError(
        BAD_PARAMETER,
        `items[${index}].units must be one of: ${[...UNITS].join(", ")}.`,
      );
    if (
      item.color != null &&
      item.color !== "" &&
      (typeof item.color !== "string" || !HEX_COLOR.test(item.color))
    )
      throw new GenerationError(
        BAD_PARAMETER,
        `items[${index}].color must be a hex string such as #ff0000.`,
      );
    if (item.size != null && item.size !== "") {
      const size = Number(item.size);
      if (!Number.isFinite(size) || size <= 0)
        throw new GenerationError(
          BAD_PARAMETER,
          `items[${index}].size must be a positive number.`,
        );
    }
    if (item.seed != null && item.seed !== "") {
      const seed = Number(item.seed);
      if (!Number.isInteger(seed) || seed < 0)
        throw new GenerationError(
          BAD_PARAMETER,
          `items[${index}].seed must be a whole number.`,
        );
    }
    return { ...item };
  });
}

/* Read-only discovery for agents. Every generation tool has a large choice
 * space -- a hundred-odd asset types, eight kits, five design fields -- and a
 * model that guesses wastes a round trip. This reports what the same registry
 * the generator reads actually holds, without writing to the workspace. */
export function describeCatalogue({ mode = "all", query, tags, limit } = {}) {
  const resolvedMode = requireChoice(mode, CATALOGUE_MODES, "mode", "all");
  const resolvedLimit =
    limit == null || limit === ""
      ? null
      : (() => {
          const parsed = Number(limit);
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500)
            throw new GenerationError(
              BAD_PARAMETER,
              "limit must be a whole number between 1 and 500.",
            );
          return parsed;
        })();
  const wanted = (Array.isArray(tags) ? tags : tags == null ? [] : [tags])
    .map((tag) => String(tag).trim().toLowerCase())
    .filter(Boolean);
  const needle =
    query == null || query === "" ? "" : String(query).trim().toLowerCase();

  const result = { mode: resolvedMode };
  if (resolvedMode === "all" || resolvedMode === "types") {
    let types = getAssetTypes().map((type) => getAssetCatalogueEntry(type));
    if (needle)
      types = types.filter(
        (entry) =>
          entry.type.toLowerCase().includes(needle) ||
          entry.tags.some((tag) => tag.toLowerCase().includes(needle)),
      );
    if (wanted.length)
      types = types.filter((entry) => {
        const own = entry.tags.map((tag) => tag.toLowerCase());
        return wanted.every((tag) => own.includes(tag));
      });
    const matched = types.length;
    result.types =
      resolvedLimit == null ? types : types.slice(0, resolvedLimit);
    result.typeCount = matched;
  }
  if (resolvedMode === "all" || resolvedMode === "kits") {
    let kits = getKitCatalogue();
    if (needle)
      kits = kits.filter(
        (kit) =>
          kit.id.toLowerCase().includes(needle) ||
          String(kit.name).toLowerCase().includes(needle),
      );
    const matched = kits.length;
    result.kits = resolvedLimit == null ? kits : kits.slice(0, resolvedLimit);
    result.kitCount = matched;
  }
  if (resolvedMode === "all" || resolvedMode === "design")
    result.design = getSceneDesignCatalogue();
  return result;
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

/* A scene is a composed kit, not a parametric prop, so it resolves against the
 * kit ids instead of the asset catalogue. A prompt may name the kit id or its
 * human label ("dungeon", "town"), which is how the browser workbench presents
 * them; an explicit type still wins so the tool stays deterministic. */
function resolveSceneKit(prompt, type) {
  if (type) {
    if (!KIT_IDS.has(type))
      throw new GenerationError(
        BAD_PARAMETER,
        `Unknown scene kit "${type}". Available: ${[...KIT_IDS].join(", ")}.`,
      );
    return type;
  }
  const text = String(prompt || "").toLowerCase();
  const matches = (value) =>
    new RegExp(`(^|[^a-z0-9])${value}([^a-z0-9]|$)`).test(text);
  const match = KIT_TERMS.find(
    (entry) => matches(entry.term) || matches(entry.label),
  );
  if (!match)
    throw new GenerationError(
      BAD_PARAMETER,
      `Prompt did not name a scene kit. Available: ${[...KIT_IDS].join(", ")}.`,
    );
  return match.id;
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

/* Both the prop and the scene path write the same four artefacts, so the layout
 * lives here once. The standalone GLB is written at the engine's scale and up
 * axis, matching what the pack's models/ directory contains. */
async function writePackArtifacts({
  workspace,
  output,
  id,
  model,
  pack,
  engine,
}) {
  const outDir = resolveOutputDir(workspace, output);
  const itemDir = path.join(outDir, id);
  const packDir = path.join(itemDir, "pack");
  fs.mkdirSync(packDir, { recursive: true });
  const packZip = path.join(itemDir, `${id}.zip`);
  const glb = path.join(itemDir, `${id}.glb`);
  const summary = path.join(itemDir, "summary.json");
  fs.writeFileSync(packZip, Buffer.from(pack));
  const enginePreset = getEnginePresets().find(
    (preset) => preset.id === engine,
  );
  fs.writeFileSync(
    glb,
    Buffer.from(
      await exportGLB(model, {
        upAxis: enginePreset?.upAxis || "Y",
        scale: enginePreset?.scale || 1,
      }),
    ),
  );
  writeZipContents(pack, packDir);
  return { packZip, glb, packDir, summary };
}

/* Compose a level kit into a game pack. A scene skips the per-mesh settings
 * that only mean something for a single prop (size, LODs, anchors, clips and
 * collider presets); what it adds instead is the kit's design metadata and its
 * audit, which the pack writes as design/ and blueprints/ files. */
export async function generateSceneToPack({
  workspace,
  output,
  prompt,
  type,
  style,
  color,
  seed,
  units,
  engine = "unity",
  name,
  texture = "auto",
  textureStrength = 0.8,
  textureSize = 256,
  spacing,
  groundPadding,
  propScale,
  props = null,
  design = null,
} = {}) {
  if (!workspace || typeof workspace !== "string")
    throw new GenerationError(BAD_PARAMETER, "workspace is required.");
  if (!prompt && !type)
    throw new GenerationError(
      BAD_PARAMETER,
      "Either prompt or type is required.",
    );

  const kit = resolveSceneKit(prompt, type);
  const kitName = SCENE_KITS.find((entry) => entry.id === kit)?.name || kit;
  const resolvedStyle = requireChoice(style, STYLES, "style", "lowpoly");
  const resolvedColor = requireHexColor(color);
  const resolvedSeed = requireSeed(seed);
  const resolvedUnits = requireChoice(units, UNITS, "units", "m");
  const resolvedEngine = requireChoice(engine, ENGINE_IDS, "engine", "unity");
  const resolvedTextureSize = requireChoice(
    textureSize,
    TEXTURE_SIZES,
    "textureSize",
    256,
  );
  const resolvedStrength = requireStrength(textureStrength);
  const resolvedDesign = requireSceneDesign(design);
  const resolvedProps = requireSceneProps(props);

  const scene = composeGameKit(kit, {
    seed: resolvedSeed ?? 1,
    style: resolvedStyle,
    color: resolvedColor,
    texture,
    textureStrength: resolvedStrength,
    textureSize: resolvedTextureSize,
    spacing,
    groundPadding,
    propScale,
    props: resolvedProps,
    design: resolvedDesign,
  });
  const placedProps = scene.userData.propList || [];
  const sceneDesign = scene.userData.design || null;
  const audit = sceneDesign
    ? auditSceneDesign(sceneDesign, { props: placedProps, kind: "kit" })
    : null;

  const id = assetSlug(name || kit);
  const asset = {
    id,
    name: name || kitName,
    kind: "scene",
    type: kit,
    seed: resolvedSeed,
    size: 1,
    units: resolvedUnits,
    fitAxis: "max",
    pivot: "center",
    style: resolvedStyle,
    color: resolvedColor,
    material: null,
    texture,
    textureStrength: resolvedStrength,
    textureSize: resolvedTextureSize,
    tags: ["scene", kit],
    scene: {
      quality: scene.userData.theme?.quality ?? 1,
      spacing: scene.userData.theme?.spacing ?? 1,
      groundPadding: scene.userData.theme?.groundPadding ?? 0.6,
      propScale: scene.userData.theme?.propScale ?? 1,
      groundColor: scene.userData.groundColor ?? null,
      theme: scene.userData.theme ?? null,
      props: placedProps,
      design: sceneDesign,
    },
  };

  const pack = await exportGamePack({
    model: scene,
    asset,
    engine: resolvedEngine,
    withLod: false,
    anchors: false,
    exportClips: false,
    collision: "none",
    animation: "none",
  });

  const files = await writePackArtifacts({
    workspace,
    output,
    id,
    model: scene,
    pack,
    engine: resolvedEngine,
  });
  const stats = getAssetStats(scene);
  const summary = {
    schema: "ai3d-generated-scene",
    id,
    name: asset.name,
    kind: "scene",
    kit,
    style: resolvedStyle,
    color: resolvedColor,
    units: resolvedUnits,
    seed: resolvedSeed,
    engine: resolvedEngine,
    props: placedProps.map((prop) => prop.type),
    customLayout: resolvedProps != null,
    design: sceneDesign,
    designAudit: audit,
    stats,
    prompt: prompt || null,
    files,
  };
  fs.writeFileSync(files.summary, `${JSON.stringify(summary, null, 2)}\n`);

  return {
    ok: true,
    asset: {
      id,
      name: asset.name,
      kind: "scene",
      type: kit,
      style: resolvedStyle,
      color: resolvedColor,
      units: resolvedUnits,
      seed: resolvedSeed,
      engine: resolvedEngine,
      stats,
      designAudit: audit,
    },
    files,
  };
}

/* A whole asset set in one request: the caller hands in a list of asset specs
 * and gets one nested pack per asset plus a set manifest summing them. This is
 * the "fill my game's asset list" path for chat and MCP -- the shared style,
 * engine and export switches come from the set call, the per-item fields win,
 * and the seeds stay deterministic so the same request rebuilds the same set. */
export async function generateSetToPack({
  workspace,
  output,
  items,
  style,
  color,
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
  const specs = requireSetItems(items);
  const baseSeed = requireSeed(seed);
  const setId = assetSlug(name || "asset-set");
  const baseOutput =
    typeof output === "string" && output.trim() ? output : "generated-assets";
  const setOutput = path.posix.join(baseOutput, setId);
  const workspaceRoot = path.resolve(workspace);
  const usedIds = new Set();
  const relative = (absolute) =>
    path.relative(workspaceRoot, absolute).split(path.sep).join("/");

  const results = [];
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index];
    const requestedId = assetSlug(spec.name || spec.type || "asset");
    let itemId = requestedId;
    let suffix = 2;
    while (usedIds.has(itemId)) itemId = `${requestedId}-${suffix++}`;
    usedIds.add(itemId);
    const itemSeed =
      spec.seed != null && spec.seed !== ""
        ? spec.seed
        : baseSeed != null
          ? baseSeed + index
          : undefined;
    const result = await generateAssetToPack({
      kind: "asset",
      workspace,
      output: setOutput,
      prompt: spec.prompt,
      type: spec.type,
      name: itemId,
      style,
      color: spec.color ?? color,
      size: spec.size,
      units: spec.units ?? units,
      seed: itemSeed,
      engine,
      withLod,
      anchors,
      exportClips,
      collision,
      animation,
      texture,
      textureStrength,
      textureSize,
    });
    results.push({
      id: result.asset.id,
      name: result.asset.name,
      type: result.asset.type,
      style: result.asset.style,
      color: result.asset.color,
      size: result.asset.size,
      units: result.asset.units,
      seed: result.asset.seed,
      stats: result.asset.stats,
      prompt: spec.prompt || null,
      files: {
        packZip: relative(result.files.packZip),
        glb: relative(result.files.glb),
        packDir: relative(result.files.packDir),
        summary: relative(result.files.summary),
      },
    });
  }

  const totals = results.reduce(
    (sum, item) => {
      sum.assets += 1;
      sum.triangles += item.stats.triangles;
      sum.vertices += item.stats.vertices;
      sum.parts += item.stats.parts;
      sum.drawCalls += item.stats.drawCalls;
      return sum;
    },
    { assets: 0, triangles: 0, vertices: 0, parts: 0, drawCalls: 0 },
  );

  const setDir = path.join(resolveOutputDir(workspace, baseOutput), setId);
  fs.mkdirSync(setDir, { recursive: true });
  const manifestPath = path.join(setDir, "set.json");
  const manifest = {
    schema: "ai3d-generated-set",
    id: setId,
    name: name || setId,
    style: style || "stylized",
    units: units || "m",
    engine,
    seed: baseSeed,
    count: results.length,
    totals,
    items: results,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    ok: true,
    set: {
      id: setId,
      name: manifest.name,
      count: results.length,
      style: manifest.style,
      units: manifest.units,
      engine,
      seed: baseSeed,
      totals,
    },
    items: results,
    files: { setDir: relative(setDir), manifest: relative(manifestPath) },
  };
}

export async function generateAssetToPack({
  kind = "asset",
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
  spacing,
  groundPadding,
  propScale,
  props = null,
  design = null,
  items = null,
} = {}) {
  if (kind === "scene")
    return generateSceneToPack({
      workspace,
      output,
      prompt,
      type,
      style,
      color,
      seed,
      units,
      engine,
      name,
      texture,
      textureStrength,
      textureSize,
      spacing,
      groundPadding,
      propScale,
      props,
      design,
    });
  if (kind === "set")
    return generateSetToPack({
      workspace,
      output,
      items,
      style,
      color,
      units,
      seed,
      engine,
      withLod,
      anchors,
      exportClips,
      collision,
      animation,
      name,
      texture,
      textureStrength,
      textureSize,
    });
  if (kind !== "asset")
    throw new GenerationError(
      BAD_PARAMETER,
      'kind must be "asset", "scene" or "set".',
    );
  if (design != null && design !== "")
    throw new GenerationError(
      BAD_PARAMETER,
      'design is only supported when kind is "scene".',
    );
  if (props != null && props !== "")
    throw new GenerationError(
      BAD_PARAMETER,
      'props is only supported when kind is "scene".',
    );
  if (items != null && items !== "")
    throw new GenerationError(
      BAD_PARAMETER,
      'items is only supported when kind is "set".',
    );
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

  const files = await writePackArtifacts({
    workspace,
    output,
    id,
    model,
    pack,
    engine: resolvedEngine,
  });

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
    files,
  };
  fs.writeFileSync(files.summary, `${JSON.stringify(summary, null, 2)}\n`);

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
