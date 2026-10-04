#!/usr/bin/env node
// AI3D over the Model Context Protocol, for every harness that speaks it.
//
// It stands on the same InstanceManager the CLI and the OpenClaw adapter use,
// so there is one implementation of a review and not three that have to be kept
// agreeing. What differs between harnesses is only what they can offer back:
// this one cannot be pushed to at all, so a submitted batch waits to be read
// rather than being announced. `status.notifier` says so outright.
//
// Written against the wire rather than a client library: the protocol used here
// is three methods over newline-delimited JSON-RPC on stdio, and a dependency
// would be larger than the thing it replaced.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { InstanceManager, inspectInstall } from "../integration/manager.mjs";
import { precheckModel, stepMeshFor } from "../integration/precheck.mjs";
import { normalizeOrigin } from "../server/origin.mjs";
import { KNOWLEDGE_TOOL, callKnowledgeTool } from "./knowledge.mjs";
import {
  describeCatalogue,
  generateAssetToPack,
} from "../src/generator-service.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
export const PROTOCOL_VERSION = "2025-06-18";

// The operating instructions travel with the server, and they are the same
// bytes the bundled Skill carries. A second copy written for this surface would
// start agreeing with the first and end up describing a different product.
export function instructions(root = ROOT) {
  const files = [
    "skills/ai3d-review/SKILL.md",
    "skills/ai3d-generate/SKILL.md",
  ];
  return files
    .map((file) => {
      const full = path.join(root, file);
      if (!fs.existsSync(full)) return "";
      return fs
        .readFileSync(full, "utf8")
        .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, "")
        .trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

// MCP offers no session identity — initialize names the client, not the
// conversation — so the finest owner this protocol can honestly describe is the
// workspace being worked in. AI3D_OWNER overrides it for a host that does
// know which session is asking, which is the only way to make it finer without
// inventing it.
export function mcpOwner(workspace, environment = process.env) {
  if (environment.AI3D_OWNER) return environment.AI3D_OWNER;
  const digest = crypto
    .createHash("sha256")
    .update(`${os.hostname()}\0${workspace}`)
    .digest("hex")
    .slice(0, 16);
  return `mcp:${digest}`;
}

export const TOOL = {
  name: "ai3d",
  description:
    "Browser-based 3D model review. Publish a GLB, STL or STEP for a person to mark on, read the marks they submit, and publish the next version. STEP and STL are drawn +Z up, GLB +Y up; rotate a model built otherwise before publishing. precheck a GLB or STL before every open; open measures a STEP itself. This host cannot be pushed to: a submitted batch waits to be read, so call read when the reviewer says they are done rather than waiting to be told.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "inspect",
          "precheck",
          "open",
          "status",
          "activate",
          "retain",
          "read",
          "echo",
          "finish",
          "unlock",
          "stop",
        ],
      },
      project: { type: "string" },
      file: { type: "string" },
      name: { type: "string" },
      version: { type: "string" },
      label: { type: "string" },
      units: { type: "string" },
      versionId: { type: "string" },
      keep: { type: "integer", minimum: 0 },
      submissionId: { type: "string" },
      geometry: { type: "boolean" },
      summary: { type: "string" },
      annotations: { type: "array", items: { type: "object" } },
      activate: { type: "boolean" },
      resume: { type: "boolean" },
      confirmedClientAddress: { type: "string" },
    },
    required: ["action"],
  },
};

