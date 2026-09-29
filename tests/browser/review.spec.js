import { test, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import * as THREE from "three";
import { fetchLoadedModel, loadedModelDisposition } from "./loaded-model.mjs";

const repo = process.cwd(),
  url = "http://127.0.0.1:43174";
const browserUrl = process.env.REVIEW_BROWSER_ORIGIN || url;
let child, dir, env;
async function request(method, route, body) {
  const res = await fetch(`${url}/api/${route}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Review-Client": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}
function fetchThroughFixture(route) {
  // route.fetch uses Node DNS, not Chromium's host-resolver mapping. Keep the
  // browser origin/Host while reaching the isolated loopback fixture directly.
  const target = new URL(route.request().url());
  const host = target.host;
  target.hostname = "127.0.0.1";
  return route.fetch({
    url: target.href,
    headers: { ...route.request().headers(), host },
  });
}
function publish(file = "parametric-bracket.glb", version = "v1") {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "scripts/reviewctl.mjs",
        "publish",
        `tmp/samples/${file}`,
        "--name",
        file === "bunny-figurine.glb" ? "人偶樣例" : "參數支架",
        "--version",
        version,
      ],
      { cwd: repo, env, encoding: "utf8" },
    ),
  );
}
async function ready(page) {
  await page.goto(browserUrl);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Label tool", exact: true }),
  ).toBeEnabled();
}
async function point(page, dx = 0, dy = 0) {
  const box = await page.locator("#viewer").boundingBox();
  return {
    x: box.x + box.width * 0.55 + dx,
    y: box.y + box.height * 0.45 + dy,
  };
}
async function pin(page) {
  await page.getByRole("button", { name: "Label tool", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
}

test.beforeEach(async () => {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  dir = fs.mkdtempSync(path.join(repo, "tmp", "browser-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.copyFileSync("tests/fake-openclaw.mjs", path.join(bin, "openclaw"));
  fs.chmodSync(path.join(bin, "openclaw"), 0o755);
  env = {
    ...process.env,
    PORT: "43174",
    REVIEW_DATA_DIR: dir,
    REVIEW_MEDIA_DIR: path.join(dir, "models"),
    REVIEW_DIST_DIR: path.join(repo, "tmp/refinement-dist"),
    REVIEW_SESSION_KEY: "test-only-review-session",
    REVIEW_ALLOWED_HOSTS: "review.test",
    REVIEW_UPDATE_CHECK: "off",
    REVIEW_FAKE_GATEWAY_LOG: path.join(dir, "fake-gateway.json"),
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
  };
  const log = fs.openSync(path.join(dir, "server.log"), "a");
  child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: repo,
    env,
    stdio: ["ignore", log, log],
  });
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  publish();
});
test.afterEach(async () => {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  }
});

test("actual double click creates a surface pin; refresh restores it and geometry ownership", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  const before = await page.evaluate(() => window.__reviewDiagnostics());
  expect(before.annotations[0].type).toBe("pin");
  expect(
    before.annotations[0].barycentric.reduce((a, b) => a + b, 0),
  ).toBeCloseTo(1, 4);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  const after = await page.evaluate(() => window.__reviewDiagnostics());
  expect(after.annotations).toEqual(before.annotations);
  expect(after.owned).toBe(true);
  await page.screenshot({
    path: path.resolve(
      "tmp/screenshots/2026-09-09-3d-review-v02-pin-tested.png",
    ),
    fullPage: true,
  });
});

test("a fill produces real face sets; undo, redo, delete and refresh retain the correct draft", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("button", { name: "Paint bucket tool", exact: true })
    .click();
  const p = await point(page, -35, 0);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const painted = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  expect(painted[0].type).toBe("region");
  expect(Object.values(painted[0].faces).flat().length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(painted);
  await page.screenshot({
    path: path.resolve(
      "tmp/screenshots/2026-09-09-3d-review-v02-brush-tested.png",
    ),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Delete red area", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(0);
});

test("a new Agent model takes the screen at once and the marked one stays a tab", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  const original = await page.evaluate(
    () => window.__reviewDiagnostics().versionId,
  );
  const next = publish("bunny-figurine.glb", "v2");
  expect(next.status).toBe("active");
  // Presentation is the Agent's to drive. The reviewer loses nothing by it:
  // the marked version keeps its own draft and is one tab away.
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(next.model.id);
  await expect(page.locator("#version-tabs")).toBeVisible();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(0);
  await page.locator(`.version-tab[data-version-id="${original}"]`).click();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(original);
  await expect(page.locator("#pending-banner")).toBeVisible();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(1);
  await page.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText(
    "delivered to the original conversation",
  );
  const log = JSON.parse(
    fs.readFileSync(path.join(dir, "fake-gateway.json"), "utf8"),
  );
  const send = log.calls.find((c) => c.method === "chat.send");
  expect(send.params.deliver).toBe(false);
  // The batch names the version it was made against, which is the whole point
  // of being able to go back: an older marking is not an ambiguous one.
  expect(send.params.message).toContain(original);
  expect(send.params.message).toContain(
    "not an instruction to change anything",
  );
  // The round is not closed here, because closing it is not a thing a reviewer
  // does: he hands the batch over and walks onto whatever the Agent publishes
  // next. The submission below was made by handing over, not by finishing.
  await expect(page.locator("#loading")).toBeHidden();
  await page
    .getByRole("button", { name: "Show the latest version", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(next.model.id);
  const state = await request("GET", "state");
  expect(state.data.submissions).toHaveLength(1);
  expect(state.data.submissions[0].versionId).toBe(original);
  await page.screenshot({
    path: path.resolve(
      "tmp/screenshots/2026-09-09-3d-review-v02-figurine-tested.png",
    ),
    fullPage: true,
  });
});

test("a second browser tab cannot overwrite another tab’s active work", async ({
  page,
  context,
}) => {
  await ready(page);
  await pin(page);
  const other = await context.newPage();
  await other.goto(browserUrl);
  await expect(other.locator("#loading")).toBeHidden();
  // A second tab is never locked out — it picks up the same draft and may mark.
  // Clobbering is prevented by the draft revision check, which is the only
  // guard that actually knows whether two edits conflict.
  await expect(
    other.getByRole("button", { name: "Label tool", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() => other.evaluate(() => window.__reviewDiagnostics().owned))
    .toBe(true);
  expect(
    await other.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(1);
  // The tab that lost presence is told another window is here.
  await expect(page.locator("#resume-banner")).toBeVisible();
  await other.getByRole("button", { name: "Label tool", exact: true }).click();
  const q = await point(other, 12, 12);
  await other.mouse.click(q.x, q.y);
  await expect
    .poll(() =>
      other.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(2);
  await expect(other.locator("#save-status")).toHaveText("Draft saved");
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  );
  expect(saved.drafts[saved.active.id].annotations).toHaveLength(2);
  expect(saved.drafts[saved.active.id].revision).toBe(2);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(1);
  await other.close();
});

/* The bucket crosses a connected surface on purpose, including round the back
   of it, so "only what you can see" was the brush's rule and left with it. What
   is still true, and is what this now pins, is that a fill stays on the mesh it
   was clicked: it walks one mesh's topology and cannot step onto a different
   object standing behind.

   The second half is the assertion this release exists for. A fill claims whole
   source faces, and a whole face is stored as its number alone — so a mark made
   by the bucket carries no coordinates at all. Coordinates were 142 bytes per
   face spent saying a second time what the face number already said, and for a
   whole release nothing in this suite would have noticed them come back. */
test("a bucket fill stays on the mesh it was clicked and stores no coordinates", async ({
  page,
}) => {
  publish("occlusion-check.glb", "occlusion-test");
  await ready(page);
  await page
    .getByRole("button", { name: "Paint bucket tool", exact: true })
    .click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const d = await page.evaluate(() => window.__reviewDiagnostics());
  const a = d.annotations[0];
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, "manifests", `${d.versionId}.json`), "utf8"),
  );
  const front = manifest.meshes.find((m) => m.name === "visible-front"),
    back = manifest.meshes.find((m) => m.name === "hidden-back");
  expect(Object.keys(a.faces)).toEqual([front.id]);
  expect(a.faces[back.id]).toBeUndefined();
  expect(a.coverage).toBe("source-v2");
  expect(a.faces[front.id].length).toBeGreaterThan(0);
  expect(a.surfacePatches).toEqual([]);
  expect(JSON.stringify(a)).not.toContain("vertices");
  /* What the service wrote down, not only what the page is holding — the two
     were not the same thing, and the page was the one being believed. Only
     `source-v2` is held to this: a v1 draft restored from disk legitimately
     carries its polygons and always will. */
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  );
  const v2 = Object.values(saved.drafts)
    .flatMap((d) => d.annotations)
    .filter((m) => m.coverage === "source-v2");
  expect(v2.length).toBeGreaterThan(0);
  for (const mark of v2) expect(mark.surfacePatches ?? []).toEqual([]);
});

test("temporary save failure keeps local edits, then retries without losing the stroke", async ({
  page,
}) => {
  await ready(page);
  await page.route("**/api/draft", (r) => r.abort());
  await page.getByRole("button", { name: "Label tool", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toContainText("Not synced");
  expect(await page.evaluate(() => window.__reviewDiagnostics().dirty)).toBe(
    true,
  );
  await page.unroute("**/api/draft");
  await page.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText(
    "delivered to the original conversation",
  );
  const d = await page.evaluate(() => window.__reviewDiagnostics());
  expect(d.annotationCount).toBe(1);
  expect(d.dirty).toBe(false);
});

test("agent handoff sends true 3D patch data while keeping the model locked", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("button", { name: "Paint bucket tool", exact: true })
    .click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  await page.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText(
    "delivered to the original conversation",
  );
  const s = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"))
    .submissions[0];
  // state.json keeps the receipt; the annotations live only in the immutable
  // per-submission file, which is the copy reviewctl read actually serves.
  expect(Object.hasOwn(s, "annotations")).toBe(false);
  const stored = JSON.parse(
    fs.readFileSync(path.join(dir, "submissions", `${s.id}.json`), "utf8"),
  );
  /* A fill's extent is the faces it claims. It carries no polygons, which is
     what `source-v2` is: the submission the agent reads is the compact form,
     not a materialised copy of it. */
  expect(stored.annotations[0].coverage).toBe("source-v2");
  expect(stored.annotations[0].surfacePatches).toEqual([]);
  expect(
    Object.values(stored.annotations[0].faces).flat().length,
  ).toBeGreaterThan(0);
  const sent = JSON.parse(
    fs.readFileSync(path.join(dir, "fake-gateway.json"), "utf8"),
  ).calls.find((c) => c.method === "chat.send");
  expect(sent.params.message).toContain("not a lettered pin");
  expect(sent.params.deliver).toBe(false);
  expect(s.meshManifest.meshes[0].surfaceAlgorithm).toBe(
    "midpoint-v3-edge0.07-rationed",
  );
  expect(s.model.sha256).toHaveLength(64);
  // Only tab present, so nothing reads as held by someone else; the round is
  // still open, which capabilities report rather than the presence flag.
  expect(await page.evaluate(() => window.__reviewDiagnostics().locked)).toBe(
    false,
  );
  expect(
    await page.evaluate(
      () => window.__reviewDiagnostics().capabilities.canFinish,
    ),
  ).toBe(true);
});

test("rejected geometry and stale revisions never replace valid saved annotations", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  const clientId = await page.evaluate(() =>
      sessionStorage.getItem("3d-review-client"),
    ),
    d = await page.evaluate(() => window.__reviewDiagnostics());
  const bad = await request("PUT", "draft", {
    versionId: d.versionId,
    clientId,
    revision: d.revision,
    annotations: [{ ...d.annotations[0], faceIndex: 999999 }],
    camera: null,
  });
  expect(bad.status).toBe(400);
  const stale = await request("PUT", "draft", {
    versionId: d.versionId,
    clientId,
    revision: 0,
    annotations: [],
    camera: null,
  });
  expect(stale.status).toBe(409);
  const data = await request("GET", `state?full=1&clientId=${clientId}`);
  expect(data.data.draft.annotations).toEqual(d.annotations);
});

test("compact viewport remains usable without page-wide horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 1000 });
  await ready(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Paint bucket tool", exact: true })
    .click();
  // The tool's own control has room at this width; it was the brush's size
  // slider that stood here before the brush was shelved.
  await expect(page.locator("#fill-range")).toBeVisible();
  await page.screenshot({
    path: path.resolve(
      "tmp/screenshots/2026-09-09-3d-review-v02-compact-tested.png",
    ),
    fullPage: true,
  });
});

test("real textured GLB, large mesh and STL load sequentially without retaining old GPU resources", async ({
  page,
}) => {
  test.setTimeout(120000);
  // These are real models from the developer's own media library, not fixtures
  // this repository ships or generates: a textured GLB, the same head at full
  // density, and an STL. The case is worth keeping — nothing generated stresses
  // texture upload the way it does — but on a clone that does not have them it
  // has to say so instead of failing, the way the LAN case already does.
  const heavy = [
    ["TRex_Head_retopo.glb", "恐龍頭 · 重拓撲"],
    ["TRex_Head_baked.glb", "恐龍頭 · 高面數"],
    ["3dbenchy.stl", "STL 小船"],
  ];
  test.skip(
    !heavy.every(([file]) =>
      fs.existsSync(path.join(repo, "../../media/3d", file)),
    ),
    "needs the local media library: media/3d/TRex_Head_*.glb and 3dbenchy.stl",
  );
  await ready(page);
  const metrics = [];
  for (const [file, name] of heavy) {
    const t = Date.now();
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "scripts/reviewctl.mjs",
          "publish",
          // A copy inside the clone: the library is outside what the server
          // will publish from, and is only read here to decide to run at all.
          (fs.copyFileSync(
            path.join(repo, "../../media/3d", file),
            path.join(dir, file),
          ),
          path.join(dir, file)),
          "--name",
          name,
          "--version",
          "format-check",
        ],
        { cwd: repo, env, encoding: "utf8" },
      ),
    );
    await expect
      .poll(
        () =>
          page.evaluate(() => window.__reviewDiagnostics().viewer.versionId),
        { timeout: 60000 },
      )
      .toBe(result.model.id);
    await expect(page.locator("#loading")).toBeHidden();
    const d = await page.evaluate(() => window.__reviewDiagnostics());
    expect(d.viewer.geometries).toBeLessThanOrEqual(d.viewer.meshes + 2);
    if (file.endsWith(".stl")) expect(d.viewer.textures).toBe(0);
    metrics.push({
      file,
      sourceTriangles: result.model.triangles,
      bytes: result.model.bytes,
      loadMs: Date.now() - t,
      ...d.viewer,
    });
    await page.screenshot({
      path: path.resolve(
        `tmp/screenshots/2026-09-09-3d-review-v02-real-${file.split(".")[0]}.png`,
      ),
      fullPage: true,
    });
  }
  fs.writeFileSync(
    path.join(dir, "model-metrics.json"),
    JSON.stringify(metrics, null, 2),
  );
  console.log("REAL MODEL METRICS", JSON.stringify(metrics));
});

test("an accepted feedback response lost in transit can be retried after refresh without a second delivery", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  let lost = false;
  await page.route("**/api/feedback", async (r) => {
    if (!lost) {
      lost = true;
      await fetchThroughFixture(r);
      await r.abort();
    } else await r.continue();
  });
  await page.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(page.locator("#toast")).toBeVisible();
  await page.unroute("**/api/feedback");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await page.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText(
    "delivered to the original conversation",
  );
  const log = JSON.parse(
    fs.readFileSync(path.join(dir, "fake-gateway.json"), "utf8"),
  );
  expect(log.calls.filter((c) => c.method === "chat.send")).toHaveLength(1);
  const s = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"));
  expect(s.submissions).toHaveLength(1);
  expect(s.drafts[s.active.id].annotations).toHaveLength(1);
});

test("review page keeps its conversation dock hidden and does not poll until opened", async ({
  page,
}) => {
  const calls = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/chat")) calls.push(r.url());
  });
  await ready(page);
  await expect(page.locator("#ai-dock")).toBeHidden();
  await expect(page.locator("#chat-input")).toBeHidden();
  await page.waitForTimeout(5300);
  expect(calls).toEqual([]);
  await page.click("#ai-button");
  await expect(page.locator("#ai-dock")).toBeVisible();
  await expect(page.locator("#chat-input")).toBeVisible();
});

test("the looking tool places nothing, and the right button is what rotates", async ({
  page,
}) => {
  await ready(page);
  const p = await point(page);
  const before = await page.evaluate(() => window.__reviewDiagnostics().camera);
  await page.mouse.click(p.x, p.y);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(0);
  // The left button used to rotate as well as mark, which is why painting had
  // to borrow Option or change tools to turn the model. It is the marker's now
  // and nothing else, so dragging it moves no camera.
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 45, p.y + 20, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const dragged = await page.evaluate(() => window.__reviewDiagnostics());
  expect(dragged.annotationCount).toBe(0);
  expect(dragged.camera).toEqual(before);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(p.x + 45, p.y + 20, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(350);
  const moved = await page.evaluate(() => window.__reviewDiagnostics());
  expect(moved.annotationCount).toBe(0);
  expect(moved.camera).not.toEqual(before);
  await page
    .getByRole("button", { name: "Reset the view", exact: true })
    .click();
  /* Everything above happened in the looking tool, which is why none of it
     made a mark: turning the model can no longer produce one by accident.
     Placing is a tool you choose, and then one click is enough. */
  await page.getByRole("button", { name: "Label tool", exact: true }).click();
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  /* The gesture this replaces was a double click, so the habit arrives with
     the reviewer — and it must leave one label, not two stacked on each other.
     The wait is what makes this a second gesture rather than a continuation of
     the first; without it the guard would rightly swallow the whole thing. */
  await page.waitForTimeout(700);
  await page.mouse.dblclick(p.x + 3, p.y + 2);
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(2);
  // A label meant for somewhere else is still a label, however soon it comes.
  await page.mouse.click(p.x + 40, p.y + 25);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(3);
  // Placing a label must not move the camera under the reviewer afterwards.
  const saved = await page.evaluate(() => window.__reviewDiagnostics().camera);
  await page.waitForTimeout(150);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().camera),
  ).toEqual(saved);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(3);
});

test("a lost draft acknowledgement replays its exact write before saving a newer edit", async ({
  page,
}) => {
  await ready(page);
  const writes = [];
  await page.route("**/api/draft", async (route) => {
    writes.push(route.request().postDataJSON());
    if (writes.length === 1) {
      await fetchThroughFixture(route);
      return route.abort();
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Label tool", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toContainText("Not synced");
  await page.mouse.click(p.x + 8, p.y + 8);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  expect(writes[1]).toEqual(writes[0]);
  expect(writes.at(-1).annotations).toHaveLength(2);
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  );
  expect(saved.drafts[saved.active.id].annotations).toHaveLength(2);
  expect(saved.drafts[saved.active.id].revision).toBe(2);
});

test("refresh recovers newer local edits after an acknowledged-on-server draft lost its response", async ({
  page,
}) => {
  await ready(page);
  let writes = 0;
  await page.route("**/api/draft", async (route) => {
    if (++writes === 1) await fetchThroughFixture(route);
    return route.abort();
  });
  await page.getByRole("button", { name: "Label tool", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toContainText("Not synced");
  await page.mouse.click(p.x + 8, p.y + 8);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(2);
  await expect(page.locator("#save-status")).toContainText("Not synced");
  const before = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  await page.unroute("**/api/draft");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(before);
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  );
  expect(saved.drafts[saved.active.id].annotations).toEqual(before);
  expect(saved.drafts[saved.active.id].revision).toBe(2);
});

test("a failed model download automatically retries and only enables editing after a verified load", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/models/*", async (route) => {
    if (++attempts === 1) return route.abort();
    return route.continue();
  });
  await ready(page);
  expect(attempts).toBe(2);
  await pin(page);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().viewer.versionId),
  ).toBe((await request("GET", "state")).data.active.id);
});

test("bytes that are not the announced version stop the page rather than looping it", async ({
  page,
}) => {
  let served = 0;
  await page.route("**/api/models/*", (route) => {
    served++;
    /* Delivered, readable and simply not this version — the one failure a
       second attempt cannot change. The retry above is deliberate and stays;
       telling the two apart is the whole point, because a load that ends here
       drops the version the page was holding, and the poll exists to load
       whatever the page is not holding. */
    return route.fulfill({
      status: 200,
      contentType: "model/gltf-binary",
      body: Buffer.from("these are not the bytes that were published"),
    });
  });
  await page.goto(browserUrl);
  await expect(page.locator("#loading-text")).toHaveText(
    /does not match the version/,
  );
  await expect(page.locator("#loading .spinner")).toBeHidden();
  expect(served).toBe(1);

  // Three poll intervals: long enough that a page still trying would have tried
  // again, and would also have replaced the reason above with its own spinner.
  await page.waitForTimeout(2200 * 3);
  expect(served).toBe(1);
  await expect(page.locator("#loading-text")).toHaveText(
    /does not match the version/,
  );
  await expect(
    page.getByRole("button", { name: "Label tool", exact: true }),
  ).toBeDisabled();
});

test("resuming a closed tab restores its unsynced local draft instead of replacing it with the older server draft", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.route("**/api/draft", (route) => route.abort());
  await page.getByRole("button", { name: "Label tool", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toContainText("Not synced");
  const before = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  await page.close();
  const replacement = await context.newPage();
  await replacement.goto(browserUrl);
  await expect(replacement.locator("#loading")).toBeHidden();
  // No banner and no waiting out a stale lock: the round was never withheld,
  // so the new tab takes it on load and its unsynced local draft still wins.
  await expect(replacement.locator("#resume-banner")).toBeHidden();
  await expect
    .poll(() => replacement.evaluate(() => window.__reviewDiagnostics().owned))
    .toBe(true);
  await expect(replacement.locator("#save-status")).toHaveText("Draft saved");
  expect(
    await replacement.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(before);
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  );
  expect(saved.drafts[saved.active.id].annotations).toEqual(before);
  await replacement.close();
});

test("a truly divergent cached draft is durably backed up before new edits can replace the active cache", async ({
  page,
}) => {
  await ready(page);
  await page.route("**/api/draft", (route) => route.abort());
  await page.getByRole("button", { name: "Label tool", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toContainText("Not synced");
  const before = await page.evaluate(() => window.__reviewDiagnostics());
  const clientId = await page.evaluate(() =>
    sessionStorage.getItem("3d-review-client"),
  );
  const different = [{ ...before.annotations[0], color: "#629bd8" }];
  expect(
    (
      await request("PUT", "draft", {
        versionId: before.versionId,
        clientId,
        revision: before.revision,
        annotations: different,
        camera: before.camera,
      })
    ).status,
  ).toBe(200);
  await page.unroute("**/api/draft");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#recovery-banner")).toBeVisible();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(different);
  await page.getByRole("button", { name: "Label tool", exact: true }).click();
  await page.mouse.click(p.x + 8, p.y + 8);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(2);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const backup = await page.evaluate(() => {
    const key = localStorage.getItem(
      `${window.__reviewDiagnostics().draftCacheKey}-recovery-latest`,
    );
    return JSON.parse(localStorage.getItem(key));
  });
  expect(backup.versionId).toBe(before.versionId);
  expect(backup.annotations[0].color).toBe(before.annotations[0].color);
  expect(backup.pendingWrite.annotations).toEqual(backup.annotations);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#download-recovery")).toBeVisible();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(2);
});

test("legacy pins and paint fixture restore unchanged alongside a new fill", async ({
  page,
}) => {
  await ready(page);
  const legacy = JSON.parse(
    fs.readFileSync("tests/fixtures/legacy-review.json", "utf8"),
  );
  const d = await page.evaluate(() => window.__reviewDiagnostics());
  const clientId = await page.evaluate(() =>
    sessionStorage.getItem("3d-review-client"),
  );
  const owner = { versionId: d.versionId, clientId };
  expect((await request("POST", "review/begin", owner)).status).toBe(200);
  expect(
    (
      await request("PUT", "draft", {
        ...owner,
        revision: 0,
        annotations: legacy.annotations,
        camera: legacy.camera,
      })
    ).status,
  ).toBe(200);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(legacy.annotations);
  await expect(page.locator(".model-pin")).toHaveCount(2);
  await expect(page.locator(".annotation-badge").nth(2)).toHaveText("");
  await page
    .getByRole("button", { name: "Reset the view", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Paint bucket tool", exact: true })
    .click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(4);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const after = await page.evaluate(() => window.__reviewDiagnostics());
  /* The three restored marks come back byte for byte in the format they were
     written in — that is the whole point of the fixture — while the new one
     beside them is written in the current format. Both live in one draft. */
  expect(after.annotations.slice(0, 3)).toEqual(legacy.annotations);
  expect(after.annotations[3].coverage).toBe("source-v2");
  expect(after.annotations[3].surfacePatches).toEqual([]);
});

test("narrow embedded review fixture remains interactive without a duplicated conversation", async ({
  page,
}) => {
  await page.route(`${url}/host-fixture`, (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<style>body{margin:0;display:flex}aside{flex:1}iframe{width:460px;height:850px;border:0}</style><aside>Original conversation fixture — not Control UI</aside><iframe name="review" src="${url}/"></iframe>`,
    }),
  );
  await page.goto(`${url}/host-fixture`);
  const frame = page.frame({ name: "review" });
  await expect(frame.locator("#loading")).toBeHidden();
  expect(
    await frame.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(frame.locator("#ai-dock")).toBeHidden();
  await frame.getByRole("button", { name: "Label tool", exact: true }).click();
  const box = await frame.locator("#viewer").boundingBox();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await expect
    .poll(() =>
      frame.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(frame.locator("#save-status")).toHaveText("Draft saved");
  await frame.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(frame.locator("#feedback-status")).toContainText(
    "delivered to the original conversation",
  );
});

