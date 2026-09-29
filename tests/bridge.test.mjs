import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OpenClawBridge } from "../server/bridge.mjs";

const message = (id, timestamp, text = id) => ({
  role: "assistant",
  timestamp,
  __openclaw: { id },
  content: [{ type: "text", text }],
});
const tool = {
  role: "toolResult",
  timestamp: 30,
  content: [{ type: "text", text: "private tool output" }],
};

test("history backfills text hidden behind a tool-only page without exposing tools or reasoning", async () => {
  const bridge = new OpenClawBridge("test-session");
  const requests = [];
  bridge.call = async (_method, params) => {
    requests.push(params);
    return params.offset === undefined
      ? {
          messages: [tool],
          hasMore: true,
          nextOffset: 80,
          inFlightRun: { runId: "busy" },
        }
      : {
          messages: [
            message("visible", 20),
            { ...message("hidden", 21), channel: "analysis" },
          ],
          hasMore: false,
        };
  };
  const result = await bridge.history(10);
  assert.equal(result.busy, true);
  assert.deepEqual(
    result.messages.map((m) => m.id),
    ["visible"],
  );
  assert.equal(requests[1].offset, 80);
});

test("tool-heavy polls retain previously shown text and deduplicate updated messages", async () => {
  const bridge = new OpenClawBridge("test-session");
  let data = { messages: [message("reply", 20)] };
  bridge.call = async () => data;
  await bridge.history(10);
  bridge.cached.at = 0;
  data = { messages: [tool] };
  assert.equal((await bridge.history(10)).messages[0].text, "reply");
  bridge.cached.at = 0;
  data = { messages: [message("reply", 20, "completed reply")] };
  const result = await bridge.history(10);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].text, "completed reply");
});

test("new history cutoff does not reuse an older cached conversation", async () => {
  const bridge = new OpenClawBridge("test-session");
  bridge.call = async () => ({
    messages: [message("old", 10), message("new", 30)],
  });
  assert.equal((await bridge.history(0)).messages.length, 2);
  assert.deepEqual(
    (await bridge.history(20)).messages.map((m) => m.id),
    ["new"],
  );
});

test("history pagination is bounded even with only tools and repeated cursors", async () => {
  const bridge = new OpenClawBridge("test-session");
  let calls = 0;
  bridge.call = async () => ({
    messages: [tool],
    hasMore: true,
    nextOffset: ++calls,
  });
  const result = await bridge.history(0);
  assert.equal(calls, 3);
  assert.deepEqual(result.messages, []);
});

test("a refused call keeps the host's typed reason instead of just the exit code", async (t) => {
  // The CLI prints its reason on stdout and only then exits non-zero. execFile
  // rejects on the exit code first, so the reason used to be dropped: an
  // admin-scope refusal retried eighteen times and logged "Command failed"
  // every time, with the answer sitting unread on stdout.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai3d-refusal-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const stub = path.join(dir, "openclaw");
  fs.writeFileSync(
    stub,
    `#!/usr/bin/env node\nconsole.log(JSON.stringify({ ok: false, error: { code: "INVALID_REQUEST", message: "originating route fields require admin scope" } }));\nprocess.exit(1);\n`,
    { mode: 0o700 },
  );
  const previous = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${previous}`;
  t.after(() => {
    process.env.PATH = previous;
  });
  const bridge = new OpenClawBridge("refusal-session");
  await assert.rejects(bridge.call("chat.send", { message: "x" }), (error) => {
    assert.match(error.message, /admin scope/);
    // Two fields rather than prose to grep: the outbox stores them on the batch
    // so the page and the Agent can state the cause, and a caller that wants to
    // branch on the code should not have to parse a sentence for it.
    assert.deepEqual(error.hostError, {
      code: "INVALID_REQUEST",
      message: "originating route fields require admin scope",
    });
    return true;
  });
});

test("a refused call with no parsable payload still fails loudly", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai3d-refusal-raw-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const stub = path.join(dir, "openclaw");
  fs.writeFileSync(
    stub,
    `#!/usr/bin/env node\nprocess.stderr.write("boom\\n");\nprocess.exit(1);\n`,
    { mode: 0o700 },
  );
  const previous = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${previous}`;
  t.after(() => {
    process.env.PATH = previous;
  });
  const bridge = new OpenClawBridge("refusal-session");
  // No payload to preserve, so the original spawn failure must survive rather
  // than be swallowed or reported as an accepted send.
  await assert.rejects(bridge.call("chat.send", { message: "x" }));
});

test("a zero-exit payload that carries no error is still accepted", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai3d-accept-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const stub = path.join(dir, "openclaw");
  fs.writeFileSync(
    stub,
    `#!/usr/bin/env node\nconsole.log(JSON.stringify({ status: "started", runId: "r1" }));\n`,
    { mode: 0o700 },
  );
  const previous = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${previous}`;
  t.after(() => {
    process.env.PATH = previous;
  });
  const bridge = new OpenClawBridge("accept-session");
  assert.deepEqual(await bridge.call("chat.send", { message: "x" }), {
    status: "started",
    runId: "r1",
  });
});
