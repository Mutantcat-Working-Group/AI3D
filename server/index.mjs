import express from "express";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ReviewStore, ReviewError, atomicJson } from "./store.mjs";
import { log, errorDetail } from "./log.mjs";
import { claimLock, readLock, releaseLock, processAlive } from "./lockfile.mjs";
import { importModel, MAX_TRIANGLES } from "./models.mjs";
import { MAX_ROUND_BYTES, MARK_WHOLE_FACE_BYTES } from "./budget.mjs";
import { notifierFor, notifierSummary } from "./notify.mjs";
import { McpConnections } from "./mcp-client.mjs";
import { ChatConfig, MAX_PROVIDERS } from "./chat-config.mjs";
import {
  listModels,
  chatCompletion,
  SYSTEM_PROMPT,
  CHAT_TIMEOUT_MS,
} from "./chat.mjs";
import { IdleWatch, viewerUse, agentUse, idleMsFrom } from "./idle.mjs";
import { originInput, normalizeOrigin } from "./origin.mjs";
import { listenerConfig, privateIPv4 } from "./network.mjs";
import { createUpdateWatch, updateCheckEnabled } from "./upstream.mjs";
import {
  readInstance,
  instanceCookieName,
  agentSocketPath,
  prepareSocketDirectory,
  isNamedPipePath,
  INTEGRATION_API,
} from "./instance.mjs";
import {
  ReviewAccess,
  AccessError,
  sessionCookie as parseSessionCookie,
  accessCookie as formatAccessCookie,
  browserInfo,
} from "./access.mjs";
import {
  searchKnowledge,
  getKnowledge,
  listKnowledge,
} from "../mcp/knowledge.mjs";

export const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
/* Where models may be published from, where state lives, and where published
   models are kept. The first and last used to default to two directories above
   the clone -- which is where this repository happens to sit inside an
   OpenClaw workspace -- so a clone anywhere else died on EACCES at `/media` on
   its first `npm run samples`, or grew a `media/` folder in its owner's home.
   A managed instance is always handed all three (integration/manager.mjs), so
   these defaults serve a clone run by hand, and keep it inside itself. */
export const workspace = fs.realpathSync(
  path.resolve(process.env.REVIEW_WORKSPACE || repo),
);
const runtime = path.resolve(
  process.env.REVIEW_DATA_DIR || path.join(repo, "runtime"),
);
const mediaDir = path.resolve(
  process.env.REVIEW_MEDIA_DIR || path.join(runtime, "models"),
);
// The agent socket lives in here and carries no credential of its own: opening
// the file is the whole of the authorization, so the directory's mode is what
// stands between another local account and publish, retain and revoke. The
// socket is chmod 0600, but only in the listen callback — for the moment
// between creating it and that call it wears whatever the umask allows, and a
// directory nobody else may enter is what makes that moment unreachable. The
// managed path already builds its parents 0700; this is the standalone one,
// where without a mode the answer came from whoever happened to run it.
fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
const instanceFile = path.join(runtime, "instance.lock");
if (fs.existsSync(instanceFile)) {
  const previous = readLock(instanceFile);
  if (processAlive(previous?.pid))
    throw new Error(
      "This review service is already running; do not start a second one.",
    );
  if (!previous)
    log.warn("service", "discarding an unreadable instance lock", {
      file: instanceFile,
    });
  fs.unlinkSync(instanceFile);
}
try {
  claimLock(instanceFile, { startedAt: Date.now() });
} catch (error) {
  if (error.code === "EEXIST")
    throw new Error(
      "This review service is already running; do not start a second one.",
    );
  throw error;
}
process.on("exit", () => releaseLock(instanceFile));
const configFile = path.join(runtime, "config.json");
const config = fs.existsSync(configFile)
  ? JSON.parse(fs.readFileSync(configFile, "utf8"))
  : {};
const instance = readInstance(config);
// Every instance reclaims itself, managed or not: the longest-lived process
// this was written for was an unmanaged one that had been listening for most of
// four days. Zero is the only way to opt out.
const idleMs = idleMsFrom(process.env.REVIEW_IDLE_HOURS ?? config.idleHours);
const idleTickMs = Math.max(
  1000,
  Number(process.env.REVIEW_IDLE_TICK_MS) || 60_000,
);
const idle = idleMs > 0 ? new IdleWatch({ idleMs }) : null;
const idleReport = () => (idle ? idle.report(Date.now(), idleTickMs) : null);
let maintenanceUntil = 0;
const managedEnabled = () =>
  !config.managed ||
  (Date.now() >= maintenanceUntil &&
    !fs.existsSync(path.join(runtime, "disabled.json")) &&
    (!config.installRoot ||
      fs.existsSync(path.join(config.installRoot, "openclaw.plugin.json"))));
