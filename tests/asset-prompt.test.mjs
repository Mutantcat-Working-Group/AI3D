import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAssetPrompt,
  buildPromptLexicon,
  GEN_TYPE_KEYS,
  COLOR_PRESETS,
} from "../src/asset-prompt.js";
import { CATALOGUES } from "../src/i18n/index.js";

/* A miniature catalogue keeps these cases about the matching rules rather than
 * about whatever words the real translations happen to use today. */
const PARTIAL = {
  en: {
    "gen.alias.sword": "sword,blade",
    "gen.alias.car": "car",
    "gen.alias.key": "key",
    "gen.alias.tree": "tree",
    "gen.alias.treeStump": "tree stump,stump",
    "gen.alias.crate": "crate,box",
    "gen.alias.bridge": "bridge",
    "gen.colorName.red": "red,crimson",
    "gen.styleWord.lowpoly": "low poly,lowpoly,low-poly",
    "gen.styleWord.realistic": "realistic",
    "gen.sizeUnit.meter": "m,meter,meters",
    "gen.sizeUnit.centimeter": "cm,centimeter",
    "gen.sizeUnit.millimeter": "mm,millimeter",
  },
  zh: {
    "gen.alias.crate": "板条箱,箱子",
    "gen.alias.pillar": "立柱",
    "gen.colorName.red": "红,红色",
    "gen.sizeUnit.meter": "米",
    "gen.sizeUnit.millimeter": "毫米",
  },
};

const lexicon = buildPromptLexicon(PARTIAL);
const read = (prompt, style = "stylized") =>
  parseAssetPrompt(prompt, style, lexicon);

test("a description resolves to the template whose name it uses", () => {
  assert.equal(read("a rusty medieval sword").type, "sword");
  assert.equal(read("low-poly crate").type, "crate");
  assert.equal(read("a small wooden bridge").type, "bridge");
  assert.equal(read("boundary cars").type, "car");
});

/* Latin aliases are matched as words. "key" lives inside "monkey" and "car"
 * inside "carpet", and neither sentence is a request for that asset. */
test("an alias inside a longer word does not pick a template", () => {
  assert.equal(read("a fluffy monkey").type, "cube");
  assert.equal(read("a red carpet").type, "cube");
  assert.equal(read("keys and locks").type, "key");
});

test("the longest alias wins so a phrase beats the word inside it", () => {
  assert.equal(read("a mossy tree stump").type, "tree_stump");
  assert.equal(read("a lonely tree").type, "tree");
  assert.equal(read("板条箱").type, "crate");
  assert.equal(read("一根立柱").type, "pillar");
});

test("a size is read with the unit the sentence used", () => {
  assert.equal(read("a 2m wide bridge").size, 2);
  assert.equal(read("a 50 cm barrel").size, 0.5);
  assert.equal(read("an 800mm mast").size, 0.8);
  assert.equal(read("300 毫米").size, 0.3);
  assert.equal(read("1.5 米高的柱子").size, 1.5);
  assert.equal(read("1,5 m tall").size, 1.5);
});

/* A "5 mm" stud is not a five metre one, and a sentence with no measurement
 * still gets a usable default rather than the last number it mentioned. */
test("a size without a unit falls back, and extremes are held", () => {
  assert.equal(read("a sword").size, 1);
  assert.equal(read("3 swords").size, 1);
  assert.equal(read("2 mm").size, 0.05);
  assert.equal(read("900 m").size, 100);
});

test("a colour and a style named in the sentence are returned", () => {
  const red = read("a red sword");
  assert.equal(red.color, COLOR_PRESETS.red);
  assert.equal(red.colorName, "red");
  assert.equal(red.type, "sword");

  const lowpoly = read("a low-poly sword", "realistic");
  assert.equal(lowpoly.style, "lowpoly");
  assert.equal(lowpoly.styleMatched, true);
  assert.equal(lowpoly.segments, 8);
  // The select still decides when the sentence is silent about style.
  assert.equal(read("a sword", "realistic").style, "realistic");
  assert.equal(read("a sword", "realistic").styleMatched, false);
});

test("a sentence about nothing recognisable still generates a cube", () => {
  const asset = read("something the catalogue has never heard of");
  assert.equal(asset.type, "cube");
  assert.equal(asset.matched, false);
  assert.equal(asset.prompt, "something the catalogue has never heard of");
});

test("the shipped catalogues resolve every language they are written in", () => {
  const shipped = buildPromptLexicon(CATALOGUES);
  const cases = [
    ["en", "a red low-poly sword 1.5 m", "sword", 1.5],
    ["zh-Hans", "红色的剑", "sword", 1],
    ["zh-Hant", "紅色的劍", "sword", 1],
    ["de", "rotes Schwert", "sword", 1],
    ["fr", "épée rouge", "sword", 1],
    ["ja", "赤い剣", "sword", 1],
  ];
  for (const [locale, prompt, type, size] of cases) {
    const asset = parseAssetPrompt(prompt, "stylized", shipped);
    assert.equal(asset.type, type, `${locale} lost ${type} in "${prompt}"`);
    assert.equal(asset.color, COLOR_PRESETS.red, `${locale} lost the colour`);
    assert.equal(asset.size, size, `${locale} lost the size`);
  }
  assert.equal(
    parseAssetPrompt("a red low-poly sword 1.5 m", "stylized", shipped).style,
    "lowpoly",
  );
  // One term per meaning: "m" arrives from six catalogues and is stored once.
  assert.equal(shipped.units.filter((unit) => unit.term === "m").length, 1);
});

test("every catalogue key the matcher reads is one the panel can label", () => {
  const en = CATALOGUES.en;
  for (const [type, key] of Object.entries(GEN_TYPE_KEYS)) {
    assert.ok(en[key], `${key} is missing, so ${type} has no label`);
  }
});
