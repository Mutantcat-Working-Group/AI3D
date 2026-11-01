import fs from "node:fs";

// Windows refuses to delete a directory while any process still holds a handle
// inside it, and it releases those handles a moment after the process is
// reported dead. Several suites start a detached service whose working
// directory is the fixture they are about to remove, so an `rmSync` in an
// after-hook reported EPERM for a test that had itself passed.
//
// Retrying the identical removal turns that lag into a pause and changes
// nothing else: EPERM and EBUSY are the only codes waited on, anything else
// propagates at once, and a directory that never frees still fails rather than
// hanging the run.
const RETRIES = 100;
const PAUSE_MS = 100;
const WAITABLE = new Set(["EPERM", "EBUSY", "ENOTEMPTY"]);

export async function removeTree(target) {
  for (let attempt = 1; ; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!WAITABLE.has(error?.code) || attempt >= RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
  }
}
