/* The interface now follows the reader rather than the author, and that is a
 * property only a browser can demonstrate: which catalogue a page picked, and
 * whether the words that arrived still fit the space drawn for them.
 *
 * The leakage check is the one that earns its place. Translating `src/` leaves
 * the service's own text untouched, and a page can be entirely German with one
 * Traditional Chinese sentence in the middle of it — which is exactly what the
 * first pass shipped, and exactly what nobody notices while reading English.
 */
import { test, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";

const repo = process.cwd(),
  url = "http://127.0.0.1:43174";
let child, dir, env;

test.beforeEach(async () => {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  dir = fs.mkdtempSync(path.join(repo, "tmp", "i18n-"));
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
      if ((await fetch(`${url}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  // An ASCII model name, so anything non-ASCII on the page came from the code.
  execFileSync(
    process.execPath,
    [
      "scripts/reviewctl.mjs",
      "publish",
      "tmp/samples/parametric-bracket.glb",
      "--name",
      "Bracket",
      "--version",
      "v1",
    ],
    { cwd: repo, env, encoding: "utf8" },
  );
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

/* The reader's own preferences, as a browser reports them, and the word the
   catalogue for that reader uses for the brush — one word is enough to tell
   catalogues apart, and it is one a reader would notice was wrong. */
const READERS = [
  { locale: "en-US", languages: ["en-US", "en"], lang: "en", bucket: "Bucket" },
  {
    locale: "zh-CN",
    languages: ["zh-CN", "zh"],
    lang: "zh-Hans",
    bucket: "油漆桶",
  },
  {
    locale: "zh-TW",
    languages: ["zh-TW", "zh"],
    lang: "zh-Hant",
    bucket: "油漆桶",
  },
  { locale: "zh-HK", languages: ["zh-HK"], lang: "zh-Hant", bucket: "油漆桶" },
  { locale: "de-DE", languages: ["de-DE", "de"], lang: "de", bucket: "Füllen" },
  {
    locale: "fr-FR",
    languages: ["fr-FR", "fr"],
    lang: "fr",
    bucket: "Remplir",
  },
  {
    locale: "ja-JP",
    languages: ["ja-JP", "ja"],
    lang: "ja",
    bucket: "塗りつぶし",
  },
  // Nobody has a catalogue for Icelandic, and the source language is the answer.
  { locale: "is-IS", languages: ["is-IS", "is"], lang: "en", bucket: "Bucket" },
  // A reader whose first choice we cannot serve but whose second we can.
  {
    locale: "pt-BR",
    languages: ["pt-BR", "ja-JP"],
    lang: "ja",
    bucket: "塗りつぶし",
  },
];

const CJK = /[぀-ヿ㐀-䶿一-鿿]/;

for (const reader of READERS) {
  test(`a ${reader.locale} reader is served ${reader.lang}`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ locale: reader.locale });
    const page = await ctx.newPage();
    await page.addInitScript((langs) => {
      Object.defineProperty(navigator, "languages", { get: () => langs });
    }, reader.languages);
    await page.goto(url);
    await expect(page.locator("#loading")).toBeHidden({ timeout: 20000 });

    // The document says which language it is in, so hyphenation, font choice
    // and a screen reader's pronunciation all follow the words on the page.
    await expect(page.locator("html")).toHaveAttribute("lang", reader.lang);
    await expect(page.locator('.toolbar [data-mode="fill"] span')).toHaveText(
      reader.bucket,
    );

    /* Nothing from another catalogue, and nothing the service wrote in its own
       language, is allowed onto a page that is not in that language. */
    /* The language chooser is the one place that must carry other languages:
       a reader who needs Japanese cannot be asked to find "Japanese" written in
       the language they are trying to leave. Its options are named in
       themselves, so they are read separately rather than scanned as strays. */
    const offered = await page
      .locator("#locale-choice option")
      .allTextContents();
    expect(offered).toEqual([
      "English",
      "简体中文",
      "繁體中文",
      "Deutsch",
      "Français",
      "日本語",
    ]);
    const text = (await page.locator("body").innerText()).replace(
      new RegExp(offered.join("|"), "g"),
      "",
    );
    if (!["zh-Hans", "zh-Hant", "ja"].includes(reader.lang)) {
      const stray = text
        .split("\n")
        .filter((line) => CJK.test(line))
        .slice(0, 3);
      expect(stray, `untranslated text on a ${reader.lang} page`).toEqual([]);
    }

    /* Words are longer in some languages than others — Radierer against 橡皮擦
       against Gomme — so the room drawn for them has to hold all of them. */
    const overflowing = await page.evaluate(() =>
      [...document.querySelectorAll(".toolbar .tool span, .orient-face")]
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => `${el.className || "label"}: ${el.textContent}`),
    );
    expect(overflowing, "text wider than the space drawn for it").toEqual([]);

    /* Each chooser says what it chooses with a mark instead of a word, so the
       name it is announced by has to be on the control itself — an icon a
       screen reader is told to ignore says nothing at all. */
    for (const id of ["#locale-choice", "#theme-choice"]) {
      const label = await page.locator(id).getAttribute("aria-label");
      expect(label, `${id} has no accessible name`).toBeTruthy();
      await expect(page.locator(`${id}`).locator("xpath=..")).toHaveClass(
        /setting/,
      );
    }
    await expect(page.locator(".setting:not([hidden]) > .icon")).toHaveCount(2);
    /* The settings area opens an About dialog that states the publisher in the
       reader's own language and the version currently running. */
    expect(
      await page.locator("#about-button").getAttribute("aria-label"),
    ).toBeTruthy();
    await page.locator("#about-button").click();
    await expect(page.locator("#about-dialog")).toBeVisible();
    await expect(page.locator("#about-dialog")).toContainText("mutantcat.org");
    await expect(page.locator("#about-version")).toHaveText(
      (await page.locator("#app-version").textContent()) ?? "",
    );
    await page.locator("#close-about").click();
    await expect(page.locator("#about-dialog")).not.toBeVisible();
    const fits = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(await fits(), "the header pushed a horizontal scrollbar").toBe(true);
    // Marks are the same width in every language, so the narrow window is now
    // only a question about the words left inside the choosers themselves.
    await page.setViewportSize({ width: 700, height: 720 });
    expect(await fits(), "the header does not fit a narrow window").toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });

    /* They are one kind of control, so they read as one: the pointing-device
       chooser was added later and only picked up the shared button class,
       which left it a size of its own between two matching neighbours. */
    const sizes = await page.evaluate(() =>
      ["#locale-choice", "#theme-choice"].map((id) => {
        const s = getComputedStyle(document.querySelector(id));
        return `${s.fontFamily}|${s.fontSize}|${Math.round(document.querySelector(id).getBoundingClientRect().height)}`;
      }),
    );
    expect(new Set(sizes).size, `mismatched choosers: ${sizes}`).toBe(1);
    const toolbar = await page.locator(".toolbar").boundingBox();
    const shell = await page.locator(".viewer-shell").boundingBox();
    expect(toolbar.width).toBeLessThan(shell.width);
    await ctx.close();
  });
}
