import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { imageSize, disableTypes, types as imageTypes } from "image-size";
import { ReviewError, atomicJson } from "./store.mjs";
import { convertStepDetached, STEP_FORMATS } from "./step.mjs";

// Also disable decoder fallback: a malformed RIFF header must not reach a
// different format's parser after the supported-format signature check.
disableTypes(
  imageTypes.filter((type) => !["png", "jpg", "webp"].includes(type)),
);

export const MAX_BYTES = 80 * 1024 * 1024;
export const MAX_TRIANGLES = 600000;
export const MAX_TEXTURE_PIXELS = 33554432;
// There was a second threshold here, at half the cap, where the review
// tessellation runs out of subdivision budget. It existed for the brush, whose
// strokes were stored against the refined triangles. The brush was shelved in
// 0.16.0 and every tool left marks whole source faces, read from the source
// topology — so running the budget dry costs a model nothing a reviewer can
// see, and the threshold was telling people to simplify for no reason.
// Measured 2026-09-17 on 352,560 faces: every source face stayed clickable,
// and stayed clickable with subdivision switched off entirely.
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
// Every limit message states the measured value beside the cap, and carries it
// as a number too. Without it a caller is told to "simplify" with no way to
// know by how much, and its only recourse is to guess a decimation ratio and
// republish until one happens to fit.
function limitError(message, code, measured) {
  const error = new ReviewError(message, 400, code);
  error.measured = measured;
  return error;
}

