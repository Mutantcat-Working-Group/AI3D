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
  CATALOG_TOOL,
  GENERATE_TOOL,
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
    ["ai3d", "ai3d_knowledge", "ai3d_catalog", "ai3d_generate"],
  );
  assert.match(TOOL.description, /cannot be pushed to/);
  assert.equal(TOOL.inputSchema.required.includes("action"), true);
  assert.deepEqual(CATALOG_TOOL.inputSchema.properties.mode.enum, [
    "all",
    "types",
    "kits",
    "design",
  ]);
  assert.equal(GENERATE_TOOL.inputSchema.required.includes("output"), true);
  assert.equal(
    GENERATE_TOOL.inputSchema.properties.design.additionalProperties,
    true,
  );
  assert.deepEqual(
    GENERATE_TOOL.inputSchema.properties.design.properties.directives.items,
    { type: "string" },
  );
});

test("the catalog tool reports types, kits and the scene design contract", async (t) => {
  const handle = handlerFor(workspace(t));
  const all = await handle({
    id: 21,
    method: "tools/call",
    params: { name: "ai3d_catalog", arguments: {} },
  });
  const catalogue = all.result.structuredContent;
  assert.equal(all.isError, undefined);
  assert.equal(catalogue.mode, "all");
  assert.ok(catalogue.typeCount > 50, "expected a broad asset catalogue");
  assert.equal(catalogue.kitCount, 8);
  const dungeon = catalogue.kits.find((kit) => kit.id === "dungeon");
  assert.ok(dungeon.props.includes("portcullis"));
  assert.equal(Array.isArray(dungeon.design.objectives), true);
  assert.deepEqual(catalogue.design.lockStates, ["locked", "open", "sealed"]);

  // Filters run over the same registry the generator reads, so a tag that
  // exists cannot silently come back empty.
  const food = await handle({
    id: 22,
    method: "tools/call",
    params: {
      name: "ai3d_catalog",
      arguments: { mode: "types", tags: ["food"], limit: 5 },
    },
  });
  const filtered = food.result.structuredContent;
  assert.ok(filtered.types.length > 0 && filtered.types.length <= 5);
  assert.equal(
    filtered.types.every((entry) => entry.tags.includes("food")),
    true,
  );
  assert.ok(filtered.typeCount >= filtered.types.length);
});

test("the generate tool writes a game pack into the workspace", async (t) => {
  const dir = workspace(t);
  const answer = await handlerFor(dir)({
    id: 12,
    method: "tools/call",
    params: {
      name: "ai3d_generate",
      arguments: {
        output: "generated-assets",
        type: "sword",
        engine: "unity",
        seed: 5,
        name: "hero-sword",
      },
    },
  });
  const result = answer.result.structuredContent;
  assert.equal(result.asset.type, "sword");
  assert.equal(result.asset.id, "hero-sword");
  assert.equal(result.asset.engine, "unity");
  assert.ok(result.asset.stats.triangles > 0);

  const zip = path.join(dir, "generated-assets/hero-sword/hero-sword.zip");
  const glb = path.join(dir, "generated-assets/hero-sword/hero-sword.glb");
  const manifest = path.join(
    dir,
    "generated-assets/hero-sword/pack/manifest.json",
  );
  assert.equal(fs.existsSync(zip), true);
  assert.equal(fs.existsSync(glb), true);
  assert.equal(fs.existsSync(manifest), true);
  const parsed = JSON.parse(fs.readFileSync(manifest, "utf8"));
  assert.equal(parsed.engine.id, "unity");
  assert.equal(parsed.assets[0].id, "hero-sword");
});

test("the generate tool resolves a natural-language prompt", async (t) => {
  const dir = workspace(t);
  const answer = await handlerFor(dir)({
    id: 13,
    method: "tools/call",
    params: {
      name: "ai3d_generate",
      arguments: {
        output: "generated-assets/prompted",
        prompt: "a red sword 1.5 m",
        seed: 3,
      },
    },
  });
  const result = answer.result.structuredContent;
  assert.equal(result.asset.type, "sword");
  assert.equal(result.asset.color, "#c0392b");
  assert.equal(result.asset.size, 1.5);
  assert.equal(result.asset.units, "m");
});

