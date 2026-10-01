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
import { generateAssetToPack } from "../src/generator-service.js";

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
    "Generate a game-ready 3D asset and write it into the workspace. Describe the asset in natural language (prompt), or pick a template type directly; the generator resolves type, style, color, size and units from the prompt the same way the browser workbench does. The result is a standalone GLB plus an engine pack (Unity, Godot or Unreal) with LODs, colliders, optional per-clip animation GLBs, PBR textures and a manifest, written under the workspace-relative output directory.",
  inputSchema: {
    type: "object",
    properties: {
      output: {
        type: "string",
        description:
          "Workspace-relative directory for the generated asset. Must stay inside the workspace.",
      },
      prompt: {
        type: "string",
        description:
          'Natural-language asset description, e.g. "a red low-poly sword 1.5 m". Either prompt or type is required.',
      },
      type: {
        type: "string",
        description:
          "Asset template id, e.g. sword, tree, house, character, chest. Overrides whatever a prompt resolves to.",
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
        description: "Deterministic variation seed.",
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
    },
    required: ["output"],
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
      return reply({ tools: [TOOL, KNOWLEDGE_TOOL, GENERATE_TOOL] });
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

const invoked =
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(path.join(HERE, "server.mjs"));
if (invoked) {
  process.stdin.setEncoding("utf8");
  serve(process.stdin, process.stdout);
}
