/* STEP arrives as exact surfaces; a viewer can only draw triangles. This turns
   one into the other, once, at import.

   The tessellation is the part worth being careful about. Marks anchor on
   `meshId` + face index (`server/index.mjs`), so the deflection that produced
   those indices is not a rendering preference — it is part of what a mark
   means. Recompute it later with a different value and every existing mark
   quietly moves to a different piece of the model. So the derived mesh is
   written beside the source, keyed by the source hash, and never recomputed;
   `importModel` reuses the file if it is already there. The parameters travel
   with it so a future reader can see what produced the indices rather than
   having to guess from the current defaults. */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

/* Two homes, because the library is LGPL and stays replaceable in both. From a
   clone or a global install it resolves out of node_modules like any other
   dependency. The plugin build has no node_modules at all -- everything else is
   bundled into one file -- so `build-integration.mjs` copies the two dist files
   beside the server instead. Bundling them would be the one arrangement that
   takes away the user's ability to swap the library, which is the thing LGPL
   asks us to leave alone.

   Searched rather than hardcoded: the bundler puts its entry points at more
   than one depth under the package root, and one copy of a 7.6 MB binary they
   can all find is worth a loop. */
function vendored() {
  return search(["vendor/occt-import-js.js"]);
}

/* Same problem, same answer, and it is worth being explicit about why a plain
   `new URL("./step-child.mjs", import.meta.url)` is not enough: this module is
   bundled into four entry points at three different depths. From
   `runtime/server.mjs` the child is a sibling; from the adapter at the package
   root it is one directory down; from a clone it is neither. Hardcoding one of
   those shipped a package whose Gateway entry point resolved the child to a
   path that did not exist -- and because the caller treated that as "no mesh"
   rather than as a failure, it surfaced as a confusing refusal instead. */
function childScript() {
  return search(["step-child.mjs", "runtime/step-child.mjs"]);
}

// Nearest wins: every candidate is tried at one level before going up, so a
// sibling is never passed over in favour of something further away.
function search(relative) {
  let dir = here;
  for (let up = 0; up < 3; up++) {
    for (const name of relative) {
      const found = path.join(dir, ...name.split("/"));
      if (fs.existsSync(found)) return found;
    }
    dir = path.dirname(dir);
  }
  return null;
}

let occtPromise = null;
function occt() {
  if (!occtPromise) occtPromise = require(vendored() ?? "occt-import-js")();
  return occtPromise;
}

export const STEP_FORMATS = ["step", "stp"];

/* OCCT's own default. Measured across 485 real parts: median 1,356 triangles,
   worst 73,132 -- an order of magnitude under the cap, so there is no reason to
   coarsen the default to defend a budget it never approaches. */
export const DEFLECTION = Object.freeze({
  linearUnit: "millimeter",
  linearDeflectionType: "bounding_box_ratio",
  linearDeflection: 0.001,
  angularDeflection: 0.5,
});

const GL = { FLOAT: 5126, UNSIGNED_INT: 5125, ARRAY: 34962, ELEMENT: 34963 };
const pad4 = (n) => (n + 3) & ~3;

/* A glTF writer, kept to exactly what a review mesh needs: triangles, normals,
   and a colour when the source declared one. Nothing here is a general-purpose
   exporter, and it should not become one -- the viewer is the only reader. */
