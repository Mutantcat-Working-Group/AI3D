import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import * as THREE from "three";
import { ReviewStore } from "../server/store.mjs";
import { inspectModel, importModel } from "../server/models.mjs";
import { ModelViewer } from "../src/viewer.js";

function fixture(t) {
  const parent = path.resolve("tmp");
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, "review-store-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, store: new ReviewStore(dir) };
}
const m1 = {
    id: "model-one",
    name: "sample",
    version: "v1",
    sha256: "a".repeat(64),
  },
  m2 = {
    id: "model-two",
    name: "sample",
    version: "v2",
    sha256: "b".repeat(64),
  };
const pins = [
  {
    id: "pin-one",
    type: "pin",
    label: "1",
    color: "#e76d5c",
    meshId: "mesh-0",
    faceIndex: 2,
    position: [1, 2, 3],
    normal: [0, 0, 1],
    barycentric: [0.2, 0.3, 0.5],
  },
];
function draft(store, annotations = pins, revision = 0) {
  return store.updateDraft({
    versionId: m1.id,
    clientId: "client-a",
    revision,
    annotations,
    camera: null,
  });
}

test("publishing while editing adds a version and leaves the marked one untouched, including after restart", (t) => {
  const { dir, store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  assert.equal(store.publish(m2).status, "active");
  const recovered = new ReviewStore(dir);
  assert.equal(recovered.state.active.id, m2.id);
  // The draft belongs to the version it was made on, not to "the review".
  assert.deepEqual(recovered.state.drafts[m1.id].annotations, pins);
  assert.equal(recovered.state.drafts[m2.id], undefined);
  assert.equal(recovered.state.presence[m1.id].clientId, "client-a");
  assert.deepEqual(
    recovered.versions("client-a").map((v) => [v.id, v.active, v.annotations]),
    [
      [m1.id, false, 1],
      [m2.id, true, 0],
    ],
  );
});
test("an older published version stays selectable and markable, but a foreign one does not", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.publish(m2);
  store.acquire(m1.id, "client-a");
  draft(store);
  assert.equal(store.state.active.id, m2.id, "marking must not steal display");
  assert.deepEqual(store.state.drafts[m1.id].annotations, pins);
  assert.throws(
    () => store.acquire("never-published", "client-a"),
    (e) => e.code === "UNKNOWN_VERSION",
  );
});
test("a second tab may take over, and only a stale revision is refused", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  // Presence is advisory. Clobbering is prevented by the revision check, which
  // is the guard that actually knows whether two edits conflict.
  assert.doesNotThrow(() => store.acquire(m1.id, "client-b"));
  assert.throws(
    () => draft(store, [], 0),
    (e) => e.code === "STALE_DRAFT",
  );
  assert.deepEqual(store.state.drafts[m1.id].annotations, pins);
});
test("submission is an immutable snapshot and finishing seals whatever is left", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  const item = store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "submission-one",
  });
  store.submissionStatus(item.id, "accepted", { runId: "run-one" });
  store.publish(m2);
  draft(store, [{ ...pins[0], label: "A" }], 1);
  assert.equal(item.annotations[0].label, "1");
  const { sealed } = store.finish(m1.id, "client-a");
  assert.equal(
    sealed.sealed,
    true,
    "the unsubmitted edit must reach the Agent",
  );
  assert.equal(sealed.annotations[0].label, "A");
  assert.equal(item.annotations[0].label, "1");
  assert.equal(
    store.state.active.id,
    m2.id,
    "finishing does not change display",
  );
});
test("unconfirmed delivery still lets the round be finished and keeps annotations", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "retry-one",
  });
  store.submissionStatus("retry-one", "unconfirmed");
  // Reaching the outbox is the reviewer's act; confirming delivery is not.
  // Requiring confirmation here is what left a round with no way to end.
  assert.equal(store.capabilities("client-a", m1.id).canFinish, true);
  const { sealed } = store.finish(m1.id, "client-a");
  assert.equal(sealed, null, "nothing was outstanding, so nothing was sealed");
  assert.deepEqual(store.state.drafts[m1.id].annotations, pins);
  assert.equal(store.capabilities("client-a", m1.id).canFinish, false);
});
test("retrying the same submission is idempotent and cannot silently change its source revision", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  const p = {
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "same-id",
  };
  assert.equal(store.createSubmission(p), store.createSubmission(p));
  assert.equal(store.state.submissions.length, 1);
  assert.throws(() => store.createSubmission({ ...p, revision: 0 }));
});
test("ending a version keeps its markings on screen and reopens on the next edit", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "done",
  });
  store.submissionStatus("done", "accepted");
  store.finish(m1.id, "client-a");
  assert.equal(
    store.state.active.id,
    m1.id,
    "finishing is not a version switch",
  );
  assert.equal(store.state.presence[m1.id], undefined);
  assert.ok(store.state.drafts[m1.id].closedAt);
  assert.deepEqual(store.state.drafts[m1.id].annotations, pins);
  assert.deepEqual(store.state.submissions[0].annotations, pins);
  assert.equal(store.capabilities("client-a", m1.id).canFinish, false);
  draft(store, [{ ...pins[0], label: "B" }], 1);
  assert.equal(store.state.drafts[m1.id].closedAt, null);
  assert.equal(store.capabilities("client-a", m1.id).canFinish, true);
});
test("another tab takes over a version at any time without dropping the draft", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  // A tab that stopped reporting must never be able to lock anyone out, and
  // neither must a live one: presence records who is there, nothing more.
  store.resume(m1.id, "client-b");
  assert.equal(store.state.presence[m1.id].clientId, "client-b");
  assert.deepEqual(store.state.drafts[m1.id].annotations, pins);
  assert.equal(store.publicState("client-b", m1.id).locked, false);
  assert.equal(store.publicState("client-a", m1.id).locked, true);
});
test("model import rejects corrupted GLB and invalid STL before publishing", () => {
  assert.throws(() => inspectModel(Buffer.from("not a glb"), "glb"));
  assert.throws(() => inspectModel(Buffer.alloc(84), "stl"));
});
test("real generated samples validate and import uses a stable content hash", async (t) => {
  const { dir } = fixture(t);
  const workspace = process.cwd();
  const mediaDir = path.join(dir, "models");
  const opts = {
    file: "tmp/samples/parametric-bracket.glb",
    name: "test",
    version: "v1",
  };
  const a = await importModel(opts, { workspace, mediaDir }),
    b = await importModel(opts, { workspace, mediaDir });
  assert.equal(a.id, b.id);
  assert.ok(a.triangles > 100);
  assert.equal(fs.readdirSync(mediaDir).length, 1);
  // Importing became asynchronous when a STEP started being tessellated off the
  // main thread; the refusals it already made travel as rejections now.
  await assert.rejects(() =>
    importModel({ file: os.tmpdir() }, { workspace, mediaDir }),
  );
});

