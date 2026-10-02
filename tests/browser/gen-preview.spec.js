import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";
import { once } from "node:events";
import { unzipSync } from "fflate";

const repo = process.cwd(),
  url = "http://127.0.0.1:43179";
let child;

test.beforeEach(async () => {
  child = spawn(
    process.execPath,
    [
      path.join("node_modules", "vite", "bin", "vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "43179",
      "--strictPort",
    ],
    { cwd: repo, stdio: ["ignore", "ignore", "pipe"] },
  );
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${url}/`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("vite did not start");
});

test.afterEach(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await Promise.race([
      once(child, "exit"),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  }
});

/* The generated-asset preview runs entirely in the page, so this spec drives
   it against the dev server without a review session. */
async function canvasLuminance(page) {
  const shot = await page.locator("#gen-preview-stage canvas").screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    const luminances = [];
    let min = 255,
      max = 0;
    for (let i = 0; i < px.length; i += 4) {
      const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      luminances.push(l);
      if (l < min) min = l;
      if (l > max) max = l;
    }
    luminances.sort((a, b) => a - b);
    return {
      total: luminances.length,
      variance: max - min,
      p99: luminances[Math.floor(luminances.length * 0.99)],
    };
  }, shot.toString("base64"));
}

test("generated assets get an animated preview with play/pause and turntable controls", async ({
  page,
}) => {
  await page.goto(url);
  await page.locator("#ai-button").click();
  await page.locator('[data-ai-tab="gen"]').click();
  await page.locator("#gen-prompt").fill("low-poly character");
  await page.locator("#gen-generate").click();

  await expect(page.locator("#gen-preview")).toBeVisible();
  await expect(page.locator("#gen-layout")).toBeVisible();
  await expect(
    page.locator(".gen-layout-tag", { hasText: "legs · foot" }),
  ).toBeVisible();
  await expect
    .poll(() => page.locator("#gen-preview-stage canvas").count(), {
      timeout: 10000,
    })
    .toBeGreaterThan(0);

  const clipOptions = await page
    .locator("#gen-preview-clip option")
    .allTextContents();
  expect(clipOptions).toEqual(
    expect.arrayContaining(["None (static)", "idle", "walk", "attack"]),
  );
  const stage = await page.locator("#gen-preview-stage canvas").boundingBox();
  expect(stage.width).toBeGreaterThan(100);
  expect(stage.height).toBeGreaterThan(100);

  const stats = await canvasLuminance(page);
  expect(stats.total).toBeGreaterThan(1000);
  expect(stats.p99).toBeGreaterThan(20);
  expect(stats.variance).toBeGreaterThan(5);

  const play = page.locator("#gen-preview-play");
  await expect(play).toHaveAttribute("aria-label", /play/i);
  await play.click();
  await expect(play).toHaveAttribute("aria-label", /pause/i);

  const spin = page.locator("#gen-preview-spin");
  expect(await spin.getAttribute("aria-pressed")).toBe("true");
  await spin.click();
  expect(await spin.getAttribute("aria-pressed")).toBe("false");
});

/* The collider overlay is the only place a bad physics proxy shows up before
   the pack is exported, so ticking the checkbox has to actually paint the
   proxy over the mesh and unticking has to take it back off. The auto-rotate
   is stopped first so the two frames are otherwise identical: the green count
   rises when the proxy is drawn and the frame hash falls back to the same
   value once it is gone. */
async function canvasSignature(page) {
  const shot = await page.locator("#gen-preview-stage canvas").screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let green = 0;
    let hash = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 1] > px[i] + 8 && px[i + 1] > px[i + 2] + 8) green++;
      hash = (hash * 31 + px[i] + px[i + 1] * 3 + px[i + 2] * 7) >>> 0;
    }
    return { green, hash };
  }, shot.toString("base64"));
}

const settle = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

test("the preview can overlay the physics proxy it would export", async ({
  page,
}) => {
  await page.goto(url);
  await page.locator("#ai-button").click();
  await page.locator('[data-ai-tab="gen"]').click();
  await page.locator("#gen-prompt").fill("low-poly crate");
  await page.locator("#gen-generate").click();
  await expect(page.locator("#gen-preview")).toBeVisible();
  await expect
    .poll(() => page.locator("#gen-preview-stage canvas").count(), {
      timeout: 10000,
    })
    .toBeGreaterThan(0);

  await page.locator("#gen-export").click();
  await expect(page.locator("#gen-export-panel")).toBeVisible();
  await page.locator("#gen-preview-spin").click();
  const overlay = page.locator("#gen-preview-collider");
  await expect(overlay).not.toBeChecked();
  const base = await canvasSignature(page);

  await overlay.check();
  await expect(overlay).toBeChecked();
  await settle(page);
  const withCollider = await canvasSignature(page);
  expect(withCollider.hash).not.toBe(base.hash);
  expect(withCollider.green).toBeGreaterThan(base.green);

  await page.locator("#gen-collision").selectOption("sphere");
  await settle(page);
  const sphere = await canvasSignature(page);
  expect(sphere.hash).not.toBe(base.hash);
  expect(sphere.hash).not.toBe(withCollider.hash);
  expect(sphere.green).toBeGreaterThan(base.green);

  await overlay.uncheck();
  await settle(page);
  expect((await canvasSignature(page)).hash).toBe(base.hash);

  await page.locator("#gen-collision").selectOption("none");
  await overlay.check();
  await expect(page.locator("#gen-status")).not.toHaveClass(/error/);
});

/* Quick templates were once able to render a chip whose translation key was
   missing, and clicking it then fell back to the default cube. The dragon
   chip is the easy witness: only the dragon preset ships a fly clip. */
test("quick template chips resolve their own asset instead of the default cube", async ({
  page,
}) => {
  await page.goto(url);
  await page.locator("#ai-button").click();
  await page.locator('[data-ai-tab="gen"]').click();

  const dragon = page.locator('#gen-types [data-type="dragon"]');
  await expect(dragon).toBeVisible();
  await expect(dragon).not.toContainText(/gen\.type\./);
  await dragon.click();

  await expect(page.locator("#gen-preview")).toBeVisible();
  await expect
    .poll(
      async () =>
        (await page.locator("#gen-preview-clip option").allTextContents()).join(
          ",",
        ),
      { timeout: 10000 },
    )
    .toContain("fly");

  for (const type of ["boat", "plane", "crystal", "tree_stump"]) {
    const chip = page.locator(`#gen-types [data-type="${type}"]`);
    await expect(chip).not.toContainText(/gen\.type\./);
    await chip.click();
    await expect(page.locator("#gen-preview")).toBeVisible();
  }
});

