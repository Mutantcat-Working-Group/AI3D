// Installed-package acceptance, not a substitute for a real model-runtime turn.
// Host supplies its public SDK; no private OpenClaw implementation imports.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire, registerHooks } from "node:module";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { DOC_FILES } from "../integration/manager.mjs";

if (!process.argv[2])
  throw new Error(
    "Usage: node tests/package-smoke.mjs <built-package-dir>\n" +
      "Build one first: npm run build:integration -- tmp/<candidate>",
  );
const root = fs.realpathSync(process.argv[2]);
const globalModules = execFileSync("npm", ["root", "-g"], {
  encoding: "utf8",
}).trim();
const hostRequire = createRequire(
  path.join(globalModules, "openclaw/package.json"),
);
// Node 24.18 runs require.resolve through these same hooks, so resolving the
// SDK from inside one re-entered it without end; the flag lets that inner
// lookup take the ordinary path.
let resolvingSdk = false;
registerHooks({
  resolve(specifier, ctx, next) {
    if (resolvingSdk || !specifier.startsWith("openclaw/plugin-sdk/"))
      return next(specifier, ctx);
    resolvingSdk = true;
    try {
      return {
        url: pathToFileURL(hostRequire.resolve(specifier)).href,
        shortCircuit: true,
      };
    } finally {
      resolvingSdk = false;
    }
  },
});
const repo = process.cwd();
assert.equal(
  root.startsWith(path.join(repo, "tmp") + path.sep),
  true,
  "Fault injection only accepts an isolated installation under project tmp/",
);
const workspace = fs.mkdtempSync(path.join(repo, "tmp", "package acceptance "));
const ctx = {
  workspaceDir: workspace,
  fsPolicy: { workspaceOnly: true },
  agentId: "package-test",
  sessionKey: "package-fixture",
  sessionId: "fixture-generation",
  messageChannel: "webchat",
};
let factory, lifecycle;
const plugin = (await import(pathToFileURL(path.join(root, "index.mjs"))))
  .default;
// Registration is what a Gateway start does, so the test can replay one.
const registerPlugin = () =>
  plugin.register({
    rootDir: root,
    source: path.join(root, "index.mjs"),
    config: { agents: { defaults: { workspace } } },
    pluginConfig: { listenHost: "127.0.0.1", clientAddress: "127.0.0.1" },
    registerTool(value) {
      factory = value;
    },
    lifecycle: {
      registerRuntimeLifecycle(value) {
        lifecycle = value;
      },
    },
  });
