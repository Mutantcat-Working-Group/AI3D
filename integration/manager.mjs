import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { atomicJson } from "../server/store.mjs";
import { log, errorDetail } from "../server/log.mjs";
import {
  claimLock,
  readLock,
  releaseLock,
  processAlive,
} from "../server/lockfile.mjs";
import {
  agentSocketPath,
  readInstance,
  INTEGRATION_API,
} from "../server/instance.mjs";
import { listenerConfig, privateIPv4 } from "../server/network.mjs";
import { cacheRelease, cachedRelease } from "./release.mjs";
import { summarizeSubmission, readReceipt } from "./summarize.mjs";
import {
  workspaceContext,
  contextSummary,
  trustedOrigin,
  sameRoute,
  scopedPath,
  within,
  fail,
  IntegrationError,
} from "./context.mjs";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => processAlive(pid);
// The child inherits this descriptor for its whole run, so rotation can only
// happen between runs. One generation back is enough to keep the log of the
// release that just failed while bounding a project at twice the cap.
export const LOG_LIMIT = 5 * 1024 * 1024;
// A release id is the content hash of the installed package, so anything that
// is not one is not ours to delete. Never widen this to "whatever is in there".
const RELEASE_ID = /^[0-9a-f]{64}$/;
export function pruneReleases(runtime, keep) {
  const directory = path.join(runtime, "releases");
  const kept = new Set(keep.filter(Boolean));
  let entries;
  try {
    entries = fs.readdirSync(directory);
  } catch {
    return [];
  }
  const removed = [];
  for (const id of entries) {
    if (kept.has(id) || !RELEASE_ID.test(id)) continue;
    try {
      fs.rmSync(scopedPath(runtime, `releases/${id}`, { directory: true }), {
        recursive: true,
        force: true,
      });
      removed.push(id);
    } catch (error) {
      log.warn("integration", "could not remove a superseded release", {
        release: id,
        ...errorDetail(error),
      });
    }
  }
  return removed;
}
function rotateLog(runtime) {
  const file = path.join(runtime, "server.log");
  try {
    if (fs.statSync(file).size >= LOG_LIMIT) fs.renameSync(file, `${file}.1`);
  } catch (error) {
    if (error.code !== "ENOENT")
      log.warn("integration", "could not rotate the service log", {
        ...errorDetail(error),
      });
  }
  return file;
}
// Every route answers from memory in under a millisecond, so silence for this
// long means the instance is wedged rather than working. Publishing a STEP is
// the one exception: it tessellates before it can answer.
const IPC_IDLE = 3000;
// Tessellation is the only IPC that does real work, and it scales with the
// model: the largest assembly on hand (73k triangles) takes about 9 seconds, so
// the 600k-triangle ceiling lands near 70. Doubling that leaves room for a
// machine under load without waiting on a wedged instance forever.
const IPC_PUBLISH = 180000;
export async function ipc(runtime, instance, route, body, timeout = IPC_IDLE) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: agentSocketPath(runtime, instance),
        path: route,
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
          if (data.length > 20 * 1024 * 1024)
            req.destroy(new Error("Response too large"));
        });
        res.on("end", () => {
          let value;
          try {
            value = JSON.parse(data);
          } catch {
            // A server older than the route answers with the framework's HTML
            // 404, and forwarding the parse failure tells the caller a strange
            // byte arrived instead of the thing that is true: this instance was
            // started from a build that predates the action. Installing never
            // replaces a running server, so the remedy is to open it again.
            const old = res.statusCode === 404;
            const err = new Error(
              old
                ? `This project is being served by a build that has no ${route}; open the project again to serve it from the installed one.`
                : `The workbench answered ${route} with something that is not JSON (HTTP ${res.statusCode}).`,
            );
            err.code = old ? "OLD_RUNTIME" : "BAD_RESPONSE";
            reject(err);
            return;
          }
          if (res.statusCode >= 400) {
            const err = new Error(value.error || "AI3D request failed");
            err.code = value.code;
            reject(err);
          } else resolve(value);
        });
      },
    );
    req.setTimeout(timeout, () =>
      req.destroy(new Error("AI3D IPC timed out")),
    );
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function locked(file, fn) {
  for (let i = 0; i < 100; i++) {
    try {
      claimLock(file);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const owner = readLock(file);
      // claimLock never publishes partial content, so an unreadable holder is
      // debris rather than a live claim: waiting on it would block the project
      // for good instead of for a moment.
      if (!owner)
        log.warn("integration", "discarding an unreadable lock", { file });
      if (!owner || !alive(owner.pid)) {
        fs.unlinkSync(file);
        continue;
      }
      if (i === 99)
        fail("INSTANCE_BUSY", "The project is starting; try again shortly.");
      await delay(100);
    }
  }
  try {
    return await fn();
  } finally {
    releaseLock(file);
  }
}

