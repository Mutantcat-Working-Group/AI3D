import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { McpSession, McpConnections } from "../server/mcp-client.mjs";

const repo = process.cwd();

function tmpDir(t) {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(repo, "tmp", "mcp-client-"));
  t.after(async () => {
    // Child processes may take a moment to exit after SIGTERM on Windows;
    // retry the removal a few times so the cleanup does not fail the test.
    for (let i = 0; i < 10; i++) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });
  return dir;
}

/* A minimal MCP server over stdio: answers initialize, tools/list and
   tools/call with a fixed echo tool. Speaks the same newline-delimited
   JSON-RPC the bundled ai3d-mcp server speaks. */
const FAKE_MCP = `
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id === undefined) return;
  let result = {};
  if (msg.method === "initialize") {
    result = {
      protocolVersion: msg.params && msg.params.protocolVersion || "2025-06-18",
      capabilities: {},
      serverInfo: { name: "fake-mcp", version: "0" },
    };
  } else if (msg.method === "tools/list") {
    result = {
      tools: [{
        name: "echo",
        description: "Echo the text back",
        inputSchema: { type: "object", properties: { text: { type: "string" } } },
      }],
    };
  } else if (msg.method === "tools/call") {
    const text = (msg.params && msg.params.arguments && msg.params.arguments.text) || "";
    result = { content: [{ type: "text", text: "echo: " + text }] };
  }
  console.log(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
});
`;

function fakeMcpScript(dir) {
  const script = path.join(dir, "fake-mcp.cjs");
  fs.writeFileSync(script, FAKE_MCP);
  return script;
}

test("McpSession connects, lists tools, and calls a tool", async (t) => {
  const dir = tmpDir(t);
  const script = fakeMcpScript(dir);
  const session = new McpSession(
    { id: "s1", name: "fake", command: process.execPath, args: [script] },
    { cwd: dir },
  );
  const snapshot = await session.connect();
  assert.equal(snapshot.connected, true);
  assert.equal(snapshot.tools.length, 1);
  assert.equal(snapshot.tools[0].name, "echo");
  const result = await session.callTool("echo", { text: "hello" });
  assert.equal(result.isError, false);
  assert.equal(result.content[0].text, "echo: hello");
  session.close();
  assert.equal(session.connected, false);
});

test("McpSession reports connection failure for a missing command", async (t) => {
  const dir = tmpDir(t);
  const session = new McpSession(
    {
      id: "s2",
      name: "missing",
      command: "definitely-not-a-real-command-xyz",
      args: [],
    },
    { cwd: dir },
  );
  await assert.rejects(() => session.connect());
  assert.equal(session.connected, false);
  assert.match(session.lastError, /closed|not found|failed to start/);
  session.close();
});

test("McpConnections persists connections across instances", async (t) => {
  const dir = tmpDir(t);
  const runtime = path.join(dir, "runtime");
  fs.mkdirSync(runtime);
  const workspace = path.join(dir, "workspace");
  fs.mkdirSync(workspace);

  const conns1 = new McpConnections(runtime, { workspace });
  const saved = conns1.upsert({
    name: "test",
    command: "npx",
    args: ["-y", "some-server"],
  });
  assert.equal(saved.id.length > 0, true);
  assert.equal(saved.name, "test");
  assert.equal(saved.command, "npx");
  assert.deepEqual(saved.args, ["-y", "some-server"]);

  const listed = conns1.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, saved.id);
  assert.equal(listed[0].connected, false);

  // A new instance reads the same file
  const conns2 = new McpConnections(runtime, { workspace });
  const listed2 = conns2.list();
  assert.equal(listed2.length, 1);
  assert.equal(listed2[0].command, "npx");

  conns1.remove(saved.id);
  assert.equal(conns1.list().length, 0);
});

test("McpConnections rejects invalid input", async (t) => {
  const dir = tmpDir(t);
  const runtime = path.join(dir, "runtime");
  fs.mkdirSync(runtime);
  const conns = new McpConnections(runtime, { workspace: dir });
  assert.throws(() => conns.upsert({ command: "ok", args: "not-an-array" }));
});

test("McpConnections connect and disconnect lifecycle", async (t) => {
  const dir = tmpDir(t);
  const runtime = path.join(dir, "runtime");
  fs.mkdirSync(runtime);
  const workspace = path.join(dir, "workspace");
  fs.mkdirSync(workspace);
  const script = fakeMcpScript(dir);

  const conns = new McpConnections(runtime, { workspace });
  const saved = conns.upsert({
    name: "fake",
    command: process.execPath,
    args: [script],
  });

  const connected = await conns.connect(saved.id);
  assert.equal(connected.connected, true);
  assert.equal(connected.tools.length, 1);

  const listed = conns.list();
  assert.equal(listed[0].connected, true);
  assert.equal(listed[0].tools.length, 1);

  const result = await conns.callTool(saved.id, "echo", { text: "world" });
  assert.equal(result.content[0].text, "echo: world");

  const disconnected = conns.disconnect(saved.id);
  assert.equal(disconnected.connected, false);
  assert.equal(conns.list()[0].connected, false);
});
