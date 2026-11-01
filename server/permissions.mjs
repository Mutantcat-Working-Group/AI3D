import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { log, errorDetail } from "./log.mjs";

/* The mode a caller asks for is only a request. POSIX honours it; Windows has
   no such field and hands the directory whatever its parent had, which on a
   development clone is "every local account may read and modify". Two files
   carry credentials: the chat configuration holds provider API keys, and the
   browser admission file holds the verifiers that mint a review session. Both
   were readable by every account on the machine while the code said 0600.

   Translating the intent needs the Windows access-control list, so that is what
   this does, once per directory rather than once per write. `atomicJson` renames
   a fresh temporary file into place on every review change, so protecting each
   write would spawn a process per save to guard a file that is immediately
   replaced by another one inheriting the same directory anyway. */

// An access-control entry reaching the files created later as well as the
// directory itself: (OI) object inherit, (CI) container inherit.
const INHERIT = "(OI)(CI)";

function restrictWindows(dir) {
  const domain = process.env.USERDOMAIN;
  const user = process.env.USERNAME;
  // Without both there is no account to name, and naming the wrong one would
  // lock the real owner out of a directory the service still has to write to.
  if (!domain || !user) return;
  // SYSTEM is the Windows counterpart of root: without it the operating system
  // itself can no longer service the directory.
  const grants = [`${domain}\\${user}:${INHERIT}F`, `SYSTEM:${INHERIT}F`];
  execFileSync(
    "icacls.exe",
    [dir, "/inheritance:r", ...grants.flatMap((grant) => ["/grant:r", grant])],
    { stdio: "ignore", windowsHide: true },
  );
}

// Best effort by design. A directory left world-readable is the outcome the
// ignored mode already produced, so refusing to start a review over it would
// trade a real regression for a cosmetic one.
export function hardenDirectory(dir, mode = 0o700) {
  try {
    if (process.platform === "win32") restrictWindows(dir);
    else fs.chmodSync(dir, mode);
  } catch (error) {
    log.warn("permissions", "could not restrict a directory", {
      dir,
      ...errorDetail(error),
    });
  }
}
