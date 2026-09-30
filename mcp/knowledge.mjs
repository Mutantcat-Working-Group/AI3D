#!/usr/bin/env node
// AI3D knowledge pack: 3D asset production references and public white-model
// sources, deliberately factual and licence-tagged. Nothing third-party is
// copied into this repository: every entry is a citation with a URL, a licence
// and a short summary written for this project, so the pack stays small,
// auditable and safe to ship in an offline installer.
//
// The pack is served both directly by the AI3D UI and over MCP, so the two
// surfaces cannot drift apart.

export const KNOWLEDGE_VERSION = "2026-09-30";

/* Each entry is intentionally small. `tags` is the search vocabulary; `facts`
   are the statements a caller is allowed to quote without re-reading upstream
   documentation; `relatedAssets` maps the entry to AI3D templates so a chat
   answer can point at something in the generator rather than staying abstract. */
export const KNOWLEDGE_ENTRIES = [
  {
    id: "gltf-2-spec",
    kind: "standard",
    title: "glTF 2.0 specification",
    titleZh: "glTF 2.0 规范",
    source: "Khronos Group",
    url: "https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html",
    license: "Khronos specification, royalty-free",
    updated: "2026-09-30",
    tags: [
      "gltf",
      "glb",
      "format",
      "interchange",
      "pbr",
      "engine",
      "格式",
      "交换格式",
      "游戏引擎",
    ],
    facts: [
      "glTF 2.0 is a royalty-free runtime asset format with a JSON scene description and external or embedded binary buffers.",
      "GLB is the single-file container form; `.gltf` plus external resources is the split form.",
      "Materials use the metallic-roughness PBR model by default, so a mesh without PBR maps still has defined metallic and roughness values.",
      "The scene graph is node based; a node can carry a mesh, a transform and a skin, which is why an exporter should preserve node names for engines.",
    ],
    guidance: [
      "Export GLB when the pipeline wants one file; export `.gltf` when a tool needs to inspect or patch the scene JSON.",
      "Keep node and material names stable between versions so engine-side overrides keep binding to the same asset.",
    ],
    relatedAssets: ["character", "dragon", "chest", "turret"],
  },
  {
    id: "gltf-sample-assets",
    kind: "assets",
    title: "Khronos glTF Sample Assets",
    titleZh: "Khronos glTF 示例资产库",
    source: "Khronos Group",
    url: "https://github.com/KhronosGroup/glTF-Sample-Assets",
    license: "Mixed; each model states its own licence (CC0, CC-BY and others)",
    updated: "2026-09-30",
    tags: [
      "gltf",
      "sample",
      "white model",
      "reference",
      "test asset",
      "白模",
      "参考",
      "测试模型",
    ],
    facts: [
      "The repository is the canonical conformance corpus for glTF viewers and exporters.",
      "It covers the cases that break naive loaders: Draco and Meshopt compression, KTX2 textures, morph targets, skins, animation and multiple scenes.",
      "Licences differ per model, so a model must be checked before redistribution.",
    ],
    guidance: [
      "Use these assets to test an importer or viewer, not as a bundled art library.",
      "When a generated asset misbehaves in an engine, compare against the closest sample here before changing the generator.",
    ],
    relatedAssets: ["character", "dragon", "car"],
  },
  {
    id: "blender-manual-modeling",
    kind: "craft",
    title: "Blender manual: modeling and topology",
    titleZh: "Blender 手册：建模与拓扑",
    source: "Blender Foundation",
    url: "https://docs.blender.org/manual/en/latest/modeling/index.html",
    license: "CC-BY-SA 4.0 documentation; Blender itself is GPL",
    updated: "2026-09-30",
    tags: [
      "blender",
      "modeling",
      "topology",
      "retopology",
      "quad",
      "n-gon",
      "workflow",
      "建模",
      "拓扑",
      "重拓扑",
      "四边面",
      "工作流",
    ],
    facts: [
      "Quad-dominant topology deforms predictably; triangles and n-gons are useful for shapes that will not deform.",
      "A manifold mesh with consistent normals avoids most lighting, collision and slicing artefacts.",
      "Modelling at the intended scale matters because physics, light falloff and LOD thresholds all assume real units.",
    ],
    guidance: [
      "Build the silhouette first, then add supporting loops near edges that must hold a crease.",
      "Keep geometry that will deform in even quads; reserve triangles for hard-surface details and the final export.",
    ],
    relatedAssets: ["character", "monster", "sword", "shield"],
  },
  {
    id: "game-asset-budgets",
    kind: "craft",
    title: "Game asset budgets and LOD practice",
    titleZh: "游戏资产预算与 LOD 实践",
    source: "AI3D engineering notes, synthesised from public engine guidance",
    url: "https://github.com/Mutantcat-Working-Group/AI3D",
    license: "Apache-2.0",
    updated: "2026-09-30",
    tags: [
      "budget",
      "lod",
      "draw call",
      "triangle",
      "optimization",
      "performance",
      "预算",
      "三角面",
      "绘制调用",
      "优化",
      "性能",
    ],
    facts: [
      "Hero props are usually measured in tens of thousands of triangles; background props in hundreds to low thousands.",
      "Draw calls are usually a tighter constraint than raw triangle count on mobile and XR targets.",
      "A three-level LOD chain at roughly 100%, 50% and 25% of source triangles covers most real-time cases.",
      "Merging same-material sub-meshes removes draw calls without changing silhouette, which is why AI3D merges on simplification.",
    ],
    guidance: [
      "Decide the target platform before choosing a budget; a desktop hero asset and a mobile prop cannot share one number.",
      "Check the reported triangle, vertex, part and draw-call counts in the export panel before saving a variant.",
    ],
    relatedAssets: ["turret", "drone", "antenna", "potion", "barrel"],
  },
  {
    id: "pbr-texturing",
    kind: "craft",
    title: "PBR material authoring",
    titleZh: "PBR 材质制作",
    source:
      "AI3D engineering notes, synthesised from public rendering guidance",
    url: "https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html",
    license: "Apache-2.0 notes, citing Khronos documentation",
    updated: "2026-09-30",
    tags: [
      "pbr",
      "material",
      "texture",
      "roughness",
      "metalness",
      "emissive",
      "材质",
      "贴图",
      "粗糙度",
      "金属度",
      "自发光",
    ],
    facts: [
      "Base colour holds albedo with no baked lighting; metallic and roughness are separate scalar or texture inputs.",
      "Metalness should be close to 0 or 1 for real materials; intermediate values are for blends and wear layers.",
      "Emissive colour is added after lighting, so it needs an emissive strength or bloom pass to read as a glow.",
    ],
    guidance: [
      "Preview materials under the target engine's lighting rather than in isolation.",
      "Keep one texel density across an asset set so kits do not look assembled from different games.",
    ],
    relatedAssets: ["campfire", "torch", "crystal", "gem", "runestone"],
  },
  {
    id: "poly-haven",
    kind: "library",
    title: "Poly Haven",
    titleZh: "Poly Haven 公共素材库",
    source: "Poly Haven",
    url: "https://polyhaven.com/",
    license: "CC0 for published assets; see https://polyhaven.com/license",
    updated: "2026-09-30",
    tags: [
      "cc0",
      "public domain",
      "hdri",
      "texture",
      "model",
      "reference",
      "白模",
      "公共素材",
      "参考",
    ],
    facts: [
      "Poly Haven publishes HDRIs, textures and models under CC0, allowing commercial use without attribution.",
      "The libraries are useful for lighting and material reference even when no model is downloaded.",
    ],
    guidance: [
      "Use a matching HDRI from this library when judging a generated PBR material.",
      "CC0 removes attribution requirements but recording the source still helps reproducibility.",
    ],
    relatedAssets: [],
  },
  {
    id: "kenney",
    kind: "library",
    title: "Kenney game assets",
    titleZh: "Kenney 游戏素材库",
    source: "Kenney",
    url: "https://kenney.nl/assets",
    license: "CC0 1.0 for the published asset packs",
    updated: "2026-09-30",
    tags: [
      "cc0",
      "public domain",
      "low poly",
      "game kit",
      "prototype",
      "白模",
      "低模",
      "游戏素材",
      "原型",
    ],
    facts: [
      "Kenney's packs are CC0 game-ready kits covering props, buildings, characters and UI.",
      "The consistent scale and naming make the packs useful as a style and budget baseline for prototypes.",
    ],
    guidance: [
      "Compare a generated kit against a CC0 kit at the same scale before deciding it is production-ready.",
      "Treat the packs as reference or placeholder art unless the project deliberately adopts that art style.",
    ],
    relatedAssets: ["crate", "barrel", "house", "tower", "tent"],
  },
  {
    id: "nasa-3d-resources",
    kind: "library",
    title: "NASA 3D Resources",
    titleZh: "NASA 3D 资源库",
    source: "NASA",
    url: "https://science.nasa.gov/3d-resources/",
    license: "Generally public domain as US government work; verify per item",
    updated: "2026-09-30",
    tags: [
      "public domain",
      "nasa",
      "spacecraft",
      "hard surface",
      "reference",
      "白模",
      "航天器",
      "硬表面",
      "参考",
    ],
    facts: [
      "NASA publishes spacecraft, probe and terrain models for education and visualisation.",
      "Hard-surface references are useful for studying panel breaks, greebles and silhouette at real scale.",
    ],
    guidance: [
      "Check each asset's page for third-party credits before redistribution.",
      "Use the real dimensions on the asset page to sanity-check the scale of a generated vehicle or turret.",
    ],
    relatedAssets: ["turret", "drone", "antenna", "plane"],
  },
  {
    id: "engine-import-conventions",
    kind: "pipeline",
    title: "Unity, Godot and Unreal import conventions",
    titleZh: "Unity、Godot、Unreal 导入约定",
    source:
      "AI3D engineering notes, citing the three engines' public documentation",
    url: "https://github.com/Mutantcat-Working-Group/AI3D",
    license: "Apache-2.0",
    updated: "2026-09-30",
    tags: [
      "unity",
      "godot",
      "unreal",
      "import",
      "pipeline",
      "naming",
      "导入",
      "管线",
      "命名",
    ],
    facts: [
      "Unity imports a `.glb` as a model asset; prefabs and `.meta` files are produced by Unity, not by an external exporter.",
      "Godot imports a `.glb` under `res://` and a `.tscn` can instance it directly.",
      "Unreal imports a `.glb` through Interchange or the glTF importer; `.uasset` files are Unreal's own cooked form.",
      "All three engines care about units, up-axis and node names more than about the container extension.",
    ],
    guidance: [
      "Ship GLB plus a manifest when the target engine owns its own prefab or asset format.",
      "Keep +Y up for GLB and state the intended scale in the manifest.",
    ],
    relatedAssets: ["house", "tower", "bridge", "fountain", "statue"],
  },
  {
    id: "quaternius",
    kind: "library",
    title: "Quaternius CC0 model packs",
    titleZh: "Quaternius CC0 模型包",
    source: "Quaternius",
    url: "https://quaternius.com/",
    license: "CC0 1.0 for the published packs",
    updated: "2026-09-30",
    tags: [
      "cc0",
      "public domain",
      "base mesh",
      "white model",
      "low poly",
      "character",
      "白模",
      "基础网格",
      "低模",
      "角色",
      "公共素材",
    ],
    facts: [
      "Quaternius publishes low-poly character, creature and prop packs under CC0, so they can be used commercially without attribution.",
      "The packs ship in several engine-ready formats, which makes them directly comparable with an AI3D export.",
      "Scale and naming are consistent inside a pack, so the pack doubles as a budget and silhouette reference for a whole set.",
    ],
    guidance: [
      "Use a pack character as the scale reference when an AI3D character reads too small or too large in an engine.",
      "Because the licence is CC0, a pack works as placeholder art while a generated asset is still being iterated.",
    ],
    relatedAssets: ["character", "monster", "crate", "barrel"],
  },
  {
    id: "poly-pizza",
    kind: "library",
    title: "Poly Pizza model archive",
    titleZh: "Poly Pizza 模型库",
    source: "Poly Pizza",
    url: "https://poly.pizza/",
    license:
      "Each model states its own licence, usually CC0 or CC-BY; see the model page",
    updated: "2026-09-30",
    tags: [
      "cc0",
      "creative commons",
      "low poly",
      "base mesh",
      "white model",
      "archive",
      "白模",
      "低模",
      "模型库",
      "公共素材",
    ],
    facts: [
      "Poly Pizza hosts the archived Google Poly library plus community uploads, and the search can be filtered by licence.",
      "Low-poly meshes here are a useful proportion and silhouette reference because many share one stylised density.",
      "Licences differ per model, so a CC0 filter is the safe route when attribution must be avoided.",
    ],
    guidance: [
      "Filter to CC0 before downloading when the model may end up in a shipped build.",
      "Treat an archive model as a reference or placeholder; re-check its licence if the project later redistributes it.",
    ],
    relatedAssets: ["tree", "rock", "house", "crate"],
  },
  {
    id: "wikimedia-commons-3d",
    kind: "library",
    title: "Wikimedia Commons 3D models",
    titleZh: "维基共享资源 3D 模型",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/Category:3D_models",
    license: "Per file: usually CC0, CC-BY or public domain",
    updated: "2026-09-30",
    tags: [
      "public domain",
      "cc0",
      "scan",
      "museum",
      "statue",
      "reference",
      "白模",
      "扫描模型",
      "公有领域",
      "文物",
      "参考",
    ],
    facts: [
      "Commons hosts STL and glTF models, including museum scans and public-domain objects.",
      "The licence belongs to each file page rather than to the category, so every model has to be checked before use.",
      "Scanned meshes carry real proportions, which makes them a good check on a hand-built or generated silhouette.",
    ],
    guidance: [
      "Use a scanned object here as a proportion reference for props such as statues, vessels and pillars.",
      "Record the file page URL even when the licence asks for no attribution, so the source stays traceable.",
    ],
    relatedAssets: ["statue", "pillar", "well", "fountain"],
  },
  {
    id: "sketchfab-cc0",
    kind: "library",
    title: "Sketchfab downloadable CC0 models",
    titleZh: "Sketchfab 可下载 CC0 模型",
    source: "Sketchfab",
    url: "https://sketchfab.com/search?features=downloadable&licenses=322a749bcfa841b29dff1e8a1bb74b0b",
    license: "CC0 filter; every result keeps its own page-level licence",
    updated: "2026-09-30",
    tags: [
      "cc0",
      "public domain",
      "downloadable",
      "scan",
      "base mesh",
      "白模",
      "可下载",
      "扫描模型",
      "公共素材",
    ],
    facts: [
      "Sketchfab labels downloadable models with a licence, and the CC0 filter narrows the catalogue to models that allow commercial use without attribution.",
      "Downloads are often offered as glTF, so a model enters the same pipeline as an AI3D GLB export.",
      "Uploads are user generated; quality, scale and topology vary, so each model needs its own check.",
    ],
    guidance: [
      "Prefer a downloadable CC0 model when a generated asset needs a real-world shape reference.",
      "Re-check the licence on the model page; a search filter is not a licence and an author can change it.",
    ],
    relatedAssets: ["turret", "drone", "boat", "plane"],
  },
  {
    id: "makehuman",
    kind: "library",
    title: "MakeHuman base meshes",
    titleZh: "MakeHuman 人体白模",
    source: "MakeHuman Community",
    url: "https://static.makehumancommunity.org/",
    license: "MakeHuman assets are CC0; the application itself is AGPL-3.0",
    updated: "2026-09-30",
    tags: [
      "cc0",
      "base mesh",
      "white model",
      "human",
      "character",
      "rig",
      "白模",
      "人体",
      "基础网格",
      "角色",
      "骨骼",
    ],
    facts: [
      "MakeHuman generates a rigged human base mesh from parameters such as height, build and proportions.",
      "The exported base mesh is CC0, so it can serve as a white model even when the character is reworked later.",
      "It ships with a standard skeleton, which gives a reference for joint placement and skinning density.",
    ],
    guidance: [
      "Start from a MakeHuman base when a character needs believable human proportions before sculpting or retopology.",
      "Check the topology before adopting it directly; a game mesh still needs the quad flow and budget the target engine wants.",
    ],
    relatedAssets: ["character", "monster"],
  },
  {
    id: "z-anatomy",
    kind: "library",
    title: "Z-Anatomy open anatomy atlas",
    titleZh: "Z-Anatomy 开放解剖图谱",
    source: "Z-Anatomy",
    url: "https://www.z-anatomy.com/",
    license: "CC BY-SA 4.0, built on BodyParts3D data",
    updated: "2026-09-30",
    tags: [
      "anatomy",
      "human",
      "reference",
      "muscle",
      "bone",
      "open source",
      "解剖",
      "人体",
      "参考",
      "肌肉",
      "骨骼",
    ],
    facts: [
      "Z-Anatomy is an open-source 3D anatomy atlas built from BodyParts3D-derived meshes.",
      "The meshes are regional and labelled, which makes them a reference for where muscle and bone landmarks sit.",
      "Share-alike applies: a distributed derivative has to keep the same licence and attribution.",
    ],
    guidance: [
      "Use it to sanity-check anatomy landmarks under a stylised creature or character.",
      "Keep the anatomy meshes as reference rather than shipping them inside an asset that cannot carry the share-alike terms.",
    ],
    relatedAssets: ["character", "monster", "dragon"],
  },
  {
    id: "retopology-quad-flow",
    kind: "craft",
    title: "Retopology and deformable quad flow",
    titleZh: "重拓扑与可形变四边面布线",
    source: "Blender manual: retopology, synthesised into AI3D guidance",
    url: "https://docs.blender.org/manual/en/latest/modeling/meshes/retopology.html",
    license: "CC-BY-SA 4.0 documentation; guidance text is Apache-2.0",
    updated: "2026-09-30",
    tags: [
      "retopology",
      "topology",
      "quad",
      "edge flow",
      "deform",
      "rig",
      "game mesh",
      "重拓扑",
      "拓扑",
      "四边面",
      "布线",
      "形变",
      "骨骼",
    ],
    facts: [
      "Retopology rebuilds a dense or scanned surface as a controlled mesh that follows the intended shape instead of the scan's noise.",
      "Edge loops should follow the direction the surface deforms: around a shoulder, along a limb and around an eye socket.",
      "A game mesh keeps enough loops to hold the silhouette and the deformation, then spends the rest of the budget on details that do not deform.",
    ],
    guidance: [
      "Block the big forms first, then place loops around joints and features that have to bend or crease.",
      "Stop retopologising once the loops support the deformation; density past that point only raises the budget.",
    ],
    relatedAssets: ["character", "monster", "dragon"],
  },
  {
    id: "uv-unwrapping-texel-density",
    kind: "craft",
    title: "UV unwrapping and texel density",
    titleZh: "UV 展开与像素密度",
    source: "Blender manual: UV unwrapping, synthesised into AI3D guidance",
    url: "https://docs.blender.org/manual/en/latest/modeling/meshes/uv/unwrapping/index.html",
    license: "CC-BY-SA 4.0 documentation; guidance text is Apache-2.0",
    updated: "2026-09-30",
    tags: [
      "uv",
      "unwrap",
      "seam",
      "packing",
      "texel density",
      "lightmap",
      "uv",
      "展开",
      "接缝",
      "排布",
      "像素密度",
      "光照贴图",
    ],
    facts: [
      "A UV layout puts every face on the texture without overlap, and seams belong where the surface can hide the discontinuity or is cut anyway.",
      "Texel density is the number of texels per world unit; one density across a set stops assets from looking scaled differently.",
      "A second, non-overlapping UV channel is what a baked lightmap uses, so it needs margin between the islands.",
    ],
    guidance: [
      "Cut on existing hard edges or hidden faces before cutting across a surface that is meant to read as continuous.",
      "Set the density before packing the islands; re-packing after the shells are used for a bake only forces a second bake.",
    ],
    relatedAssets: ["crate", "barrel", "house", "tower"],
  },
  {
    id: "sculpt-bake-normal-maps",
    kind: "craft",
    title: "High-to-low baking and normal maps",
    titleZh: "高低模烘焙与法线贴图",
    source:
      "Blender manual: sculpting and Cycles baking, synthesised into AI3D guidance",
    url: "https://docs.blender.org/manual/en/latest/render/cycles/baking.html",
    license: "CC-BY-SA 4.0 documentation; guidance text is Apache-2.0",
    updated: "2026-09-30",
    tags: [
      "sculpt",
      "bake",
      "normal map",
      "high poly",
      "low poly",
      "detail",
      "雕刻",
      "烘焙",
      "法线贴图",
      "高模",
      "低模",
      "细节",
    ],
    facts: [
      "The high-to-low workflow builds the form at high density, then projects that detail onto a low-poly surface as a normal map.",
      "Tangent-space normal maps follow the low-poly UVs and keep working through deformation; object-space maps cannot be reused on a different mesh.",
      "The cage and the ray distance decide which surface the bake hits, and a cage that is too tight or too loose produces seams and missed detail.",
    ],
    guidance: [
      "Bake the surface detail and keep the silhouette in the mesh; a normal map cannot add outline.",
      "Check the bake on a lit turntable before importing; a map that only reads from one angle hides a projection problem.",
    ],
    relatedAssets: ["statue", "rock", "monster", "dragon"],
  },
  {
    id: "hard-surface-modeling",
    kind: "craft",
    title: "Hard-surface modelling: bevels and panel breaks",
    titleZh: "硬表面建模：倒角与结构分缝",
    source: "Blender manual: bevel tools, synthesised into AI3D guidance",
    url: "https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/bevel.html",
    license: "CC-BY-SA 4.0 documentation; guidance text is Apache-2.0",
    updated: "2026-09-30",
    tags: [
      "hard surface",
      "bevel",
      "chamfer",
      "boolean",
      "panel",
      "greeble",
      "硬表面",
      "倒角",
      "布尔",
      "分缝",
      "结构",
    ],
    facts: [
      "A real edge catches light, so a hard-surface asset reads correctly when the bevel is authored rather than faked in a shader.",
      "A bevel should stay even along an edge; an uneven bevel shows up as a scalloped highlight once the surface is shaded.",
      "Boolean cuts are quick for blocking, but the surrounding topology needs cleaning before the result is shaded or exported.",
    ],
    guidance: [
      "Block with primitives and booleans, then bevel and clean the edges that read from the target camera distance.",
      "Match the bevel width to the asset scale; a 5 mm chamfer is invisible on a building and enormous on a held prop.",
    ],
    relatedAssets: ["turret", "drone", "antenna", "plane"],
  },
  {
    id: "virtualized-geometry-lod",
    kind: "pipeline",
    title: "Virtualized geometry and LOD chains",
    titleZh: "虚拟几何体与 LOD 链",
    source: "Epic Games documentation: Nanite, synthesised into AI3D guidance",
    url: "https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine",
    license: "Epic Games Unreal Engine documentation, cited not redistributed",
    updated: "2026-09-30",
    tags: [
      "lod",
      "nanite",
      "virtualized geometry",
      "budget",
      "streaming",
      "optimization",
      "lod",
      "虚拟几何体",
      "预算",
      "流式加载",
      "优化",
    ],
    facts: [
      "Virtualized geometry renders a mesh as clusters and picks the detail level per screen area, which removes the need for a hand-authored LOD chain on supported hardware.",
      "It still costs disk and memory, so a dense mesh needs its own budget instead of unlimited triangles.",
      "On platforms without the feature, and in every rasterizer that does not implement it, an explicit LOD chain remains the portable fallback.",
    ],
    guidance: [
      "Decide per target platform whether to ship a dense mesh plus the feature or a simplified mesh with an explicit LOD chain.",
      "Check the AI3D-reported triangle, vertex and draw-call counts against the platform budget before saving a variant.",
    ],
    relatedAssets: ["turret", "drone", "house", "tower"],
  },
];