test("marking never has to stop to turn the model, and does not consume point label numbers", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("button", { name: "Paint bucket tool", exact: true })
    .click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const before = await page.evaluate(() => window.__reviewDiagnostics());
  // The friction this replaces: with the camera on the left button too, turning
  // the model between marks meant holding Option or switching back to the view
  // tool and switching out again. The right button was free the whole time.
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(p.x + 30, p.y + 12, { steps: 4 });
  await page.mouse.up({ button: "right" });
  const after = await page.evaluate(() => window.__reviewDiagnostics());
  expect(after.annotations).toEqual(before.annotations);
  expect(after.camera).not.toEqual(before.camera);
  await page
    .getByRole("button", { name: "Reset the view", exact: true })
    .click();
  await page.getByRole("button", { name: "Label tool", exact: true }).click();
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(2);
  const annotations = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  expect(annotations.find((a) => a.type === "pin").label).toBe("A");
});

test("medium and wide review layouts do not retain an empty chat column", async ({
  page,
}) => {
  await ready(page);
  for (const width of [900, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const box = await page.locator(".review-panel").boundingBox();
    expect(box.width).toBeGreaterThan(width * 0.95);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("iteration: stable letters, explicit focus, relocation, hide and undo preserve identity", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  const first = await page.evaluate(() => window.__reviewDiagnostics());
  expect(first.annotations[0].label).toBe("A");
  await page
    .getByRole("button", { name: "Delete label A", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(0);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await pin(page);
  const second = await page.evaluate(() => window.__reviewDiagnostics());
  expect(second.annotations[0].label).toBe("B");
  const p = await point(page, -80, -50);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 40, p.y + 20, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  await page
    .getByRole("button", { name: "Reset the view", exact: true })
    .click();
  const camera = await page.evaluate(() => window.__reviewDiagnostics().camera);
  await page.locator(".annotation-select").click();
  const selectedCamera = await page.evaluate(
    () => window.__reviewDiagnostics().camera,
  );
  for (const key of ["position", "target"])
    selectedCamera[key].forEach((v, i) =>
      expect(v).toBeCloseTo(camera[key][i], 8),
    );
  await page.getByRole("button", { name: "Move label B", exact: true }).click();
  const target = await point(page, -25, 30);
  await page.mouse.click(target.x, target.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotations[0].position),
    )
    .not.toEqual(second.annotations[0].position);
  expect(
    (await page.evaluate(() => window.__reviewDiagnostics().annotations[0])).id,
  ).toBe(second.annotations[0].id);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().annotations))
    .toEqual(second.annotations);
  await page.locator("#toggle-marks").click();
  await expect(page.locator(".model-pin")).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().annotations))
    .toEqual(second.annotations);
  await page.locator("#toggle-marks").click();
  // The control points the way the panel moves. A plus and a minus sat beside a
  // list that really can have marks added to it, and read as doing that.
  const iconRef = () =>
    page.locator("#toggle-annotations use").getAttribute("href");
  expect(await iconRef()).toBe("#mc-collapse-left");
  await page.locator("#toggle-annotations").click();
  await expect(page.locator("#annotations-list")).toBeHidden();
  expect(await iconRef()).toBe("#mc-expand-right");
  // Folding the panel is a request for the model to have the room, and a
  // send button left standing in the gap is most of the width back again.
  // Handing the marks over is something you do while looking at them, so it
  // folds with them and comes back when they do.
  await expect(page.locator("#submit-feedback")).toBeHidden();
  // Folded is the button and nothing else. A heading that stays behind keeps
  // the column roughly as wide as the words in it, in every language.
  await expect(page.locator(".annotations-heading strong")).toBeHidden();
  await expect(page.locator("#toggle-annotations")).toBeVisible();
  const folded = await page.locator(".annotations-panel").boundingBox();
  expect(folded.width).toBeLessThan(60);
  await page.locator("#toggle-annotations").click();
  await expect(page.locator("#submit-feedback")).toBeVisible();
  await expect(page.locator(".annotations-heading strong")).toBeVisible();
});

