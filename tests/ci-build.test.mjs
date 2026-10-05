import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* `build:integration` ends by asking the host to bless the package, which needs
   a global `openclaw` on PATH. CI has none, and giving it one means a global
   npm install on a runner — the supply-chain surface this repository spent a
   night reducing. So that last step can be skipped, and these pin the two
   things that make skipping safe: the skip is asked for rather than inferred,
   and it skips only the host step, not the guards CI is there for. */

const barePath = [path.dirname(process.execPath), "/usr/bin", "/bin"].join(":");
function build(out, env = {}) {
  return execFileSync(
    process.execPath,
    ["scripts/build-integration.mjs", out],
    {
      cwd: repo,
      env: { PATH: barePath, HOME: os.homedir(), ...env },
      encoding: "utf8",
    },
  );
}
const candidate = (t, name) => {
  const out = path.join("tmp", `${name}-${process.pid}-${Date.now()}`);
  t.after(() =>
    fs.rmSync(path.join(repo, out), { recursive: true, force: true }),
  );
  return out;
};

test("without the host build, the package still builds and says so", (t) => {
  const result = JSON.parse(
    build(candidate(t, "ci-skip"), { AI3D_SKIP_HOST_BUILD: "1" }),
  );
  assert.equal(result.hostBuild, false);
  assert.equal(result.bundledSkill, true);
});

test("a missing host command is still an error, not a quiet skip", (t) => {
  // The failure that would otherwise be indistinguishable from the skip: a
  // build deciding for itself that the step was optional.
  assert.throws(
    () => build(candidate(t, "ci-noskip")),
    /ENOENT|openclaw/,
    "an absent openclaw must fail rather than be assumed away",
  );
});

test("skipping the host build does not skip the version guard", (t) => {
  /* The guard exists because 0.13.1 shipped with one of its four manifests
     left behind, and nothing said so for a day. If the skip carried it away,
     CI would go green on exactly that. */
  const manifest = path.join(repo, "adapters/openclaw/package.json");
  const original = fs.readFileSync(manifest, "utf8");
  t.after(() => fs.writeFileSync(manifest, original));
  fs.writeFileSync(
    manifest,
    original.replace(/"version":\s*"[^"]+"/, '"version": "0.0.1-drift"'),
  );
  assert.throws(
    () => build(candidate(t, "ci-drift"), { AI3D_SKIP_HOST_BUILD: "1" }),
    /0\.0\.1-drift|version/,
  );
});

test("the workflow asks for the skip rather than relying on a bare runner", () => {
  const workflow = fs.readFileSync(
    path.join(repo, ".github/workflows/ci.yml"),
    "utf8",
  );
  assert.match(workflow, /AI3D_SKIP_HOST_BUILD:\s*"1"/);
});

/* The watchdog is the code that is supposed to act while nobody is watching,
   which makes it exactly the code whose tests nobody would notice going
   missing. The module is deliberately free of tauri types so CI can compile
   and run it with a bare `rustc --test`, and this pins that it does: a step
   deleted by accident would otherwise leave the rules unexercised until a
   release build happened to break. */
test("the workflow compiles and runs the desktop watchdog tests", () => {
  const workflow = fs.readFileSync(
    path.join(repo, ".github/workflows/ci.yml"),
    "utf8",
  );
  assert.match(
    workflow,
    /rustc --edition 2021 --test src-tauri\/src\/watchdog\.rs/,
  );
  assert.ok(
    fs.existsSync(path.join(repo, "src-tauri/src/watchdog.rs")),
    "the file the workflow compiles has to exist",
  );
});

/* The one class of failure the rest of the suite cannot see. Everything else
   runs from the source tree, where the tessellator resolves out of node_modules
   and works; the package resolves it from `vendor/`, and the first build of it
   loaded the identical bytes — same file, same hash — as ESM instead of
   CommonJS, because the nearest package.json to `vendor/` is the plugin's and
   it declares `"type": "module"`. Requiring it returned a namespace object
   where a factory function was expected, and nothing said so until a STEP was
   published from an installed plugin.

   So this runs the packaged converter, from the packaged layout, on a real
   file. */
test("the packaged converter runs from the package, not from node_modules", async (t) => {
  const out = candidate(t, "ci-step");
  build(out, { AI3D_SKIP_HOST_BUILD: "1" });
  const pkg = path.join(repo, out);
  assert.ok(
    fs.existsSync(path.join(pkg, "vendor/occt-import-js.wasm")),
    "the library travels with the package as its own file",
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(pkg, "vendor/package.json"), "utf8"))
      .type,
    "commonjs",
    "without this the plugin's own module type reaches the library and changes what it exports",
  );
  const source = fs.readFileSync(path.join(repo, "tests/fixtures/plate.step"));
  /* Driven the way the server drives it -- its own process, the model on stdin,
     the frame on descriptor 3 -- because the packaged copy is where the last two
     STEP bugs lived and neither was reachable from the source tree. */
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(pkg, "runtime/step-child.mjs"), "packaged"],
      { stdio: ["pipe", "ignore", "ignore", "pipe"] },
    );
    const chunks = [];
    child.stdio[3].on("data", (chunk) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const answer = Buffer.concat(chunks);
      if (answer.length < 4)
        return reject(new Error(`no frame from the packaged child (${code})`));
      resolve(JSON.parse(answer.subarray(4, 4 + answer.readUInt32LE(0))));
    });
    child.stdin.end(source);
  });
  assert.ok(result.ok, "the packaged converter converted nothing");
  assert.ok(result.triangles > 100);
  assert.ok(result.brepFaces > 0);
});
