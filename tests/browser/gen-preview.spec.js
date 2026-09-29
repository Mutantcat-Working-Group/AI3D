import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";
import { once } from "node:events";

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