/* The preview has to be the promise: what the cursor shades before the click is
   exactly what the click claims, face for face.

   The second half used to erase part of the fill. With the eraser shelved, the
   way back from a fill is to undo it or delete the mark, and that is what is
   pinned here instead — a reviewer who fills the wrong surface is not stuck. */
test("iteration: bucket preview equals filled coverage, and a fill can be taken back", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("button", { name: "Paint bucket tool", exact: true })
    .click();
  const p = await point(page);
  await page.mouse.move(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().viewer.fillFaces),
    )
    .toBeGreaterThan(1);
  const count = await page.evaluate(
    () => window.__reviewDiagnostics().viewer.fillFaces,
  );
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(0);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const filled = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  // The faces are the coverage now; the fill stores no polygons at all.
  expect(Object.values(filled[0].faces).flat().length).toBe(count);
  expect(filled[0].surfacePatches).toEqual([]);
  await page.locator(".delete-annotation").first().click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(0);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().annotations))
    .toEqual(filled);
});

test("iteration: explicit Agent read receipt and separate echo survive corrections without moving the camera", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("button", { name: "Paint bucket tool", exact: true })
    .click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  await page.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText(
    "delivered to the original conversation",
  );
  await expect(page.locator("#feedback-status")).not.toContainText(
    "the Agent has read it",
  );
  const receipt = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  ).submissions[0];
  const submission = JSON.parse(
    fs.readFileSync(
      path.join(dir, "submissions", `${receipt.id}.json`),
      "utf8",
    ),
  );
  execFileSync(
    process.execPath,
    ["scripts/reviewctl.mjs", "read", submission.id],
    { cwd: repo, env, stdio: "pipe" },
  );
  await expect(page.locator("#feedback-status")).toContainText(
    "the Agent has read it",
  );
  const before = await page.evaluate(() => window.__reviewDiagnostics());
  const file = path.join(dir, "echo.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      submissionId: submission.id,
      versionId: submission.versionId,
      summary: "測試指定範圍",
      annotations: submission.annotations,
    }),
  );
  execFileSync(process.execPath, ["scripts/reviewctl.mjs", "echo", file], {
    cwd: repo,
    env,
    stdio: "pipe",
  });
  await expect(page.locator("#echo-panel")).toBeVisible();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(before.annotations);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().camera),
  ).toEqual(before.camera);
  await page.locator("#toggle-marks").click();
  expect(
    await page.evaluate(
      () => window.__reviewDiagnostics().viewer.annotationsVisible,
    ),
  ).toBe(false);
  expect(
    JSON.parse(
      fs.readFileSync(
        path.join(dir, "submissions", submission.id + ".json"),
        "utf8",
      ),
    ).annotations,
  ).toEqual(submission.annotations);
});

