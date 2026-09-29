<div align="center">
  <img src="icon.png" width="100" alt="AI3D" />
  <h2>AI3D</h2>
  <p>Point at the model. Let the agent read what you meant.</p>
</div>

[中文](README.md) | **English**

[![CI](https://github.com/Mutantcat-Working-Group/AI3D/actions/workflows/ci.yml/badge.svg)](https://github.com/Mutantcat-Working-Group/AI3D/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

### 1. Product overview

AI3D (AI3D模型 in Chinese) is a browser workbench for reviewing 3D models with
an AI agent. The agent publishes a draft, you open it in your own browser, mark
the surfaces that are wrong with lettered pins and painted regions directly on
the mesh in three dimensions, and hand the batch back. The agent reads
positions, face references and version information rather than a screenshot,
confirms what it understood, and publishes the next version. Every version stays
open for marking.

It is not a CAD or sculpting tool. It is the step between "here is a draft" and
"here is what to change", which until now was a screenshot and a paragraph.

![A recording of dropping lettered pins A and B, filling a face with the paint bucket, and sending the batch to the agent](docs/media/demo.gif)

### 2. Why positions

Telling an agent "the fillet on the left bracket is too sharp" costs a sentence
and buys an argument about which bracket. A mark carries the mesh, the face, the
barycentric coordinate and the version it was made against. The agent gets an
address, not a description, and can say back which surface it understood.

### 3. The loop

1. The agent runs `precheck` on the model file, then `open` to publish it.
2. You open the URL in Chrome, Safari or any modern WebGL browser.
3. Pick the label tool and click a surface to drop a lettered pin; the paint
   bucket fills the connected near-flat area around the face you click. The
   orbit tool places nothing, so turning the model never marks it. Nothing is
   submitted until you say so.
4. Press **Send to Agent**. The batch is frozen against the version you marked.
5. The agent calls `read`, replies in your conversation, and `open`s the next
   version. Older versions keep their own marks and stay selectable.

There is no "finish the round" button. The next version is the end of the last
one.

### 4. Three ways in, one implementation

The core does not know which harness is talking to it. All three entry points
drive the same instance manager, with the same actions and the same results.

| Entry point | How | Who owns a review |
| --- | --- | --- |
| OpenClaw extension | native `ai3d` tool | derived from the host's session |
| `ai3d` CLI | `ai3d <action> --owner <id> ...`, JSON in, JSON out | stated by the caller |
| `ai3d-mcp` | stdio MCP server, added to your client's `mcp_servers` | the workspace, or `AI3D_OWNER` |

Ownership decides who may change a draft or switch the displayed version. A
second owner asking about the same project is refused with `RESUME_REQUIRED`
until someone says, explicitly, that the review is being continued.

Only a host that can write into its own conversation can announce a submission.
A client reached over a tool protocol cannot, because the protocol has no way to
wake a conversation. `status.notifier` reports what the host actually offers.
Where `send` is false, a submitted batch has the status `waiting`: durable,
listed, collected by calling `read`. It is not a delivery that failed, and it
never becomes stalled.

### 5. Model limits

| Limit | Threshold | On exceeding |
| --- | --- | --- |
| Triangles | 600,000 | publish refused, `MODEL_LIMIT` |
| File size | 80 MB | publish refused, `MODEL_LIMIT` |
| Texture pixels | 8192x8192 each, 33,554,432 total | publish refused, `TEXTURE_LIMIT` |

A mark names a source face, so a model at the cap marks exactly as precisely as
a small one. `precheck` measures a file before `open` and, when it is over,
answers with the ratio to decimate by instead of a refusal after the fact.

A STEP has no face count until it has been tessellated, so `precheck` tessellates
it to measure it; `open` then publishes the same tessellation. Over the cap it
says to simplify the model rather than giving a ratio, because there are no
triangles in the file to decimate.

### 6. Installing and running

Node.js 22 or newer and a browser with WebGL.

From a clone, for development:

```sh
npm ci
npm run samples      # generate the parametric sample models
npm test             # 272 unit and integration tests
npm run test:browser # 76 real-Chromium tests
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

### 7. Desktop client

AI3D also ships as a Tauri desktop client that puts the same workbench in its
own window. The desktop app needs Node.js 22 or newer on the machine because
the bundled service still runs under Node; the window uses the system WebView
(WebView2 on Windows).

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
- review state and published models - lives in the OS application data
directory, and the bundled service only listens on the local loopback address.

### 8. Roadmap

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
- **1.8** - game prop kits: dungeon pieces (brazier, runestone, spike trap)
  and sci-fi pieces (turret, drone, comm antenna), with triangle, vertex and
  part counts shown per asset so teams can check engine budgets before export.
- **1.9** - scene kits: dungeon, camp and outpost presets that place nine
  props deterministically from a seed, and export the whole scene with named
  props intact.
- **2.0** - animation playback: rigged animation you can play and step through
  frame by frame.

### 9. Documentation

- [AGENT-INTERFACE.md](AGENT-INTERFACE.md) - the contract an agent implements
- [docs/zh/](docs/zh/) - design documents, in Chinese: positioning,
  requirements, versioning rules, roadmap
- [Chinese README](README.md) - the Chinese project overview

### 10. License

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
