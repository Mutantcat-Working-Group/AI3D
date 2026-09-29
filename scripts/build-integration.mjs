import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { DOC_FILES } from "../integration/manager.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(
  repo,
  process.argv[2] || "tmp/integration-build/package",
);
if (
  !path.relative(path.join(repo, "tmp"), out).startsWith("..") &&
  out !== path.join(repo, "tmp")
) {
  if (fs.existsSync(out))
    throw new Error(
      "Build output already exists; use a new candidate directory.",
    );
} else
  throw new Error(
    "Candidate build must use a new directory under project tmp/.",
  );
fs.mkdirSync(out, { recursive: true });
const banner = {
  js: 'import { createRequire as __ai3dRequire } from "node:module"; const require = __ai3dRequire(import.meta.url);',
};
// The shipped web bundle must advertise the plugin version it travels with,
// not the project's, which is what the bundled server reads from the copied
// manifest below.
const pluginManifest = JSON.parse(
  fs.readFileSync(path.join(repo, "adapters/openclaw/package.json"), "utf8"),
);
await build({
  entryPoints: [path.join(repo, "server/index.mjs")],
  outfile: path.join(out, "runtime/server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner,
});
/* Its own entry, and it has to land beside the bundled server: the process is
   started from `new URL("./step-child.mjs", import.meta.url)`, and inside the
   bundle that URL is `runtime/`. Bundled rather than copied because the child
   imports the converter, which in a package has no node_modules to find. */
await build({
  entryPoints: [path.join(repo, "server/step-child.mjs")],
  outfile: path.join(out, "runtime/step-child.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner,
});
await build({
  entryPoints: [path.join(repo, "scripts/reviewctl.mjs")],
  outfile: path.join(out, "scripts/reviewctl.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner,
});
await build({
  entryPoints: [path.join(repo, "adapters/openclaw/index.mjs")],
  outfile: path.join(out, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["openclaw/*"],
  banner,
  // What `inspect` reports: the build in memory, not whatever was installed
  // over it since the host loaded this one.
  define: {
    __AI3D_BUILD_VERSION__: JSON.stringify(pluginManifest.version),
  },
});
execFileSync(
  process.execPath,
  [
    path.join(repo, "node_modules/vite/bin/vite.js"),
    "build",
    "--outDir",
    path.join(out, "web"),
  ],
  {
    cwd: repo,
    stdio: "pipe",
    env: { ...process.env, AI3D_VERSION: pluginManifest.version },
  },
);
/* The tessellator travels as two files rather than inside a bundle, and that is
   the whole point of the arrangement. It is LGPL; this package is Apache-2.0.
   Redistributing it is allowed, but what the licence asks us not to take away
   is the reader's ability to replace it — and a copy inlined into an 800 KB
   bundle is exactly the copy nobody can swap. Two files beside the server, with
   both licence texts, stay replaceable: drop in a different build of the same
   library and this package goes on working.

   A clone or an npm install never reaches this copy; there it resolves out of
   node_modules like any other dependency. Only the plugin needs it, because the
   plugin has no node_modules at all. */
const occtDist = path.join(repo, "node_modules/occt-import-js/dist");
fs.mkdirSync(path.join(out, "vendor"), { recursive: true });
for (const [name, as] of [
  ["occt-import-js.js", "occt-import-js.js"],
  ["occt-import-js.wasm", "occt-import-js.wasm"],
  ["license.occt.txt", "LICENSE.occt.txt"],
])
  fs.copyFileSync(path.join(occtDist, name), path.join(out, "vendor", as));
fs.copyFileSync(
  path.join(repo, "node_modules/occt-import-js/LICENSE.md"),
  path.join(out, "vendor", "LICENSE.occt-import-js.md"),
);
/* The library is CommonJS, and nothing in the file says so — `.js` means
   whatever the nearest package.json says it means. This package declares
   "type": "module", so without this the identical bytes that export a factory
   function out of node_modules get loaded as ESM here and hand back a namespace
   object instead. Same file, same hash, different meaning, and the failure
   lands at the first conversion rather than at the build. */
fs.writeFileSync(
  path.join(out, "vendor", "package.json"),
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
);
for (const name of ["package.json", "openclaw.plugin.json"]) {
  const source = path.join(repo, "adapters/openclaw", name);
  // Two declarations of the same version can drift, and the bundled server
  // reads one of them at runtime. Refuse to ship a package that disagrees.
  const declared = JSON.parse(fs.readFileSync(source, "utf8")).version;
  if (declared !== pluginManifest.version)
    throw new Error(
      `${name} declares version ${declared} but the package declares ${pluginManifest.version}.`,
    );
  fs.copyFileSync(source, path.join(out, name));
}
// The project's own two declarations are the other half of the same drift.
// They do not travel in this package, but the tag written into the install
// instructions comes from the first and `npm ci` reads the second, so a release
// where they disagree installs one version and tells the reader another.
for (const name of ["package.json", "package-lock.json"]) {
  const declared = JSON.parse(
    fs.readFileSync(path.join(repo, name), "utf8"),
  ).version;
  if (declared !== pluginManifest.version)
    throw new Error(
      `${name} declares version ${declared} but the package declares ${pluginManifest.version}.`,
    );
}
// `inspect` hands an agent an absolute path to each of these. npm puts README
// in a tarball on its own and the files whitelist names the rest, so the other
// packaging route carried them without anyone arranging it; this one copies
// exactly what it is told, and for two releases it was told about one file.
// Told what, now, is not a second list to keep in step: it is the same constant
// `inspect` reports from, so a file dropped from one is dropped from both.
for (const relative of Object.values(DOC_FILES))
  if (!relative.startsWith("skills/"))
    fs.copyFileSync(path.join(repo, relative), path.join(out, relative));
// Workshop is the only authoring source. A vetted export can be supplied for
// packaging; do not synthesize or patch SKILL.md in this build process.
// skills/ai3d-review in the repository is such an export, committed so that
// a clone can rebuild the package it ships. AI3D_SKILL_EXPORT still wins,
// which is how a Workshop revision reaches a package before it is committed.
const skillExport =
  process.env.AI3D_SKILL_EXPORT ||
  (fs.existsSync(path.join(repo, "skills/ai3d-review/SKILL.md"))
    ? path.join(repo, "skills/ai3d-review")
    : null);
if (skillExport) {
  const source = fs.realpathSync(skillExport);
  if (!fs.existsSync(path.join(source, "SKILL.md")))
    throw new Error("Workshop export has no SKILL.md");
  const skillRoot = path.join(out, "skills/ai3d-review");
  fs.cpSync(source, skillRoot, { recursive: true, dereference: false });
  // release.mjs refuses to launch a package containing a symlink. Fail here
  // rather than ship something that installs cleanly and then cannot start.
  const checkPlain = (root, relative = "") => {
    for (const name of fs.readdirSync(path.join(root, relative))) {
      const rel = path.join(relative, name);
      const stat = fs.lstatSync(path.join(root, rel));
      if (stat.isSymbolicLink())
        throw new Error(
          `Workshop export contains a symlink (${rel}); the runtime refuses to launch such a package.`,
        );
      if (stat.isDirectory()) checkPlain(root, rel);
      else if (!stat.isFile())
        throw new Error(`Workshop export entry is not a plain file (${rel}).`);
    }
  };
  checkPlain(skillRoot);
  const manifestFile = path.join(out, "openclaw.plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.skills = ["./skills/ai3d-review"];
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
}
// Copying is not shipping. `copyFileSync` only complains about a source that is
// missing, so every check above still passes for a file nobody asked it to
// copy -- which is exactly how the adapter package named four documents and
// carried two. Read the output back instead: this is the one statement that
// knows what was written rather than what was intended.
for (const [key, relative] of Object.entries(DOC_FILES)) {
  if (relative.startsWith("skills/") && !skillExport) continue;
  if (!fs.existsSync(path.join(out, relative)))
    throw new Error(
      `The package is missing ${relative}, which inspect reports as ${key}.`,
    );
}
/* The last step asks the host to bless the package, which needs a global
   `openclaw` on PATH. CI has no such thing, and it is not a dependency of this
   project -- adding one so a workflow can finish is a global npm install on a
   runner, which is the supply-chain surface this repository spent a night
   reducing. Everything before this point is what CI is actually here for:
   the packaging, the four-way version guard, and reading the documents back
   out of the output. Without a skip, the first push after going public would
   have been red for a reason that has nothing to do with the code, and the
   guards would have reported correctly into a wall of failure.

   Skipping is stated in the result, never inferred from a missing binary. A
   build that quietly decided the host step was optional would be the same
   mistake as a copy that never checked what it wrote. */
const hostBuild = process.env.AI3D_SKIP_HOST_BUILD !== "1";
if (hostBuild)
  execFileSync("openclaw", ["plugins", "build", "--root", out], {
    cwd: repo,
    stdio: "pipe",
  });
console.log(
  JSON.stringify({
    output: path.relative(repo, out),
    bundledSkill: !!skillExport,
    skillSource: process.env.AI3D_SKILL_EXPORT ? "export" : "repository",
    hostBuild,
  }),
);