test("the generate tool refuses paths outside the workspace", async (t) => {
  const dir = workspace(t);
  const answer = await handlerFor(dir)({
    id: 14,
    method: "tools/call",
    params: {
      name: "ai3d_generate",
      arguments: { output: "../escape", type: "sword" },
    },
  });
  assert.equal(answer.result.isError, true);
  const text = JSON.parse(answer.result.content[0].text);
  assert.equal(text.code, "BAD_OUTPUT");
  assert.equal(fs.existsSync(path.join(path.dirname(dir), "escape")), false);
});

test("the generate tool composes a scene kit into a level pack", async (t) => {
  const dir = workspace(t);
  const answer = await handlerFor(dir)({
    id: 15,
    method: "tools/call",
    params: {
      name: "ai3d_generate",
      arguments: {
        kind: "scene",
        output: "generated-assets/levels",
        type: "dungeon",
        engine: "unity",
        seed: 7,
        name: "crypt",
      },
    },
  });
  const result = answer.result.structuredContent;
  assert.equal(result.asset.kind, "scene");
  assert.equal(result.asset.type, "dungeon");
  assert.equal(result.asset.id, "crypt");
  assert.ok(result.asset.stats.triangles > 0);
  assert.equal(typeof result.asset.designAudit.readiness, "number");
  assert.ok(result.asset.designAudit.checks.length > 0);

  const manifest = path.join(
    dir,
    "generated-assets/levels/crypt/pack/manifest.json",
  );
  const parsed = JSON.parse(fs.readFileSync(manifest, "utf8"));
  assert.equal(parsed.assets[0].kind, "scene");
  assert.equal(parsed.assets[0].scene.kit, "dungeon");
  assert.equal(parsed.assets[0].files.blueprint, "blueprints/crypt.json");
  assert.equal(
    fs.existsSync(
      path.join(
        dir,
        "generated-assets/levels/crypt/pack/blueprints/crypt.json",
      ),
    ),
    true,
  );
  assert.equal(parsed.readiness.count, 1);
});

test("the generate tool applies custom scene design metadata", async (t) => {
  const dir = workspace(t);
  const design = {
    spawnPoints: { playerStart: 1, enemySpawn: 4 },
    objectives: [
      {
        id: "hold-the-line",
        title: "Hold the line",
        summary: "Defend the camp from four attack waves.",
      },
    ],
    lootTables: [
      { container: "crate", items: ["bread", "potion", "rope_coil"] },
    ],
    locks: [{ prop: "flag", state: "open", opensWith: "crate" }],
    directives: ["Keep the command tent clear of enemy patrols."],
  };
  const answer = await handlerFor(dir)({
    id: 17,
    method: "tools/call",
    params: {
      name: "ai3d_generate",
      arguments: {
        kind: "scene",
        output: "generated-assets/custom-level",
        type: "camp",
        seed: 4,
        name: "command-camp",
        design,
      },
    },
  });
  const result = answer.result.structuredContent;
  assert.equal(result.asset.kind, "scene");
  assert.equal(result.asset.designAudit.summary.ready, true);
  assert.equal(
    result.asset.designAudit.checks.find((check) => check.id === "objectives")
      .details[0],
    "1 objectives",
  );

  const summary = JSON.parse(
    fs.readFileSync(
      path.join(dir, "generated-assets/custom-level/command-camp/summary.json"),
      "utf8",
    ),
  );
  assert.deepEqual(summary.design, design);
  const blueprint = JSON.parse(
    fs.readFileSync(
      path.join(
        dir,
        "generated-assets/custom-level/command-camp/pack/blueprints/command-camp.json",
      ),
      "utf8",
    ),
  );
  assert.deepEqual(blueprint.objectives, design.objectives);
  assert.deepEqual(blueprint.locks, design.locks);
});

