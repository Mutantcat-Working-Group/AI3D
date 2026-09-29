import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { inspectModel, importModel } from "../server/models.mjs";
import {
  childComplaint,
  convertStep,
  convertStepDetached,
  DEFLECTION,
} from "../server/step.mjs";
import { ReviewStore } from "../server/store.mjs";
import { startReview } from "./helpers/review-server.mjs";

/* The fixture is a plate with a through hole and filleted corners, so the
   tessellation has cylinders and a torus in it rather than six flat faces. It
   also carries no colour, which is the case that matters: the sample GLBs in
   this repository all declare materials, and that is precisely why the "black
   from underneath" bug survived three releases of testing. Real parametric
   output usually declares nothing. */
const FIXTURE = "tests/fixtures/plate.step";
const repo = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const bytes = () => fs.readFileSync(path.join(repo, FIXTURE));
const measure = async (buffer, format = "step") =>
  inspectModel(buffer, format, { derived: await convertStepDetached(buffer) });

function mediaFixture(t) {
  const parent = path.join(repo, "tmp");
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, "step-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("a STEP is measured by tessellating it, and the mesh survives our own reader", async () => {
  const metadata = await measure(bytes());
  assert.equal(metadata.format, "step");
  assert.ok(metadata.triangles > 100);
  // The strongest check available: hand the derived file back to the GLB path
  // the viewer uses. A writer that agrees with itself proves nothing.
  const reread = inspectModel(metadata.derived.glb, "glb");
  assert.equal(reread.triangles, metadata.triangles);
});

test("a STEP that arrives unconverted is refused rather than tessellated here", async () => {
  /* `inspectModel` runs inside the review server and inside the Gateway. A
     caller that reaches it without having converted is a caller about to load a
     CAD kernel into a process that must never hold one, so it is told, loudly,
     rather than served. */
  assert.throws(
    () => inspectModel(bytes(), "step"),
    /tessellated by convertStepDetached/,
  );
});

test("the published identity stays the source; the drawn bytes are the mesh", async (t) => {
  const mediaDir = mediaFixture(t);
  const model = await importModel(
    { file: FIXTURE, name: "plate", version: "v1" },
    { workspace: repo, mediaDir },
  );
  assert.equal(model.format, "step");
  assert.equal(
    model.sha256,
    crypto.createHash("sha256").update(bytes()).digest("hex"),
    "sha256 must name the file the author published",
  );
  assert.equal(model.mesh.format, "glb");
  assert.notEqual(model.mesh.sha256, model.sha256);
  assert.equal(
    model.mesh.sha256,
    crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(mediaDir, model.mesh.filename)))
      .digest("hex"),
    "mesh.sha256 must match the bytes the page will fetch and check",
  );
  // Both halves are kept: the source for download, the mesh for the viewer --
  // and the note that leads from one to the other.
  assert.deepEqual(
    fs.readdirSync(mediaDir).sort(),
    [model.filename, model.mesh.filename, "step-meshes.json"].sort(),
  );
  assert.deepEqual(model.mesh.deflection, DEFLECTION);
  assert.ok(model.mesh.brepFaces > 0);
});

test("re-importing the same STEP lands on the same mesh file, so marks keep meaning", async (t) => {
  const mediaDir = mediaFixture(t);
  const opts = { file: FIXTURE, name: "plate", version: "v1" };
  const a = await importModel(opts, { workspace: repo, mediaDir });
  const b = await importModel(opts, { workspace: repo, mediaDir });
  assert.equal(a.mesh.sha256, b.mesh.sha256);
  // Two imports, two model files, not four: the derived mesh is
  // content-addressed like the source, which is what stops a second publish
  // from silently re-tessellating under an existing round's face indices.
  // Beside them, the note of which mesh the source became.
  assert.deepEqual(
    fs.readdirSync(mediaDir).filter((f) => f !== "step-meshes.json").length,
    2,
  );
});

/* The second import used to tessellate all over again -- 8.6 s on the largest
   real assembly -- to arrive at a file already on disk. Proved without timing
   anything: the remembered mesh is swapped for bytes the kernel would never
   produce, and the import hands those back. */
