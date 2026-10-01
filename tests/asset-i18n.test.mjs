import test from "node:test";
import assert from "node:assert/strict";
import { getAssetTypes } from "../src/generator.js";
import { CATALOGUES } from "../src/i18n/index.js";

/* Quick-template chips and prompt aliases share one catalogue naming scheme:
 * the asset key is the suffix, except tree_stump and barrel_variants, whose
 * suffixes use camelCase in the keys. */
const KEY_SUFFIXES = {
  tree_stump: "treeStump",
  barrel_variants: "barrelVariants",
  armor_stand: "armorStand",
  meat_leg: "meatLeg",
  hay_bale: "hayBale",
  rope_coil: "ropeCoil",
  coin_pile: "coinPile",
  berry_bush: "berryBush",
  stone_coffin: "stoneCoffin",
  bone_pile: "bonePile",
  wheat_sheaf: "wheatSheaf",
  wall_window: "wallWindow",
  wall_door: "wallDoor",
  wall_corner: "wallCorner",
};

test("every asset template ships a label and aliases in every language", () => {
  const types = getAssetTypes();
  assert.ok(types.length >= 45, "expected the full game asset catalogue");
  for (const type of types) {
    const suffix = KEY_SUFFIXES[type] || type;
    for (const [locale, table] of Object.entries(CATALOGUES)) {
      const label = table[`gen.type.${suffix}`];
      assert.ok(
        label && !label.startsWith("gen.type."),
        `${locale} is missing the quick-template label for ${type}`,
      );
      const aliases = String(table[`gen.alias.${suffix}`] || "");
      const terms = aliases
        .split(",")
        .map((term) => term.trim())
        .filter(Boolean);
      assert.ok(
        terms.length >= 2,
        `${locale} gives ${type} no usable prompt aliases`,
      );
    }
  }
});
