import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(repo, "tmp", "desktop-package");
// build-integration.mjs refuses an existing output directory on purpose, so
// the desktop build owns this one and clears it between runs.
fs.rmSync(out, { recursive: true, force: true });
const result = spawnSync(
  process.execPath,
  ["scripts/build-integration.mjs", path.relative(repo, out)],
  {
    cwd: repo,
    stdio: "inherit",
    env: { ...process.env, AI3D_SKIP_HOST_BUILD: "1" },
  },
);
process.exit(result.status ?? 1);