/* The description box is the whole interface for someone who has not clicked a
 * template chip, so what it understood has to be visible before the model is
 * built, and the style and colour it read have to reach the controls rather
 * than being discarded after the sentence is parsed. */
test("a description names the template, size, colour and style it will use", async ({
  page,
}) => {
  await page.goto(url);
  await page.locator("#ai-button").click();
  await page.locator('[data-ai-tab="gen"]').click();

  await page.locator("#gen-prompt").fill("a red low-poly sword 1.5 m");
  const hint = page.locator("#gen-prompt-hint");
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("Sword");
  await expect(hint).toContainText("1.5 m");
  await expect(hint).toContainText("red");

  await expect(page.locator("#gen-style")).toHaveValue("lowpoly");
  await expect(page.locator("#gen-color")).toHaveValue("#c0392b");

  await page.locator("#gen-generate").click();
  await expect(page.locator("#gen-preview")).toBeVisible();
  await expect(page.locator("#gen-status")).toHaveClass(/ok/);
});

test("the readiness audit lists every game check for the generated asset", async ({
  page,
}) => {
  await page.goto(url);
  await page.locator("#ai-button").click();
  await page.locator('[data-ai-tab="gen"]').click();
  await page.locator("#gen-prompt").fill("low-poly character");
  await page.locator("#gen-generate").click();
  await expect(page.locator("#gen-preview")).toBeVisible();

  await page.locator("#gen-audit").click();
  const panel = page.locator("#gen-audit-panel");
  await expect(panel).toBeVisible();
  await expect(page.locator("#gen-audit-summary strong")).toHaveText(/\d+%/);
  await expect(page.locator("#gen-audit-list .gen-audit-check")).toHaveCount(
    11,
  );
  await expect(
    page.locator("#gen-audit-list .gen-audit-check.pass"),
  ).toHaveCount(11);
  await expect(page.locator("#gen-audit-summary")).toContainText("11 Pass");
});