// Read at call time, not discovery, and never restated: a hardcoded copy
// disagreed with the manifest and with the version the server reported.
export function installedVersion(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
      .version;
  } catch {
    return "unknown";
  }
}

/* The build this process is running, which after an install is not the one on
   disk: a host goes on running the code it loaded until it restarts, while
   `installedVersion` reads package.json at call time. On 2026-09-18 `inspect`
   answered 1.0.1 while the Gateway was still running 0.16.2, so an agent asking
   which version it was talking to could be told one it was not about to get.
   A built package has its version written into the bundle; run from source,
   the code and its package.json are the same files. */
const BUILT_VERSION =
  typeof __AI3D_BUILD_VERSION__ === "string"
    ? __AI3D_BUILD_VERSION__
    : null;
export function runningVersion(root) {
  return BUILT_VERSION ?? installedVersion(root);
}

// Every packaging route has to carry all of these for `inspect` to report them.
export const DOC_FILES = {
  agentInterface: "AGENT-INTERFACE.md",
  skill: "skills/ai3d-review/SKILL.md",
  readme: "README.md",
  readmeEnglish: "README.en.md",
};

// Absolute, because the reader is an agent that has to open them and may be
// running with a working directory nowhere near the install. Checked, because
// composing a path is not the same as shipping a file: the adapter package
// carried neither README.md nor the skill and `inspect` named both anyway. An
// absolute path that does not open reads exactly like one that does, which is
// the failure AGENT-INTERFACE.md tells agents to refuse to cause. Anything
// missing here is a packaging bug, and the packaging tests are where it is
// caught -- reporting it would only move the discovery to the agent.
export function docPaths(root) {
  const docs = {};
  for (const [key, relative] of Object.entries(DOC_FILES)) {
    const file = path.join(root, relative);
    if (fs.existsSync(file)) docs[key] = file;
  }
  return docs;
}

// The skill tells an agent to call `inspect` first, on every host. It existed
// only in the OpenClaw adapter, so on the CLI that first instruction answered
// BAD_USAGE, and over MCP it fell past the action list into the manager and came
// back as PROJECT_REQUIRED -- the tool answering a question nobody had asked,
// while the agent was still trying to find out where it was. One implementation,
// so the first instruction is true wherever it is read.
export function inspectInstall(context, root) {
  return {
    product: "AI3D",
    integrationVersion: runningVersion(root),
    // Derived from the same table the guards read, so the probe cannot report a
    // field the guards no longer look at, or stay silent about one they added.
    context: contextSummary(context),
    docs: docPaths(root),
  };
}

