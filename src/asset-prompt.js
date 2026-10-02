/* Turning a sentence into generation parameters is the difference between a
 * generator and a dice roll. A reviewer types "a red low-poly sword 1.5 m" and
 * expects a sword, not a cube, and expects the colour they named. The rules
 * live here rather than in the panel so they can be exercised without a
 * browser, and they read their vocabulary from the interface catalogue so a
 * German or Japanese description resolves exactly as well as an English one.
 *
 * The module deliberately knows nothing about the DOM and nothing about which
 * locale is active: the caller hands it every catalogue and the matching is
 * language-agnostic.
 */

/* Catalogue keys are the contract between this table and the translators.
 * Every name is the suffix of a `gen.*` key; the asset keys are the ones the
 * quick-template chips already use. */
export const GEN_TYPE_KEYS = {
  cube: "gen.type.cube",
  sword: "gen.type.sword",
  tree: "gen.type.tree",
  rock: "gen.type.rock",
  house: "gen.type.house",
  car: "gen.type.car",
  character: "gen.type.character",
  shield: "gen.type.shield",
  potion: "gen.type.potion",
  chest: "gen.type.chest",
  key: "gen.type.key",
  gem: "gen.type.gem",
  barrel: "gen.type.barrel",
  crate: "gen.type.crate",
  tower: "gen.type.tower",
  flag: "gen.type.flag",
  torch: "gen.type.torch",
  fence: "gen.type.fence",
  bridge: "gen.type.bridge",
  gate: "gen.type.gate",
  wagon: "gen.type.wagon",
  cannon: "gen.type.cannon",
  grave: "gen.type.grave",
  ladder: "gen.type.ladder",
  candelabra: "gen.type.candelabra",
  anvil: "gen.type.anvil",
  bookshelf: "gen.type.bookshelf",
  cauldron: "gen.type.cauldron",
  throne: "gen.type.throne",
  bench: "gen.type.bench",
  lantern: "gen.type.lantern",
  table: "gen.type.table",
  chair: "gen.type.chair",
  bed: "gen.type.bed",
  chandelier: "gen.type.chandelier",
  armor_stand: "gen.type.armorStand",
  skeleton: "gen.type.skeleton",
  bread: "gen.type.bread",
  pie: "gen.type.pie",
  meat_leg: "gen.type.meatLeg",
  hay_bale: "gen.type.hayBale",
  rope_coil: "gen.type.ropeCoil",
  bucket: "gen.type.bucket",
  windmill: "gen.type.windmill",
  coin_pile: "gen.type.coinPile",
  minecart: "gen.type.minecart",
  berry_bush: "gen.type.berryBush",
  stone_coffin: "gen.type.stoneCoffin",
  portcullis: "gen.type.portcullis",
  cage: "gen.type.cage",
  bone_pile: "gen.type.bonePile",
  cobweb: "gen.type.cobweb",
  lever: "gen.type.lever",
  urn: "gen.type.urn",
  mummy: "gen.type.mummy",
  beehive: "gen.type.beehive",
  wheat_sheaf: "gen.type.wheatSheaf",
  fountain: "gen.type.fountain",
  brazier: "gen.type.brazier",
  runestone: "gen.type.runestone",
  trap: "gen.type.trap",
  turret: "gen.type.turret",
  drone: "gen.type.drone",
  antenna: "gen.type.antenna",
  axe: "gen.type.axe",
  bow: "gen.type.bow",
  hammer: "gen.type.hammer",
  spear: "gen.type.spear",
  dagger: "gen.type.dagger",
  mace: "gen.type.mace",
  staff: "gen.type.staff",
  halberd: "gen.type.halberd",
  helmet: "gen.type.helmet",
  chestplate: "gen.type.chestplate",
  gauntlets: "gen.type.gauntlets",
  boots: "gen.type.boots",
  tent: "gen.type.tent",
  statue: "gen.type.statue",
  pillar: "gen.type.pillar",
  well: "gen.type.well",
  monster: "gen.type.monster",
  dragon: "gen.type.dragon",
  boat: "gen.type.boat",
  plane: "gen.type.plane",
  bike: "gen.type.bike",
  campfire: "gen.type.campfire",
  sign: "gen.type.sign",
  crystal: "gen.type.crystal",
  mushroom: "gen.type.mushroom",
  tree_stump: "gen.type.treeStump",
  barrel_variants: "gen.type.barrelVariants",
  wall: "gen.type.wall",
  wall_window: "gen.type.wallWindow",
  wall_door: "gen.type.wallDoor",
  wall_corner: "gen.type.wallCorner",
  floor: "gen.type.floor",
  stairs: "gen.type.stairs",
  arch: "gen.type.arch",
};