/* A size is a number and a unit, and the unit is what makes it a real scale:
 * 180 cm has to reach the generator as the same 1.8 m an engine imports. A
 * size written into the sentence moves both controls, and the hint echoes the
 * number in the unit it was written in rather than a converted one. */
test("the size control and the description agree on the unit", async ({
  page,
}) => {
  await page.goto(url);
  await page.locator("#ai-button").click();
  await page.locator('[data-ai-tab="gen"]').click();

  await page.locator("#gen-prompt").fill("a 180 cm tall character");
  const hint = page.locator("#gen-prompt-hint");
  await expect(hint).toContainText("180 cm");
  await expect(page.locator("#gen-units")).toHaveValue("cm");
  await expect(page.locator("#gen-size")).toHaveValue("180");

  await page.locator("#gen-prompt").fill("a low-poly crate");
  await page.locator("#gen-units").selectOption("ft");
  await page.locator("#gen-size").fill("6");
  await page.locator("#gen-size").blur();
  await expect(hint).toContainText("6 ft");

  await page.locator("#gen-generate").click();
  await expect(page.locator("#gen-preview")).toBeVisible();
  await expect(page.locator("#gen-status")).toHaveClass(/ok/);
});

/* The library only ever lived in browser storage, so the one file that leaves
   the browser is the only thing a teammate or a build machine can be handed.
   This drives the export control, wipes storage the way a cleared profile
   would, and reads the file back through the import control. */
test("a library survives export, a wiped browser and import", async ({
  page,
}) => {
  await page.goto(url);
  await page.locator("#ai-button").click();
  await page.locator('[data-ai-tab="gen"]').click();

  await page.locator("#gen-prompt").fill("low-poly crate");
  await page.locator("#gen-generate").click();
  await expect(page.locator("#gen-preview")).toBeVisible();
  await page.locator("#gen-save").click();
  await expect(page.locator("#gen-library .gen-asset-card")).toHaveCount(1);
  await expect(page.locator(".gen-asset-budget")).toContainText("Triangles");
  await expect(page.locator(".gen-asset-budget")).toContainText("Draw calls");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#gen-library-export").click(),
  ]);
  const chunks = [];
  for await (const chunk of await download.createReadStream())
    chunks.push(chunk);
  const backup = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(backup.kind).toBe("ai3d-asset-library");
  expect(backup.count).toBe(1);
  expect(backup.assets[0].threeObject).toBeUndefined();

  await page.evaluate(() => localStorage.removeItem("ai3d-asset-library"));
  await page.reload();
  await page.locator("#ai-button").click();
  await page.locator('[data-ai-tab="gen"]').click();
  await expect(page.locator("#gen-library .gen-asset-card")).toHaveCount(0);

  await page.locator("#gen-library-file").setInputFiles({
    name: "ai3d-library.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator("#gen-library .gen-asset-card")).toHaveCount(1);
  await expect(page.locator("#gen-status")).toContainText("1");
});

/* A saved scene is a recipe, not just a thumbnail. Loading one back has to
   restore the kit and its four layout numbers, or pressing compose again
   draws a different scene from the card that was just clicked. */
test("loading a saved scene restores the kit controls that built it", async ({
  page,
}) => {
  await page.goto(url);
  await page.locator("#ai-button").click();
  await page.locator('[data-ai-tab="gen"]').click();

  await page.locator('#gen-kits [data-kit="dungeon"]').click();
  await page.locator("#gen-kit-segments").fill("20");
  await page.locator("#gen-kit-spacing").fill("1.6");
  await page.locator("#gen-kit-ground").fill("1.2");
  await page.locator("#gen-kit-prop-scale").fill("1.5");
  await page.locator("#gen-compose").click();
  await expect(page.locator("#gen-preview")).toBeVisible();
  await page.locator("#gen-save").click();
  await expect(page.locator("#gen-library .gen-asset-card")).toHaveCount(1);

  // Move every control away from the recipe before loading it back.
  await page.locator('#gen-kits [data-kit="village"]').click();
  for (const [selector, value] of [
    ["#gen-kit-segments", "8"],
    ["#gen-kit-spacing", "0.5"],
    ["#gen-kit-ground", "0"],
    ["#gen-kit-prop-scale", "0.25"],
  ]) {
    await page.locator(selector).fill(value);
  }

  await page.locator("#gen-library .gen-asset-load").click();
  await expect(page.locator("#gen-kit-segments")).toHaveValue("20");
  await expect(page.locator("#gen-kit-spacing")).toHaveValue("1.6");
  await expect(page.locator("#gen-kit-ground")).toHaveValue("1.2");
  await expect(page.locator("#gen-kit-prop-scale")).toHaveValue("1.5");
  await expect(page.locator('#gen-kits [data-kit="dungeon"]')).toHaveClass(
    /active/,
  );
});

