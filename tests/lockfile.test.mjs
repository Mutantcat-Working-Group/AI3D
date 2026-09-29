import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

test("liveness follows the process, not the presence of a file", () => {
  assert.equal(processAlive(process.pid), true);
  // pid 1 exists and is owned by root: EPERM is a running process, not a stale one.
  assert.equal(processAlive(1), true);
  for (const pid of [0, -1, 1.5, null, undefined, "123"])
    assert.equal(processAlive(pid), false, `pid ${pid} must not look alive`);
});