function toGlb(meshes, generator) {
  const views = [],
    accessors = [],
    chunks = [];
  let offset = 0;
  const put = (typed, target, extra = {}) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    chunks.push(bytes, Buffer.alloc(pad4(bytes.length) - bytes.length));
    views.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: bytes.length,
      target,
    });
    offset += pad4(bytes.length);
    accessors.push({
      bufferView: views.length - 1,
      count: extra.count,
      ...extra.rest,
    });
    return accessors.length - 1;
  };

  const gltfMeshes = [],
    nodes = [],
    materials = [];
  for (const m of meshes) {
    const position = Float32Array.from(m.attributes.position.array);
    const index = Uint32Array.from(m.index.array);
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < position.length; i += 3)
      for (let k = 0; k < 3; k++) {
        if (position[i + k] < min[k]) min[k] = position[i + k];
        if (position[i + k] > max[k]) max[k] = position[i + k];
      }
    const attributes = {
      POSITION: put(position, GL.ARRAY, {
        count: position.length / 3,
        rest: { componentType: GL.FLOAT, type: "VEC3", min, max },
      }),
    };
    const normal = m.attributes.normal?.array;
    if (normal?.length === position.length)
      attributes.NORMAL = put(Float32Array.from(normal), GL.ARRAY, {
        count: normal.length / 3,
        rest: { componentType: GL.FLOAT, type: "VEC3" },
      });
    const indices = put(index, GL.ELEMENT, {
      count: index.length,
      rest: { componentType: GL.UNSIGNED_INT, type: "SCALAR" },
    });

    const primitive = { attributes, indices, mode: 4 };
    /* Only when the source said so. A STEP that declares no colour must reach
       the viewer with no material at all, because that is exactly what makes
       `declaresNoMaterials` hand it the review grey -- the same path every
       untinted STL already takes. Inventing a white material here would opt
       these models out of it and put them back in the dark. */
    if (m.color) {
      const alpha = m.alpha ?? 1;
      materials.push({
        name: `${m.name || "part"} colour`,
        pbrMetallicRoughness: {
          baseColorFactor: [...m.color.slice(0, 3), alpha],
          metallicFactor: 0,
          roughnessFactor: 0.85,
        },
        // Only a transparency the file declared, read in step-styles.mjs; the
        // library itself reports none.
        ...(alpha < 1 ? { alphaMode: "BLEND" } : {}),
      });
      primitive.material = materials.length - 1;
    }
    /* The b-rep face ranges are the one thing a tessellation knows that its
       triangles do not. Carrying them in `extras` costs a few hundred bytes and
       keeps the door open to anchoring a mark on "this fillet" rather than on a
       triangle number. Nothing reads it yet. */
    gltfMeshes.push({
      name: m.name || undefined,
      primitives: [primitive],
      extras: m.brep_faces?.length
        ? { brepFaces: m.brep_faces.map((f) => [f.first, f.last]) }
        : undefined,
    });
    nodes.push({ mesh: gltfMeshes.length - 1, name: m.name || undefined });
  }

  const json = {
    asset: { version: "2.0", generator },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes: gltfMeshes,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  };
  if (materials.length) json.materials = materials;

  const bin = Buffer.concat(chunks);
  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = Buffer.alloc(pad4(jsonBytes.length) - jsonBytes.length, 0x20);
  const header = (length, type) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(length, 0);
    b.writeUInt32LE(type, 4);
    return b;
  };
  const body = Buffer.concat([
    header(jsonBytes.length + jsonPad.length, 0x4e4f534a),
    jsonBytes,
    jsonPad,
    header(bin.length, 0x004e4942),
    bin,
  ]);
  const top = Buffer.alloc(12);
  top.write("glTF", 0, "ascii");
  top.writeUInt32LE(2, 4);
  top.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([top, body]);
}

/* Returns the derived mesh and what it is made of. Only ever called in the
   child below -- see `convertStepDetached` for why there is nowhere else it is
   allowed to run. `generator` is the caller's version string, written into the
   file so a mesh on disk can say what produced it. */
export async function convertStep(buffer, { generator = "AI3D" } = {}) {
  const kernel = await occt();
  /* On a malformed upload this prints its own complaint ("**** ERR StepFile:
     Incorrect syntax") to stdout, despite reading like an error. Nothing is
     done about it here: the child's stdout goes nowhere, which is the whole
     reason the answer travels on a descriptor of its own. */
  const result = kernel.ReadStepFile(new Uint8Array(buffer), { ...DEFLECTION });
  if (!result?.success || !result.meshes?.length) return { ok: false };
  /* Imported here, in the child, rather than at the top: everything above the
     child in this file stays on node built-ins, which is what lets the tests
     stand a fake child beside a copy of it. A file whose styles cannot be
     read is tessellated exactly as before -- the colours are a courtesy, the
     mesh is the answer. */
  try {
    const { applyDeclaredStyles } = await import("./step-styles.mjs");
    applyDeclaredStyles(result, buffer.toString("utf8"));
  } catch {}
  const meshes = result.meshes.filter(
    (m) => m.attributes?.position?.array?.length && m.index?.array?.length,
  );
  if (!meshes.length) return { ok: false };
  let triangles = 0,
    brepFaces = 0;
  for (const m of meshes) {
    triangles += m.index.array.length / 3;
    brepFaces += (m.brep_faces || []).length;
  }
  return {
    ok: true,
    glb: toGlb(meshes, generator),
    triangles,
    brepFaces,
    meshCount: meshes.length,
    deflection: { ...DEFLECTION },
  };
}

/* 73k faces tessellate in about 9 seconds, so the 600,000-face ceiling lands
   near 70. This is the budget for a conversion that is not going to finish at
   all: generous enough that no model which could have succeeded is cut off, and
   inside the 180-second IPC budget in `integration/manager.mjs` so the agent is
   told what actually happened instead of being told the instance is
   unreachable. */
const CONVERSION_TIMEOUT = 120000;

// A crash is a message and a stack; this is room for both without letting a
// child that writes endlessly grow the parent.
const STDERR_KEPT = 16384;

/* The line of a dead child's stderr that says what went wrong. Node ends an
   uncaught error with the stack and then its own version, so the tail of the
   stream is the least useful part: the line wanted is the last one that names
   an error, and failing that the last one that is not a stack frame. */
export function childComplaint(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const named = lines.filter((line) =>
    /^[\w.$]*(Error|Exception)\b/.test(line),
  );
  const said =
    named.pop() ??
    lines.filter((line) => !/^(at |Node\.js v)/.test(line)).pop();
  return said ? said.slice(0, 300) : "";
}

