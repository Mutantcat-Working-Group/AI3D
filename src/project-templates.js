/* Project templates turn one high-level brief into a game-sized asset plan.
 * They deliberately contain no generation logic: generator-service expands
 * these groups through the existing set and scene pipelines, so a project is
 * only a curated sequence of the same deterministic packs a caller can build
 * one at a time.
 */
export const PROJECT_TEMPLATES = [
  {
    id: "fantasy-dungeon",
    name: "Fantasy Dungeon",
    summary:
      "A modular dungeon kit, treasure and hazard props, enemies, and two complete underground levels.",
    tags: ["fantasy", "dungeon", "adventure", "indoor"],
    style: "lowpoly",
    quality: "audit",
    profile: "balanced",
    aliases: [
      "fantasy dungeon",
      "dungeon game",
      "dungeon project",
      "\u5730\u7262",
      "\u5947\u5e7b\u5730\u7262",
    ],
    assetGroups: [
      {
        id: "dungeon-architecture",
        name: "Dungeon Architecture",
        summary: "Modular walls, floors, doors, stairs and landmark pieces.",
        items: [
          { type: "wall" },
          { type: "wall_corner" },
          { type: "wall_door" },
          { type: "floor" },
          { type: "stairs" },
          { type: "pillar" },
          { type: "arch" },
          { type: "portcullis" },
        ],
      },
      {
        id: "dungeon-props",
        name: "Dungeon Props",
        summary: "Lighting, storage, mechanisms and burial dressing.",
        items: [
          { type: "torch" },
          { type: "brazier" },
          { type: "chest" },
          { type: "barrel" },
          { type: "crate" },
          { type: "cage" },
          { type: "lever" },
          { type: "urn" },
          { type: "stone_coffin" },
        ],
      },
      {
        id: "treasure-and-hazards",
        name: "Treasure and Hazards",
        summary: "Loot, magic switches, traps and environmental danger.",
        items: [
          { type: "key" },
          { type: "gem" },
          { type: "coin_pile" },
          { type: "trap" },
          { type: "cobweb" },
          { type: "bone_pile" },
          { type: "runestone" },
        ],
      },
      {
        id: "dungeon-enemies",
        name: "Dungeon Enemies",
        summary: "The enemy roster that ships with both underground kits.",
        items: [{ type: "skeleton" }, { type: "mummy" }, { type: "monster" }],
      },
    ],
    scenes: [
      {
        id: "main-dungeon",
        name: "Main Dungeon",
        kit: "dungeon",
        summary: "The primary playable dungeon with its default level design.",
      },
      {
        id: "forgotten-temple",
        name: "Forgotten Temple",
        kit: "temple",
        summary: "A second, more ceremonial underground level.",
      },
    ],
  },
  {
    id: "village-adventure",
    name: "Village Adventure",
    summary:
      "A village construction kit, provisions and characters, with a village and town level to explore.",
    tags: ["fantasy", "village", "town", "adventure", "outdoor"],
    style: "stylized",
    quality: "audit",
    profile: "balanced",
    aliases: [
      "village adventure",
      "village game",
      "town adventure",
      "\u6751\u5e84\u5192\u9669",
      "\u6751\u9547\u5192\u9669",
    ],
    assetGroups: [
      {
        id: "village-architecture",
        name: "Village Architecture",
        summary: "Houses, modular structures, roads and town boundaries.",
        items: [
          { type: "house" },
          { type: "wall" },
          { type: "wall_window" },
          { type: "wall_door" },
          { type: "floor" },
          { type: "stairs" },
          { type: "fence" },
          { type: "gate" },
          { type: "bridge" },
          { type: "tower" },
        ],
      },
      {
        id: "village-props",
        name: "Village Props",
        summary:
          "The public landmarks and street furniture that make a town read.",
        items: [
          { type: "well" },
          { type: "windmill" },
          { type: "bench" },
          { type: "sign" },
          { type: "lantern" },
          { type: "wagon" },
          { type: "flag" },
        ],
      },
      {
        id: "provisions",
        name: "Provisions",
        summary:
          "Food, farm resources and the containers a village economy needs.",
        items: [
          { type: "bread" },
          { type: "pie" },
          { type: "meat_leg" },
          { type: "hay_bale" },
          { type: "wheat_sheaf" },
          { type: "bucket" },
          { type: "rope_coil" },
          { type: "beehive" },
          { type: "berry_bush" },
        ],
      },
      {
        id: "village-cast",
        name: "Village Cast",
        summary: "Residents and the creatures that threaten the settlement.",
        items: [
          { type: "character" },
          { type: "monster" },
          { type: "skeleton" },
        ],
      },
    ],
    scenes: [
      {
        id: "village-center",
        name: "Village Center",
        kit: "village",
        summary: "The main settlement hub and its default objectives.",
      },
      {
        id: "market-town",
        name: "Market Town",
        kit: "town",
        summary: "A denser town level for quests and commerce.",
      },
    ],
  },
  {
    id: "sci-fi-outpost",
    name: "Sci-Fi Outpost",
    summary:
      "A fortified frontier outpost with modular structures, defense systems, energy props and two combat-ready scenes.",
    tags: ["sci-fi", "outpost", "defense", "combat"],
    style: "stylized",
    quality: "audit",
    profile: "desktop",
    aliases: [
      "sci-fi outpost",
      "scifi outpost",
      "science fiction outpost",
      "\u79d1\u5e7b\u524d\u54e8",
      "\u79d1\u5e7b\u57fa\u5730",
    ],
    assetGroups: [
      {
        id: "outpost-structures",
        name: "Outpost Structures",
        summary: "Modular buildings, antennas, towers and connecting paths.",
        items: [
          { type: "turret" },
          { type: "antenna" },
          { type: "tower" },
          { type: "wall" },
          { type: "wall_window" },
          { type: "wall_door" },
          { type: "floor" },
          { type: "stairs" },
          { type: "pillar" },
          { type: "bridge" },
        ],
      },
      {
        id: "outpost-equipment",
        name: "Outpost Equipment",
        summary: "Defense hardware, utility props and field equipment.",
        items: [
          { type: "drone" },
          { type: "cannon" },
          { type: "barrel" },
          { type: "crate" },
          { type: "lantern" },
          { type: "ladder" },
          { type: "gate" },
          { type: "fence" },
        ],
      },
      {
        id: "energy-systems",
        name: "Energy Systems",
        summary:
          "Interactive energy sources and the props that power the base.",
        items: [
          { type: "crystal" },
          { type: "gem" },
          { type: "runestone" },
          { type: "torch" },
          { type: "brazier" },
        ],
      },
      {
        id: "hostile-forces",
        name: "Hostile Forces",
        summary: "A compact enemy roster for defense encounters.",
        items: [{ type: "monster" }, { type: "character" }, { type: "drone" }],
      },
    ],
    scenes: [
      {
        id: "frontier-outpost",
        name: "Frontier Outpost",
        kit: "outpost",
        summary: "The main fortified base layout.",
      },
      {
        id: "defense-battle",
        name: "Defense Battle",
        kit: "battle",
        summary: "A combat scenario staged around the outpost assets.",
      },
    ],
  },
  {
    id: "wilderness-survival",
    name: "Wilderness Survival",
    summary:
      "A natural terrain kit, camp supplies, survival tools and creatures, with wilderness and camp levels.",
    tags: ["wilderness", "survival", "outdoor", "camp"],
    style: "lowpoly",
    quality: "audit",
    profile: "mobile",
    aliases: [
      "wilderness survival",
      "survival game",
      "survival camp",
      "\u8352\u91ce\u751f\u5b58",
      "\u751f\u5b58\u8425\u5730",
    ],
    assetGroups: [
      {
        id: "terrain",
        name: "Terrain",
        summary: "Trees, rocks and collectible natural resources.",
        items: [
          { type: "tree" },
          { type: "tree_stump" },
          { type: "rock" },
          { type: "mushroom" },
          { type: "crystal" },
          { type: "berry_bush" },
        ],
      },
      {
        id: "survival-camp",
        name: "Survival Camp",
        summary: "Shelter, fire, storage and the basics of a field camp.",
        items: [
          { type: "tent" },
          { type: "campfire" },
          { type: "hay_bale" },
          { type: "barrel" },
          { type: "crate" },
          { type: "bench" },
          { type: "sign" },
          { type: "lantern" },
        ],
      },
      {
        id: "survival-tools",
        name: "Survival Tools",
        summary: "Weapons, gathering tools and useful field items.",
        items: [
          { type: "axe" },
          { type: "bow" },
          { type: "spear" },
          { type: "rope_coil" },
          { type: "bucket" },
          { type: "key" },
        ],
      },
      {
        id: "wildlife-and-threats",
        name: "Wildlife and Threats",
        summary: "Creatures that populate or endanger the survival map.",
        items: [
          { type: "monster" },
          { type: "dragon" },
          { type: "skeleton" },
          { type: "character" },
        ],
      },
    ],
    scenes: [
      {
        id: "wilderness-area",
        name: "Wilderness Area",
        kit: "wilderness",
        summary: "The primary explorable wilderness level.",
      },
      {
        id: "survival-camp",
        name: "Survival Camp",
        kit: "camp",
        summary: "A smaller base camp level for the opening loop.",
      },
    ],
  },
  {
    id: "prototype-starter",
    name: "Prototype Starter",
    summary:
      "A compact vertical slice with core props, two characters and one playable camp level for fast iteration.",
    tags: ["prototype", "starter", "vertical-slice", "camp"],
    style: "lowpoly",
    quality: "audit",
    profile: "mobile",
    aliases: [
      "prototype starter",
      "vertical slice",
      "starter project",
      "\u5feb\u901f\u539f\u578b",
      "\u539f\u578b\u9879\u76ee",
    ],
    assetGroups: [
      {
        id: "prototype-props",
        name: "Prototype Props",
        summary: "The first interactive props every vertical slice needs.",
        items: [{ type: "crate" }, { type: "barrel" }, { type: "torch" }],
      },
      {
        id: "prototype-actors",
        name: "Prototype Actors",
        summary: "A player stand-in and one enemy for the first encounter.",
        items: [{ type: "character" }, { type: "monster" }],
      },
    ],
    scenes: [
      {
        id: "prototype-camp",
        name: "Prototype Camp",
        kit: "camp",
        summary: "A small playable camp level for the first build.",
      },
    ],
  },
];

export function findProjectTemplate(value) {
  const id = String(value || "")
    .trim()
    .toLowerCase();
  if (!id) return null;
  return (
    PROJECT_TEMPLATES.find(
      (template) => template.id === id || template.name.toLowerCase() === id,
    ) || null
  );
}

export function matchProjectTemplate(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) return null;
  const terms = PROJECT_TEMPLATES.flatMap((template) =>
    [template.id, template.name, ...template.aliases].map((term) => ({
      template,
      term: String(term).toLowerCase(),
    })),
  ).sort((a, b) => b.term.length - a.term.length);
  return terms.find((entry) => text.includes(entry.term))?.template || null;
}