export const GEN_ALIAS_KEYS = {
  cube: "gen.alias.cube",
  sword: "gen.alias.sword",
  tree: "gen.alias.tree",
  rock: "gen.alias.rock",
  house: "gen.alias.house",
  car: "gen.alias.car",
  character: "gen.alias.character",
  shield: "gen.alias.shield",
  potion: "gen.alias.potion",
  chest: "gen.alias.chest",
  key: "gen.alias.key",
  gem: "gen.alias.gem",
  barrel: "gen.alias.barrel",
  crate: "gen.alias.crate",
  tower: "gen.alias.tower",
  flag: "gen.alias.flag",
  torch: "gen.alias.torch",
  fence: "gen.alias.fence",
  bridge: "gen.alias.bridge",
  gate: "gen.alias.gate",
  wagon: "gen.alias.wagon",
  cannon: "gen.alias.cannon",
  grave: "gen.alias.grave",
  ladder: "gen.alias.ladder",
  candelabra: "gen.alias.candelabra",
  anvil: "gen.alias.anvil",
  bookshelf: "gen.alias.bookshelf",
  cauldron: "gen.alias.cauldron",
  throne: "gen.alias.throne",
  bench: "gen.alias.bench",
  lantern: "gen.alias.lantern",
  table: "gen.alias.table",
  chair: "gen.alias.chair",
  bed: "gen.alias.bed",
  chandelier: "gen.alias.chandelier",
  armor_stand: "gen.alias.armorStand",
  skeleton: "gen.alias.skeleton",
  bread: "gen.alias.bread",
  pie: "gen.alias.pie",
  meat_leg: "gen.alias.meatLeg",
  hay_bale: "gen.alias.hayBale",
  rope_coil: "gen.alias.ropeCoil",
  bucket: "gen.alias.bucket",
  windmill: "gen.alias.windmill",
  coin_pile: "gen.alias.coinPile",
  minecart: "gen.alias.minecart",
  berry_bush: "gen.alias.berryBush",
  stone_coffin: "gen.alias.stoneCoffin",
  portcullis: "gen.alias.portcullis",
  cage: "gen.alias.cage",
  bone_pile: "gen.alias.bonePile",
  cobweb: "gen.alias.cobweb",
  lever: "gen.alias.lever",
  urn: "gen.alias.urn",
  mummy: "gen.alias.mummy",
  beehive: "gen.alias.beehive",
  wheat_sheaf: "gen.alias.wheatSheaf",
  fountain: "gen.alias.fountain",
  brazier: "gen.alias.brazier",
  runestone: "gen.alias.runestone",
  trap: "gen.alias.trap",
  turret: "gen.alias.turret",
  drone: "gen.alias.drone",
  antenna: "gen.alias.antenna",
  axe: "gen.alias.axe",
  bow: "gen.alias.bow",
  hammer: "gen.alias.hammer",
  spear: "gen.alias.spear",
  dagger: "gen.alias.dagger",
  mace: "gen.alias.mace",
  staff: "gen.alias.staff",
  halberd: "gen.alias.halberd",
  helmet: "gen.alias.helmet",
  chestplate: "gen.alias.chestplate",
  gauntlets: "gen.alias.gauntlets",
  boots: "gen.alias.boots",
  tent: "gen.alias.tent",
  statue: "gen.alias.statue",
  pillar: "gen.alias.pillar",
  well: "gen.alias.well",
  monster: "gen.alias.monster",
  dragon: "gen.alias.dragon",
  boat: "gen.alias.boat",
  plane: "gen.alias.plane",
  bike: "gen.alias.bike",
  campfire: "gen.alias.campfire",
  sign: "gen.alias.sign",
  crystal: "gen.alias.crystal",
  mushroom: "gen.alias.mushroom",
  tree_stump: "gen.alias.treeStump",
  barrel_variants: "gen.alias.barrelVariants",
  wall: "gen.alias.wall",
  wall_window: "gen.alias.wallWindow",
  wall_door: "gen.alias.wallDoor",
  wall_corner: "gen.alias.wallCorner",
  floor: "gen.alias.floor",
  stairs: "gen.alias.stairs",
  arch: "gen.alias.arch",
};

