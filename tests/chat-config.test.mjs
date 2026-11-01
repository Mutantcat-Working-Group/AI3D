import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ChatConfig } from "../server/chat-config.mjs";

function config(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai3d-chat-config-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new ChatConfig(dir);
  store.update({
    providers: [
      {
        id: "one",
        baseUrl: "https://first.test/v1",
        apiKey: "secret-first",
        models: ["model"],
        model: "model",
      },
    ],
  });
  return store;
}

test("a rejected provider list preserves both live and persisted configuration", (t) => {
  const store = config(t);
  const before = structuredClone(store.state);
  assert.throws(() =>
    store.update({
      providers: [
        { id: "one", name: "changed", apiKey: "replacement" },
        { id: "two", baseUrl: "file:///wrong" },
      ],
    }),
  );
  assert.deepEqual(store.state, before);
  assert.deepEqual(new ChatConfig(path.dirname(store.file)).state, before);
});

test("changing an endpoint does not carry its previous credential", (t) => {
  const store = config(t);
  store.update({
    providers: [{ id: "one", baseUrl: "https://second.test/v1" }],
  });
  assert.equal(store.target("one").apiKey, "");
  assert.equal(store.target("one").model, "");
  store.saveProbe({
    id: "one",
    baseUrl: "https://third.test/v1",
    models: ["local"],
  });
  assert.equal(store.target("one").apiKey, "");
});

test("a local endpoint without a key is available and short keys are never returned", (t) => {
  const store = config(t);
  store.update({
    providers: [
      {
        id: "local",
        baseUrl: "http://127.0.0.1:11434/v1",
        models: ["local"],
        model: "local",
      },
    ],
  });
  assert.equal(store.view().available, true);
  store.update({ providers: [{ id: "local", apiKey: "tiny" }] });
  assert.equal(store.view().providers[0].hasKey, true);
  assert.equal(store.view().providers[0].keyHint, "");
});
