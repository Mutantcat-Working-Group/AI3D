import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { convertStep } from "../server/step.mjs";
import { applyDeclaredStyles } from "../server/step-styles.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const close = (a, b) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-4);

/* The lantern's arrangement in miniature, written by build123d: a part named
   "part" made of two groups, colour set on each group -- two red solids, and
   one translucent one. It is what the library alone reads two of three solids
   of as grey, and it reads no opacity from any of them. */
const GROUPED = path.join(repo, "tests/fixtures/grouped-colours.step");

function materialsOf(glb) {
  const length = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + length).toString("utf8"));
  return json.meshes.map((m) => json.materials?.[m.primitives[0].material]);
}

test("colours declared on the solids of a grouped part reach the mesh, opacity included", async () => {
  const bytes = fs.readFileSync(GROUPED);
  const occt = await createRequire(import.meta.url)("occt-import-js")();
  const alone = occt.ReadStepFile(new Uint8Array(bytes), null);
  assert.equal(
    alone.meshes.filter((m) => !m.color).length,
    2,
    "the library alone leaves the grouped solids grey -- the case this is for",
  );

  const materials = materialsOf((await convertStep(bytes)).glb);
  assert.equal(materials.length, 3);
  const red = [0.85, 0.2, 0.1].map(linear);
  const clear = [0.85, 0.92, 0.95].map(linear);
  const solid = materials.filter((m) => m?.alphaMode === undefined);
  const glass = materials.filter((m) => m?.alphaMode === "BLEND");
  assert.equal(solid.length, 2);
  for (const m of solid) {
    const [r, g, b, a] = m.pbrMetallicRoughness.baseColorFactor;
    assert.ok(close([r, g, b], red), `${[r, g, b]} is the group's red`);
    assert.equal(a, 1);
  }
  assert.equal(glass.length, 1);
  const [r, g, b, a] = glass[0].pbrMetallicRoughness.baseColorFactor;
  assert.ok(close([r, g, b], clear));
  assert.ok(Math.abs(a - 0.45) < 1e-6, "transparency 0.55 is opacity 0.45");
});

/* A STEP body written by hand, one statement per line, and the shape of the
   library's answer for it: a node per product name, a mesh per solid carrying
   one b-rep face range per face. */
function step(lines) {
  return `ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n${lines.join("\n")}\nENDSEC;\nEND-ISO-10303-21;\n`;
}
function part(id, name, solids) {
  const faces = (n, at) =>
    Array.from({ length: n }, (_, i) => `#${at + i}`).join(",");
  const lines = [
    `#${id} = PRODUCT('${name}','${name}','',(#0));`,
    `#${id + 1} = PRODUCT_DEFINITION_FORMATION('','',#${id});`,
    `#${id + 2} = PRODUCT_DEFINITION('design','',#${id + 1},#0);`,
    `#${id + 3} = PRODUCT_DEFINITION_SHAPE('','',#${id + 2});`,
    `#${id + 4} = SHAPE_DEFINITION_REPRESENTATION(#${id + 3},#${id + 5});`,
    `#${id + 5} = ADVANCED_BREP_SHAPE_REPRESENTATION('',(#9,${solids.map((s) => `#${s.id}`).join(",")}),#0);`,
  ];
  for (const s of solids)
    lines.push(
      `#${s.id} = MANIFOLD_SOLID_BREP('',#${s.id + 1});`,
      `#${s.id + 1} = CLOSED_SHELL('',(${faces(s.faces, s.id + 1000)}));`,
    );
  return lines;
}
function styled(id, item, { colour, transparency, over } = {}) {
  const value =
    typeof colour === "string"
      ? `DRAUGHTING_PRE_DEFINED_COLOUR('${colour}')`
      : `COLOUR_RGB('',${colour.join(",")})`;
  const side = [`#${id + 4}`];
  const lines = [
    over
      ? `#${id} = OVER_RIDING_STYLED_ITEM('overriding color',(#${id + 1}),#${item},#${over});`
      : `#${id} = STYLED_ITEM('color',(#${id + 1}),#${item});`,
    `#${id + 1} = PRESENTATION_STYLE_ASSIGNMENT((#${id + 2}));`,
    `#${id + 2} = SURFACE_STYLE_USAGE(.BOTH.,#${id + 3});`,
    `#${id + 4} = SURFACE_STYLE_FILL_AREA(#${id + 5});`,
    `#${id + 5} = FILL_AREA_STYLE('',(#${id + 6}));`,
    `#${id + 6} = FILL_AREA_STYLE_COLOUR('',#${id + 7});`,
    `#${id + 7} = ${value};`,
  ];
  if (transparency !== undefined) {
    side.push(`#${id + 8}`);
    lines.push(
      `#${id + 8} = SURFACE_STYLE_RENDERING_WITH_PROPERTIES(.NORMAL_SHADING.,#${id + 7},(#${id + 9}));`,
      `#${id + 9} = SURFACE_STYLE_TRANSPARENT(${transparency});`,
    );
  }
  lines.push(`#${id + 3} = SURFACE_SIDE_STYLE('',(${side.join(",")}));`);
  return lines;
}
function answer(nodes, faceCounts, colours = []) {
  return {
    root: { name: "", meshes: [], children: nodes },
    meshes: faceCounts.map((n, i) => ({
      brep_faces: Array.from({ length: n }, () => ({})),
      ...(colours[i] ? { color: colours[i] } : {}),
    })),
  };
}
const node = (name, meshes) => ({ name, meshes, children: [] });
const twoSolids = [
  { id: 100, faces: 6 },
  { id: 200, faces: 7 },
];

