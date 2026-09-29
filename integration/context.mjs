import fs from "node:fs";
import path from "node:path";
import { normalizeOrigin } from "../server/origin.mjs";
import { within } from "../server/paths.mjs";

export class IntegrationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
export const fail = (code, message) => {
  throw new IntegrationError(code, message);
};
export { within };
// Every field a host tool context carries is optional in the host's own type
// declaration, so which ones AI3D cannot work without is AI3D's judgment
// to make, one field at a time, from what each one is used for. Requiring a
// field that only narrows something is how a host that supplies less context
// gets refused for no reason -- and a guard that merges several fields into one
// condition cannot say which one was missing, so the refusal misleads whoever
// reads it. This table is the single place that judgment lives: the guards, the
// inspect probe and the interface doc all derive from it.
//
// need "workspace" workspaceContext refuses without it
//      "owner"     who may change this review; every host must answer it
//      "route"     where a batch is delivered; only a host that can be pushed
//                  to has one, so this is a property of the adapter rather than
//                  of AI3D. The branch in trustedOrigin decides for OpenClaw
//      null        optional; `absent` is what AI3D does instead
export const HOST_CONTEXT = [
  {
    key: "workspace",
    need: "workspace",
    label: "workspace",
    read: (ctx) => ctx.workspaceDir,
    use: "Root every project path is resolved and contained against.",
    absent: "Refuse: a guessed root writes into somewhere real.",
  },
  {
    key: "agent",
    need: "workspace",
    label: "Agent",
    read: (ctx) => ctx.agentId,
    use: "Part of the instance identity hash, so two agents sharing a workspace never share a review.",
    absent: "Refuse: the identity would not be stable between calls.",
  },
  {
    key: "sessionKey",
    need: "owner",
    label: "session",
    read: (ctx) => ctx.sessionKey,
    use: "Names the conversation a submitted batch is delivered back to.",
    absent:
      "Refuse: delivering into the wrong conversation is worse than not delivering.",
  },
  {
    key: "sessionGeneration",
    need: "owner",
    label: "session generation",
    read: (ctx) => ctx.sessionId,
    use: "Generation fence, so /new or /reset cannot silently resume a bound round.",
    absent: "Refuse: without it a stale round looks current.",
  },
  {
    key: "channel",
    need: "route",
    label: "channel",
    read: (ctx) => ctx.deliveryContext?.channel || ctx.messageChannel || null,
    use: "Selects the shape of the return route.",
    absent: "The channel branch below refuses to bind the round.",
    report: (ctx) => ctx.deliveryContext?.channel || ctx.messageChannel || null,
  },
  {
    key: "deliveryTarget",
    need: "route",
    label: "return target",
    read: (ctx) => ctx.deliveryContext?.to,
    use: "Chat the bound conversation belongs to.",
    absent: "The channel branch below refuses to bind the round.",
  },
  {
    key: "deliveryAccount",
    need: "route",
    label: "return account",
    read: (ctx) => ctx.deliveryContext?.accountId,
    use: "Host account the bound conversation belongs to.",
    absent: "The channel branch below refuses to bind the round.",
  },
  {
    key: "deliveryThread",
    need: null,
    label: "return topic",
    read: (ctx) => ctx.deliveryContext?.threadId,
    use: "Forum topic of the bound conversation.",
    absent: "Recovered from the target when that carries one.",
  },
  {
    key: "fsPolicy",
    need: null,
    label: "file policy",
    read: (ctx) => ctx.fsPolicy,
    use: "A narrower root the host already applies to its own file tools, to be mirrored here.",
    absent:
      "Contain to the workspace root: this object is built alongside the host's own file tools, so a host that builds none has no narrower root to mirror rather than a denial to honour.",
  },
  {
    key: "sandboxed",
    need: null,
    label: "sandbox",
    read: (ctx) => ctx.sandboxed,
    use: "Host-side sandbox; a host service cannot be started from inside one.",
    absent: "Absent means not sandboxed.",
  },
];
const present = (value) =>
  value !== undefined && value !== null && value !== false && value !== "";