// Three answers, not two. A foreign instance must never be touched; an
// outdated one is ours and is exactly what reopening replaces; anything else is
// usable. Merging the first two is what turned an upgrade into a stuck project.
export function instanceVerdict(result, instance, projectId) {
  if (
    result?.instance?.id !== instance.id ||
    result?.instance?.projectId !== projectId
  )
    return "foreign";
  if (result.integrationApi !== INTEGRATION_API) return "outdated";
  return "ok";
}
export class InstanceManager {
  constructor(
    ctx,
    {
      installRoot,
      clientAddress,
      listenHost = "lan",
      serverEntry,
      distRoot,
      environment = {},
      resolveOrigin,
    } = {},
  ) {
    Object.assign(this, workspaceContext(ctx));
    this.ctx = ctx;
    // Who owns a review is the host's answer, and only a host shaped like
    // OpenClaw can be asked for it the OpenClaw way. A host that states its own
    // owner supplies this instead; the derivation stays where it can be right.
    this.resolveOrigin = resolveOrigin || (() => trustedOrigin(this.ctx));
    this.installRoot = fs.realpathSync(installRoot);
    this.serverEntry =
      serverEntry || path.join(this.installRoot, "runtime/server.mjs");
    this.bundled = !serverEntry;
    this.distRoot = distRoot || path.join(this.installRoot, "web");
    this.environment = environment; // Constructor dependency for isolated tests; never a tool parameter.
    this.clientAddress = clientAddress;
    this.listenHost = listenHost;
    this.usedProjects = new Map();
  }
  project(project, create = false) {
    if (
      !/^projects\/[a-zA-Z0-9][^\x00-\x1f]*$/.test(project || "") ||
      project.startsWith("projects/ai3d-state")
    )
      fail(
        "PROJECT_REQUIRED",
        "Name a separate modelling project, such as projects/phone-stand; the last one is never assumed.",
      );
    if (!within(this.allowed, path.resolve(this.workspace, project)))
      fail("PATH_SCOPE", "This tool has no file permission for that project.");
    const projectRoot = scopedPath(this.workspace, project, {
      create,
      directory: true,
    });
    if (!within(this.allowed, projectRoot))
      fail("PATH_SCOPE", "This tool has no file permission for that project.");
    const id = crypto
      .createHash("sha256")
      .update(JSON.stringify([this.workspace, this.agentId, projectRoot]))
      .digest("hex")
      .slice(0, 32);
    const relative = path.relative(
      this.workspace,
      path.join(projectRoot, ".ai3d", id),
    );
    const runtime = scopedPath(this.workspace, relative, {
      create,
      directory: true,
    });
    if (!within(this.allowed, runtime))
      fail("PATH_SCOPE", "The runtime directory is outside the file policy.");
    return {
      id,
      projectRoot,
      project: path.relative(this.workspace, projectRoot),
      runtime,
    };
  }
  async status(p, config) {
    const result = await ipc(p.runtime, readInstance(config), "/status");
    const verdict = instanceVerdict(result, config.instance, p.id);
    if (verdict === "foreign")
      fail(
        "WRONG_INSTANCE",
        "Service identity does not match; that process was neither reused nor stopped.",
      );
    if (verdict === "outdated") {
      // Ours, and answering — just older than this code can talk to. That is
      // the one condition `open` exists to fix, so it must not arrive wearing
      // the code that means "not ours, do not touch": an instance nothing may
      // read, replace or stop is a process a person has to go and kill.
      const error = new IntegrationError(
        "INSTANCE_OUTDATED",
        "This project serves an older contract; open it again to replace the running server.",
      );
      error.running = result;
      throw error;
    }
    return result;
  }
  pauseOwned() {
    const unavailable = [];
    for (const { p, config } of this.usedProjects.values()) {
      try {
        const current = JSON.parse(
          fs.readFileSync(path.join(p.runtime, "config.json"), "utf8"),
        );
        if (current.instance?.id === config.instance.id)
          atomicJson(path.join(p.runtime, "disabled.json"), {
            disabledAt: Date.now(),
            instanceId: config.instance.id,
          });
      } catch (error) {
        log.warn("integration", "could not pause a managed project", {
          project: p.project,
          ...errorDetail(error),
        });
        unavailable.push(p.project);
      }
    }
    return unavailable;
  }
  async register(p, config) {
    const root = path.join(this.workspace, "projects/ai3d-state");
    if (!within(this.allowed, root))
      fail(
        "PATH_SCOPE",
        "The integration needs permission for the project registry inside the workspace.",
      );
    scopedPath(this.workspace, "projects/ai3d-state", {
      create: true,
      directory: true,
    });
    await locked(path.join(root, "registry.lock"), async () => {
      const file = path.join(root, "registry.json");
      const registry = fs.existsSync(file)
        ? JSON.parse(fs.readFileSync(file, "utf8"))
        : { schema: 1, projects: {} };
      if (registry.schema !== 1)
        fail(
          "REGISTRY_VERSION",
          "Unsupported project registry format; nothing was overwritten.",
        );
      /* Nothing else ever removed an entry, so a project whose folder was
         deleted stayed registered for good, and every Gateway start and stop
         warned about it by name. Only this install's entries, as with pausing:
         what another install registered is not this one's to tidy. */
      for (const [id, item] of Object.entries(registry.projects))
        if (
          item.installRoot === this.installRoot &&
          !fs.existsSync(path.resolve(this.workspace, item.runtime))
        )
          delete registry.projects[id];
      registry.projects[p.id] = {
        project: p.project,
        runtime: path.relative(this.workspace, p.runtime),
        instanceId: config.instance.id,
        agentId: this.agentId,
        installRoot: this.installRoot,
      };
      atomicJson(file, registry);
    });
  }
  // Drafts survive a restart and are keyed by version, so an unfinished round
  // is no longer a reason to refuse — that is what let a round nobody could
  // finish block the upgrade that would have fixed it. Only somebody marking
  // right now is worth stopping for, and that evidence expires on its own.
  async stopOwned(p, config, state) {
    if (state.locked)
      fail(
        "REVIEW_BUSY",
        "Someone is marking; the service was neither stopped nor upgraded and the draft is saved. Retry later.",
      );
    const health = await fetch(
      `http://${state.network.host}:${state.network.port}/api/health`,
      { signal: AbortSignal.timeout(2000) },
    ).then((r) => r.json());
    const owner = readLock(path.join(p.runtime, "instance.lock"));
    if (
      !owner ||
      health.instance?.id !== config.instance.id ||
      health.pid !== owner.pid
    )
      fail(
        "WRONG_INSTANCE",
        "Process identity does not match; nothing was stopped.",
      );
    await ipc(p.runtime, config.instance, "/maintenance", {
      instanceId: config.instance.id,
    });
    try {
      process.kill(owner.pid, "SIGTERM");
      for (let i = 0; i < 60 && alive(owner.pid); i++) await delay(50);
      if (alive(owner.pid))
        fail(
          "INSTANCE_BUSY",
          "The service has not stopped and was not force-killed.",
        );
    } catch (error) {
      await ipc(p.runtime, config.instance, "/maintenance", {
        instanceId: config.instance.id,
        release: true,
      }).catch((releaseError) =>
        log.warn("integration", "could not release the maintenance pause", {
          project: p.project,
          ...errorDetail(releaseError),
        }),
      );
      throw error;
    }
  }
  async ensure(p, config) {
    const release = this.bundled
      ? cacheRelease(this.installRoot, p.runtime)
      : {
          id: null,
          root: this.installRoot,
          serverEntry: this.serverEntry,
          distRoot: this.distRoot,
        };
    let running;
    try {
      running = await this.status(p, config);
    } catch (error) {
      if (error.code === "WRONG_INSTANCE") throw error;
      // An outdated instance still has to be shut down before its replacement
      // can take the port, and its own status is the only description of it
      // there is.
      if (error.code === "INSTANCE_OUTDATED") running = error.running;
    }
    if (running && running.releaseId === release.id) return running;
    if (running) await this.stopOwned(p, config, running);
    const previous = structuredClone(config);
    config.installRoot = this.installRoot;
    try {
      const state = await this.launch(p, config, release);
      if (release.id) config.lastGoodRelease = release.id;
      atomicJson(path.join(p.runtime, "config.json"), config);
      // Each release is a full copy of the runtime, and nothing ever removed
      // the superseded ones: a project accumulated a few megabytes per upgrade
      // for the lifetime of the review. Only the running one and the rollback
      // target are ever launched again.
      pruneReleases(p.runtime, [release.id, previous.lastGoodRelease]);
      return state;
    } catch (error) {
      if (previous.lastGoodRelease && previous.lastGoodRelease !== release.id) {
        const fallback = cachedRelease(p.runtime, previous.lastGoodRelease);
        Object.assign(config, previous, { installRoot: this.installRoot });
        await this.launch(p, config, fallback);
        atomicJson(path.join(p.runtime, "config.json"), config);
        fail(
          "UPGRADE_ROLLED_BACK",
          "The new release failed to start; the last good one is restored, with its URL, models and authorizations intact.",
        );
      }
      throw error;
    }
  }
  async launch(p, config, release) {
    try {
      return await this.status(p, config);
    } catch (error) {
      if (error.code === "WRONG_INSTANCE") throw error;
    }
    const runFile = path.join(p.runtime, "instance.lock");
    if (alive(readLock(runFile)?.pid))
      fail(
        "INSTANCE_BUSY",
        "The project process is running but fails its health check; nothing was restarted or killed.",
      );
    if (
      !fs.existsSync(release.serverEntry) ||
      !fs.existsSync(path.join(release.distRoot, "index.html"))
    )
      fail(
        "PACKAGE_INCOMPLETE",
        "The package is missing workbench assets; no ad-hoc build was attempted and no fake URL invented.",
      );
    const network = listenerConfig(config.host);
    const mediaDir = scopedPath(this.workspace, `media/3d/ai3d/${p.id}`, {
      create: true,
      directory: true,
    });
    for (const directory of [p.runtime, mediaDir]) {
      try {
        fs.writeFileSync(path.join(directory, ".gitignore"), "*\n", {
          flag: "wx",
          mode: 0o600,
        });
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    atomicJson(path.join(p.runtime, "config.json"), config);
    const log = fs.openSync(rotateLog(p.runtime), "a", 0o600);
    const child = spawn(process.execPath, [release.serverEntry], {
      cwd: release.root,
      detached: true,
      stdio: ["ignore", log, log],
      env: {
        ...process.env,
        ...this.environment,
        REVIEW_WORKSPACE: this.workspace,
        REVIEW_DATA_DIR: p.runtime,
        REVIEW_MEDIA_DIR: mediaDir,
        REVIEW_DIST_DIR: release.distRoot,
        REVIEW_RELEASE_ID: release.id || "",
        REVIEW_HOST: network.host,
        REVIEW_SESSION_KEY: "",
        REVIEW_ACCESS: "required",
        PORT: String(config.port || 0),
      },
    });
    fs.closeSync(log);
    child.unref();
    child.on("error", () => {});
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      try {
        const state = await this.status(p, config);
        if (state.network.port) {
          config.port = state.network.port;
          config.host = state.network.host;
          atomicJson(path.join(p.runtime, "config.json"), config);
          return state;
        }
      } catch (error) {
        if (error.code === "WRONG_INSTANCE") throw error;
      }
      await delay(50);
    }
    // A registered port is part of browser localStorage identity. Do not choose
    // another port silently or kill its occupant and strand unsynced drafts.
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      for (
        let i = 0;
        i < 60 && child.exitCode === null && child.signalCode === null;
        i++
      )
        await delay(50);
    }
    fail(
      "START_FAILED",
      config.port
        ? "The original port would not bind; the URL and browser drafts are kept, so clear the port conflict first."
        : "The workbench did not start; check this project log. No unusable URL was delivered.",
    );
  }
  // A fixed version on disk does not reach a reviewer until the project is
  // opened again — installing, or restarting a host, leaves live instances on
  // the code they started with. Saying so beside the running version is the
  // whole difference between noticing that in a second and not noticing it for
  // an hour and a half, which is what happened on 2026-09-11.
  //
  // It lives here rather than in one adapter because every harness can be
  // upgraded while somebody is still looking at the old build, and the harness
  // that happened to implement it first is not the only one that needs telling.
  withServingVersion(result) {
    if (!result || typeof result !== "object" || !result.version) return result;
    const installed = installedVersion(this.installRoot);
    result.integrationVersion = runningVersion(this.installRoot);
    if (installed !== result.version)
      result.serving = {
        running: result.version,
        installed,
        note: "This project still runs an older build; only ai3d open replaces a running server.",
      };
    return result;
  }
  async execute(input) {
    return this.withServingVersion(await this.run(input));
  }
  async run(input) {
    const origin = this.resolveOrigin();
    if (
      !within(
        this.allowed,
        path.join(this.workspace, "projects/ai3d-state"),
      ) ||
      !within(this.allowed, path.join(this.workspace, "media/3d/ai3d"))
    )
      fail(
        "PATH_SCOPE",
        "The integration needs permission for this workspace's project registry; the current file policy was not overstepped.",
      );
    const opens = input.action === "open";
    // No empty viewer on first use: a source model must exist before a new instance.
    if (opens && input.file) {
      const source = scopedPath(this.workspace, input.file);
      if (!within(this.allowed, source))
        fail(
          "PATH_SCOPE",
          "The model file is outside this tool's file permission.",
        );
    }
    let p;
    try {
      p = this.project(input.project);
    } catch (error) {
      if (!opens || !input.file || error.code !== "NOT_FOUND") throw error;
      p = this.project(input.project, true);
    }
    return locked(path.join(p.runtime, "manager.lock"), async () => {
      const file = path.join(p.runtime, "config.json");
      const exists = fs.existsSync(file);
      if (!exists && (!opens || !input.file))
        fail(
          "MODEL_REQUIRED",
          "Build a draft or choose an existing model before opening a review.",
        );
      const config = exists
        ? JSON.parse(fs.readFileSync(file, "utf8"))
        : {
            instance: { schema: 1, id: crypto.randomUUID(), projectId: p.id },
            host: input.host || this.listenHost,
            port: 0,
            origin,
            managed: true,
            installRoot: this.installRoot,
            projectPath: p.project,
          };
      if (readInstance(config)?.projectId !== p.id)
        fail(
          "WRONG_INSTANCE",
          "The stored project identity does not match; no data was migrated.",
        );
      this.usedProjects.set(p.runtime, { p, config });
      if (!exists) atomicJson(file, config);
      await this.register(p, config);
      let state;
      if (opens) {
        // Lift the pause before attempting the upgrade, not after it succeeds.
        // A paused instance refuses every write, so a user holding an
        // unsubmitted round cannot submit or finish it — and that unfinished
        // round is exactly what makes stopOwned refuse the upgrade. Clearing it
        // first breaks the cycle; managedEnabled() still gates on the installed
        // manifest, so a plugin that is really gone stays disabled.
        const disabled = path.join(p.runtime, "disabled.json");
        if (fs.existsSync(disabled)) fs.unlinkSync(disabled);
        state = await this.ensure(p, config);
      } else {
        try {
          state = await this.status(p, config);
        } catch (error) {
          if (error.code === "WRONG_INSTANCE") throw error;
          // An instance on the previous contract is understood, not suspect.
          // It used to fall through to "fails its identity check", which is the
          // one impression three-state detection exists to prevent: a process
          // that is merely old sounding like one that is wrong. `status` now
          // says what it is, and `stop` can still stop it — refusing both is
          // how a process becomes one a person has to go and kill by hand.
          if (error.code === "INSTANCE_OUTDATED") {
            if (input.action !== "stop") throw error;
            state = error.running;
          }
          if (!state) {
            const lockFile = path.join(p.runtime, "instance.lock");
            if (alive(readLock(lockFile)?.pid))
              fail(
                "INSTANCE_UNVERIFIED",
                "The project process exists but fails its identity check; nothing was claimed stopped or killed.",
              );
            if (["status", "stop"].includes(input.action))
              return {
                project: p.project,
                running: false,
                stopped: true,
                dataRetained: true,
              };
            fail(
              "NOT_RUNNING",
              "This project is not running; continue it first.",
            );
          }
        }
      }
      if (!isDeepStrictEqual(state.origin, origin)) {
        if (!opens || !input.resume)
          fail(
            "RESUME_REQUIRED",
            "This project belongs to another session. Continue it explicitly before resuming; no draft or return address was changed.",
          );
        await ipc(p.runtime, config.instance, "/origin", {
          origin,
          resumeGeneration: sameRoute(state.origin, origin),
        });
        config.origin = origin;
        atomicJson(file, config);
        state = await this.status(p, config);
      }
      if (opens) {
        // Before anything else, because everything after it can fail: the
        // instance has to know it was just handed to somebody. A runtime older
        // than reclaiming has no such route and needs no such telling.
        await ipc(p.runtime, config.instance, "/opened", {}).catch(() => {});
        let published;
        if (input.file)
          published = await ipc(
            p.runtime,
            config.instance,
            "/publish",
            {
              file: input.file,
              name: input.name,
              version: input.version,
              units: input.units,
              origin,
              // Publishing shows the new version by default, because showing it
              // costs the reviewer nothing now. Saying otherwise adds a tab and
              // leaves whatever they are looking at exactly where it is.
              ...(input.label ? { label: input.label } : {}),
              ...(input.activate === false ? { activate: false } : {}),
            },
            IPC_PUBLISH,
          );
        state = await this.status(p, config);
        if (!state.active)
          fail(
            "MODEL_REQUIRED",
            "This project has no model yet; no empty review page was delivered.",
          );
        const address = input.confirmedClientAddress || this.clientAddress;
        let admission = { status: "client_address_needed" };
        if (address) {
          if (!(
            privateIPv4(address) ||
            (!state.network.lan && address === "127.0.0.1")
          ))
            fail(
              "BAD_ADDRESS",
              "Use a private address for a device the user has verified.",
            );
          // Admission is scoped to this project. Existing browser credentials
          // continue to work; no global trust is granted to all projects.
          admission = await ipc(p.runtime, config.instance, "/access/admit", {
            address,
          });
        }
        // Opening one project is the only moment anything looks at the others.
        const stale = await runtimesThatCannotReclaim(
          this.workspace,
          this.installRoot,
          p.project,
        ).catch(() => []);
        return {
          project: p.project,
          instanceId: config.instance.id,
          url: `http://${state.network.host}:${state.network.port}/`,
          active: state.active,
          versions: state.versions,
          publication: published?.status || "unchanged",
          admission,
          accessPolicy: "30 days inactive; renew on use",
          reviewLifetime: "reclaimed after a day with no use; reopen to resume",
          ...(stale.length ? { runtimesNeedingReopen: stale } : {}),
          sourceBound: true,
        };
      }
      if (input.action === "status") return { project: p.project, ...state };
      if (input.action === "read") {
        if (!/^[\w-]{1,160}$/.test(input.submissionId || ""))
          fail("SUBMISSION_REQUIRED", "Name the submission id for this batch.");
        const batch = await ipc(
          p.runtime,
          config.instance,
          `/submissions/${input.submissionId}`,
        );
        if (!sameRoute(batch.origin, origin))
          fail(
            "WRONG_ORIGIN",
            "That batch belongs to another session; nothing was read back or forwarded.",
          );
        /* Described, not handed over. The batch is immutable and complete
           either way; what changes is whether its coordinates come with it.
           They almost never need to — see `integration/summarize.mjs` — and
           when they do, `geometry: true` returns the batch untouched.

           Marking the batch read is the same call regardless: the reviewer is
           owed the acknowledgement whether or not the agent asked for the
           polygons. */
        const receipt = await ipc(p.runtime, config.instance, "/read", {
          submissionId: batch.id,
          versionId: batch.versionId,
        });
        return {
          submission:
            input.geometry === true ? batch : summarizeSubmission(batch),
          // The acknowledgement only; the batch itself is above. See
          // `readReceipt` for what the rest of it was duplicating.
          receipt: readReceipt(receipt),
        };
      }
      if (input.action === "echo") {
        const batch = await ipc(
          p.runtime,
          config.instance,
          `/submissions/${input.submissionId}`,
        );
        if (!sameRoute(batch.origin, origin))
          fail("WRONG_ORIGIN", "That batch belongs to another session.");
        return ipc(p.runtime, config.instance, "/echo", {
          submissionId: batch.id,
          versionId: batch.versionId,
          summary: input.summary,
          annotations: input.annotations || [],
        });
      }
      // Choosing what the reviewer sees is presentation, and presentation is
      // the Agent's job. Every version keeps its own draft, so none of these
      // can destroy work that was in progress on another one.
      if (input.action === "activate") {
        const versionId =
          input.versionId ||
          state.versions?.find((v) => v.version === input.version)?.id;
        if (!versionId)
          fail(
            "VERSION_REQUIRED",
            "Name the versionId to display, or list the choices with status first.",
          );
        const result = await ipc(p.runtime, config.instance, "/activate", {
          versionId,
        });
        return { project: p.project, active: result.active };
      }
      // "Show the latest three" is a rule, not a tidy-up: the next version
      // published pushes the oldest out of view without being asked again.
      // Nothing is deleted, so `retain` with a larger number brings them back.
      if (input.action === "retain") {
        const keep = input.keep ?? null;
        if (keep !== null && !(Number.isInteger(keep) && keep >= 0))
          fail(
            "KEEP_REQUIRED",
            "Say how many of the most recent versions to show, or 0 to show every one again.",
          );
        const result = await ipc(p.runtime, config.instance, "/retain", {
          keep,
        });
        return { project: p.project, ...result };
      }
      if (input.action === "finish") {
        const result = await ipc(p.runtime, config.instance, "/finish", {
          ...(input.versionId ? { versionId: input.versionId } : {}),
        });
        return { project: p.project, ...result };
      }
      if (input.action === "unlock") {
        const result = await ipc(p.runtime, config.instance, "/unlock", {
          ...(input.versionId ? { versionId: input.versionId } : {}),
        });
        return { project: p.project, ...result };
      }
      if (input.action === "stop") {
        await this.stopOwned(p, config, state);
        return {
          stopped: true,
          dataRetained: true,
          project: p.project,
        };
      }
      fail("BAD_ACTION", "Unsupported AI3D action");
    });
  }
}

