<div align=center>
<img src="icon.png" style="width:100px;" width="100"/>
<h2>AI3D</h2>
</div>

[简体中文](README.md) | English

### 1. Product overview

AI3D is a game 3D asset generator: describe the prop, character or scene you want in one sentence, and within seconds you have a low-poly asset with named parts, playable animations and ready-to-use export packs for Unity, Godot and Unreal. It also ships a built-in chat panel and an MCP server, so generating, asking and reviewing all happen in one window.

- Deterministic procedural modeling: the same description and seed always produce the same mesh, which makes assets safe to commit.
- 102 built-in asset templates across weapons, armor, creatures, buildings, props, vehicles, sci-fi and nature, each with named parts, tags and collider presets.
- Engine-ready: every asset carries LODs, colliders, named parts with attachment points, and gameplay and spawn metadata. What you export is what you ship.
- Built-in chat: talk to the model in the app itself; a single sentence can generate an asset, a set, a scene or a whole project, with an offline modeling knowledge pack for cited answers.
- MCP server: AI coding assistants such as Claude Code and Cursor can drive generation and review directly. The software is the server.
- Review loop: drop lettered pins on real mesh surfaces and fill in near-planar regions with a paint bucket. The agent receives 3D coordinates and face references, never screenshots.
- Desktop client: a Tauri build for Windows, macOS and Linux, with the interface in Simplified Chinese, Traditional Chinese, English, German, French and Japanese.
- **Publisher** published by 异猫工作群 (mutantcat.org), GitHub: https://github.com/Mutantcat-Working-Group

Core value:

- Deterministic: results can be rebuilt; the description plus the seed is the recipe.
- Engine-ready: naming, LODs, colliders, animations and manifests all ship, so the export drops straight into a pipeline.
- AI-native: chat and MCP are built-in capabilities, not plugins.
- One closed window: generation, export, knowledge search, review annotations and agent conversation live in a single interface.

### 2. Features

#### Asset generation

- Quick templates: 102 asset types, each with named parts, default PBR textures, a collider preset and template prompts in six languages.
- Natural language: describe the asset directly, pick low-poly / realistic / stylized, and tune color, roughness, metalness and emissive.
- Seed variants: generate up to 12 variants at once, preview them one by one, and save the winners to the asset library, which supports tag filtering, favorites, renaming and batch export.
- Asset sets: one row per asset, up to 32 per batch, sharing style, materials and export settings, with a `set.json` manifest at the top.
- Scenes and projects: eight scene kits place props deterministically by seed; five project templates expand into asset sets, scenes and engine import orders in one go.

#### Engine-ready

- Three LOD levels: generate in one click, preview per level, batch export; each level records triangle, vertex, part and draw-call budgets.
- Colliders: box / sphere / capsule / cylinder / convex hull / mesh presets, sized from the actual mesh. Toggle "show colliders" in the preview to inspect the physics proxy before exporting.
- Named parts and attachment points: exports record each part's center and bounding box plus recommended anchors (grip, foot, hinge, hook...). With the option on, GLB/glTF gains `anchor_<role>` empty nodes that engines can look up by name.
- Gameplay and spawn metadata: chests open, portcullises rise, coins are picked up, monsters are enemies. Interaction roles, factions, AI behavior, health and combat values go into the manifest, ready for level scripts.
- Engine packs: Unity, Godot and Unreal presets with meshes, separate textures (albedo / normal / roughness / metalness / AO), colliders, an animation list and a budget summary. The Godot pack includes a `.tscn` that instances `LOD0.glb` directly.
- Real-world size and origin: units (m / cm / mm / ft / in), size basis (largest edge / height / width / depth) and origin placement are all selectable, written in meters into the manifest and the measured bounding box.

#### Built-in chat and knowledge pack

