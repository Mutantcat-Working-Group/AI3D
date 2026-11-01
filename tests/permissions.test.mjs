import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { hardenDirectory } from "../server/permissions.mjs";

// The mode a caller passes is honoured on POSIX and ignored on Windows, where
// the directory keeps whatever access list its parent had. Both outcomes serve
// the same intent -- nobody but the owner and the system may read what is
// inside -- so each platform is checked the way it can actually be observed.
function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai3d-perm-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// `icacls` prints the path on the same line as the first entry, and a directory
// under a user profile is itself named `...\Users\...`, so the path has to come
// off before anything is matched against an entry. What is left is one
// `PRINCIPAL:(permissions)` per line.
function principals(target) {
  const acl = execFileSync("icacls.exe", [target], {
    encoding: "utf8",
  }).split(target);
  const text = acl.join("");
  return [...text.matchAll(/([^:\n]+):\(/g)].map((m) => m[1].trim());
}

// Every local account, which is what an inherited list from a development clone
// grants and what would make the credential files inside readable.
const EVERYONE = ["BUILTIN\\Users", "NT AUTHORITY\\Authenticated Users"];

test("a hardened directory keeps its owner and the system, and nobody else", (t) => {
  const dir = scratch(t);
  hardenDirectory(dir);
  if (process.platform === "win32") {
    const entries = principals(dir);
    for (const group of EVERYONE)
      assert.ok(
        !entries.includes(group),
        `${group} may still read this directory`,
      );
    assert.ok(
      entries.includes("NT AUTHORITY\\SYSTEM"),
      "the system itself lost access",
    );
  } else {
    assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  }
});

test("a file created inside a hardened directory inherits the restriction", (t) => {
  const dir = scratch(t);
  hardenDirectory(dir);
  const file = path.join(dir, "chat-config.json");
  fs.writeFileSync(file, '{"apiKey":"sk-not-a-real-key"}', { mode: 0o600 });
  if (process.platform === "win32") {
    for (const group of EVERYONE)
      assert.ok(
        !principals(file).includes(group),
        `the provider keys are readable by ${group}`,
      );
  } else {
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  }
});

test("hardening a directory that cannot be changed reports nothing and throws nothing", (t) => {
  const missing = path.join(os.tmpdir(), "ai3d-perm-absent-directory");
  fs.rmSync(missing, { recursive: true, force: true });
  assert.doesNotThrow(() => hardenDirectory(missing));
  // A review that cannot start because a permission could not be tightened
  // would be a worse outcome than the permission it asked for.
});