test("the generate tool accepts an explicit scene prop layout", async (t) => {
  const dir = workspace(t);
  const answer = await handlerFor(dir)({
    id: 24,
    method: "tools/call",
    params: {
      name: "ai3d_generate",
      arguments: {
        kind: "scene",
        output: "generated-assets/layouts",
        type: "camp",
        name: "outpost",
        props: [
          { type: "house", size: 1.2, x: -1, z: 0 },
          { type: "fence", x: 1, z: 0, rotationY: 0 },
          { type: "crate", x: 0, z: 1 },
        ],
        design: {
          spawnPoints: { playerStart: 1, enemySpawn: 2 },
          objectives: [
            {
              id: "clear",
              title: "Clear the camp",
              summary: "Defeat the guards.",
            },
          ],
          lootTables: [{ container: "crate", items: ["bread", "potion"] }],
          locks: [{ prop: "fence", state: "open", opensWith: "crate" }],
          directives: ["Place the house to the west."],
        },
      },
    },
  });
  const result = answer.result.structuredContent;
  assert.equal(result.asset.kind, "scene");
  // The design is checked against the props the caller placed, not the kit's.
  assert.equal(result.asset.designAudit.summary.ready, true);

  const summary = JSON.parse(fs.readFileSync(result.files.summary, "utf8"));
  assert.equal(summary.customLayout, true);
  assert.deepEqual(summary.props, ["house", "fence", "crate"]);

  const blueprint = JSON.parse(
    fs.readFileSync(
      path.join(result.files.packDir, "blueprints/outpost.json"),
      "utf8",
    ),
  );
  assert.deepEqual(
    blueprint.props.map((prop) => prop.type),
    ["house", "fence", "crate"],
  );
  assert.equal(blueprint.props[0].position.x, -1);
  assert.equal(blueprint.props[0].position.z, 0);
});

test("the generate tool rejects props outside a scene and unknown prop types", async (t) => {
  const dir = workspace(t);
  const call = (args) =>
    handlerFor(dir)({
      id: 25,
      method: "tools/call",
      params: { name: "ai3d_generate", arguments: args },
    });
  const wrongKind = await call({
    output: "generated-assets/wrong-kind",
    type: "sword",
    props: [{ type: "crate" }],
  });
  assert.equal(wrongKind.result.isError, true);
  assert.equal(
    JSON.parse(wrongKind.result.content[0].text).code,
    "BAD_PARAMETER",
  );

  const unknownProp = await call({
    kind: "scene",
    output: "generated-assets/unknown-prop",
    type: "camp",
    props: [{ type: "not-a-real-prop" }],
  });
  assert.equal(unknownProp.result.isError, true);
  assert.match(
    JSON.parse(unknownProp.result.content[0].text).message,
    /not a known asset type/,
  );
});

test("the generate tool reads a scene kit out of a prompt", async (t) => {
  const dir = workspace(t);
  const call = (args) =>
    handlerFor(dir)({
      id: 16,
      method: "tools/call",
      params: { name: "ai3d_generate", arguments: args },
    });

  const prompted = await call({
    kind: "scene",
    output: "generated-assets/prompted-scene",
    prompt: "a small temple level",
    seed: 2,
  });
  assert.equal(prompted.result.structuredContent.asset.type, "temple");

  const unknown = await call({
    kind: "scene",
    output: "generated-assets/nowhere",
    prompt: "a quiet harbour",
  });
  assert.equal(unknown.result.isError, true);
  const refused = JSON.parse(unknown.result.content[0].text);
  assert.equal(refused.code, "BAD_PARAMETER");
  assert.match(refused.message, /scene kit/);
});

