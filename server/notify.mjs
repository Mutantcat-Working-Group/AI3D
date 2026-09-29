import { OpenClawBridge } from "./bridge.mjs";
import { normalizeOrigin } from "./origin.mjs";

// A notifier describes what a host offers, not what AI3D requires. There are
// two capabilities and a host may have either, both or neither:
//
//   send(message, key)  push a batch into the conversation that owns it
//   observe(since)      read that conversation back to confirm it arrived
//
// A host with no send is not a broken host. Reached over a tool protocol there
// is no way to wake a conversation at all, so its Agent collects batches by
// asking — and a batch waiting to be collected must never be reported as a
// delivery that failed, because the page turns that into a standing alarm.
//
// A host with send but no observe is the honest common case: delivery is
// confirmed by the Agent acknowledging its read, not by AI3D reading the
// conversation over the Agent's shoulder.
export function notifierFor(value, { enabled = true } = {}) {
  const origin = normalizeOrigin(value);
  if (!enabled || !origin?.route) return null;
  // Only OpenClaw can be pushed to today. The check is here rather than in the
  // schema so that another harness arriving is a new branch, not a new refusal.
  if (origin.harness !== "openclaw") return null;
  const bridge = new OpenClawBridge(origin);
  if (!bridge.enabled) return null;
  return {
    harness: origin.harness,
    send: (message, key) => bridge.send(message, key),
    observe: (since) => bridge.history(since),
  };
}

// What `status` reports, so an Agent can tell "nobody will tell me" from
// "someone will" without inferring it from a failure.
export function notifierSummary(notifier) {
  return {
    send: !!notifier?.send,
    observe: !!notifier?.observe,
  };
}