test("a tiny file claiming an enormous texture is rejected before browser image decoding", () => {
  const png = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12);
  png.writeUInt32BE(20000, 16);
  png.writeUInt32BE(20000, 20);
  png[24] = 8;
  png[25] = 6;
  const doc = {
    asset: { version: "2.0" },
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ count: 3 }],
    images: [{ uri: "data:image/png;base64," + png.toString("base64") }],
  };
  const json = Buffer.from(JSON.stringify(doc)),
    length = Math.ceil(json.length / 4) * 4,
    buffer = Buffer.alloc(20 + length, 32);
  buffer.write("glTF");
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(length, 12);
  buffer.writeUInt32LE(0x4e4f534a, 16);
  json.copy(buffer, 20);
  assert.throws(
    () => inspectModel(buffer, "glb"),
    (e) => e.code === "TEXTURE_LIMIT",
  );
});

/* Morph targets were accepted at import and refused by the viewer, which throws
   after the mesh is already in the scene: the page is left with no model, a
   version id that never clears, and a retry loop that re-reads the same file
   every two seconds. The service is the only place that can say so before
   anything is published. Both spellings are refused — the standard `targets`
   array and the `extras` copy some exporters write beside it. */
test("a GLB with morph targets is refused at import, in either spelling", () => {
  const build = (primitive) => {
    const doc = {
      asset: { version: "2.0" },
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [primitive] }],
      accessors: [{ count: 3 }],
    };
    const json = Buffer.from(JSON.stringify(doc)),
      length = Math.ceil(json.length / 4) * 4,
      buffer = Buffer.alloc(20 + length, 32);
    buffer.write("glTF");
    buffer.writeUInt32LE(2, 4);
    buffer.writeUInt32LE(buffer.length, 8);
    buffer.writeUInt32LE(length, 12);
    buffer.writeUInt32LE(0x4e4f534a, 16);
    json.copy(buffer, 20);
    return buffer;
  };
  for (const primitive of [
    { attributes: { POSITION: 0 }, targets: [{}] },
    { attributes: { POSITION: 0 }, extras: { targets: [{}] } },
  ])
    assert.throws(
      () => inspectModel(build(primitive), "glb"),
      (error) => error.code === "ANIMATED_MODEL" && /morph/.test(error.message),
    );
  // The same mesh without them is still accepted, so the refusal is about the
  // targets and not about the fixture being unreadable.
  assert.doesNotThrow(() =>
    inspectModel(build({ attributes: { POSITION: 0 } }), "glb"),
  );
});

