import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { render, BEGIN, END } from "../scripts/sync-reviewer-help.mjs";
import { docPaths, DOC_FILES } from "../integration/manager.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(repo, file), "utf8");
const runCli = (command, args, options) =>
  process.platform === "win32"
    ? execFileSync([command, ...args].join(" "), { ...options, shell: true })
    : execFileSync(command, args, options);

test("the agent reads the same reviewer help the panel shows", async () => {
  const doc = read("AGENT-INTERFACE.md");
  const from = doc.indexOf(BEGIN);
  const to = doc.indexOf(END);
  assert.notEqual(
    from,
    -1,
    "AGENT-INTERFACE.md lost its reviewer-help markers",
  );
  assert.equal(
    doc.slice(from, to + END.length),
    await render(),
    "AGENT-INTERFACE.md is behind src/i18n/en.js — run node scripts/sync-reviewer-help.mjs",
  );
});

/* The install line names a tag, which is the whole point: a bare github: URL
 * installs the default branch as it stands that second. A named tag is also the
 * one kind of documentation that goes quietly wrong on release day, so the
 * version bump has to drag it along.
 *
 * Between releases the version carries a `-dev` suffix and the tag it names does
 * not exist yet, so the same line has to be held from the other side: whatever
 * the documentation points at, it must not be the version being worked towards.
 * A reader who follows a tag that was written ahead of its release gets nothing
 * at all. */
test("the documented install tag is this version", () => {
  const { version } = JSON.parse(read("package.json"));
  const [released, inProgress] = version.split("-");
  for (const file of ["README.md", "AGENT-INTERFACE.md"]) {
    const tags = [...read(file).matchAll(/ai3d#v([0-9]+\.[0-9]+\.[0-9]+)/gi)];
    assert.ok(tags.length, `${file} documents no pinned install tag`);
    for (const [, tag] of tags)
      if (inProgress)
        assert.notEqual(
          tag,
          released,
          `${file} points at v${tag}, which is still being worked on`,
        );
      else assert.equal(tag, version, `${file} still points at v${tag}`);
  }
});

/* README counts both suites, for anyone deciding whether this is tested. It
 * said 63 browser cases while the suite ran 68, and had done since the day a
 * file was added: a number stated once and never asked again. Adding the case
 * you are reading dated the other number in the same breath, which is the
 * argument for asking rather than remembering.
 *
 * The two are counted differently because they have to be. Playwright answers
 * for itself — `--list` reads the files and starts no browser — and it has to,
 * because one spec writes its cases in a loop. The node files declare one case
 * per `test(` at the top of a line and none in a loop, so they can be counted
 * where they stand; running them to count them would mean running this case
 * inside itself. Write a loop there and this goes red saying so, which is the
 * moment to count them some other way. */
function readmeCount(suite, pattern, actual) {
  const claimed = read("README.md").match(pattern)?.[1];
  assert.ok(claimed, `README states no ${suite} test count`);
  assert.ok(actual, `counted no ${suite} cases at all`);
  assert.equal(
    Number(claimed),
    actual,
    `README says ${claimed} ${suite} cases, there are ${actual}`,
  );
}
/* Spelt out rather than looped, because a loop is the one thing the node count
   above cannot see — and writing these two in a loop is how that was found. */
test("README counts the node cases the suite actually has", () => {
  const cases = fs
    .readdirSync(path.join(repo, "tests"))
    .filter((f) => f.endsWith(".test.mjs"))
    .reduce(
      (n, f) => n + (read(`tests/${f}`).match(/^[ \t]*test\(/gm)?.length || 0),
      0,
    );
  readmeCount("node", /npm test\s*#\s*(\d+) unit and integration tests/, cases);
});
test("README counts the browser cases the suite actually has", () => {
  const listed = runCli("npx", ["playwright", "test", "--list"], {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  readmeCount(
    "browser",
    /npm run test:browser\s*#\s*(\d+) real-Chromium tests/,
    Number(listed.match(/Total: (\d+) tests?/)?.[1]),
  );
});

/* An install root is the only place an agent can read from, and `inspect` is
 * the only thing that tells it where. A named path that does not open is worse
 * than a missing one: it looks exactly like an install that worked. */
test("inspect names only documents that are there", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai3d-docs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(docPaths(root), {}, "an empty root has nothing to offer");
  fs.writeFileSync(path.join(root, "README.md"), "# readme\n");
  assert.deepEqual(docPaths(root), { readme: path.join(root, "README.md") });
  // A clone is itself an install root: `npx github:…` runs the repository.
  assert.deepEqual(
    Object.keys(docPaths(repo)).sort(),
    Object.keys(DOC_FILES).sort(),
  );
});

/* Both packaging routes have to carry all four, and until now neither one was
 * checked. npm fills a tarball from the files whitelist plus a README it adds
 * on its own, which covered every document without anyone arranging it; the
 * adapter build copies a list written by hand, and for two releases that list
 * named one file. `inspect` reported all four either way. The adapter side of
 * this is asserted against a real installation in tests/package-smoke.mjs. */
test("the npm package carries every document inspect can report", () => {
  const report = runCli("npm", ["pack", "--dry-run", "--json"], {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  // `prepare` builds before npm reports, onto the same stream; the report is
  // the trailing array.
  const at = report.lastIndexOf("\n[\n");
  const packed = new Set(
    JSON.parse(at === -1 ? report : report.slice(at))[0].files.map(
      (entry) => entry.path,
    ),
  );
  for (const relative of Object.values(DOC_FILES))
    assert.ok(packed.has(relative), `npm pack leaves out ${relative}`);
});