test("iteration: current-version download is original bytes, including after neutral view and a queued replacement", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  const stateBefore = (await request("GET", "state")).data;
  await page.locator("#neutral-view").click();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().viewer.neutral),
  ).toBe(true);
  const next = publish("bunny-figurine.glb", "newer");
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(next.model.id);
  // Going back to the marked version must download that version's bytes, not
  // whichever one the Agent happens to be showing.
  await page
    .locator(`.version-tab[data-version-id="${stateBefore.active.id}"]`)
    .click();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(stateBefore.active.id);
  // The page has no download control any more — a reviewer who wants the file
  // asks the Agent for it in the conversation. The service still serves the
  // bytes, and the version named on screen still has to be the version those
  // bytes belong to, which is the part worth asserting.
  const served = await fetchLoadedModel(page);
  const { createHash } = await import("node:crypto");
  expect(createHash("sha256").update(served).digest("hex")).toBe(
    stateBefore.active.sha256,
  );
  expect(await loadedModelDisposition(page)).toContain(
    stateBefore.active.version,
  );
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(1);
});

test("iteration: superseded unsubmitted model is still served to the current view", async ({
  page,
}) => {
  await ready(page);
  const current = (await request("GET", "state")).data.active;
  await page.route("**/api/state**", (route) => route.abort());
  publish("bunny-figurine.glb", "v2");
  // Publishing does not retract what a reviewer is still looking at. The page
  // stopped offering the file, but the Agent can be asked for it, and the
  // service must still have the superseded bytes to give.
  const served = await fetchLoadedModel(page);
  const { createHash } = await import("node:crypto");
  expect(createHash("sha256").update(served).digest("hex")).toBe(
    current.sha256,
  );
});
test("iteration: the version beside the name is the one the service is running", async ({
  page,
}) => {
  await ready(page);
  const running = (await request("GET", "health")).data.version;
  expect(running).not.toBe("unknown");
  // Asking what you are looking at is a question about the service, not about
  // the build this tab happened to be cut from.
  await expect(page.locator("#app-version")).toHaveText(running);
  // It sits with the name rather than in a framed slot of its own.
  await expect(page.locator(".brand-title #app-version")).toBeVisible();
  expect(await page.locator(".prototype").count()).toBe(0);
});
test("iteration: no heading row above the model, and saving is still said", async ({
  page,
}) => {
  await ready(page);
  // A name that arrived with the link, a version the tab strip already carries
  // and a word about saving held a whole row across the top of the page. The
  // height is the model's now.
  expect(await page.locator(".model-heading").count()).toBe(0);
  const panel = await page.locator(".review-panel").boundingBox();
  const shell = await page.locator(".viewer-shell").boundingBox();
  expect(shell.y - panel.y).toBeLessThan(16);
  // Taking the row away is not the same as going quiet. The state is still
  // written down where a screen reader reaches it, and a save that fails still
  // says so out loud in a toast.
  await expect(page.locator("#save-status")).toHaveText("No marks yet");
  const said = await page.locator(".review-panel > .sr-only").boundingBox();
  expect(said.height).toBeLessThanOrEqual(1);
});
test("iteration: the orientation cube sits in the corner it is read from", async ({
  page,
}) => {
  await ready(page);
  const shell = await page.locator(".viewer-shell").boundingBox();
  const cube = await page.locator(".orient-stage").boundingBox();
  // It was parked a row below the top, clearing a pill that never appears on
  // that side — which reads as a widget that drifted out of its corner.
  expect(cube.y - shell.y).toBeLessThan(16);
  expect(shell.x + shell.width - (cube.x + cube.width)).toBeLessThan(16);
});
test("iteration: the view switches live in the toolbar and say how they are set", async ({
  page,
}) => {
  await ready(page);
  const marks = page.locator(".toolbar #toggle-marks");
  const plain = page.locator(".toolbar #neutral-view");
  // They used to float over the model in a corner of their own, which is the
  // one place on the page that is meant to be the model.
  await expect(marks).toBeVisible();
  await expect(plain).toBeVisible();
  const iconOf = (b) => b.locator("use").getAttribute("href");
  expect(await iconOf(marks)).toBe("#mc-eye");
  await expect(marks).toHaveAttribute("aria-label", "Hide marks");
  // Named on the face like every other button in the row. The caption is what
  // the switch is about; the icon is which way it is set.
  await expect(marks.locator("span")).toHaveText("Marks");
  await expect(plain.locator("span")).toHaveText("Plain");
  await marks.click();
  expect(await iconOf(marks)).toBe("#mc-eye-off");
  // Redrawing the icon must not take the caption with it.
  await expect(marks.locator("span")).toHaveText("Marks");
  await expect(marks).toHaveAttribute("aria-pressed", "true");
  await expect(marks).toHaveAttribute("aria-label", "Show marks");
  await plain.click();
  await expect(plain).toHaveAttribute("aria-pressed", "true");
  await expect(plain).toHaveAttribute("aria-label", "Original colours");
  // Picking a tool brings the marks back, so the switch has to admit it.
  await page.locator('[data-mode="label"]').click();
  expect(await iconOf(marks)).toBe("#mc-eye");
  await expect(marks).toHaveAttribute("aria-pressed", "false");
});
test("iteration: the options panel is gone whenever the tool has no options", async ({
  page,
}) => {
  await ready(page);
  const panel = page.locator("#tool-options");
  const palette = page.locator(".palette");
  // The page opens on the orbit tool, so the colours must already be gone —
  // not merely gone once some other tool has been visited first.
  await expect(palette).toBeHidden();
  await expect(panel).toBeHidden();
  await page.locator('[data-mode="label"]').click();
  await expect(palette).toBeVisible();
  await expect(panel).toBeVisible();
  await page.locator('[data-mode="orbit"]').click();
  await expect(palette).toBeHidden();
  // An empty frame still reads as a window that failed to close.
  await expect(panel).toBeHidden();
});
test("iteration: changing tool cancels a bucket action awaiting edit ownership", async ({
  page,
}) => {
  await ready(page);
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  let entered = false;
  await page.route("**/api/review/begin", async (route) => {
    entered = true;
    await blocked;
    await route.continue();
  });
  await page.locator('[data-mode="fill"]').click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => entered).toBe(true);
  // Any other tool will do; what is being cancelled is the fill still waiting
  // for the draft to be claimed.
  await page.locator('[data-mode="label"]').click();
  release();
  await expect
    .poll(async () => (await request("GET", "state")).data.locked)
    .toBe(true);
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(0);
});