test("a lost save response can be retried after restart without duplicating or overwriting edits", (t) => {
  const { dir, store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  const saved = draft(store);
  const recovered = new ReviewStore(dir);
  assert.deepEqual(draft(recovered), saved);
  assert.equal(recovered.state.drafts[m1.id].revision, 1);
  assert.throws(
    () => draft(recovered, [{ ...pins[0], label: "B" }]),
    (e) => e.code === "STALE_DRAFT",
  );
  draft(recovered, [{ ...pins[0], label: "A" }], 1);
  assert.throws(
    () => draft(recovered),
    (e) => e.code === "STALE_DRAFT",
  );
  assert.equal(recovered.state.drafts[m1.id].annotations[0].label, "A");
});

test("delayed acceptance of an earlier submission cannot regress a newer accepted revision", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "earlier",
  });
  draft(store, [{ ...pins[0], label: "A" }], 1);
  store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 2,
    submissionId: "newer",
  });
  store.submissionStatus("newer", "accepted");
  store.submissionStatus("earlier", "accepted");
  assert.equal(store.state.drafts[m1.id].submittedRevision, 2);
  assert.equal(store.finish(m1.id, "client-a").sealed, null);
});

test("publishing a previously reviewed model cannot reuse an old submission revision", (t) => {
  const { dir, store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "first-review",
  });
  store.submissionStatus("first-review", "accepted");
  store.publish(m2);
  store.finish(m1.id, "client-a");
  assert.equal(store.publish(m1).status, "active");
  const recovered = new ReviewStore(dir);
  // Re-publishing identical content is the same version, so its markings and
  // its revision high-water are still there rather than silently reset.
  const baseline = recovered.publicState("client-a", m1.id).draft;
  assert.equal(baseline.revision, 1);
  assert.deepEqual(baseline.annotations, pins);
  assert.ok(baseline.closedAt);
  // A round that starts with no draft at all must still open above every
  // revision already submitted, or a retry would collide with a new batch.
  delete recovered.state.drafts[m1.id];
  assert.equal(recovered.claim(m1.id, "client-a").revision, 1);
  recovered.acquire(m1.id, "client-a");
  const updated = draft(
    recovered,
    [{ ...pins[0], label: "A" }],
    baseline.revision,
  );
  assert.equal(updated.revision, 2);
  assert.equal(
    recovered.state.submissions.findLast(
      (s) => s.versionId === m1.id && s.revision === updated.revision,
    ),
    undefined,
  );
  const oldRetry = recovered.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "first-review",
  });
  assert.equal(oldRetry.annotations[0].label, "1");
  assert.equal(recovered.state.drafts[m1.id].revision, 2);
  // The retry restores an old batch, not this draft's history: revision 1 of
  // the reopened round is an empty baseline nobody ever handed over.
  assert.equal(recovered.state.drafts[m1.id].submittedRevision, null);
  recovered.submissionStatus("first-review", "accepted");
  // Revision 2 was never handed over, so finishing must seal it rather than
  // treat the stale revision-1 retry as covering the newer edit.
  assert.equal(recovered.finish(m1.id, "client-a").sealed.revision, 2);
});

