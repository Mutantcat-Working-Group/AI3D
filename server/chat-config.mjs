import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { atomicJson, ReviewError } from "./store.mjs";
import { log, errorDetail } from "./log.mjs";
import { MAX_MODELS, normalizeBaseUrl } from "./chat.mjs";

const MAX_KEY = 400;
export const MAX_PROVIDERS = 12;

/* A provider is one OpenAI-compatible endpoint plus the model chosen on it.
   Several are kept because a reader routinely has a hosted key, a local
   runtime, and a second vendor, and swapping between them should not mean
   retyping a base URL and pasting a key back in.

   The configuration belongs to this installation rather than to a review
   round, so it lives beside review state: it must not travel with state.json
   or be reset when a round is replaced. Keys are credentials, so the file is
   written 0600 and a key never leaves the service. The page is told whether
   one is stored and its last four characters, which is the whole of what a
   reader has to recognise it by. */
export class ChatConfig {
  constructor(runtime) {
    this.file = path.join(runtime, "chat-config.json");
    this.state = { version: 2, activeId: "", providers: [] };
    this.load();
  }

  load() {
    let saved = null;
    try {
      if (fs.existsSync(this.file))
        saved = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch (error) {
      log.warn("chat", "chat configuration was not readable; starting empty", {
        file: this.file,
        ...errorDetail(error),
      });
    }
    if (!saved || typeof saved !== "object") return;
    /* The first release stored one endpoint as four flat fields. Reading that
       shape as a single provider means an installation that had already been
       configured keeps working instead of silently losing its key. */
    const raw = Array.isArray(saved.providers)
      ? saved.providers
      : saved.baseUrl || saved.apiKey || saved.model
        ? [saved]
        : [];
    this.state = {
      version: 2,
      activeId: this.cleanId(saved.activeId),
      providers: raw
        .map((entry) => this.cleanProvider(entry))
        .filter(Boolean)
        .slice(0, MAX_PROVIDERS),
    };
    this.normalize();
  }

  cleanModels(value) {
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value
          .map((name) =>
            String(name || "")
              .trim()
              .slice(0, 200),
          )
          .filter(Boolean),
      ),
    ].slice(0, MAX_MODELS);
  }

  cleanId(value) {
    const text = String(value || "")
      .trim()
      .slice(0, 60);
    return /^[\w-]+$/.test(text) ? text : "";
  }

  freshId() {
    return `p-${randomUUID().slice(0, 8)}`;
  }

  /* Only the fields a provider was ever allowed to carry are copied, so a
     stored file cannot smuggle anything else into the running state. A row
     with nothing in it at all is not an endpoint and is dropped. */
  cleanProvider(raw) {
    if (!raw || typeof raw !== "object") return null;
    const provider = {
      id: this.cleanId(raw.id) || this.freshId(),
      name: typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : "",
      baseUrl: normalizeBaseUrl(raw.baseUrl),
      apiKey:
        typeof raw.apiKey === "string" ? raw.apiKey.slice(0, MAX_KEY) : "",
      models: this.cleanModels(raw.models),
      model:
        typeof raw.model === "string" ? raw.model.trim().slice(0, 200) : "",
    };
    if (!provider.baseUrl && !provider.apiKey && !provider.models.length)
      return null;
    return provider;
  }

  /* Ids have to be unique: two providers sharing one would make the second
     unreachable from the dropdown that selects by id. */
  normalize() {
    const seen = new Set();
    for (const provider of this.state.providers) {
      if (seen.has(provider.id)) provider.id = this.freshId();
      seen.add(provider.id);
      if (!provider.name) provider.name = hostLabel(provider.baseUrl);
      /* A default that is no longer in the list would silently call a model
         the reader just removed. Clearing it makes the next save ask again. */
      if (!provider.models.includes(provider.model)) provider.model = "";
    }
    if (!this.state.providers.some((p) => p.id === this.state.activeId))
      this.state.activeId = this.state.providers[0]?.id || "";
  }

  providerById(id) {
    const clean = this.cleanId(id);
    return clean
      ? this.state.providers.find((provider) => provider.id === clean)
      : undefined;
  }

  /* The endpoint a message goes to when the page does not name one. */
  active() {
    return (
      this.providerById(this.state.activeId) ||
      this.state.providers.find((provider) => provider.baseUrl) ||
      undefined
    );
  }

  blank() {
    return {
      id: this.freshId(),
      name: "",
      baseUrl: "",
      apiKey: "",
      models: [],
      model: "",
    };
  }

  save() {
    atomicJson(this.file, this.state);
  }

  /* Server-internal: what a call needs without the page ever seeing the key.
     A named provider that is no longer stored resolves to nothing rather than
     to the reader's default: falling back would spend one endpoint's key
     against another endpoint's URL. Only a call that names no provider at all
     gets the active one. */
  target(id) {
    const provider = id ? this.providerById(id) : this.active();
    if (!provider) return null;
    const { baseUrl, apiKey, model } = provider;
    return { id: provider.id, baseUrl, apiKey, model };
  }

  view() {
    const providers = this.state.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      hasKey: Boolean(provider.apiKey),
      keyHint: provider.apiKey ? provider.apiKey.slice(-4) : "",
      models: provider.models,
      model: provider.model,
      available: Boolean(provider.baseUrl && provider.apiKey && provider.model),
    }));
    return {
      providers,
      activeId: this.state.activeId,
      available: Boolean(
        providers.find((provider) => provider.id === this.state.activeId)
          ?.available,
      ),
    };
  }

  /* One incoming provider from the page, written onto a stored one. An entry
     that names a stored provider keeps that provider's key unless a new one is
     supplied, which is the only way this can work: the page is never given the
     key back, so it can never send it again. Only an explicit new value
     replaces it. */
  mergeInto(provider, incoming) {
    if (incoming.name !== undefined)
      provider.name = String(incoming.name).trim().slice(0, 80);
    if (incoming.baseUrl !== undefined) {
      const clean = normalizeBaseUrl(incoming.baseUrl);
      if (String(incoming.baseUrl).trim() && !clean)
        throw new ReviewError(
          "That API base URL is not an http(s) address.",
          400,
          "CHAT_CONFIG",
        );
      provider.baseUrl = clean;
    }
    if (incoming.apiKey !== undefined && String(incoming.apiKey).trim())
      provider.apiKey = String(incoming.apiKey).trim().slice(0, MAX_KEY);
    if (incoming.models !== undefined)
      provider.models = this.cleanModels(incoming.models);
    if (incoming.model !== undefined)
      provider.model = String(incoming.model).trim().slice(0, 200);
    if (!provider.name) provider.name = hostLabel(provider.baseUrl);
    return provider;
  }

  mergeProvider(incoming) {
    const provider = this.providerById(incoming.id) || this.blank();
    const clean = this.cleanId(incoming.id);
    if (clean) provider.id = clean;
    return this.mergeInto(provider, incoming);
  }

  /* Replace the whole list. A provider the page no longer names was removed by
     the reader, so it goes with the save rather than lingering unreachable. */
  replaceProviders(list) {
    if (!Array.isArray(list)) return;
    if (list.length > MAX_PROVIDERS)
      throw new ReviewError(
        `At most ${MAX_PROVIDERS} model endpoints can be stored.`,
        400,
        "CHAT_CONFIG",
      );
    const next = [];
    const seen = new Set();
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const provider = this.mergeProvider(entry);
      if (seen.has(provider.id)) provider.id = this.freshId();
      seen.add(provider.id);
      /* A row the reader added but never filled in is not an endpoint. */
      if (provider.baseUrl || provider.apiKey || provider.models.length)
        next.push(provider);
    }
    this.state.providers = next;
  }

  /* The endpoint answered its model list. The URL that answered is stored with
     it, because a list of model names is not useful without one. */
  saveProbe({ id, baseUrl, apiKey, models } = {}) {
    let provider = this.providerById(id);
    if (!provider) {
      /* A probe can add an endpoint the list does not have yet, so it is the
         one writer that reaches past the cap the page enforces. Without this
         the reload in `load` trims back to the limit and can drop the endpoint
         being made active, which is the last thing a reader would suspect. */
      if (this.state.providers.length >= MAX_PROVIDERS)
        throw new ReviewError(
          `At most ${MAX_PROVIDERS} model endpoints can be stored.`,
          400,
          "CHAT_CONFIG",
        );
      provider = this.blank();
      const clean = this.cleanId(id);
      if (clean) provider.id = clean;
      this.state.providers.push(provider);
    }
    const clean = normalizeBaseUrl(baseUrl);
    if (clean) provider.baseUrl = clean;
    if (apiKey !== undefined && String(apiKey).trim())
      provider.apiKey = String(apiKey).trim().slice(0, MAX_KEY);
    provider.models = this.cleanModels(models);
    if (!provider.models.includes(provider.model))
      provider.model = provider.models[0] || "";
    if (!provider.name) provider.name = hostLabel(provider.baseUrl);
    this.normalize();
    this.save();
    return this.view();
  }

  /* The page sends `providers` for a full save and `activeId` when the reader
     picks a different default. The flat shape of the first release is still
     accepted so a cached page cannot corrupt a live key. */
  update({ activeId, providers, ...flat } = {}) {
    const flatTouched = ["baseUrl", "apiKey", "models", "model"].some(
      (key) => flat[key] !== undefined,
    );
    if (providers !== undefined) this.replaceProviders(providers);
    else if (flatTouched) {
      /* An invalid flat save must not leave the phantom endpoint it was about
         to build in the running list: `mergeInto` throws before the new entry
         is attached, so the next save starts from the same clean list. */
      const existing = this.active();
      if (existing) this.mergeInto(existing, flat);
      else this.state.providers.push(this.mergeInto(this.blank(), flat));
    }
    if (activeId !== undefined) {
      const clean = this.cleanId(activeId);
      if (clean && this.providerById(clean)) this.state.activeId = clean;
    }
    this.normalize();
    this.save();
    return this.view();
  }
}

/* The endpoint's host is the only name available for a provider the reader
   never named, and it is the part of the URL they would recognise. */
function hostLabel(baseUrl) {
  try {
    return new URL(baseUrl).host || "Model endpoint";
  } catch {
    return "Model endpoint";
  }
}