- The chat panel lives inside the workbench: talk about the current model while generating, exporting or reviewing, without opening another window.
- Plain requests build: project, scene, set or single-asset needs phrased in ordinary language are recognized and routed into the matching generation pipeline, with confirmation, progress and results written back into the chat; plain questions are still forwarded to any connected agent.
- Model configuration: store several model endpoints at once, each with its own API key (up to 12), and pick the one the chat uses by default from the models you configured.
- Knowledge search: type "LOD budget", "whitebox", "topology" or "PBR" and get cited, license-annotated entries from the offline knowledge pack that ships with the software; click one to insert the citation into your message. The search needs no host and works offline.
- Knowledge coverage: the glTF 2.0 specification and Khronos sample assets; professional modeling workflows such as whitebox and base mesh work, retopology and quad layout, UV unwrapping and texel density, high/low-poly baking, skinning budgets and PBR materials; plus public sources including Blender's official human basemesh (CC0), Smithsonian Open Access (CC0), OpenGameArt, Poly Haven, Kenney, Quaternius, Mixamo and NASA 3D Resources, each entry carrying its license.

#### Review loop with agents

- The agent runs `precheck` on the model file, then `open` to publish. You drop lettered pins on the mesh surface or paint connected near-planar regions with the bucket, then press "hand to the agent".
- What the agent reads is a set of 3D coordinates, face references and version information; it can also point back at the surface it understood. Each version stays openable and annotatable.
- Model limits: 600,000 triangles, 80 MB per file, 8192x8192 per texture (33,554,432 pixels total). `precheck` catches oversize before `open` and reports the simplification ratio instead of refusing afterwards.

#### Desktop client

- The Tauri desktop puts the same generator and workbench in a native window titled AI3D, with the repository's root `icon.png` as the application icon.
- A watchdog probes the built-in service every 5 seconds: an exited process or repeated silence restarts it and re-points the window at the new port. Screen-off and sleep are not mistaken for a crash.
- It listens on loopback only by default; LAN mode binds an authenticated private IPv4 and always requires authorization.
- Desktop data (asset library, review state, published models) lives in the system application data directory.

### 3. Install and download