test("actual viewer BVH raycasts keep point labels and painted patches attached to the correct source triangles", async () => {
  // Deliberately scramble source triangle order so BVH partitioning must reorder
  // its internal traversal. Annotation indices must still use source order.
  const data = Buffer.alloc(84 + 40 * 50);
  data.writeUInt32LE(40, 80);
  for (let i = 0; i < 40; i++) {
    const x = (i * 17) % 40;
    const vertices = [x, 0, 0, x + 0.01, 0, 0, x, 0.01, 0];
    data.writeFloatLE(1, 84 + i * 50 + 8);
    vertices.forEach((v, k) => data.writeFloatLE(v, 84 + i * 50 + 12 + k * 4));
  }
  // Exercise the real load/selection/serialization path; only DOM/WebGL setup
  // is omitted because no rendering is required to verify geometric identity.
  const viewer = Object.assign(Object.create(ModelViewer.prototype), {
    root: new THREE.Group(),
    grid: new THREE.Object3D(),
    meshMap: new Map(),
    meshes: [],
    loadingEpoch: 0,
    clearModel() {},
    home() {},
    async onReady() {},
  });
  const model = {
    id: "scrambled-triangles",
    name: "scrambled triangles",
    format: "stl",
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
  };
  await viewer.load(
    model,
    `data:application/octet-stream;base64,${data.toString("base64")}`,
  );
  const mesh = viewer.meshes[0];
  assert.equal(mesh.geometry.userData.sourceFaces.length, 40);
  for (let sourceIndex = 0; sourceIndex < 40; sourceIndex++) {
    const local = new THREE.Vector3(
      ((sourceIndex * 17) % 40) + 0.003,
      0.003,
      0,
    );
    const world = mesh.localToWorld(local.clone());
    const ray = new THREE.Raycaster(
      world.clone().add(new THREE.Vector3(0, 0, 1)),
      new THREE.Vector3(0, 0, -1),
    );
    ray.firstHitOnly = true;
    const hit = ray.intersectObject(mesh, false)[0];
    assert.ok(hit, `source triangle ${sourceIndex} must be selectable`);
    const pin = viewer.pinFromHit(hit);
    assert.equal(pin.sourceFaceIndex, sourceIndex);
    assert.ok(
      new THREE.Vector3().fromArray(pin.position).distanceTo(local) < 0.00001,
    );
    const [region] = viewer.serializeAnnotations([
      { type: "region", faces: { "mesh-0": [hit.faceIndex] } },
    ]);
    assert.equal(region.surfacePatches[0].sourceFaceIndex, sourceIndex);
    assert.equal(
      region.surfacePatches[0].vertices[0][0],
      (sourceIndex * 17) % 40,
    );
  }
  mesh.geometry.disposeBoundsTree();
  mesh.geometry.dispose();
  mesh.material.dispose();
});

