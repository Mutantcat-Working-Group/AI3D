import fs from "node:fs";
import path from "node:path";
import {
  inspectModel,
  MAX_BYTES,
  MAX_TRIANGLES,
  MAX_TEXTURE_PIXELS,
} from "../server/models.mjs";
import { convertStepDetached, STEP_FORMATS } from "../server/step.mjs";
import { workspaceContext, scopedPath, fail } from "./context.mjs";
import { relativePosix } from "../server/paths.mjs";

// Publishing already rejects an oversized model, but only after the caller has
// picked a name, a version and a project, and it answers with a message rather
// than a number to decimate by. This sizes a model from the file alone, with no
// instance running and nothing written, before the caller commits to a round.
//
// It used to carry a second verdict for the band under the cap where the review
// mesh runs out of subdivision budget. That band belonged to the brush; with
// every tool marking whole source faces it costs a reviewer nothing, so the
// verdict said "simplify" about a model that needed no simplifying. Removed in
// 1.0.0 — the hard limits are the only limits left.
//
// The measurement itself is inspectModel, the same function the publish path
// uses. Nothing here counts triangles independently: a second counter that
// disagreed with the server would be worse than no precheck at all.
const ratio = (target, actual) =>
  Math.max(0.01, Math.floor((target / actual) * 100) / 100);

/* Sizing a STEP means tessellating it, and that cannot happen in the process
   that calls this one: the OpenClaw adapter calls it inside the Gateway, and
   the MCP server lives as long as its client. So the conversion is handed in,
   from `stepMeshFor` below.

   This stays synchronous, and every refusal in it stays a synchronous throw.
   Awaiting here instead would turn `PATH_SCOPE` and `MODEL_FORMAT` into
   rejected promises for every caller, including the ones measuring an STL. */
export function precheckModel(ctx, file, { derived } = {}) {
  const { workspace, allowed } = workspaceContext(ctx);
  const actual = scopedPath(allowed, file);
  const stat = fs.statSync(actual);
  if (!stat.isFile()) fail("MODEL_LIMIT", "The model path is not a file.");
  const format = path.extname(actual).slice(1).toLowerCase();
  const limits = {
    maxTriangles: MAX_TRIANGLES,
    maxBytes: MAX_BYTES,
    maxTexturePixels: MAX_TEXTURE_PIXELS,
  };
  const base = {
    ok: true,
    file: relativePosix(workspace, actual),
    format,
    bytes: stat.size,
    limits,
  };
  if (stat.size > MAX_BYTES)
    return {
      ...base,
      triangles: null,
      verdict: "reject",
      reason: `${(stat.size / 1048576).toFixed(1)} MB exceeds the ${MAX_BYTES / 1048576} MB limit; too large to count faces. Simplify or re-export, then run precheck again for a face count.`,
      simplify: { targetTriangles: MAX_TRIANGLES, requiredRatio: null },
    };
  let metadata;
  try {
    metadata = inspectModel(fs.readFileSync(actual), format, { derived });
  } catch (error) {
    // A malformed or unsupported file is not a sizing answer; let it surface as
    // itself. Only the two size limits become a verdict.
    if (error.code !== "MODEL_LIMIT" && error.code !== "TEXTURE_LIMIT")
      throw error;
    const over = error.measured?.triangles || null;
    return {
      ...base,
      triangles: over,
      verdict: "reject",
      reason: error.message,
      // The ratio comes from the measured count, so a caller decimates once and
      // publishes, instead of guessing and republishing until one happens to fit.
      simplify: over
        ? {
            targetTriangles: MAX_TRIANGLES,
            requiredRatio: ratio(MAX_TRIANGLES, over),
          }
        : error.code === "MODEL_LIMIT"
          ? { targetTriangles: MAX_TRIANGLES, requiredRatio: null }
          : null,
    };
  }
  const { triangles, texturePixels = 0 } = metadata;
  const result = { ...base, triangles, texturePixels };
  return {
    ...result,
    verdict: "ok",
    reason: `${triangles} triangles, ${(stat.size / 1048576).toFixed(2)} MB: within both limits. Publish as is.`,
    simplify: null,
  };
}

/* What every entry point awaits before measuring, and the reason none of them
   loads a CAD kernel any more.

   It decides nothing. A bad path, a directory, a file over the size limit, a
   format this does not handle -- all of them resolve to `undefined` here and
   are reported by `precheckModel`, synchronously, in the words it already uses.
   Duplicating the resolution costs a `statSync`; duplicating the verdicts would
   cost two places that can disagree about the same file. The one thing it must
   not do is tessellate something the size check is about to reject anyway. */
export async function stepMeshFor(ctx, file) {
  let source;
  try {
    const { allowed } = workspaceContext(ctx);
    const actual = scopedPath(allowed, file);
    const format = path.extname(actual).slice(1).toLowerCase();
    if (!STEP_FORMATS.includes(format)) return undefined;
    const stat = fs.statSync(actual);
    if (!stat.isFile() || stat.size > MAX_BYTES) return undefined;
    source = fs.readFileSync(actual);
  } catch {
    return undefined;
  }
  /* Outside the catch, deliberately. Everything above is a question about the
     file that `precheckModel` is about to answer better; a converter that
     cannot run is not one of those, and swallowing it here would report a
     broken installation as a puzzling refusal about the model. That is exactly
     what a wider catch did to the first package built from this change. */
  return convertStepDetached(source);
}