test("each solid gets the colour the file gives it, in glTF's linear space", () => {
  const text = step([
    ...part(1, "part", twoSolids),
    ...styled(300, 100, { colour: [1, 0, 0] }),
    ...styled(320, 200, { colour: [0.5, 0.5, 0.5] }),
  ]);
  const result = answer([node("part", [0, 1])], [6, 7]);
  assert.equal(applyDeclaredStyles(result, text), 2);
  assert.deepEqual(result.meshes[0].color, [1, 0, 0]);
  assert.ok(close(result.meshes[1].color, [0.5, 0.5, 0.5].map(linear)));
  assert.equal(result.meshes[0].alpha, undefined);
});

test("an override beats the style it overrides, wherever it is written", () => {
  const text = step([
    ...part(1, "part", twoSolids),
    ...styled(340, 100, { colour: [0, 1, 0], over: 300 }),
    ...styled(300, 100, { colour: [1, 0, 0] }),
    ...styled(320, 200, { colour: "blue" }),
  ]);
  const result = answer([node("part", [0, 1])], [6, 7]);
  applyDeclaredStyles(result, text);
  assert.deepEqual(result.meshes[0].color, [0, 1, 0]);
  assert.deepEqual(result.meshes[1].color, [0, 0, 1]);
});

test("a declared transparency becomes opacity", () => {
  const text = step([
    ...part(1, "part", twoSolids),
    ...styled(300, 100, { colour: [1, 1, 1], transparency: 0.55 }),
  ]);
  const result = answer([node("part", [0, 1])], [6, 7]);
  assert.equal(applyDeclaredStyles(result, text), 1);
  assert.ok(Math.abs(result.meshes[0].alpha - 0.45) < 1e-9);
  assert.equal(result.meshes[1].color, undefined);
});

test("an assembly node takes its components' solids, in the order it lists them", () => {
  const text = step([
    ...part(1, "asm", []),
    ...part(20, "a", [{ id: 100, faces: 6 }]),
    ...part(40, "b", [{ id: 200, faces: 7 }]),
    "#60 = NEXT_ASSEMBLY_USAGE_OCCURRENCE('1','','',#3,#22,$);",
    "#61 = NEXT_ASSEMBLY_USAGE_OCCURRENCE('2','','',#3,#42,$);",
    ...styled(300, 100, { colour: [1, 0, 0] }),
    ...styled(320, 200, { colour: [0, 0, 1] }),
  ]);
  const result = answer([node("asm", [0, 1])], [6, 7]);
  assert.equal(applyDeclaredStyles(result, text), 2);
  assert.deepEqual(result.meshes[0].color, [1, 0, 0]);
  assert.deepEqual(result.meshes[1].color, [0, 0, 1]);
});

test("a name escaped in the file matches the name the library decoded", () => {
  const text = step([
    ...part(1, "\\X2\\5916\\X0\\", [{ id: 100, faces: 6 }]),
    ...styled(300, 100, { colour: [1, 0, 0] }),
  ]);
  const result = answer([node("外", [0])], [6]);
  assert.equal(applyDeclaredStyles(result, text), 1);
});

/* A colour on the wrong part is worse than none, so every way the file and the
   library can disagree about which mesh is which leaves the node alone. */
test("a node whose meshes cannot be checked against the file is left as it was", () => {
  const coloured = [
    ...part(1, "part", twoSolids),
    ...styled(300, 100, { colour: [1, 0, 0] }),
    ...styled(320, 200, { colour: [0, 0, 1] }),
  ];
  // A face count that differs from the solid's.
  let result = answer([node("part", [0, 1])], [6, 8]);
  assert.equal(applyDeclaredStyles(result, step(coloured)), 0);
  assert.equal(result.meshes[0].color, undefined);
  // A colour the library did read that the file says otherwise about.
  result = answer([node("part", [0, 1])], [6, 7], [[0, 1, 0]]);
  assert.equal(applyDeclaredStyles(result, step(coloured)), 0);
  assert.deepEqual(result.meshes[0].color, [0, 1, 0]);
  assert.equal(result.meshes[1].color, undefined);
  // Two products by the node's name that would colour it differently.
  result = answer([node("part", [0, 1])], [6, 7]);
  const twin = [
    ...part(500, "part", [
      { id: 600, faces: 6 },
      { id: 700, faces: 7 },
    ]),
    ...styled(800, 600, { colour: [1, 1, 0] }),
  ];
  assert.equal(applyDeclaredStyles(result, step([...coloured, ...twin])), 0);
  // A different number of solids than meshes.
  result = answer([node("part", [0])], [6]);
  assert.equal(applyDeclaredStyles(result, step(coloured)), 0);
});
