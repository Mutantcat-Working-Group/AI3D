import fs from "node:fs";
import path from "node:path";
import { atomicJson, ReviewError } from "./store.mjs";
import { log, errorDetail } from "./log.mjs";
import { MAX_MODELS, normalizeBaseUrl } from "./chat.mjs";

const MAX_KEY = 400;

/* The endpoint the built-in chat calls, kept beside review state rather than in
   it: it belongs to this installation, not to a review round, so it must not
   travel with state.json or be reset when a round is replaced.

   The key is a credential, so it is written 0600 and never leaves the service.
   The page is told whether one is stored and its last four characters, which
   is the whole of what a reader has to recognise it by. */
export class ChatConfig {
  constructor(runtime) {
    this.file = path.join(runtime, "chat-config.json");
    this.state = { baseUrl: "", apiKey: "", models: [], model: "" };
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
    this.state = {
      baseUrl: normalizeBaseUrl(saved.baseUrl),
      apiKey:
        typeof saved.apiKey === "string" ? saved.apiKey.slice(0, MAX_KEY) : "",
      models: this.cleanModels(saved.models),
      model:
        typeof saved.model === "string" ? saved.model.trim().slice(0, 200) : "",
    };
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

  save() {
    atomicJson(this.file, this.state);
  }

  /* Server-internal: the only reader of the key itself. */
  key() {
    return this.state.apiKey;
  }

  /* Server-internal: what a call needs without the page ever seeing the key. */
  target() {
    const { baseUrl, apiKey, model } = this.state;
    return { baseUrl, apiKey, model };
  }

  view() {
    const { baseUrl, apiKey, models, model } = this.state;
    return {
      baseUrl,
      hasKey: Boolean(apiKey),
      keyHint: apiKey ? apiKey.slice(-4) : "",
      models,
      model,
      available: Boolean(baseUrl && apiKey && model),
    };
  }

  /* An omitted field is left alone and an empty key keeps the stored one: the
     page is never given the key back, so it cannot send it again on every
     save. Only an explicit new value replaces it. */
  update({ baseUrl, apiKey, models, model } = {}) {
    if (baseUrl !== undefined) {
      const clean = normalizeBaseUrl(baseUrl);
      if (String(baseUrl).trim() && !clean)
        throw new ReviewError(
          "That API base URL is not an http(s) address.",
          400,
          "CHAT_CONFIG",
        );
      this.state.baseUrl = clean;
    }
    if (apiKey !== undefined && String(apiKey).trim())
      this.state.apiKey = String(apiKey).trim().slice(0, MAX_KEY);
    if (models !== undefined) this.state.models = this.cleanModels(models);
    if (model !== undefined)
      this.state.model = String(model).trim().slice(0, 200);
    /* A default that is no longer in the list would silently call a model the
       reader just removed. Clearing it makes the next save ask again. */
    if (!this.state.models.includes(this.state.model)) this.state.model = "";
    this.save();
    return this.view();
  }
}