test("iteration: colored texture survives annotation, hide and neutral display round trips", async ({
  page,
}) => {
  await ready(page);
  const texture = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ef3030";
    context.fillRect(0, 0, 32, 32);
    context.fillStyle = "#2050ef";
    context.fillRect(0, 0, 16, 16);
    context.fillRect(16, 16, 16, 16);
    return canvas.toDataURL("image/png");
  });
  const original = fs.readFileSync(
    path.resolve("tmp/samples/parametric-bracket.glb"),
  );
  const jsonSize = original.readUInt32LE(12);
  const doc = JSON.parse(original.toString("utf8", 20, 20 + jsonSize));
  doc.images = [{ uri: texture }];
  doc.textures = [{ source: 0 }];
  doc.extensionsUsed = [
    ...new Set([...(doc.extensionsUsed || []), "KHR_materials_unlit"]),
  ];
  for (const material of doc.materials) {
    material.pbrMetallicRoughness.baseColorFactor = [1, 1, 1, 1];
    material.pbrMetallicRoughness.baseColorTexture = { index: 0 };
    material.extensions = { KHR_materials_unlit: {} };
  }
  const json = Buffer.from(JSON.stringify(doc));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
  json.copy(padded);
  const header = Buffer.from(original.subarray(0, 20));
  const tail = original.subarray(20 + jsonSize);
  header.writeUInt32LE(20 + padded.length + tail.length, 8);
  header.writeUInt32LE(padded.length, 12);
  const file = path.join(dir, "colored-texture.glb");
  fs.writeFileSync(file, Buffer.concat([header, padded, tail]));
  const model = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "scripts/reviewctl.mjs",
        "publish",
        file,
        "--name",
        "彩色貼圖驗證",
        "--version",
        "color-proof",
      ],
      { cwd: repo, env, encoding: "utf8" },
    ),
  ).model;
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().viewer.versionId),
    )
    .toBe(model.id);
  await expect(page.locator("#loading")).toBeHidden();
  const canvas = page.locator("#viewer canvas");
  const box = await canvas.boundingBox();
  // Compare model pixels, excluding the deliberately changing toolbar/list receipts.
  // The toolbar and its options moved from the left edge to a bottom-centred
  // cluster, so the band that has to stay out of the comparison is the bottom
  // of the canvas rather than its left side.
  const capture = () =>
    page.screenshot({
      clip: {
        x: box.x + box.width * 0.25,
        y: box.y + box.height * 0.15,
        width: box.width * 0.53,
        height: box.height * 0.52,
      },
    });
  const clean = await capture();
  const cleanCamera = await page.evaluate(
    () => window.__reviewDiagnostics().camera,
  );
  async function colors(bytes) {
    return page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let red = 0,
        blue = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > pixels[i + 2] * 1.5 && pixels[i] > 100) red++;
        if (pixels[i + 2] > pixels[i] * 1.5 && pixels[i + 2] > 100) blue++;
      }
      return { red, blue };
    }, bytes.toString("base64"));
  }
  const colored = await colors(clean);
  expect(colored.red).toBeGreaterThan(1000);
  expect(colored.blue).toBeGreaterThan(1000);
  await pin(page);
  await page.locator('[data-mode="fill"]').click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(2);
  const annotations = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  expect((await capture()).equals(clean)).toBe(false);
  await page.screenshot({
    path: path.resolve(
      "tmp/screenshots/2026-09-09-3d-review-v03-colored-annotations.png",
    ),
  });
  await page.locator("#toggle-marks").click();
  const hidden = await capture();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().camera),
  ).toEqual(cleanCamera);
  expect(hidden.equals(clean)).toBe(true);
  await page.locator("#neutral-view").click();
  const neutral = await colors(await capture());
  expect(neutral.red + neutral.blue).toBeLessThan(100);
  await page.locator("#neutral-view").click();
  expect((await capture()).equals(clean)).toBe(true);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(annotations);
});

test("LAN HTTP: real insecure origin can verify models, create IDs and save annotations", async ({
  page,
}) => {
  test.skip(!process.env.REVIEW_BROWSER_ORIGIN, "LAN origin run only");
  await ready(page);
  const capabilities = await page.evaluate(() => ({
    secure: isSecureContext,
    uuid: typeof crypto.randomUUID,
    digest: typeof crypto.subtle?.digest,
  }));
  expect(capabilities).toEqual({
    secure: false,
    uuid: "undefined",
    digest: "undefined",
  });
  await pin(page);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#annotation-count")).toHaveText("1");
});