test("a STEP this build already tessellated here is taken from disk, not the kernel", async (t) => {
  const mediaDir = mediaFixture(t);
  const opts = { file: FIXTURE, name: "plate", version: "v1" };
  const build = { workspace: repo, mediaDir, generator: "AI3D test" };
  const first = await importModel(opts, build);
  const indexFile = path.join(mediaDir, "step-meshes.json");
  const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  const entry = index[first.sha256]["AI3D test"];
  assert.equal(entry.sha256, first.mesh.sha256);

  const stand = Buffer.from("not a tessellation of anything");
  const standHash = crypto.createHash("sha256").update(stand).digest("hex");
  fs.writeFileSync(path.join(mediaDir, `${standHash}.glb`), stand);
  entry.sha256 = standHash;
  fs.writeFileSync(indexFile, JSON.stringify(index));
  assert.equal((await importModel(opts, build)).mesh.sha256, standHash);

  // Bytes that no longer match the note are not believed: converted afresh.
  fs.writeFileSync(path.join(mediaDir, `${standHash}.glb`), "edited");
  assert.equal((await importModel(opts, build)).mesh.sha256, first.mesh.sha256);
  // And another build does not borrow this one's mesh.
  const other = await importModel(opts, { ...build, generator: "AI3D 9" });
  assert.notEqual(other.mesh.sha256, first.mesh.sha256);
});

/* The tessellator is asked for millimetres and scales the file's own unit into
   them, so the mesh is millimetres whatever the caller calls it. */
test("a STEP is labelled in millimetres whatever the caller said", async (t) => {
  const mediaDir = mediaFixture(t);
  const opts = { file: FIXTURE, name: "plate", version: "v1" };
  for (const units of [undefined, "in", "unspecified"])
    assert.equal(
      (await importModel({ ...opts, units }, { workspace: repo, mediaDir }))
        .units,
      "mm",
    );
});

test("a STEP with no colour reaches the viewer with no material, so it gets the review grey", async () => {
  const { glb } = (await measure(bytes())).derived;
  const json = JSON.parse(
    glb.toString("utf8", 20, 20 + glb.readUInt32LE(12)).replace(/\0+$/, ""),
  );
  assert.equal(
    json.materials,
    undefined,
    "inventing a material here would opt the model out of the grey and put it back in the dark",
  );
  assert.ok(json.meshes[0].extras.brepFaces.length > 0);
});

test("a file that is not a STEP is refused as one, and refusing it does not take the process down", async () => {
  for (const bad of [
    Buffer.alloc(0),
    Buffer.from("not a step at all"),
    bytes().subarray(0, 200),
    Buffer.concat([Buffer.from("glTF"), Buffer.alloc(64)]),
  ])
    await assert.rejects(
      async () => await measure(bad),
      (error) => error.code === "MODEL_FORMAT" || error.code === "MODEL_LIMIT",
    );
  assert.ok((await convertStepDetached(bytes())).ok, "still usable afterwards");
});

test("the parser's own complaints cannot be mistaken for an answer", async () => {
  /* On a malformed upload the CAD library prints "**** ERR StepFile ..." -- to
     stdout, not stderr, and ahead of anything we write. While the answer also
     travelled on stdout the first malformed STEP came back as a JSON parse
     error on the word "ERR" rather than as a refusal, because those four
     asterisks were read as the frame length.

     Put the frame back on stdout and this goes red. That is the point of it:
     the refusal below is already covered elsewhere, and what is being pinned
     here is the separate descriptor. */
  const result = await convertStepDetached(Buffer.from("not a step at all"));
  assert.deepEqual(result, { ok: false });
});

/* A converter that dies with a frame half-written is the one input the answer
   reader is there for, and it cannot be produced by feeding a bad model: the
   child either answers or does not. So the child is replaced, and the module
   under test is the repository's own file, copied at run time beside it --
   `step.mjs` imports nothing but node built-ins and finds its child by looking
   next to itself, which is what makes that possible without a seam in shipped
   code. Copied rather than reimplemented, so it cannot drift from what ships.
   With the guard removed, the parse throws inside the `close` handler: past
   the promise, which never settles, and out of the process. */