export const GENERATE_TOOL = {
  name: "ai3d_generate",
  description:
    'Generate a game-ready 3D asset, a whole level kit, a batch asset set, or a complete game asset project, and write it into the workspace. Describe the asset in natural language (prompt), or pick a template type directly; the generator resolves type, style, color, size and units from the prompt the same way the browser workbench does. Pass kind "scene" to compose a level kit (dungeon, camp, outpost, village, temple, battle, wilderness, town) instead of a single prop; a scene pack adds the kit\'s design metadata, a design audit and an engine-space scene blueprint. Pass kind "set" with an items array to generate many props in one call, each in its own folder plus a set.json manifest summing them, sharing the set-level style, engine and export switches. Pass kind "project" with a project template such as prototype-starter, fantasy-dungeon, village-adventure, sci-fi-outpost or wilderness-survival to expand one brief into categorized asset sets, complete scene kits, an engine import order and project.json delivery manifest. Project generation defaults quality to the template setting (normally audit) and carries profile, budgets and aggregate readiness through every nested pack. Pass quality "audit" to record each generated prop\'s game-readiness score and issues in the pack and set manifest, or "repair" to also apply the mechanical fixes the workbench game-ready export applies. The result is a standalone GLB plus an engine pack (Unity, Godot or Unreal) with LODs, colliders, optional per-clip animation GLBs, PBR textures and a manifest, written under the workspace-relative output directory.',
  inputSchema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["asset", "scene", "set", "project"],
        description:
          'What to build: "asset" (default) for a single prop, "scene" for a composed level kit, "set" for a batch of props from items, or "project" for a complete multi-pack game asset project.',
      },
      output: {
        type: "string",
        description:
          "Workspace-relative directory for the generated asset. Must stay inside the workspace.",
      },
      prompt: {
        type: "string",
        description:
          'Natural-language description, e.g. "a red low-poly sword 1.5 m", "a dungeon level" or "a wilderness survival game". Either prompt or type is required for asset, scene and set calls; project calls may use template instead.',
      },
      type: {
        type: "string",
        description:
          "Template id. For kind asset: sword, tree, house, character, chest. For kind scene: dungeon, camp, outpost, village, temple, battle, wilderness, town. Overrides whatever a prompt resolves to. Not used for kind project; use template instead.",
      },
      template: {
        type: "string",
        enum: [
          "prototype-starter",
          "fantasy-dungeon",
          "village-adventure",
          "sci-fi-outpost",
          "wilderness-survival",
        ],
        description:
          "Project only: the curated project template to expand. A prompt can select the same templates when template is omitted.",
      },
      style: {
        type: "string",
        enum: ["lowpoly", "stylized", "realistic"],
      },
      color: { type: "string", description: "Hex color, e.g. #c0392b." },
      size: {
        type: "number",
        exclusiveMinimum: 0,
        description: "Asset size in the chosen units (default 1).",
      },
      units: {
        type: "string",
        enum: ["m", "cm", "mm", "ft", "in"],
        description: "Units the size is given in (default m).",
      },
      seed: {
        type: "integer",
        minimum: 0,
        description: "Deterministic variation seed (scenes default to 1).",
      },
      items: {
        type: "array",
        minItems: 1,
        maxItems: 32,
        description:
          "Set only: the assets to build in one call. Each entry takes a type or a prompt plus optional name, size, units, color and seed; the set-level style, engine and export switches apply to every entry and per-item fields override them. Each asset gets its own folder and the set writes a set.json manifest.",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              description: "Known AI3D asset type key.",
            },
            prompt: {
              type: "string",
              description: "Natural-language description for this asset.",
            },
            name: { type: "string" },
            size: { type: "number", exclusiveMinimum: 0 },
            units: { type: "string", enum: ["m", "cm", "mm", "ft", "in"] },
            color: { type: "string" },
            seed: { type: "integer", minimum: 0 },
          },
          additionalProperties: false,
        },
      },
      spacing: {
        type: "number",
        description:
          "Scene only: grid spacing multiplier, clamped to 0.5-2 (default 1).",
      },
      groundPadding: {
        type: "number",
        description:
          "Scene only: ground margin on each side, clamped to 0-3 (default 0.6).",
      },
      propScale: {
        type: "number",
        description:
          "Scene only: global prop scale multiplier, clamped to 0.25-3 (default 1).",
      },
      props: {
        type: "array",
        minItems: 1,
        maxItems: 400,
        description:
          "Scene only: replace the kit layout with explicit prop placements. Each entry pins a prop type, size, position, rotation and/or seed; the design audit then checks loot containers and locks against these placed props instead of the kit defaults.",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              description:
                "Known AI3D asset type key; omit to fall back to the kit's prop in this slot.",
            },
            size: { type: "number" },
            x: { type: "number" },
            y: { type: "number" },
            z: { type: "number" },
            rotationY: { type: "number" },
            seed: { type: "integer" },
          },
          additionalProperties: false,
        },
      },
      design: {
        type: "object",
        description:
          "Scene only: custom level design metadata that replaces the kit defaults. Supported fields are spawnPoints, objectives, lootTables, locks and directives; the returned designAudit validates them against the composed props and asset catalogue.",
        properties: {
          spawnPoints: {
            type: "object",
            description:
              'Spawn group counts keyed by name, including playerStart, e.g. {"playerStart": 1, "enemySpawn": 3}.',
            additionalProperties: { type: "number", minimum: 0 },
          },
          objectives: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                summary: { type: "string" },
              },
              required: ["id", "title", "summary"],
            },
          },
          lootTables: {
            type: "array",
            items: {
              type: "object",
              properties: {
                container: {
                  type: "string",
                  description:
                    "A prop type present in the composed scene, such as crate, barrel, chest or urn.",
                },
                items: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Known AI3D asset type keys, such as bread, potion, key or coin_pile.",
                },
              },
              required: ["container", "items"],
            },
          },
          locks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                prop: {
                  type: "string",
                  description: "A prop type present in the composed scene.",
                },
                opensWith: {
                  type: "string",
                  description:
                    "A scene prop type or an item listed in a loot table.",
                },
                state: {
                  type: "string",
                  enum: ["locked", "open", "sealed"],
                },
              },
              required: ["prop", "opensWith"],
            },
          },
          directives: {
            type: "array",
            items: { type: "string" },
            description: "Level-builder instructions carried into the pack.",
          },
        },
        additionalProperties: true,
      },
      engine: {
        type: "string",
        enum: ["unity", "godot", "unreal"],
        description: "Engine preset for the pack (default unity).",
      },
      withLod: {
        type: "boolean",
        description: "Include generated LOD levels in the pack.",
      },
      anchors: {
        type: "boolean",
        description: "Write named anchor nodes into exported GLBs.",
      },
      exportClips: {
        type: "boolean",
        description: "Export each animation clip as its own GLB.",
      },
      collision: {
        type: "string",
        enum: [
          "auto",
          "none",
          "box",
          "sphere",
          "capsule",
          "cylinder",
          "convex",
          "mesh",
        ],
        description: "Collider preset to include (default auto).",
      },
      animation: {
        type: "string",
        description: "Animation selection for the pack (default auto).",
      },
      name: {
        type: "string",
        description:
          "Asset name and output folder slug (defaults to the type).",
      },
      quality: {
        type: "string",
        enum: ["off", "audit", "repair"],
        description:
          'Game-readiness gate for single assets and sets: "off" (default) skips it, "audit" scores each prop and records issues, "repair" applies the workbench\'s mechanical fixes before scoring. Projects default to the selected template setting and normally use "audit". Scenes always report their design audit instead.',
      },
      profile: {
        type: "string",
        enum: ["balanced", "mobile", "desktop", "vr"],
        description:
          'Target platform budget (default "balanced"): "mobile", "desktop" and "vr" change the triangle, draw-call, texture, LOD, bone and animation-clip ceilings used by the readiness gate and written into the pack manifests.',
      },
    },
    required: ["output"],
  },
};