const ENTRY_BY_ID = new Map(
  KNOWLEDGE_ENTRIES.map((entry) => [entry.id, entry]),
);

function terms(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 0)
    .slice(0, 16);
}

function searchable(entry) {
  return [
    entry.id,
    entry.title,
    entry.titleZh,
    entry.source,
    entry.license,
    ...entry.tags,
    ...entry.facts,
    ...entry.guidance,
    ...entry.relatedAssets,
  ]
    .join(" ")
    .toLowerCase();
}

/* A deterministic offline ranker. It is deliberately simple: the pack is small,
   so a term-overlap score with a title boost is easier to audit than an index
   that has to be rebuilt every release. */
export function searchKnowledge(query, { limit = 5, tags = [] } = {}) {
  const wanted = [...terms(query), ...tags.flatMap((tag) => terms(tag))];
  const capped = Math.max(1, Math.min(Number(limit) || 5, 20));
  const scored = KNOWLEDGE_ENTRIES.map((entry) => {
    const haystack = searchable(entry);
    const title =
      `${entry.title} ${entry.titleZh} ${entry.tags.join(" ")}`.toLowerCase();
    let score = 0;
    for (const term of wanted) {
      if (!term) continue;
      if (title.includes(term)) score += 4;
      if (haystack.includes(term)) score += 1;
    }
    if (wanted.length === 0) score = entry.kind === "craft" ? 2 : 1;
    return { entry, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, capped);
  return {
    version: KNOWLEDGE_VERSION,
    query: String(query || ""),
    count: scored.length,
    results: scored.map(({ entry, score }) => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      titleZh: entry.titleZh,
      source: entry.source,
      url: entry.url,
      license: entry.license,
      updated: entry.updated,
      tags: entry.tags,
      score,
    })),
  };
}

