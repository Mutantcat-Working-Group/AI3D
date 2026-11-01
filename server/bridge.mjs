import { execCommand } from "./command.mjs";
import { normalizeOrigin, deliveryParams } from "./origin.mjs";

// Every failure out of call() carries the host's own two fields, so a caller
// never has to parse prose to find out what went wrong or whether to retry.
function hostFailure(method, { code, message }) {
  const failure = new Error(`OpenClaw did not accept the request: ${message}`);
  failure.method = method;
  failure.hostError = { code, message: String(message).slice(0, 300) };
  return failure;
}
// execFile puts the whole command line in its message, and for chat.send that
// line contains the annotation text. A review's log file outlives the review
// and is not access controlled, so the payload must not reach it: report the
// spawn failure by its own fields instead.
function spawnFailure(method, error) {
  const reason = error.killed
    ? "the call timed out"
    : error.code === "ENOENT"
      ? "the openclaw command was not found"
      : `openclaw exited with ${error.code ?? "?"}`;
  const detail = String(error.stderr || "")
    .trim()
    .slice(0, 200);
  return hostFailure(method, {
    code: error.killed ? "TIMEOUT" : `SPAWN_${error.code ?? "FAILED"}`,
    message: detail ? `${reason}：${detail}` : reason,
  });
}

export class OpenClawBridge {
  constructor(sessionKey, { enabled = true } = {}) {
    this.origin = normalizeOrigin(sessionKey);
    this.sessionKey = this.origin?.sessionKey;
    this.enabled = enabled && !!this.origin;
    this.cached = null;
    this.pending = null;
    this.visibleMessages = new Map();
  }
  async call(method, params) {
    if (!this.enabled)
      throw new Error("This test service has no OpenClaw connection enabled.");
    const argv = [
      "gateway",
      "call",
      method,
      "--params",
      JSON.stringify(params),
      "--json",
      "--timeout",
      "20000",
    ];
    const options = { timeout: 25000, maxBuffer: 4 * 1024 * 1024 };
    let stdout;
    let refused = false;
    try {
      ({ stdout } = await execCommand("openclaw", argv, options));
    } catch (error) {
      // A refused call still prints its typed reason on stdout and only then
      // exits non-zero. execFile rejects on the exit code before any of that is
      // read, so the reason used to be discarded and every retry rediscovered
      // nothing: an admin-scope rejection stalled a whole review round while
      // the log said only "Command failed". Keep the payload when there is one.
      if (typeof error.stdout !== "string" || !error.stdout.trim())
        throw spawnFailure(method, error);
      stdout = error.stdout;
      refused = true;
    }
    let data;
    try {
      data = JSON.parse(stdout);
    } catch {
      throw hostFailure(method, {
        code: "UNPARSEABLE_RESPONSE",
        message: `The response could not be parsed: ${String(stdout).slice(0, 200)}`,
      });
    }
    // A non-zero exit is a failure even if the payload does not say so, so it
    // can never be read back as an accepted send.
    if (refused || data.error || data.ok === false) {
      // Keep the host's own reason: this is the only place it exists, and every
      // layer above needs it to be the same two fields whatever shape it took.
      const raw = data.error;
      throw hostFailure(method, {
        code:
          (typeof raw === "object" && raw?.code) ||
          (data.ok === false ? "REFUSED" : "UNKNOWN"),
        message:
          typeof raw === "string"
            ? raw
            : typeof raw?.message === "string"
              ? raw.message
              : JSON.stringify(raw ?? data).slice(0, 300),
      });
    }
    return data;
  }
  async send(message, id) {
    let fence = {};
    if (this.origin?.sessionId) {
      const history = await this.call("chat.history", {
        sessionKey: this.sessionKey,
        limit: 1,
        maxBytes: 2000,
      });
      const info = history.sessionInfo || history;
      if (
        (history.sessionId || info.sessionId) !== this.origin.sessionId ||
        !Object.hasOwn(info, "activeLeafEntryId")
      ) {
        throw new Error(
          "The originating session changed or the host could not verify it; the submission is kept and was not forwarded to a new task.",
        );
      }
      // Host revalidates both under the admission writer barrier. A check then
      // an unfenced send would still race /new. Never use steer here.
      fence = {
        sessionId: this.origin.sessionId,
        expectedLeafEntryId: info.activeLeafEntryId,
        queueMode: "collect",
      };
    }
    return this.call("chat.send", {
      ...deliveryParams(this.origin),
      ...fence,
      message,
      idempotencyKey: id,
    });
  }
  async history(since = 0) {
    if (this.cached?.since === since && Date.now() - this.cached.at < 4000)
      return this.cached.data;
    if (this.pending) {
      await this.pending;
      return this.history(since);
    }
    this.pending = (async () => {
      let data;
      let offset;
      const seenOffsets = new Set();
      const raw = [];
      // Tool-heavy turns can fill an entire history page. Fetch a bounded
      // backfill and retain already-seen conversation text across polls.
      for (let page = 0; page < 3; page++) {
        const current = await this.call("chat.history", {
          sessionKey: this.sessionKey,
          limit: 80,
          maxBytes: 160000,
          ...(offset === undefined ? {} : { offset }),
        });
        data ||= current;
        raw.unshift(...(current.messages || []));
        const visible = raw.filter(
          (m) =>
            ["user", "assistant"].includes(m.role) &&
            m.channel !== "analysis" &&
            (typeof m.content === "string"
              ? m.content.trim()
              : (m.content || []).some(
                  (c) => c.type === "text" && c.text?.trim(),
                )),
        );
        const oldest = raw.reduce((min, m) => {
          const time = Number(m.timestamp) || Date.parse(m.timestamp);
          return Number.isFinite(time) ? Math.min(min, time) : min;
        }, Infinity);
        const next = current.nextOffset;
        if (
          visible.length >= 12 ||
          oldest < since ||
          !current.hasMore ||
          !Number.isInteger(next) ||
          seenOffsets.has(next)
        )
          break;
        seenOffsets.add(next);
        offset = next;
      }
      const messages = raw
        .filter(
          (m) =>
            ["user", "assistant"].includes(m.role) && m.channel !== "analysis",
        )
        .filter(
          (m) => (Number(m.timestamp) || Date.parse(m.timestamp) || 0) >= since,
        )
        .map((m) => ({
          id:
            m.__openclaw?.id || m.idempotencyKey || `${m.timestamp}-${m.role}`,
          role: m.role,
          timestamp: m.timestamp,
          text: (typeof m.content === "string"
            ? m.content
            : (m.content || [])
                .filter((c) => c.type === "text" && c.text)
                .map((c) => c.text)
                .join("\n")
          ).slice(0, 12000),
        }))
        .filter((m) => m.text.trim());
      for (const m of messages) this.visibleMessages.set(m.id, m);
      const retained = [...this.visibleMessages.values()]
        .filter(
          (m) => (Number(m.timestamp) || Date.parse(m.timestamp) || 0) >= since,
        )
        .sort(
          (a, b) =>
            (Number(a.timestamp) || Date.parse(a.timestamp) || 0) -
            (Number(b.timestamp) || Date.parse(b.timestamp) || 0),
        )
        .slice(-40);
      this.visibleMessages = new Map(retained.map((m) => [m.id, m]));
      const result = {
        connected: true,
        busy: !!data.inFlightRun,
        messages: retained,
      };
      this.cached = { at: Date.now(), since, data: result };
      return result;
    })();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }
}