test("letter high-water survives deletion and restart, while undo can restore the original identity", (t) => {
  const { dir, store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store, [{ ...pins[0], label: "D" }]);
  draft(store, [], 1);
  const restored = new ReviewStore(dir);
  assert.equal(restored.state.drafts[m1.id].labelCursor, 4);
  draft(restored, [{ ...pins[0], label: "D" }], 2);
  assert.equal(restored.state.drafts[m1.id].labelCursor, 4);
});
test("Agent read and echo are version bound and do not overwrite annotations or release review", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  const submission = store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "echo-test",
  });
  const before = structuredClone(submission.annotations);
  assert.throws(() => store.acknowledgeRead(submission.id, m2.id));
  store.acknowledgeRead(submission.id, m1.id);
  assert.ok(submission.readAt);
  assert.equal(submission.deliveredAt, undefined);
  store.setEcho({
    submissionId: submission.id,
    versionId: m1.id,
    summary: "range",
    annotations: [],
  });
  assert.equal(store.publicState("client-a", m1.id).echo.revision, 1);
  assert.deepEqual(submission.annotations, before);
  assert.deepEqual(store.state.drafts[m1.id].annotations, before);
  assert.ok(store.state.presence[m1.id]);
  assert.throws(() =>
    store.setEcho({
      submissionId: submission.id,
      versionId: m2.id,
      summary: "wrong",
      annotations: [],
    }),
  );
});
test("deleting all previously submitted notes stays an unsubmitted change the Agent still receives", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "old",
  });
  store.submissionStatus("old", "accepted");
  draft(store, [], 1);
  assert.equal(store.hasUnsubmitted(m1.id), true);
  const replacement = store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 2,
    submissionId: "empty-update",
  });
  assert.equal(replacement.annotations.length, 0);
  assert.equal(store.state.submissions[0].annotations.length, 1);
});

test("state.json stops duplicating submission annotations and a reload restores them", (t) => {
  const { dir, store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  const item = store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "submission-one",
  });
  assert.equal(item.annotations.length, pins.length);

  const onDisk = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  );
  assert.equal(onDisk.submissions.length, 1);
  assert.equal(onDisk.submissions[0].id, "submission-one");
  assert.equal(
    Object.hasOwn(onDisk.submissions[0], "annotations"),
    false,
    "state.json still carries a second copy of every annotation",
  );
  assert.deepEqual(
    JSON.parse(
      fs.readFileSync(
        path.join(dir, "submissions", "submission-one.json"),
        "utf8",
      ),
    ).annotations,
    item.annotations,
  );
  assert.deepEqual(
    new ReviewStore(dir).state.submissions[0].annotations,
    item.annotations,
  );
});

test("an upgrade from an inlined state.json keeps every annotation", (t) => {
  const { dir, store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  const item = store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "submission-one",
  });
  // Recreate the pre-upgrade layout: inlined in state.json, no separate file.
  const legacy = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  );
  legacy.submissions[0].annotations = item.annotations;
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(legacy));
  fs.rmSync(path.join(dir, "submissions", "submission-one.json"));
  assert.deepEqual(
    new ReviewStore(dir).state.submissions[0].annotations,
    item.annotations,
  );
});

test("a presence heartbeat keeps liveness in memory without rewriting the history", (t) => {
  const { dir, store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  const file = path.join(dir, "state.json");
  const before = fs.readFileSync(file, "utf8");
  store.state.presence[m1.id].touchedAt = 0;
  store.heartbeat("client-a", m1.id);
  assert.equal(store.state.presence[m1.id].touchedAt > 0, true);
  assert.equal(
    fs.readFileSync(file, "utf8"),
    before,
    "heartbeat wrote to disk",
  );
  // A foreign window still cannot refresh presence it is not recorded under.
  store.state.presence[m1.id].touchedAt = 0;
  store.heartbeat("client-b", m1.id);
  assert.equal(store.state.presence[m1.id].touchedAt, 0);
});

test("viewer receipts stay bounded and never evict a client present on a version", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  store.recordViewerReceipt("client-a", {
    versionId: m1.id,
    sha256: m1.sha256,
    loadedAt: 1,
  });
  for (let i = 0; i < 200; i++)
    store.recordViewerReceipt(`tab-${i}`, {
      versionId: m1.id,
      sha256: m1.sha256,
      loadedAt: 100 + i,
    });
  const receipts = store.state.viewerReceipts;
  assert.equal(Object.keys(receipts).length <= 65, true);
  assert.equal(
    receipts["client-a"]?.loadedAt,
    1,
    "the present tab's receipt was evicted and it can no longer begin",
  );
  assert.equal(receipts["tab-199"].loadedAt, 299);
  assert.equal(receipts["tab-0"], undefined);
});