async function converterThatWrites(t, body) {
  const dir = fs.mkdtempSync(path.join(repo, "tmp", "half-answer-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(
    path.join(repo, "server/step.mjs"),
    path.join(dir, "step.mjs"),
  );
  fs.writeFileSync(
    path.join(dir, "step-child.mjs"),
    `import fs from "node:fs";\nfor await (const chunk of process.stdin);\n${body}\nprocess.exit(137);\n`,
  );
  return import(new URL(`file://${path.join(dir, "step.mjs")}`));
}

test("a converter that dies part-way through its answer is refused, not thrown past", async (t) => {
  const answers = {
    "a length header describing bytes that never arrived": `
      const head = Buffer.from('{"ok":true,"triangles":12', "utf8");
      const length = Buffer.alloc(4);
      length.writeUInt32LE(head.length + 64, 0);
      fs.writeSync(3, Buffer.concat([length, head]));`,
    "a complete frame that is not JSON": `
      const head = Buffer.from("**** ERR StepFile", "utf8");
      const length = Buffer.alloc(4);
      length.writeUInt32LE(head.length, 0);
      fs.writeSync(3, Buffer.concat([length, head]));`,
    "nothing at all": "",
  };
  for (const [what, body] of Object.entries(answers)) {
    const { convertStepDetached: detached } = await converterThatWrites(
      t,
      body,
    );
    await assert.rejects(
      () => detached(Buffer.alloc(8)),
      /STEP converter/,
      `${what} has to come back as a refusal`,
    );
  }
});

/* The child's stderr used to be thrown away with the library's stdout noise, so
   every crash read "stopped without an answer (exit 1)" whatever had happened.
   The real one was a vendored module loaded as the wrong kind of module. */
test("a converter that crashes says what it crashed on", async (t) => {
  const { convertStepDetached: detached } = await converterThatWrites(
    t,
    `throw new TypeError("require2(...) is not a function");`,
  );
  await assert.rejects(
    () => detached(Buffer.alloc(8)),
    /stopped without an answer \(exit 1\)\. TypeError: require2\(\.\.\.\) is not a function$/,
  );
});

test("the line kept from a crash is the one naming it, not the stack under it", () => {
  const crash = [
    "file:///x/runtime/step-child.mjs:12",
    "const { glb } = await convertStep(buffer);",
    "                ^",
    "",
    "TypeError: require2(...) is not a function",
    "    at occt (file:///x/runtime/step.mjs:65:61)",
    "    at convertStep (file:///x/runtime/step.mjs:211:24)",
    "",
    "Node.js v24.18.0",
  ].join("\n");
  assert.equal(
    childComplaint(crash),
    "TypeError: require2(...) is not a function",
  );
  // Nothing named as an error: the last line that is not a frame or a banner.
  assert.equal(
    childComplaint("warming up\nout of memory\n    at x\nNode.js v24.18.0\n"),
    "out of memory",
  );
  assert.equal(childComplaint(""), "");
});

test("a tessellation that will not finish is killed rather than waited on", async () => {
  /* The budget exists for a model the kernel cannot chew, which is the one risk
     of this feature that cannot be disproved from the files on hand. What is
     testable is that the budget is enforced by stopping the work, and that the
     converter still works afterwards -- a killed child must not leave the next
     publish broken. */
  await assert.rejects(
    () => convertStepDetached(bytes(), { timeoutMs: 1 }),
    /still being tessellated/,
  );
  assert.ok((await convertStepDetached(bytes())).ok);
});

test("a round grants the page the mesh it can draw, not only the source it cannot", async (t) => {
  const mediaDir = mediaFixture(t);
  const store = new ReviewStore(mediaFixture(t));
  const model = await importModel(
    { file: FIXTURE, name: "plate", version: "v1" },
    { workspace: repo, mediaDir },
  );
  store.publish(model, null, { activate: true });
  assert.ok(store.modelInBinding(model.filename));
  assert.ok(
    store.modelInBinding(model.mesh.filename),
    "the viewer fetches the derived mesh; refusing it would leave the page empty",
  );
  assert.equal(store.modelInBinding(`${"0".repeat(64)}.glb`), false);
});

test("a running instance serves the mesh to the page and the STEP to whoever downloads it", async (t) => {
  const f = await startReview(t, { workspace: repo });
  const published = await f.ipc("/publish", {
    file: FIXTURE,
    name: "Plate",
    version: "v1",
  });
  assert.equal(published.status, 200);
  const model = published.body.model;
  assert.equal(model.format, "step");
  assert.ok(model.mesh, "a STEP must reach the page with a mesh to draw");

  /* The page checks what it fetched against `mesh.sha256` before it will draw
     it, so this is the assertion that the two ends agree. It is also the one
     that would have caught serving the source here: a STEP body against a mesh
     hash tells the reviewer their version is stale, which is a confusing way to
     say "this format is not supported". */
  const drawn = await f.api(`models/${model.mesh.filename}`);
  assert.equal(drawn.status, 200);
  assert.equal(
    crypto.createHash("sha256").update(drawn.raw).digest("hex"),
    model.mesh.sha256,
  );

  const downloaded = await f.api(`download/${model.filename}`);
  assert.equal(downloaded.status, 200);
  assert.equal(
    crypto.createHash("sha256").update(downloaded.raw).digest("hex"),
    model.sha256,
    "download hands over the file the author published, not our tessellation",
  );
  assert.deepEqual(downloaded.raw, bytes());

  /* Both files stay on disk for as long as the version does, so both have to
     be in the number that exists to make disk use conspicuous. Counting the
     source alone shaved every STEP round -- and the ones worth noticing are
     exactly the assemblies whose derived mesh is largest. */
  const storage = (await f.ipc("/status")).body.storage;
  assert.equal(storage.models, 1);
  assert.equal(
    storage.bytes,
    model.bytes + model.mesh.bytes,
    "a STEP keeps a source and a mesh; storage that names one is not the disk",
  );
  assert.ok(model.mesh.bytes > 0);
});

/* The test above stops one call short of the page: it proves the mesh is served
   and hashes correctly, but the viewer then has to report that hash back before
   it is allowed to draw anything. Serving the right bytes and refusing them at
   the handshake looks identical from here and entirely broken from a browser —
   the page reports the model does not match what the Agent delivered, drops the
   version it had, and the next poll starts the same load again, forever. */
test("the page reports the hash of what it drew, which is the mesh and not the STEP", async (t) => {
  const f = await startReview(t, { workspace: repo });
  const model = (
    await f.ipc("/publish", { file: FIXTURE, name: "Plate", version: "v1" })
  ).body.model;
  assert.notEqual(
    model.mesh.sha256,
    model.sha256,
    "a STEP and its tessellation cannot be the same bytes; without that the rest of this test proves nothing",
  );
  const owner = { versionId: model.id, clientId: "step-viewer" };
  const manifest = [
    {
      id: "mesh-0",
      name: "plate",
      triangles: model.triangles,
      sourceTriangles: model.triangles,
      surfaceAlgorithm: "midpoint-v3-edge0.07-rationed",
      matrixWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    },
  ];

  const drew = await f.api("ready", {
    method: "POST",
    body: { ...owner, sha256: model.mesh.sha256, meshes: manifest },
  });
  assert.equal(drew.status, 200, drew.body?.error ?? "");

  // And the receipt says which bytes were verified, so "the viewer loaded this"
  // stays checkable from outside.
  const receipt = (await f.ipc("/status")).body.viewerReceipts[owner.clientId];
  assert.equal(receipt.versionId, model.id);
  assert.equal(receipt.sha256, model.mesh.sha256);

  // The source hash is still the wrong answer here: it names the published file,
  // never the bytes on screen, so a page claiming it did not draw this version.
  const claimedSource = await f.api("ready", {
    method: "POST",
    body: { ...owner, sha256: model.sha256, meshes: manifest },
  });
  assert.equal(claimedSource.status, 409);
});

/* Measuring lag needs the loop to actually reach its timer phase. Awaiting a
   function that does its work synchronously only queues a microtask, so a loop
   written that way never yields at all and reports a serene zero while being
   blocked solid — which is what the first version of this measurement did. */
const yieldToTimers = () => new Promise((r) => setTimeout(r, 0));
async function whileConverting(run, times = 8) {
  let worst = 0,
    ticks = 0,
    last = Date.now();
  const tick = setInterval(() => {
    const now = Date.now();
    worst = Math.max(worst, now - last - 10);
    last = now;
    ticks++;
  }, 10);
  await yieldToTimers();
  last = Date.now();
  for (let i = 0; i < times; i++) {
    await run();
    await yieldToTimers();
  }
  clearInterval(tick);
  return { worst, ticks };
}

test("converting elsewhere leaves the server able to answer; converting in line does not", async () => {
  const buffer = bytes();
  const inline = await whileConverting(() => convertStep(buffer));
  const detached = await whileConverting(() => convertStepDetached(buffer));
  /* The tick count is the honest one: in line, a 10 ms timer gets to run about
     once per conversion because the rest of the time there is no loop to run
     on. This fixture takes ~68 ms; the heaviest real assembly in this workspace
     takes 8.5 s, and that is 8.5 s of a reviewer's page not being served. */
  assert.ok(
    detached.ticks > inline.ticks * 3,
    `the loop should keep running: ${inline.ticks} ticks in line vs ${detached.ticks} detached`,
  );
  assert.ok(
    detached.worst < inline.worst,
    `worst stall: ${inline.worst}ms in line vs ${detached.worst}ms detached`,
  );
});

test("a host that converts a STEP weighs the same afterwards as before", () => {
  /* In a process of its own, and that is not fussiness. The cost being measured
     is paid once, on the first conversion, by whoever converts first — so a
     version of this that ran here would take its baseline after some earlier
     test had already paid it and then assert, truthfully and uselessly, that
     the second conversion was free. Its predecessor did exactly that, which is
     why a thread charging ~240 MB of unreturned RSS for any STEP of any size
     went unnoticed. This fixture is 344 triangles.

     A process gives it back by ending: 12 conversions move a host from 37 MB to
     38 MB. A thread left it at 297 MB, and none of that came back for the 24
     hours an idle review server stays up. */
  const probe = `
    const { convertStepDetached } = await import(${JSON.stringify(path.join(repo, "server/step.mjs"))});
    const fs = await import("node:fs");
    const buffer = fs.readFileSync(${JSON.stringify(path.join(repo, FIXTURE))});
    const before = process.memoryUsage().rss;
    for (let i = 0; i < 12; i++) await convertStepDetached(buffer);
    console.log((process.memoryUsage().rss - before) / 1048576);
  `;
  const grew = Number(
    execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
      encoding: "utf8",
    }),
  );
  assert.ok(grew < 100, `RSS grew ${grew.toFixed(0)} MB across 12 conversions`);
});