function requireContext(ctx, need, code, tail) {
  const missing = HOST_CONTEXT.filter(
    (field) => field.need === need && !present(field.read(ctx)),
  );
  if (missing.length)
    fail(
      code,
      `The host did not supply ${missing.map((field) => `${field.label} (${field.key})`).join(", ")}. ${tail}`,
    );
}
export function contextSummary(ctx) {
  return Object.fromEntries(
    HOST_CONTEXT.map((field) => [
      field.key,
      field.report ? field.report(ctx) : present(field.read(ctx)),
    ]),
  );
}
export function workspaceContext(ctx) {
  if (ctx.sandboxed)
    fail(
      "HOST_UNAVAILABLE",
      "This session is sandboxed; no host service was started outside it.",
    );
  requireContext(
    ctx,
    "workspace",
    "MISSING_CONTEXT",
    "No data location was guessed.",
  );
  const workspace = fs.realpathSync(ctx.workspaceDir);
  const fsPolicy = ctx.fsPolicy ?? { workspaceOnly: true };
  const allowed = fsPolicy.workspaceOnly
    ? fs.realpathSync(fsPolicy.root || workspace)
    : workspace;
  if (!within(workspace, allowed))
    fail("PATH_SCOPE", "The file policy root is outside this workspace.");
  return { workspace, allowed, agentId: ctx.agentId };
}
export function trustedOrigin(ctx) {
  requireContext(
    ctx,
    "owner",
    "MISSING_ORIGIN",
    "No previous topic was reused.",
  );
  const d = ctx.deliveryContext;
  const channel = d?.channel || ctx.messageChannel;
  const base = {
    harness: "openclaw",
    sessionKey: ctx.sessionKey,
    sessionId: ctx.sessionId,
  };
  // OpenClaw can always be written back to, so this host still refuses to bind
  // a round it could not deliver into. A host that offers no delivery at all
  // will supply an owner and no route; that is a different answer, not this
  // failure, and it belongs to whichever adapter speaks for such a host.
  if (channel === "webchat")
    return normalizeOrigin({ ...base, route: { channel } });
  if (channel !== "telegram" || !d?.to || !d.accountId)
    fail(
      "MISSING_ORIGIN",
      "This entry has no supported return address for its originating session.",
    );
  const match = /^(?:telegram:)?(-?\d+)(?::topic:(\d+))?$/.exec(d.to);
  const thread = d.threadId == null ? undefined : String(d.threadId);
  if (!match || (match[2] && thread && match[2] !== thread))
    fail("BAD_ORIGIN", "The host gave inconsistent Telegram topic details.");
  return normalizeOrigin({
    ...base,
    route: {
      channel,
      target: match[1],
      accountId: d.accountId,
      ...(thread || match[2] ? { threadId: thread || match[2] } : {}),
    },
  });
}
// Still every field that was ever compared, so nothing a round used to refuse
// becomes allowed. Two origins with no route agree only when their owner does,
// which is the whole comparison a host without delivery can support.
export function sameRoute(a, b) {
  const identity = (v) =>
    v &&
    JSON.stringify([
      v.harness,
      v.sessionKey,
      v.route?.channel,
      v.route?.target,
      v.route?.accountId,
      v.route?.threadId,
    ]);
  return identity(a) === identity(b);
}
// Walk parents before creation; checking only the final leaf after mkdir would
// already have written through a symlink. Recheck on every tool invocation.
export function scopedPath(
  root,
  relative,
  { create = false, directory = false } = {},
) {
  if (
    typeof relative !== "string" ||
    !relative ||
    path.isAbsolute(relative) ||
    relative.includes("\0")
  )
    fail("PATH_SCOPE", "Use a path relative to the workspace.");
  const target = path.resolve(root, relative);
  if (!within(root, target))
    fail("PATH_SCOPE", "That path lies outside the permitted workspace.");
  let current = root;
  const parts = path.relative(root, target).split(path.sep).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    if (
      fs.existsSync(current) ||
      (() => {
        try {
          fs.lstatSync(current);
          return true;
        } catch {
          return false;
        }
      })()
    ) {
      const real = fs.realpathSync(current);
      if (!within(root, real))
        fail("PATH_SCOPE", "A symlink points outside the workspace.");
      current = real;
    } else if (create && (directory || i < parts.length - 1)) {
      fs.mkdirSync(current, { mode: 0o700 });
    } else fail("NOT_FOUND", "That file or project does not exist yet.");
  }
  if (directory && !fs.statSync(current).isDirectory())
    fail("PATH_SCOPE", "The project path is not a directory.");
  return current;
}