test("composed scene props can be edited, reloaded and deleted", async ({
  page,
}) => {
  await page.goto(url);
  await page.locator("#ai-button").click();
  await page.locator('[data-ai-tab="gen"]').click();
  await page.locator('#gen-kits [data-kit="camp"]').click();
  await page.locator("#gen-compose").click();

  const editor = page.locator("#gen-prop-editor");
  await expect(editor).toBeVisible();
  await expect(page.locator("#gen-prop-select option")).toHaveCount(9);
  await page.locator("#gen-prop-type").selectOption("tower");
  await page.locator("#gen-prop-size").fill("1.4");
  await page.locator("#gen-prop-size").blur();
  await page.locator("#gen-prop-x").fill("2.5");
  await page.locator("#gen-prop-x").blur();
  await page.locator("#gen-prop-rotation").fill("90");
  await page.locator("#gen-prop-rotation").blur();
  await expect(page.locator("#gen-prop-select option").first()).toContainText(
    "Tower",
  );

  await page.locator("#gen-save").click();
  await expect(page.locator("#gen-library .gen-asset-card")).toHaveCount(1);
  await page.locator("#gen-kit-spacing").fill("1.5");
  await page.locator("#gen-library .gen-asset-load").click();

  await expect(editor).toBeVisible();
  await expect(page.locator("#gen-prop-select option").first()).toContainText(
    "Tower",
  );
  await expect(page.locator("#gen-prop-size")).toHaveValue("1.4");
  await expect(page.locator("#gen-prop-x")).toHaveValue("2.5");
  await expect(page.locator("#gen-prop-rotation")).toHaveValue("90");

  await page.locator("#gen-prop-delete").click();
  await expect(page.locator("#gen-prop-select option")).toHaveCount(8);

  /* Duplicating clones the selected prop beside itself and selects the copy,
     so the new prop is immediately editable; height lifts it off the floor. */
  await page.locator("#gen-prop-select").selectOption("0");
  await page.locator("#gen-prop-duplicate").click();
  await expect(page.locator("#gen-prop-select option")).toHaveCount(9);
  await expect(page.locator("#gen-prop-select")).toHaveValue("8");
  await page.locator("#gen-prop-y").fill("1.5");
  await page.locator("#gen-prop-y").blur();
  await expect(page.locator("#gen-prop-y")).toHaveValue("1.5");
});

/* The design editor is the gameplay half of a scene: spawns, objectives, loot,
   locks and directives are authored here and then ride with the scene pack.
   The test proves the values round-trip through save/load, not just that the
   controls render. */
