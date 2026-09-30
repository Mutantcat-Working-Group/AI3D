<div align="center">
  <img src="icon.png" width="100" alt="AI3D" />
  <h2>AI3D</h2>
  <p>Game 3D asset generator</p>
</div>

[中文](README.md) | **English**

[![CI](https://github.com/Mutantcat-Working-Group/AI3D/actions/workflows/ci.yml/badge.svg)](https://github.com/Mutantcat-Working-Group/AI3D/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

### 1. Product overview

AI3D (AI3D模型 in Chinese) is a game 3D asset generator: describe the prop,
character or scene you want in one sentence, and it produces a low-poly asset
with named parts, playable animation previews and export packs for
Unity, Godot and Unreal in seconds. It also keeps the agent-assisted review
workbench, so "change this" can still be communicated on real mesh surfaces.

Generation is deterministic procedural modeling: the same description and seed
always produce the same mesh. Every asset ships with engine-ready collider
presets, LODs, animation clips and a manifest, so it fits a game pipeline
instead of staying a preview image.

### 2. What it generates

45 built-in game asset templates, each with sensible part names, tags and
collider presets:

| Category  | Assets                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Weapons   | sword, axe, bow, hammer, spear, shield                                                                                    |
| Creatures | character, monster, dragon                                                                                                |
| Buildings | house, tower, tent, statue, pillar, well, bridge, fence, fountain                                                         |
| Props     | potion, chest, key, gem, barrel, crate, flag, torch, campfire, sign, tree stump, mushroom, crystal, runestone, spike trap |
| Vehicles  | car, boat, plane, bike                                                                                                    |
| Sci-fi    | turret, drone, comm antenna                                                                                               |

Beyond the quick templates you can describe an asset in natural language and
choose a style (low-poly / realistic / stylized), then tune color, roughness,
metalness, emissive and seed. Generate up to 12 seed variants at once, preview
each one, and save the ones you like to the asset library.

![The asset generator interface](docs/media/viewer.png)

### 3. Built for a game pipeline

- **Animation** - characters and monsters get idle / walk / attack clips,
  dragons get idle / fly / attack; play them in the preview and export them in
  the GLB.
- **LODs** - generate three LOD levels in one click, preview each level and
  export the set; every level carries triangle, vertex, part and draw-call
  budgets, and the simplifier keeps materials and merges same-material meshes.
- **Colliders** - box / sphere / capsule / cylinder / mesh presets per asset
  type, sized from the actual mesh and emitted as engine-side collider files.
- **Real-world scale** - the size carries a unit (m / cm / mm / ft / in) and a
  fit axis (largest dimension / height / width / depth), and the origin can be
  centred, planted on the ground, or pinned to the base or the top, so a
  character stands on the floor while a prop stays centred. The measured span
  in metres goes into the manifest.
- **Engine packs** - Unity, Godot and Unreal presets. Godot packs ship a
  `.tscn` that instances `LOD0.glb`; Unity and Unreal currently emit GLB,
  materials and import metadata rather than pretending to produce native
  `.prefab` / `.meta` / `.uasset`. The pack carries meshes, materials,
  colliders, animation info, a whole-pack triangle / vertex / part / draw-call
  budget and a manifest with engine-ready names.
- **Scene kits** - dungeon, camp, outpost, village, temple, battle, wilderness
  and town kits place props deterministically from a seed, exportable as a
  whole scene.
- **Manifest** - export JSON / CSV with asset name, type, tags, triangle,
  vertex, part and draw-call counts, per-level LOD budgets and collider info.
- **Download formats** - GLB, JSON glTF (`.gltf` with embedded resources) and
  OBJ. The UI no longer offers FBX, which was never actually implemented.

### 4. Quick start

Node.js 22 or newer and a browser with WebGL.

```sh
npm ci
npm run dev          # open http://127.0.0.1:43175
```

Open the generator in the top-right corner, pick a quick template or describe
an asset, and generate. Once the preview looks right, open the export panel,
choose format (GLB / JSON glTF / OBJ), engine, collider and animation, and
download a single file or a full pack. Generated results can be saved to the
local asset library with tag filtering, favorites, renaming and batch export.

### 5. The review loop with an agent

Generated or imported models can also go through review: the agent runs
`precheck` on the model file, then `open` to publish it. You open the URL in a
modern WebGL browser, drop lettered pins directly on the mesh surface or fill
connected near-flat regions with the paint bucket, and press **Send to Agent**.
The agent reads positions, face references and version information rather than
a screenshot, confirms what it understood, and publishes the next version.
Every version stays open for marking.

Telling an agent "the fillet on the left bracket is too sharp" costs a sentence
and buys an argument about which bracket. A mark carries the mesh, the face,
the barycentric coordinate and the version it was made against. The agent gets
an address, not a description, and can say back which surface it understood.

![A recording of dropping lettered pins A and B, filling a face with the paint bucket, and sending the batch to the agent](docs/media/demo.gif)

### 6. Built-in chat and modeling knowledge

AI3D now folds the chat panel into the workbench, so you can talk about the
current model while generating, exporting or reviewing without opening a
separate chat window. The conversation is still attached to the host session
that started the task, so only a host that can write back into its own session
can send and receive; without a return route the panel says chat is unavailable
instead of inventing a reply. A knowledge search sits above the composer: type a
term such as "LOD budget", "white model", "topology" or "PBR" and the offline
pack returns cited entries with their source and licence. Selecting one inserts
the citation straight into the message, and search works offline without a host.

The pack copies no third-party files. It stores verifiable sources, licences
and concise facts, which keeps it small enough to ship in an offline installer
and reliable enough to hand to an agent as context. It currently covers:

- The glTF 2.0 specification and the Khronos sample-asset corpus, for
  interchange and compatibility questions.
- Professional modeling craft: base-mesh and white-model workflow, the
  blockout-to-detail pipeline order, retopology and quad flow, UV unwrapping and
  texel density, high-to-low baking and normal maps, normal-map and shading
  conventions, modular kits and trim sheets, rigging and skinning budgets,
  texture packing and colour space, asset naming conventions, hard-surface
  bevels and panel breaks, game asset budgets, LOD and virtualized geometry,
  and PBR material authoring.
- Public white-model and reference libraries: the Blender human base-mesh asset
  bundle (CC0), Smithsonian Open Access 3D collection (CC0), OpenGameArt, Scan
  the World sculpture scans, Mixamo rigged characters and animations, Poly
  Haven, Kenney, Quaternius, Poly Pizza, Sketchfab's CC0 filter, Wikimedia
  Commons 3D models, MakeHuman base meshes, the Z-Anatomy atlas and NASA 3D
  Resources, each tagged with its licence; CC0 resources are marked as usable
  commercially without attribution.

An MCP client can call the `ai3d_knowledge` tool against the same pack and gets
structured entries with citations. The chat panel and MCP share one
implementation, so the two surfaces cannot drift apart.

### 7. Three ways in, one implementation

The core does not know which harness is talking to it. All three entry points
drive the same instance manager, with the same actions and the same results.

| Entry point        | How                                                    | Ownership                       |
| ------------------ | ------------------------------------------------------ | ------------------------------- |
| OpenClaw extension | native `ai3d` tool                                     | derived from the host's session |
| `ai3d` CLI         | `ai3d <action> --owner <id> ...`, JSON in, JSON out    | stated by the caller            |
| `ai3d-mcp`         | stdio MCP server, added to your client's `mcp_servers` | the workspace, or `AI3D_OWNER`  |

Ownership decides who may change a draft or switch the displayed version. A
second owner asking about the same project is refused with `RESUME_REQUIRED`
until someone says, explicitly, that the review is being continued.

Only a host that can write into its own conversation can announce a submission.
A client reached over a tool protocol cannot, because the protocol has no way to
wake a conversation. `status.notifier` reports what the host actually offers.
Where `send` is false, a submitted batch has the status `waiting`: durable,
listed, collected by calling `read`. It is not a delivery that failed, and it
never becomes stalled.

### 8. Model limits

| Limit          | Threshold                        | On exceeding                     |
| -------------- | -------------------------------- | -------------------------------- |
| Triangles      | 600,000                          | publish refused, `MODEL_LIMIT`   |
| File size      | 80 MB                            | publish refused, `MODEL_LIMIT`   |
| Texture pixels | 8192x8192 each, 33,554,432 total | publish refused, `TEXTURE_LIMIT` |

A mark names a source face, so a model at the cap marks exactly as precisely as
a small one. `precheck` measures a file before `open` and, when it is over,
answers with the ratio to decimate by instead of a refusal after the fact.

A STEP has no face count until it has been tessellated, so `precheck` tessellates
it to measure it; `open` then publishes the same tessellation. Over the cap it
says to simplify the model rather than giving a ratio, because there are no
triangles in the file to decimate.

### 9. Installing and running

From a clone, for the full development environment:

```sh
npm ci
npm run samples      # generate the parametric sample models
npm test             # 314 unit and integration tests
npm run test:browser # 83 real-Chromium tests
```

`npm run samples` writes to `tmp/samples` inside the clone, where the suites
publish from. Work happens on `dev`; `main` is what has been released and is
only ever fast-forwarded from `dev` with the tag going on straight afterwards.

For an OpenClaw install, build and install the extension from that clone:

```sh
npm run build:integration -- tmp/candidate/package
openclaw plugins install ./tmp/candidate/package
```

For any MCP client, install a tagged commit and point the client at it:

```sh
npm i -g "github:Mutantcat-Working-Group/AI3D#v1.0.20260929"
```

```toml
[mcp_servers.ai3d]
command = "ai3d-mcp"
```

Or start it without installing:

```toml
[mcp_servers.ai3d]
command = "npx"
args = ["-p", "github:Mutantcat-Working-Group/AI3D#v1.0.20260929", "ai3d-mcp"]
```

Pin the tag. Without one, npm takes whatever the default branch holds at that
second and runs the `prepare` script in it. AI3D is not published on the npm
registry; this repository installs as the package `org.mutantcat.ai3d`. The
install commands above use npm as the package manager, not as the source.

The workbench listens on the loopback address by default. LAN mode binds one
verified private IPv4 and always requires authorization.

### 10. Desktop client

AI3D also ships as a Tauri desktop client that puts the same generator and
workbench in its own window. The desktop app needs Node.js 22 or newer on the
machine because the bundled service still runs under Node; the window uses the
system WebView (WebView2 on Windows).

```sh
npm ci
npm run desktop:build                 # stage the service and web client into tmp/desktop-package
npm run desktop:dev                   # open the desktop window in dev mode
npm run desktop:build:installer       # build the NSIS installer (Windows)
```

Installer output lands in `src-tauri/target/release/bundle/nsis/`. Pushing a
`v*` tag makes GitHub Actions build and attach the following installers to the
release: a Linux x64 AppImage, Intel and Apple Silicon macOS DMGs (ad-hoc
signed, with an Applications drag link), and x64 and ARM64 Windows NSIS
installers (self-signed, with Simplified Chinese, Traditional Chinese and
English installer UI). The application identifier is `org.mutantcat.ai3d`; the
window title is AI3D and the icon is the repository's `icon.png`. Desktop data
(the asset library, review state and published models) lives in the OS
application data directory, and the bundled service only listens on the local
loopback address.

### 11. Roadmap

Plans, not promises: the order can change as people use it. Ideas and requests
are welcome in [Discussions](https://github.com/Mutantcat-Working-Group/AI3D/discussions).

- **1.4** - what the reviewer means reaches the agent: a submission carries
  which way was up on the reviewer's screen, a mark can carry a short note, and
  the reviewer can measure the model and attach the dimension to a mark.
- **1.5** - every valid GLB opens and looks as its author made it: Draco,
  Meshopt and KTX2 compression, rigged models in their bind pose, morph targets,
  GPU instancing, a texture budget that fits a 4K PBR set, and `.gltf` with
  external files.
- **1.6** - showing a GLB as intended: animation poses, LOD sets and material
  variants.
- **1.7** - review aids for game assets: UV and checker views, per-channel
  texture views, per-mesh triangle counts and a node tree with visibility.
- **1.8 (done)** - game prop kits: dungeon pieces (brazier, runestone, spike
  trap) and sci-fi pieces (turret, drone, comm antenna), with triangle, vertex
  and part counts shown per asset so teams can check engine budgets before
  export.
- **1.9 (done)** - scene kits: eight presets including dungeon, camp and
  outpost that place props deterministically from a seed, and export the whole
  scene with named props intact.
- **2.0 (done)** - animation playback: rigged animation you can play and step
  through frame by frame.
- **2.1** - built-in chat and modeling knowledge: talk to AI3D inside the app,
  backed by a cited knowledge pack of public white-model and professional
  modeling references, callable as an MCP tool.
- **2.2** - knowledge pack maintenance: record source, license and refresh
  date, support offline search and later incremental updates.

### 12. Documentation

- [AGENT-INTERFACE.md](AGENT-INTERFACE.md) - the contract an agent implements
- [docs/zh/](docs/zh/) - design documents, in Chinese: positioning,
  requirements, versioning rules, roadmap
- [Chinese README](README.md) - the Chinese project overview

### 13. License

Apache-2.0. See [LICENSE](LICENSE).

STEP support is the one part that is not ours. Reading a STEP means evaluating
its surfaces, which AI3D does with
[occt-import-js](https://github.com/kovacsv/occt-import-js), a WebAssembly build
of [Open CASCADE Technology](https://github.com/Open-Cascade-SAS/OCCT). Both are
**LGPL-2.1** and stay that way: from a clone or an npm install the library
resolves as an ordinary dependency, and the OpenClaw package carries it as two
unmodified files in `vendor/` with both licence texts beside them, rather than
folded into a bundle. Replacing them is a matter of swapping those two files.
Everything AI3D itself remains Apache-2.0.
