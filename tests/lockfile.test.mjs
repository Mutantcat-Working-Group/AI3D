import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  claimLock,
  readLock,
  releaseLock,
  processAlive,
} from "../server/lockfile.mjs";

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai3d-lock-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "instance.lock");
}

test("a claim is exclusive and always publishes complete content", (t) => {
  const file = scratch(t);
  claimLock(file, { startedAt: 12345 });
  assert.deepEqual(readLock(file), { pid: process.pid, startedAt: 12345 });
  // The lock carries a pid and nothing secret, but it is still written 0600,
  // which Windows ignores outright — there the restriction belongs to the
  // directory and is checked in permissions.test.mjs.
  if (process.platform !== "win32")
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.throws(() => claimLock(file), { code: "EEXIST" });
  // The private staging copy must never be left behind next to the lock.
  assert.deepEqual(
    fs.readdirSync(path.dirname(file)).sort(),
    ["instance.lock"],
    "claim left temporary files behind",
  );
});

test("an incomplete or damaged lock reads as stale instead of throwing", (t) => {
  const file = scratch(t);
  for (const content of ["", "{", '{"pid":', '{"pid":null}', '{"pid":-1}']) {
    fs.writeFileSync(file, content);
    assert.equal(
      readLock(file),
      null,
      `expected ${JSON.stringify(content)} to read as stale`,
    );
    assert.equal(
      processAlive(readLock(file)?.pid),
      false,
      "a stale lock must never look alive",
    );
  }
  fs.unlinkSync(file);
  assert.equal(readLock(file), null);
});

test("release only clears a lock this process owns", (t) => {
  const file = scratch(t);
  claimLock(file);
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid + 1 }));
  assert.equal(releaseLock(file), false);
  assert.equal(fs.existsSync(file), true, "another owner's lock was removed");
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid }));
  assert.equal(releaseLock(file), true);
  assert.equal(fs.existsSync(file), false);
  assert.equal(
    releaseLock(file),
    false,
    "releasing a missing lock must not throw",
  );
});

test("liveness follows the process, not the presence of a file", async (t) => {
  assert.equal(processAlive(process.pid), true);
  /* A running process that is not this one must read as alive. POSIX names the
     cheapest such pid, 1, owned by root, which answers EPERM rather than ESRCH.
     Windows reports pid 1 as gone, so the same intent is checked against a real
     child there instead of against a pid that does not exist. */
  if (process.platform === "win32") {
    const child = spawn(
      process.execPath,
      ["-e", "setTimeout(() => {}, 60000)"],
      {
        stdio: "ignore",
      },
    );
    t.after(() => {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    });
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    assert.equal(processAlive(child.pid), true);
    child.kill();
  } else {
    assert.equal(processAlive(1), true);
  }
  for (const pid of [0, -1, 1.5, null, undefined, "123"])
    assert.equal(processAlive(pid), false, `pid ${pid} must not look alive`);
});