test("switching versions reports its own cost, sweeps dead draft caches and keeps recovery backups", async ({
  page,
}) => {
  await ready(page);
  const first = await page.evaluate(
    () => window.__reviewDiagnostics().versionId,
  );
  const next = publish("bunny-figurine.glb", "v2");
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(next.model.id);
  // Every version keeps its own cached draft and every new review generation
  // starts another set, so the keys only accumulate — and running out of quota
  // is what puts the page into the mode that stops editing to protect an
  // unsynced draft. A cache the server already holds costs a reload to rebuild;
  // one with unsaved work, and any backup written because work was at risk,
  // has to survive however stale it looks.
  const seeded = await page.evaluate(
    (live) => {
      const spent = `3d-review-draft-oldversion-${live.reviewId}`;
      const unsynced = "3d-review-draft-oldversion-earlier-review";
      localStorage.setItem(spent, JSON.stringify({ dirty: false }));
      localStorage.setItem(unsynced, JSON.stringify({ dirty: true }));
      localStorage.setItem(`${live.draftCacheKey}-recovery-kept`, "{}");
      return { spent, unsynced, kept: `${live.draftCacheKey}-recovery-kept` };
    },
    await page.evaluate(() => window.__reviewDiagnostics()),
  );
  await page.locator(`.version-tab[data-version-id="${first}"]`).click();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(first);
  expect(
    await page.evaluate((k) => localStorage.getItem(k), seeded.spent),
  ).toBeNull();
  for (const key of [seeded.unsynced, seeded.kept])
    expect(
      await page.evaluate((k) => localStorage.getItem(k), key),
    ).not.toBeNull();
  // The mesh budget is still measured and still reported here; since 1.0.0 it
  // warns nobody, because marking reads the source topology and does not care
  // whether the review mesh got to subdivide.
  const precision = await page.evaluate(
    () => window.__reviewDiagnostics().precision,
  );
  expect(precision.rationed).toBe(false);
  expect(precision.wanted).toBeLessThanOrEqual(precision.budget);
  expect(await page.locator("#precision-banner").count()).toBe(0);
});

test("a cube face reframes from a named side without changing the framing", async ({
  page,
}) => {
  publish();
  await ready(page);
  const before = await page.evaluate(() => window.__reviewDiagnostics().camera);
  const spun = await page.locator("#orient-cube").getAttribute("style");
  await page.locator('.orient-face[data-view="1,0,0"]').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Math.abs(window.__reviewDiagnostics().camera.position[1]),
      ),
    )
    .toBeLessThan(0.01);
  const after = await page.evaluate(() => window.__reviewDiagnostics().camera);
  // Looking from +X: level with the target and square on to it.
  expect(after.position[0]).toBeGreaterThan(0);
  expect(Math.abs(after.position[2])).toBeLessThan(0.01);
  // The side changed; what is being looked at, and how closely, did not.
  expect(after.target).toEqual(before.target);
  const span = (c) => Math.hypot(...c.position.map((v, i) => v - c.target[i]));
  expect(Math.abs(span(after) - span(before))).toBeLessThan(0.01);
  // The compass followed rather than sat still. Polled, because the camera
  // moves on the click and the compass on the frame after it.
  await expect
    .poll(() => page.locator("#orient-cube").getAttribute("style"))
    .not.toBe(spun);
});

/* A look straight down or straight up used to lay the up vector along the
   floor, and OrbitControls reads that vector once, when it is built. The orbit
   went on turning about +Y while every frame was aimed by ±Z, so the right
   button turned the model some other way -- a sideways drag hardly turned it at
   all -- until a side face or home put the vector back. */
test("the right button turns the model the same way after a look straight down or up", async ({
  page,
}) => {
  publish();
  await ready(page);
  const view = () =>
    page.evaluate(() => {
      const d = window.__reviewDiagnostics();
      const [p, t] = [d.camera.position, d.camera.target];
      const span = Math.hypot(...p.map((v, i) => v - t[i]));
      return {
        up: d.cameraUp,
        screenUp: d.screenUp,
        height: (p[1] - t[1]) / span,
      };
    });
  const turnSideways = async () => {
    const p = await point(page);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(p.x + 150, p.y, { steps: 6 });
    await page.mouse.up({ button: "right" });
    await page.waitForTimeout(1200); // orbit damping settles
  };
  // The bottom face is on the far side of the cube from home: reach it by the
  // front-bottom edge, as a reviewer does.
  const sides = [
    { path: ["0,1,0"], height: 1, screenZ: -1 },
    { path: ["0,-1,1", "0,-1,0"], height: -1, screenZ: 1 },
  ];
  for (const side of sides) {
    await page.locator("#home-view").click();
    for (const face of side.path) {
      await page.locator(`[data-view="${face}"]`).click();
      await page.waitForTimeout(900);
    }
    await expect
      .poll(async () => (await view()).height * side.height)
      .toBeGreaterThan(0.9999);
    const before = await view();
    expect(before.up).toEqual([0, 1, 0]);
    // The same picture the floor-bound up vector gave: -Z at the top of the
    // screen from above, +Z from below.
    expect(before.screenUp[2] * side.screenZ).toBeGreaterThan(0.99);
    await turnSideways();
    const after = await view();
    expect(after.up).toEqual([0, 1, 0]);
    // Still looking straight down or up, and the picture turned with the drag
    // -- about the vertical, as it does from anywhere else.
    expect(after.height * side.height).toBeGreaterThan(0.999);
    const cos = before.screenUp.reduce(
      (n, v, i) => n + v * after.screenUp[i],
      0,
    );
    expect(Math.acos(Math.min(1, cos))).toBeGreaterThan(0.35);
  }
  await page.locator("#home-view").click();
  await expect
    .poll(async () => (await view()).screenUp[1])
    .toBeGreaterThan(0.8);
});

/* STEP and STL carry no up axis, and AI3D gives them +Z. The same plate,
   20 × 15 × 8 mm and modelled flat, used to stand on its long edge: the 15 mm
   side went up the screen and the 8 mm one into it. */
test("a STEP and an STL stand on +Z", async ({ page }) => {
  const stl = path.join(dir, "plate.stl");
  const [lo, hi] = [
    [-10, -7.5, -4],
    [10, 7.5, 4],
  ];
  const corner = (i) => [0, 1, 2].map((k) => ((i >> k) & 1 ? hi : lo)[k]);
  const quads = [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ];
  const facet = (a, b, c) =>
    `facet normal 0 0 0\nouter loop\n${[a, b, c]
      .map((i) => `vertex ${corner(i).join(" ")}`)
      .join("\n")}\nendloop\nendfacet`;
  fs.writeFileSync(
    stl,
    `solid plate\n${quads
      .flatMap(([a, b, c, d]) => [facet(a, b, c), facet(a, c, d)])
      .join("\n")}\nendsolid plate\n`,
  );
  // Fitted into three units by the long side: 20 → 3, so 8 → 1.2 and 15 → 2.25.
  const standing = [3, 1.2, 2.25];
  for (const [file, version] of [
    ["tests/fixtures/plate.step", "step"],
    [stl, "stl"],
  ]) {
    execFileSync(
      process.execPath,
      ["scripts/reviewctl.mjs", "publish", file, "--version", version],
      { cwd: repo, env, encoding: "utf8" },
    );
    await ready(page);
    const extent = await page.evaluate(
      () => window.__reviewDiagnostics().viewer.extent,
    );
    extent.forEach((v, i) => expect(v).toBeCloseTo(standing[i], 2));
  }
});

/* Six named sides are the views you can describe; the three-quarter views are
   the ones a modeller actually works from, and until the edges and corners were
   clickable there was no way to reach one except by dragging until it looked
   about right. */
test("an edge and a corner are three-quarter views you can click", async ({
  page,
}) => {
  publish();
  await ready(page);
  await expect(page.locator(".orient-region")).toHaveCount(26);
  await expect(page.locator(".orient-face")).toHaveCount(6);

  const direction = async () => {
    const c = await page.evaluate(() => window.__reviewDiagnostics().camera);
    const d = c.position.map((v, i) => v - c.target[i]);
    const n = Math.hypot(...d);
    return d.map((v) => v / n);
  };
  for (const view of ["1,0,1", "1,1,1"]) {
    // Playwright refuses a click the page would not deliver, so this is also
    // the assertion that nothing is sitting on top of the region.
    await page.locator(`.orient-region[data-view="${view}"]`).click();
    const want = view.split(",").map(Number);
    const n = Math.hypot(...want);
    await expect
      .poll(async () => {
        const got = await direction();
        return Math.max(...got.map((v, i) => Math.abs(v - want[i] / n)));
      })
      .toBeLessThan(0.01);
  }
});

/* Reaching a region is not the same as its centre being clickable, and the
   difference is where this went wrong: drawn as clipped triangles, the corners
   kept their outline and lost most of their hit area, leaving two dozen
   viewpoints from which a visible corner could not be clicked anywhere at all.
   So measure the target a reviewer actually has, not one convenient point. */