registerPlugin();
assert.equal(typeof factory, "function");
const tool = factory(ctx);
const call = async (params) => {
  const result = await tool.execute("package-smoke", params);
  assert.notEqual(result.isError, true, result.content?.[0]?.text);
  return result.details;
};
fs.writeFileSync(
  path.join(workspace, "part.stl"),
  "solid part\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid part\n",
);
let browser;
const serviceFile = path.join(root, "runtime/server.mjs");
const originalService = fs.readFileSync(serviceFile);
const projects = ["projects/bracket-a", "projects/bracket-b"];
try {
  const info = await call({ action: "inspect" });
  assert.equal(info.context.sessionGeneration, true);
  // The first call an agent makes on a new host hands back absolute paths to
  // the documentation it is told to read. This package used to name two files
  // it did not contain, and an unopenable path looks just like a working one.
  assert.deepEqual(
    Object.keys(info.docs).sort(),
    Object.keys(DOC_FILES).sort(),
    "the built package is missing a document inspect should report",
  );
  for (const [key, file] of Object.entries(info.docs))
    assert.equal(fs.existsSync(file), true, `inspect names a missing ${key}`);
  // The build that is running, not the file on disk: installing over a host
  // that has already loaded this one changes the second and not the first.
  const manifestFile = path.join(root, "package.json");
  const shipped = fs.readFileSync(manifestFile);
  assert.equal(info.integrationVersion, JSON.parse(shipped).version);
  fs.writeFileSync(
    manifestFile,
    JSON.stringify({
      ...JSON.parse(shipped),
      version: "99.0.0-installed-later",
    }),
  );
  try {
    assert.equal(
      (await call({ action: "inspect" })).integrationVersion,
      info.integrationVersion,
    );
  } finally {
    fs.writeFileSync(manifestFile, shipped);
  }
  // Sizing has to work from the installed bundle before any project exists,
  // because its whole purpose is to run before a caller commits to a review.
  const sized = await call({ action: "precheck", file: "part.stl" });
  assert.equal(sized.verdict, "ok");
  assert.equal(sized.triangles, 1);
  assert.equal(sized.limits.maxTriangles, 600000);
  const over = Buffer.alloc(84 + 700000 * 50);
  over.writeUInt32LE(700000, 80);
  fs.writeFileSync(path.join(workspace, "over.stl"), over);
  const rejected = await call({ action: "precheck", file: "over.stl" });
  assert.equal(rejected.verdict, "reject");
  assert.equal(rejected.triangles, 700000);
  assert.ok(700000 * rejected.simplify.requiredRatio <= 600000);
  fs.rmSync(path.join(workspace, "over.stl"));
  assert.equal(
    fs.existsSync(path.join(workspace, "projects/ai3d-state/registry.json")),
    false,
    "precheck must not register a project or start an instance",
  );
  /* STEP is the one format whose support lives outside the bundle: a WASM
     kernel loaded from `vendor/`, and a worker thread started from a file
     beside the server. Neither is reachable from a clone, so a suite that
     drives source code cannot see them go missing -- and 1.3.0-dev shipped a
     package where both were, while every test here passed.

     Two separate failures, one per entry point, which is why both are checked:
     the adapter measured a STEP without loading the kernel first, and the
     release copy carried neither the kernel nor the worker. */
  fs.copyFileSync(
    path.join(repo, "tests/fixtures/plate.step"),
    path.join(workspace, "plate.step"),
  );
  const step = await call({ action: "precheck", file: "plate.step" });
  assert.equal(step.format, "step");
  assert.equal(step.verdict, "ok");
  assert.equal(step.triangles, 344, "the packaged kernel tessellates the same");
  const stepProject = "projects/bracket-step";
  const published = await call({
    action: "open",
    project: stepProject,
    file: "plate.step",
    name: "STEP fixture",
    version: "v1",
  });
  assert.ok(published.url, "a STEP publish returns a reviewable URL");
  /* What was published stays the STEP; what the page loads is derived from it.
     Both halves on disk is the only proof from out here that the worker ran:
     the publish that failed returned the same shape of error as any other. */
  const runtimeDir = path.join(workspace, stepProject, ".ai3d");
  const [projectId] = fs.readdirSync(runtimeDir);
  const active = JSON.parse(
    fs.readFileSync(path.join(runtimeDir, projectId, "state.json"), "utf8"),
  ).active;
  assert.equal(active.format, "step", "the source is kept as it was published");
  assert.equal(
    fs
      .readFileSync(path.join(workspace, active.stored))
      .equals(fs.readFileSync(path.join(repo, "tests/fixtures/plate.step"))),
    true,
    "the stored source is not the STEP that was handed in",
  );
  assert.equal(active.mesh?.format, "glb", "the tessellating worker never ran");
  assert.ok(active.mesh.brepFaces > 0, "the kernel lost its BREP face mapping");
  assert.equal(fs.existsSync(path.join(workspace, active.mesh.stored)), true);
  const results = [];
  for (const project of projects)
    results.push(
      await call({
        action: "open",
        project,
        file: "part.stl",
        name: "Archive fixture",
        version: "v1",
      }),
    );
  assert.notEqual(results[0].url, results[1].url);
  assert.notEqual(results[0].instanceId, results[1].instanceId);
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext();
  const pages = [];
  for (const result of results) {
    const page = await context.newPage();
    pages.push(page);
    await page.goto(result.url);
    await page.waitForFunction(async () => {
      const response = await fetch("/api/state");
      if (!response.ok) return false;
      const state = await response.json();
      return Boolean(state.active);
    });
    await page.waitForSelector("canvas");
  }
  // All cookies belong to the same host, despite two ports. Browser itself,
  // not a hand-composed header, must preserve both remembered identities.
  const cookies = await context.cookies();
  assert.equal(
    cookies.filter((c) => c.name.startsWith("review_access_")).length,
    2,
  );
  for (const page of pages) {
    await page.reload();
    assert.equal(
      await page.evaluate(async () => (await fetch("/api/state")).status),
      200,
    );
  }
  /* And the STEP round gets a real tab, because everything asserted about it
     above was read off the disk -- and the one thing a browser does that no
     file check can is report back which bytes it drew. 1.3.0-dev stored the
     source, derived the mesh, served that mesh and hashed it correctly, then
     refused the page's report of that same hash because it was measured
     against the source. Every check out here passed; no reviewer could open
     it, and the page reloaded itself forever saying the model was wrong. */
  const stepPage = await context.newPage();
  await stepPage.goto(published.url);
  await stepPage.waitForSelector("canvas");
  await stepPage.waitForFunction(
    () => document.querySelector("#loading")?.hidden === true,
  );
  const stepStatus = await call({ action: "status", project: stepProject });
  const drawn = Object.values(stepStatus.viewerReceipts)[0];
  assert.ok(drawn, "a real browser must be able to draw a STEP round");
  assert.equal(
    drawn.sha256,
    stepStatus.active.mesh.sha256,
    "the page verifies the mesh it drew, never the source it cannot draw",
  );
  /* There is deliberately no header row naming the model -- see the note in
     src/main.js -- so this one pill is the whole of what tells the reviewer
     which kind of file they are looking at. A STEP round that does not say
     STEP is indistinguishable on screen from a mesh one, and the reviewer has
     no other way to tell that what they are marking was tessellated for them. */
  const named = await stepPage.evaluate(() => {
    const el = document.querySelector("#model-info");
    if (!el) return null;
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const shell = document
      .querySelector(".viewer-shell")
      .getBoundingClientRect();
    /* Everything that floats over the model is placed by a rule that cannot
       see the others, and the pill is the one that loses -- it is the only one
       with nothing underneath it to claim room. Naming the neighbours one at a
       time is how the compass got missed, so ask all of them. Visible is not
       the same as legible. */
    const overlaps = [
      ".orient",
      ".toolbar",
      "#echo-dock",
      "#tool-hint",
      ".axis-label",
      "#review-status",
      "#tool-options",
    ].filter((selector) => {
      const other = document.querySelector(selector);
      if (!other) return false;
      const seen = getComputedStyle(other);
      if (seen.display === "none" || seen.visibility === "hidden") return false;
      const rect = other.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      return !(
        box.right <= rect.left ||
        box.left >= rect.right ||
        box.bottom <= rect.top ||
        box.top >= rect.bottom
      );
    });
    return {
      text: el.textContent,
      shown:
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0 &&
        box.width > 0 &&
        box.height > 0,
      overlaps,
      // Asked for in the bottom-right of the view, so state the corner rather
      // than the offsets that happen to put it there.
      corner: {
        right: box.left > shell.left + shell.width / 2,
        bottom: box.top > shell.top + shell.height / 2,
      },
    };
  });
  assert.ok(named, "the format has to be written somewhere on the page");
  assert.equal(named.shown, true, "and it has to be visible at desktop width");
  assert.deepEqual(named.overlaps, [], "with nothing painted over it");
  assert.deepEqual(
    named.corner,
    { right: true, bottom: true },
    "in the bottom-right of the view, where the reviewer asked for it",
  );
  assert.match(named.text, /STEP/, "a STEP round says STEP");
  assert.match(named.text, /344/, "beside the count it was measured at");
  /* This round was published without units, so the pill renders the record's
     sentinel -- and rendered it raw, one English word inside a line that is
     otherwise translated. It is a placeholder, not a unit, and the reviewer
     should never be shown the placeholder's internal spelling. */
  assert.doesNotMatch(named.text, /unspecified/i, "in the reviewer's language");
  await stepPage.close();
  for (const project of projects) {
    const status = await call({ action: "status", project });
    assert.equal(status.codeRoot.startsWith(workspace), true);
    assert.match(status.releaseId, /^[a-f0-9]{64}$/);
    // A release id says which bytes are running but not whether they are the
    // ones just installed. Freshly opened, the two versions agree — and when
    // they stop agreeing the status has to say so unprompted, because the
    // symptom otherwise is a fix that silently never reaches the reviewer.
    assert.equal(status.version, status.integrationVersion);
    assert.equal(status.serving, undefined);
    assert.equal(status.access.browsers.length, 1);
    assert.ok(
      Object.keys(status.viewerReceipts).length,
      "real browser must report model readiness",
    );
  }
  lifecycle.cleanup({ reason: "disable" });
  for (const page of pages)
    assert.equal(
      await page.evaluate(
        async () =>
          (
            await fetch("/api/draft", {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "X-Review-Client": "1",
              },
              body: "{}",
            })
          ).status,
      ),
      503,
    );
  // A new plugin process can find durable registrations too. Gateway restart
  // does not stop model services, and an explicit open resumes paused writes.
  await call({ action: "open", project: projects[0] });
  assert.notEqual(
    await pages[0].evaluate(
      async () =>
        (
          await fetch("/api/draft", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-Review-Client": "1",
            },
            body: "{}",
          })
        ).status,
    ),
    503,
  );
  // A Gateway shutdown reaches a plugin as a disable, so a restart used to
  // strand every open review behind a 503 that only an Agent action could
  // lift. Registering again is the whole proof that the extension is enabled,
  // and it has to be enough on its own: no open, no tool call, no reload.
  lifecycle.cleanup({ reason: "disable" });
  registerPlugin();
  for (const page of pages)
    assert.notEqual(
      await page.evaluate(
        async () =>
          (
            await fetch("/api/draft", {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "X-Review-Client": "1",
              },
              body: "{}",
            })
          ).status,
      ),
      503,
      "registering again must clear a pause left by the previous process",
    );
  // The reason exists precisely so a live plugin is not torn down; acting on it
  // would pause instances that stay reachable across the reload.
  lifecycle.cleanup({ reason: "restart" });
  const registered = JSON.parse(
    fs.readFileSync(
      path.join(workspace, "projects/ai3d-state/registry.json"),
      "utf8",
    ),
  );
  for (const item of Object.values(registered.projects))
    assert.equal(
      fs.existsSync(path.join(workspace, item.runtime, "disabled.json")),
      false,
      "a restart must not pause a managed instance",
    );
  const beforeUpgrade = await call({ action: "status", project: projects[0] });
  const clientId = Object.keys(beforeUpgrade.viewerReceipts)[0];
  const owner = { clientId, versionId: beforeUpgrade.active.id };
  const browserPost = (route, body) =>
    pages[0].evaluate(
      async ({ route, body }) => {
        const response = await fetch(`/api/${route}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Review-Client": "1",
          },
          body: JSON.stringify(body),
        });
        return { status: response.status, body: await response.json() };
      },
      { route, body },
    );
  assert.equal((await browserPost("review/begin", owner)).status, 200);
  fs.writeFileSync(
    serviceFile,
    "throw new Error('isolated broken release');\n",
  );
  const busy = await tool.execute("upgrade-busy", {
    action: "open",
    project: projects[0],
  });
  assert.equal(busy.details.code, "REVIEW_BUSY");
  assert.equal((await browserPost("review/finish", owner)).status, 200);
  const rollback = await tool.execute("upgrade-failure", {
    action: "open",
    project: projects[0],
  });
  assert.equal(rollback.details.code, "UPGRADE_ROLLED_BACK");
  const recovered = await call({ action: "status", project: projects[0] });
  assert.equal(recovered.releaseId, beforeUpgrade.releaseId);
  assert.equal(recovered.network.port, beforeUpgrade.network.port);
  assert.equal(
    recovered.access.browsers[0].id,
    beforeUpgrade.access.browsers[0].id,
  );
  await pages[0].reload();
  assert.equal(
    await pages[0].evaluate(async () => (await fetch("/api/state")).status),
    200,
  );
  fs.writeFileSync(
    serviceFile,
    Buffer.concat([
      originalService,
      Buffer.from("\n// isolated valid upgrade fixture\n"),
    ]),
  );
  await call({ action: "open", project: projects[0] });
  const upgraded = await call({ action: "status", project: projects[0] });
  assert.notEqual(upgraded.releaseId, beforeUpgrade.releaseId);
  assert.equal(upgraded.network.port, beforeUpgrade.network.port);
  assert.equal(
    upgraded.access.browsers[0].id,
    beforeUpgrade.access.browsers[0].id,
  );
  const manifest = path.join(root, "openclaw.plugin.json");
  const removedManifest = path.join(root, "openclaw.plugin.test-backup.json");
  fs.renameSync(manifest, removedManifest);
  try {
    assert.equal((await browserPost("review/begin", owner)).status, 503);
  } finally {
    fs.renameSync(removedManifest, manifest);
  }
  console.log(
    JSON.stringify({
      ok: true,
      installedRoot: path.relative(repo, root),
      cases: [
        "public SDK factory",
        "instance-free model precheck",
        "bundled server and frontend",
        "two actual Chromium tabs",
        "independent cookies",
        "verified model receipts",
        "disable and resume",
        "busy upgrade protection",
        "failed upgrade rollback",
        "valid upgrade without logout",
        "uninstall freezes writes",
      ],
      realAgentTurn: false,
      windowsValidated: false,
    }),
  );
} finally {
  fs.writeFileSync(serviceFile, originalService);
  await browser?.close();
  // Only fixture processes whose private instance records live under our new workspace.
  const registry = path.join(workspace, "projects/ai3d-state/registry.json");
  if (fs.existsSync(registry))
    for (const record of Object.values(
      JSON.parse(fs.readFileSync(registry, "utf8")).projects,
    )) {
      try {
        const owner = JSON.parse(
          fs.readFileSync(
            path.join(workspace, record.runtime, "instance.lock"),
            "utf8",
          ),
        );
        process.kill(owner.pid, "SIGTERM");
      } catch {}
    }
  await new Promise((r) => setTimeout(r, 150));
  fs.rmSync(workspace, { recursive: true, force: true });
}
