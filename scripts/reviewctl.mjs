import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lanAddresses } from "../server/network.mjs";
import { agentSocketPath, readInstance } from "../server/instance.mjs";
import { relativePosix, within } from "../server/paths.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The same default as the server's: the clone itself, unless told otherwise.
const workspace = fs.realpathSync(
  path.resolve(process.env.REVIEW_WORKSPACE || repo),
);
const [command, ...args] = process.argv.slice(2);
if (command === "network") {
  console.log(JSON.stringify({ interfaces: lanAddresses() }));
  process.exit(0);
}
// A misplaced word used to shift the whole pairing, so `publish m.glb v1 --name
// X` silently parsed as {v1: "--name"} and lost every later option. The server
// then dropped the unknown key without complaint, leaving no layer that could
// report that the flag had not taken effect.
function parseOptions(rest, allowed) {
  const flags = ` Available options: ${allowed.map((name) => `--${name}`).join(" ")}.`;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const name = flag.startsWith("--") && flag.slice(2);
    if (!name) throw new Error(`Unrecognised argument ${flag}.${flags}`);
    if (!allowed.includes(name))
      throw new Error(`Unsupported option ${flag}.${flags}`);
    if (Object.hasOwn(options, name))
      throw new Error(`Option ${flag} was given twice.`);
    const value = rest[i + 1];
    if (value === undefined || value.startsWith("--"))
      throw new Error(`Option ${flag} is missing its value.`);
    options[name] = value;
  }
  return options;
}
function readWorkspaceJson(name) {
  const file = fs.realpathSync(path.resolve(name || ""));
  if (!within(workspace, file))
    throw new Error("The payload must live inside the workspace.");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
let endpoint, body;
try {
  if (command === "publish") {
    if (!args[0])
      throw new Error(
        "Usage: node scripts/reviewctl.mjs publish <GLB-or-STL> [--name title] [--version v1] [--source source-file] [--units mm]",
      );
    endpoint = "/publish";
    const options = parseOptions(args.slice(1), [
      "name",
      "version",
      "source",
      "units",
      "origin",
    ]);
    body = {
      file: relativePosix(workspace, path.resolve(args[0])),
      ...options,
    };
    if (body.origin) body.origin = readWorkspaceJson(body.origin);
    if (body.source)
      body.source = relativePosix(workspace, path.resolve(body.source));
  } else if (command === "bind") {
    endpoint = "/origin";
    body = { origin: readWorkspaceJson(args[0]) };
  } else if (command === "revoke") {
    if (args.length > 1) throw new Error("Usage: revoke [browser-record-id]");
    endpoint = "/access/revoke";
    body = args[0] ? { browserId: args[0] } : {};
  } else if (command === "admit") {
    if (!args[0] || args.length !== 1)
      throw new Error("Usage: admit <verified-LAN-IPv4>");
    endpoint = "/access/admit";
    body = { address: args[0] };
  } else if (command === "status") endpoint = "/status";
  else if (command === "browsers") endpoint = "/access/browsers";
  else if (command === "submissions") endpoint = "/submissions";
  else if (command === "read") {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(args[0] || ""))
      throw new Error("Usage: read <submission-id>");
    endpoint = `/submissions/${args[0]}`;
  } else if (command === "retain") {
    if (!/^\d+$/.test(args[0] || ""))
      throw new Error("Usage: retain <how-many-recent-versions|0>");
    endpoint = "/retain";
    body = { keep: Number(args[0]) };
  } else if (command === "echo") {
    const file = fs.realpathSync(path.resolve(args[0] || ""));
    if (!within(workspace, file))
      throw new Error("The echo payload must live inside the workspace.");
    body = JSON.parse(fs.readFileSync(file, "utf8"));
    endpoint = "/echo";
  } else
    throw new Error(
      "Commands: publish, bind, status, network, admit, browsers, revoke, submissions, read, echo, retain",
    );
} catch (error) {
  // Usage problems are the operator's, not a crash: print the reason alone.
  console.error(error.message);
  process.exit(1);
}
const runtime = path.resolve(
  process.env.REVIEW_DATA_DIR || path.join(repo, "runtime"),
);
const configPath = path.join(runtime, "config.json");
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, "utf8"))
  : {};
const socketPath = agentSocketPath(runtime, readInstance(config));
function call(route, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath,
        path: route,
        method: payload ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            const value = JSON.parse(data);
            if (res.statusCode >= 400)
              reject(new Error(value.error || "The action failed"));
            else resolve(value);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", () =>
      reject(new Error("The review service is not running.")),
    );
    req.end(payload ? JSON.stringify(payload) : undefined);
  });
}
try {
  let result = await call(endpoint, body);
  if (command === "read") {
    // Read and parse the complete submission before emitting an explicit acknowledgment.
    result = await call("/read", {
      submissionId: result.id,
      versionId: result.versionId,
    });
  }
  console.log(JSON.stringify(result));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