export function getKnowledge(id) {
  const entry = ENTRY_BY_ID.get(String(id || ""));
  if (!entry) return null;
  return { version: KNOWLEDGE_VERSION, entry };
}

export function listKnowledge() {
  return {
    version: KNOWLEDGE_VERSION,
    count: KNOWLEDGE_ENTRIES.length,
    entries: KNOWLEDGE_ENTRIES.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      titleZh: entry.titleZh,
      source: entry.source,
      url: entry.url,
      license: entry.license,
      updated: entry.updated,
      tags: entry.tags,
    })),
  };
}

export const KNOWLEDGE_TOOL = {
  name: "ai3d_knowledge",
  description:
    "Search AI3D's offline 3D production knowledge pack and return cited entries. Use it before answering questions about glTF/GLB formats, base meshes and public white models, retopology and quad flow, UV unwrapping and texel density, high-to-low baking and normal maps, hard-surface bevels, game asset budgets and LOD, PBR authoring, or engine import conventions. Every result carries a source URL and licence; quote the entry facts rather than inventing details.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "What to look up, for example 'LOD budget' or 'glTF node names'.",
      },
      id: {
        type: "string",
        description: "Return one entry by its exact id instead of searching.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Optional tag filters such as 'cc0' or '建模'.",
      },
      limit: { type: "integer", minimum: 1, maximum: 20 },
      mode: {
        type: "string",
        enum: ["search", "get", "list"],
        description: "search (default), get one entry, or list the pack.",
      },
    },
  },
};

export function callKnowledgeTool(args = {}) {
  const mode = args.mode || (args.id ? "get" : "search");
  if (mode === "list") return listKnowledge();
  if (mode === "get") {
    const result = getKnowledge(args.id);
    if (!result) throw new Error(`Unknown knowledge entry: ${args.id}`);
    return result;
  }
  return searchKnowledge(args.query, {
    limit: args.limit,
    tags: args.tags || [],
  });
}