test("scene design metadata can be edited, audited and reloaded", async ({
  page,
}) => {
  await page.goto(url);
  await page.locator("#ai-button").click();
  await page.locator('[data-ai-tab="gen"]').click();
  await page.locator('#gen-kits [data-kit="camp"]').click();
  await page.locator("#gen-compose").click();

  const editor = page.locator("#gen-design-editor");
  await expect(editor).toBeVisible();
  await editor.evaluate((el) => (el.open = true));

  /* The camp kit ships one spawn group per role; bumping the count and the
     objective text is the common first edit a designer makes. */
  const spawns = editor.locator("#gen-design-spawns .gen-design-row");
  await expect(spawns).toHaveCount(2);
  await spawns.nth(0).locator('[data-design-field="count"]').fill("4");
  await spawns.nth(0).locator('[data-design-field="count"]').blur();

  const objectives = editor.locator("#gen-design-objectives .gen-design-row");
  await expect(objectives).toHaveCount(2);
  await objectives
    .nth(1)
    .locator('[data-design-field="title"]')
    .fill("Restock the camp");
  await objectives.nth(1).locator('[data-design-field="title"]').blur();

  const loot = editor.locator("#gen-design-loot .gen-design-row");
  await expect(loot).toHaveCount(2);
  await loot
    .nth(0)
    .locator('[data-design-field="items"]')
    .fill("bread, potion");
  await loot.nth(0).locator('[data-design-field="items"]').blur();

  /* Locks start empty; adding one exercises the create path and the enum
     select. The audit only passes when the locked prop and its trigger both
     resolve against the scene, so the editor has to write a wired lock. */
  await editor.locator('[data-design-add="locks"]').click();
  const locks = editor.locator("#gen-design-locks .gen-design-row");
  await expect(locks).toHaveCount(1);
  await locks.nth(0).locator('[data-design-field="prop"]').fill("flag");
  await locks.nth(0).locator('[data-design-field="prop"]').blur();
  await locks.nth(0).locator('[data-design-field="opensWith"]').fill("crate");
  await locks.nth(0).locator('[data-design-field="opensWith"]').blur();
  await locks
    .nth(0)
    .locator('[data-design-field="state"]')
    .selectOption("open");

  await page
    .locator("#gen-design-directives")
    .fill("Keep the campfire lit.\nGuard the flag.");
  await page.locator("#gen-design-directives").blur();

  const readiness = page.locator("#gen-design-readiness");
  await expect(readiness).toHaveClass(/is-pass/);

  await page.locator("#gen-save").click();
  await expect(page.locator("#gen-library .gen-asset-card")).toHaveCount(1);
  await page.locator("#gen-library .gen-asset-load").click();

  await expect(editor).toBeVisible();
  await editor.evaluate((el) => (el.open = true));
  await expect(
    editor
      .locator("#gen-design-spawns .gen-design-row")
      .nth(0)
      .locator('[data-design-field="count"]'),
  ).toHaveValue("4");
  await expect(
    editor
      .locator("#gen-design-objectives .gen-design-row")
      .nth(1)
      .locator('[data-design-field="title"]'),
  ).toHaveValue("Restock the camp");
  await expect(
    editor
      .locator("#gen-design-loot .gen-design-row")
      .nth(0)
      .locator('[data-design-field="items"]'),
  ).toHaveValue("bread, potion");
  await expect(
    editor
      .locator("#gen-design-locks .gen-design-row")
      .nth(0)
      .locator('[data-design-field="prop"]'),
  ).toHaveValue("flag");
  await expect(
    editor
      .locator("#gen-design-locks .gen-design-row")
      .nth(0)
      .locator('[data-design-field="state"]'),
  ).toHaveValue("open");
  await expect(page.locator("#gen-design-directives")).toHaveValue(
    "Keep the campfire lit.\nGuard the flag.",
  );
});

/* A variant batch is a real game-pipeline batch: one click turns the seed
   takes into a single engine pack with a per-variant LOD chain, and the zip
   is the proof rather than another preview screenshot. */
test("a variant batch exports as one engine pack with LOD files", async ({
  page,
}) => {
  await page.goto(url);
  await page.locator("#ai-button").click();
  await page.locator('[data-ai-tab="gen"]').click();

  await page.locator("#gen-prompt").fill("low-poly crate");
  await page.locator("#gen-variants-generate").click();
  await expect(page.locator("#gen-variants .gen-variant-card")).toHaveCount(4, {
    timeout: 20000,
  });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#gen-variants-pack").click(),
  ]);
  const chunks = [];
  for await (const chunk of await download.createReadStream())
    chunks.push(chunk);
  const files = unzipSync(Buffer.concat(chunks));
  const manifest = JSON.parse(
    Buffer.from(files["manifest.json"]).toString("utf8"),
  );

  expect(manifest.count).toBe(4);
  expect(manifest.assets[0].lodLevels.map((lod) => lod.level)).toEqual([
    0, 1, 2, 3,
  ]);
  expect(manifest.assets.every((asset) => asset.lodLevels.length === 4)).toBe(
    true,
  );
  const slug = manifest.assets[0].id;
  for (const level of [0, 1, 2, 3]) {
    const model = files[`models/${slug}/LOD${level}.glb`];
    expect(model).toBeDefined();
    expect(model.length).toBeGreaterThan(0);
  }
  await expect(page.locator("#gen-status")).toContainText(/packed/i);
});