test("every region a reviewer can see is a target they can hit", async ({
  page,
}) => {
  publish();
  await ready(page);
  const worst = await page.evaluate(() => {
    const cube = document.getElementById("orient-cube");
    const was = cube.style.transform;
    const dirs = [...cube.children].map((e) =>
      e.dataset.view.split(",").map(Number),
    );
    const unit = (d) => {
      const n = Math.hypot(...d);
      return d.map((v) => v / n);
    };
    let found = null;
    for (const cam of dirs) {
      const u = unit(cam);
      const [yaw, pitch] = [
        (Math.atan2(u[0], u[2]) * 180) / Math.PI,
        (Math.asin(u[1]) * 180) / Math.PI,
      ];
      cube.style.transform = `rotateX(${-pitch}deg) rotateY(${-yaw}deg)`;
      for (const el of cube.children) {
        const v = unit(el.dataset.view.split(",").map(Number));
        const facing = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
        if (facing < 0.25) continue; // edge on, or round the back
        const b = el.getBoundingClientRect();
        let px = 0;
        for (let x = Math.floor(b.x); x <= Math.ceil(b.right); x += 2)
          for (let y = Math.floor(b.y); y <= Math.ceil(b.bottom); y += 2)
            if (document.elementFromPoint(x, y) === el) px++;
        if (!found || px < found.px)
          found = {
            px,
            region: el.dataset.view,
            kind: el.dataset.kind,
            from: cam.join(","),
          };
      }
    }
    cube.style.transform = was;
    return found;
  });
  // Four sampled pixels is a target roughly 6px across: small, but aimable.
  expect(worst, `smallest target: ${JSON.stringify(worst)}`).toBeTruthy();
  expect(worst.px, `smallest target: ${JSON.stringify(worst)}`).toBeGreaterThan(
    4,
  );
});

/* The cube projects well outside the box it occupies, and the reset button sits
   directly beneath it. Given only its flat size it leans over that button at
   some angles and swallows the click — with nothing on screen to explain why
   the button stopped working. */
test("the reset-view button stays clickable at every angle", async ({
  page,
}) => {
  publish();
  await ready(page);
  const covered = await page.evaluate(() => {
    const cube = document.getElementById("orient-cube");
    const home = document.getElementById("home-view");
    const was = cube.style.transform;
    const b = home.getBoundingClientRect();
    const probes = [
      [b.x + b.width / 2, b.y + b.height / 2],
      [b.x + 3, b.y + 3],
      [b.x + b.width - 3, b.y + 3],
    ];
    const hits = [];
    for (let yaw = 0; yaw < 360; yaw += 10)
      for (let pitch = -90; pitch <= 90; pitch += 10) {
        cube.style.transform = `rotateX(${-pitch}deg) rotateY(${-yaw}deg)`;
        for (const [x, y] of probes)
          if (!document.elementFromPoint(x, y)?.closest("#home-view"))
            hits.push(`${yaw}/${pitch}`);
      }
    cube.style.transform = was;
    return hits.slice(0, 5);
  });
  expect(covered).toEqual([]);
  await page.locator("#home-view").click();
});

test("many versions stay on one row, and the one being marked stays reachable", async ({
  page,
}) => {
  await ready(page);
  // Kelven's XR housing session reached seventeen published versions in an
  // afternoon and the strip had been wrapping onto a second row since about the
  // tenth, taking that row out of the model's height for the rest of the day.
  // Versions are identified by the hash of their bytes, so republishing one
  // sample seventeen times is one version. Each variant rewrites the generator
  // string in the GLB header — same length, same geometry, different file.
  const sample = fs.readFileSync("tmp/samples/parametric-bracket.glb");
  const generator = Buffer.from("THREE.GLTFExporter");
  const at = sample.indexOf(generator);
  expect(at).toBeGreaterThan(0);
  for (let i = 2; i <= 17; i++) {
    const bytes = Buffer.from(sample);
    Buffer.from(`AI3DStripTest${String(i).padStart(2, "0")}`).copy(bytes, at);
    const file = path.join(dir, `strip-${i}.glb`);
    fs.writeFileSync(file, bytes);
    execFileSync(
      process.execPath,
      [
        "scripts/reviewctl.mjs",
        "publish",
        file,
        "--name",
        "參數支架",
        "--version",
        `v0.${i} · 15mm鳍片爆炸`,
      ],
      { cwd: repo, env, encoding: "utf8" },
    );
  }
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().versions.length),
    )
    .toBe(17);
  const strip = page.locator("#version-tabs");
  /* The strip is drawn a tick after the state that describes it, so waiting on
     the state alone measured an empty bar and called it one row. Wait for the
     tabs themselves; the row count is only meaningful once they are there. */
  await expect(strip.locator(".version-tab")).toHaveCount(17);
  const rows = await strip.evaluate((bar) => {
    const tops = new Set(
      [...bar.querySelectorAll(".version-tab")].map((t) =>
        Math.round(t.getBoundingClientRect().top),
      ),
    );
    return tops.size;
  });
  expect(rows).toBe(1);
  // One row is only worth having if it still shows where you are. The version
  // being marked is the last one published, so it starts off the right edge.
  await expect
    .poll(() =>
      strip.evaluate((bar) => {
        const tab = bar.querySelector(".version-tab.selected");
        const rail = bar.getBoundingClientRect(),
          seat = tab.getBoundingClientRect();
        return seat.left >= rail.left - 1 && seat.right <= rail.right + 1;
      }),
    )
    .toBe(true);
  await expect(strip).toHaveClass(/overflow-start/);
  // A plain wheel walks back along the strip; a mouse has no sideways one.
  await strip.hover();
  const startedAt = await strip.evaluate((bar) => bar.scrollLeft);
  expect(startedAt).toBeGreaterThan(0);
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, -600);
    if ((await strip.evaluate((bar) => bar.scrollLeft)) === 0) break;
  }
  await expect.poll(() => strip.evaluate((bar) => bar.scrollLeft)).toBe(0);
  await expect(strip).toHaveClass(/overflow-end/);
  await expect(strip).not.toHaveClass(/overflow-start/);
  // Switching versions must not be what a stuck scroll position looks like.
  const first = await strip.evaluate(
    (bar) => bar.querySelector(".version-tab").dataset.versionId,
  );
  await page.locator(`.version-tab[data-version-id="${first}"]`).click();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(first);
  await expect
    .poll(() =>
      strip.evaluate((bar) => {
        const tab = bar.querySelector(".version-tab.selected");
        const rail = bar.getBoundingClientRect(),
          seat = tab.getBoundingClientRect();
        return seat.left >= rail.left - 1 && seat.right <= rail.right + 1;
      }),
    )
    .toBe(true);
});

/* Twenty versions is a wall of history in front of the model, and the reviewer
   asks the Agent for a shorter strip in the same conversation. Before this the
   only lever was editing state.json from outside the running server, which
   raced its saves — so it appeared to need the page closed first. Nothing here
   is closed, reloaded, or lost. */
test("the Agent can shorten the version strip while the page stays open", async ({
  page,
}) => {
  await ready(page);
  const sample = fs.readFileSync("tmp/samples/parametric-bracket.glb");
  const generator = Buffer.from("THREE.GLTFExporter");
  const at = sample.indexOf(generator);
  for (let i = 2; i <= 6; i++) {
    const bytes = Buffer.from(sample);
    Buffer.from(`AI3DKeepTest${String(i).padStart(3, "0")}`).copy(bytes, at);
    const file = path.join(dir, `keep-${i}.glb`);
    fs.writeFileSync(file, bytes);
    execFileSync(
      process.execPath,
      ["scripts/reviewctl.mjs", "publish", file, "--version", `v0.${i}`],
      { cwd: repo, env, encoding: "utf8" },
    );
  }
  const shown = () =>
    page.evaluate(() =>
      window.__reviewDiagnostics().versions.map((v) => v.version),
    );
  await expect.poll(shown).toHaveLength(6);

  const viewing = await page.evaluate(() => {
    const d = window.__reviewDiagnostics();
    return d.versions.find((v) => v.id === d.versionId).version;
  });
  execFileSync(process.execPath, ["scripts/reviewctl.mjs", "retain", "3"], {
    cwd: repo,
    env,
    encoding: "utf8",
  });
  // The page polls; it is not told, not reloaded, and never closed.
  await expect.poll(async () => (await shown()).length).toBeLessThan(6);
  const kept = await shown();
  expect(kept).toEqual(expect.arrayContaining(["v0.4", "v0.5", "v0.6"]));
  expect(kept).not.toContain("v0.2");
  /* The version under the reviewer's eyes survives the rule — hiding what
     someone is looking at would be taking something away rather than tidying
     up behind them, so "the latest three" is four while they are still here. */
  expect(kept).toContain(viewing);

  // A rule, not a tidy-up: the next version keeps the promise by itself.
  const bytes = Buffer.from(sample);
  Buffer.from("AI3DKeepTest777").copy(bytes, at);
  const file = path.join(dir, "keep-7.glb");
  fs.writeFileSync(file, bytes);
  execFileSync(
    process.execPath,
    ["scripts/reviewctl.mjs", "publish", file, "--version", "v0.7"],
    { cwd: repo, env, encoding: "utf8" },
  );
  await expect
    .poll(shown)
    .toEqual(expect.arrayContaining(["v0.5", "v0.6", "v0.7"]));
  expect(await shown()).not.toContain("v0.4");

  // Hidden is not gone: asking for all of them back returns every one.
  execFileSync(process.execPath, ["scripts/reviewctl.mjs", "retain", "0"], {
    cwd: repo,
    env,
    encoding: "utf8",
  });
  await expect.poll(shown).toHaveLength(7);
});

