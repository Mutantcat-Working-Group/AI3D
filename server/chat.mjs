/* One OpenAI-compatible endpoint, called by the service so the browser never
   holds the key.

   The workbench is normally reviewed from a conversation, and chat forwards to
   that conversation. When there is no conversation — the desktop app, or a
   page opened on its own — the same composer still has to answer, so a model
   the reader configured is asked directly. Only the two routes that need it
   are spoken: list the models, and complete a chat turn. */
import { KNOWLEDGE_ENTRIES } from "../mcp/knowledge.mjs";

export const CHAT_TIMEOUT_MS = 180_000;
export const MODELS_TIMEOUT_MS = 20_000;
export const MAX_MODELS = 60;

/* A base URL is the part before `/chat/completions`, which is how every
   OpenAI-compatible server, local or hosted, documents it (`.../v1`). Only
   http and https are accepted: a `file:` URL here would turn this service into
   a way to read the disk. */
export function normalizeBaseUrl(value) {
  const text = String(value || "")
    .trim()
    .replace(/\/+$/, "");
  if (!text) return "";
  let url;
  try {
    url = new URL(text);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  return text;
}

const authHeaders = (apiKey) =>
  apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

/* The knowledge pack travels with the assistant, not with the pack file. Its
   entries are citations rather than prose, so the digest hands the model the
   first fact and the licence of each one and lets the model decide what to
   quote; inventing a detail stays possible but is no longer the easiest
   answer. */
const knowledgeDigest = KNOWLEDGE_ENTRIES.map((entry) => {
  const fact = entry.facts?.[0] || "";
  return `- ${entry.title} (${entry.source}; ${entry.license}): ${fact} ${entry.url}`;
}).join("\n");

export const SYSTEM_PROMPT = [
  "You are the built-in assistant of AI3D, a game 3D asset workbench published by Mutantcat Working Group (mutantcat.org).",
  "Answer in the language the user writes in, briefly and concretely, and prefer a short actionable answer over a survey.",
  "You help with 3D modelling, game asset production, glTF/GLB/STL/STEP interchange, PBR materials, LOD and triangle budgets, and importing assets into Unity, Godot and Unreal.",
  "AI3D itself generates game-ready props, level kits, asset sets and whole projects locally from a written brief; when a request names something the generator can build, say that the chat prompt or the Generate tab will build it rather than only describing how.",
  "The workbench marks up a model for review; it is not a sculpting or modelling tool, so do not offer edits it cannot make.",
  "These licence-tagged references ship with AI3D. Quote a fact from one and name its source and URL when you use it; never invent a source:",
  knowledgeDigest,
].join("\n");

/* Endpoint errors are read by the reader through a toast, so they say what the
   endpoint said and which endpoint it was. */
async function readError(response) {
  let detail = "";
  try {
    const json = await response.json();
    detail = json?.error?.message || json?.message || "";
  } catch {
    /* not JSON: the status line is the whole answer */
  }
  return detail
    ? `${detail} (HTTP ${response.status})`
    : `The model endpoint answered HTTP ${response.status}.`;
}

export async function listModels({
  baseUrl,
  apiKey,
  fetchImpl = fetch,
  timeoutMs = MODELS_TIMEOUT_MS,
} = {}) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error("The API base URL is not an http(s) address.");
  const response = await fetchImpl(`${base}/models`, {
    headers: authHeaders(apiKey),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(await readError(response));
  const json = await response.json();
  const raw = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.models)
      ? json.models
      : [];
  const models = raw
    .map((entry) =>
      typeof entry === "string" ? entry : entry?.id || entry?.name,
    )
    .map((name) => String(name || "").trim())
    .filter(Boolean);
  return [...new Set(models)].slice(0, MAX_MODELS);
}

export async function chatCompletion({
  baseUrl,
  apiKey,
  model,
  messages,
  fetchImpl = fetch,
  timeoutMs = CHAT_TIMEOUT_MS,
} = {}) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error("The API base URL is not an http(s) address.");
  const response = await fetchImpl(`${base}/chat/completions`, {
    method: "POST",
    headers: { ...authHeaders(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(await readError(response));
  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim())
    throw new Error("The model returned no text.");
  return text.trim();
}
