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
`collision`, `animation` and `name`. An explicit `type` wins over whatever the
prompt resolves, and the same six-language catalogue resolves prompts as it
does in the browser workbench.

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