test("a schema 1 state migrates every draft, lock, echo and queued model", (t) => {
  const { dir } = fixture(t);
  // Exactly the shape 0.5 left behind: one draft, one lock, one echo and a
  // model queued because the reviewer had not finished. Nothing may be lost.
  const legacy = {
    schemaVersion: 1,
    generation: 3,
    active: m1,
    pending: m2,
    lock: { clientId: "old-tab", versionId: m1.id, touchedAt: 1000 },
    draft: {
      versionId: m1.id,
      revision: 4,
      annotations: pins,
      camera: null,
      submittedRevision: null,
      labelCursor: 1,
    },
    echo: { id: "echo-1", submissionId: "s1", versionId: m1.id, revision: 4 },
    submissions: [],
    messages: [],
    startedAt: 1,
  };
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(legacy));
  const store = new ReviewStore(dir);
  assert.equal(store.state.schemaVersion, 2);
  assert.deepEqual(store.state.drafts[m1.id].annotations, pins);
  assert.equal(store.state.presence[m1.id].clientId, "old-tab");
  assert.equal(store.state.echoes[m1.id].id, "echo-1");
  // The queued model was already published; it becomes an ordinary selectable
  // version instead of a slot that only a finished round could release.
  assert.deepEqual(
    store.versions("old-tab").map((v) => v.id),
    [m1.id, m2.id],
  );
  assert.equal(store.state.active.id, m1.id);
  for (const gone of ["draft", "lock", "echo", "pending"])
    assert.equal(Object.hasOwn(store.state, gone), false, gone);
  // Reloading the migrated file must be a no-op, not a second migration.
  const again = new ReviewStore(dir);
  assert.deepEqual(again.state.drafts[m1.id].annotations, pins);
  assert.equal(again.state.schemaVersion, 2);
});

// Two deadlocks in one afternoon came from states nobody had enumerated: a
// round that could not be finished while delivery was down, and a round with
// no owner that no tab could take back. Enumerate them instead of guessing.
test("every reachable review state has an exit and no exit discards an unsubmitted marking", (t) => {
  const presences = ["none", "mine", "other-fresh", "other-stale"];
  const drafts = ["empty", "unsubmitted", "submitted", "closed"];
  const deliveries = ["accepted", "unconfirmed"];
  let checked = 0;
  for (const presence of presences)
    for (const shape of drafts)
      for (const delivery of deliveries) {
        const { dir, store } = fixture(t);
        store.publish(m1);
        let submissionId = null;
        if (shape !== "empty") {
          store.acquire(m1.id, "client-a");
          draft(store);
          if (shape !== "unsubmitted") {
            submissionId = `s-${presence}-${shape}-${delivery}`;
            store.createSubmission({
              versionId: m1.id,
              clientId: "client-a",
              revision: 1,
              submissionId,
            });
            store.submissionStatus(submissionId, delivery);
          }
          if (shape === "closed") store.finish(m1.id, "client-a");
        }
        delete store.state.presence[m1.id];
        if (presence === "mine")
          store.state.presence[m1.id] = {
            clientId: "client-a",
            touchedAt: Date.now(),
          };
        if (presence === "other-fresh")
          store.state.presence[m1.id] = {
            clientId: "client-b",
            touchedAt: Date.now(),
          };
        if (presence === "other-stale")
          store.state.presence[m1.id] = {
            clientId: "client-b",
            touchedAt: Date.now() - 120000,
          };
        const label = `${presence}/${shape}/${delivery}`;
        const before = store.hasUnsubmitted(m1.id)
          ? structuredClone(store.state.drafts[m1.id].annotations)
          : null;

        // 1. A reviewer arriving at this state can always take the round.
        assert.doesNotThrow(
          () => store.acquire(m1.id, "client-a"),
          `${label}: no tab could take this round`,
        );
        assert.equal(
          store.capabilities("client-a", m1.id).canEdit,
          true,
          `${label}: editing was refused`,
        );

        // 2. Finishing always succeeds, whatever delivery did.
        const { sealed } = store.finish(m1.id, "client-a");
        assert.equal(
          store.hasUnsubmitted(m1.id),
          false,
          `${label}: round still unfinished after finishing`,
        );

        // 3. Nothing unsubmitted vanished: it became a batch the Agent gets.
        if (before)
          assert.deepEqual(
            sealed?.annotations,
            before,
            `${label}: an unsubmitted marking was lost`,
          );

        // 4. And the Agent can always move the project forward afterwards.
        assert.doesNotThrow(
          () => store.publish(m2),
          `${label}: the Agent could not publish the next version`,
        );
        assert.equal(store.state.active.id, m2.id, label);
        assert.deepEqual(
          new ReviewStore(dir).state.drafts[m1.id].annotations,
          store.state.drafts[m1.id].annotations,
          `${label}: the marking did not survive a restart`,
        );
        checked++;
      }
  assert.equal(checked, 32);
});