const cookieName = instanceCookieName(instance);
function sessionCookie(headers) {
  const scoped = parseSessionCookie(headers, cookieName);
  if (scoped || !instance || config.legacyCookieMigration !== true)
    return scoped;
  if (
    (headers.cookie || "")
      .split(";")
      .some((x) => x.trim().startsWith(`${cookieName}=`))
  )
    return null;
  const legacy = parseSessionCookie(headers);
  if (!legacy) return null;
  // Migration is opt-in and can only exchange a verifier owned by this runtime.
  try {
    access.authenticate(legacy);
    return legacy;
  } catch {
    return null;
  }
}
function accessCookie(value, maxAge) {
  return formatAccessCookie(value, maxAge, cookieName);
}
const legacyOrigin = normalizeOrigin(
  process.env.REVIEW_SESSION_KEY || config.origin || config.sessionKey || null,
);
const store = new ReviewStore(runtime, { legacyOrigin });
const notifiers = new Map();
// Cached because OpenClawBridge holds a conversation window between calls, and
// null is cached for the same reason a notifier is: asking twice whether a host
// can be pushed to should not depend on how often something asks.
function notifierCached(origin) {
  const key = JSON.stringify(origin ?? null);
  if (!notifiers.has(key)) {
    if (notifiers.size >= 32) notifiers.delete(notifiers.keys().next().value);
    notifiers.set(
      key,
      notifierFor(origin, { enabled: process.env.REVIEW_BRIDGE !== "off" }),
    );
  }
  return notifiers.get(key);
}
const network = listenerConfig(
  process.env.REVIEW_HOST || config.host || "127.0.0.1",
);
const accessRequired = network.lan || process.env.REVIEW_ACCESS === "required";
const access = new ReviewAccess({
  scope: () => store.state.bindingId,
  file: accessRequired ? path.join(runtime, "browser-access.json") : null,
  protectedClients: () =>
    Object.values(store.state.presence).map((p) => p.clientId),
});
function rememberUse(req, res) {
  if (!accessRequired) return;
  const value = sessionCookie(req.headers);
  const browser = access.touch(
    value,
    browserInfo(req.headers, req.socket.remoteAddress),
  );
  res.setHeader(
    "Set-Cookie",
    accessCookie(value, browser.expiresAt - Date.now()),
  );
}
const allowedHosts = new Set([
  network.host,
  "localhost",
  "127.0.0.1",
  ...(config.allowedHosts || []),
  ...(process.env.REVIEW_ALLOWED_HOSTS || "").split(",").filter(Boolean),
]);
const app = express();
app.disable("x-powered-by");
// Keep route matching identical to the authorization boundary below.
app.set("case sensitive routing", true);
app.set("strict routing", true);
app.use((req, res, next) => {
  if (!["GET", "HEAD"].includes(req.method) && !managedEnabled())
    return res.status(503).json({
      error:
        "The AI3D extension is disabled; drafts are kept, continue from the originating conversation.",
      code: "INTEGRATION_DISABLED",
    });
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  let hostname;
  try {
    hostname = new URL(`http://${req.headers.host}`).hostname;
  } catch {
    /* rejected below */
  }
  if (!allowedHosts.has(hostname))
    throw new AccessError("Use the verified workbench entry.", 421, "BAD_HOST");
  if (
    !["GET", "HEAD"].includes(req.method) &&
    ((req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}`) ||
      req.headers["sec-fetch-site"] === "cross-site")
  )
    throw new AccessError(
      "This request did not come from the current workbench.",
      403,
      "BAD_ORIGIN",
    );
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers["x-review-client"] !== "1"
  )
    return res.status(403).json({ error: "Use the review workbench." });
  next();
});
app.use(express.json({ limit: "16mb" }));
app.use((req, res, next) => {
  if (idle && viewerUse(req.method, req.path)) idle.use();
  next();
});
app.post("/api/access/claim", (req, res) => {
  if (!accessRequired)
    throw new AccessError("This entry does not use remote authorization.", 409);
  z.object({}).strict().parse(req.body);
  // Never use req.ip, forwarded headers or a browser-supplied address here.
  const session = access.claimAddress(
    req.socket.remoteAddress,
    sessionCookie(req.headers),
    browserInfo(req.headers, req.socket.remoteAddress),
  );
  res.setHeader(
    "Set-Cookie",
    accessCookie(session.value, session.expiresAt - Date.now()),
  );
  res.json({ authorized: true, expiresAt: session.expiresAt });
});
app.post("/api/access/exchange", (req, res) => {
  if (!accessRequired)
    throw new AccessError("This entry does not use remote authorization.", 409);
  const p = z
    .object({ grant: z.string().max(128) })
    .strict()
    .parse(req.body);
  const session = access.redeem(
    p.grant,
    sessionCookie(req.headers),
    browserInfo(req.headers, req.socket.remoteAddress),
  );
  res.setHeader(
    "Set-Cookie",
    accessCookie(session.value, session.expiresAt - Date.now()),
  );
  res.json({ authorized: true, expiresAt: session.expiresAt });
});
app.use((req, res, next) => {
  if (
    !accessRequired ||
    !req.path.startsWith("/api/") ||
    req.path === "/api/health"
  )
    return next();
  req.reviewAccess = access.authenticate(sessionCookie(req.headers));
  if (!["GET", "HEAD"].includes(req.method) && req.body?.clientId !== undefined)
    access.claimClient(req.reviewAccess, req.body.clientId);
  if (
    req.method === "GET" &&
    req.path === "/api/state" &&
    !access.ownsClient(req.reviewAccess, req.query.clientId)
  )
    req.reviewClientId = "";
  else req.reviewClientId = String(req.query.clientId || "");
  if (
    req.path.startsWith("/api/models/") ||
    req.path.startsWith("/api/download/")
  ) {
    const filename = req.path.split("/").pop();
    if (!store.modelInBinding(filename))
      throw new AccessError(
        "No model of this review round was found.",
        404,
        "NOT_FOUND",
      );
  }
  if (req.path.startsWith("/api/submissions/")) {
    const item = store.state.submissions.find(
      (s) => s.id === req.path.split("/").pop(),
    );
    if (!item || !store.submissionInBinding(item))
      throw new AccessError(
        "No submission of this round was found.",
        404,
        "NOT_FOUND",
      );
  }
  if (req.path === "/api/feedback") {
    const item = store.state.submissions.find(
      (s) => s.id === req.body?.submissionId,
    );
    if (item && !store.submissionInBinding(item))
      throw new AccessError(
        "That submission does not belong to this review round.",
        403,
        "WRONG_REVIEW",
      );
  }
  next();
});
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const vec3 = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const annotation = z.discriminatedUnion("type", [
  z
    .object({
      id,
      type: z.literal("pin"),
      label: z.string().max(12),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      meshId: id,
      faceIndex: z.number().int().min(0),
      sourceFaceIndex: z.number().int().min(0).optional(),
      position: vec3,
      normal: vec3,
      barycentric: vec3,
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal("region"),
      coverage: z.enum(["brush-v1", "source-v1", "source-v2"]).optional(),
      label: z.string().max(12),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      /* Where the mark is and how much surface it covers, in the model's own
         units, worked out by the browser because nothing else can: this service
         keeps a triangle count and a transform per mesh, not triangles, and a
         `source-v2` mark whose faces were all taken whole carries no
         coordinate of its own. It is descriptive — nothing is authorised by it
         and no geometry is derived from it — which is why a hundred bytes of
         it is worth carrying for a mark of any size.

         `space` is optional because batches saved before 1.3.0-dev are in the
         preview's scaled coordinates and have to stay readable as what they
         are; it is never added to them after the fact. */
      bounds: z
        .object({
          space: z.literal("model").optional(),
          centroid: vec3,
          min: vec3,
          max: vec3,
          area: z.number(),
        })
        .strict()
        .optional(),
      faces: z.record(id, z.array(z.number().int().min(0)).max(MAX_TRIANGLES)),
      surfacePatches: z
        .array(
          z
            .object({
              meshId: id,
              faceIndex: z.number().int().min(0),
              sourceFaceIndex: z.number().int().min(0),
              /* A clipped polygon, not a triangle: the brush outline is a
                 64-gon, so a triangle cut by it can carry up to 67 corners,
                 and an occluder subtracted from that a few more.

                 Since `source-v2` a polygon may also be the union of every
                 stamp that crossed one face, whose boundary is as long as the
                 stroke was — measured at 530 corners for a quarter of one
                 coarse face. The ceiling that matters is the round's total,
                 counted below; this one only has to sit past anything a single
                 boundary reaches. `MAX_POLYGON_VERTICES` in
                 `src/polygon-union.js` holds the client to the same number. */
              vertices: z.array(vec3).min(3).max(4096),
            })
            .strict(),
        )
        .max(MAX_TRIANGLES)
        .optional(),
    })
    .strict(),
]);
const owner = z.object({ versionId: id, clientId: id });
const camera = z.object({ position: vec3, target: vec3 }).nullable();
const draftSchema = owner.extend({
  revision: z.number().int().min(0),
  labelCursor: z.number().int().min(0).max(1000000).optional(),
  annotations: z.array(annotation).max(200),
  camera,
});
function stateFor(clientId, full = false, versionId) {
  const state = store.publicState(clientId, versionId);
  delete state.messages;
  if (!full && state.draft)
    state.draft = {
      ...state.draft,
      annotations: undefined,
      camera: undefined,
      annotationCount: state.draft.annotations.length,
    };
  const closing = idle?.notice() || null;
  /* Reading it here is what schedules the next request, so an instance nobody
     has open never makes one. The answer is whatever was last known; it is
     absent until there is something to say, and stays absent when the check is
     turned off or the upstream cannot be reached. */
  const update = updates.report();
  return {
    ...state,
    // What is actually running, said on every poll. The page ships its own
    // version compiled in, but that is the build it was cut from; a reviewer
    // asking what they are looking at means the service answering them.
    version,
    ...(update ? { update } : {}),
    notifier: notifierSummary(notifierCached(store.state.reviewOrigin)),
    limits: { maxTriangles: MAX_TRIANGLES, maxBytes: 80 * 1024 * 1024 },
    // The countdown rides along on every poll, not only during the
    // announcement: a throttled background tab can sleep through the whole
    // announced window, and its last reading is then the only thing it has to
    // tell a reclaim apart from a crash.
    idle: idleReport(),
    // Present only while the service is about to reclaim itself. Reading the
    // notice never advances the decision — the timer owns that — so a poll can
    // report the warning without becoming the reason it was withdrawn.
    ...(closing ? { closing } : {}),
  };
}
function saveManifest(versionId, meshes) {
  const valid = z
    .array(
      z
        .object({
          id,
          name: z.string().max(200),
          triangles: z.number().int().positive().max(MAX_TRIANGLES),
          sourceTriangles: z.number().int().positive().max(MAX_TRIANGLES),
          surfaceAlgorithm: z.literal("midpoint-v3-edge0.07-rationed"),
          matrixWorld: z.array(z.number().finite()).length(16),
        })
        .strict(),
    )
    .min(1)
    .max(2000)
    .parse(meshes);
  if (
    new Set(valid.map((x) => x.id)).size !== valid.length ||
    valid.reduce((n, x) => n + x.triangles, 0) > MAX_TRIANGLES
  )
    throw new ReviewError("The model mesh exceeds the limits.", 400);
  atomicJson(path.join(runtime, "manifests", `${versionId}.json`), {
    versionId,
    meshes: valid,
  });
}
function validateAnnotations(versionId, annotations) {
  const manifestFile = path.join(runtime, "manifests", `${versionId}.json`);
  if (!fs.existsSync(manifestFile))
    throw new ReviewError(
      "The model has not finished loading.",
      409,
      "NOT_READY",
    );
  const meshes = new Map(
    JSON.parse(fs.readFileSync(manifestFile, "utf8")).meshes.map((m) => [
      m.id,
      m,
    ]),
  );
  const usedIds = new Set();
  let faceCount = 0,
    patchCount = 0,
    markCost = 0;
  for (const a of annotations) {
    if (usedIds.has(a.id))
      throw new ReviewError("Duplicate annotation id.", 400);
    usedIds.add(a.id);
    const groups = a.type === "pin" ? { [a.meshId]: [a.faceIndex] } : a.faces;
    for (const [meshId, faces] of Object.entries(groups)) {
      if (
        !meshes.has(meshId) ||
        faces.some(
          (f) =>
            f >=
            (a.type === "region" &&
            ["source-v1", "source-v2"].includes(a.coverage)
              ? meshes.get(meshId).sourceTriangles
              : meshes.get(meshId).triangles),
        )
      )
        throw new ReviewError(
          "The annotations do not match the current model mesh; the draft was not overwritten.",
          400,
          "BAD_GEOMETRY",
        );
      faceCount += faces.length;
    }
    if (
      a.type === "pin" &&
      a.sourceFaceIndex !== undefined &&
      a.sourceFaceIndex >= meshes.get(a.meshId).sourceTriangles
    )
      throw new ReviewError(
        "A pin's source face does not match.",
        400,
        "BAD_GEOMETRY",
      );
    if (a.type === "region") {
      const patches = a.surfacePatches || [];
      const selected = new Set(
        Object.entries(a.faces).flatMap(([meshId, faces]) =>
          faces.map((f) => `${meshId}:${f}`),
        ),
      );
      /* Every face has to be accounted for, and until `source-v2` the only
         accounting was a polygon: one per face at least, or the mark was
         calling itself incomplete. That is what charged a face covered end to
         end 142 bytes to repeat the triangle its own number already named.

         Under `source-v2` a face with no patch means the whole face, so the
         patches name a subset of `faces` rather than all of it. Everything
         else still holds — no patch may name a face the mark did not claim,
         and the claim is still exact. */
      const painted = new Set(patches.map((p) => `${p.meshId}:${p.faceIndex}`));
      const whole = a.coverage === "source-v2";
      if (
        (!["brush-v1", "source-v1", "source-v2"].includes(a.coverage) &&
          patches.length !== selected.size) ||
        (whole
          ? painted.size > selected.size
          : painted.size !== selected.size) ||
        patches.some(
          (p) =>
            !selected.has(`${p.meshId}:${p.faceIndex}`) ||
            p.sourceFaceIndex >= meshes.get(p.meshId).sourceTriangles ||
            (["source-v1", "source-v2"].includes(a.coverage) &&
              p.faceIndex !== p.sourceFaceIndex),
        )
      )
        throw new ReviewError(
          "The painted surface data is incomplete; the draft was not overwritten.",
          400,
          "BAD_GEOMETRY",
        );
    }
    /* A round used to stop at 20,000 faces and 40,000 polygons. Both were the
       same limit written twice — the browser's storage budget, back when a
       face covered end to end still stored a polygon repeating its own
       triangle. Under `source-v2` a whole face costs its number, and the two
       numbers stopped meaning anything: a bucket fill over a connected surface
       is a few kilobytes, and every face of a 97,280-triangle model is 19% of
       the budget.

       What is left is the budget itself, counted the way the page counts it.
       The ceiling here sits above the page's so that a reviewer meets the
       toast that tells them to submit, and never this. A round that arrives
       over it did not come from our page. */
    patchCount += a.surfacePatches?.length || 0;
    const patches = a.surfacePatches || [];
    const claimed =
      a.type === "pin"
        ? 1
        : Object.values(a.faces).reduce((n, list) => n + list.length, 0);
    const onFaces = new Set(patches.map((p) => `${p.meshId}:${p.faceIndex}`))
      .size;
    markCost +=
      120 +
      Math.max(0, claimed - onFaces) * MARK_WHOLE_FACE_BYTES +
      patches.reduce((n, p) => n + 64 + p.vertices.length * 26, 0);
    if (markCost > MAX_ROUND_BYTES)
      throw new ReviewError(
        "This round holds more marking than a browser will keep; submit in batches.",
        400,
      );
  }
}
// Derived, never restated: a bundled server used to report the project's
// version while the package it shipped in declared a different one.
const version = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"))
      .version;
  } catch (error) {
    log.warn("service", "version is unavailable from the package manifest", {
      ...errorDetail(error),
    });
    return "unknown";
  }
})();
const mcpConnections = new McpConnections(runtime, {
  workspace,
  clientName: "ai3d",
  clientVersion: version,
});
/* The built-in chat is a model the reader configures, not a second product:
   one key, one endpoint, and the model list the endpoint reports. It lives
   beside review state rather than inside it so it survives a new round. */
const chatConfig = new ChatConfig(runtime);
/* AI3D is itself an MCP server, so the connection the workbench offers first
   is this installation rather than a command the reader has to look up. The
   same file is spawned by the CLI and by the MCP launcher; only its location
   differs between a clone and a package. */
function builtinMcpServerFile() {
  for (const candidate of [
    path.join(repo, "runtime", "mcp-server.mjs"),
    path.join(repo, "mcp", "server.mjs"),
  ])
    if (fs.existsSync(candidate)) return candidate;
  return null;
}
/* Compared against what is installed, not against what is running. Those are
   two different questions and the other one already has an answer: an instance
   still serving an older build is what `serving` reports to the agent, and only
   reopening it replaces the server. Telling a reviewer to update to a version
   that is already sitting on the disk would be answering neither. */
const installed = (() => {
  if (!config.installRoot) return version;
  try {
    return JSON.parse(
      fs.readFileSync(path.join(config.installRoot, "package.json"), "utf8"),
    ).version;
  } catch {
    return version;
  }
})();
const updates = createUpdateWatch({
  installed,
  enabled: updateCheckEnabled(process.env, config),
  ...(process.env.REVIEW_UPDATE_URL
    ? { url: process.env.REVIEW_UPDATE_URL }
    : {}),
  ...(process.env.REVIEW_UPDATE_TTL_MS
    ? {
        ttlMs: Number(process.env.REVIEW_UPDATE_TTL_MS),
        retryMs: Number(process.env.REVIEW_UPDATE_TTL_MS),
      }
    : {}),
});
app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    app: "3d-agent-review", // Stable service identity for pre-rename launchers.
    product: "AI3D",
    version,
    integrationApi: INTEGRATION_API,
    instance,
    pid: process.pid,
    accessRequired,
    // Said out loud so nobody has to infer it from a process that is simply
    // gone one day. A runtime that predates reclaiming has no `idle` here at
    // all, and that absence is the only way to tell the two apart from outside.
    idle: idleReport() || { forMs: 0, limitMs: 0, graceMs: 0 },
  }),
);
app.get("/api/state", (req, res) =>
  res.json(
    stateFor(
      req.reviewClientId ?? String(req.query.clientId || ""),
      req.query.full === "1",
      req.query.versionId ? String(req.query.versionId) : undefined,
    ),
  ),
);
app.post("/api/access/activity", (req, res) => {
  z.object({ clientId: id }).strict().parse(req.body);
  rememberUse(req, res);
  res.json({ remembered: true });
});
app.get("/api/models/:filename", (req, res) => {
  if (!/^[a-f0-9]{64}\.(glb|stl)$/.test(req.params.filename))
    throw new ReviewError("Model not found.", 404);
  res.setHeader(
    "Cache-Control",
    accessRequired
      ? "private, no-store"
      : "public, max-age=31536000, immutable",
  );
  res.sendFile(req.params.filename, { root: mediaDir });
});
app.post("/api/ready", (req, res) => {
  const p = owner
    .extend({
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      meshes: z.array(z.unknown()),
    })
    .parse(req.body);
  store.assertVersion(p.versionId);
  // Verify against the version actually being looked at. Checking the active
  // one instead made every older tab fail its own integrity check.
  //
  // And against the bytes that version puts on screen, which for a source the
  // viewer cannot draw is its derived mesh rather than the file itself. The
  // page can only ever report the hash of what it fetched; measuring that
  // against the published source rejects every STEP round at the handshake and
  // tells the reviewer their model does not match, which is both untrue and
  // unfixable from their end. See server/models.mjs for which hash names what.
  const version = store.state.models[p.versionId];
  if (p.sha256 !== (version.mesh ?? version).sha256)
    throw new ReviewError(
      "The loaded file does not match what the Agent delivered.",
      409,
      "HASH_MISMATCH",
    );
  saveManifest(p.versionId, p.meshes);
  store.recordViewerReceipt(p.clientId, {
    versionId: p.versionId,
    sha256: p.sha256,
    loadedAt: Date.now(),
  });
  rememberUse(req, res);
  res.json({ ready: true });
});
app.post("/api/review/begin", (req, res) => {
  const p = owner.parse(req.body);
  if (store.state.viewerReceipts?.[p.clientId]?.versionId !== p.versionId)
    throw new ReviewError(
      "Wait for the model to load and its version to be verified.",
      409,
      "NOT_READY",
    );
  store.acquire(p.versionId, p.clientId);
  rememberUse(req, res);
  res.json(stateFor(p.clientId, true, p.versionId));
});
app.post("/api/review/heartbeat", (req, res) => {
  const p = z
    .object({ clientId: id, versionId: id.optional() })
    .parse(req.body);
  if (p.versionId) store.heartbeat(p.clientId, p.versionId);
  res.json({ ok: true });
});
app.post("/api/review/resume", (req, res) => {
  const p = owner.parse(req.body);
  store.resume(p.versionId, p.clientId);
  rememberUse(req, res);
  res.json(stateFor(p.clientId, true, p.versionId));
});
app.put("/api/draft", (req, res) => {
  const p = draftSchema.parse(req.body);
  validateAnnotations(p.versionId, p.annotations);
  const draft = store.updateDraft(p);
  rememberUse(req, res);
  // Permissions travel with the save so the first mark does not leave the
  // buttons disabled until the next poll, and the page never has to guess.
  res.json({
    ...draft,
    capabilities: store.capabilities(p.clientId, p.versionId),
  });
});
app.post("/api/review/finish", async (req, res) => {
  const p = owner.parse(req.body);
  const { sealed } = store.finish(p.versionId, p.clientId);
  rememberUse(req, res);
  const state = stateFor(p.clientId, true, p.versionId);
  if (!sealed) return res.json(state);
  // Finishing must not fail on delivery. The sealed batch is already durable
  // and the outbox retries it; a Gateway outage cannot reopen a closed round.
  try {
    await deliverFeedback(attachManifest(sealed));
  } catch (error) {
    log.warn("review", "sealed batch is queued but not yet delivered", {
      submissionId: sealed.id,
      ...errorDetail(error),
    });
  }
  res.json({ ...state, sealed: sealed.id });
});
const feedbackFlights = new Map();
function attachManifest(item) {
  if (item.meshManifest) return item;
  item.meshManifest = JSON.parse(
    fs.readFileSync(
      path.join(runtime, "manifests", `${item.versionId}.json`),
      "utf8",
    ),
  );
  store.submissionStatus(item.id, item.status);
  return item;
}
app.post("/api/feedback", async (req, res) => {
  const p = owner
    .extend({ revision: z.number().int().min(0), submissionId: id })
    .parse(req.body);
  const item = attachManifest(store.createSubmission(p));
  if (item.status === "accepted")
    return res.json({ ...item, annotations: undefined });
  res.json(await deliverFeedback(item));
});
// Roughly ninety minutes on the backoff curve: long enough that a Gateway
// restart or a brief outage never raises it, short enough that a reviewer is
// still in front of the page when it does.
const STALL_AFTER = Math.max(1, Number(process.env.REVIEW_STALL_AFTER) || 20);
// One failing send used to write a full record on every retry, so a single
// stuck batch produced a couple of hundred identical multi-line entries. Report
// each distinct cause once, then stay quiet about it until it changes.
const loggedCauses = new Map();
function logDeliveryFailure(submissionId, attempts, cause, error) {
  const signature = `${cause.code}\0${cause.message}`;
  if (loggedCauses.get(submissionId) === signature) {
    if (attempts % 10 === 0)
      log.warn("feedback", "delivery still failing for the same reason", {
        submissionId,
        attempts,
        code: cause.code,
      });
    return;
  }
  loggedCauses.set(submissionId, signature);
  log.error("feedback", "delivery to the origin session failed", {
    submissionId,
    attempts,
    code: cause.code,
    reason: cause.message,
    // A host rejection is fully described by its own fields; only an unexpected
    // throw needs a stack, and errorDetail is what keeps that bounded.
    ...(error.hostError ? {} : errorDetail(error)),
  });
}
function deliverFeedback(item) {
  if (!managedEnabled())
    throw new ReviewError(
      "The extension is disabled; the submission is still kept.",
      503,
      "INTEGRATION_DISABLED",
    );
  if (!feedbackFlights.has(item.id)) {
    feedbackFlights.set(
      item.id,
      (async () => {
        const localFile = path.join(runtime, "submissions", `${item.id}.json`);
        const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
        const readCommand =
          config.managed && config.projectPath
            ? `the ai3d tool with ${JSON.stringify({ action: "read", project: config.projectPath, submissionId: item.id })}`
            : `REVIEW_DATA_DIR=${shellQuote(runtime)} node ${shellQuote(path.join(repo, "scripts/reviewctl.mjs"))} read ${shellQuote(item.id)}`;
        const summary = item.annotations
          .map((a) =>
            a.type === "pin"
              ? /* The source face, and said so. A pin carries two numbers --
                   the triangle of the review subdivision and the one it came
                   from in the model -- and this line used to print the first
                   while `read` returns the second, under the bare word "face"
                   in both. Two different integers for one pin, neither saying
                   which mesh it counts in, is a discrepancy an agent has to
                   stop and resolve before it can trust either. */
                `${a.label}: pin on ${a.meshId}, source face ${a.sourceFaceIndex ?? a.faceIndex}`
              : `${a.color} painted region (id ${a.id}): ${["brush-v1", "source-v1", "source-v2"].includes(a.coverage) ? "an actual surface stroke" : "an older whole-face mark"} — not a lettered pin; identify it by colour and position`,
          )
          .join("\n");
        const message = `[AI3D review marks ${item.id}]\nModel: ${item.model.name} / ${item.model.version}; version ${item.versionId}; SHA256 ${item.model.sha256}.\n${summary}\n\nThe full 3D annotations and camera are saved at ${localFile}. Agent instructions: ${path.join(repo, "AGENT-INTERFACE.md")}.\nThis is a batch of positions the reviewer sent with "Send to Agent". It is not an instruction to change anything. Read the complete submission from this instance with ${readCommand} and write the read receipt before confirming you have it; if the conversation does not already explain the marks, ask what each one means and what to change rather than guessing. Reply only in the conversation this batch came from — never forward it to another topic or channel. The reviewer has not finished, so do not replace the model on them.`;
        const notifier = notifierCached(store.submissionOrigin(item));
        // Nowhere to push is not a push that failed. The batch is already
        // durable and listed; this host's Agent collects it by asking. Counting
        // an attempt here would start a retry curve against nothing and, past
        // the stall mark, raise an alarm on a page where nothing is wrong.
        if (!notifier?.send) {
          store.submissionStatus(item.id, "waiting", {
            lastError: null,
            stalledAt: null,
          });
          const { annotations: _held, ...waiting } = item;
          return waiting;
        }
        store.submissionStatus(item.id, "sending", {
          lastAttemptAt: Date.now(),
          attempts: (item.attempts || 0) + 1,
        });
        try {
          const result = await notifier.send(message, `3d-feedback-${item.id}`);
          loggedCauses.delete(item.id);
          store.submissionStatus(item.id, "accepted", {
            runId: result.runId || null,
            acceptedAt: Date.now(),
            lastError: null,
            stalledAt: null,
          });
          // A host that cannot be read back is not a host that failed to
          // deliver. Without observe the receipt is the Agent's own read
          // acknowledgement, which is the more honest of the two anyway.
          if (!notifier.observe) {
            const { annotations, ...receipt } = item;
            return receipt;
          }
          try {
            const history = await notifier.observe(item.createdAt - 5000);
            if (
              history.messages.some(
                (m) =>
                  m.role === "user" &&
                  m.text.includes(`[AI3D review marks ${item.id}]`),
              )
            )
              store.submissionStatus(item.id, "accepted", {
                deliveredAt: Date.now(),
              });
          } catch (error) {
            // Acceptance is real, but delivery remains unconfirmed.
            log.warn("feedback", "accepted but delivery unconfirmed", {
              submissionId: item.id,
              ...errorDetail(error),
            });
          }
          const { annotations, ...receipt } = item;
          return receipt;
        } catch (error) {
          // Already counted when this attempt moved to "sending"; the old log
          // line added one again and reported a number the batch never held.
          const attempts = item.attempts || 0;
          const cause = error.hostError || {
            code: error.code || "UNKNOWN",
            message: String(error.message || error).slice(0, 300),
          };
          logDeliveryFailure(item.id, attempts, cause, error);
          // The outbox retries forever by design — the failure that stalled a
          // real round was fixed in code, and the queue healed itself on the
          // next pass. Retrying is not the problem; doing it silently was. Past
          // the stall mark the batch says so in its own status, so the page and
          // the Agent can surface it instead of only the log knowing.
          store.submissionStatus(
            item.id,
            attempts >= STALL_AFTER ? "stalled" : "unconfirmed",
            {
              error:
                "Not yet confirmed as handed to OpenClaw; the annotations are saved locally.",
              lastError: { ...cause, at: Date.now() },
              stalledAt:
                attempts >= STALL_AFTER ? item.stalledAt || Date.now() : null,
              nextAttemptAt:
                Date.now() +
                Math.min(300000, 1000 * 2 ** Math.min(item.attempts || 1, 8)),
            },
          );
          throw new ReviewError(
            "Delivery could not be confirmed; the annotations are saved. Once the connection returns the same submission retries, and no mark is rebuilt.",
            502,
            "DELIVERY_UNCONFIRMED",
          );
        }
      })().finally(() => feedbackFlights.delete(item.id)),
    );
  }
  return feedbackFlights.get(item.id);
}
// Only managed integration instances own an automatic durable outbox. Legacy
// trial behavior stays unchanged. Each batch keeps its frozen origin and key.
let drainingOutbox = false;
const outboxTimer = config.managed
  ? setInterval(
      async () => {
        if (drainingOutbox || !managedEnabled()) return;
        const next = store.state.submissions.find(
          (item) =>
            item.status !== "accepted" &&
            !feedbackFlights.has(item.id) &&
            (item.nextAttemptAt || 0) <= Date.now(),
        );
        if (!next) return;
        drainingOutbox = true;
        try {
          await deliverFeedback(next);
        } catch {
          /* deliverFeedback already logged the cause; status is the receipt */
        } finally {
          drainingOutbox = false;
        }
      },
      Math.max(1000, Number(process.env.REVIEW_OUTBOX_MS) || 30000),
    )
  : null;
outboxTimer?.unref();
app.get("/api/submissions/:id", (req, res) => {
  const submissionId = id.parse(req.params.id);
  const file = path.join(runtime, "submissions", `${submissionId}.json`);
  if (!fs.existsSync(file)) throw new ReviewError("No such submission.", 404);
  res.download(`${submissionId}.json`, `ai3d-${submissionId}.json`, {
    root: path.join(runtime, "submissions"),
  });
});
app.get("/api/download/:filename", (req, res) => {
  const filename = z
    .string()
    .regex(/^[a-f0-9]{64}\.(glb|stl|step|stp)$/)
    .parse(req.params.filename);
  const model = Object.values(store.state.models).find(
    (m) => m?.filename === filename,
  );
  if (!model) throw new ReviewError("No such published version.", 404);
  rememberUse(req, res);
  /* The published file, byte for byte -- never a modified review mesh, and for
     a STEP never the tessellation either. What the page draws is derived; what
     someone downloads is what the author actually published. */
  res.download(filename, `${model.name}-${model.version}.${model.format}`, {
    root: mediaDir,
  });
});
// The workbench carries its own chat surface. It is still the same
// conversation the review came from when the host can be reached: history is
// read from the origin session and input is pushed into it through the same
// bridge the outbox uses. When there is no host -- the desktop app, a page
// opened on its own -- the same surface talks to the endpoint the reader
// configured in Settings, so it is never a second, disconnected channel.
//
// Local replies are kept in memory only: they are a view of this session, and
// a credential never reaches state.json or the page.
const localChat = [];
const LOCAL_CHAT_LIMIT = 200;
const CHAT_CONTEXT_MESSAGES = 20;
let localChatSeq = 0;

function appendLocalChat(role, text) {
  const message = {
    id: `local-${crypto.randomUUID()}`,
    role,
    text,
    timestamp: Date.now(),
    local: true,
  };
  localChat.push(message);
  if (localChat.length > LOCAL_CHAT_LIMIT)
    localChat.splice(0, localChat.length - LOCAL_CHAT_LIMIT);
  return message;
}

function localChatSince(since) {
  return localChat.filter((message) => Number(message.timestamp) > since);
}

function chatContext() {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...localChat
      .slice(-CHAT_CONTEXT_MESSAGES)
      .filter((message) => message.role === "user" || message.role === "agent")
      .map((message) => ({
        role: message.role === "user" ? "user" : "assistant",
        content: message.text,
      })),
  ];
}

app.get("/api/chat", async (req, res) => {
  const since = Number(req.query.since) || 0;
  const notifier = notifierCached(store.state.reviewOrigin);
  const view = chatConfig.view();
  /* Which channels can answer right now. Both are reported rather than one
     being chosen here, because the reader is the one who knows whether this
     message belongs in the conversation or on their own endpoint. */
  const channels = {
    origin: Boolean(notifier?.observe),
    /* The model channel answers the provider the reader picks in the composer,
       not only the default one, so any configured endpoint makes it usable. */
    model: view.providers.some((provider) => provider.available),
  };
  if (!notifier?.observe) {
    return res.json({
      connected: view.available,
      mode: view.available ? "model" : "offline",
      busy: false,
      messages: localChatSince(Number.isFinite(since) ? since : 0),
      channels,
    });
  }
  try {
    const result = await notifier.observe(Number.isFinite(since) ? since : 0);
    res.json({ ...result, connected: true, mode: "origin", channels });
  } catch {
    // The host is unreachable or refused the call. Report the chat as
    // disconnected rather than surfacing a 500: the workbench polls this
    // endpoint, and a transient host failure should not break the UI. The
    // local model, if one is configured, is still an answer.
    res.json({
      connected: view.available,
      mode: view.available ? "model" : "offline",
      busy: false,
      messages: localChatSince(Number.isFinite(since) ? since : 0),
      channels,
    });
  }
});

app.get("/api/chat/config", (req, res) => {
  res.json({ config: chatConfig.view(), builtinMcp: !!builtinMcpServerFile() });
});
const chatProviderInput = z.object({
  id: z.string().trim().max(60).optional(),
  name: z.string().trim().max(80).optional(),
  baseUrl: z.string().trim().max(500).optional(),
  apiKey: z.string().max(400).optional(),
  models: z.array(z.string().trim().min(1).max(200)).max(60).optional(),
  model: z.string().trim().max(200).optional(),
});
app.post("/api/chat/config", (req, res) => {
  const p = z
    .object({
      baseUrl: z.string().trim().max(500).optional(),
      apiKey: z.string().max(400).optional(),
      models: z.array(z.string().trim().min(1).max(200)).max(60).optional(),
      model: z.string().trim().max(200).optional(),
      activeId: z.string().trim().max(60).optional(),
      providers: z
        .array(chatProviderInput.strict())
        .max(MAX_PROVIDERS)
        .optional(),
    })
    .strict()
    .parse(req.body);
  res.json({ config: chatConfig.update(p) });
});
app.post("/api/chat/config/models", async (req, res) => {
  const p = z
    .object({
      providerId: z.string().trim().max(60).optional(),
      baseUrl: z.string().trim().max(500).optional(),
      apiKey: z.string().max(400).optional(),
    })
    .strict()
    .parse(req.body);
  /* The stored endpoint is resolved by id alone. The default provider is not
     a stand-in for one that is named but not stored: a row the reader just
     added carries its own id, and borrowing the active provider's id or key
     here stored the new endpoint under the old one's identity, so a second
     probe overwrote the first and the same models appeared twice. */
  const stored = p.providerId
    ? chatConfig.providerById(p.providerId)
    : undefined;
  const baseUrl = p.baseUrl || stored?.baseUrl || "";
  const apiKey = p.apiKey || stored?.apiKey || "";
  if (!baseUrl)
    throw new ReviewError(
      "A base URL is needed before its models can be listed.",
      400,
      "CHAT_CONFIG",
    );
  /* A model list is the endpoint's answer, not a promise this service made,
     so an unreachable endpoint reports the failure instead of a stale list. */
  const models = await listModels({ baseUrl, apiKey });
  const config = chatConfig.saveProbe({
    id: stored?.id || p.providerId,
    baseUrl,
    apiKey: p.apiKey,
    models,
  });
  res.json({ models, config });
});

// The built-in knowledge pack is local and deterministic, so the workbench can
// read it even when the originating conversation is unreachable. Responses keep
// the source URL and licence beside every fact; the chat surface renders them
// as citations instead of presenting model prose as authority.
app.get("/api/knowledge", (req, res) => {
  const query = String(req.query.q || "").slice(0, 300);
  const id = String(req.query.id || "").slice(0, 120);
  if (id) {
    const found = getKnowledge(id);
    if (!found) throw new ReviewError("No such knowledge entry.", 404);
    return res.json(found);
  }
  if (req.query.all === "1") return res.json(listKnowledge());
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 5, 20));
  const tags = String(req.query.tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
  res.json(searchKnowledge(query, { limit, tags }));
});
app.post("/api/chat", async (req, res) => {
  const p = z
    .object({
      message: z.string().trim().min(1).max(8000),
      idempotencyKey: z.string().min(1).max(200).optional(),
      model: z.string().trim().max(200).optional(),
      providerId: z.string().trim().max(60).optional(),
      /* Both channels stay configured at once; this says which one this
         message goes to. "auto" keeps the old preference: the conversation
         when there is one, the reader's own endpoint when there is not. */
      channel: z.enum(["auto", "origin", "model"]).optional(),
    })
    .strict()
    .parse(req.body);
  const channel = p.channel || "auto";
  const notifier =
    channel === "model" ? null : notifierCached(store.state.reviewOrigin);
  if (notifier?.send) {
    try {
      const sent = await notifier.send(
        p.message,
        p.idempotencyKey || `chat-${crypto.randomUUID()}`,
      );
      return res.json({
        sent: true,
        runId: sent?.runId || null,
        mode: "origin",
      });
    } catch {
      // The host refused or could not reach the conversation. Fall through to
      // the configured model rather than failing the reader's message.
    }
  }
  if (channel === "origin")
    throw new ReviewError(
      "This instance has no return route to a conversation to send to.",
      409,
      "CHAT_ORIGIN_UNAVAILABLE",
    );
  const target = chatConfig.target(p.providerId) || {};
  const model = p.model || target.model || "";
  if (target.baseUrl && model) {
    appendLocalChat("user", p.message);
    try {
      const text = await chatCompletion({
        baseUrl: target.baseUrl,
        apiKey: target.apiKey,
        model,
        messages: chatContext(),
      });
      const reply = appendLocalChat("agent", text);
      return res.json({
        sent: true,
        mode: "model",
        model,
        reply: { id: reply.id, text: reply.text, timestamp: reply.timestamp },
      });
    } catch (error) {
      /* The reader's own message stays in the transcript so a retry or a
         corrected key does not lose what they wrote. */
      throw new ReviewError(
        String(error.message || error).slice(0, 300),
        502,
        "CHAT_MODEL_FAILED",
      );
    }
  }
  throw new ReviewError(
    "Chat is unavailable because this instance has no return route to a conversation and no model is configured.",
    409,
    "CHAT_UNAVAILABLE",
  );
});

const mcpId = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9._-]+$/);
const mcpCommand = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(/^[^\x00-\x1f\x7f]+$/);
const mcpConnectionInput = z
  .object({
    id: mcpId.optional(),
    name: z.string().trim().min(1).max(80).optional(),
    command: mcpCommand,
    args: z.array(z.string().max(300)).max(50).default([]),
  })
  .strict();

// MCP operations are local launcher configuration. Every command was saved by
// a user action on this service; the browser never passes a process to run.
app.get("/api/mcp/connections", (req, res) => {
  res.json({ connections: mcpConnections.list() });
});
app.post("/api/mcp/connections", (req, res) => {
  const p = mcpConnectionInput.parse(req.body);
  res.json({ connection: mcpConnections.upsert(p) });
});
/* One button for the server this product is. The command is resolved here,
   never sent from the page, and a fixed id makes a second click reconnect
   rather than pile up duplicate entries. */
app.post("/api/mcp/builtin/connect", async (req, res) => {
  const entry = builtinMcpServerFile();
  if (!entry)
    throw new ReviewError(
      "The bundled AI3D MCP server is not present in this installation.",
      404,
      "MCP_BUILTIN_MISSING",
    );
  mcpConnections.upsert({
    id: "ai3d-builtin",
    name: "AI3D",
    command: process.execPath,
    args: [entry],
  });
  const connection = await mcpConnections.connect("ai3d-builtin");
  res.json({ connection });
});
app.post("/api/mcp/connections/remove", (req, res) => {
  const { id } = z.object({ id: mcpId }).strict().parse(req.body);
  mcpConnections.remove(id);
  res.json({ removed: id });
});
app.post("/api/mcp/connect", async (req, res) => {
  const { id } = z.object({ id: mcpId }).strict().parse(req.body);
  const connection = await mcpConnections.connect(id);
  res.json({ connection });
});
app.post("/api/mcp/disconnect", (req, res) => {
  const { id } = z.object({ id: mcpId }).strict().parse(req.body);
  res.json(mcpConnections.disconnect(id));
});
app.post("/api/mcp/tools/call", async (req, res) => {
  const p = z
    .object({
      id: mcpId,
      name: z.string().trim().min(1).max(100),
      args: z
        .record(z.string().min(1).max(200), z.unknown())
        .max(100)
        .optional(),
    })
    .strict()
    .parse(req.body);
  const result = await mcpConnections.callTool(p.id, p.name, p.args || {});
  res.json({ id: p.id, tool: p.name, result });
});

// Browser routes intentionally cannot publish models. Agent control is local IPC only.
const agentApp = express();
agentApp.use(express.json({ limit: "16mb" }));
agentApp.use((req, res, next) => {
  if (!idle || !agentUse(req.method, req.path)) return next();
  // Count it once it has reached a handler, not on arrival. A write to a route
  // this build does not have matches nothing and does nothing, yet marking it
  // on arrival bought the project another full day — and the requests that
  // miss are precisely the ones a newer harness sends at an older runtime, so
  // the instances most overdue for reclaiming were the ones kept alive.
  // `req.route` is set by the router when a route matches, which keeps a
  // handler's own 404 (`No such submission`) counting as the work it was.
  res.on("finish", () => {
    if (req.route) idle.use();
  });
  next();
});
// A batch nobody can deliver is invisible from the chat side: the one channel
// that would report it is the one that is broken. Summarize it where the Agent
// already looks, so it can say so in words instead of the reviewer noticing
// hours later that the product never reacted.
function outboxSummary() {
  const queued = store.state.submissions.filter(
    (item) => item.status !== "accepted",
  );
  const stalled = queued.filter((item) => item.status === "stalled");
  const worst = stalled[0] || queued[0] || null;
  return {
    pending: queued.length,
    stalled: stalled.length,
    oldestAt: queued.length
      ? Math.min(...queued.map((item) => item.createdAt || Date.now()))
      : null,
    attempts: worst?.attempts || 0,
    lastError: worst?.lastError || null,
  };
}
/* The page and the Agent ask different apps for state, which is what lets this
   one answer more briefly. Two things here grow without bound and neither is
   ever acted on from a status call:

   A submission carries the parts list of the version it was made against. For
   a mesh round that is one entry; the first STEP assembly made it 128, at 32 kB
   a copy, and status keeps the last twenty submissions -- 690 kB, about 172k
   tokens, twenty identical copies of one table. The manifest belongs with the
   marks it explains, and `read` already sends just the parts that were marked.

   The draft is marks the reviewer has not sent. Whether there are any is worth
   reporting; what they are is not the Agent's to read until "Send to Agent"
   says so, and `stateFor` already has that shape. */
agentApp.get("/status", (req, res) => {
  const state = stateFor("", false);
  res.json({
    ...state,
    submissions: state.submissions.map(
      ({ meshManifest, camera, ...rest }) => rest,
    ),
    outbox: outboxSummary(),
    // Version tabs mean no published model is ever deleted, which is the point
    // — an older one stays markable. The cost is that a long project grows one
    // model file per revision with nothing watching. Report it from the sizes
    // already recorded rather than walking the directory on every poll.
    /* A STEP keeps two files, not one: the source that was published and the
       mesh derived from it at import, both on disk for as long as the version
       lives. Counting only the source under-reported every STEP round — and
       the derived mesh of a 21 MB assembly is 3 MB, so the number this exists
       to make conspicuous was the one being shaved. */
    storage: {
      models: Object.keys(store.state.models).length,
      bytes: Object.values(store.state.models).reduce(
        (sum, model) => sum + (model.bytes || 0) + (model.mesh?.bytes || 0),
        0,
      ),
    },
    viewerReceipts: store.state.viewerReceipts || {},
    // Asking for status is not using the review, so reading this never moves
    // it. That is the whole reason it can be reported honestly: a countdown
    // that its own observer resets would only ever show the same number.
    idle: {
      ...(idleReport() || { forMs: 0, limitMs: 0, graceMs: 0 }),
      closing: Boolean(idle?.notice()),
    },
    origin: store.state.reviewOrigin,
    instance,
    integrationApi: INTEGRATION_API,
    codeRoot: repo,
    releaseId: process.env.REVIEW_RELEASE_ID || null,
    // Installing an extension does not restart a live instance; only `open`
    // replaces the code a reviewer's browser is talking to. A fixed version can
    // therefore sit on disk while the running one is still the broken one, and
    // on 2026-09-11 that went unnoticed for an hour and a half. The status says
    // which version is actually serving, so the caller can compare.
    version,
    network: {
      host: network.host,
      port: server.address()?.port,
      lan: network.lan,
    },
    access: { ...access.metadata(), required: accessRequired },
  });
});
agentApp.post("/maintenance", (req, res) => {
  if (!config.managed || req.body.instanceId !== instance?.id)
    throw new ReviewError(
      "Service identity does not match.",
      409,
      "WRONG_INSTANCE",
    );
  if (req.body.release === true) {
    maintenanceUntil = 0;
    return res.json({ paused: false });
  }
  // Drafts are durable and keyed by version, so a restart costs a reload, not
  // work. Only a reviewer marking right now is worth interrupting for, and the
  // caller can still say so explicitly instead of being refused outright.
  const busy = Object.keys(store.state.presence).filter((versionId) =>
    store.livePresence(versionId),
  );
  if (busy.length && req.body.force !== true)
    throw new ReviewError(
      "Someone is marking; the service was neither stopped nor upgraded. The draft is saved — retry later, or force it explicitly.",
      423,
      "REVIEW_BUSY",
    );
  // Check and pause in the same event-loop turn: a browser cannot acquire a
  // new review between the manager's status check and the verified shutdown.
  // A crashed manager cannot leave the old service paused indefinitely.
  maintenanceUntil = Date.now() + 15000;
  res.json({ paused: true });
});
// Handing the URL to a person is the plainest use there is, but on a warm
// instance an open can touch nothing that counts: health and status are reads,
// the origin only moves when it changes, and a reopen with no new model
// publishes nothing. Without this an idle project could be reopened and then
// reclaim itself out from under whoever was just sent there — or die inside the
// announced window, seconds after the manager handed out its address.
agentApp.post("/opened", (req, res) => {
  z.object({}).strict().parse(req.body);
  res.json({ opened: true, idle: idleReport() });
});
agentApp.post("/publish", async (req, res) => {
  const p = z
    .object({
      file: z.string().min(1),
      name: z.string().max(160).optional(),
      version: z.string().max(80).optional(),
      source: z.string().optional(),
      units: z.string().max(30).optional(),
      label: z.string().max(24).optional(),
      origin: originInput.optional(),
      activate: z.boolean().optional(),
    })
    // Strict like every other write route: a caller that misnames a field must
    // hear about it rather than have the model published under a default.
    .strict()
    .parse(req.body);
  const model = await importModel(p, {
    workspace,
    mediaDir,
    generator: `AI3D ${version}`,
  });
  if (p.label) model.label = p.label;
  res.json(store.publish(model, p.origin, { activate: p.activate !== false }));
});
// Presentation is the Agent's to drive: it decides which version the reviewer
// is looking at. Every version keeps its own draft, so switching costs nothing
// and needs no permission from whoever has the page open.
/* Hiding a version takes nothing away — the draft, the marks and the file all
   stay — so this does not wait on presence the way rebinding does. It is the
   reviewer's own conversation asking for a shorter tab strip, and the page
   picks the change up on its next poll without being reloaded or closed. */
agentApp.post("/retain", (req, res) => {
  const p = z
    .object({ keep: z.number().int().min(0).max(1000).nullable().optional() })
    .strict()
    .parse(req.body);
  res.json(store.retain(p.keep ?? null));
});
agentApp.post("/activate", (req, res) => {
  const p = z.object({ versionId: id }).strict().parse(req.body);
  res.json({ active: store.activate(p.versionId) });
});
agentApp.post("/finish", (req, res) => {
  const p = z.object({ versionId: id.optional() }).strict().parse(req.body);
  const versionId = p.versionId || store.state.active?.id;
  if (!versionId)
    throw new ReviewError(
      "There is no version to finish yet.",
      409,
      "NO_MODEL",
    );
  const { sealed } = store.finish(versionId, null);
  if (sealed) deliverFeedback(attachManifest(sealed)).catch(() => {});
  res.json({ versionId, sealed: sealed?.id || null });
});
// A tab that stopped reporting must never keep anyone out. Presence is only a
// hint, but clearing it explicitly is still the honest way to say "carry on".
agentApp.post("/unlock", (req, res) => {
  const p = z.object({ versionId: id.optional() }).strict().parse(req.body);
  const cleared = p.versionId
    ? [p.versionId]
    : Object.keys(store.state.presence);
  for (const versionId of cleared) delete store.state.presence[versionId];
  store.save();
  res.json({ cleared });
});
agentApp.post("/access/issue", (req, res) => {
  if (!accessRequired || !store.state.active)
    throw new AccessError("No protected review is ready.", 409);
  // Host IPC response only. reviewctl deliberately has no grant-printing command.
  res.setHeader("Cache-Control", "no-store");
  res.json(access.issue());
});
agentApp.post("/access/admit", (req, res) => {
  if (!accessRequired || !store.state.active)
    throw new AccessError("No protected review is ready.", 409);
  const p = z
    .object({ address: z.string().max(64) })
    .strict()
    .parse(req.body);
  // Loopback admissions are for protected local fixtures, not LAN delivery.
  if (network.lan && !privateIPv4(p.address))
    throw new AccessError(
      "Give a private IPv4 address that has been verified.",
      400,
      "BAD_ADDRESS",
    );
  res.setHeader("Cache-Control", "no-store");
  res.json(access.admitAddress(p.address));
});
agentApp.post("/access/revoke", (req, res) => {
  const p = z
    .object({ browserId: z.string().uuid().optional() })
    .strict()
    .parse(req.body);
  access.revoke(p.browserId);
  res.json({ revoked: true, browserId: p.browserId || null });
});
agentApp.get("/access/browsers", (req, res) =>
  res.json({ browsers: access.metadata().browsers }),
);
agentApp.post("/origin", (req, res) => {
  const p = z
    .object({ origin: originInput, resumeGeneration: z.boolean().optional() })
    .strict()
    .parse(req.body);
  store.bindOrigin(p.origin, { resumeGeneration: p.resumeGeneration });
  res.json({
    origin: store.state.reviewOrigin,
    reviewId: store.state.reviewId,
  });
});
agentApp.get("/submissions", (req, res) => res.json(store.state.submissions));
agentApp.get("/submissions/:id", (req, res) => {
  const submission = store.state.submissions.find(
    (s) => s.id === id.parse(req.params.id),
  );
  if (!submission) throw new ReviewError("No such submission.", 404);
  res.json(submission);
});
agentApp.post("/read", (req, res) => {
  const p = z
    .object({ submissionId: id, versionId: id })
    .strict()
    .parse(req.body);
  res.json(store.acknowledgeRead(p.submissionId, p.versionId));
});
agentApp.post("/echo", (req, res) => {
  const p = z
    .object({
      submissionId: id,
      versionId: id,
      summary: z.string().min(1).max(1000),
      annotations: z.array(annotation).max(20),
    })
    .strict()
    .parse(req.body);
  if (p.annotations.some((a) => a.type !== "region"))
    throw new ReviewError(
      "An echo needs explicit surface regions; a pin cannot stand in for one.",
      400,
    );
  validateAnnotations(p.versionId, p.annotations);
  res.json(store.setEcho(p));
});

function errorHandler(err, req, res, next) {
  const schemaError = err instanceof z.ZodError;
  const status = schemaError ? 400 : err.status || 500;
  // A 4xx reaches the client as one transient line in the page and is then
  // gone. Nothing else records it, so a reviewer reporting "the button does
  // nothing" left no trace at all to work from. Every rejection is logged.
  if (status >= 500)
    log.error("http", "request failed", {
      method: req.method,
      path: req.path,
      ...errorDetail(err),
    });
  else if (schemaError)
    log.warn("http", "request rejected by schema", {
      method: req.method,
      path: req.path,
      issues: err.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
        message: i.message,
      })),
    });
  else
    log.warn("http", "request refused", {
      method: req.method,
      path: req.path,
      status,
      code: err.code || "ERROR",
      message: err.message,
    });
  res.status(status).json({
    error: schemaError
      ? "The input is not in the expected shape."
      : status >= 500
        ? "The service could not complete the request for now; the draft is kept."
        : err.message,
    code: err.code || "ERROR",
  });
}
agentApp.use(errorHandler);
const socketPath = agentSocketPath(runtime, instance);
prepareSocketDirectory(socketPath, instance);
if (!isNamedPipePath(socketPath) && fs.existsSync(socketPath))
  fs.unlinkSync(socketPath);
const agentServer = http.createServer(agentApp);
agentServer.listen(socketPath, () => {
  if (!isNamedPipePath(socketPath)) fs.chmodSync(socketPath, 0o600);
});
app.use(
  express.static(
    path.resolve(process.env.REVIEW_DIST_DIR || path.join(repo, "dist")),
  ),
);
app.get("/{*path}", (req, res) =>
  res.sendFile("index.html", {
    root: path.resolve(process.env.REVIEW_DIST_DIR || path.join(repo, "dist")),
  }),
);
app.use(errorHandler);
const port = Number(process.env.PORT || 43173);
const server = app.listen(port, network.host, () => {
  log.info("service", "AI3D listening", {
    host: network.host,
    port: server.address().port,
    pid: process.pid,
    instance: instance?.id,
    accessRequired,
  });
  // A desktop host starts the service on an ephemeral port and needs the
  // answer before it can point a WebView at it. The ready file is written
  // only after the listener is actually accepting connections, so whoever
  // reads it can navigate immediately without polling health first.
  if (process.env.REVIEW_READY_FILE)
    fs.writeFileSync(
      process.env.REVIEW_READY_FILE,
      JSON.stringify({
        app: "3d-agent-review",
        host: network.host,
        port: server.address().port,
        url: `http://${network.host}:${server.address().port}/`,
        pid: process.pid,
      }),
    );
});
function shutdown() {
  server.close();
  agentServer.close(() => process.exit(0));
}
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, shutdown);

// One tick of grace separates the notice from the exit, so the interval is also
// how long the page has to explain itself — a minute is about twenty-seven of
// the viewer's polls. Reclaiming is announced, never sudden.
const idleTimer = idle
  ? setInterval(
      () => {
        const phase = idle.tick();
        if (phase === "closing")
          log.info("service", "idle; announcing reclaim", {
            idleHours: idleMs / 3_600_000,
            instance: instance?.id,
          });
        else if (phase === "expired") {
          // A batch that never reached the host is not a reason to stay: a
          // broken bridge would then make every instance immortal, which is the
          // behaviour this replaced, reintroduced through a side door. It is a
          // reason to say so — the outbox drains again the moment the project
          // is reopened, and nobody should have to guess that.
          const outbox = outboxSummary();
          log.info(
            "service",
            "reclaimed after idle; the round is kept on disk",
            {
              idleHours: idleMs / 3_600_000,
              pid: process.pid,
              ...(outbox.pending
                ? { undelivered: outbox.pending, retriesOnReopen: true }
                : {}),
            },
          );
          shutdown();
        }
      },
      Math.max(1000, Number(process.env.REVIEW_IDLE_TICK_MS) || 60_000),
    )
  : null;
idleTimer?.unref();
