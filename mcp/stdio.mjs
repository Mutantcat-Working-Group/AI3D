import { serve } from "./server.mjs";

// Bundled entry points have a different filename, so they cannot use the
// source module's direct-launch guard.
serve(process.stdin, process.stdout);
