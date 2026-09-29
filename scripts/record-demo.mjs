#!/usr/bin/env node
/* A workbench for pointing at surfaces cannot be explained in a paragraph. The
 * README described the loop in prose for as long as the repository was public
 * and never once showed it, which asks a stranger to imagine a three
 * dimensional interaction from a list of sentences.
 *
 * So the picture is recorded from the shipping application, by the same
 * machinery the browser suite uses: a real server, a real publish, real
 * Chromium driving the real interface. Nothing here is a mock-up or a drawing,
 * and that is the point — a promotional image of software that behaves
 * differently from the software is the same failure as a README that counts
 * its own tests wrong.
 *
 * It lives in scripts/ rather than tests/browser/ on purpose. The suite's case
 * count is asserted against the README, and a recording is not a test.
 *
 * Run: node scripts/record-demo.mjs   (needs ffmpeg for the GIF)
 */
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(repo, "docs/media");
const raw = path.join(repo, "tmp/demo-raw");
const port = 43176;
const url = `http://127.0.0.1:${port}`;
const size = { width: 1280, height: 800 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => console.log(`· ${m}`);

/* 1 · The interface that gets recorded is the one that would ship. A stale
      bundle in tmp/ would record a product nobody can install. */
say("building the bundle");
execFileSync(
  path.join(repo, "node_modules/.bin/vite"),
  ["build", "--outDir", "tmp/refinement-dist", "--logLevel", "warn"],
  { cwd: repo, stdio: "inherit" },
);

/* 2 · A server of its own, on its own port and its own data directory, so a
      recording never touches a review someone is in the middle of. The fake
      gateway stands in for the host that would carry the batch to an Agent:
      the browser half of the loop is real, the delivery is a double, and the
      caption says so. */
fs.rmSync(raw, { recursive: true, force: true });
fs.mkdirSync(raw, { recursive: true });
fs.mkdirSync(out, { recursive: true });
const dir = fs.mkdtempSync(path.join(repo, "tmp", "demo-"));
const bin = path.join(dir, "bin");
fs.mkdirSync(bin);
fs.copyFileSync(
  path.join(repo, "tests/fake-openclaw.mjs"),
  path.join(bin, "openclaw"),
);
fs.chmodSync(path.join(bin, "openclaw"), 0o755);
const env = {
  ...process.env,
  PORT: String(port),
  REVIEW_DATA_DIR: dir,
  REVIEW_MEDIA_DIR: path.join(dir, "models"),
  REVIEW_DIST_DIR: path.join(repo, "tmp/refinement-dist"),
  REVIEW_SESSION_KEY: "demo-recording-session",
  REVIEW_ALLOWED_HOSTS: "review.test",
  // Whether a newer release exists on the day of recording is not part of what
  // the demo is showing, and a badge that appears in some takes and not others
  // is the kind of difference a reader would try to interpret.
  REVIEW_UPDATE_CHECK: "off",
  REVIEW_FAKE_GATEWAY_LOG: path.join(dir, "fake-gateway.json"),
  PATH: `${bin}${path.delimiter}${process.env.PATH}`,
};
const log = fs.openSync(path.join(dir, "server.log"), "a");
const server = spawn(process.execPath, ["server/index.mjs"], {
  cwd: repo,
  env,
  stdio: ["ignore", log, log],
});
let up = false;
for (let i = 0; i < 100 && !up; i++) {
  try {
    up = (await fetch(`${url}/api/health`)).ok;
  } catch {
    /* starting */
  }
  if (!up) await sleep(100);
}
if (!up) throw new Error("the demo server did not come up");
say("server up");

const publish = (version) =>
  execFileSync(
    process.execPath,
    [
      "scripts/reviewctl.mjs",
      "publish",
      "tmp/samples/parametric-bracket.glb",
      "--name",
      "Parametric bracket",
      "--version",
      version,
    ],
    { cwd: repo, env, encoding: "utf8" },
  );

/* Two, so the workbench in the picture is showing a model with a history
   behind it rather than a first upload. */
publish("v0.1");
publish("v0.2");
say("two versions published");

/* 3 · Playwright's recorder captures the page, not the pointer, and a film of
      marks appearing next to an invisible cursor teaches nobody where to
      click. This draws the pointer the driver is actually moving — it follows
      real mouse events, it does not replay a scripted path. */
const cursor = `
  const dot = document.createElement("div");
  dot.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;" +
    "border-radius:50%;border:2px solid rgba(20,22,26,.85);background:rgba(255,255,255,.45);" +
    "box-shadow:0 1px 6px rgba(0,0,0,.35);pointer-events:none;z-index:2147483647;" +
    "transition:transform .08s ease-out;opacity:0";
  const ready = () => document.body && document.body.appendChild(dot);
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", ready) : ready();
  addEventListener("mousemove", (e) => {
    dot.style.opacity = "1";
    dot.style.left = e.clientX + "px";
    dot.style.top = e.clientY + "px";
  }, true);
  addEventListener("mousedown", () => { dot.style.transform = "scale(.55)"; }, true);
  addEventListener("mouseup", () => { dot.style.transform = "scale(1)"; }, true);
  window.__demoCursor = {
    hide: () => { dot.style.display = "none"; },
    show: () => { dot.style.display = ""; },
  };
`;

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: size,
  locale: "en-US",
  recordVideo: { dir: raw, size },
});
await context.addInitScript(cursor);
const page = await context.newPage();

