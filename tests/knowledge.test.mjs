import test from "node:test";
import assert from "node:assert/strict";
import {
  KNOWLEDGE_ENTRIES,
  KNOWLEDGE_VERSION,
  callKnowledgeTool,
  getKnowledge,
  listKnowledge,
  searchKnowledge,
} from "../mcp/knowledge.mjs";

test("every knowledge entry carries a source, a licence and a refresh date", () => {
  assert.ok(KNOWLEDGE_ENTRIES.length >= 8);
  for (const entry of KNOWLEDGE_ENTRIES) {
    assert.match(entry.url, /^https:\/\//, entry.id);
    assert.ok(entry.license.length > 0, entry.id);
    assert.match(entry.updated, /^\d{4}-\d{2}-\d{2}$/, entry.id);
    assert.ok(entry.tags.length > 0, entry.id);
    assert.ok(entry.facts.length > 0, entry.id);
  }
});

test("search ranks the format entry for glTF questions and stays offline", () => {
  const result = searchKnowledge("glTF node names and format");
  assert.equal(result.version, KNOWLEDGE_VERSION);
  assert.equal(result.results[0].id, "gltf-2-spec");
  for (const hit of result.results) {
    assert.ok(hit.url.startsWith("https://"));
    assert.ok(KNOWLEDGE_ENTRIES.some((entry) => entry.id === hit.id));
  }
});

test("search reaches the Chinese aliases and the public white-model libraries", () => {
  const zh = searchKnowledge("白模 建模 拓扑");
  assert.ok(zh.results.some((hit) => hit.tags.includes("建模")));
  const cc0 = searchKnowledge("CC0 white model", { tags: ["cc0"] });
  assert.ok(cc0.results.length >= 1);
});

test("get, list and the MCP call shape agree", () => {
  const entry = getKnowledge("gltf-2-spec");
  assert.equal(entry.entry.title, "glTF 2.0 specification");
  assert.equal(getKnowledge("missing"), null);
  assert.equal(listKnowledge().count, KNOWLEDGE_ENTRIES.length);
  assert.equal(
    callKnowledgeTool({ id: "gltf-2-spec" }).entry.id,
    "gltf-2-spec",
  );
  assert.throws(() => callKnowledgeTool({ id: "missing" }), /Unknown/);
  assert.equal(
    callKnowledgeTool({ mode: "list" }).count,
    KNOWLEDGE_ENTRIES.length,
  );
});