// Disable may execute in a fresh Gateway process, not in the worker that used
// the tool. Resolve durable, workspace-local records rather than in-memory PIDs.
// Pausing and resuming share this walk so they can never disagree about which
// projects this install is allowed to touch, or about how a runtime directory
// proves it still belongs to the instance the registry recorded.
function eachRegistered(workspace, installRoot, verb, act) {
  const root = fs.realpathSync(workspace);
  const file = path.join(root, "projects/ai3d-state/registry.json");
  if (!fs.existsSync(file)) return [];
  const checked = scopedPath(root, "projects/ai3d-state/registry.json");
  const registry = JSON.parse(fs.readFileSync(checked, "utf8"));
  if (registry.schema !== 1)
    fail(
      "REGISTRY_VERSION",
      "Unsupported project registry format; nothing was overwritten.",
    );
  const unavailable = [];
  for (const item of Object.values(registry.projects)) {
    if (item.installRoot !== installRoot) continue;
    try {
      const runtime = scopedPath(root, item.runtime, { directory: true });
      const config = JSON.parse(
        fs.readFileSync(path.join(runtime, "config.json"), "utf8"),
      );
      if (config.instance?.id !== item.instanceId)
        throw new Error("Instance changed");
      act(runtime, item);
    } catch (error) {
      // A project whose folder is gone has nothing left to pause or resume, and
      // is not unavailable either; the next open drops it from the registry.
      if (error.code === "NOT_FOUND") continue;
      log.warn("integration", `could not ${verb} a registered project`, {
        project: item.project,
        ...errorDetail(error),
      });
      unavailable.push(item.project);
    }
  }
  return unavailable;
}
// Reclaiming belongs to the instance: it is the only thing that can see whether
// anyone is still using it, so an instance able to do that needs nothing from
// here. What it cannot cover is a project still served by a runtime published
// before reclaiming existed — the 0.6.x services found listening for two and
// three days were exactly that, and nothing in this system was counting them.
//
// So this names them instead of stopping them. A single health probe is not
// grounds to decide somebody else's page is finished, and reopening the project
// replaces its runtime anyway — saying which ones need it is the whole job.
export async function runtimesThatCannotReclaim(
  workspace,
  installRoot,
  exceptProject,
) {
  const root = fs.realpathSync(workspace);
  const file = path.join(root, "projects/ai3d-state/registry.json");
  if (!fs.existsSync(file)) return [];
  let registry;
  try {
    registry = JSON.parse(
      fs.readFileSync(
        scopedPath(root, "projects/ai3d-state/registry.json"),
        "utf8",
      ),
    );
  } catch {
    return [];
  }
  if (registry.schema !== 1) return [];
  // Opening is interactive, and this runs inside it. Each probe can cost the
  // full 3s IPC timeout, so a project that is merely slow must not be paid for
  // one after another: skip the ones whose recorded process is already gone —
  // a file read, not a round trip — and ask the rest at the same time.
  const probes = Object.values(registry.projects)
    .filter(
      (item) =>
        item.installRoot === installRoot && item.project !== exceptProject,
    )
    .map(async (item) => {
      try {
        const runtime = scopedPath(root, item.runtime, { directory: true });
        const config = JSON.parse(
          fs.readFileSync(path.join(runtime, "config.json"), "utf8"),
        );
        if (config.instance?.id !== item.instanceId) return null;
        if (!alive(readLock(path.join(runtime, "instance.lock"))?.pid))
          return null;
        const status = await ipc(runtime, config.instance, "/status");
        // A runtime that reclaims itself says so. Absence is the signal — an
        // instance with reclaiming switched off reports a limit of zero, which
        // is a decision somebody made and not a gap to report.
        return status && !status.idle
          ? { project: item.project, version: status.version || null }
          : null;
      } catch {
        /* not running, or unreachable: there is nothing here to report */
        return null;
      }
    });
  return (await Promise.all(probes)).filter(Boolean);
}
export function pauseRegistered(workspace, installRoot) {
  return eachRegistered(workspace, installRoot, "pause", (runtime, item) =>
    atomicJson(path.join(runtime, "disabled.json"), {
      disabledAt: Date.now(),
      instanceId: item.instanceId,
    }),
  );
}
// A Gateway shutdown reaches a plugin as a disable: the host picks the "restart"
// reason only when the plugin is still present in the next registry, and a
// process that is going away has no next registry. So the marker cannot be
// avoided at pause time — but it does not have to be. Loading at all proves the
// extension is enabled, which makes any marker left by the previous process
// stale regardless of which of the two wrote it. A plugin that really was
// disabled never registers again, so its marker is never reached here.
export function resumeRegistered(workspace, installRoot) {
  return eachRegistered(workspace, installRoot, "resume", (runtime) => {
    const marker = path.join(runtime, "disabled.json");
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
  });
}