/* The pointer is drawn for the film; a still does not need someone's hand in
   it. Hiding and restoring it costs two frames, which a reload would not. */
const shot = async (name) => {
  await page.evaluate(() => window.__demoCursor?.hide());
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await page.evaluate(() => window.__demoCursor?.show());
};
async function waitReady() {
  await page.waitForSelector("#loading", { state: "hidden", timeout: 30000 });
  await page
    .getByRole("button", { name: "Label tool", exact: true })
    .waitFor({ state: "visible" });
}
const viewer = async (fx, fy) => {
  const box = await page.locator("#viewer").boundingBox();
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
};

/* The recorder starts with the context, so the blank page and the load sit at
   the head of the file. Rather than guess them away afterwards, the run marks
   where the model actually appeared and the encoder cuts to it. */
say("recording");
const started = Date.now();
await page.goto(url);
await waitReady();
await sleep(900);
const head = (Date.now() - started) / 1000 - 0.4;

/* 4 · The beats, in the order the README tells them. Each pause is there so a
      ten-frame-a-second GIF still reads. */

// Turning it. The right button is the camera's and the left never is, which is
// why marking never has to put a tool down — worth showing before any mark.
const centre = await viewer(0.55, 0.45);
await page.mouse.move(centre.x, centre.y, { steps: 10 });
await sleep(180);
await page.mouse.down({ button: "right" });
await page.mouse.move(centre.x + 130, centre.y + 28, { steps: 34 });
await page.mouse.move(centre.x + 60, centre.y - 18, { steps: 18 });
await page.mouse.up({ button: "right" });
await sleep(450);

// Two lettered pins.
await page.getByRole("button", { name: "Label tool", exact: true }).click();
await sleep(330);
const a = await viewer(0.5, 0.42);
await page.mouse.move(a.x, a.y, { steps: 12 });
await sleep(200);
await page.mouse.click(a.x, a.y);
await sleep(650);
const b = await viewer(0.62, 0.56);
await page.mouse.move(b.x, b.y, { steps: 12 });
await sleep(180);
await page.mouse.click(b.x, b.y);
await sleep(700);

// The bucket, with its hover preview held long enough to be seen before the
// click that commits it.
await page
  .getByRole("button", { name: "Paint bucket tool", exact: true })
  .click();
await sleep(330);
const c = await viewer(0.44, 0.6);
await page.mouse.move(c.x, c.y, { steps: 16 });
await sleep(650);
await page.mouse.click(c.x, c.y);
await sleep(800);
await shot("marks");
/* The viewer on its own, for the social card: a link preview is read at the
   size of a thumbnail, and at that size a screenshot of the whole interface is
   a grey rectangle with something small happening in it. */
await page.evaluate(() => window.__demoCursor?.hide());
await page
  .locator("#viewer")
  .screenshot({ path: path.join(out, "viewer.png") });
await page.evaluate(() => window.__demoCursor?.show());