/* Twenty versions is a wall of history in front of the model, and the reviewer
 * asks for a shorter tab strip through the Agent. Before this existed the only
 * way to shorten it was editing state.json from outside, which raced the
 * running server: whoever saved last won, so it appeared to work only after
 * the page had been closed. */
test("retention hides the oldest versions and keeps hiding them as new ones arrive", (t) => {
  const { store } = fixture(t);
  const published = [];
  for (let i = 1; i <= 6; i++) {
    const model = {
      id: `model-${i}`,
      name: "sample",
      version: `v${i}`,
      sha256: String(i).repeat(64),
      publishedAt: 1000 + i,
    };
    store.publish(model);
    published.push(model);
  }
  const shown = () => store.versions("client").map((v) => v.version);
  assert.deepEqual(shown(), ["v1", "v2", "v3", "v4", "v5", "v6"]);

  const result = store.retain(3);
  assert.equal(result.retain, 3);
  assert.deepEqual(shown(), ["v4", "v5", "v6"]);
  assert.deepEqual(
    result.hidden.map((m) => m.version),
    ["v1", "v2", "v3"],
  );

  // A rule, not a one-off tidy-up: the next version pushes the oldest out on
  // its own, which is what "show the latest three" has to keep meaning.
  store.publish({
    id: "model-7",
    name: "sample",
    version: "v7",
    sha256: "7".repeat(64),
    publishedAt: 1007,
  });
  assert.deepEqual(shown(), ["v5", "v6", "v7"]);

  // Nothing was deleted, so asking for more brings them back unchanged.
  store.retain(0);
  assert.deepEqual(shown(), ["v1", "v2", "v3", "v4", "v5", "v6", "v7"]);
});

test("retention never hides what is on screen, being marked, or unsent", (t) => {
  const { store } = fixture(t);
  for (let i = 1; i <= 5; i++)
    store.publish({
      id: `model-${i}`,
      name: "sample",
      version: `v${i}`,
      sha256: String(i).repeat(64),
      publishedAt: 1000 + i,
    });
  // Displayed model is the oldest, and someone is marking the second oldest.
  store.activate("model-1");
  store.state.presence["model-2"] = {
    clientId: "someone",
    touchedAt: Date.now(),
  };
  const result = store.retain(1);
  const shown = store.versions("client").map((v) => v.version);
  assert.ok(shown.includes("v5"), "the newest is always shown");
  assert.ok(shown.includes("v1"), "the displayed version cannot be hidden");
  assert.ok(shown.includes("v2"), "a version being marked cannot be hidden");
  assert.deepEqual(
    result.hidden.map((m) => m.version),
    ["v3", "v4"],
  );
  // The Agent has to be able to say "three, not one, and here is why".
  assert.deepEqual(
    result.keptVisible.map((m) => `${m.version}: ${m.because}`),
    ["v1: on screen", "v2: being marked"],
  );
});