/* What a child left on the pipe, read as either an answer or a reason.

   Separate from the spawning because the dangerous part is pure and the
   dangerous input is ordinary: a length header, followed by bytes that may
   never have arrived. A child killed on the budget above, or starved writing a
   25 MB mesh, leaves a header promising more than it sent -- and parsing that
   where it used to be parsed, inline in the `close` handler, threw past the
   promise rather than into it. The promise then never settled and the
   exception left the process: there is no `uncaughtException` handler anywhere
   in this codebase, and `precheck` runs this inside the Gateway.

   So every way the bytes can be wrong resolves to a sentence instead. Never
   throws; the caller's only job is to pick `reject` or `resolve`. */
export function readAnswer(answer, { code, signal } = {}) {
  if (answer.length < 4)
    return {
      error: `The STEP converter stopped without an answer (${signal || `exit ${code}`}).`,
    };
  const length = answer.readUInt32LE(0);
  const head = answer.subarray(4, 4 + length);
  if (head.length < length)
    return {
      error: `The STEP converter stopped part-way through its answer (${signal || `exit ${code}`}).`,
    };
  let metadata;
  try {
    metadata = JSON.parse(head.toString());
  } catch {
    return { error: "The STEP converter's answer could not be read." };
  }
  return {
    value: metadata.ok
      ? { ...metadata, glb: answer.subarray(4 + length) }
      : { ok: false },
  };
}

/* The conversion happens in a process of its own, and the reason is memory
   rather than blocking.

   Both were measured on the heaviest real assembly here (73,132 faces, 8.9 s).
   A thread solves the blocking -- 3 ms of event-loop lag either way -- but the
   OCCT heap it leaves behind is not returned to the operating system when the
   thread exits: five conversions took a host from 58 MB to 417 MB of RSS and it
   stayed there. It is not proportional to the model. A 344-face plate costs the
   same ~240 MB, because the cost is instantiating the kernel in that process at
   all, once. A review server is long-lived and idles for 24 hours, so every
   project that ever published a STEP would sit on a quarter-gigabyte until
   someone restarted it.

   The same five conversions through a child process: 58 MB to 71 MB. The whole
   address space goes away with the process, which is the only thing that
   reliably gives those pages back.

   It is paid for in latency, and honestly: about 100 ms on the big assembly,
   but 1.2 s against a thread's 0.1-0.8 s on a small part, because a process
   reloads Node and recompiles the WASM every time. That cost lands on publish
   and precheck -- once per version, with the agent already waiting -- and what
   it buys is a review server that weighs the same after a STEP as before one.

   The answer comes back on a pipe of its own rather than on stdout, framed as
   a 4-byte length, that much JSON, then the mesh. stdout is where the parser
   prints its complaints about a malformed upload, and a frame sharing a stream
   with a library that can print is a frame that can be corrupted by one: the
   first malformed STEP through this code arrived as a JSON parse error on the
   word "ERR". stdout is discarded for that reason.

   stderr is not: the library prints its complaints to stdout, so what arrives
   on stderr is the child's own failure, and it is kept to say why a conversion
   died. It used
   to be discarded with stdout, and a vendored module loaded as the wrong kind
   came back as "stopped without an answer (exit 1)" and cost an hour. */
export function convertStepDetached(
  buffer,
  { generator = "AI3D", timeoutMs = CONVERSION_TIMEOUT } = {},
) {
  return new Promise((resolve, reject) => {
    const script = childScript();
    if (!script)
      return reject(new Error("The STEP converter is missing from this copy."));
    const child = spawn(process.execPath, [script, generator], {
      stdio: ["pipe", "ignore", "pipe", "pipe"],
    });
    let said = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (text) => {
      said = (said + text).slice(-STDERR_KEPT);
    });
    const chunks = [];
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    /* A conversion that is never going to answer must not hold a publish open
       until the IPC budget above it runs out, and a killed process is the one
       way to be sure the work has actually stopped rather than merely stopped
       being listened to. */
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(
        reject,
        new Error(
          `The STEP was still being tessellated after ${timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)}s` : `${timeoutMs}ms`} and was stopped. Simplify the model and export again.`,
        ),
      );
    }, timeoutMs);
    child.stdio[3].on("data", (chunk) => chunks.push(chunk));
    child.on("error", (error) => finish(reject, error));
    // The child can die before it has read the model; without this the failed
    // write arrives as an unhandled error event rather than as the exit below.
    child.stdin.on("error", () => {});
    child.on("close", (code, signal) => {
      // Already rejected on the budget above, and what a killed child leaves
      // behind is exactly the half-written frame this must not try to read.
      if (settled) return;
      const { value, error } = readAnswer(Buffer.concat(chunks), {
        code,
        signal,
      });
      if (error) {
        const why = childComplaint(said);
        return finish(reject, new Error(why ? `${error} ${why}` : error));
      }
      finish(resolve, value);
    });
    child.stdin.end(buffer);
  });
}