// Handing the batch over.
const send = page.getByRole("button", { name: /Send to Agent/ });
const box = await send.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
  steps: 18,
});
await sleep(280);
await send.click();
await sleep(1500);
await shot("sent");
const tail = (Date.now() - started) / 1000 - head + 0.3;

await context.close();

/* 5 · The social card — the picture GitHub, Telegram and the rest hand to
      someone who has not clicked yet. It is built here, in a context of its
      own so the film does not record it being built, and its only picture is
      the one the application just drew. GitHub wants 1280×640 and refuses
      anything over a megabyte. */
say("social card");
const viewerShot = fs
  .readFileSync(path.join(out, "viewer.png"))
  .toString("base64");
const card = await browser.newContext({
  viewport: { width: 1280, height: 640 },
  deviceScaleFactor: 1,
});
const cardPage = await card.newPage();
await cardPage.setContent(`<!doctype html><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1280px; height: 640px; display: flex; overflow: hidden;
    background: #eef2f4; color: #14161a;
    font: 400 16px/1.5 -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif; }
  .say { flex: 0 0 47%; padding: 74px 0 74px 76px; display: flex;
    flex-direction: column; justify-content: center; }
  .name { font-size: 62px; font-weight: 640; letter-spacing: -1.6px; }
  .line { margin-top: 22px; font-size: 27px; line-height: 1.34; font-weight: 500;
    letter-spacing: -.4px; color: #2b3138; }
  .foot { margin-top: 40px; font-size: 17px; color: #5d666e; letter-spacing: .1px; }
  .shot { flex: 1; position: relative; }
  .shot img { position: absolute; top: 50%; left: 14px; transform: translateY(-50%);
    width: 128%; border-radius: 14px 0 0 14px;
    box-shadow: 0 18px 48px rgba(20, 32, 45, .22); }
</style>
<div class="say">
  <div class="name">AI3D</div>
  <div class="line">Point at the model.<br>Let the Agent read what you meant.</div>
  <div class="foot">Browser 3D review for agent-assisted modelling · Apache-2.0</div>
</div>
<div class="shot"><img src="data:image/png;base64,${viewerShot}"></div>`);
await cardPage.waitForLoadState("networkidle");
await cardPage.screenshot({ path: path.join(out, "social-card.png") });
await card.close();
await browser.close();
server.kill("SIGTERM");
await Promise.race([once(server, "exit"), sleep(3000)]);
fs.rmSync(dir, { recursive: true, force: true });

/* 6 · One recording, three shapes: a GIF because it is the only moving image
      GitHub renders inline in a README, an MP4 because the GIF has to stay
      small enough to load, and the stills for anywhere a loop would be
      noise. */
const webm = fs
  .readdirSync(raw)
  .filter((f) => f.endsWith(".webm"))
  .map((f) => path.join(raw, f))[0];
if (!webm) throw new Error("no recording was written");
const ff = (args) =>
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { cwd: repo });
const cut = ["-ss", head.toFixed(2), "-t", tail.toFixed(2)];
const palette = path.join(raw, "palette.png");
/* Ten frames a second and ninety-six colours is where this clip stops being a
   download. A flat interface survives the palette; the model, which is the
   only part with a gradient on it, is what the dither is for. */
const filter = "fps=10,scale=800:-1:flags=lanczos";
ff([
  ...cut,
  "-i",
  webm,
  "-vf",
  `${filter},palettegen=stats_mode=diff:max_colors=96`,
  palette,
]);
ff([
  ...cut,
  "-i",
  webm,
  "-i",
  palette,
  "-lavfi",
  `${filter}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
  path.join(out, "demo.gif"),
]);
ff([
  ...cut,
  "-i",
  webm,
  "-movflags",
  "+faststart",
  "-pix_fmt",
  "yuv420p",
  "-crf",
  "30",
  "-vf",
  "scale=1280:-2",
  path.join(out, "demo.mp4"),
]);
say(`clip ${tail.toFixed(1)}s, cut from ${head.toFixed(1)}s`);

for (const f of [
  "demo.gif",
  "demo.mp4",
  "social-card.png",
  "marks.png",
  "sent.png",
]) {
  const p = path.join(out, f);
  say(`${f} — ${(fs.statSync(p).size / 1024 / 1024).toFixed(2)} MB`);
}