/* A version's id is whatever it was published under, which is a string that
   came off disk or off the wire. The maps holding versions, bindings, drafts,
   presence and echoes are keyed by that string, and a plain `map[key]` consults
   the prototype chain first: `models.constructor` and `models.toString` answer
   with a function, and `models.__proto__` with an object. Every lookup therefore
   asks for a key that is not there and gets a truthy answer that is not a
   version, and what follows dies on `.includes` or `.length`. Publishing under
   such a name used to replace the prototype of the whole map. */
test("version names that collide with Object.prototype are refused rather than borrowed", (t) => {
  const { store } = fixture(t);
  const protoNames = ["constructor", "toString", "__proto__", "valueOf"];
  for (const name of protoNames) {
    const model = {
      id: name,
      name: "sample",
      version: name,
      sha256: "c".repeat(64),
    };
    store.publish(model);
    // It is stored, and it survives a reload as an own property.
    assert.ok(
      Object.hasOwn(store.state.models, name),
      `${name} was not stored`,
    );
    const recovered = new ReviewStore(store.dir);
    assert.ok(
      Object.hasOwn(recovered.state.models, name),
      `${name} did not survive a reload`,
    );
    assert.equal(recovered.versionInBinding(name), true);
    assert.equal(
      recovered.state.models[name].id,
      name,
      `${name} lost its own entry`,
    );
    // The version is real, so activating it succeeds — and what is on screen
    // afterwards is that version, not a function borrowed from the prototype.
    assert.equal(recovered.activate(name).id, name);
  }
  // The prototype of every keyed map is still Object.prototype: nothing was
  // published under `__proto__` changed it.
  for (const map of [
    store.state.models,
    store.state.modelBindings,
    store.state.modelOrigins,
    store.state.drafts,
    store.state.presence,
  ])
    assert.equal(Object.getPrototypeOf(map), Object.prototype);
});

test("a version id the prototype would answer for is not a version", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  for (const name of [
    "constructor",
    "toString",
    "__proto__",
    "hasOwnProperty",
  ]) {
    assert.equal(store.versionInBinding(name), false, name);
    assert.throws(
      () => store.activate(name),
      (error) => error.code === "UNKNOWN_VERSION",
      name,
    );
    assert.equal(
      store.state.active.id,
      m1.id,
      `${name} changed what is on screen`,
    );
  }
});

/* Schema 1 kept one draft, one lock and one pending slot, so a version that had
   been published and then superseded had nowhere to record which conversation
   owned it — it stayed in `models` and was listed nowhere. A migration that only
   bound the active and pending versions left the rest of the history invisible,
   which is the state the version tabs exist to show. */
test("a schema 1 review binds every published version, not just the active one", (t) => {
  const { dir } = fixture(t);
  const legacy = {
    schemaVersion: 1,
    generation: 0,
    models: {
      "model-one": { ...m1, publishedAt: 1000 },
      "model-two": { ...m2, publishedAt: 1001 },
      "model-three": {
        id: "model-three",
        name: "sample",
        version: "v3",
        sha256: "d".repeat(64),
        publishedAt: 1002,
      },
    },
    draft: { versionId: "model-one", annotations: [], camera: null },
    lock: { versionId: "model-one", clientId: "client-a", touchedAt: 1 },
    submissions: [],
    messages: [],
  };
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(legacy));
  const recovered = new ReviewStore(dir);
  assert.equal(recovered.state.schemaVersion, 2);
  assert.deepEqual(
    recovered.versions("client-a").map((v) => v.id),
    ["model-one", "model-two", "model-three"],
    "a superseded version is still listed",
  );
  for (const id of ["model-one", "model-two", "model-three"])
    assert.ok(
      recovered.versionInBinding(id),
      `${id} was not bound to this review`,
    );
});