/* Colour words are a closed set on purpose. A preset whose hex a designer can
 * predict keeps the generated library coherent; anything more specific is a
 * job for the colour picker, which the prompt only seeds. */
export const GEN_COLOR_KEYS = {
  red: "gen.colorName.red",
  orange: "gen.colorName.orange",
  yellow: "gen.colorName.yellow",
  green: "gen.colorName.green",
  cyan: "gen.colorName.cyan",
  blue: "gen.colorName.blue",
  purple: "gen.colorName.purple",
  pink: "gen.colorName.pink",
  brown: "gen.colorName.brown",
  black: "gen.colorName.black",
  white: "gen.colorName.white",
  gray: "gen.colorName.gray",
  gold: "gen.colorName.gold",
  silver: "gen.colorName.silver",
};

export const COLOR_PRESETS = {
  red: "#c0392b",
  orange: "#d97a24",
  yellow: "#d9b62b",
  green: "#4a9a4a",
  cyan: "#2f9ea6",
  blue: "#3a67c4",
  purple: "#7b52c6",
  pink: "#d1609a",
  brown: "#8a5a33",
  black: "#26282d",
  white: "#e7eaef",
  gray: "#8b9199",
  gold: "#c9a227",
  silver: "#b4bac4",
};

export const GEN_STYLE_KEYS = {
  lowpoly: "gen.styleWord.lowpoly",
  realistic: "gen.styleWord.realistic",
  stylized: "gen.styleWord.stylized",
};

export const STYLE_SEGMENTS = { lowpoly: 8, stylized: 16, realistic: 32 };

/* The units a game asset is actually described in across the six catalogues.
 * `parseSize` normalises to metres, and the matched unit travels with the
 * result so the panel can echo the number back in the unit the writer used. */
export const GEN_SIZE_UNIT_KEYS = {
  meter: "gen.sizeUnit.meter",
  centimeter: "gen.sizeUnit.centimeter",
  millimeter: "gen.sizeUnit.millimeter",
  foot: "gen.sizeUnit.foot",
  inch: "gen.sizeUnit.inch",
};

export const UNIT_SCALES = {
  meter: 1,
  centimeter: 0.01,
  millimeter: 0.001,
  foot: 0.3048,
  inch: 0.0254,
};

/* Generator-facing unit ids. The prompt parser names units by their English
 * word so its own tests read as sentences; the generator uses the short id. */
export const UNIT_ID_BY_NAME = {
  meter: "m",
  centimeter: "cm",
  millimeter: "mm",
  foot: "ft",
  inch: "in",
};

const MIN_SIZE = 0.05;
const MAX_SIZE = 100;

const escapeRegExp = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* Latin words are matched on their edges, because German "rot" sits inside
 * English "robot" and French "or" sits inside "sword"; a prompt that says
 * "robot" is not a request for a red asset. Scripts without spaces carry no
 * such boundary, so those terms stay plain substring matches. */
const WORDLIKE = /^[a-z0-9][a-z0-9 '-]*$/i;

export const splitTerms = (value) =>
  String(value ?? "")
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);

