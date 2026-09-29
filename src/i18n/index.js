import en from "./en.js";
import zhHans from "./zh-Hans.js";
import zhHant from "./zh-Hant.js";
import de from "./de.js";
import fr from "./fr.js";
import ja from "./ja.js";

/* Every catalogue ships in the bundle rather than being fetched. Six languages
   of interface text is a few tens of kilobytes next to three.js, and buying
   that back would cost an async boundary before the first paint — a reviewer
   would watch the page render in English and then change under them. */
export const CATALOGUES = {
  en,
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
  de,
  fr,
  ja,
};

/* A language is listed in its own language: someone who needs to switch to
   Japanese is, by definition, not reading the current one well enough to find
   "Japanese" in it. */
export const LOCALE_NAMES = {
  en: "English",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  de: "Deutsch",
  fr: "Français",
  ja: "日本語",
};

export function localeName(tag) {
  return LOCALE_NAMES[tag] || tag;
}

export const SOURCE_LOCALE = "en";
export const LOCALES = Object.keys(CATALOGUES);

/* Chinese cannot be resolved by primary subtag alone: `zh` is not a language a
   catalogue can be written in, only a family. Region is what actually decides
   the script when no script subtag is present. */
const TRADITIONAL_REGIONS = new Set(["tw", "hk", "mo"]);

function matchChinese(tag) {
  const parts = tag.toLowerCase().split("-");
  if (parts.includes("hant")) return "zh-Hant";
  if (parts.includes("hans")) return "zh-Hans";
  if (parts.slice(1).some((p) => TRADITIONAL_REGIONS.has(p))) return "zh-Hant";
  return "zh-Hans";
}

export function matchLocale(tag) {
  if (!tag) return null;
  const lower = String(tag).toLowerCase();
  const exact = LOCALES.find((l) => l.toLowerCase() === lower);
  if (exact) return exact;
  const primary = lower.split("-")[0];
  if (primary === "zh") return matchChinese(lower);
  return LOCALES.find((l) => l.toLowerCase().split("-")[0] === primary) || null;
}

/* `navigator.languages` is the ordered list the user actually set, so the first
   entry that has a catalogue wins; `navigator.language` alone would ignore a
   second and third preference that we can serve. */
export function pickLocale(requested, navigatorLanguages) {
  const tags = [
    ...(requested ? [requested] : []),
    ...(navigatorLanguages || []),
  ];
  for (const tag of tags) {
    const hit = matchLocale(tag);
    if (hit) return hit;
  }
  return SOURCE_LOCALE;
}

function readRequested() {
  if (typeof window === "undefined") return null;
  try {
    const fromUrl = new URL(location.href).searchParams.get("lang");
    if (fromUrl) return fromUrl;
  } catch {
    /* a URL we cannot parse simply has no preference in it */
  }
  try {
    return localStorage.getItem("ai3d-locale");
  } catch {
    return null;
  }
}

let locale = pickLocale(
  readRequested(),
  typeof navigator === "undefined"
    ? []
    : navigator.languages || [navigator.language],
);

export function currentLocale() {
  return locale;
}

/* Traditional Chinese is served to readers whose systems ask for zh-TW, zh-HK
   or zh-MO alike, so the document tag has to be the script, not a region. */
export function documentLanguage(which = locale) {
  return which;
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function t(key, vars) {
  const table = CATALOGUES[locale] || en;
  const text = table[key] ?? en[key];
  if (text === undefined) {
    if (import.meta.env?.DEV) throw new Error(`missing i18n key: ${key}`);
    return key;
  }
  if (!vars) return text;
  return text.replace(PLACEHOLDER, (whole, name) =>
    Object.prototype.hasOwnProperty.call(vars, name)
      ? String(vars[name])
      : whole,
  );
}

export function setLocale(next) {
  const hit = matchLocale(next);
  if (!hit || hit === locale) return locale;
  locale = hit;
  try {
    localStorage.setItem("ai3d-locale", hit);
  } catch {
    /* a reviewer with no storage still gets the language for this visit */
  }
  return locale;
}