1. Desktop: download the package for your platform from [Releases](https://github.com/Mutantcat-Working-Group/AI3D/releases/latest): Linux x64 AppImage, DMGs for macOS Intel and Apple Silicon (ad-hoc signed, with an Applications drop shortcut), and NSIS installers for Windows x64 and ARM64 (self-signed). Every release also attaches `checksums-sha1.txt` and `checksums-md5.txt`:

   ```sh
   sha1sum -c checksums-sha1.txt
   md5sum -c checksums-md5.txt
   ```

   The desktop build requires Node.js 22 or newer on the machine: the packaged built-in service still runs on Node, while the window itself uses the system WebView (WebView2 on Windows).
2. Run in the browser: Node.js 22 or newer and a WebGL-capable browser.

   ```sh
   npm ci
   npm run dev          # opens http://127.0.0.1:43175
   ```
3. MCP clients: add AI3D as an MCP server to Claude Code, Cursor and friends.

   ```toml
   [mcp_servers.ai3d]
   command = "npx"
   args = ["-p", "github:Mutantcat-Working-Group/AI3D#v1.0.20260929", "ai3d-mcp"]
   ```

   Always pin the tag. Without one, npm installs whatever the default branch holds that day and runs its `prepare` script. This repository is not published to the npm registry; the command uses npm as a package manager, not the registry as a source.
4. Build from source (including a local installer):

   ```sh
   npm ci
   npm run desktop:build            # packages the built-in service and frontend
   npm run desktop:build:installer  # builds a local installer
   ```

### 4. Quick start

1. After launch the interface opens on the review workbench; press the "generator" button in the top right to enter the generator.
2. Pick a quick template, or describe the asset you want in one sentence, and press "generate".
3. Tune color, materials and seed; up to 12 variants per run. When a preview looks right, save it to the asset library.
4. Open the export panel: choose a format (GLB / JSON glTF / OBJ) and an engine (Unity / Godot / Unreal), tick colliders, LOD, animation and named anchors, then download a single file or the whole pack.
5. Change your mind or have a question? Use the "AI" panel on the right: ask about modeling knowledge, or say "generate a fantasy dungeon project" and let the workbench build it in place.
6. To use your own models: open "settings", add a model endpoint and its API key. Multiple endpoints can be stored, and the chat then picks from the models you configured.
7. To review with an agent: after it runs `precheck` and `open`, drop pins or paint regions on the mesh surface, then press "hand to the agent".

### 5. Developer integration

#### MCP Server

- What it is: generation and review capabilities for MCP-compatible AI coding assistants, under the service name `org.mutantcat.ai3d`.
- Install: `npx -p "github:Mutantcat-Working-Group/AI3D#v1.0.20260929" ai3d-mcp`.
- Ownership: the `AI3D_OWNER` environment variable or the workspace decides who owns a draft; a second owner asking about the same project receives `RESUME_REQUIRED` until someone makes it clear the review is continuing.
- Tools: `ai3d_generate` (`kind` selects single asset / set / scene / project, with `quality` and `profile`), `ai3d_catalog` (read-only catalog queries), `ai3d_knowledge` (knowledge pack search), plus `precheck`, `open`, `read` and the other review actions.
- Delivery: only a host that can write back to its own session may deliver submissions. `status.notifier` reports the capabilities the host actually provides; when `send` is false, submission batches stay `waiting` (persisted, listable, collected by `read`), which is not a delivery failure.

#### CLI

```sh
npm i -g "github:Mutantcat-Working-Group/AI3D#v1.0.20260929"
ai3d <action> --owner <id> …   # JSON in, JSON out
```

#### OpenClaw extension

```sh
npm run build:integration -- tmp/candidate/package
openclaw plugins install ./tmp/candidate/package
```

#### Web API

The built-in service's HTTP API listens on loopback only by default; LAN mode binds an authenticated private IPv4 and always requires authorization.

#### Build and test from source

```sh
npm ci
npm run samples      # generates the parametric sample models
npm test             # 414 unit and integration tests
npm run test:browser # 94 real-Chromium tests
```

#### Documents

- [AGENT-INTERFACE.md](AGENT-INTERFACE.md) — the interface contract for agent implementations
- [docs/zh/](docs/zh/) — Chinese design documents: positioning, requirements, versioning rules, roadmap
- [简体中文 README](README.md) — Chinese project description

### 6. Progress

A plan is not a promise: order may shift in use. Ideas and requests are welcome in [Discussions](https://github.com/Mutantcat-Working-Group/AI3D/discussions).

- [X] 102 asset templates and a deterministic generator
- [X] Engine pack exports (Unity / Godot / Unreal) with LODs, colliders and animation
- [X] Named parts, attachment points, gameplay and spawn metadata
- [X] Asset set, scene kit and project template generation
- [X] Built-in chat that generates assets, sets, scenes and projects in-app
- [X] Offline modeling knowledge pack (sourced and licensed, shared by chat and MCP)
- [X] Three entries on one implementation: MCP Server, OpenClaw extension, CLI
- [X] Review loop with agents (pins, paint bucket, precheck / open)
- [X] Tauri desktop client (Windows / macOS / Linux) with watchdog
- [X] Six-language interface (Simplified Chinese, Traditional Chinese, English, Deutsch, Français, 日本語)
- [ ] Model compatibility extensions: Draco / Meshopt / KTX2 compression, glTF with external files, morph targets

[Apache-2.0](LICENSE)

---

STEP support is the only part that is not this project's code. Reading STEP requires evaluating its surfaces, which AI3D does with [occt-import-js](https://github.com/kovacsv/occt-import-js), a WebAssembly build of [Open CASCADE Technology](https://github.com/Open-Cascade-SAS/OCCT). Both are **LGPL-2.1** and are kept as-is. AI3D's own code remains Apache-2.0.
