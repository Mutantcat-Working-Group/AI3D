import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { scopedPath, fail } from "./context.mjs";

/* Relative paths are hashed as part of the release identity, so they have to be
   the same string on every platform. Some entries below are written by hand in
   POSIX form and some are built with `path.join`, which is backslash-separated
   on Windows; without this a cache written on Windows can never verify itself. */
const releaseKey = (relative) => relative.replaceAll("\\", "/");

function files(root, relative = "") {
  const found = [];
  for (const name of fs.readdirSync(path.join(root, relative))) {
    const rel = path.join(relative, name),
      st = fs.lstatSync(path.join(root, rel));
    if (st.isSymbolicLink())
      fail(
        "PACKAGE_INVALID",
        "The package contains a symlink; nothing was started.",
      );
    if (st.isDirectory()) found.push(...files(root, rel));
    else if (st.isFile()) found.push(rel);
    else fail("PACKAGE_INVALID", "A package entry is not a plain file.");
  }
  return found.sort();
}
/* A package without a part it cannot run without is a broken package, and is
   called one in the words the rest of this module uses. Unchecked, a build that
   lost `vendor/` -- the directory 1.3.0 added -- surfaced as whatever ENOENT
   `readdirSync` threw, naming a path the reader had no reason to recognise, at
   exactly the moment a clear message matters most. */
function present(installRoot, relative) {
  if (!fs.existsSync(path.join(installRoot, relative)))
    fail(
      "PACKAGE_INVALID",
      `The package has no ${relative}; nothing was started.`,
    );
  return relative;
}
export function cacheRelease(installRoot, runtime) {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(installRoot, present(installRoot, "openclaw.plugin.json")),
      "utf8",
    ),
  );
  if (manifest.id !== "ai3d")
    fail("PACKAGE_INVALID", "This package is not AI3D.");
  const skills = path.join(installRoot, "skills");
  const wanted = [
    "runtime/server.mjs",
    // The server starts a process per conversion and the tessellator lives
    // beside it; both are resolved relative to the running copy, which is this
    // one and not the install root. Left out, the instance starts clean and
    // then fails the first STEP publish with a module error from inside a
    // child -- so they are listed with the server rather than treated as
    // optional extras.
    "runtime/step-child.mjs",
    ...files(path.join(installRoot, present(installRoot, "vendor"))).map((p) =>
      path.join("vendor", p),
    ),
    "AGENT-INTERFACE.md",
    // The server derives its version from this rather than restating it, so a
    // release without it reports "unknown" from inside a numbered package.
    "package.json",
    ...files(path.join(installRoot, present(installRoot, "web"))).map((p) =>
      path.join("web", p),
    ),
    // A bundled skill ships in the package but the host loads it from the
    // install root, so no other check would notice it being edited in place.
    // Hash it with the rest; a package built without one contributes nothing.
    ...(fs.existsSync(skills)
      ? files(skills).map((p) => path.join("skills", p))
      : []),
  ];
  const hash = crypto.createHash("sha256"),
    content = [];
  for (const relative of wanted.sort()) {
    const target = scopedPath(installRoot, present(installRoot, relative));
    const data = fs.readFileSync(target);
    hash.update(releaseKey(relative)).update("\0").update(data);
    content.push({ relative, data });
  }
  const id = hash.digest("hex");
  const root = path.join(runtime, "releases", id);
  if (!fs.existsSync(root)) {
    fs.mkdirSync(path.dirname(root), { recursive: true, mode: 0o700 });
    const staging = fs.mkdtempSync(path.join(path.dirname(root), "candidate-"));
    for (const { relative, data } of content) {
      fs.mkdirSync(path.dirname(path.join(staging, relative)), {
        recursive: true,
        mode: 0o700,
      });
      fs.writeFileSync(path.join(staging, relative), data, { mode: 0o600 });
    }
    fs.renameSync(staging, root);
  } else {
    for (const { relative, data } of content) {
      const cached = scopedPath(
        runtime,
        path.relative(runtime, path.join(root, relative)),
      );
      if (!fs.readFileSync(cached).equals(data))
        fail(
          "CACHE_CHANGED",
          "The verified release cache was modified; nothing was started.",
        );
    }
  }
  return cachedRelease(runtime, id);
}
export function cachedRelease(runtime, id) {
  if (!/^[a-f0-9]{64}$/.test(id || ""))
    fail("PACKAGE_INVALID", "The release cache identity is wrong.");
  const root = scopedPath(runtime, `releases/${id}`, { directory: true });
  const digest = crypto.createHash("sha256");
  for (const relative of files(root))
    digest
      .update(releaseKey(relative))
      .update("\0")
      .update(fs.readFileSync(path.join(root, relative)));
  if (digest.digest("hex") !== id)
    fail(
      "CACHE_CHANGED",
      "The previous release cache failed verification; modified code was not started.",
    );
  return {
    id,
    root,
    serverEntry: path.join(root, "runtime/server.mjs"),
    distRoot: path.join(root, "web"),
  };
}