function findTerm(text, term) {
  const index = text.indexOf(term);
  if (index === -1) return -1;
  if (!WORDLIKE.test(term)) return index;
  // A trailing s or es is the plural the catalogue does not list, and the
  // lookarounds keep the word from matching as part of a longer one.
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?:e?s)?(?![\\p{L}\\p{N}])`,
    "iu",
  );
  const match = pattern.exec(text);
  return match ? match.index : -1;
}

/* Longest term wins, ties go to the earliest one. "Tree stump" therefore beats
 * the "tree" inside it, and a prompt naming several assets resolves the way the
 * catalogue already ordered them rather than by an accident of iteration. */
function bestMatch(text, entries, termOf) {
  let best = null;
  for (const entry of entries) {
    const term = termOf(entry);
    const index = findTerm(text, term);
    if (index === -1) continue;
    if (
      !best ||
      term.length > best.length ||
      (term.length === best.length && index < best.index)
    ) {
      best = { index, length: term.length, entry };
    }
  }
  return best ? best.entry : null;
}

/* The largest number that directly precedes a unit. Longest unit first, so
 * "5 mm" is not read as five metres and "1.5 厘米" is not read as metres. */
function parseSize(text, units) {
  const ordered = [...units].sort((a, b) => b.term.length - a.term.length);
  for (const unit of ordered) {
    const tail = WORDLIKE.test(unit.term)
      ? `${escapeRegExp(unit.term)}(?![\\p{L}\\p{N}])`
      : escapeRegExp(unit.term);
    const match = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${tail}`, "u").exec(text);
    if (!match) continue;
    const value = parseFloat(match[1].replace(",", ".")) * unit.scale;
    if (!Number.isFinite(value)) continue;
    const metres = Math.min(
      MAX_SIZE,
      Math.max(MIN_SIZE, Number(value.toFixed(4))),
    );
    return { metres, unit: UNIT_ID_BY_NAME[unit.id] ?? "m" };
  }
  return null;
}

export function buildPromptLexicon(catalogues = {}) {
  const aliases = [];
  const colors = [];
  const styles = [];
  const units = [];
  const seen = new Set();
  const push = (bucket, kind, term, rest) => {
    const id = `${kind}|${term}`;
    if (seen.has(id)) return;
    seen.add(id);
    bucket.push({ term, ...rest });
  };

  for (const table of Object.values(catalogues)) {
    for (const [type, key] of Object.entries(GEN_ALIAS_KEYS)) {
      for (const term of splitTerms(table[key]))
        push(aliases, `alias:${type}`, term, { alias: term, type });
    }
    for (const [name, key] of Object.entries(GEN_COLOR_KEYS)) {
      for (const term of splitTerms(table[key]))
        push(colors, `color:${name}`, term, {
          name,
          hex: COLOR_PRESETS[name],
        });
    }
    for (const [style, key] of Object.entries(GEN_STYLE_KEYS)) {
      for (const term of splitTerms(table[key]))
        push(styles, `style:${style}`, term, { style });
    }
    for (const [unit, key] of Object.entries(GEN_SIZE_UNIT_KEYS)) {
      for (const term of splitTerms(table[key]))
        push(units, `unit:${unit}`, term, {
          scale: UNIT_SCALES[unit],
          id: unit,
        });
    }
  }
  return { aliases, colors, styles, units };
}

/* The result keeps the shape the generator and the asset library already
 * store, plus the two fields the panel uses to show what it understood. */
export function parseAssetPrompt(prompt, style, lexicon = {}) {
  const text = String(prompt ?? "").toLowerCase();
  const alias = bestMatch(text, lexicon.aliases || [], (entry) => entry.alias);
  const color = bestMatch(text, lexicon.colors || [], (entry) => entry.term);
  const styleWord = bestMatch(
    text,
    lexicon.styles || [],
    (entry) => entry.term,
  );

  const resolvedStyle = styleWord ? styleWord.style : style;
  const segments = STYLE_SEGMENTS[resolvedStyle] ?? STYLE_SEGMENTS.stylized;
  const measured = parseSize(text, lexicon.units || []);
  const size = measured ? measured.metres : 1;

  return {
    type: alias ? alias.type : "cube",
    matched: Boolean(alias),
    size,
    sizeUnit: measured ? measured.unit : null,
    segments,
    style: resolvedStyle,
    styleMatched: Boolean(styleWord),
    color: color ? color.hex : null,
    colorName: color ? color.name : null,
    prompt: String(prompt ?? ""),
  };
}