test("the Agent's understanding leaves on its own and comes back when asked", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  await page.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText(
    "delivered to the original conversation",
  );
  const receipt = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  ).submissions[0];
  execFileSync(
    process.execPath,
    ["scripts/reviewctl.mjs", "read", receipt.id],
    { cwd: repo, env, stdio: "pipe" },
  );
  const file = path.join(dir, "echo.json");
  // No annotations on purpose: an Agent that replies with words and no region is
  // what every echo in the real session looked like.
  fs.writeFileSync(
    file,
    JSON.stringify({
      submissionId: receipt.id,
      versionId: receipt.versionId,
      summary: "理解：把支架孔加大",
      // Required by the contract, allowed to be empty — and empty is what the
      // Agent sent every single time in the session this came from.
      annotations: [],
    }),
  );
  try {
    execFileSync(process.execPath, ["scripts/reviewctl.mjs", "echo", file], {
      cwd: repo,
      env,
      stdio: "pipe",
    });
  } catch (e) {
    throw new Error(
      `echo failed: ${e.stderr?.toString()} ${e.stdout?.toString()}`,
    );
  }
  // It says itself once without being asked for.
  const bubble = page.locator("#echo-panel");
  await expect(bubble).toBeVisible();
  await expect(page.locator("#echo-recall")).toBeVisible();
  /* The bubble and the pill naming the file both want the bottom-right corner,
     and the bubble is on top. While it only ever landed on the axis label that
     was decoration covering decoration; the pill moved down here, so the one
     round where the Agent says what it understood is the round that would hide
     what the reviewer is looking at. */
  expect(
    await page.evaluate(() => {
      const pill = document
        .querySelector("#model-info")
        .getBoundingClientRect();
      const dock = document.querySelector("#echo-dock").getBoundingClientRect();
      return (
        pill.right <= dock.left ||
        pill.left >= dock.right ||
        pill.bottom <= dock.top ||
        pill.top >= dock.bottom
      );
    }),
  ).toBe(true);
  // Then it goes, instead of waiting to be dismissed by hand every round.
  await expect(bubble).toBeHidden({ timeout: 12000 });
  // What is left is a way to ask again — and asking is deliberate, so this time
  // it stays until it is put away.
  await page.locator("#echo-recall").click();
  await expect(bubble).toBeVisible();
  await expect(page.locator("#echo-recall")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.waitForTimeout(9000);
  await expect(bubble).toBeVisible();
  await page.locator("#echo-recall").click();
  await expect(bubble).toBeHidden();
  await expect(page.locator("#echo-recall")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  // Reading it never costs the model any room: the review keeps its marks and
  // its camera either way.
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(1);
});

test("the reviewer can overrule the automatic language and theme", async ({
  page,
}) => {
  await ready(page);
  // Dark was decided by a media query, which script cannot overrule — so the
  // case that could not be expressed is this one: the system says dark and the
  // reviewer wants light anyway.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe("dark");
  const darkCanvas = await page.evaluate(
    () => window.__reviewDiagnostics().viewer.background,
  );
  await page.locator("#theme-choice").selectOption("light");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe("light");
  // The page repaints itself from CSS variables; the model is painted by us and
  // will not, so a switch that leaves the canvas dark is a switch that failed.
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().viewer.background),
    )
    .not.toBe(darkCanvas);
  // The system moving on does not undo a decision that was made deliberately.
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe("light");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    await page.evaluate(() => document.documentElement.dataset.theme),
  ).toBe("light");

  // Language: the control existed in full — catalogues, matching, storage — and
  // nothing in the product ever called setLocale. Six languages, no way in.
  await expect(page.locator("#locale-choice")).toHaveValue("en");
  await page.locator("#locale-choice").selectOption("ja");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#locale-choice")).toHaveValue("ja");
  await expect(
    page.getByRole("button", { name: "エージェントへ送る" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("ja");
  // A language is named in its own language; finding 日本語 must not require
  // already reading the language you are trying to leave.
  expect(
    await page.locator("#locale-choice option[value='zh-Hans']").textContent(),
  ).toBe("简体中文");
});

test("a mark points at the surface it is about, and says so when it lands", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Label tool", exact: true }).click();
  const spot = await point(page);
  await page.mouse.click(spot.x, spot.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  // Placing a mark used to happen in silence, which reads as a double click
  // that missed rather than one that was taken.
  await expect(page.locator(".model-pin.landing")).toHaveCount(1);
  // The old shape hinted at a direction with one squared-off corner while being
  // anchored by its bottom edge instead, so the point it referred to could not
  // be read off the screen. The tip is the anchor now — assert it against the
  // pixel that was actually struck, not against the label's own box.
  // The label is positioned by the render loop, not by the element existing, so
  // its first frame sits at the layer's origin.
  const measure = () =>
    page.evaluate(
      ([x, y]) => {
        const pin = document.querySelector(".model-pin");
        const box = pin.getBoundingClientRect();
        const tail = getComputedStyle(pin, "::after");
        return {
          dx: Math.abs(box.left + box.width / 2 - x),
          below: box.bottom <= y,
          tipGap: Math.abs(y - box.bottom),
          hasTail: tail.content !== "none",
        };
      },
      [spot.x, spot.y],
    );
  await expect.poll(async () => (await measure()).dx).toBeLessThan(3);
  const gap = await measure();
  expect(gap.hasTail).toBe(true);
  // Horizontally the tail sits on the point; vertically the body clears it so
  // the label never covers what it is labelling.
  expect(gap.dx).toBeLessThan(3);
  expect(gap.below).toBe(true);
  expect(gap.tipGap).toBeLessThan(12);
  // Redrawing is not placing: a refresh must not make every existing mark
  // re-enact its own arrival.
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator(".model-pin")).toHaveCount(1);
  await expect(page.locator(".model-pin.landing")).toHaveCount(0);
});

test("a mark arrives at its point instead of flying in from the corner", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Label tool", exact: true }).click();
  // Stretch the arrival so it can be measured while it is still running. Every
  // existing assertion polls until the animation has settled, so none of them
  // could see where a mark travelled on its way in — and travelling is the
  // whole defect: individual transform properties compose translate → rotate →
  // scale → transform, so a scale written next to a position in `transform`
  // multiplies the position too, about the label layer's own origin.
  await page.addStyleTag({
    content:
      ".model-pin.landing{animation-duration:20s !important}.pin-ripple{animation-duration:20s !important}",
  });
  const spot = await point(page);
  await page.mouse.click(spot.x, spot.y);
  await expect(page.locator(".model-pin.landing")).toHaveCount(1);
  // Long enough for the render loop to place the label, and 0.6% into an
  // arrival that now lasts twenty seconds.
  await page.waitForTimeout(120);
  const travel = await page.evaluate(
    ([x, y]) => {
      const box = document.querySelector(".model-pin").getBoundingClientRect();
      const ripple = document
        .querySelector(".pin-ripple")
        ?.getBoundingClientRect();
      return {
        pin: Math.abs(box.left + box.width / 2 - x),
        ripple: ripple
          ? Math.hypot(
              ripple.left + ripple.width / 2 - x,
              ripple.top + ripple.height / 2 - y,
            )
          : null,
      };
    },
    [spot.x, spot.y],
  );
  expect(travel.pin).toBeLessThan(6);
  // Not merely "near the point": a number at all. The ripple lived in the layer
  // that is rebuilt whenever the marks change, so placing a mark removed the
  // ripple acknowledging it in the same synchronous block — it had never been
  // on screen for a single frame.
  expect(travel.ripple).toBeLessThan(6);
});

test("the wheel zooms and Shift+wheel pans, whatever is turning it", async ({
  page,
}) => {
  await ready(page);
  const p = await point(page);
  await page.mouse.move(p.x, p.y);

  /* Nothing is chosen or detected first, and that is the point. The page used
     to guess mouse-or-trackpad from the size of the deltas, which macOS makes
     unanswerable — it accelerates a mouse wheel into the same small fractional
     stream a trackpad sends — so every Mac was read as a trackpad and had its
     wheel turned into a pan. The gestures no longer depend on the answer. */
  const start = await page.evaluate(() => window.__reviewDiagnostics().camera);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(200);
  const zoomed = await page.evaluate(() => window.__reviewDiagnostics().camera);
  expect(zoomed.target).toEqual(start.target);
  expect(zoomed.position).not.toEqual(start.position);

  // Pan is Shift plus that same gesture — two fingers or a wheel, either way.
  const before = await page.evaluate(() => window.__reviewDiagnostics().camera);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(40, 60);
  await page.waitForTimeout(200);
  const panned = await page.evaluate(() => window.__reviewDiagnostics().camera);
  await page.keyboard.up("Shift");
  // Panning moves what the camera is looking at; zooming never does.
  expect(panned.target).not.toEqual(before.target);
  const travelled = Math.hypot(
    panned.target[0] - before.target[0],
    panned.target[1] - before.target[1],
    panned.target[2] - before.target[2],
  );
  expect(travelled).toBeGreaterThan(0.001);
  // Nothing about this places marks or disturbs the review.
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(0);
});
