#!/usr/bin/env node
// The base every harness stands on. The OpenClaw adapter reaches the same
// InstanceManager through the plugin SDK; everything else — a person at a
// prompt, an MCP server, a script — reaches it through here. There is one
// implementation underneath, so a path that works in one harness is not a
// separate path that has to be kept working in the others.
//
// Output is JSON on stdout, one object, always. Failures are JSON too, with the
// same `code` the tool layer reports, and a non-zero exit. A caller should
// never have to read prose to find out what happened.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  InstanceManager,
  inspectInstall,
  docPaths,
} from "../integration/manager.mjs";
import { precheckModel, stepMeshFor } from "../integration/precheck.mjs";
import { normalizeOrigin } from "../server/origin.mjs";
import { IntegrationError } from "../integration/context.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INSTALL_ROOT = path.resolve(HERE, "..");

const ACTIONS = [
  "inspect",
  "open",
  "status",
  "activate",
  "retain",
  "read",
  "echo",
  "finish",
  "unlock",
  "stop",
  "precheck",
];

const FLAGS = {
  workspace: "workspace",
  owner: "owner",
  project: "project",
  file: "file",
  name: "name",
  version: "version",
  units: "units",
  label: "label",
  submission: "submissionId",
  summary: "summary",
  "version-id": "versionId",
  keep: "keep",
  host: "host",
  "client-address": "confirmedClientAddress",
};
const BOOLEANS = { resume: "resume", "no-activate": "activate" };
const NUMBERS = new Set(["keep"]);

// An MCP client is handed the operating instructions during `initialize`. A
// caller reaching this binary gets no such handshake, so the only chance to say
// where the documentation lives is the answer to the question everybody asks
// first. Absolute paths, because the reader is an agent that has to open them.
export function help(installRoot = INSTALL_ROOT) {
  return {
    usage: `ai3d <${ACTIONS.join("|")}> [--option value]…`,
    actions: ACTIONS,
    start:
      "Read AGENT-INTERFACE.md before the first call: it states what each answer does and does not mean, and how to check an install. SKILL.md is the procedure for running a review.",
    docs: docPaths(installRoot),
  };
}

export function parseArgs(argv) {
  const [action, ...rest] = argv;
  const input = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith("--"))
      throw new IntegrationError("BAD_USAGE", `Unexpected argument: ${token}`);
    const flag = token.slice(2);
    if (flag in BOOLEANS) {
      input[BOOLEANS[flag]] = flag !== "no-activate";
      continue;
    }
    if (!(flag in FLAGS))
      throw new IntegrationError("BAD_USAGE", `Unknown option: --${flag}`);
    const value = rest[++i];
    if (value === undefined || value.startsWith("--"))
      throw new IntegrationError("BAD_USAGE", `--${flag} needs a value.`);
    // Argv is strings all the way down, so a flag whose meaning is a number
    // has to say so here — otherwise "3" reaches a caller expecting 3 and is
    // refused for being the wrong type, which reads as the value being wrong.
    if (NUMBERS.has(flag)) {
      if (!/^\d+$/.test(value))
        throw new IntegrationError(
          "BAD_USAGE",
          `--${flag} takes a whole number.`,
        );
      input[FLAGS[flag]] = Number(value);
      continue;
    }
    input[FLAGS[flag]] = value;
  }
  return { action, input };
}

// A CLI has no conversation to be woken in, so it states an owner and no route.
// The owner has to outlive the process — every invocation is a new one — which
// is why it is given rather than generated: whoever wraps this knows which
// session is asking, and inventing an id here would hand the project to a
// stranger on every call.
export function cliOrigin(owner) {
  if (!owner)
    throw new IntegrationError(
      "MISSING_OWNER",
      "Name the session that owns this review with --owner; one is never invented for you.",
    );
  return normalizeOrigin({
    harness: "cli",
    sessionKey: owner,
    sessionId: owner,
  });
}

export async function run(
  argv,
  {
    cwd = process.cwd(),
    installRoot = INSTALL_ROOT,
    serverEntry = path.join(INSTALL_ROOT, "server/index.mjs"),
    distRoot = path.join(INSTALL_ROOT, "dist"),
    environment,
  } = {},
) {
  if (!argv.length || ["help", "--help", "-h"].includes(argv[0]))
    return help(installRoot);
  const { action, input } = parseArgs(argv);
  if (!action || !ACTIONS.includes(action))
    throw new IntegrationError(
      "BAD_USAGE",
      `Usage: ai3d <${ACTIONS.join("|")}> [--option value]… — run "ai3d help" for the documentation paths.`,
    );
  const workspace = fs.realpathSync(input.workspace || cwd);
  // Orientation comes before ownership: an agent calls this to find out where it
  // is, and demanding --owner first would make the answer conditional on
  // knowing it.
  if (action === "inspect")
    return inspectInstall(
      { workspaceDir: workspace, agentId: "cli" },
      installRoot,
    );
  // Measuring a file needs no instance, no owner and no project.
  if (action === "precheck") {
    if (!input.file)
      throw new IntegrationError("BAD_USAGE", "precheck needs --file.");
    const context = { workspaceDir: workspace, agentId: "cli" };
    return precheckModel(context, input.file, {
      derived: await stepMeshFor(context, input.file),
    });
  }
  const manager = new InstanceManager(
    { workspaceDir: workspace, agentId: "cli" },
    {
      installRoot,
      serverEntry,
      distRoot,
      ...(environment ? { environment } : {}),
      clientAddress: input.confirmedClientAddress,
      resolveOrigin: () => cliOrigin(input.owner),
    },
  );
  const { workspace: _w, owner: _o, ...rest } = input;
  return manager.execute({ ...rest, action });
}

const invoked =
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(HERE + "/ai3d.mjs");
if (invoked) {
  try {
    const result = await run(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    process.stdout.write(
      JSON.stringify(
        {
          error: {
            code: error.code || "FAILED",
            message: String(error.message || error),
          },
        },
        null,
        2,
      ) + "\n",
    );
    process.exitCode = 1;
  }
}
