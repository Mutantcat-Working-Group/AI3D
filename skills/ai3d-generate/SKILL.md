---
name: "ai3d-generate"
description: "Generate a game-ready 3D asset from one sentence or a template id, and write a GLB plus an engine pack into the workspace."
---

# AI3D asset generation

## 1. Deciding to generate

When someone wants a new prop, character or scene built from the built-in
generator rather than an existing model reviewed, use `ai3d_generate`. For a
craft question (LOD budgets, topology, PBR, white-model sources) call
`ai3d_knowledge` first and cite what it returns; the pack exists so an answer
does not have to be remembered.

## 2. Calling the generator

Describe the asset in one sentence ("a red low-poly sword 1.5 m") or pass a
template `type` directly; at least one is required. Pass a workspace-relative
`output` directory, plus optional `style`, `color`, `size`, `units`, `seed`,
`engine` (unity/godot/unreal), `withLod`, `anchors`, `exportClips`,
`collision`, `animation`, `name`, `quality`, `profile` and `template`. An
explicit `type` wins over whatever the prompt resolves, and the same
six-language catalogue resolves prompts as it does in the browser workbench.

Before picking a `type`, a loot item key or a kit, call `ai3d_catalog`:
`mode: "types"` returns every asset type with its tags, collider, animation
clips, gameplay role and spawn stats, `mode: "kits"` returns the scene kits
with their prop types and default design, and `mode: "design"` describes the
scene design fields and the rules the audit enforces. `mode: "projects"`
returns the complete project templates with their categorized asset groups,
scene kits, defaults and aliases. `query` filters by substring and `tags`
keeps only types or project templates carrying every named tag. It reads the
same registry the generator does and writes nothing.

Pass `kind: "scene"` to compose a whole level kit rather than a single prop.
Scenes take a kit `type` (dungeon, camp, outpost, village, temple, battle,
wilderness, town) or a prompt that names one, plus the optional layout knobs
`spacing`, `groundPadding` and `propScale`. Pass a `props` array to lay the
scene out prop by prop instead of taking the kit's own arrangement: each entry
sets a `type` (falling back to the kit's prop in that slot) with optional
`size`, `x`, `y`, `z`, `rotationY` and `seed`, matching the records the in-app
scene editor saves. Pass `design` to replace the kit
defaults with custom `spawnPoints`, `objectives`, `lootTables`, `locks` and
`directives`; the returned `designAudit` checks them against the composed
props and the asset catalogue. A scene ignores the per-mesh settings (`size`,
`withLod`, `anchors`, `exportClips`, `collision`, `animation`) and instead
writes the design metadata, a design audit and an engine-space scene blueprint
plus an editor builder script for the target engine into the pack, so the
level arrives with its spawn points, objectives, loot tables, locks and prop
placements already in the target engine's axes and units. The builder drops
the composed model in and places every anchor and enemy spawn at its blueprint
transform, with the combat stats attached to the spawn markers.

Pass `kind: "set"` to build a whole asset set in one call. `items` (1-32) lists
the assets, each with a `type` or a `prompt` plus optional `name`, `size`,
`units`, `color` and `seed`; the set-level `style`, `engine` and export switches
apply to every entry and the per-item fields win. Each asset lands in its own
folder, duplicate names get a `-2` suffix, and a `set.json` manifest records the
resolved settings plus the aggregate triangle, vertex, part and draw-call
totals. A set `seed` derives each asset's seed as `seed + index`, so the same
request rebuilds the same set.

Pass `kind: "project"` to expand a complete game asset project instead of one
pack. Use `template` with `prototype-starter`, `fantasy-dungeon`,
`village-adventure`, `sci-fi-outpost` or `wilderness-survival`, or let a
prompt name one of those templates. The result contains categorized asset-set
folders, one or more scene packs, a `project.json` delivery manifest, an
`import-order.json` plan and a project `README.md`. The template's quality and
profile defaults apply unless the request overrides them, and aggregate
readiness and totals are carried into every nested pack.

The tool writes `<output>/<name>/<name>.zip` (the curated engine pack),
`<output>/<name>/<name>.glb` (standalone GLB at the engine's scale and up
axis), an unpacked `pack/` directory for inspection and `summary.json` with
the parameters, stats and absolute paths. It refuses any `output` that would
escape the workspace.

## 3. Handing a generated asset to review

Generation never publishes to the review workbench. To review what was just
generated, run `precheck` on the GLB and `open` it afterwards, following the
review skill. Done means the files exist, the path stays inside the workspace,
and the user knows what was generated and where it is.
