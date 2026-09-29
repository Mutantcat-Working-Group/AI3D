import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createHandler,
  instructions,
  mcpOwner,
  serve,
  TOOL,
  PROTOCOL_VERSION,
} from "../mcp/server.mjs";

// The manager hands its own environment to the service it starts, so this
// reaches every instance these cases open: no suite talks to the internet.
process.env.REVIEW_UPDATE_CHECK = "off";

const repo = process.cwd();
const stl =
  "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n";

function workspace(t) {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(repo, "tmp", "mcp-workspace-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "web"));
  fs.writeFileSync(path.join(dir, "web/index.html"), "<!doctype html>");
  fs.mkdirSync(path.join(dir, "projects/lamp"), { recursive: true });
  fs.writeFileSync(path.join(dir, "projects/lamp/part.stl"), stl);
  fs.writeFileSync(
    path.join(dir, "openclaw.plugin.json"),
    JSON.stringify({ id: "ai3d" }),
  );
  return dir;
}
const handlerFor = (dir) =>
  createHandler({
    workspace: dir,
    environment: { AI3D_OWNER: "mcp-session-one" },
    managerOptions: {
      installRoot: dir,
      serverEntry: path.join(repo, "server/index.mjs"),
      distRoot: path.join(dir, "web"),
      listenHost: "127.0.0.1",
      environment: { REVIEW_BRIDGE: "off" },
    },
  });

test("initialize advertises tools and carries the Skill as its instructions", async (t) => {
  const dir = workspace(t);
  const answer = await handlerFor(dir)({ id: 1, method: "initialize" });
  assert.equal(answer.result.protocolVersion, PROTOCOL_VERSION);
  assert.deepEqual(answer.result.capabilities, { tools: {} });
  assert.equal(
    answer.result.serverInfo.version,
    JSON.parse(fs.readFileSync("package.json", "utf8")).version,
  );
  // Same bytes as the bundled Skill, frontmatter removed. A second copy written
  // for this surface is the thing that later disagrees with the first.
  const skill = fs.readFileSync("skills/ai3d-review/SKILL.md", "utf8");
  assert.equal(answer.result.instructions.startsWith("# AI3D"), true);
  assert.equal(skill.includes(answer.result.instructions.slice(0, 200)), true);
  // The specification asks that the opening be self-contained; 512 characters
  // in, a reader must already know what this server is for.
  assert.ok(answer.result.instructions.length > 512);
});

test("a notification is not answered, and an unknown method is", async (t) => {
  const handle = handlerFor(workspace(t));
  assert.equal(await handle({ method: "notifications/initialized" }), null);
  const unknown = await handle({ id: 7, method: "resources/list" });
  assert.equal(unknown.error.code, -32601);
});

test("the tool says up front that nothing here will announce a submission", async (t) => {
  const listed = await handlerFor(workspace(t))({
    id: 2,
    method: "tools/list",
  });
  assert.deepEqual(
    listed.result.tools.map((tool) => tool.name),
    ["ai3d"],
  );
  assert.match(TOOL.description, /cannot be pushed to/);
  assert.equal(TOOL.inputSchema.required.includes("action"), true);
});

test("a review opened over MCP is owned by MCP, and refusals come back as results", async (t) => {
  const dir = workspace(t);
  const handle = handlerFor(dir);
  const call = (args) =>
    handle({
      id: 3,
      method: "tools/call",
      params: { name: "ai3d", arguments: args },
    });

  const measured = await call({
    action: "precheck",
    file: "projects/lamp/part.stl",
  });
  assert.equal(measured.result.structuredContent.verdict, "ok");

  const opened = await call({
    action: "open",
    project: "projects/lamp",
    file: "projects/lamp/part.stl",
    name: "lamp",
    version: "v1",
    confirmedClientAddress: "127.0.0.1",
  });
  try {
    assert.ok(opened.result.structuredContent.url);
    const status = await call({ action: "status", project: "projects/lamp" });
    const state = status.result.structuredContent;
    assert.equal(state.origin.harness, "mcp");
    assert.equal(state.origin.route, undefined);
    assert.deepEqual(state.notifier, { send: false, observe: false });

    // A refused action is something the model must read and act on. Reported as
    // a protocol error it would surface to the user as a broken server.
    const refused = await call({ action: "read", project: "projects/lamp" });
    assert.equal(refused.result.isError, true);
    assert.ok(JSON.parse(refused.result.content[0].text).code);
  } finally {
    await call({ action: "stop", project: "projects/lamp" });
  }
});

test("owner is stable across restarts and overridable by a host that knows better", () => {
  assert.equal(mcpOwner("/w", { AI3D_OWNER: "given" }), "given");
  assert.equal(mcpOwner("/w", {}), mcpOwner("/w", {}));
  assert.notEqual(mcpOwner("/w", {}), mcpOwner("/other", {}));
  assert.match(mcpOwner("/w", {}), /^mcp:[0-9a-f]{16}$/);
});

test("the transport reads whole lines and refuses a broken one without dying", async (t) => {
  const dir = workspace(t);
  const written = [];
  const input = new (await import("node:events")).EventEmitter();
  serve(
    input,
    { write: (line) => written.push(JSON.parse(line)) },
    {
      workspace: dir,
      environment: { AI3D_OWNER: "mcp-session-one" },
    },
  );
  // Split across chunks: a message is a line, not a packet.
  input.emit("data", '{"id":1,"method":"tools/li');
  input.emit("data", 'st"}\n{"id":2,"method":"init');
  input.emit("data", 'ialize"}\nnot json\n');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(
    written.map((m) => m.id),
    [1, 2, null],
  );
  assert.equal(written[0].result.tools.length, 1);
  assert.equal(written[2].error.code, -32700);
});
