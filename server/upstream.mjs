/* The only request this service ever makes to the internet.

   Everything else here is local by construction: the page is served from the
   bundle beside it, the agent arrives over a unix socket, and the reviewer's
   browser has never once been asked to fetch anything off-origin. That is worth
   keeping, so this is deliberately the narrowest thing that answers the
   question a reviewer actually has — is the copy I am looking at the current
   one — and nothing more.

   The reviewer's browser is still not the one going out. It polls the same
   `/api/state` it already polls, and the service answers from a value it
   refreshed on its own schedule. One machine asks, at most once every few
   hours, no matter how many people are marking. */

import { log, errorDetail } from "./log.mjs";

export const UPSTREAM_LATEST =
  "https://api.github.com/repos/Mutantcat-Working-Group/AI3D/releases/latest";

// A review left open all day asks twice. Releases are not that urgent.
export const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
/* A failure must not become a retry storm: the page behind this polls every
   2.2 seconds, and an unreachable upstream would otherwise be asked that
   often. Wait out a long pause instead, and keep answering with whatever was
   last known — a flaky minute should not make the badge disappear. */
export const RETRY_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 5000;

/* Releases are tagged `v1.1.2`, the manifest declares `1.1.2`, and between
   releases it declares `1.1.2-dev`. Anything else is not something to compare,
   including the `"unknown"` a missing manifest yields. */
export function parseVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(String(text ?? "").trim());
  return m ? { parts: [+m[1], +m[2], +m[3]], pre: m[4] || null } : null;
}

export function isNewer(upstream, installed) {
  const a = parseVersion(upstream),
    b = parseVersion(installed);
  // An upstream prerelease is never offered: it is not what `npm i` would get.
  if (!a || !b || a.pre) return false;
  for (let i = 0; i < 3; i++) {
    if (a.parts[i] !== b.parts[i]) return a.parts[i] > b.parts[i];
  }
  /* Same three numbers, and the local one carries a suffix. `1.1.2-dev` is the
     build working towards 1.1.2, so 1.1.2 is ahead of it — which is also the
     only way a developer running dev is told their own release landed. */
  return Boolean(b.pre);
}

/* Lazy on purpose: there is no timer. An instance nobody has open makes no
   requests at all, because the only thing that can start one is a reviewer
   asking for state — and then only if the answer on hand is stale. */
export function createUpdateWatch({
  installed,
  url = UPSTREAM_LATEST,
  ttlMs = DEFAULT_TTL_MS,
  retryMs = RETRY_MS,
  enabled = true,
  fetchImpl,
  now = Date.now,
  timeoutMs = TIMEOUT_MS,
} = {}) {
  let known = null,
    until = 0,
    asking = false;

  async function ask() {
    asking = true;
    try {
      const doFetch = fetchImpl || globalThis.fetch;
      const res = await doFetch(url, {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "ai3d",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`upstream answered ${res.status}`);
      const body = await res.json();
      const tag = body?.tag_name;
      known = isNewer(tag, installed)
        ? {
            version: String(tag).replace(/^v/, ""),
            url:
              typeof body?.html_url === "string" && body.html_url.length
                ? body.html_url
                : undefined,
          }
        : null;
      until = now() + ttlMs;
    } catch (error) {
      /* Never surfaced to the reviewer. Not reaching GitHub says nothing about
         the model in front of them, and a review tool that starts reporting
         network weather has changed what it is for. `known` is left alone. */
      log.warn("update", "the upstream release could not be read", {
        url,
        ...errorDetail(error),
      });
      until = now() + retryMs;
    } finally {
      asking = false;
    }
  }

  return {
    enabled,
    // Exposed so a test can await the request it just caused.
    pending: () => asking,
    report() {
      if (!enabled) return null;
      if (!asking && now() >= until) void ask();
      return known;
    },
  };
}

/* Off is one word in one place, and it has to be, because this is the line
   that says the service talks to exactly one host. Anyone who would rather it
   talked to none needs that to be simple. */
export function updateCheckEnabled(env, config) {
  const said = env.REVIEW_UPDATE_CHECK;
  if (said !== undefined && said !== "")
    return !["off", "0", "false", "no"].includes(said.toLowerCase());
  return config?.updateCheck !== false;
}
