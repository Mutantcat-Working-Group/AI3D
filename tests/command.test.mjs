import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execCommand } from "../server/command.mjs";

test("CLI shims preserve JSON and shell metacharacters as one argument", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai3d-command-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const command = path.join(dir, "fixture");
  fs.writeFileSync(
    command,
    "#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\n",
    { mode: 0o700 },
  );
  const args = [
    JSON.stringify({ message: 'a & b | c ^ d < e > f %PATH% !x! "quote"' }),
    "",
    "two words",
  ];
  const { stdout } = await execCommand(command, args);
  assert.deepEqual(JSON.parse(stdout), args);
});

test("command failures retain typed output without putting arguments in errors", async () => {
  await assert.rejects(
    execCommand(process.execPath, [
      "-e",
      'console.log(JSON.stringify({error:{code:"REFUSED"}}));process.exit(3)',
      "private-text",
    ]),
    (error) =>
      error.code === 3 &&
      JSON.parse(error.stdout).error.code === "REFUSED" &&
      !error.message.includes("private-text"),
  );
});
