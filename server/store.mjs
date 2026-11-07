import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { normalizeOrigin } from "./origin.mjs";
import { log, errorDetail } from "./log.mjs";

export class ReviewError extends Error {
  constructor(message, status = 409, code = "CONFLICT") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
export class ReviewStore {
  constructor(dir, { legacyOrigin = null } = {}) {
    this.dir = dir;
    this.file = path.join(dir, "state.json");
    this.state = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, "utf8"))
      : {
          schemaVersion: 2,
          generation: 0,
          active: null,
          models: {},
          drafts: {},
          presence: {},
          echoes: {},
          submissions: [],
          messages: [],
          retainVersions: null,
          startedAt: Date.now(),
        };
    if (![1, 2].includes(this.state.schemaVersion))
      throw new ReviewError(
        "Unsupported data version; nothing was migrated or overwritten.",
        409,
        "STATE_VERSION",
      );
    // A review saved before retention existed shows everything, which is what
    // it was doing already — absence is the same as "no rule", not a migration.
    this.state.retainVersions ??= null;
    this.restoreSubmissionAnnotations();
    // Keep immutable published assets downloadable even when an unsubmitted
    // view has not yet observed a newer active version.
    this.state.models ||= {};
    for (const model of [
      this.state.active,
      this.state.pending,
      ...this.state.submissions.map((s) => s.model),
    ]) {
      if (model) this.state.models[model.id] ||= model;
    }
    // Freeze legacy routing once, separately from immutable submission files.
    // A subsequent config edit must never redirect an old submission retry.
    // Origins stored before the route moved out of the identity are lifted on
    // the way in, not left in their own spelling: two shapes in memory compare
    // unequal, and the comparison that suffers is the one deciding whether a
    // session may resume its own round.
    this.state.reviewOrigin = Object.hasOwn(this.state, "reviewOrigin")
      ? normalizeOrigin(this.state.reviewOrigin)
      : normalizeOrigin(legacyOrigin);
    if (!this.state.reviewId) {
      this.state.reviewId = crypto.randomUUID();
      // Only the pre-0.4 active review may import a model-only browser cache.
      if (this.state.active)
        this.state.legacyDraftReviewId = this.state.reviewId;
    }
    if (!Object.hasOwn(this.state, "pendingOrigin"))
      this.state.pendingOrigin = this.state.pending
        ? structuredClone(this.state.reviewOrigin)
        : null;
    if (!Object.hasOwn(this.state, "legacySubmissionOrigins"))
      this.state.legacySubmissionOrigins = Object.fromEntries(
        this.state.submissions
          .filter((item) => !Object.hasOwn(item, "origin"))
          .map((item) => [item.id, normalizeOrigin(legacyOrigin)]),
      );
    this.state.bindingId ||= crypto.randomUUID();
    this.state.modelBindings ||= {};
    this.state.legacySubmissionBindings ||= Object.fromEntries(
      this.state.submissions
        .filter((item) => !item.bindingId)
        .map((item) => [
          item.id,
          isDeepStrictEqual(
            this.submissionOrigin(item),
            this.state.reviewOrigin,
          )
            ? this.state.bindingId
            : null,
        ]),
    );
    /* Every published model is bound, not just the two the queue could hold.
       Schema 1 kept one draft, one lock and one pending slot, so a version
       that had been published and then superseded had nowhere to record which
       conversation owned it; it stayed in `models` and was listed nowhere.
       Binding each one as it is found restores what the version tabs need to
       show it, and a version whose submission came from another conversation
       keeps a binding of its own rather than inheriting this review's. */
    const submissionBinding = new Map(
      this.state.submissions.map((item) => [
        item.versionId,
        item.bindingId ?? this.state.legacySubmissionBindings[item.id] ?? null,
      ]),
    );
    for (const model of Object.values(this.state.models)) {
      if (!model?.id) continue;
      this.registerModelBinding(
        model.id,
        submissionBinding.get(model.id) ?? this.state.bindingId,
      );
    }
    if (this.state.active)
      this.registerModelBinding(this.state.active.id, this.state.bindingId);
    if (this.state.pending) {
      this.state.pendingBindingId ||= isDeepStrictEqual(
        this.state.pendingOrigin,
        this.state.reviewOrigin,
      )
        ? this.state.bindingId
        : crypto.randomUUID();
      this.registerModelBinding(
        this.state.pending.id,
        this.state.pendingBindingId,
      );
    }
    this.migrateToSchema2();
    this.save();
  }
  // Schema 1 held one draft, one lock, one echo and one queued model, so every
  // one of them had to be surrendered before the next version could be shown.
  // Schema 2 keys all four by version: switching what is displayed no longer
  // destroys anything, which is what let the queue and its gate be removed.
  migrateToSchema2() {
    const s = this.state;
    s.models ||= {};
    s.modelOrigins ||= {};
    s.drafts ||= {};
    s.presence ||= {};
    s.echoes ||= {};
    if (s.schemaVersion === 2) return;
    for (const [id, model] of Object.entries(s.models))
      s.modelOrigins[id] ||= structuredClone(
        model.id === s.pending?.id ? s.pendingOrigin : s.reviewOrigin,
      );
    if (s.draft?.versionId) s.drafts[s.draft.versionId] = s.draft;
    if (s.lock?.versionId)
      s.presence[s.lock.versionId] = {
        clientId: s.lock.clientId,
        touchedAt: s.lock.touchedAt,
      };
    if (s.echo?.versionId) s.echoes[s.echo.versionId] = s.echo;
    // A queued model was already published; it just had nowhere to go. Keep it
    // as an ordinary version so it is immediately selectable instead of lost.
    if (s.pending) {
      s.models[s.pending.id] ||= structuredClone(s.pending);
      s.modelOrigins[s.pending.id] ||= structuredClone(s.pendingOrigin);
    }
    for (const key of [
      "draft",
      "lock",
      "echo",
      "pending",
      "pendingOrigin",
      "pendingBindingId",
    ])
      delete s[key];
    s.schemaVersion = 2;
    log.warn("store", "migrated review state to schema 2", {
      versions: Object.keys(s.models).length,
      drafts: Object.keys(s.drafts).length,
    });
  }
  registerModelBinding(modelId, bindingId) {
    /* An own array or nothing. `map[key] ||= []` reads the prototype chain
       before it writes, so a version named `constructor` or `toString` found
       `Object` or a function already there and died on `.includes` — while a
       version named `__proto__` would have replaced the prototype of the whole
       map instead of adding a key. */
    const bindings = Object.hasOwn(this.state.modelBindings, modelId)
      ? this.state.modelBindings[modelId]
      : [];
    if (!Array.isArray(bindings))
      throw new ReviewError(
        "This review's stored bindings are not readable; nothing was published.",
        409,
        "STATE_VERSION",
      );
    if (!bindings.includes(bindingId)) bindings.push(bindingId);
    this.put(this.state.modelBindings, modelId, bindings);
  }
  /* A key that is a plain property, not an assignment. `map[key] = value` runs
     the `__proto__` setter when the key spells it, so a version published under
     that name changed the prototype of the map instead of adding an entry —
     and the version, its origin and its file all silently disappeared on the
     next load. */
  put(map, key, value) {
    Object.defineProperty(map, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  modelInBinding(filename) {
    return Object.values(this.state.models).some(
      (model) =>
        // A source the viewer cannot draw reaches the page as the mesh derived
        // from it, so a round grants access to both halves of the same version
        // or the page would be refused the only file it can actually load.
        (model.filename === filename || model.mesh?.filename === filename) &&
        this.state.modelBindings[model.id]?.includes(this.state.bindingId),
    );
  }
  submissionInBinding(item) {
    return (
      (item.bindingId ?? this.state.legacySubmissionBindings[item.id]) ===
      this.state.bindingId
    );
  }
  // Submission annotations already have their own immutable file. Keeping a
  // second copy in state.json meant every lock heartbeat rewrote the whole
  // review history, and the file grew without bound for the lifetime of the
  // project. They stay in memory; only the durable copy is deduplicated.
  serializable() {
    return {
      ...this.state,
      submissions: this.state.submissions.map(
        ({ annotations, ...rest }) => rest,
      ),
    };
  }
  save() {
    atomicJson(this.file, this.serializable());
  }
  restoreSubmissionAnnotations() {
    for (const item of this.state.submissions) {
      if (Array.isArray(item.annotations)) continue;
      try {
        const stored = JSON.parse(
          fs.readFileSync(
            path.join(this.dir, "submissions", `${item.id}.json`),
            "utf8",
          ),
        );
        if (stored.id === item.id && Array.isArray(stored.annotations))
          item.annotations = stored.annotations;
      } catch (error) {
        log.error("store", "submission annotations could not be reloaded", {
          submissionId: item.id,
          ...errorDetail(error),
        });
      }
      item.annotations ||= [];
    }
  }
  recordViewerReceipt(clientId, receipt) {
    const receipts = (this.state.viewerReceipts ||= {});
    receipts[clientId] = receipt;
    // One entry per tab, and a browser stays remembered for a month. Bound it
    // the way browser client associations already are, and never drop the
    // receipt the current review lock depends on to resume.
    const held = new Set(
      Object.values(this.state.presence).map((p) => p.clientId),
    );
    const ids = Object.keys(receipts).filter((id) => !held.has(id));
    if (ids.length > 64)
      for (const id of ids
        .sort(
          (a, b) => (receipts[a].loadedAt || 0) - (receipts[b].loadedAt || 0),
        )
        .slice(0, ids.length - 64))
        delete receipts[id];
    this.save();
    return receipts[clientId];
  }
  versionInBinding(versionId) {
    /* Own property or nothing. These two maps are keyed by whatever a version
       was published under, and a plain `map[key]` consults the prototype chain
       first: `models.constructor`, `models.toString` and `models.__proto__` all
       answer with something truthy that is not a version, and the lookup that
       follows then calls `.includes` on `Object` or reads `.length` off a
       function. A name that reaches this code came off disk or off the wire,
       so it is not allowed to borrow meaning from `Object.prototype`. */
    return (
      Object.hasOwn(this.state.models, versionId) &&
      !!this.state.modelBindings[versionId]?.includes(this.state.bindingId)
    );
  }
  // Every version this review has published, oldest first. The workstation
  // shows them as tabs, so a marking made against an older model stays a
  // first-class act instead of something the reviewer has to describe in prose.
  /* Twenty tabs is a wall of history in front of the model. Retention is a
     standing rule rather than a one-off tidy-up, so the next version published
     pushes the oldest out of view on its own — and it hides, never deletes:
     the draft, the marks and the file of a hidden version are all still there,
     and raising the number brings it back exactly as it was. */
  retained(sorted) {
    const keep = this.state.retainVersions;
    if (!keep || sorted.length <= keep) return sorted;
    const recent = new Set(sorted.slice(-keep).map((m) => m.id));
    return sorted.filter((m) => recent.has(m.id) || this.mustShow(m.id));
  }
  // Three things outrank the rule: what is on screen, what someone is marking
  // right now, and marks that have not been sent yet. Hiding any of those would
  // take something away from the reviewer rather than tidy up behind them.
  mustShow(versionId) {
    if (this.state.active?.id === versionId) return "on screen";
    if (this.livePresence(versionId)) return "being marked";
    if (this.hasUnsubmitted(versionId)) return "holds unsubmitted marks";
    return null;
  }
  inBindingOrder() {
    return Object.values(this.state.models)
      .filter((model) => this.versionInBinding(model.id))
      .sort((a, b) => (a.publishedAt || 0) - (b.publishedAt || 0));
  }
  retain(keep) {
    const value = Number.isFinite(keep) && keep > 0 ? Math.floor(keep) : null;
    this.state.retainVersions = value;
    this.save();
    const all = this.inBindingOrder();
    const shown = this.retained(all);
    const shownIds = new Set(shown.map((m) => m.id));
    const recent = value ? new Set(all.slice(-value).map((m) => m.id)) : null;
    const name = (m) => ({ id: m.id, version: m.version });
    return {
      retain: value,
      showing: shown.map(name),
      hidden: all.filter((m) => !shownIds.has(m.id)).map(name),
      // Said out loud, because "show the latest three" quietly showing four is
      // the kind of thing the Agent has to be able to pass on.
      keptVisible: recent
        ? all
            .filter((m) => !recent.has(m.id) && shownIds.has(m.id))
            .map((m) => ({ ...name(m), because: this.mustShow(m.id) }))
        : [],
    };
  }
  versions(clientId) {
    const s = this.state;
    return this.retained(this.inBindingOrder()).map((model) => {
      // Own property, for the same reason `versionInBinding` asks: a version
      // named `constructor` or `toString` would otherwise read the prototype's
      // function and die on `.length` before the page ever saw the list.
      const draft = Object.hasOwn(s.drafts, model.id)
        ? s.drafts[model.id]
        : null;
      const presence = this.livePresence(model.id);
      return {
        id: model.id,
        name: model.name,
        version: model.version,
        label: model.label || null,
        triangles: model.triangles,
        bytes: model.bytes,
        publishedAt: model.publishedAt,
        active: s.active?.id === model.id,
        annotations: draft?.annotations.length || 0,
        unsubmitted: this.hasUnsubmitted(model.id),
        submissions: s.submissions.filter(
          (item) =>
            item.versionId === model.id && this.submissionInBinding(item),
        ).length,
        busy: !!presence && presence.clientId !== clientId,
      };
    });
  }
  livePresence(versionId, within = 30000) {
    const p = Object.hasOwn(this.state.presence, versionId)
      ? this.state.presence[versionId]
      : null;
    return p && Date.now() - p.touchedAt < within ? p : null;
  }
  // Rebinding this project to another conversation is the one act that really
  // destroys: it resets the current version's draft and hides earlier batches.
  // Unlike the review's own controls it therefore still waits — but on evidence
  // that expires, so an abandoned tab cannot block it for longer than presence.
  busyReason() {
    const versions = Object.keys(this.state.models).filter((id) =>
      this.versionInBinding(id),
    );
    if (versions.some((id) => this.livePresence(id)))
      return "Someone is marking; ";
    if (versions.some((id) => this.hasUnsubmitted(id)))
      return "The originating session still holds unsubmitted marks; send them to the Agent from the page first. ";
    return null;
  }
  hasUnsubmitted(versionId) {
    const d = Object.hasOwn(this.state.drafts, versionId)
      ? this.state.drafts[versionId]
      : null;
    return !!(
      d &&
      (d.annotations.length || d.submittedRevision != null) &&
      d.submittedRevision !== d.revision
    );
  }
  // The workstation renders these; it never recomputes them. Two deadlocks came
  // from the browser deciding on its own that an action was unavailable while
  // the server would have allowed it, with no way for the reviewer to see why.
  capabilities(clientId, versionId) {
    const known = this.versionInBinding(versionId);
    const draft = Object.hasOwn(this.state.drafts, versionId)
      ? this.state.drafts[versionId]
      : null;
    const marked = !!(
      draft &&
      (draft.annotations.length || draft.submittedRevision != null)
    );
    /* Named, not worded. This reaches the reviewer's screen, and the reviewer's
       language is settled in the browser, not here — the service has no way to
       know it and no business guessing. */
    if (!known)
      return {
        canEdit: false,
        canSubmit: false,
        canFinish: false,
        blocked: "NOT_IN_REVIEW",
      };
    const closed = !!draft?.closedAt;
    return {
      canEdit: true,
      canSubmit: marked,
      canFinish: marked && !closed,
      blocked: !marked ? "NOT_MARKED" : closed ? "ROUND_CLOSED" : null,
    };
  }
  publicState(clientId, requested) {
    const s = this.state;
    const viewing = this.versionInBinding(requested)
      ? requested
      : (s.active?.id ?? null);
    /* Own properties only, everywhere a version id indexes a map. `versionId`
       may be `constructor` or `toString` — both are legal version names under
       the route's own pattern — and a prototype read there returns a function
       or a `null`-prototype object rather than "nothing", which is how a
       name like that turned one bad request into a 500. */
    const own = (map, key) =>
      viewing && Object.hasOwn(map, key) ? map[key] : null;
    const echo = own(s.echoes, viewing);
    const presence = viewing ? this.livePresence(viewing) : null;
    return {
      generation: s.generation,
      reviewId: s.reviewId,
      legacyDraftCache: s.legacyDraftReviewId === s.reviewId,
      active: s.active,
      viewing,
      /* The complete record for the version being looked at, which is not
         always the one the Agent is showing. The page loads this one. */
      model: viewing ? (s.models[viewing] ?? null) : null,
      versions: this.versions(clientId),
      // Who is here, not who may act: capabilities answer that now.
      locked: !!presence && presence.clientId !== clientId,
      owned: !!presence && presence.clientId === clientId,
      presence: presence
        ? {
            mine: presence.clientId === clientId,
            touchedAt: presence.touchedAt,
          }
        : null,
      draft: viewing ? (s.drafts[viewing] ?? null) : null,
      capabilities: this.capabilities(clientId, viewing),
      echo:
        echo &&
        s.submissions.some(
          (item) =>
            item.id === echo.submissionId && this.submissionInBinding(item),
        )
          ? echo
          : null,
      submissions: s.submissions
        .filter((item) => this.submissionInBinding(item))
        .slice(-20)
        .map(({ annotations, origin, ...x }) => x),
      messages: s.messages.slice(-60),
      startedAt: s.startedAt,
    };
  }
  assertVersion(versionId) {
    if (!this.versionInBinding(versionId))
      throw new ReviewError(
        "That model version does not belong to this review.",
        409,
        "UNKNOWN_VERSION",
      );
  }
  freshDraft(versionId) {
    // A content-addressed model can be published again later. Never reuse a
    // version/revision pair: the browser uses it to recover submission IDs.
    const revision = this.state.submissions.reduce(
      (n, s) => (s.versionId === versionId ? Math.max(n, s.revision) : n),
      0,
    );
    return {
      versionId,
      revision,
      annotations: [],
      camera: null,
      submittedRevision: null,
      labelCursor: 0,
      closedAt: null,
    };
  }
  // Presence, not a capability. Holding it grants nothing and lacking it
  // forbids nothing; concurrent edits are still rejected by the draft revision
  // check below, which is the only guard that actually prevents clobbering.
  // Making it a capability is what locked a reviewer out of their own round.
  claim(versionId, clientId) {
    this.assertVersion(versionId);
    const s = this.state;
    // The Agent acts without a tab. It must not be recorded as one.
    // Own-property writes: assigning `presence["__proto__"]` would set the
    // prototype instead of adding a key, and the review would silently lose
    // track of whoever was marking.
    if (clientId) {
      const entry = { clientId, touchedAt: Date.now() };
      if (Object.hasOwn(s.presence, versionId)) s.presence[versionId] = entry;
      else
        Object.defineProperty(s.presence, versionId, {
          value: entry,
          enumerable: true,
          writable: true,
          configurable: true,
        });
    }
    if (!Object.hasOwn(s.drafts, versionId))
      Object.defineProperty(s.drafts, versionId, {
        value: this.freshDraft(versionId),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    return s.drafts[versionId];
  }
  acquire(versionId, clientId) {
    this.claim(versionId, clientId);
    this.save();
    return this.publicState(clientId, versionId);
  }
  updateDraft({
    versionId,
    clientId,
    revision,
    annotations,
    camera,
    labelCursor,
  }) {
    const draft = this.claim(versionId, clientId);
    // The server may have saved a PUT whose response was lost. Accept only
    // the identical immediately previous write; other stale edits still fail.
    if (
      revision === draft.revision - 1 &&
      isDeepStrictEqual(annotations, draft.annotations) &&
      isDeepStrictEqual(camera, draft.camera) &&
      (labelCursor === undefined || labelCursor === draft.labelCursor)
    )
      return structuredClone(draft);
    if (revision !== draft.revision)
      throw new ReviewError(
        "The draft moved on; reload the saved revision.",
        409,
        "STALE_DRAFT",
      );
    const letters = annotations
      .filter((a) => a.type === "pin" && /^[A-Z]+$/.test(a.label))
      .map((a) =>
        [...a.label].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0),
      );
    draft.labelCursor = Math.max(
      draft.labelCursor || 0,
      labelCursor || 0,
      ...letters,
    );
    draft.revision += 1;
    draft.annotations = annotations;
    draft.camera = camera;
    // Marking again reopens a finished version instead of requiring a new one.
    draft.closedAt = null;
    this.save();
    return structuredClone(draft);
  }
  bindOrigin(value, { resumeGeneration = false } = {}) {
    const origin = normalizeOrigin(value);
    if (isDeepStrictEqual(origin, this.state.reviewOrigin)) return;
    const withoutGeneration = (o) =>
      o &&
      Object.fromEntries(
        Object.entries(o).filter(([key]) => key !== "sessionId"),
      );
    if (
      resumeGeneration &&
      origin?.sessionId &&
      isDeepStrictEqual(
        withoutGeneration(origin),
        withoutGeneration(this.state.reviewOrigin),
      )
    ) {
      const previous = this.state.reviewOrigin;
      this.state.reviewOrigin = origin;
      for (const [id, bound] of Object.entries(this.state.modelOrigins))
        if (isDeepStrictEqual(bound, previous))
          this.state.modelOrigins[id] = structuredClone(origin);
      // Explicit continuation of this project, not a new review. Browser trust,
      // tab ownership and drafts remain; immutable old batches keep old origins.
      this.save();
      return;
    }
    if (this.busyReason())
      throw new ReviewError(
        `${this.busyReason()}the binding and the draft were not changed.`,
        423,
        "ORIGIN_BUSY",
      );
    this.state.reviewOrigin = origin;
    this.state.reviewId = crypto.randomUUID();
    this.state.bindingId = crypto.randomUUID();
    if (this.state.active) {
      this.registerModelBinding(this.state.active.id, this.state.bindingId);
      this.state.modelOrigins[this.state.active.id] = structuredClone(origin);
      // A new conversation starts clean: the previous binding's drafts and
      // echoes must not surface under it even though both index by version.
      this.state.drafts[this.state.active.id] = this.freshDraft(
        this.state.active.id,
      );
      delete this.state.echoes[this.state.active.id];
    }
    this.state.generation += 1;
    this.save();
  }
  submissionOrigin(item) {
    // Lifted on the way out for the same reason the review's own origin is
    // lifted on the way in, and without touching the file: a batch frozen
    // before the route moved must still compare equal to the session that owns
    // it, or its own conversation stops recognising it.
    return normalizeOrigin(
      Object.hasOwn(item, "origin")
        ? item.origin
        : (this.state.legacySubmissionOrigins[item.id] ?? null),
    );
  }
  // Switching what is displayed is now free: every version keeps its own draft,
  // presence and echo, so nothing is surrendered and nothing is destroyed. That
  // is why publishing no longer queues behind the reviewer.
  applyActive(versionId) {
    const s = this.state;
    const origin = Object.hasOwn(s.modelOrigins, versionId)
      ? s.modelOrigins[versionId]
      : s.reviewOrigin;
    s.active = s.models[versionId];
    if (isDeepStrictEqual(origin, s.reviewOrigin)) return;
    // A different conversation owning this model is a different review: rebind
    // so its batches, drafts and echoes never mix with the previous one.
    s.reviewOrigin = origin;
    // `at(-1)` on a missing entry was a TypeError thrown after `active` had
    // already been replaced, leaving the in-memory review pointing at a model
    // that was never saved. Read the same own map the guard above read, and
    // fall back to the review's own binding when there is nothing to take.
    const bound = Object.hasOwn(s.modelBindings, versionId)
      ? s.modelBindings[versionId]
      : null;
    s.bindingId = bound?.at(-1) ?? s.bindingId;
    s.reviewId = crypto.randomUUID();
    s.generation += 1;
  }
  activate(versionId) {
    if (!Object.hasOwn(this.state.models, versionId))
      throw new ReviewError(
        "That model version is not published.",
        409,
        "UNKNOWN_VERSION",
      );
    const foreign = !isDeepStrictEqual(
      Object.hasOwn(this.state.modelOrigins, versionId)
        ? this.state.modelOrigins[versionId]
        : this.state.reviewOrigin,
      this.state.reviewOrigin,
    );
    if (foreign && this.busyReason())
      throw new ReviewError(
        `${this.busyReason()}the displayed model was not changed.`,
        423,
        "ORIGIN_BUSY",
      );
    if (!foreign) this.assertVersion(versionId);
    if (this.state.active?.id !== versionId) {
      this.applyActive(versionId);
      this.save();
    }
    return this.state.active;
  }
  publish(model, value = this.state.reviewOrigin, { activate = true } = {}) {
    const s = this.state;
    const origin = normalizeOrigin(value);
    const known = Object.hasOwn(s.models, model.id) ? s.models[model.id] : null;
    if (known) {
      if (
        !isDeepStrictEqual(
          Object.hasOwn(s.modelOrigins, model.id)
            ? s.modelOrigins[model.id]
            : s.reviewOrigin,
          origin,
        )
      )
        throw new ReviewError(
          "This model already belongs to a session; finish that round first.",
          423,
          "ORIGIN_BUSY",
        );
      if (activate) this.activate(model.id);
      return {
        status: s.active?.id === model.id ? "active" : "published",
        model: known,
      };
    }
    const mine = isDeepStrictEqual(origin, s.reviewOrigin);
    // Own-property writes, for the same reason `registerModelBinding` defines
    // them: `models["__proto__"] = …` would replace the prototype of the map
    // that every version lives in, and the version would never be listed.
    this.put(s.models, model.id, structuredClone(model));
    this.put(s.modelOrigins, model.id, origin);
    this.registerModelBinding(
      model.id,
      mine ? s.bindingId : crypto.randomUUID(),
    );
    // Another conversation may always publish here, but taking over the screen
    // would rebind the project and reset this review's draft. That one waits.
    const blocked = !mine && this.busyReason();
    if (activate && !blocked) this.applyActive(model.id);
    this.save();
    if (blocked)
      return {
        status: "published",
        model,
        reason: `${blocked}the displayed model was not changed.`,
      };
    return { status: activate ? "active" : "published", model };
  }
  createSubmission({
    versionId,
    clientId,
    revision,
    submissionId,
    sealed = false,
  }) {
    const old = this.state.submissions.find((x) => x.id === submissionId);
    if (old) {
      if (old.versionId !== versionId || old.revision !== revision)
        throw new ReviewError(
          "That submission id already belongs to another draft.",
        );
      return old;
    }
    const d = this.claim(versionId, clientId);
    if (d.revision !== revision)
      // Its own code, not the default CONFLICT it shared with every other
      // refusal: the page can only say this one in the reviewer's language if
      // it can tell it apart from the rest.
      throw new ReviewError(
        "Wait for the draft to finish saving before submitting.",
        409,
        "SAVING",
      );
    if (!d.annotations.length && d.submittedRevision == null)
      throw new ReviewError("Add a pin or paint a region first.", 400, "EMPTY");
    const item = {
      id: submissionId,
      versionId,
      revision,
      createdAt: Date.now(),
      status: "saved",
      // A sealed batch was closed out for the reviewer rather than handed over
      // by them. The Agent must confirm intent before treating it as a request.
      sealed,
      reviewId: this.state.reviewId,
      bindingId: this.state.bindingId,
      origin: structuredClone(this.state.reviewOrigin),
      model: structuredClone(this.state.models[versionId]),
      annotations: structuredClone(d.annotations),
      camera: d.camera,
    };
    this.state.submissions.push(item);
    this.markSubmitted(item);
    atomicJson(path.join(this.dir, "submissions", `${item.id}.json`), item);
    this.save();
    return item;
  }
  // Reaching the outbox is what the reviewer controls; delivery confirmation is
  // not. Counting a revision as submitted only once the Gateway accepted it
  // left a round unfinishable during any outage, with nothing on the page to
  // explain why the button stayed disabled.
  markSubmitted(item) {
    const draft = this.state.drafts[item.versionId];
    if (!draft || !this.submissionInBinding(item)) return;
    draft.submittedRevision = Math.max(
      draft.submittedRevision ?? -1,
      item.revision,
    );
  }
  submissionStatus(id, status, extra = {}) {
    const s = this.state.submissions.find((x) => x.id === id);
    if (!s) throw new ReviewError("No such submission.", 404);
    Object.assign(s, { status }, extra);
    this.markSubmitted(s);
    atomicJson(path.join(this.dir, "submissions", `${s.id}.json`), s);
    this.save();
    return s;
  }
  acknowledgeRead(id, versionId) {
    const submission = this.state.submissions.find(
      (s) => s.id === id && s.versionId === versionId,
    );
    if (!submission)
      throw new ReviewError(
        "The submission or the model version does not match.",
        404,
      );
    // Explicit local Agent read acknowledgment, never inferred from chat.send.
    return this.submissionStatus(id, submission.status, {
      readAt: submission.readAt || Date.now(),
    });
  }
  setEcho({ submissionId, versionId, summary, annotations }) {
    this.assertVersion(versionId);
    const submission = this.state.submissions.find(
      (s) => s.id === submissionId && s.versionId === versionId,
    );
    if (!submission || !this.submissionInBinding(submission))
      throw new ReviewError("No submission of this round matches.", 404);
    this.state.echoes[versionId] = {
      id: crypto.randomUUID(),
      submissionId,
      versionId,
      revision: submission.revision,
      summary,
      annotations,
      createdAt: Date.now(),
    };
    this.save();
    return this.state.echoes[versionId];
  }
  // Finishing never refuses. Whatever is still in hand is sealed into a batch
  // so it reaches the Agent, rather than stranding the round behind a button
  // the reviewer has no way to satisfy. Markings stay on screen as the record.
  finish(versionId, clientId, { submissionId } = {}) {
    this.assertVersion(versionId);
    const draft = this.state.drafts[versionId];
    const sealed = this.hasUnsubmitted(versionId)
      ? this.createSubmission({
          versionId,
          clientId,
          revision: draft.revision,
          submissionId: submissionId || crypto.randomUUID(),
          sealed: true,
        })
      : null;
    if (draft) draft.closedAt = Date.now();
    delete this.state.presence[versionId];
    this.save();
    return { state: this.publicState(clientId, versionId), sealed };
  }
  resume(versionId, clientId) {
    return this.acquire(versionId, clientId);
  }
  // Liveness only, so it stays in memory. Every real edit persists touchedAt
  // through updateDraft, and after a restart nobody holds a live session
  // anyway: a stale timestamp only makes the tab read as idle, and presence
  // grants nothing that would need to be taken back.
  heartbeat(clientId, versionId) {
    const p = this.state.presence[versionId];
    if (p?.clientId === clientId) p.touchedAt = Date.now();
  }
}