export function inspectModel(buffer, format, { derived } = {}) {
  if (!buffer.length || buffer.length > MAX_BYTES)
    throw limitError(
      `A model must be under ${mb(MAX_BYTES)}; this one is ${mb(buffer.length)}.`,
      "MODEL_LIMIT",
      { bytes: buffer.length },
    );
  /* STEP carries exact surfaces, so there is no face count to read -- it only
     exists once the surfaces have been tessellated. Measuring it therefore
     means doing the conversion, and the result is kept rather than thrown away:
     the publish path writes this same mesh instead of converting a second time,
     and `precheck` gets its count from the identical tessellation the reviewer
     will be looking at. */
  if (STEP_FORMATS.includes(format)) {
    /* The tessellation is handed in, never done here. This function is the one
       synchronous description of what a model is, and it is called from inside
       a review server and from inside the Gateway; running a CAD kernel in
       either of those is what `convertStepDetached` exists to prevent. A caller
       that has not converted is a caller in the wrong process, so it is told
       so rather than quietly served. */
    if (!derived)
      throw new Error(
        "A STEP must be tessellated by convertStepDetached before inspectModel sees it.",
      );
    if (!derived.ok)
      throw new ReviewError(
        "The STEP could not be read; export it again from the modelling tool.",
        400,
        "MODEL_FORMAT",
      );
    if (derived.triangles > MAX_TRIANGLES)
      throw limitError(
        /* Deliberately not the "decimate by this ratio" advice the mesh formats
           get. A STEP has no triangles to decimate -- the count came from our
           tessellation of its surfaces, so the only thing the caller can act on
           is the model itself. Telling them to scale a ratio they do not own
           would send them somewhere with nothing to change. */
        `Tessellating this STEP produces ${derived.triangles} triangles, over the ${MAX_TRIANGLES} limit. Simplify the model itself and export again; a STEP has no face count to reduce directly.`,
        "MODEL_LIMIT",
        { triangles: derived.triangles },
      );
    return { triangles: derived.triangles, format, derived };
  }
  if (format === "glb") {
    if (
      buffer.length < 20 ||
      buffer.toString("ascii", 0, 4) !== "glTF" ||
      buffer.readUInt32LE(4) !== 2 ||
      buffer.readUInt32LE(8) !== buffer.length
    )
      throw new ReviewError("Not a valid GLB 2.0 file.", 400, "MODEL_FORMAT");
    const jsonSize = buffer.readUInt32LE(12);
    if (jsonSize > buffer.length - 20 || buffer.readUInt32LE(16) !== 0x4e4f534a)
      throw new ReviewError("The GLB structure is incomplete.", 400);
    let doc;
    try {
      doc = JSON.parse(buffer.toString("utf8", 20, 20 + jsonSize));
    } catch {
      throw new ReviewError("The GLB data could not be read.", 400);
    }
    if (
      (doc.extensionsRequired || []).some(
        (x) =>
          ![
            "KHR_materials_unlit",
            "KHR_materials_clearcoat",
            "KHR_materials_transmission",
            "KHR_materials_ior",
            "KHR_materials_specular",
            "KHR_materials_emissive_strength",
            "KHR_texture_transform",
          ].includes(x),
      )
    )
      throw new ReviewError(
        "This GLB uses compression or a required extension that is not supported yet; export an uncompressed GLB.",
        400,
        "UNSUPPORTED_EXTENSION",
      );
    for (const item of [...(doc.buffers || []), ...(doc.images || [])]) {
      if (item.uri && !item.uri.startsWith("data:"))
        throw new ReviewError(
          "Use a GLB with both textures and geometry embedded in the file.",
          400,
          "EXTERNAL_RESOURCE",
        );
    }
    let bin = null;
    for (let offset = 20 + jsonSize; offset + 8 <= buffer.length;) {
      const size = buffer.readUInt32LE(offset),
        type = buffer.readUInt32LE(offset + 4);
      if (offset + 8 + size > buffer.length)
        throw new ReviewError("A GLB chunk is incomplete.", 400);
      if (type === 0x004e4942)
        bin = buffer.subarray(offset + 8, offset + 8 + size);
      offset += 8 + size;
    }
    let texturePixels = 0;
    for (const image of doc.images || []) {
      let bytes;
      if (image.uri?.startsWith("data:")) {
        const comma = image.uri.indexOf(",");
        if (!image.uri.slice(0, comma).endsWith(";base64"))
          throw new ReviewError(
            "Embed the textures in the GLB binary data.",
            400,
          );
        bytes = Buffer.from(image.uri.slice(comma + 1), "base64");
      } else {
        const view = doc.bufferViews?.[image.bufferView];
        if (!view || view.buffer !== 0 || !bin)
          throw new ReviewError("The texture data is incomplete.", 400);
        bytes = bin.subarray(
          view.byteOffset || 0,
          (view.byteOffset || 0) + view.byteLength,
        );
      }
      let dimensions;
      try {
        // Only supported web texture decoders are reachable. image-size 2.0.2
        // has known ICNS/JXL/HEIF parser DoS issues and no patched release yet.
        const png =
          bytes.length >= 8 &&
          bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg =
          bytes.length >= 3 &&
          bytes[0] === 255 &&
          bytes[1] === 216 &&
          bytes[2] === 255;
        const webp =
          bytes.length >= 12 &&
          bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP";
        if (!png && !jpeg && !webp)
          throw new Error("Unsupported texture decoder");
        dimensions = imageSize(bytes);
      } catch {
        throw new ReviewError(
          "The texture format is unsupported or its data is incomplete.",
          400,
          "TEXTURE_FORMAT",
        );
      }
      texturePixels += dimensions.width * dimensions.height;
      if (
        dimensions.width > 8192 ||
        dimensions.height > 8192 ||
        texturePixels > MAX_TEXTURE_PIXELS
      )
        throw limitError(
          `Texture decoding exceeds the limit: 8192×8192 per image and ${MAX_TEXTURE_PIXELS} pixels in total, against ${texturePixels} here. Reduce the textures — 4K or below is a good target.`,
          "TEXTURE_LIMIT",
          { texturePixels },
        );
    }
    if (
      doc.skins?.length ||
      doc.nodes?.some((n) => n.extensions?.EXT_mesh_gpu_instancing)
    )
      throw new ReviewError(
        "Convert skins and instances to static meshes before importing.",
        400,
        "ANIMATED_MODEL",
      );
    let triangles = 0;
    for (const node of doc.nodes || []) {
      if (node.mesh === undefined) continue;
      for (const prim of doc.meshes?.[node.mesh]?.primitives || []) {
        if (prim.mode !== undefined && prim.mode !== 4)
          throw new ReviewError("Only triangle meshes are accepted.", 400);
        const count =
          doc.accessors?.[prim.indices ?? prim.attributes?.POSITION]?.count;
        if (!Number.isFinite(count) || count < 3 || count % 3 !== 0)
          throw new ReviewError("The model triangle data is incomplete.", 400);
        triangles += count / 3;
      }
    }
    if (!triangles || triangles > MAX_TRIANGLES)
      throw limitError(
        `The limit is ${MAX_TRIANGLES} triangles; this model has ${triangles}. Simplify below ${MAX_TRIANGLES} and publish again.`,
        "MODEL_LIMIT",
        { triangles },
      );
    return { triangles, format, texturePixels };
  }
  if (format === "stl") {
    let triangles =
      buffer.length >= 84 && 84 + buffer.readUInt32LE(80) * 50 === buffer.length
        ? buffer.readUInt32LE(80)
        : (buffer.toString("utf8").match(/facet\s+normal/gi) || []).length;
    if (!triangles || triangles > MAX_TRIANGLES)
      throw limitError(
        triangles
          ? `The limit is ${MAX_TRIANGLES} triangles; this STL has ${triangles}. Simplify below ${MAX_TRIANGLES} and publish again.`
          : "The STL could not be recognised.",
        "MODEL_LIMIT",
        { triangles },
      );
    return { triangles, format };
  }
  throw new ReviewError(
    "GLB, STL and STEP are supported.",
    400,
    "MODEL_FORMAT",
  );
}

/* Which mesh each STEP in a media directory became, per build that made it.

   Tessellating is the one expensive step of a publish -- 8.6 s on the largest
   real assembly here -- and its result was already kept, content-addressed,
   for the round it was made for. What was missing was the way back from a
   source to it: the conversion ran before the source was even hashed, so
   publishing the same STEP again paid for the whole tessellation to arrive at
   a file that was already on disk. Keyed by build as well as by source,
   because the mesh records the build that made it and a later build may
   tessellate differently. */