test("the generate tool composes an asset set from items", async (t) => {
  const dir = workspace(t);
  const answer = await handlerFor(dir)({
    id: 26,
    method: "tools/call",
    params: {
      name: "ai3d_generate",
      arguments: {
        kind: "set",
        output: "generated-assets",
        name: "starter-pack",
        style: "lowpoly",
        engine: "godot",
        seed: 7,
        items: [
          { type: "tree" },
          { type: "tree" },
          { prompt: "a red sword 1.2 m", name: "hero-blade" },
          { type: "crate", color: "#8b5a2b", size: 0.8 },
        ],
      },
    },
  });
  const result = answer.result.structuredContent;
  assert.equal(result.ok, true);
  assert.equal(result.set.id, "starter-pack");
  assert.equal(result.set.count, 4);
  assert.equal(result.set.engine, "godot");
  // Duplicate slugs are disambiguated instead of overwriting each other, and
  // each asset derives a deterministic seed from the set seed.
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["tree", "tree-2", "hero-blade", "crate"],
  );
  assert.deepEqual(
    result.items.map((item) => item.seed),
    [7, 8, 9, 10],
  );
  assert.equal(result.items[0].style, "lowpoly");
  assert.equal(result.items[1].files.glb.includes("tree-2/tree-2.glb"), true);
  assert.equal(fs.existsSync(path.join(dir, result.items[1].files.glb)), true);

  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, result.files.manifest), "utf8"),
  );
  assert.equal(manifest.schema, "ai3d-generated-set");
  assert.equal(manifest.count, 4);
  assert.equal(manifest.totals.assets, 4);
  assert.equal(
    manifest.totals.triangles,
    result.items.reduce((sum, item) => sum + item.stats.triangles, 0),
  );
});

test("the generate tool rejects malformed asset set items", async (t) => {
  const dir = workspace(t);
  const call = (args) =>
    handlerFor(dir)({
      id: 27,
      method: "tools/call",
      params: { name: "ai3d_generate", arguments: args },
    });
  const empty = await call({
    kind: "set",
    output: "generated-assets",
    items: [],
  });
  assert.equal(empty.result.isError, true);
  assert.match(
    JSON.parse(empty.result.content[0].text).message,
    /non-empty array/,
  );

  const unknownType = await call({
    kind: "set",
    output: "generated-assets",
    items: [{ type: "not-a-real-asset" }],
  });
  assert.equal(unknownType.result.isError, true);
  assert.match(
    JSON.parse(unknownType.result.content[0].text).message,
    /not a known asset type/,
  );

  const extraField = await call({
    kind: "set",
    output: "generated-assets",
    items: [{ type: "tree", nope: true }],
  });
  assert.equal(extraField.result.isError, true);
  assert.match(
    JSON.parse(extraField.result.content[0].text).message,
    /unsupported field/,
  );

  const wrongKind = await call({
    output: "generated-assets",
    type: "sword",
    items: [{ type: "tree" }],
  });
  assert.equal(wrongKind.result.isError, true);
  assert.match(
    JSON.parse(wrongKind.result.content[0].text).message,
    /only supported when kind is "set"/,
  );
});

test("the knowledge tool returns cited entries and rejects unknown ids", async (t) => {
  const handle = handlerFor(workspace(t));
  const call = (args) =>
    handle({
      id: 9,
      method: "tools/call",
      params: { name: "ai3d_knowledge", arguments: args },
    });
  const found = await call({ query: "LOD budget" });
  const entry = found.result.structuredContent.results[0];
  assert.equal(typeof entry.url, "string");
  assert.ok(entry.url.startsWith("https://"));
  assert.equal(typeof entry.license, "string");
  assert.ok(entry.license.length > 0);
  const one = await call({ id: "gltf-2-spec" });
  assert.equal(one.result.structuredContent.entry.id, "gltf-2-spec");
  const missing = await call({ id: "does-not-exist" });
  assert.equal(missing.result.isError, true);
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
  assert.equal(written[0].result.tools.length, 4);
  assert.equal(written[2].error.code, -32700);
});
