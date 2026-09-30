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
import { getAssetTypes } from "../src/generator.js";

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

test("search covers the public base-mesh libraries and the production craft", () => {
  const whiteModels = searchKnowledge("白模 基础网格 可商用");
  assert.ok(whiteModels.results.length >= 2);
  assert.ok(
    whiteModels.results.every((hit) => hit.license.length > 0),
    "a white-model hit must state its licence",
  );

  const retopo = searchKnowledge("重拓扑 四边面 布线");
  assert.equal(retopo.results[0].id, "retopology-quad-flow");

  const bake = searchKnowledge("法线贴图 烘焙 高模 低模");
  assert.equal(bake.results[0].id, "sculpt-bake-normal-maps");

  const hardSurface = searchKnowledge("硬表面 倒角 布尔");
  assert.equal(hardSurface.results[0].id, "hard-surface-modeling");
});

test("every related asset points at a template the generator can build", () => {
  const types = new Set(getAssetTypes());
  for (const entry of KNOWLEDGE_ENTRIES) {
    for (const asset of entry.relatedAssets) {
      assert.ok(
        types.has(asset),
        `${entry.id} points at unknown asset ${asset}`,
      );
    }
  }
});

test("public white-model sources and the modelling pipeline stay searchable", () => {
  for (const id of [
    "blender-base-meshes",
    "smithsonian-open-access",
    "opengameart",
    "scan-the-world",
    "mixamo",
  ]) {
    assert.ok(getKnowledge(id), `${id} is missing from the knowledge pack`);
  }

  const whiteModels = searchKnowledge("白模 基础网格");
  assert.ok(whiteModels.results.length >= 3);
  assert.ok(
    whiteModels.results.some((hit) => hit.id === "blender-base-meshes"),
  );

  const pipeline = searchKnowledge("专业建模 管线 粗模");
  assert.equal(pipeline.results[0].id, "blockout-to-detail-pipeline");

  const normals = searchKnowledge("法线贴图 切线空间 光滑组");
  assert.equal(normals.results[0].id, "normal-map-and-shading");

  const modular = searchKnowledge("模块化 场景 平铺");
  assert.equal(modular.results[0].id, "modular-kit-and-trim-sheets");

  const rig = searchKnowledge("骨骼 蒙皮 权重");
  assert.equal(rig.results[0].id, "rigging-skinning-budgets");

  const packing = searchKnowledge("贴图 通道打包 色彩空间");
  assert.equal(packing.results[0].id, "texture-packing-and-color-space");

  const naming = searchKnowledge("命名 约定 前缀");
  assert.equal(naming.results[0].id, "asset-naming-conventions");
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