const STEP_INDEX = "step-meshes.json";
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

function knownStepMesh(mediaDir, sourceHash, generator) {
  let entry, glb;
  try {
    entry = JSON.parse(
      fs.readFileSync(path.join(mediaDir, STEP_INDEX), "utf8"),
    )[sourceHash]?.[generator];
    if (!/^[0-9a-f]{64}$/.test(entry?.sha256)) return null;
    glb = fs.readFileSync(path.join(mediaDir, `${entry.sha256}.glb`));
  } catch {
    return null;
  }
  // Believed only as far as the bytes agree with it.
  if (sha256(glb) !== entry.sha256) return null;
  const { sha256: _, ...measured } = entry;
  return { ok: true, ...measured, glb };
}

function rememberStepMesh(mediaDir, sourceHash, generator, entry) {
  const file = path.join(mediaDir, STEP_INDEX);
  let index = {};
  try {
    index = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  index[sourceHash] = { ...index[sourceHash], [generator]: entry };
  atomicJson(file, index);
}

/* Asynchronous because for a STEP it now is: the tessellation happens in a
   process that exits afterwards, which is what keeps an 8-second assembly from
   stopping the server and what keeps the OCCT heap from becoming this one's.
   Every check below still runs in order, and the path is still validated -- and
   the size limit applied -- before anything reads the file or converts it. */
export async function importModel(
  { file, name, version, source, units = "unspecified" },
  { workspace, mediaDir, generator = "AI3D" },
) {
  const actual = fs.realpathSync(path.resolve(workspace, file));
  if (!actual.startsWith(workspace + path.sep))
    throw new ReviewError(
      "The model must live inside the current workspace.",
      400,
      "PATH_OUTSIDE",
    );
  const stat = fs.statSync(actual);
  if (!stat.isFile())
    throw new ReviewError("The model path is not a file.", 400, "MODEL_LIMIT");
  if (stat.size > MAX_BYTES)
    throw limitError(
      `A model must be under ${mb(MAX_BYTES)}; this one is ${mb(stat.size)}.`,
      "MODEL_LIMIT",
      { bytes: stat.size },
    );
  const buffer = fs.readFileSync(actual),
    format = path.extname(actual).slice(1).toLowerCase();
  const hash = sha256(buffer);
  const step = STEP_FORMATS.includes(format);
  const { derived, ...metadata } = inspectModel(buffer, format, {
    derived: step
      ? (knownStepMesh(mediaDir, hash, generator) ??
        (await convertStepDetached(buffer, { generator })))
      : undefined,
  });
  const id = hash.slice(0, 24),
    filename = `${hash}.${format}`;
  fs.mkdirSync(mediaDir, { recursive: true });
  const target = path.join(mediaDir, filename);
  if (!fs.existsSync(target)) fs.writeFileSync(target, buffer);
  /* A format the viewer cannot draw is stored as itself and travels with the
     mesh that was made from it. `sha256` stays the source's, because that is
     the file the author published, the one `download` returns and the one the
     submission message names; `mesh.sha256` is what the page actually fetched
     and checks itself against.

     The derived file is content-addressed like every other stored model, which
     is what freezes the face indices: the same STEP through the same
     tessellation is byte-identical and resolves to the same file, so marks made
     on it keep meaning the same faces. Should the parameters ever change, the
     new tessellation lands under a new name instead of overwriting the mesh
     some existing round was marked against. */
  let mesh = null;
  if (derived) {
    const meshHash = crypto
      .createHash("sha256")
      .update(derived.glb)
      .digest("hex");
    const meshTarget = path.join(mediaDir, `${meshHash}.glb`);
    if (!fs.existsSync(meshTarget)) fs.writeFileSync(meshTarget, derived.glb);
    rememberStepMesh(mediaDir, hash, generator, {
      sha256: meshHash,
      triangles: derived.triangles,
      brepFaces: derived.brepFaces,
      meshCount: derived.meshCount,
      deflection: derived.deflection,
    });
    mesh = {
      format: "glb",
      sha256: meshHash,
      filename: `${meshHash}.glb`,
      stored: path.relative(workspace, meshTarget),
      bytes: derived.glb.length,
      meshes: derived.meshCount,
      brepFaces: derived.brepFaces,
      deflection: derived.deflection,
    };
  }
  return {
    id,
    sha256: hash,
    filename,
    name: String(name || path.basename(actual)).slice(0, 160),
    version: String(version || "initial").slice(0, 80),
    /* A STEP's mesh is millimetres whatever the caller says, because the
       tessellator is asked for millimetres (`DEFLECTION.linearUnit`) and scales
       whatever unit the file declares into them. Labelling it with the caller's
       word instead put "in" beside millimetre coordinates. */
    units: step ? "mm" : String(units).slice(0, 30),
    source: source
      ? path.relative(workspace, path.resolve(workspace, source))
      : null,
    original: path.relative(workspace, actual),
    stored: path.relative(workspace, target),
    bytes: buffer.length,
    ...metadata,
    ...(mesh ? { mesh } : {}),
    publishedAt: Date.now(),
  };
}