export const CATALOG_TOOL = {
  name: "ai3d_catalog",
  description:
    'Read-only discovery of what AI3D can generate, so a caller can look before it generates. mode "types" lists asset type keys with tags, collider preset, animation clips, gameplay role and spawn stats; mode "kits" lists the scene kits with their prop types and default level design; mode "design" describes the scene design fields and rules that ai3d_generate accepts when kind is "scene"; mode "projects" lists complete project templates with their categorized asset groups, scene kits, defaults and aliases; mode "all" (default) returns every section. Nothing is written to the workspace and no geometry is built.',
  inputSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["all", "types", "kits", "design", "projects"],
        description: "Which catalogue section to return (default all).",
      },
      query: {
        type: "string",
        description:
          "Case-insensitive substring filter over type keys and tags, or kit and project ids, names, summaries and tags.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description:
          "Only asset types or project templates carrying every one of these tags, such as 'food', 'dungeon' or 'sci-fi'.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 500,
        description: "Cap the number of types, kits or projects returned.",
      },
    },
  },
};

export function createHandler({
  workspace = process.cwd(),
  root = ROOT,
  environment = process.env,
  managerOptions = {},
} = {}) {
  const owner = mcpOwner(workspace, environment);
  const context = { workspaceDir: workspace, agentId: "mcp" };
  const manager = () =>
    new InstanceManager(context, {
      installRoot: root,
      serverEntry: path.join(root, "server/index.mjs"),
      distRoot: path.join(root, "dist"),
      resolveOrigin: () =>
        normalizeOrigin({
          harness: "mcp",
          sessionKey: owner,
          sessionId: owner,
        }),
      ...managerOptions,
    });
  return async function handle(message) {
    const { id, method, params } = message;
    // A notification carries no id and takes no reply; answering one is how a
    // client ends up waiting for a response to something it never asked.
    const reply = (result) => (id === undefined ? null : { id, result });
    if (method === "initialize")
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: {
          name: "ai3d",
          version: JSON.parse(
            fs.readFileSync(path.join(root, "package.json"), "utf8"),
          ).version,
        },
        instructions: instructions(root),
      });
    if (method === "tools/list")
      return reply({
        tools: [TOOL, KNOWLEDGE_TOOL, CATALOG_TOOL, GENERATE_TOOL],
      });
    if (method === "tools/call") {
      const input = params?.arguments || {};
      if (params?.name === GENERATE_TOOL.name) {
        try {
          const result = await generateAssetToPack({ workspace, ...input });
          return reply({
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
          });
        } catch (error) {
          return reply({
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  code: error.code || "FAILED",
                  message: String(error.message || error),
                }),
              },
            ],
          });
        }
      }
      if (params?.name === KNOWLEDGE_TOOL.name) {
        try {
          const result = callKnowledgeTool(input);
          return reply({
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
          });
        } catch (error) {
          return reply({
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  code: error.code || "FAILED",
                  message: String(error.message || error),
                }),
              },
            ],
          });
        }
      }
      if (params?.name === CATALOG_TOOL.name) {
        try {
          const result = describeCatalogue(input);
          return reply({
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
          });
        } catch (error) {
          return reply({
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  code: error.code || "FAILED",
                  message: String(error.message || error),
                }),
              },
            ],
          });
        }
      }
      if (params?.name !== TOOL.name)
        return reply({
          isError: true,
          content: [{ type: "text", text: `Unknown tool: ${params?.name}` }],
        });
      try {
        const result =
          input.action === "inspect"
            ? inspectInstall(context, root)
            : input.action === "precheck"
              ? precheckModel(context, input.file, {
                  derived: await stepMeshFor(context, input.file),
                })
              : await manager().execute(input);
        return reply({
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        });
      } catch (error) {
        // A refusal is a tool result, not a protocol error: the model has to
        // read it and decide, and a JSON-RPC error would be reported to the
        // user as a broken server instead.
        return reply({
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                code: error.code || "FAILED",
                message: String(error.message || error),
              }),
            },
          ],
        });
      }
    }
    if (id === undefined) return null;
    return {
      id,
      error: { code: -32601, message: `Unsupported method: ${method}` },
    };
  };
}

export function serve(input, output, options) {
  const handle = createHandler(options);
  let buffer = "";
  input.on("data", async (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        output.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "The message is not valid JSON." },
          }) + "\n",
        );
        continue;
      }
      const answer = await handle(message);
      if (answer)
        output.write(JSON.stringify({ jsonrpc: "2.0", ...answer }) + "\n");
    }
  });
}

function launchedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return (
      fs.realpathSync(process.argv[1]) ===
      fs.realpathSync(path.join(HERE, "server.mjs"))
    );
  } catch {
    // A bundle has no server.mjs beside it; the guard is only for the clone.
    return false;
  }
}

const invoked = launchedDirectly();
if (invoked) {
  process.stdin.setEncoding("utf8");
  serve(process.stdin, process.stdout);
}
