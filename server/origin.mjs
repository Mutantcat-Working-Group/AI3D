import { z } from "zod";

const text = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[^\x00-\x1f\x7f]+$/);

// A route is an address a submission can be pushed to. Only a harness that can
// write into its own conversation has one. A client reached over a tool
// protocol has no such address at all, and for it an absent route is the
// accurate description rather than a field someone forgot to fill in.
export const routeSchema = z.discriminatedUnion("channel", [
  z.object({ channel: z.literal("webchat") }).strict(),
  z
    .object({
      channel: z.literal("telegram"),
      target: z.string().regex(/^-?\d+$/),
      accountId: text,
      threadId: z.string().regex(/^\d+$/).optional(),
    })
    .strict(),
]);

// Ownership and delivery are separate questions that used to share one shape.
// harness and sessionKey answer "who may change this review"; route answers
// "where does a batch go". Modelling identity as a chat route meant a harness
// without one could not be described, not even to refuse it politely.
export const originSchema = z
  .object({
    harness: text.default("openclaw"),
    sessionKey: text,
    sessionId: text.optional(),
    route: routeSchema.optional(),
  })
  .strict();

const ROUTE_KEYS = ["channel", "target", "accountId", "threadId"];

// Every stored origin wrote the route flat beside the identity, and so does
// every caller written before the split. Read that shape as it stands: moving a
// field is not worth rewriting the state file of every project that ever held a
// review, and a half-migrated estate is worse than two accepted spellings of
// the same thing. Lifting happens here alone, so the strict schema below stays
// the single description of what an origin is.
function liftLegacyRoute(value) {
  if (!value || typeof value !== "object") return value;
  if ("route" in value || !ROUTE_KEYS.some((key) => key in value)) return value;
  const route = {};
  const identity = { ...value };
  for (const key of ROUTE_KEYS) {
    if (value[key] !== undefined) route[key] = value[key];
    delete identity[key];
  }
  return { ...identity, route };
}

export const originInput = z.preprocess(liftLegacyRoute, originSchema);

export function normalizeOrigin(value) {
  if (!value) return null;
  return originInput.parse(
    typeof value === "string"
      ? { sessionKey: value, route: { channel: "webchat" } }
      : value,
  );
}

export function deliveryParams(value) {
  const origin = normalizeOrigin(value);
  if (!origin)
    throw new Error(
      "This batch is bound to no originating session and was not sent anywhere else.",
    );
  // Nowhere to push is not a failure to push. The batch is already durable and
  // waits to be read; saying "delivery failed" about a host that never offered
  // delivery would report a fault that does not exist.
  if (!origin.route)
    throw new Error(
      "This origin has no return route; the submission waits to be read and was not delivered.",
    );
  if (origin.route.channel === "webchat")
    return { sessionKey: origin.sessionKey, deliver: false };
  // The host resolves the destination from the session itself. Naming it here
  // with originating* route fields is an admin-scoped override that a normal
  // operator client cannot use — the Gateway answers "originating route fields
  // require admin scope" and the whole review round stalls unconfirmed. AI3D
  // never needed the override: sessionKey already identifies the exact channel,
  // chat and topic this batch was bound to, and the caller cannot widen that.
  // The frozen target/accountId/threadId stay on the stored route as a record
  // of where the batch was bound, not as a delivery instruction. Generation
  // safety comes from the sessionId check and expectedLeafEntryId fence in
  // OpenClawBridge.send, which are unaffected.
  return { sessionKey: origin.sessionKey, deliver: true };
}
