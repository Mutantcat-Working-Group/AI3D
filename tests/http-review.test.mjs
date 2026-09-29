import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startReview } from "./helpers/review-server.mjs";

const origin = {
  harness: "openclaw",
  channel: "telegram",
  sessionKey: "test-http-topic-41",
  target: "-100000001",
  accountId: "test",
  threadId: "41",
};
const nextOrigin = {
  ...origin,
  sessionKey: "test-http-topic-42",
  threadId: "42",
};
/* Subdivided, and the pin below lands on a triangle whose two numbers differ.
   Held at one face each, every index in this file was 0 and the review mesh
   was indistinguishable from the source — so a line that printed the wrong one
   of the two read exactly like a line that printed the right one. */
const mesh = {
  id: "mesh-0",
  name: "isolated",
  triangles: 4,
  sourceTriangles: 2,
  surfaceAlgorithm: "midpoint-v3-edge0.07-rationed",
  matrixWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
};
const annotations = [
  {
    id: "pin-http",
    type: "pin",
    label: "A",
    color: "#e76d5c",
    meshId: "mesh-0",
    faceIndex: 3,
    sourceFaceIndex: 1,
    position: [0, 0, 0],
    normal: [0, 1, 0],
    barycentric: [1, 0, 0],
  },
];

test("managed outbox survives Gateway outage and service restart, and cannot redirect a later batch across /new", async (t) => {
  const frozen = { ...origin, sessionId: "fixture-generation" };
  const f = await startReview(t, { origin: frozen, managed: true });
  const model = await f.publish();
  const owner = { versionId: model.id, clientId: "outbox-owner" };
  assert.equal(
    (
      await f.api("ready", {
        method: "POST",
        body: { ...owner, sha256: model.sha256, meshes: [mesh] },
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.api("review/begin", { method: "POST", body: owner })).status,
    200,
  );
  const draft = await f.api("draft", {
    method: "PUT",
    body: { ...owner, revision: 0, annotations, camera: null },
  });
  const log = path.join(f.dir, "fake-gateway.json");
  fs.writeFileSync(
    log,
    JSON.stringify({ calls: [], messages: [], offline: true }),
  );
  const submitted = {
    ...owner,
    revision: draft.body.revision,
    submissionId: "outbox-batch-one",
  };
  assert.equal(
    (await f.api("feedback", { method: "POST", body: submitted })).status,
    502,
  );
  const failed = (await f.ipc("/submissions/outbox-batch-one")).body;
  assert.equal(failed.status, "unconfirmed");
  // The reason the host gave is the only thing that makes a stuck outbox
  // diagnosable, and it used to exist solely as a log line. Whatever shape the
  // failure took, it reaches the batch as a code and a sentence.
  assert.ok(failed.lastError?.code, "a failed batch must record why");
  assert.ok(failed.lastError.message);
  // execFile names the whole command in its message, and for chat.send that
  // includes the annotation text. server.log outlives the review and is not
  // access controlled, so the payload must not survive into any record of the
  // failure.
  for (const text of [failed.lastError.message, failed.error])
    for (const secret of ["--params", "審閱標記提交", "chat.send"])
      assert.equal(
        String(text).includes(secret),
        false,
        `delivery failures must not carry ${secret}`,
      );
  const payload = (item) =>
    Object.fromEntries(
      [
        "id",
        "versionId",
        "revision",
        "createdAt",
        "reviewId",
        "bindingId",
        "origin",
        "model",
        "annotations",
        "camera",
        "meshManifest",
      ].map((key) => [key, item[key]]),
    );
  const immutable = payload(
    JSON.parse(
      fs.readFileSync(
        path.join(f.dir, "submissions/outbox-batch-one.json"),
        "utf8",
      ),
    ),
  );
  await f.restart();
  const gateway = JSON.parse(fs.readFileSync(log, "utf8"));
  gateway.offline = false;
  fs.writeFileSync(log, JSON.stringify(gateway));
  let batch;
  for (let i = 0; i < 40; i++) {
    batch = (await f.ipc("/submissions/outbox-batch-one")).body;
    if (batch.status === "accepted") break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(batch.status, "accepted");
  /* Status is a poll; what it carries it carries on every call. The parts list
     belongs to the batch that explains it -- one entry for this fixture, 128
     and 32 kB for a STEP assembly, times the twenty submissions status keeps.
     Asserted as presence rather than size so a one-mesh fixture cannot hide a
     regression: the read route must still have it, status must not. */
  assert.ok(
    batch.meshManifest?.meshes?.length,
    "reading one batch still describes the parts it was marked on",
  );
  const polled = (await f.ipc("/status")).body;
  assert.ok(polled.submissions.length, "the accepted batch is listed");
  for (const listed of polled.submissions)
    assert.equal(
      listed.meshManifest,
      undefined,
      "but listing submissions does not repeat the parts list",
    );
  // Unsent marks: that there are some is the Agent's business, what they are
  // is not until the reviewer sends them.
  assert.equal(polled.draft.annotations, undefined);
  assert.equal(typeof polled.draft.annotationCount, "number");
  assert.deepEqual(
    payload(
      JSON.parse(
        fs.readFileSync(
          path.join(f.dir, "submissions/outbox-batch-one.json"),
          "utf8",
        ),
      ),
    ),
    immutable,
  );
  assert.equal(
    (await f.api("feedback", { method: "POST", body: submitted })).status,
    200,
  );
  let state = JSON.parse(fs.readFileSync(log, "utf8"));
  assert.equal(state.calls.filter((c) => c.method === "chat.send").length, 1);
  const send = state.calls.find((c) => c.method === "chat.send").params;
  assert.equal(send.sessionId, "fixture-generation");
  assert.equal(send.sessionKey, frozen.sessionKey);
  assert.equal(send.originatingThreadId, undefined);
  assert.equal(send.queueMode, "collect");
  state.sessions = { [frozen.sessionKey]: "unrelated-new-task" };
  fs.writeFileSync(log, JSON.stringify(state));
  const changed = await f.api("draft", {
    method: "PUT",
    body: {
      ...owner,
      revision: draft.body.revision,
      annotations,
      camera: null,
    },
  });
  assert.equal(
    (
      await f.api("feedback", {
        method: "POST",
        body: {
          ...owner,
          revision: changed.body.revision,
          submissionId: "outbox-batch-two",
        },
      })
    ).status,
    502,
  );
  assert.equal(
    (await f.ipc("/submissions/outbox-batch-two")).body.origin.sessionId,
    "fixture-generation",
  );
  assert.equal(
    JSON.parse(fs.readFileSync(log, "utf8")).calls.filter(
      (c) => c.method === "chat.send",
    ).length,
    1,
  );
  fs.writeFileSync(path.join(f.dir, "disabled.json"), "{}");
  assert.equal((await f.api("draft", { method: "PUT", body: {} })).status, 503);
});

test(
  "explicit real LAN listener requires authorization even when the test-only access override is off",
  { skip: !process.env.REVIEW_TEST_LAN_HOST },
  async (t) => {
    const f = await startReview(t, {
      origin,
      host: process.env.REVIEW_TEST_LAN_HOST,
    });
    const model = await f.publish();
    const status = (await f.ipc("/status")).body;
    assert.equal(status.network.lan, true);
    assert.equal(status.access.required, true);
    // Derived from the package manifest, not restated: a second copy here
    // would keep passing while a shipped bundle advertised a different number.
    assert.equal(
      (await f.api("health")).body.version,
      JSON.parse(fs.readFileSync("package.json", "utf8")).version,
    );
    assert.equal((await f.api(`models/${model.filename}`)).status, 401);
    const cookie = await grant(f);
    assert.equal(
      (await f.api(`models/${model.filename}`, { cookie })).status,
      200,
    );
    await createFeedback(f, model, "lan-owner", cookie);
  },
);

async function grant(f) {
  const issued = await f.ipc("/access/issue", {});
  assert.equal(issued.status, 200);
  const redeemed = await f.api("access/exchange", {
    method: "POST",
    body: { grant: issued.body.value },
  });
  assert.equal(redeemed.status, 200);
  const cookie = redeemed.headers.get("set-cookie").split(";")[0];
  assert.equal(redeemed.headers.get("set-cookie").includes("HttpOnly"), true);
  return cookie;
}

test("host-admitted TCP peer collects one HttpOnly session without URL or body credentials; spoofed peers and cross-origin claims fail", async (t) => {
  const f = await startReview(t, { origin, protectedAccess: true });
  assert.equal(
    (await f.ipc("/access/admit", { address: "127.0.0.1" })).status,
    409,
  );
  const model = await f.publish();
  assert.equal(
    (await f.ipc("/access/admit", { address: "8.8.8.8" })).status,
    400,
  );
  assert.equal(
    (
      await f.api("access/admit", {
        method: "POST",
        body: { address: "127.0.0.1" },
      })
    ).status,
    401,
  );
  assert.equal(
    (await f.ipc("/access/admit", { address: "192.168.1.22" })).status,
    200,
  );
  assert.equal(
    (
      await f.api("access/claim", {
        method: "POST",
        body: {},
        headers: {
          "X-Forwarded-For": "192.168.1.22",
          "X-Real-IP": "192.168.1.22",
          Forwarded: "for=192.168.1.22",
        },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await f.api("access/claim", {
        method: "POST",
        body: { address: "192.168.1.22" },
      })
    ).status,
    400,
  );
  const issued = await f.ipc("/access/admit", { address: "127.0.0.1" });
  assert.equal(issued.status, 200);
  assert.deepEqual(Object.keys(issued.body).sort(), [
    "address",
    "expiresAt",
    "singleUse",
  ]);
  for (const headers of [
    { Origin: "http://evil.invalid" },
    { "Sec-Fetch-Site": "cross-site" },
    { "X-Review-Client": "" },
  ])
    assert.equal(
      (await f.api("access/claim", { method: "POST", body: {}, headers }))
        .status,
      403,
    );
  for (const route of ["access/claim/", "ACCESS/claim"])
    assert.equal(
      (await f.api(route, { method: "POST", body: {} })).status,
      401,
    );
  assert.equal((await f.api("access/claim")).status, 401);
  const claimed = await f.api("access/claim", {
    method: "POST",
    body: {},
    headers: { Origin: f.url },
  });
  assert.equal(claimed.status, 200);
  assert.deepEqual(Object.keys(claimed.body).sort(), [
    "authorized",
    "expiresAt",
  ]);
  assert.equal(claimed.headers.get("cache-control"), "no-store");
  const header = claimed.headers.get("set-cookie");
  assert.equal(
    header.includes("HttpOnly") && header.includes("SameSite=Strict"),
    true,
  );
  const cookie = header.split(";")[0];
  assert.equal(
    (await f.api("access/claim", { method: "POST", body: {} })).status,
    401,
  );
  const retained = await f.api("access/claim", {
    method: "POST",
    body: {},
    cookie,
  });
  assert.equal(retained.status, 200);
  assert.equal(retained.body.expiresAt, claimed.body.expiresAt);
  assert.equal(
    retained.headers.get("set-cookie").split(";")[0] === cookie,
    true,
  );
  assert.equal((await f.api(`models/${model.filename}`)).status, 401);
  assert.equal(
    (await f.api(`models/${model.filename}`, { cookie })).status,
    200,
  );
  assert.equal((await f.ipc("/status")).body.access.sessions, 1);
  await createFeedback(f, model, "address-owner", cookie);
  const calls = JSON.parse(
    fs.readFileSync(path.join(f.dir, "fake-gateway.json"), "utf8"),
  ).calls;
  const message = calls.find((call) => call.method === "chat.send").params
    .message;
  assert.equal(message.includes(`REVIEW_DATA_DIR='${f.dir}'`), true);
});
async function createFeedback(f, model, clientId, cookie) {
  const owner = { versionId: model.id, clientId };
  assert.equal(
    (
      await f.api("ready", {
        method: "POST",
        cookie,
        body: { ...owner, sha256: model.sha256, meshes: [mesh] },
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.api("review/begin", { method: "POST", cookie, body: owner }))
      .status,
    200,
  );
  const saved = await f.api("draft", {
    method: "PUT",
    cookie,
    body: { ...owner, revision: 0, annotations, camera: null },
  });
  assert.equal(saved.status, 200);
  const body = {
    ...owner,
    revision: saved.body.revision,
    submissionId: "http-submission",
  };
  const result = await f.api("feedback", { method: "POST", cookie, body });
  assert.equal(result.status, 200);
  return { body, result };
}

test("remembered browser survives a real process restart; only activity renews it and targeted revocation preserves another browser", async (t) => {
  const f = await startReview(t, { origin, protectedAccess: true });
  const model = await f.publish();
  const cookie = await grant(f);
  await createFeedback(f, model, "persisted-owner", cookie);
  const before = (await f.ipc("/status")).body;
  const original = before.access.browsers[0];
  const poll = await f.api("state?clientId=persisted-owner", { cookie });
  assert.equal(poll.status, 200);
  assert.equal(poll.headers.has("set-cookie"), false);
  await f.api("review/heartbeat", {
    method: "POST",
    cookie,
    body: { clientId: "persisted-owner" },
  });
  assert.equal(
    (await f.ipc("/status")).body.access.browsers[0].lastUsedAt,
    original.lastUsedAt,
  );
  const activity = await f.api("access/activity", {
    method: "POST",
    cookie,
    body: { clientId: "persisted-owner" },
  });
  assert.equal(activity.status, 200);
  const maxAge = Number(
    activity.headers.get("set-cookie").match(/Max-Age=(\d+)/)[1],
  );
  assert.ok(maxAge >= 30 * 86400 - 5 && maxAge <= 30 * 86400);
  const active = (await f.ipc("/status")).body.access.browsers[0];
  assert.ok(active.lastUsedAt > original.lastUsedAt);
  assert.equal(active.expiresAt - active.lastUsedAt, 30 * 86_400_000);
  await f.ipc("/access/admit", { address: "192.168.1.23" });
  await f.restart();
  const restored = await f.api("state?clientId=persisted-owner", { cookie });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.owned, true);
  // "locked" now reports another tab being present, not that a round exists.
  assert.equal(restored.body.locked, false);
  assert.equal(restored.body.reviewId, before.reviewId);
  assert.equal(restored.body.draft.revision, before.draft.revision);
  const status = (await f.ipc("/status")).body;
  assert.deepEqual(status.access.browsers[0], active);
  assert.equal(status.access.grantActive, false);
  const secondCookie = await grant(f);
  assert.equal(
    (await f.ipc("/access/revoke", { browserId: active.id })).status,
    200,
  );
  assert.equal((await f.api("state", { cookie })).status, 401);
  assert.equal((await f.api("state", { cookie: secondCookie })).status, 200);
  await f.restart();
  assert.equal((await f.api("state", { cookie })).status, 401);
  assert.equal((await f.api("state", { cookie: secondCookie })).status, 200);
  assert.equal((await f.ipc("/status")).body.locked, true);
});

test("real HTTP submission preserves explicit topic route and does not route old retries to a newly bound topic", async (t) => {
  const f = await startReview(t, { origin });
  const model = await f.publish();
  const { body, result } = await createFeedback(f, model, "client-http");
  assert.equal(result.body.status, "accepted");
  assert.equal(!!result.body.deliveredAt, true);
  assert.equal(result.body.readAt, undefined);
  const log = () =>
    JSON.parse(fs.readFileSync(path.join(f.dir, "fake-gateway.json"), "utf8"));
  const send = log().calls.find((c) => c.method === "chat.send").params;
  assert.equal(send.deliver, true);
  /* The number in the message and the number `read` answers with have to be
     the same one, and it has to say which mesh it counts in. They were the
     review triangle and the source triangle respectively, both printed as
     "face N": two integers for one pin, and nothing on either saying so. */
  assert.match(send.message, /A: pin on mesh-0, source face 1\b/);
  assert.equal(send.message.includes("face 3"), false);
  // The batch's own sessionKey is the whole route; naming the destination
  // explicitly is an admin-scoped override the real Gateway refuses.
  assert.equal(send.sessionKey, origin.sessionKey);
  assert.notEqual(origin.sessionKey, nextOrigin.sessionKey);
  for (const key of [
    "originatingChannel",
    "originatingTo",
    "originatingAccountId",
    "originatingThreadId",
  ])
    assert.equal(send[key], undefined, `${key} must not be sent`);
  assert.equal(send.message.includes("不要發 Telegram"), false);
  assert.equal((await f.ipc("/origin", { origin: nextOrigin })).status, 423);
  assert.equal(
    (
      await f.api("review/finish", {
        method: "POST",
        body: { versionId: model.id, clientId: body.clientId },
      })
    ).status,
    200,
  );
  assert.equal((await f.ipc("/origin", { origin: nextOrigin })).status, 200);
  assert.equal((await f.api("feedback", { method: "POST", body })).status, 200);
  assert.equal(log().calls.filter((c) => c.method === "chat.send").length, 1);
  const old = await f.ipc(`/submissions/${body.submissionId}`);
  assert.equal(old.body.origin.route.threadId, "41");
});

test("HTTP authorization protects models and writes, enforces client ownership, and expires on origin change", async (t) => {
  const f = await startReview(t, { origin, protectedAccess: true });
  const model = await f.publish();
  for (const route of [
    "state?full=1",
    `models/${model.filename}`,
    `download/${model.filename}`,
    "submissions/missing",
  ])
    assert.equal((await f.api(route)).status, 401);
  assert.equal((await f.api("draft", { method: "PUT", body: {} })).status, 401);
  assert.equal((await f.api("health")).status, 200);
  // Express must not match a different casing/slash form behind path guards.
  for (const route of ["State?full=1", "../API/state?full=1"])
    assert.equal((await f.api(route)).body?.active, undefined);
  const cookie = await grant(f);
  const data = await f.api(`models/${model.filename}`, { cookie });
  assert.equal(data.status, 200);
  assert.equal(data.headers.get("cache-control"), "private, no-store");
  assert.equal(
    (await f.api("state", { cookie, headers: { Host: "untrusted.test" } }))
      .status,
    421,
  );
  assert.equal(
    (
      await f.api("review/heartbeat", {
        cookie,
        method: "POST",
        body: { clientId: "test-client" },
        headers: { Origin: "http://untrusted.test" },
      })
    ).status,
    403,
  );
  const { body } = await createFeedback(f, model, "client-owner", cookie);
  const otherCookie = await grant(f);
  assert.equal(
    (
      await f.api("review/heartbeat", {
        cookie: otherCookie,
        method: "POST",
        body: { clientId: body.clientId },
      })
    ).status,
    403,
  );
  assert.equal(
    (await f.api(`state?clientId=${body.clientId}`, { cookie: otherCookie }))
      .body.owned,
    false,
  );
  assert.equal(
    (
      await f.api("review/heartbeat", {
        cookie,
        method: "POST",
        body: { clientId: body.clientId },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.api("review/finish", {
        cookie,
        method: "POST",
        body: { versionId: model.id, clientId: body.clientId },
      })
    ).status,
    200,
  );
  assert.equal((await f.ipc("/origin", { origin: nextOrigin })).status, 200);
  assert.equal((await f.api("state", { cookie })).status, 401);
  const newCookie = await grant(f);
  assert.equal(
    (await f.api(`submissions/${body.submissionId}`, { cookie: newCookie }))
      .status,
    404,
  );
  assert.equal(
    (await f.api("feedback", { cookie: newCookie, method: "POST", body }))
      .status,
    403,
  );
  for (const route of ["feedback/", "Feedback"])
    assert.equal(
      (await f.api(route, { cookie: newCookie, method: "POST", body })).status,
      404,
    );
  for (const route of [
    `Submissions/${body.submissionId}`,
    `submissions/${body.submissionId}/`,
  ])
    assert.equal(
      (await f.api(route, { cookie: newCookie })).body?.annotations,
      undefined,
    );
  assert.equal(
    (
      await f.ipc("/read", {
        submissionId: body.submissionId,
        versionId: model.id,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.ipc("/echo", {
        submissionId: body.submissionId,
        versionId: model.id,
        summary: "stale prior-topic echo",
        annotations: [],
      })
    ).status,
    404,
  );
  assert.equal(
    (await f.api("state?full=1", { cookie: newCookie })).body.draft.annotations
      .length,
    0,
  );
  assert.equal(
    (await f.api("state?full=1", { cookie: newCookie })).body.draft
      .submittedRevision,
    null,
  );
});

test("a crash-truncated instance lock does not permanently block startup, and a live one still does", async (t) => {
  const f = await startReview(t);
  const model = await f.publish();
  const lock = path.join(f.dir, "instance.lock");
  const live = JSON.parse(fs.readFileSync(lock, "utf8"));
  assert.equal(live.pid > 0, true);

  // A second process must still refuse while the first one is running.
  assert.throws(
    () => fs.writeFileSync(lock, "{}", { flag: "wx" }),
    { code: "EEXIST" },
    "the live lock is not exclusive",
  );

  // Crashing between creating and filling the lock used to leave a zero-byte
  // file that made every later start throw before any handler could run.
  await f.restart(() => fs.writeFileSync(lock, ""));
  const health = (await f.api("health")).body;
  assert.equal(health.ok, true);
  assert.equal(health.pid !== live.pid, true);
  assert.equal(JSON.parse(fs.readFileSync(lock, "utf8")).pid, health.pid);
  // Recovery must not have disturbed the review the service was holding.
  assert.equal((await f.api("state")).body.active.id, model.id);
});

// An outbox that retries forever is the right design: the failure that stalled
// a real round was fixed in code and the queue healed itself on the next pass.
// What it must never do is retry in silence, which is how a broken delivery
// went unnoticed for eight hours and a hundred and thirty attempts.
test("a repeatedly refused batch says so in its own status and recovers cleanly", async (t) => {
  const frozen = { ...origin, sessionId: "fixture-generation" };
  const f = await startReview(t, {
    origin: frozen,
    managed: true,
    stallAfter: 2,
  });
  const model = await f.publish();
  const owner = { versionId: model.id, clientId: "stall-owner" };
  await f.api("ready", {
    method: "POST",
    body: { ...owner, sha256: model.sha256, meshes: [mesh] },
  });
  await f.api("review/begin", { method: "POST", body: owner });
  const draft = await f.api("draft", {
    method: "PUT",
    body: { ...owner, revision: 0, annotations, camera: null },
  });
  const log = path.join(f.dir, "fake-gateway.json");
  fs.writeFileSync(
    log,
    JSON.stringify({ calls: [], messages: [], offline: true }),
  );
  assert.equal(
    (
      await f.api("feedback", {
        method: "POST",
        body: {
          ...owner,
          revision: draft.body.revision,
          submissionId: "stalling-batch",
        },
      })
    ).status,
    502,
  );
  let batch;
  for (let i = 0; i < 40; i++) {
    batch = (await f.ipc("/submissions/stalling-batch")).body;
    if (batch.status === "stalled") break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(batch.status, "stalled");
  assert.ok(batch.stalledAt);
  assert.ok(batch.attempts >= 2);
  // The Agent's own view has to carry it too: the channel that would report the
  // failure in words is exactly the channel that is failing.
  const stuck = (await f.ipc("/status")).body.outbox;
  assert.equal(stuck.pending, 1);
  assert.equal(stuck.stalled, 1);
  assert.ok(stuck.lastError?.code);
  // Stalled is a description, not a stop: the queue keeps trying, and a batch
  // that gets through stops claiming a failure it no longer has.
  const gateway = JSON.parse(fs.readFileSync(log, "utf8"));
  gateway.offline = false;
  fs.writeFileSync(log, JSON.stringify(gateway));
  for (let i = 0; i < 40; i++) {
    batch = (await f.ipc("/submissions/stalling-batch")).body;
    if (batch.status === "accepted") break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(batch.status, "accepted");
  assert.equal(batch.lastError, null);
  assert.equal(batch.stalledAt, null);
  assert.equal((await f.ipc("/status")).body.outbox.pending, 0);
});

test("a host with nowhere to push holds the batch for collection instead of failing to deliver", async (t) => {
  // An owner with no route: the shape a harness reached over a tool protocol
  // has. Before the split this could not even be expressed.
  const f = await startReview(t, {
    origin: { harness: "codex", sessionKey: "a-codex-run" },
  });
  assert.deepEqual((await f.ipc("/status")).body.notifier, {
    send: false,
    observe: false,
  });
  const model = await f.publish();
  const owner = { versionId: model.id, clientId: "client-collect" };
  await f.api("ready", {
    method: "POST",
    body: { ...owner, sha256: model.sha256, meshes: [mesh] },
  });
  await f.api("review/begin", { method: "POST", body: owner });
  const draft = await f.api("draft", {
    method: "PUT",
    body: { ...owner, revision: 0, annotations, camera: null },
  });
  const sent = await f.api("feedback", {
    method: "POST",
    body: {
      ...owner,
      revision: draft.body.revision,
      submissionId: "collected-batch",
    },
  });
  assert.equal(sent.status, 200);

  const held = (await f.ipc("/submissions/collected-batch")).body;
  // Waiting, not failing: no attempt was made, so nothing counts towards the
  // stall mark and the page has no reason to raise an alarm.
  assert.equal(held.status, "waiting");
  assert.ok(!held.attempts);
  assert.equal(held.lastError, null);
  assert.equal(held.stalledAt, null);

  // And nothing was pushed anywhere. The fake Gateway writes its log the first
  // time it is invoked, so its absence is the strongest available statement
  // that the host was never reached for.
  assert.equal(fs.existsSync(path.join(f.dir, "fake-gateway.json")), false);

  // The batch is still collectable, which is the whole point of holding it.
  const read = await f.ipc("/submissions/collected-batch");
  assert.equal(read.body.annotations.length, annotations.length);
});

test("chat API returns unavailable when no origin is configured", async (t) => {
  const f = await startReview(t, {});
  const res = await f.api("chat");
  assert.equal(res.status, 200);
  assert.equal(res.body.connected, false);
  assert.equal(res.body.busy, false);
  assert.deepEqual(res.body.messages, []);

  const send = await f.api("chat", {
    method: "POST",
    body: { message: "hello" },
  });
  assert.equal(send.status, 409);
  assert.equal(send.body.code, "CHAT_UNAVAILABLE");
});

test("MCP connections API lifecycle", async (t) => {
  const f = await startReview(t, { origin });

  const empty = await f.api("mcp/connections");
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.connections, []);

  const created = await f.api("mcp/connections", {
    method: "POST",
    body: { name: "test-server", command: "npx", args: ["-y", "some-server"] },
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.connection.name, "test-server");
  assert.equal(created.body.connection.command, "npx");
  assert.deepEqual(created.body.connection.args, ["-y", "some-server"]);

  const listed = await f.api("mcp/connections");
  assert.equal(listed.body.connections.length, 1);
  assert.equal(listed.body.connections[0].id, created.body.connection.id);
  assert.equal(listed.body.connections[0].connected, false);

  const removed = await f.api("mcp/connections/remove", {
    method: "POST",
    body: { id: created.body.connection.id },
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.removed, created.body.connection.id);

  const after = await f.api("mcp/connections");
  assert.deepEqual(after.body.connections, []);
});
