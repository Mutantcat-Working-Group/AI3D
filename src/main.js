import { newId } from "./browser-crypto.js";
import "./style.css";
import { ModelViewer } from "./viewer.js";
import { AssetPreview } from "./asset-preview.js";
import { buildOrientCube, compassTransform } from "./orient-cube.js";
import { latestVersion, viewingBehindLatest } from "./versions.js";
import {
  t,
  currentLocale,
  setLocale,
  LOCALES,
  localeName,
  CATALOGUES,
} from "./i18n/index.js";
import {
  readThemeChoice,
  storeThemeChoice,
  applyTheme,
  THEMES,
} from "./theme.js";
import {
  letterLabel,
  letterNumber,
  paintIndex,
  addPatches,
} from "./annotation-edits.js";
import {
  generateAsset as generateThreeAsset,
  generateVariantSet,
  exportAssetManifest,
  composeGameKit,
  getGameKits,
  exportGLB,
  exportOBJ,
  countTriangles,
  renderAssetThumbnail,
  getAssetTypes,
  cloneModelDeep,
  decimateMesh,
  generateLOD,
  getAssetStats,
  getAssetTags,
  getColliderShape,
  computeCollider,
  buildColliderModel,
  selectAnimations,
  getEnginePresets,
  exportGamePack,
  buildGamePackFiles,
  getAssetTextureInfo,
} from "./generator.js";

/* index.html ships with a fixed lang, because the language is not known until
   the reviewer's own preferences have been read. Correcting it here is what
   makes hyphenation, font selection and a screen reader's pronunciation match
   the words actually on the page. */
document.documentElement.lang = currentLocale();

const $ = (selector) => document.querySelector(selector);
const app = $("#app");
const brandIcon = new URL("../icon.png", import.meta.url).href;
/* Icons were Unicode glyphs, which is not a style choice but an absence of
   control: the operating system font decided their shape, weight and baseline,
   the rarer ones (▱ ▰ ⌖ ⌂) are missing from some fonts entirely, and ▱ against
   ▰ differed only by fill — eraser and paint bucket were indistinguishable side
   by side. These are drawn here, ship inside the bundle, and depict the action
   rather than gesture at it. Sized in em so every existing font-size rule,
   including the responsive ones, keeps working untouched. */
/* Before a single element exists: resolving the theme afterwards paints one
   frame of the wrong one on every load. */
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
let themeChoice = readThemeChoice();
applyTheme(themeChoice, darkQuery);
const faviconLink = document.createElement("link");
faviconLink.rel = "icon";
faviconLink.type = "image/png";
faviconLink.href = brandIcon;
document.head.append(faviconLink);

const SPRITE = `<svg class="sprite" aria-hidden="true" focusable="false"><defs>
<g id="mc-orbit" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z"/><path d="M4 8.5 12 13l8-4.5M12 13v7" stroke-width="1.2" opacity=".55"/></g>
<g id="mc-fill" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M11 2.6 20 11.6a1.6 1.6 0 0 1 0 2.3l-6 6a1.6 1.6 0 0 1-2.3 0l-6-6a1.6 1.6 0 0 1 0-2.3l6-6"/><path d="M5.6 13.2h14.2l-5.8 5.8a1.6 1.6 0 0 1-2.3 0z" fill="currentColor" stroke="none" opacity=".32"/><path d="M21.4 15.6c.9 1.2 1.4 2.1 1.4 2.8a1.4 1.4 0 1 1-2.8 0c0-.7.5-1.6 1.4-2.8z" fill="currentColor" stroke="none"/></g>
<g id="mc-undo" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h9a5 5 0 0 1 0 10H9"/><path d="M7.5 6 3.5 10l4 4"/></g>
<g id="mc-redo" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10h-9a5 5 0 0 0 0 10h4"/><path d="M16.5 6l4 4-4 4"/></g>
<g id="mc-home" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.6 11 12 4l8.4 7"/><path d="M5.8 12.2V20h12.4v-7.8"/></g>
<g id="mc-send" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8z"/></g>
<g id="mc-trash" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5h16M9.5 6.5V4.2h5v2.3"/><path d="M6.3 6.5 7.2 20h9.6l.9-13.5"/><path d="M10.3 10v6.4M13.7 10v6.4" stroke-width="1.3" opacity=".6"/></g>
<g id="mc-close" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></g>
<g id="mc-plus" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></g>
<g id="mc-check" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.6 9.5 17.5 19.5 6.8"/></g>
<g id="mc-collapse-left" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6.5 9 12l5.5 5.5"/><path d="M19 5.5v13"/></g>
<g id="mc-expand-right" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6.5 15 12l-5.5 5.5"/><path d="M5 5.5v13"/></g>
<g id="mc-echo" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 6.8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7.4a2 2 0 0 1-2 2h-6.6L7 19.8v-3.6H6a2 2 0 0 1-2-2z"/></g>
<g id="mc-pin" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 21.2s6.4-6.3 6.4-11a6.4 6.4 0 1 0-12.8 0c0 4.7 6.4 11 6.4 11z"/><circle cx="12" cy="10" r="2.4"/></g>
<g id="mc-eye" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1.8 12S5.6 5.8 12 5.8 22.2 12 22.2 12 18.4 18.2 12 18.2 1.8 12 1.8 12z"/><circle cx="12" cy="12" r="3"/></g>
<g id="mc-eye-off" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9.6 6.2A9.6 9.6 0 0 1 12 5.8c6.4 0 10.2 6.2 10.2 6.2a17 17 0 0 1-3.2 3.8M6.1 8.2A17 17 0 0 0 1.8 12S5.6 18.2 12 18.2c1.2 0 2.2-.2 3.2-.5"/><path d="M10 10a2.8 2.8 0 0 0 3.9 3.9"/><path d="M3.5 3.5l17 17"/></g>
<g id="mc-help" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.3"/><circle cx="12" cy="16.6" r="1" fill="currentColor" stroke="none"/></g>
<g id="mc-info" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/></g>
<g id="mc-plain" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8.4"/><path d="M12 3.6a8.4 8.4 0 0 0 0 16.8z" fill="currentColor" stroke="none"/></g>
<g id="mc-language" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8"/><path d="M12 3.6a12.6 12.6 0 0 1 0 16.8a12.6 12.6 0 0 1 0-16.8z"/></g>
<g id="mc-theme" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="4.6"/><path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/></g>
<g id="mc-chat" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 5.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9.5L5 20.5v-4.5H6a2 2 0 0 1-2-2z"/></g>
<g id="mc-plug" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/></g>
<g id="mc-play" fill="currentColor" stroke="none"><path d="M7 4.8v14.4c0 .9 1 1.5 1.8 1L20 13a1.2 1.2 0 0 0 0-2L8.8 3.8c-.8-.5-1.8.1-1.8 1z"/></g>
<g id="mc-pause" fill="currentColor" stroke="none"><path d="M7.5 4.5h3.2v15H7.5z"/><path d="M13.3 4.5h3.2v15h-3.2z"/></g>
<g id="mc-gen" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5 21 7.5v9l-9 5-9-5v-9z"/><path d="M12 2.5v19M3 7.5l9 5 9-5"/><path d="M7.5 5l9 5" opacity=".5"/></g>
<g id="mc-scene" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/></g>
<g id="mc-star" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3.8 2.5 5.1 5.7.8-4.1 4 .9 5.7-5-2.7-5 2.7.9-5.7-4.1-4 5.7-.8z"/></g>
</defs></svg>`;
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#mc-${name}"/></svg>`;
/* Catalogue text goes into markup, so it is escaped on the way in. Five
   languages of apostrophes and quotation marks are not a place to rely on
   nobody having typed an angle bracket. */
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const T = (key, vars) => esc(t(key, vars));
/* The service names its refusals and the browser is what has to say them out
   loud, so a refusal the reader will see is looked up by code rather than
   printed in whatever language the service happens to be written in. A code
   with no entry yet falls back to the service's own words: half-translated is
   poor, but silence in place of a reason is worse. This is the seam where the
   rest of the service's browser-facing text will join. */
/* "unspecified" is the record's word for a file that declared no unit, and it
   reached the pill verbatim -- one English word in the middle of a translated
   line, next to a STEP round that says "mm". Only that sentinel is translated:
   a unit the author did state is their word, and rewriting it would be this
   page making a claim about the model. */
const unitsLabel = (units) =>
  units === "unspecified" ? t("units.unspecified") : units;
// A server message is written for an agent and a log file. These are the
// refusals a reviewer can actually cause from the page, so they are said in the
// reviewer's own language; anything else falls through to the server's text,
// which is the honest thing to show when nobody has translated it.
const ERROR_KEYS = {
  ACCESS_REQUIRED: "error.accessRequired",
  EMPTY: "error.empty",
  SAVING: "error.saving",
  STALE_DRAFT: "error.staleDraft",
  ORIGIN_BUSY: "error.originBusy",
  ACCESS_EXPIRED: "error.accessExpired",
  ACCESS_LIMIT: "error.accessLimit",
  INTEGRATION_DISABLED: "error.integrationDisabled",
  DELIVERY_UNCONFIRMED: "error.deliveryUnconfirmed",
};
const BLOCKED_KEYS = {
  NOT_IN_REVIEW: "review.notInReview",
  NOT_MARKED: "review.notMarked",
  ROUND_CLOSED: "review.roundClosed",
};
const blockedText = (code) => (BLOCKED_KEYS[code] ? t(BLOCKED_KEYS[code]) : "");
const serverMessage = (json) =>
  (json?.code && ERROR_KEYS[json.code] && t(ERROR_KEYS[json.code])) ||
  json?.error ||
  t("conn.actionFailed");
app.innerHTML = `${SPRITE}
<header class="app-header"><div class="brand-mark"><img class="brand-icon" src="${brandIcon}" alt="" draggable="false"></div><div class="brand"><div class="brand-title"><strong>AI3D</strong><span class="app-version" id="app-version" title="${T("app.version")}">${__AI3D_VERSION__}</span><a class="app-update" id="app-update" target="_blank" rel="noreferrer noopener" hidden></a></div><span>${T("app.tagline")}</span></div><div class="header-right"><span class="connection-dot"></span><span id="connection-status">${T("conn.connecting")}</span><label class="setting">${icon("language")}<select class="quiet" id="locale-choice" aria-label="${T("settings.language")}"></select></label><label class="setting">${icon("theme")}<select class="quiet" id="theme-choice" aria-label="${T("settings.theme")}"><option value="system">${T("settings.themeSystem")}</option><option value="light">${T("settings.themeLight")}</option><option value="dark">${T("settings.themeDark")}</option></select></label><button class="quiet icon-only" id="about-button" aria-label="${T("settings.about")}" title="${T("settings.about")}">${icon("info")}</button><button class="quiet icon-only" id="help-button" aria-label="${T("help.open")}">${icon("help")}</button><button class="quiet icon-only" id="ai-button" aria-label="${T("ai.open")}" aria-expanded="false" title="${T("ai.open")}">${icon("gen")}</button></div></header>
<main class="workspace">
 <section class="review-panel" aria-label="${T("a11y.reviewPanel")}">
  <!-- The name arrived with the link, the tab strip carries the version, and a
       save that fails says so in a toast. None of it was worth a row of the
       page across the top of the model — but a reviewer who cannot see the
       screen has no toast and no tab strip, so the three of them stay here,
       out of the layout and still in the accessibility tree. -->
  <div class="sr-only"><h2 id="model-name">${T("model.awaiting")}</h2><span id="model-version">—</span><span id="save-status" aria-live="polite">${T("save.preparing")}</span></div>
  <div id="version-tabs" class="version-tabs" role="tablist" aria-label="${T("a11y.versionTabs")}" hidden></div>
  <div class="review-body">
  <aside class="annotations-panel"><div class="annotations-heading"><strong>${T("marks.heading")} <span id="annotation-count">0</span></strong><button id="toggle-annotations" class="quiet-dark" aria-label="${T("marks.collapse")}" aria-expanded="true">${icon("collapse-left")}</button></div><div id="annotations-list"><div class="annotation-empty">${T("marks.empty").replace(/\n/g, "<br>")}</div></div><div class="panel-actions"><button id="submit-feedback" class="primary-button" disabled>${T("feedback.submit")} ${icon("send")}</button><span id="feedback-status">${T("feedback.default")}</span></div></aside>
  <div class="viewer-shell">
   <div id="viewer"></div>
   <div class="viewer-top"><span class="scene-pill" id="review-status">${T("review.loadingModel")}</span></div>
   <div class="orient">
    <div class="orient-stage"><div class="orient-cube" id="orient-cube" aria-hidden="true"></div></div>
    <button class="orient-home quiet-dark" id="home-view" title="${T("cube.homeTitle")}" aria-label="${T("cube.homeLabel")}">${icon("home")}</button>
   </div>
   <div class="toolbar" role="toolbar" aria-label="${T("a11y.toolbar")}">
    <button data-mode="orbit" class="tool active" title="${T("tool.orbitTitle")}" aria-label="${T("tool.orbitLabel")}">${icon("orbit")}<span>${T("tool.orbit")}</span></button>
    <button data-mode="label" class="tool" title="${T("tool.labelTitle")}" aria-label="${T("tool.labelLabel")}">${icon("pin")}<span>${T("tool.label")}</span></button>
    <button data-mode="fill" class="tool" aria-label="${T("tool.bucketLabel")}" title="${T("tool.bucketTitle")}">${icon("fill")}<span>${T("tool.bucket")}</span></button>
    <div class="tool-divider"></div><button class="tool small" id="undo" title="${T("tool.undoTitle")}" aria-label="${T("tool.undo")}">${icon("undo")}</button><button class="tool small" id="redo" title="${T("tool.redo")}" aria-label="${T("tool.redo")}">${icon("redo")}</button>
    <div class="tool-divider"></div><button class="tool" id="toggle-marks" aria-pressed="false" title="${T("marks.hide")}" aria-label="${T("marks.hide")}">${icon("eye")}<span>${T("tool.marks")}</span></button><button class="tool" id="neutral-view" aria-pressed="false" title="${T("view.plain")}" aria-label="${T("view.plain")}">${icon("plain")}<span>${T("tool.plain")}</span></button>
   </div>
   <div id="tool-options" class="tool-options" hidden><div class="palette" role="group" aria-label="${T("a11y.palette")}" hidden></div><label id="fill-control" hidden>${T("tool.spread")} <input id="fill-range" type="range" min="1" max="30" value="6" aria-label="${T("tool.bucketSpread")}"></label><button class="quiet-dark" id="new-region" hidden>${icon("plus")}${T("tool.newRegion")}</button></div>
   <div id="echo-dock"><div id="echo-panel" hidden><span id="echo-summary"></span><span id="echo-stale" hidden>${T("echo.stale")}</span></div><button id="echo-recall" hidden aria-expanded="false" aria-label="${T("echo.recall")}">${icon("echo")}</button></div>
   <div id="loading" class="loading-overlay"><div class="spinner"></div><strong id="loading-text">${T("loading.preparing")}</strong><span id="loading-hint">${T("loading.hint")}</span></div>
   <div class="viewer-bottom"><span id="tool-hint">${T("hint.orbit")}</span><span class="scene-pill subtle" id="model-info"></span><span class="axis-label">3D SPACE</span></div>
  </div>
  </div>
  <div id="pending-banner" class="pending-banner" hidden><span id="pending-text"></span><button id="go-latest" class="quiet">${T("version.goLatest")}</button></div>
  <div id="resume-banner" class="pending-banner" hidden><span>${T("resume.text")}</span><button id="resume-review" class="quiet">${T("resume.action")}</button></div>
  <div id="recovery-banner" class="pending-banner" hidden><span>${T("recovery.text")}</span><a id="download-recovery">${T("recovery.download")}</a></div>
  <div id="outbox-banner" class="pending-banner warn" hidden><span id="outbox-text"></span></div>
  <div id="closing-banner" class="pending-banner warn" hidden><span id="closing-text"></span></div>
 </section>
</main><aside id="ai-dock" aria-label="${T("a11y.aiDock")}" hidden>
  <div class="ai-tabs" role="tablist">
    <button class="ai-tab" data-ai-tab="chat" role="tab" aria-selected="false">${icon("chat")}<span>${T("ai.chat")}</span></button>
    <button class="ai-tab" data-ai-tab="mcp" role="tab" aria-selected="false">${icon("plug")}<span>${T("ai.mcp")}</span></button>
    <button class="ai-tab active" data-ai-tab="gen" role="tab" aria-selected="true">${icon("gen")}<span>${T("ai.generate")}</span></button>
  </div>
  <div class="ai-pane" data-ai-pane="chat">
    <div id="chat-messages" class="chat-messages" aria-label="${T("a11y.chatMessages")}"></div>
    <div id="chat-status" class="chat-status"></div>
    <div class="chat-composer">
      <textarea id="chat-input" placeholder="${T("chat.placeholder")}" rows="2"></textarea>
      <button id="chat-send" class="primary-button">${icon("send")}<span>${T("chat.send")}</span></button>
    </div>
  </div>
  <div class="ai-pane" data-ai-pane="gen" hidden>
    <div class="gen-header"><strong>${T("gen.title")}</strong></div>
    <div class="gen-types">
      <div class="gen-types-title">${T("gen.types")}</div>
      <div id="gen-types" class="gen-type-chips"></div>
    </div>
    <div class="gen-kit">
      <div class="gen-types-title">${T("gen.kit")}</div>
      <div id="gen-kits" class="gen-kit-chips"></div>
      <button id="gen-compose" class="primary-button">${icon("scene")}<span>${T("gen.compose")}</span></button>
    </div>
    <div class="gen-form">
      <label>${T("gen.prompt")}</label>
      <textarea id="gen-prompt" placeholder="${T("gen.promptPlaceholder")}" rows="3"></textarea>
      <label>${T("gen.style")}</label>
      <select id="gen-style">
        <option value="lowpoly">${T("gen.styleLowPoly")}</option>
        <option value="realistic">${T("gen.styleRealistic")}</option>
        <option value="stylized">${T("gen.styleStylized")}</option>
      </select>
      <label>${T("gen.color")}</label>
      <div class="gen-color-row">
        <input type="color" id="gen-color" value="#808080">
        <button type="button" id="gen-color-reset" class="quiet">${T("gen.colorReset")}</button>
      </div>
      <label>${T("gen.materials")}</label>
      <div class="gen-material-row">
        <label>${T("gen.roughness")} <input type="range" id="gen-roughness" min="0" max="1" step="0.05" value="0.8"></label>
        <label>${T("gen.metalness")} <input type="range" id="gen-metalness" min="0" max="1" step="0.05" value="0.1"></label>
      </div>
      <label>${T("gen.emissive")}</label>
      <div class="gen-color-row">
        <input type="color" id="gen-emissive" value="#000000">
        <button type="button" id="gen-emissive-reset" class="quiet">${T("gen.colorReset")}</button>
      </div>
      <label>${T("gen.texture")}</label>
      <select id="gen-texture">
        <option value="auto">${T("gen.textureAuto")}</option>
        <option value="wood">${T("gen.textureWood")}</option>
        <option value="stone">${T("gen.textureStone")}</option>
        <option value="metal">${T("gen.textureMetal")}</option>
        <option value="cloth">${T("gen.textureCloth")}</option>
        <option value="leather">${T("gen.textureLeather")}</option>
        <option value="leaf">${T("gen.textureLeaf")}</option>
        <option value="scale">${T("gen.textureScale")}</option>
        <option value="crystal">${T("gen.textureCrystal")}</option>
        <option value="sand">${T("gen.textureSand")}</option>
        <option value="none">${T("gen.textureNone")}</option>
      </select>
      <label class="gen-texture-strength">${T("gen.textureStrength")} <input type="range" id="gen-texture-strength" min="0" max="1" step="0.05" value="0.8"></label>
      <div id="gen-texture-strip" class="gen-texture-strip" aria-label="${T("gen.textureStrip")}"></div>
      <label>${T("gen.seed")}</label>
      <div class="gen-color-row">
        <input type="number" id="gen-seed" min="0" step="1" placeholder="${T("gen.seedPlaceholder")}">
        <button type="button" id="gen-seed-reset" class="quiet">${T("gen.colorReset")}</button>
        <button type="button" id="gen-seed-random" class="quiet">${T("gen.randomSeed")}</button>
      </div>
      <button id="gen-generate" class="primary-button">${icon("gen")}<span>${T("gen.generate")}</span></button>
    </div>
    <div class="gen-preview" id="gen-preview" hidden>
      <div class="gen-preview-stage" id="gen-preview-stage"></div>
      <div class="gen-preview-controls">
        <select id="gen-preview-clip" aria-label="${T("gen.animation")}">
          <option value="">${T("gen.animationNone")}</option>
        </select>
        <button id="gen-preview-play" class="icon-only" aria-label="${T("gen.previewPlay")}" title="${T("gen.previewPlay")}">${icon("play")}</button>
        <button id="gen-preview-spin" class="icon-only active" aria-label="${T("gen.previewSpin")}" aria-pressed="true" title="${T("gen.previewSpin")}">${icon("orbit")}</button>
      </div>
    </div>
    <div class="gen-variants">
      <div class="gen-variants-tools">
        <label for="gen-variant-count">${T("gen.variants")}</label>
        <select id="gen-variant-count" aria-label="${T("gen.variantCount")}">
          <option value="4">4</option>
          <option value="9">9</option>
        </select>
        <button id="gen-variants-generate" class="quiet">${T("gen.variantsGenerate")}</button>
        <button id="gen-variants-save-all" class="quiet" hidden>${T("gen.variantsSaveAll")}</button>
      </div>
      <div id="gen-variants" class="gen-variants-grid" aria-live="polite"></div>
    </div>
    <div id="gen-status" class="gen-status"></div>
    <div class="gen-library-header">
      <input id="gen-search" placeholder="${t("gen.promptPlaceholder")}">
      <select id="gen-tag-filter" class="gen-tag-filter" aria-label="Filter by tag">
        <option value="">All tags</option>
      </select>
      <label class="gen-check"><input type="checkbox" id="gen-favorites-only">${t("gen.favoritesOnly")}</label>
      <button id="gen-save" class="quiet">${t("mcp.save")}</button>
      <select id="gen-manifest-format" class="gen-manifest-format" aria-label="${T("gen.manifestFormat")}">
        <option value="json">${T("gen.manifestJson")}</option>
        <option value="csv">${T("gen.manifestCsv")}</option>
      </select>
      <button id="gen-manifest-export" class="quiet" title="${T("gen.manifest")}">${T("gen.manifestExport")}</button>
      <button id="gen-library-pack" class="quiet" title="${T("gen.exportLibraryPack")}">${T("gen.exportLibraryPack")}</button>
    </div>
    <div id="gen-library" class="gen-library"></div>
    <div class="gen-actions" id="gen-actions" hidden>
      <button id="gen-batch-export" class="quiet">${t("gen.export")}</button>
      <button id="gen-import" class="primary-button">${T("gen.import")}</button>
      <button id="gen-optimize" class="quiet">${T("gen.optimize")}</button>
      <button id="gen-export" class="quiet">${T("gen.export")}</button>
    </div>
    <div class="gen-optimize-panel" id="gen-optimize-panel" hidden>
      <div class="gen-settings-title">${T("gen.optimize")}</div>
      <label>${T("gen.triangles")}: <strong id="gen-tri-count">0</strong></label>
      <label>${T("gen.targetTriangles")} <input id="gen-target-tri" type="number" value="1000" min="100" max="100000" step="100"></label>
      <div class="gen-optimize-actions">
        <button id="gen-decimate" class="quiet">${T("gen.decimate")}</button>
        <button id="gen-lod" class="quiet">${T("gen.lod")}</button>
        <button id="gen-restore" class="quiet">${T("gen.restore")}</button>
      </div>
      <div id="gen-lod-row" class="gen-lod-row" hidden>
        <button type="button" data-lod="0" class="quiet">${T("gen.lodOriginal")}</button>
        <button type="button" data-lod="1" class="quiet">${T("gen.lodLevel", { level: "1" })}</button>
        <button type="button" data-lod="2" class="quiet">${T("gen.lodLevel", { level: "2" })}</button>
        <button type="button" data-lod="3" class="quiet">${T("gen.lodLevel", { level: "3" })}</button>
      </div>
    </div>
    <div class="gen-export-panel" id="gen-export-panel" hidden><div class="gen-settings-title">${T("gen.settings")}</div>
      <label>${T("gen.format")}</label>
      <select id="gen-format">
        <option value="glb">${T("gen.formatGlb")}</option>
        <option value="fbx">${T("gen.formatFbx")}</option>
        <option value="obj">${T("gen.formatObj")}</option>
      </select>
      <label>${T("gen.units")}</label>
      <select id="gen-units">
        <option value="meters">${T("gen.unitsMeters")}</option>
        <option value="centimeters">${T("gen.unitsCentimeters")}</option>
      </select>
      <label>${T("gen.scale")}</label>
      <input id="gen-scale" type="number" value="1" min="0.01" max="100" step="0.01">
      <label>${T("gen.coordinateSystem")}</label>
      <select id="gen-coord">
        <option value="yup">${T("gen.yUp")}</option>
        <option value="zup">${T("gen.zUp")}</option>
      </select>
      <label class="gen-check"><input type="checkbox" id="gen-export-lod" checked>${T("gen.exportLod")}</label>
      <label>${T("gen.engine")}</label>
      <select id="gen-engine">
        <option value="unity">${T("gen.engineUnity")}</option>
        <option value="godot">${T("gen.engineGodot")}</option>
        <option value="unreal">${T("gen.engineUnreal")}</option>
      </select>
      <label>${T("gen.collision")}</label>
      <select id="gen-collision">
        <option value="auto">${T("gen.collisionAuto")}</option>
        <option value="box">${T("gen.collisionBox")}</option>
        <option value="sphere">${T("gen.collisionSphere")}</option>
        <option value="capsule">${T("gen.collisionCapsule")}</option>
        <option value="cylinder">${T("gen.collisionCylinder")}</option>
        <option value="mesh">${T("gen.collisionMesh")}</option>
        <option value="none">${T("gen.collisionNone")}</option>
      </select>
      <label>${T("gen.animation")}</label>
      <select id="gen-animation">
        <option value="auto">${T("gen.animationAuto")}</option>
        <option value="idle">${T("gen.animationIdle")}</option>
        <option value="walk">${T("gen.animationWalk")}</option>
        <option value="fly">${T("gen.animationFly")}</option>
        <option value="attack">${T("gen.animationAttack")}</option>
        <option value="none">${T("gen.animationNone")}</option>
      </select>
      <button id="gen-download" class="primary-button">${T("gen.download")}</button>
      <button id="gen-pack-download" class="primary-button">${T("gen.exportPack")}</button>
    </div>
  </div>
  <div class="ai-pane" data-ai-pane="mcp" hidden>
    <div class="mcp-header"><strong>${T("mcp.title")}</strong></div>
    <div id="mcp-connections" class="mcp-connections"></div>
    <div class="mcp-add">
      <input id="mcp-name" placeholder="${T("mcp.namePlaceholder")}">
      <input id="mcp-command" placeholder="${T("mcp.commandPlaceholder")}">
      <input id="mcp-args" placeholder="${T("mcp.argsPlaceholder")}">
      <button id="mcp-save" class="primary-button">${T("mcp.save")}</button>
    </div>
    <div class="mcp-tools" id="mcp-tools" hidden>
      <select id="mcp-server"></select>
      <select id="mcp-tool"></select>
      <textarea id="mcp-args-json" placeholder="${T("mcp.argsJsonPlaceholder")}" rows="3"></textarea>
      <button id="mcp-call" class="primary-button">${icon("play")}<span>${T("mcp.call")}</span></button>
      <pre id="mcp-result"></pre>
    </div>
  </div>
</aside><div id="toast" role="status" hidden></div>
<dialog id="help-dialog"><button id="close-help" class="dialog-close icon-only" aria-label="${T("common.close")}">${icon("close")}</button><span class="eyebrow">${T("help.eyebrow")}</span><h2>${T("help.title")}</h2><p>${T("help.p1")}</p><p>${T("help.p2")}</p><p>${T("help.p3")}</p><p>${T("help.p4")}</p><p>${T("help.p5")}</p><p>${T("help.p6")}</p><p>${T("help.p7")}</p><p>${T("help.p8")}</p><p class="muted">${T("help.p9")}</p></dialog>
<dialog id="about-dialog"><button id="close-about" class="dialog-close icon-only" aria-label="${T("common.close")}">${icon("close")}</button><span class="eyebrow">${T("settings.aboutEyebrow")}</span><h2>${T("settings.aboutTitle")}</h2><p class="about-product">${T("settings.aboutProduct")}</p><dl class="about-list"><div><dt>${T("common.version")}</dt><dd id="about-version">${__AI3D_VERSION__}</dd></div><div><dt>${T("settings.publisher")}</dt><dd>${T("settings.publisherName")}</dd></div></dl><a class="about-homepage" href="https://mutantcat.org/" target="_blank" rel="noreferrer noopener">${T("settings.homepage")}</a></dialog>`;

const base = new URL("./", location.href);
const endpoint = (path) => new URL(path, base).href;
const clientId = sessionStorage.getItem("3d-review-client") || newId();
sessionStorage.setItem("3d-review-client", clientId);
const colors = ["#e76d5c", "#e6b64b", "#6ab398", "#629bd8", "#ae82ce"];
let color = colors[0];
let state = null,
  // Sticky on purpose. Once the service has said it is reclaiming itself, the
  // polls that follow fail — and a bare connection error is what a crash looks
  // like. Remembering the reason is the only way the page can keep telling the
  // truth after the thing that knew it has gone.
  closingNotice = null,
  // The last countdown the service published. A hidden tab is throttled to
  // roughly one timer a minute, so the forgotten tab this whole mechanism
  // exists to collect is exactly the one that can sleep through the announced
  // window — and then all it has left is how close the deadline was when it
  // last managed to ask.
  lastIdle = null,
  loadedId = null,
  // Named for the acceptance checks: with no download control on the page, a
  // test that wants to prove the bytes on screen belong to the version claimed
  // has to be told which file to ask the service for.
  loadedFilename = null,
  // Which version the reviewer chose to look at, and whether they are still
  // following whatever the Agent puts on screen. Picking an older tab pins the
  // view; picking the current one hands the choice back to the Agent.
  viewingId = null,
  followActive = true,
  loadedReviewId = null,
  annotations = [],
  selectedId = null,
  mode = "orbit",
  revision = 0,
  editSeq = 0,
  savedSeq = 0;
let saveFlight = null,
  pendingWrite = null,
  saveTimer = null,
  renderFrame = null,
  loadFlight = null,
  beginFlight = null,
  submissionKey = null,
  submitting = false;
let undoStack = [],
  redoStack = [],
  initialDraftRestored = false;
let pollFlight = null,
  labelCursor = 0,
  relocatingId = null,
  loadedPrecision = null,
  // Which version's bytes were refused as not being the ones announced. A load
  // that ends there drops the version it was holding, and the poll's job is to
  // load whatever the page is not holding — so without remembering the refusal
  // the two restart each other for as long as the tab is open, and the reason
  // is overwritten by the next "verifying" before it can be read. Cleared by
  // anything that changes the answer: a new round, a different version, or the
  // reviewer asking again by hand.
  refusedLoad = null,
  echoId = null;
let recoveryBlocked = false,
  recoveryUrl = null,
  accessBlocked = false,
  accessRecoveryNeeded = false,
  loadedReceipt = null;
const clone = (x) => structuredClone(x);
async function api(path, data, method = "POST") {
  const options =
    data === undefined
      ? {}
      : {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Review-Client": "1",
          },
          body: JSON.stringify(data),
        };
  const res = await fetch(endpoint(`api/${path}`), options);
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(t("conn.dropped"));
  }
  if (!res.ok) {
    const err = new Error(serverMessage(json));
    err.code = json.code;
    if (res.status === 401 || json.code === "REVIEW_FINISHED") {
      accessBlocked = true;
      clearTimeout(saveTimer);
      if (loadedId && initialDraftRestored) {
        cacheDraft();
        if (editSeq > savedSeq)
          showRecovery({
            versionId: loadedId,
            reviewId: loadedReviewId,
            annotations,
            camera: viewer.cameraState(),
            revision,
          });
      } else {
        $("#loading-text").textContent = err.message;
        $("#loading-hint").textContent = t("conn.connectedNoAccess");
        $("#loading .spinner").hidden = true;
      }
      updateButtons();
    }
    throw err;
  }
  return json;
}
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").hidden = true), 6500);
}
function owner() {
  return { versionId: loadedId, clientId };
}
const DRAFT_PREFIX = "3d-review-draft-";
function draftKey() {
  return `${DRAFT_PREFIX}${loadedId}-${loadedReviewId}`;
}
// Every version keeps its own cached draft, and a new review generation starts
// another set, so the keys only ever accumulate. Exhausting the quota is not
// cosmetic here: it is exactly what puts the page into the mode that stops
// editing to protect an unsynced draft. Age cannot decide what goes — an older
// review's draft is precisely what the kept-draft promise covers.
// Being unsynced can: a cache that matches what the server already holds costs
// a reload to rebuild and nothing to lose. Recovery backups are never touched;
// they exist because something was already at risk.
function sweepDraftCache() {
  const mine = draftKey();
  const spent = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(DRAFT_PREFIX) || key === mine) continue;
    if (key.slice(DRAFT_PREFIX.length).includes("-recovery-")) continue;
    try {
      if (JSON.parse(localStorage.getItem(key))?.dirty === true) continue;
    } catch {
      // Unreadable is not recoverable either way, and it still costs quota.
    }
    spent.push(key);
  }
  for (const key of spent) localStorage.removeItem(key);
}
function cacheDraft() {
  if (recoveryBlocked) return;
  try {
    localStorage.setItem(
      draftKey(),
      JSON.stringify({
        annotations,
        labelCursor,
        revision,
        dirty: editSeq > savedSeq,
        editSeq,
        savedSeq,
        pendingWrite,
        camera: viewer.cameraState(),
      }),
    );
  } catch {
    toast(t("save.storageFull"));
  }
}
function historyPush() {
  undoStack.push(JSON.stringify(annotations));
  while (
    undoStack.length > 20 ||
    undoStack.reduce((n, x) => n + x.length, 0) > 8_000_000
  )
    undoStack.shift();
  redoStack = [];
}
function nextLabel() {
  return letterLabel(++labelCursor);
}
function changed() {
  editSeq++;
  submissionKey = null;
  cacheDraft();
  renderAnnotations();
  $("#save-status").textContent = t("save.saving");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () => flushDraft().catch((e) => toast(e.message)),
    500,
  );
  updateButtons();
}
async function beginEdit() {
  if (
    !loadedId ||
    !viewer.enabled ||
    submitting ||
    recoveryBlocked ||
    accessBlocked
  )
    return false;
  if (beginFlight) return beginFlight;
  beginFlight = (async () => {
    const result = await api("review/begin", owner());
    state = { ...state, ...result };
    historyPush();
    updateButtons();
    return true;
  })();
  try {
    return await beginFlight;
  } finally {
    beginFlight = null;
  }
}
function onPin(pin) {
  if (annotations.length >= 200) return toast(t("marks.limit"));
  const item = {
    id: newId(),
    type: "pin",
    label: nextLabel(),
    color,
    ...pin,
  };
  annotations.push(item);
  selectedId = item.id;
  changed();
}
/* A colour is named, not described: the swatch is already on screen, so the
   word is there to be said out loud in the original conversation. A colour with
   no name falls back to its hex, which is still something to point at. */
const colorKeys = {
  "#e76d5c": "color.red",
  "#e6b64b": "color.yellow",
  "#6ab398": "color.green",
  "#629bd8": "color.blue",
  "#ae82ce": "color.purple",
};
const colorName = (hex) => (colorKeys[hex] ? t(colorKeys[hex]) : hex);
function regionName(a) {
  return t("marks.regionName", { color: colorName(a.color) });
}
/* Browsers give an origin about 5 MB of local storage, and a review has to fit
   inside it with room for the recovery copy an unsynced draft is entitled to.
   The estimate is deliberately rough and deliberately high: a coordinate that
   rounds short costs fewer bytes than budgeted, never more. */
const MAX_MARK_BYTES = 3_000_000;
const patchBytes = (p) => 64 + (p.vertices?.length || 0) * 26;
// A face taken whole is its own number in `faces` and nothing else: six digits
// and a comma where a polygon repeating the same triangle charged 142 bytes.
const WHOLE_FACE_BYTES = 8;
const faceOf = (p) => `${p.meshId}:${p.faceIndex}`;
const faceCountOf = (a) =>
  a.type === "pin"
    ? 1
    : Object.values(a.faces || {}).reduce((m, f) => m + f.length, 0);
const markBytes = (a) =>
  120 +
  (a.surfacePatches || []).reduce((m, p) => m + patchBytes(p), 0) +
  (faceCountOf(a) - new Set((a.surfacePatches || []).map(faceOf)).size) *
    WHOLE_FACE_BYTES;
const draftBytes = () => annotations.reduce((n, a) => n + markBytes(a), 0);
let paint = null;
/* Every tool that still reaches this hands over entire source faces — the
   bucket by construction — so a mark is the numbers of the faces it claims and
   nothing else. Partial coverage of a face arrived with the brush and left with
   it; `source-v1` marks already on disk still carry polygons and still render,
   but nothing new writes one. */
function onPaint(patches) {
  patches = patches.map((p) => ({ ...p, faceIndex: p.sourceFaceIndex }));
  /* Measured in bytes, because bytes are what runs out. The old guard counted
     patches and stopped at forty thousand of them — about eleven megabytes,
     twice what a browser will hold — so the warning it exists to give could
     never arrive before the quota did, and the reviewer met "local storage is
     full" instead of "submit this batch". */
  if (
    draftBytes() +
      patches.reduce(
        (n, p) => n + (p.whole ? WHOLE_FACE_BYTES : patchBytes(p)),
        0,
      ) >
    MAX_MARK_BYTES
  ) {
    toast(t("marks.nearStrokeLimit"));
    return;
  }
  let region = annotations.find(
    (a) =>
      a.id === selectedId &&
      a.type === "region" &&
      a.color === color &&
      a.coverage === "source-v2",
  );
  const targetFaces = new Set(
    Object.entries(region?.faces || {}).flatMap(([meshId, ids]) =>
      ids.map((id) => `${meshId}:${id}`),
    ),
  );
  for (const p of patches) targetFaces.add(faceOf(p));
  const otherFaces = annotations
    .filter((a) => a !== region)
    .reduce((n, a) => n + faceCountOf(a), 0);
  /* A round used to stop at twenty thousand faces. That number was never about
     faces — it was the byte budget written a second way, back when a face cost
     a polygon repeating its own triangle: twenty thousand times about 142
     bytes is very nearly the three megabytes above. Under `source-v2` a whole
     face costs its number, so the same budget now holds the whole of any model
     up to roughly 440,000 source faces. Measured: every one of the self-test
     slab's 97,280 faces is 572,800 bytes, 19% of the budget.

     So the model is the limit, which is what a limit here should have been all
     along, and the bytes above are the one that can still be reached. */
  if (otherFaces + targetFaces.size > viewer.sourceFaceCount()) {
    toast(t("marks.nearMarkLimit"));
    return;
  }
  if (!region) {
    if (annotations.length >= 200) return;
    region = {
      id: newId(),
      type: "region",
      label: regionName({ color }),
      color,
      coverage: "source-v2",
      faces: {},
      surfacePatches: [],
    };
    annotations.push(region);
    selectedId = region.id;
  }
  paint = addPatches(region, patches, paintIndex(region, paint));
  changed();
}
const viewer = new ModelViewer($("#viewer"), {
  onReady: async (data) => {
    await api("ready", { ...owner(), ...data });
    loadedReceipt = data;
  },
  onEdit: beginEdit,
  onPin,
  onPaint,
  onStrokeEnd: () => {
    clearTimeout(saveTimer);
    flushDraft().catch((e) => toast(e.message));
  },
  onError: toast,
});
/* The theme follows the system, so it can change while the page is open — at
   dusk, or when the reviewer flips the setting mid-review. CSS repaints itself;
   the WebGL canvas will not until it is told to. */
darkQuery.addEventListener("change", () => {
  // Only while nobody has chosen. A reviewer who picked light meant it, and
  // dusk is not an argument against it.
  if (themeChoice === "system") applyTheme(themeChoice, darkQuery);
  viewer.applyTheme();
  viewer.render();
});
/* CSS repaints itself from the variables; the WebGL canvas is painted by us and
   will not, so every path that changes the theme has to say so here. The system
   listener above was the only one that existed, which is why the canvas could
   not have followed a manual switch. */
$("#theme-choice").value = THEMES.includes(themeChoice)
  ? themeChoice
  : "system";
$("#theme-choice").addEventListener("change", (e) => {
  themeChoice = storeThemeChoice(e.target.value);
  applyTheme(themeChoice, darkQuery);
  viewer.applyTheme();
  viewer.render();
});
for (const tag of LOCALES) {
  const option = document.createElement("option");
  option.value = tag;
  option.textContent = localeName(tag);
  $("#locale-choice").append(option);
}
$("#locale-choice").value = currentLocale();
/* Every string was placed once, when the interface was built. Rebuilding it in
   place would mean re-binding every listener and rebuilding the viewer with the
   model still in it; reloading is honest and the choice is already stored.
   Flushing first is not optional — a reload with an unsaved draft in the tab
   would throw away marks the reviewer just made. */
$("#locale-choice").addEventListener("change", async (e) => {
  const wanted = e.target.value;
  if (wanted === currentLocale()) return;
  setLocale(wanted);
  try {
    await flushDraft();
  } catch {
    /* a draft that will not save is a reason to reload no less carefully */
  }
  location.reload();
});
/* The cube is a compass: it turns with the camera so a reviewer who has orbited
   into an unfamiliar angle can still read which way the model is facing, and
   clicking a face reframes from that side without changing what is framed. */
const orientCube = $("#orient-cube");
viewer.onOrient = (yaw, pitch) => {
  orientCube.style.transform = compassTransform(yaw, pitch);
};
/* Faces name a side; edges and corners are the three-quarter views a modeller
   reaches for to see two or three sides at once. */
const CUBE_KEYS = {
  "0,0,1": "cube.front",
  "0,0,-1": "cube.back",
  "1,0,0": "cube.right",
  "-1,0,0": "cube.left",
  "0,1,0": "cube.top",
  "0,-1,0": "cube.bottom",
};
const CUBE_AXES = [
  ["cube.right", "cube.left"],
  ["cube.top", "cube.bottom"],
  ["cube.front", "cube.back"],
];
const cubeTitle = (view) =>
  view
    .split(",")
    .map(Number)
    .map((v, i) => (v ? t(CUBE_AXES[i][v > 0 ? 0 : 1]) : ""))
    .filter(Boolean)
    .reverse()
    .join(t("cube.sideJoin"));
for (const region of buildOrientCube(orientCube, {
  label: (view) => (CUBE_KEYS[view] ? t(CUBE_KEYS[view]) : ""),
  title: (view) => t("cube.viewFrom", { side: cubeTitle(view) }),
}))
  region.el.addEventListener("click", () =>
    viewer.viewFrom(...region.view.split(",").map(Number)),
  );
viewer.onSelect = (id) => {
  selectedId = id;
  renderAnnotations();
};
viewer.onRelocate = (pin) => {
  const a = annotations.find((a) => a.id === relocatingId && a.type === "pin");
  if (!a) return;
  Object.assign(a, pin);
  selectedId = a.id;
  relocatingId = null;
  setMode("orbit");
  changed();
};

async function flushDraft() {
  if (saveFlight) {
    await saveFlight;
    if (editSeq > savedSeq) return flushDraft();
    return;
  }
  if (editSeq === savedSeq || !loadedId) return;
  // An uncertain write must be replayed unchanged: the server may have saved it
  // before its response was lost, while the user has already made another edit.
  pendingWrite ||= {
    revision,
    labelCursor,
    /* Bounds travel with the mark so the service can describe it without
       holding geometry, and so the agent can be told where a mark is without
       being handed every coordinate in it.

       They are attached on the way out and dropped on the way back in
       (`withoutBounds`). Bounds are a projection of the faces, not a second
       fact about the mark, and the page always has the geometry to recompute
       them. Keeping them only on the wire is what makes a mark read back equal
       to the mark that was made — which it was not, for exactly one release. */
    annotations: clone(annotations).map((a) => {
      const bounds = viewer.annotationBounds(a);
      return bounds ? { ...a, bounds } : a;
    }),
    camera: viewer.cameraState(),
    seq: editSeq,
  };
  cacheDraft();
  const seq = pendingWrite.seq,
    modelId = loadedId,
    payload = {
      ...owner(),
      revision: pendingWrite.revision,
      labelCursor: pendingWrite.labelCursor ?? labelCursor,
      annotations: viewer.serializeAnnotations(pendingWrite.annotations),
      camera: pendingWrite.camera,
    };
  saveFlight = (async () => {
    try {
      const draft = await api("draft", payload, "PUT");
      if (loadedId !== modelId) return;
      revision = draft.revision;
      savedSeq = seq;
      pendingWrite = null;
      state.draft = {
        ...draft,
        annotations: undefined,
        annotationCount: annotations.length,
      };
      // Refresh permissions on the same round trip. Otherwise the first mark
      // leaves the buttons grey until the next poll, and re-deriving them here
      // would put the decision back in the browser, where it went wrong.
      if (draft.capabilities) state.capabilities = draft.capabilities;
      cacheDraft();
      $("#save-status").textContent =
        editSeq === savedSeq ? t("save.saved") : t("save.saving");
    } catch (e) {
      $("#save-status").textContent = t("save.unsynced");
      throw e;
    } finally {
      saveFlight = null;
      updateButtons();
    }
  })();
  await saveFlight;
  if (editSeq > savedSeq) return flushDraft();
}
function updateButtons() {
  // The server decides what is permitted and says why when it is not. The page
  // only adds what the server cannot know: whether this tab has finished saving.
  const can = state?.capabilities || {};
  const latest = latestVersion(state?.versions),
    behind = viewingBehindLatest(state?.versions, viewingId);
  const ready =
      !!loadedId && viewer.enabled && !recoveryBlocked && !accessBlocked,
    settled = editSeq === savedSeq && !saveFlight,
    busy = submitting || !ready;
  // Marks this tab has not managed to save yet still count as something to hand
  // over — submitting flushes first. Requiring the server to have seen them
  // would disable the button during exactly the outage it exists to survive.
  $("#submit-feedback").disabled =
    busy || !can.canEdit || (!can.canSubmit && !annotations.length);
  $("#undo").disabled = busy || !undoStack.length;
  $("#redo").disabled = busy || !redoStack.length;
  $("#review-status").textContent = accessBlocked
    ? loadedId && initialDraftRestored
      ? t("conn.accessExpired")
      : t("conn.noAccess")
    : !ready
      ? t("review.loadingModel")
      : behind
        ? t("review.earlierVersion")
        : state?.locked
          ? t("review.openElsewhere")
          : blockedText(can.blocked) || t("review.current");
  updateReceipt();
  renderVersions();
  $("#pending-banner").hidden = !behind;
  if (behind)
    $("#pending-text").textContent = t("version.pinnedNotice", {
      version: latest.version || latest.name,
    });
  $("#resume-banner").hidden = !state?.locked || accessBlocked;
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => (b.disabled = busy || !can.canEdit));
  document
    .querySelectorAll(".delete-annotation, .edit-action")
    .forEach((b) => (b.disabled = busy || !can.canEdit));
}
/* Hiding a mark is a way of looking, not a way of editing: it never reaches
   the draft or the submission, only what the viewer is asked to draw. Keyed by
   id so the list still shows every mark, including the hidden ones. */
const hiddenMarks = new Set();
function renderAnnotations() {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = null;
    for (const id of hiddenMarks)
      if (!annotations.some((a) => a.id === id)) hiddenMarks.delete(id);
    viewer.setAnnotations(
      annotations.filter((a) => !hiddenMarks.has(a.id)),
      selectedId,
    );
    $("#annotation-count").textContent = annotations.length;
    const list = $("#annotations-list");
    list.replaceChildren();
    if (!annotations.length) {
      const div = document.createElement("div");
      div.className = "annotation-empty";
      div.textContent = t("marks.empty");
      list.append(div);
    }
    for (const a of annotations) {
      const row = document.createElement("div");
      row.className = `annotation-row ${a.id === selectedId ? "selected" : ""}`;
      row.dataset.annotationId = a.id;
      const hidden = hiddenMarks.has(a.id);
      const eye = document.createElement("button");
      eye.className = `mark-eye${hidden ? " off" : ""}`;
      eye.innerHTML = icon(hidden ? "eye-off" : "eye");
      eye.setAttribute("aria-pressed", String(hidden));
      eye.setAttribute(
        "aria-label",
        t(hidden ? "marks.showOne" : "marks.hideOne", {
          name: a.type === "pin" ? a.label : regionName(a),
        }),
      );
      eye.addEventListener("click", () => {
        if (hiddenMarks.has(a.id)) hiddenMarks.delete(a.id);
        else hiddenMarks.add(a.id);
        renderAnnotations();
      });
      const select = document.createElement("button");
      select.className = "annotation-select";
      const badge = document.createElement("span");
      badge.className = "annotation-badge";
      badge.style.background = a.color;
      badge.textContent = a.type === "pin" ? a.label : "";
      const text = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = a.type === "pin" ? t("marks.pin") : regionName(a);
      const detail = document.createElement("small");
      detail.textContent =
        a.type === "pin"
          ? t("marks.pinned")
          : ["source-v1", "source-v2"].includes(a.coverage)
            ? t("marks.alongSurface")
            : t("marks.legacyFace");
      text.append(title, detail);
      select.append(badge, text);
      select.addEventListener("click", () => {
        selectedId = a.id;
        color = a.color;
        updatePalette();
        renderAnnotations();
      });
      const remove = document.createElement("button");
      remove.className = "delete-annotation";
      remove.innerHTML = icon("trash");
      remove.setAttribute(
        "aria-label",
        a.type === "pin"
          ? t("marks.deleteLabel", { label: a.label })
          : t("marks.deleteOne", { name: regionName(a) }),
      );
      remove.disabled =
        !!(state?.locked && !state?.owned) || submitting || recoveryBlocked;
      remove.addEventListener("click", async () => {
        try {
          if (!(await beginEdit())) return;
          annotations = annotations.filter((x) => x.id !== a.id);
          if (selectedId === a.id) selectedId = null;
          changed();
          await flushDraft();
        } catch (e) {
          toast(e.message);
        }
      });
      const focus = document.createElement("button");
      focus.className = "quiet-dark annotation-action";
      focus.textContent = t("marks.frame");
      focus.setAttribute(
        "aria-label",
        t("marks.frameOne", {
          name: a.type === "pin" ? a.label : regionName(a),
        }),
      );
      focus.addEventListener("click", () => viewer.focusAnnotation(a));
      row.append(eye, select, focus);
      if (a.type === "pin") {
        const move = document.createElement("button");
        move.className = "quiet-dark annotation-action edit-action";
        move.textContent = t("marks.move");
        move.setAttribute(
          "aria-label",
          t("marks.moveLabel", { label: a.label }),
        );
        move.disabled = remove.disabled;
        move.addEventListener("click", () => {
          relocatingId = a.id;
          setMode("relocate");
          toast(t("marks.moveHint", { label: a.label }));
        });
        row.append(move);
      }
      row.append(remove);
      list.append(row);
    }
  });
}
function setMode(next) {
  mode = next;
  if (next !== "relocate") relocatingId = null;
  viewer.setVisible(true);
  showMarksToggle();
  viewer.setMode(next);
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => b.classList.toggle("active", b.dataset.mode === next));
  $("#fill-control").hidden = next !== "fill";
  // Looking makes nothing, so there is nothing for a colour to apply to.
  $(".palette").hidden = ["orbit", "relocate"].includes(next);
  $("#new-region").hidden = next !== "fill";
  // Once every option inside it is gone the frame is all that is left, and an
  // empty frame still reads as a window that failed to close.
  $("#tool-options").hidden = [...$("#tool-options").children].every(
    (el) => el.hidden,
  );
  $("#tool-hint").textContent = {
    fill: t("hint.fill"),
    relocate: t("hint.relocate"),
    label: t("hint.label"),
    orbit: t("hint.orbit"),
  }[next];
}
function updatePalette() {
  document
    .querySelectorAll(".color-button")
    .forEach((b) => b.classList.toggle("active", b.dataset.color === color));
}
for (const c of colors) {
  const b = document.createElement("button");
  b.className = "color-button";
  b.dataset.color = c;
  b.style.background = c;
  b.setAttribute("aria-label", t("color.choose", { color: colorName(c) }));
  b.addEventListener("click", () => {
    color = c;
    updatePalette();
  });
  $(".palette").append(b);
}
updatePalette();
document
  .querySelectorAll("[data-mode]")
  .forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
$("#fill-range").addEventListener("input", (e) =>
  viewer.setFillTolerance(Number(e.target.value)),
);
/* These two are switches, not tools, and they moved off the model into the
   toolbar where every other control already was. An unlabelled icon among
   captioned buttons reads as an unfinished one, so each is named on the face
   by what it is about; the icon carries which way it is set, and the name it
   is announced by says what the next press will do. The caption is a noun for
   that reason — it would have to contradict itself as a verb. */
function showToggle(id, pressed, key, name, caption) {
  const button = $(id);
  button.setAttribute("aria-pressed", String(pressed));
  button.setAttribute("aria-label", t(key));
  button.title = t(key);
  button.innerHTML = `${icon(name)}<span>${esc(t(caption))}</span>`;
}
const showMarksToggle = () =>
  showToggle(
    "#toggle-marks",
    !viewer.annotationsVisible,
    viewer.annotationsVisible ? "marks.hide" : "marks.show",
    viewer.annotationsVisible ? "eye" : "eye-off",
    "tool.marks",
  );
$("#toggle-marks").addEventListener("click", () => {
  viewer.setVisible(!viewer.annotationsVisible);
  showMarksToggle();
});
$("#neutral-view").addEventListener("click", () => {
  viewer.setNeutral(!viewer.neutral);
  showToggle(
    "#neutral-view",
    viewer.neutral,
    viewer.neutral ? "view.original" : "view.plain",
    "plain",
    "tool.plain",
  );
});
/* The Agent's understanding used to sit across the model until it was dismissed
   by hand, every round. It says itself once, gets out of the way on its own, and
   leaves a bubble to be asked again — reading it is occasional, the model is
   what the screen is for.

   Only the first showing leaves by itself. Recalling it is a deliberate act, so
   it then stays until it is put away, and a pointer resting on it is someone
   still reading. */
const ECHO_LINGER = 7000;
let echoTimer = null;
function echoLinger() {
  clearTimeout(echoTimer);
  echoTimer = setTimeout(hideEcho, ECHO_LINGER);
}
function showEcho({ linger }) {
  $("#echo-panel").hidden = false;
  $("#echo-recall").setAttribute("aria-expanded", "true");
  $("#echo-recall").setAttribute("aria-label", t("echo.dismiss"));
  clearTimeout(echoTimer);
  // A stale echo is a warning that the marks moved under it. Warnings do not
  // get to leave before they are read.
  if (linger && $("#echo-stale").hidden) echoLinger();
}
function hideEcho() {
  clearTimeout(echoTimer);
  echoTimer = null;
  $("#echo-panel").hidden = true;
  $("#echo-recall").setAttribute("aria-expanded", "false");
  $("#echo-recall").setAttribute("aria-label", t("echo.recall"));
}
$("#echo-recall").addEventListener("click", () => {
  if ($("#echo-panel").hidden) showEcho({ linger: false });
  else hideEcho();
});
$("#echo-panel").addEventListener("pointerenter", () =>
  clearTimeout(echoTimer),
);
$("#echo-panel").addEventListener("pointerleave", () => {
  if (echoTimer !== null) echoLinger();
});
$("#version-tabs").addEventListener("scroll", () =>
  markVersionOverflow($("#version-tabs")),
);
/* A mouse has no horizontal wheel, and Shift+wheel is not something a reviewer
   should have to know to see the versions he was given. A plain wheel over the
   strip moves along it, and only while the strip has somewhere to move. */
$("#version-tabs").addEventListener(
  "wheel",
  (e) => {
    const bar = $("#version-tabs");
    if (e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    if (bar.scrollWidth <= bar.clientWidth) return;
    e.preventDefault();
    bar.scrollLeft += e.deltaY;
  },
  { passive: false },
);
window.addEventListener("resize", () =>
  markVersionOverflow($("#version-tabs")),
);
$("#home-view").addEventListener("click", () => viewer.home());
$("#new-region").addEventListener("click", () => {
  selectedId = null;
  renderAnnotations();
  setMode("fill");
  toast(t("tool.newRegionHint"));
});
$("#toggle-annotations").addEventListener("click", () => {
  $("#annotations-list").hidden = !$("#annotations-list").hidden;
  const collapsed = $("#annotations-list").hidden;
  $("#toggle-annotations").setAttribute("aria-expanded", String(!collapsed));
  // The icon flips but the label did not: collapsed, the button still told a
  // screen reader it would collapse the list. Found by the catalogue check —
  // "expand" was a translated phrase that nothing ever asked for.
  $("#toggle-annotations").setAttribute(
    "aria-label",
    t(collapsed ? "marks.expand" : "marks.collapse"),
  );
  $(".annotations-panel").classList.toggle(
    "collapsed",
    $("#annotations-list").hidden,
  );
  // Handing the marks over is done while looking at them, so it folds with
  // them; a send button left standing in the gap gives most of the width back.
  $(".panel-actions").hidden = collapsed;
  // A plus beside a list of marks reads as "add a mark", which is a thing this
  // page can actually do — just not here. The control moves a panel sideways,
  // so it points the way the panel will go.
  $("#toggle-annotations").innerHTML = icon(
    $("#annotations-list").hidden ? "expand-right" : "collapse-left",
  );
});
async function travelHistory(redo = false) {
  const from = redo ? redoStack : undoStack,
    to = redo ? undoStack : redoStack;
  if (!from.length) return;
  try {
    const savedUndo = [...undoStack],
      savedRedo = [...redoStack];
    if (!(await beginEdit())) return;
    undoStack = savedUndo;
    redoStack = savedRedo;
    const actualFrom = redo ? redoStack : undoStack,
      actualTo = redo ? undoStack : redoStack;
    actualTo.push(JSON.stringify(annotations));
    annotations = JSON.parse(actualFrom.pop());
    selectedId = null;
    changed();
    await flushDraft();
  } catch (e) {
    toast(e.message);
  }
}
$("#undo").addEventListener("click", () => travelHistory());
$("#redo").addEventListener("click", () => travelHistory(true));
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && mode === "relocate") setMode("orbit");
  if (["TEXTAREA", "INPUT", "SELECT"].includes(document.activeElement?.tagName))
    return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    travelHistory(e.shiftKey);
  }
});
$("#help-button").addEventListener("click", () =>
  $("#help-dialog").showModal(),
);
$("#close-help").addEventListener("click", () => $("#help-dialog").close());
$("#about-button").addEventListener("click", () => {
  $("#about-version").textContent = $("#app-version").textContent;
  $("#about-dialog").showModal();
});
$("#close-about").addEventListener("click", () => $("#about-dialog").close());

function showRecovery(backup) {
  if (recoveryUrl) URL.revokeObjectURL(recoveryUrl);
  recoveryUrl = URL.createObjectURL(
    new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
  );
  $("#download-recovery").href = recoveryUrl;
  $("#download-recovery").download = `ai3d-${loadedId}-unsynced.json`;
  $("#recovery-banner").hidden = false;
}
// The other half of the note beside `bounds` in `flushDraft`: what the service
// added for its own description is taken back off, so the page holds marks in
// one shape whether it just made them or just read them.
const withoutBounds = (list) =>
  (list || []).map((a) => {
    if (!a?.bounds) return a;
    const { bounds: _bounds, ...rest } = a;
    return rest;
  });
async function restoreDraft(draft) {
  annotations = withoutBounds(clone(draft?.annotations));
  labelCursor = Math.max(
    draft?.labelCursor || 0,
    ...annotations
      .filter((a) => a.type === "pin")
      .map((a) => letterNumber(a.label)),
  );
  revision = draft?.revision || 0;
  editSeq = 0;
  savedSeq = 0;
  pendingWrite = null;
  recoveryBlocked = false;
  viewer.restoreCamera(draft?.camera);
  let cached;
  try {
    cached = JSON.parse(localStorage.getItem(draftKey()));
    if (!cached && state.legacyDraftCache)
      cached = JSON.parse(localStorage.getItem(`3d-review-draft-${loadedId}`));
    const backupKey = localStorage.getItem(`${draftKey()}-recovery-latest`);
    if (backupKey) {
      const backup = JSON.parse(localStorage.getItem(backupKey));
      if (backup) showRecovery(backup);
    }
  } catch {}
  // Take the round before anything can return early, and take it unconditionally.
  // This used to sit below the clean-cache exit and behind an ownership test, so
  // a reviewer whose draft was fully saved never claimed it back and had no way
  // to reach it: no banner, no button, and the page offered no explanation.
  // Claiming also returns a draft newer than the poll this load started from.
  try {
    state = await api("review/begin", owner());
    draft = state.draft;
    annotations = withoutBounds(clone(draft?.annotations));
    labelCursor = Math.max(
      draft?.labelCursor || 0,
      ...annotations
        .filter((a) => a.type === "pin")
        .map((a) => letterNumber(a.label)),
    );
    revision = draft?.revision || 0;
  } catch (e) {
    if (e.code !== "NOT_READY") throw e;
  }
  if (!cached?.dirty) return;
  const uncertainWriteMatches =
    cached.pendingWrite?.revision === revision - 1 &&
    sameValue(
      viewer.serializeAnnotations(cached.pendingWrite.annotations),
      draft?.annotations,
    ) &&
    sameValue(cached.pendingWrite.camera, draft?.camera);
  if (cached.revision === revision || uncertainWriteMatches) {
    annotations = cached.annotations;
    labelCursor = Math.max(
      labelCursor,
      cached.labelCursor || 0,
      ...annotations
        .filter((a) => a.type === "pin")
        .map((a) => letterNumber(a.label)),
    );
    viewer.restoreCamera(cached.camera);
    editSeq = cached.editSeq || 1;
    savedSeq = cached.savedSeq || 0;
    pendingWrite = cached.pendingWrite || null;
    toast(t("recovery.restored"));
    return;
  }
  // A genuine concurrent conflict is not an acknowledgement retry. Keep the
  // complete local draft under a separate durable key before allowing edits.
  const backup = { versionId: loadedId, ...cached };
  showRecovery(backup);
  try {
    const key = `${draftKey()}-recovery-${newId()}`;
    localStorage.setItem(key, JSON.stringify(backup));
    const superseded = localStorage.getItem(`${draftKey()}-recovery-latest`);
    localStorage.setItem(`${draftKey()}-recovery-latest`, key);
    // Write, repoint, then drop: a crash never strands the pointer. Only the
    // latest backup is ever offered, so keeping older copies just consumes the
    // quota that has to protect the next unsynced draft.
    if (superseded && superseded !== key) localStorage.removeItem(superseded);
    cacheDraft();
    toast(t("recovery.backedUp"));
  } catch {
    recoveryBlocked = true;
    toast(t("recovery.paused"));
  }
}

// Tabs are the whole point of keeping every version: a marking made against an
// earlier model stays a first-class act instead of something the reviewer has
// to describe in prose. Each tab carries its own draft, so switching is free.
function renderVersions() {
  const bar = $("#version-tabs");
  const versions = state?.versions || [];
  bar.hidden = versions.length < 2;
  if (bar.hidden) {
    bar.textContent = "";
    return;
  }
  const signature = versions
    .map(
      (v) =>
        `${v.id}:${v.active}:${v.annotations}:${v.unsubmitted}:${v.submissions}:${v.busy}:${v.id === viewingId}`,
    )
    .join("|");
  if (bar.dataset.signature === signature) return;
  bar.dataset.signature = signature;
  bar.textContent = "";
  for (const v of versions) {
    const tab = document.createElement("button");
    tab.className = "version-tab";
    tab.type = "button";
    tab.role = "tab";
    tab.dataset.versionId = v.id;
    tab.setAttribute("aria-selected", String(v.id === viewingId));
    if (v.id === viewingId) tab.classList.add("selected");
    if (v.active) tab.classList.add("current");
    const marks = v.annotations || v.submissions;
    tab.title = [
      v.name,
      v.version,
      t("model.triangles", { count: (v.triangles || 0).toLocaleString() }),
      v.active ? t("version.showingNow") : t("version.earlier"),
      v.submissions ? t("version.submitted", { count: v.submissions }) : null,
      v.busy ? t("version.openElsewhere") : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const caption = document.createElement("span");
    caption.textContent = v.label || v.version || v.name || t("common.version");
    tab.append(caption);
    if (marks) {
      const badge = document.createElement("em");
      badge.className = v.unsubmitted ? "badge unsent" : "badge";
      badge.textContent = String(marks);
      tab.append(badge);
    }
    tab.addEventListener("click", () => selectVersion(v.id));
    bar.append(tab);
  }
  // The tabs were replaced a statement ago; their positions, and the width the
  // strip can scroll through, are only settled once the browser has laid them
  // out. Asking now reads the old strip and scrolls to a place that is gone.
  requestAnimationFrame(() => {
    revealCurrentVersion(bar);
    markVersionOverflow(bar);
  });
}
/* A strip that scrolls can hide the tab you are standing on. Seventeen versions
   deep, the one being marked is off the right-hand end on load, and a reviewer
   looking for where he is finds an empty rail. Only move when it is actually
   out of sight: scrolling on every render would fight anyone reading along it. */
function revealCurrentVersion(bar) {
  const tab = bar.querySelector(".version-tab.selected");
  if (!tab) return;
  // Measured against the strip itself, not offsetLeft: the strip is not a
  // positioned element, so offsetLeft counts from some ancestor and scrolling
  // by it lands somewhere else entirely.
  const rail = bar.getBoundingClientRect(),
    seat = tab.getBoundingClientRect();
  if (seat.left < rail.left) bar.scrollLeft -= rail.left - seat.left + 12;
  else if (seat.right > rail.right)
    bar.scrollLeft += seat.right - rail.right + 12;
}
function markVersionOverflow(bar) {
  const scrollable = bar.scrollWidth - bar.clientWidth;
  bar.classList.toggle("overflow-start", bar.scrollLeft > 1);
  bar.classList.toggle("overflow-end", bar.scrollLeft < scrollable - 1);
}
function wasRefused(model, reviewId) {
  return (
    refusedLoad?.versionId === model.id &&
    refusedLoad.sha256 === (model.mesh ?? model).sha256 &&
    refusedLoad.reviewId === reviewId
  );
}
async function selectVersion(id) {
  if (!id || id === viewingId || loadFlight || submitting) return;
  // Clicking a tab is asking again on purpose, which is allowed to fail again.
  refusedLoad = null;
  // Switching costs a full re-tessellation, and the guard above silently drops
  // anything clicked during one. Make the strip look as unavailable as it is,
  // so the clicks are not made in the first place.
  $("#version-tabs").classList.add("busy");
  // Claim the load slot before the first await. The poll starts its own load
  // whenever the Agent's version differs, and two loads racing each other end
  // as a hash mismatch: bytes from one model checked against another's digest.
  loadFlight = (async () => {
    if (editSeq > savedSeq) await flushDraft().catch((e) => toast(e.message));
    viewingId = id;
    // Choosing the version the Agent is showing hands the choice back to it.
    followActive = id === state?.active?.id;
    const full = await api(
      `state?clientId=${encodeURIComponent(clientId)}&versionId=${encodeURIComponent(id)}&full=1`,
    );
    state = full;
    await loadVersion(full);
  })();
  try {
    await loadFlight;
  } finally {
    loadFlight = null;
    $("#version-tabs").classList.remove("busy");
    renderVersions();
    updateButtons();
  }
}
async function loadVersion(fullState) {
  const model = fullState.model || fullState.active;
  if (!model) return;
  viewingId = fullState.viewing || model.id;
  loadedId = model.id;
  loadedFilename = model.filename;
  loadedReviewId = fullState.reviewId;
  sweepDraftCache();
  loadedReceipt = null;
  labelCursor = 0;
  echoId = null;
  relocatingId = null;
  // A new version has nothing said about it yet, so neither the bubble nor the
  // way to ask for it belongs on screen until the Agent speaks again.
  $("#echo-recall").hidden = true;
  hideEcho();
  initialDraftRestored = false;
  annotations = [];
  selectedId = null;
  revision = 0;
  editSeq = 0;
  savedSeq = 0;
  undoStack = [];
  redoStack = [];
  submissionKey = null;
  pendingWrite = null;
  recoveryBlocked = false;
  $("#recovery-banner").hidden = true;
  $("#model-name").textContent = model.name;
  $("#model-version").textContent = model.version;
  $("#model-info").textContent =
    `${model.format.toUpperCase()} · ${unitsLabel(model.units)}`;
  $("#loading").hidden = false;
  $("#loading .spinner").hidden = false;
  $("#loading-text").textContent = t("loading.verifying");
  $("#loading-hint").textContent = t("loading.hint");
  $("#save-status").textContent = t("save.verifying");
  try {
    const stats = await viewer.load(
      model,
      // A source the viewer cannot draw travels with a mesh derived from it at
      // import. The page loads that mesh; `download` still hands over the file
      // the author published.
      endpoint(`api/models/${(model.mesh ?? model).filename}`),
      (stage) => {
        $("#loading-text").textContent = stage;
      },
    );
    if (!stats) return;
    $("#model-info").textContent = t("model.summary", {
      count: model.triangles.toLocaleString(),
      format: model.format.toUpperCase(),
      units: unitsLabel(model.units),
    });
    // The mesh budget is still measured and still reported to acceptance
    // checks; it no longer warns anyone, because nothing about marking changes
    // when it runs out. See server/models.mjs for the measurement that settled
    // it.
    loadedPrecision = stats;
    await restoreDraft(fullState.draft);
    initialDraftRestored = true;
    renderAnnotations();
    $("#loading").hidden = true;
    $("#save-status").textContent =
      editSeq > savedSeq
        ? t("save.restoring")
        : annotations.length
          ? t("save.saved")
          : t("save.notStarted");
    updateButtons();
    if (editSeq > savedSeq) await flushDraft().catch((e) => toast(e.message));
  } catch (e) {
    if (!initialDraftRestored) {
      viewer.enabled = false;
      loadedId = null;
      loadedFilename = null;
      // An identity failure is settled: these bytes will not start matching
      // that hash on a second attempt, so stop asking and leave the reason on
      // screen. Everything else — a dropped fetch, a service restarting — is
      // worth another poll.
      if (e.code === "HASH_MISMATCH")
        refusedLoad = {
          versionId: model.id,
          sha256: (model.mesh ?? model).sha256,
          reviewId: fullState.reviewId,
        };
    }
    $("#loading-text").textContent = e.message;
    $("#loading .spinner").hidden = true;
    toast(e.message);
    updateButtons();
  }
}
function sameValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]),
    )
  );
}
async function readState() {
  try {
    if (loadFlight || beginFlight || saveFlight || submitting) return;
    const statePath =
      `state?clientId=${encodeURIComponent(clientId)}` +
      (viewingId ? `&versionId=${encodeURIComponent(viewingId)}` : "");
    const wasBlocked = accessBlocked;
    let incoming;
    try {
      incoming = await api(statePath);
    } catch (e) {
      if (e.code !== "ACCESS_REQUIRED") throw e;
      // The host must already have admitted this TCP peer. No credential is
      // supplied by JavaScript or the URL; the response sets an HttpOnly cookie.
      await api("access/claim", {});
      accessRecoveryNeeded = true;
      incoming = await api(statePath);
    }
    // A sibling tab may have collected the shared HttpOnly cookie. This tab
    // still needs its own association even if it did not win /claim.
    if (wasBlocked) accessRecoveryNeeded = true;
    if (loadFlight || beginFlight || saveFlight || submitting) return;
    if (
      accessRecoveryNeeded &&
      loadedReceipt &&
      incoming.active?.id === loadedId &&
      incoming.reviewId === loadedReviewId
    ) {
      // Re-associate only this verified model/tab, then recover its draft using
      // the existing revision/conflict checks. Never claim a foreign edit lock.
      await api("ready", { ...owner(), ...loadedReceipt });
      incoming = await api(`${statePath}&full=1`);
      state = incoming;
      await restoreDraft(incoming.draft);
      renderAnnotations();
    }
    accessBlocked = false;
    const recovered = accessRecoveryNeeded;
    accessRecoveryNeeded = false;
    // Follow whatever the Agent puts on screen, unless the reviewer pinned an
    // earlier tab. Their own choice outranks the Agent's; an unsynced draft
    // outranks both, because reloading the viewer would discard it.
    const wanted = followActive ? incoming.active?.id : viewingId;
    if (wanted !== loadedId || incoming.reviewId !== loadedReviewId) {
      if (loadedId && editSeq > savedSeq) {
        toast(t("version.driftStopped"));
        return;
      }
      const full = await api(
        `state?clientId=${encodeURIComponent(clientId)}&full=1` +
          (wanted ? `&versionId=${encodeURIComponent(wanted)}` : ""),
      );
      if (beginFlight || saveFlight || submitting || editSeq > savedSeq) return;
      state = full;
      const candidate = full.model || full.active;
      if (candidate && wasRefused(candidate, full.reviewId)) {
        // Deliberately nothing: the reason this version is not on screen is
        // already on screen, and loading it again would only replace it with a
        // spinner and arrive at the same place.
      } else if (candidate) {
        loadFlight = loadVersion(full);
        await loadFlight;
        loadFlight = null;
      } else {
        $("#loading-text").textContent = t("model.awaitingFirst");
        $("#loading .spinner").hidden = true;
      }
    } else state = incoming;
    if (recovered && state?.owned && editSeq > savedSeq && !recoveryBlocked)
      await flushDraft();
    $(".connection-dot").classList.add("online");
    // The compiled-in version is the build this page was cut from, which is
    // only the running one until somebody upgrades the service under an open
    // tab. Once the service has said which it is, it is the one that counts.
    if (incoming.version) $("#app-version").textContent = incoming.version;
    showUpdate(incoming.update);
    $("#connection-status").textContent = incoming.notifier?.send
      ? t("conn.origin")
      : incoming.owned || state?.submissions?.length
        ? t("conn.collect")
        : t("conn.local");
    updateEcho(incoming);
    updateOutbox(incoming);
    updateClosing(incoming);
    updateButtons();
  } catch (e) {
    $(".connection-dot").classList.remove("online");
    // A service that announced its own reclaim and then stopped answering did
    // not fail. Saying "offline" here would describe a crash, and would leave
    // the reviewer with no reason to believe their marks are still there.
    if (wasReclaimed()) {
      $("#connection-status").textContent = t("conn.reclaimed");
      $("#save-status").textContent = t("closing.done");
      $("#closing-text").textContent = t("closing.done");
      $("#closing-banner").hidden = false;
      updateButtons();
      return;
    }
    $("#connection-status").textContent = accessBlocked
      ? t("conn.returnToChat")
      : t("conn.paused");
    $("#save-status").textContent = accessBlocked
      ? loadedId && initialDraftRestored
        ? t("conn.accessExpired")
        : t("conn.noAccess")
      : t("conn.offline");
    updateButtons();
  }
}
// The warning can be called off: anything the reviewer does resets the clock,
// and the service withdraws the notice on its own. So this follows the service
// both ways while it is still answering, and only sticks once it stops.
function updateClosing(incoming) {
  closingNotice = incoming.closing || null;
  lastIdle = incoming.idle || null;
  $("#closing-banner").hidden = !closingNotice;
  if (closingNotice) $("#closing-text").textContent = t("closing.pending");
}
// Nothing is left to ask, so this is read off the last thing the service said.
// A reading taken within a couple of announcement ticks of a deadline the
// service had published in advance, followed by silence, is that deadline
// arriving — no outage lines up with it that precisely.
function wasReclaimed() {
  if (closingNotice) return true;
  if (!lastIdle?.limitMs) return false;
  const slack = Math.max(lastIdle.graceMs || 0, 60_000) * 2;
  return lastIdle.forMs >= lastIdle.limitMs - slack;
}
function updateReceipt() {
  if (submitting) return;
  const last = state?.submissions?.findLast((s) => s.versionId === loadedId);
  if (!last) {
    $("#feedback-status").textContent = annotations.length
      ? t("feedback.notSubmitted")
      : t("feedback.default");
    return;
  }
  // "waiting" is not a delivery in progress. Saying "will retry" about a host
  // that never had anywhere to push would promise something nothing is doing.
  const delivery = last.deliveredAt
    ? t("feedback.delivered")
    : last.status === "waiting"
      ? t("feedback.waiting")
      : last.status === "accepted"
        ? t("feedback.acceptedPending")
        : t("feedback.deliveryUnconfirmed");
  const status = `${t("feedback.saved")} · ${delivery} · ${
    last.readAt ? t("feedback.read") : t("feedback.unread")
  }`;
  $("#feedback-status").textContent =
    status +
    (editSeq > savedSeq || revision !== last.revision
      ? t("feedback.alsoUnsubmitted")
      : "");
}
// The one channel that would report a delivery failure is the channel that is
// failing, so the reviewer is the only person present to tell. A single missed
// attempt is a blip the retry covers; from the second one the page says so and
// keeps saying it, with the host's own reason rather than a generic apology.
function updateOutbox(incoming) {
  const stuck = (incoming.submissions || []).filter(
    (item) => item.status !== "accepted" && (item.attempts || 0) >= 2,
  );
  $("#outbox-banner").hidden = !stuck.length;
  if (!stuck.length) return;
  const stalled = stuck.filter((item) => item.status === "stalled");
  const worst = stalled[0] || stuck[0];
  const reason = worst.lastError?.message
    ? t("outbox.reason", { message: worst.lastError.message })
    : t("outbox.reasonUnknown");
  $("#outbox-text").textContent = stalled.length
    ? t("outbox.stuck", {
        count: stuck.length,
        attempts: worst.attempts,
        reason,
      })
    : t("outbox.retrying", {
        count: stuck.length,
        attempts: worst.attempts,
        reason,
      });
}
function updateEcho(incoming) {
  const echo = incoming.echo;
  $("#echo-stale").hidden =
    !echo || (echo.revision === revision && editSeq === savedSeq);
  if ((echo?.id || null) === echoId || !viewer.enabled) return;
  echoId = echo?.id || null;
  viewer.setAgentEcho(echo?.versionId === loadedId ? echo : null);
  $("#echo-summary").textContent = viewer.agentEcho
    ? t("echo.summary", { summary: echo.summary })
    : "";
  $("#echo-recall").hidden = !viewer.agentEcho;
  if (viewer.agentEcho) showEcho({ linger: true });
  else hideEcho();
}
/* A mark beside the version, and nothing else. The reviewer is usually not the
   person who installs anything — they were handed a URL — so this says what is
   true and who to tell, and does not pretend the page can act on it. The
   service is silent unless there is genuinely something newer than what is
   installed, so an absent badge is the normal state, not a failed check. */
function showUpdate(update) {
  const badge = $("#app-update");
  if (!update?.version) {
    badge.hidden = true;
    return;
  }
  const hint = t("app.updateHint", { version: update.version });
  badge.textContent = update.version;
  badge.title = hint;
  badge.setAttribute("aria-label", hint);
  // Release notes if the upstream named them; otherwise it is only a label,
  // and a link that goes nowhere is worse than a word that never claimed to.
  if (update.url) badge.href = update.url;
  else badge.removeAttribute("href");
  badge.hidden = false;
}
function pollState() {
  if (pollFlight) return pollFlight;
  pollFlight = readState().finally(() => {
    pollFlight = null;
  });
  return pollFlight;
}
$("#submit-feedback").addEventListener("click", async () => {
  if (submitting) return;
  submitting = true;
  updateButtons();
  $("#submit-feedback").textContent = t("feedback.submitting");
  try {
    await flushDraft();
    submissionKey ||=
      state?.submissions?.findLast(
        (s) => s.versionId === loadedId && s.revision === revision,
      )?.id || newId();
    const result = await api("feedback", {
      ...owner(),
      revision,
      submissionId: submissionKey,
    });
    state.draft = { ...state.draft, submittedRevision: revision };
    state.submissions = [
      ...(state.submissions || []).filter((s) => s.id !== result.id),
      result,
    ];
    updateReceipt();
    toast(t("feedback.submitted"));
  } catch (e) {
    $("#feedback-status").textContent = e.message;
    toast(e.message);
  } finally {
    submitting = false;
    $("#submit-feedback").innerHTML = `${T("feedback.submit")} ${icon("send")}`;
    updateButtons();
  }
});
$("#go-latest").addEventListener("click", () => {
  const latest = latestVersion(state?.versions);
  if (latest?.id) selectVersion(latest.id).catch((e) => toast(e.message));
});
$("#resume-review").addEventListener("click", async () => {
  if (submitting) return;
  submitting = true;
  updateButtons();
  try {
    state = await api("review/resume", owner());
    await restoreDraft(state.draft);
    selectedId = null;
    undoStack = [];
    redoStack = [];
    renderAnnotations();
    if (editSeq > savedSeq) await flushDraft();
    toast(t("resume.picked"));
  } catch (e) {
    toast(e.message);
  } finally {
    submitting = false;
    updateButtons();
  }
});

window.addEventListener("beforeunload", (e) => {
  if (editSeq > savedSeq) {
    cacheDraft();
    e.preventDefault();
    e.returnValue = "";
  }
});
await pollState();
setInterval(pollState, 2200);
// A visible user action extends remembered-browser access. Passive state and
// lock heartbeats do not count as use; no unconditional renewal timer runs.
let activityTimer = null,
  activityFlight = false,
  activityPending = false,
  lastActivitySent = 0;
function noteActivity(event) {
  if (!event.isTrusted || document.visibilityState !== "visible") return;
  activityPending = true;
  scheduleActivity();
}
function scheduleActivity() {
  if (
    activityTimer ||
    activityFlight ||
    !activityPending ||
    !loadedId ||
    accessBlocked ||
    document.visibilityState !== "visible"
  )
    return;
  activityTimer = setTimeout(
    async () => {
      activityTimer = null;
      if (document.visibilityState !== "visible" || !loadedId || accessBlocked)
        return;
      activityPending = false;
      activityFlight = true;
      try {
        await api("access/activity", { clientId });
        lastActivitySent = Date.now();
      } catch {
        // The state poll handles lost authorization. Keep any unsynced draft.
      } finally {
        activityFlight = false;
        scheduleActivity();
      }
    },
    Math.max(0, 60_000 - (Date.now() - lastActivitySent)),
  );
}
for (const event of ["pointerdown", "wheel", "keydown"])
  document.addEventListener(event, noteActivity, { passive: true });
document.addEventListener("visibilitychange", noteActivity);
setInterval(() => {
  if (state?.owned && !accessBlocked)
    api("review/heartbeat", { clientId, versionId: loadedId }).catch(() => {});
}, 10000);

/* ---------------- AI dock: chat + MCP ---------------- */

const chatMessages = new Map();
let chatSince = 0;
let chatConnected = false;
let chatBusy = false;
let chatPollTimer = null;
let chatSending = false;
let mcpConnections = [];
let mcpCalling = false;
let aiDockOpen = false;
let aiActiveTab = "gen";

function setAiDock(open) {
  aiDockOpen = open;
  const dock = $("#ai-dock");
  dock.hidden = !open;
  document.body.classList.toggle("ai-dock-open", open);
  $("#ai-button").setAttribute("aria-expanded", String(open));
  if (open) {
    if (aiActiveTab === "chat") startChatPoll();
    else stopChatPoll();
  } else {
    stopChatPoll();
  }
}

function setAiTab(tab) {
  aiActiveTab = tab;
  document.querySelectorAll(".ai-tab").forEach((b) => {
    const active = b.dataset.aiTab === tab;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".ai-pane").forEach((p) => {
    p.hidden = p.dataset.aiPane !== tab;
  });
  if (aiDockOpen) {
    if (tab === "chat") startChatPoll();
    else stopChatPoll();
  }
}

function startChatPoll() {
  stopChatPoll();
  chatPollTimer = setInterval(pollChat, 3000);
  pollChat();
}

function stopChatPoll() {
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}

async function pollChat() {
  if (!aiDockOpen || aiActiveTab !== "chat") return;
  const status = $("#chat-status");
  status.textContent = T("chat.connecting");
  try {
    const res = await fetch(endpoint(`api/chat?since=${chatSince}`));
    let json;
    try {
      json = await res.json();
    } catch {
      throw new Error(t("conn.dropped"));
    }
    if (!res.ok) throw new Error(serverMessage(json));
    chatConnected = !!json.connected;
    chatBusy = !!json.busy;
    if (json.messages) {
      let maxTs = chatSince;
      for (const m of json.messages) {
        const ts = Number(m.timestamp) || Date.parse(m.timestamp) || 0;
        if (ts > maxTs) maxTs = ts;
        if (m.id != null) chatMessages.set(m.id, { ...m, _ts: ts });
      }
      chatSince = maxTs;
    }
    renderChat();
  } catch {
    chatConnected = false;
    renderChat();
  }
}

function renderChat() {
  const box = $("#chat-messages");
  const status = $("#chat-status");
  if (!chatConnected) {
    box.innerHTML = `<div class="chat-empty">${T("chat.unavailable")}</div>`;
    status.textContent = "";
    return;
  }
  if (chatMessages.size === 0) {
    box.innerHTML = `<div class="chat-empty">${T("chat.empty")}</div>`;
  } else {
    const sorted = [...chatMessages.values()].sort((a, b) => a._ts - b._ts);
    box.innerHTML = sorted
      .map((m) => {
        const role = m.role === "user" ? "chat-you" : "chat-agent";
        const who = m.role === "user" ? T("chat.you") : T("chat.agent");
        return `<div class="chat-msg ${role}"><span class="chat-who">${who}</span><span class="chat-text">${esc(m.text)}</span></div>`;
      })
      .join("");
    box.scrollTop = box.scrollHeight;
  }
  status.textContent = chatBusy ? T("chat.thinking") : "";
}

async function sendChat() {
  if (chatSending) return;
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text) return;
  chatSending = true;
  const sendBtn = $("#chat-send");
  sendBtn.disabled = true;
  sendBtn.querySelector("span").textContent = T("chat.sending");
  input.value = "";
  try {
    await api("chat", { message: text });
    await pollChat();
  } catch (err) {
    toast(err.message || t("error.chatUnavailable"));
  } finally {
    chatSending = false;
    sendBtn.disabled = false;
    sendBtn.querySelector("span").textContent = T("chat.send");
  }
}

async function loadMcpConnections() {
  const box = $("#mcp-connections");
  box.innerHTML = `<div class="mcp-empty">${T("mcp.loading")}</div>`;
  try {
    const data = await api("mcp/connections", undefined, "GET");
    mcpConnections = data.connections || [];
    renderMcpConnections();
    renderMcpToolSelectors();
  } catch (err) {
    toast(err.message);
  }
}

function renderMcpConnections() {
  const box = $("#mcp-connections");
  if (mcpConnections.length === 0) {
    box.innerHTML = `<div class="mcp-empty">${T("mcp.empty")}</div>`;
    return;
  }
  box.innerHTML = mcpConnections
    .map((c) => {
      const status = c.connected ? T("mcp.connected") : T("mcp.disconnected");
      const toolCount =
        c.connected && c.tools
          ? T("mcp.toolCount", { count: c.tools.length })
          : "";
      return `<div class="mcp-connection" data-id="${esc(c.id)}">
      <div class="mcp-conn-info">
        <strong>${esc(c.name)}</strong>
        <span class="mcp-conn-cmd">${esc(c.command)}</span>
        <span class="mcp-conn-status ${c.connected ? "on" : "off"}">${status}</span>
        ${toolCount ? `<span class="mcp-conn-tools">${toolCount}</span>` : ""}
      </div>
      <div class="mcp-conn-actions">
        ${
          c.connected
            ? `<button class="quiet mcp-disconnect" data-id="${esc(c.id)}">${T("mcp.disconnect")}</button>`
            : `<button class="quiet mcp-connect" data-id="${esc(c.id)}">${T("mcp.connect")}</button>`
        }
        <button class="quiet mcp-remove" data-id="${esc(c.id)}">${T("mcp.remove")}</button>
      </div>
    </div>`;
    })
    .join("");
}

function renderMcpToolSelectors() {
  const serverSel = $("#mcp-server");
  const toolSel = $("#mcp-tool");
  const connected = mcpConnections.filter((c) => c.connected);
  if (connected.length === 0) {
    $("#mcp-tools").hidden = true;
    return;
  }
  $("#mcp-tools").hidden = false;
  serverSel.innerHTML = connected
    .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
    .join("");
  const first = connected[0];
  toolSel.innerHTML = (first.tools || [])
    .map(
      (tool) => `<option value="${esc(tool.name)}">${esc(tool.name)}</option>`,
    )
    .join("");
}

async function saveMcpConnection() {
  const name = $("#mcp-name").value.trim();
  const command = $("#mcp-command").value.trim();
  const args = $("#mcp-args").value.trim().split(/\s+/).filter(Boolean);
  if (!command) {
    toast(t("mcp.commandRequired"));
    return;
  }
  try {
    await api("mcp/connections", { name, command, args });
    $("#mcp-name").value = "";
    $("#mcp-command").value = "";
    $("#mcp-args").value = "";
    await loadMcpConnections();
  } catch (err) {
    toast(err.message);
  }
}

async function mcpConnect(id) {
  try {
    await api("mcp/connect", { id });
    await loadMcpConnections();
  } catch (err) {
    toast(err.message);
  }
}

async function mcpDisconnect(id) {
  try {
    await api("mcp/disconnect", { id });
    await loadMcpConnections();
  } catch (err) {
    toast(err.message);
  }
}

async function mcpRemove(id) {
  if (!confirm(t("mcp.removeConfirm"))) return;
  try {
    await api("mcp/connections/remove", { id });
    await loadMcpConnections();
  } catch (err) {
    toast(err.message);
  }
}

async function mcpCallTool() {
  if (mcpCalling) return;
  const serverId = $("#mcp-server").value;
  const toolName = $("#mcp-tool").value;
  const argsRaw = $("#mcp-args-json").value.trim();
  if (!serverId || !toolName) return;
  let args = {};
  if (argsRaw) {
    try {
      args = JSON.parse(argsRaw);
    } catch {
      toast(t("mcp.invalidJson"));
      return;
    }
  }
  mcpCalling = true;
  const callBtn = $("#mcp-call");
  callBtn.disabled = true;
  callBtn.querySelector("span").textContent = T("mcp.calling");
  try {
    const data = await api("mcp/tools/call", {
      id: serverId,
      name: toolName,
      args,
    });
    const result = data.result;
    let text;
    if (result?.content) {
      text = result.content.map((c) => c.text || "").join("\n");
    } else {
      text = JSON.stringify(result, null, 2);
    }
    $("#mcp-result").textContent = text;
  } catch (err) {
    $("#mcp-result").textContent = `${t("mcp.error")}: ${err.message}`;
  } finally {
    mcpCalling = false;
    callBtn.disabled = false;
    callBtn.querySelector("span").textContent = T("mcp.call");
  }
}

function initAiDock() {
  $("#mcp-server").setAttribute("aria-label", t("mcp.chooseServer"));
  $("#mcp-tool").setAttribute("aria-label", t("mcp.chooseTool"));
  $("#mcp-args-json").setAttribute("aria-label", t("mcp.argsJson"));
  $("#mcp-result").setAttribute("aria-label", t("mcp.result"));
  $("#mcp-result").textContent = t("mcp.resultPlaceholder");
  $("#mcp-name").setAttribute("aria-label", t("mcp.name"));
  $("#mcp-command").setAttribute("aria-label", t("mcp.command"));
  $("#mcp-args").setAttribute("aria-label", t("mcp.args"));
  const addTitle = document.createElement("div");
  addTitle.className = "mcp-section-title";
  addTitle.textContent = t("mcp.add");
  $("#mcp-connections").before(addTitle);
  const toolsTitle = document.createElement("div");
  toolsTitle.className = "mcp-section-title";
  toolsTitle.textContent = t("mcp.tools");
  $("#mcp-tools").before(toolsTitle);
}

$("#ai-button").addEventListener("click", () => setAiDock(!aiDockOpen));
document
  .querySelectorAll(".ai-tab")
  .forEach((b) => b.addEventListener("click", () => setAiTab(b.dataset.aiTab)));
$("#chat-send").addEventListener("click", sendChat);
$("#chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
});
$("#mcp-save").addEventListener("click", saveMcpConnection);
$("#mcp-connections").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.classList.contains("mcp-connect")) mcpConnect(id);
  else if (btn.classList.contains("mcp-disconnect")) mcpDisconnect(id);
  else if (btn.classList.contains("mcp-remove")) mcpRemove(id);
});
$("#mcp-server").addEventListener("change", (e) => {
  const conn = mcpConnections.find((c) => c.id === e.target.value);
  const toolSel = $("#mcp-tool");
  toolSel.innerHTML = (conn?.tools || [])
    .map(
      (tool) => `<option value="${esc(tool.name)}">${esc(tool.name)}</option>`,
    )
    .join("");
});
$("#mcp-call").addEventListener("click", mcpCallTool);

// --- Asset Generation ---
const genState = {
  model: null,
  generating: false,
  optimizing: false,
  originalModel: null,
  lods: [],
  activeLod: 0,
  variants: [],
};
let selectedGenKit = "dungeon";

/* i18n catalogues carry the template labels and prompt aliases. The catalogue
   keys themselves are written out here so the i18n checker can see every
   translation is reachable from the code. */
const GEN_TYPE_KEYS = {
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
};

const GEN_ALIAS_KEYS = {
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
};

const GEN_KIT_KEYS = {
  dungeon: "gen.kit.dungeon",
  camp: "gen.kit.camp",
  outpost: "gen.kit.outpost",
  village: "gen.kit.village",
  temple: "gen.kit.temple",
  battle: "gen.kit.battle",
  wilderness: "gen.kit.wilderness",
  town: "gen.kit.town",
};

/* Prompt matching is intentionally multilingual: an AI3D user may describe an
   asset in any of the six shipped languages. Longest aliases are tried first
   so "板条箱" beats the shorter "箱子" that also appears in it. */
const PROMPT_ALIASES = [];
for (const table of Object.values(CATALOGUES)) {
  for (const [type, key] of Object.entries(GEN_ALIAS_KEYS)) {
    for (const alias of String(table[key] || "").split(",")) {
      const clean = alias.trim().toLowerCase();
      if (!clean) continue;
      PROMPT_ALIASES.push({ alias: clean, type });
    }
  }
}
PROMPT_ALIASES.sort((a, b) => b.alias.length - a.alias.length);

// --- Asset Library ---
const assetLibrary = {
  assets: [],
  load() {
    try {
      const data = localStorage.getItem("ai3d-asset-library");
      if (data) this.assets = JSON.parse(data);
    } catch {
      this.assets = [];
    }
  },
  save() {
    try {
      localStorage.setItem("ai3d-asset-library", JSON.stringify(this.assets));
    } catch {
      // Storage full or unavailable
    }
  },
  add(asset) {
    this.assets.unshift({
      ...asset,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    });
    this.save();
  },
  remove(id) {
    this.assets = this.assets.filter((a) => a.id !== id);
    this.save();
  },
  toggleFavorite(id) {
    const asset = this.assets.find((a) => a.id === id);
    if (asset) {
      asset.favorite = !asset.favorite;
      this.save();
    }
  },
  rename(id, name) {
    const asset = this.assets.find((a) => a.id === id);
    if (asset) {
      asset.name = name;
      this.save();
    }
  },
  clear() {
    this.assets = [];
    this.save();
  },
  search(query) {
    const q = query.toLowerCase();
    return this.assets.filter(
      (a) =>
        a.prompt.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        a.style.toLowerCase().includes(q),
    );
  },
  searchByTag(tag) {
    if (!tag) return this.assets;
    return this.assets.filter((a) => a.tags && a.tags.includes(tag));
  },
  getAllTags() {
    const tags = new Set();
    this.assets.forEach((a) => {
      if (a.tags) a.tags.forEach((t) => tags.add(t));
    });
    return Array.from(tags).sort();
  },
};

assetLibrary.load();

function setGenStatus(message, type = "") {
  const status = $("#gen-status");
  status.textContent = message;
  status.className = `gen-status ${type}`;
}

function setGenActions(show) {
  $("#gen-actions").hidden = !show;
}

function setGenExportPanel(show) {
  $("#gen-export-panel").hidden = !show;
}

let genPreview = null;
let genPreviewPlaying = true;
let genPreviewSpin = true;

function syncGenPreview() {
  if (!genPreview || !genState.model?.threeObject) return;
  const choice = $("#gen-animation")?.value || "auto";
  const previewModel = cloneModelDeep(genState.model.threeObject);
  previewModel.animations = selectAnimations(previewModel, choice);
  genPreview.setModel(previewModel);
  genPreview.setPlaying(true);
  genPreviewPlaying = true;
  const playButton = $("#gen-preview-play");
  if (playButton) {
    playButton.classList.remove("active");
    playButton.setAttribute("aria-label", t("gen.previewPlay"));
    playButton.setAttribute("title", t("gen.previewPlay"));
    playButton.querySelector("use")?.setAttribute("href", "#mc-play");
  }
  const clips = previewModel.animations || [];
  const clipSelect = $("#gen-preview-clip");
  if (!clipSelect) return;
  clipSelect.innerHTML = [
    `<option value="">${esc(t("gen.animationNone"))}</option>`,
    ...clips.map(
      (clip) => `<option value="${esc(clip.name)}">${esc(clip.name)}</option>`,
    ),
  ].join("");
  const current = clipSelect.value;
  if (current && clips.some((clip) => clip.name === current)) {
    genPreview.setClip(current);
  } else {
    clipSelect.value = clips.length ? clips[0].name : "";
    if (clips.length) genPreview.setClip(clips[0].name);
  }
  if (genPreviewSpin) genPreview.setAutoRotate(true);
}

function showGenPreview() {
  if (!genPreview) return;
  $("#gen-preview").hidden = false;
  syncGenPreview();
}

function updateGenPreviewPlayButton() {
  const playButton = $("#gen-preview-play");
  if (!playButton) return;
  playButton.classList.toggle("active", !genPreviewPlaying);
  playButton.setAttribute(
    "aria-label",
    t(genPreviewPlaying ? "gen.previewPlay" : "gen.previewPause"),
  );
  playButton.setAttribute(
    "title",
    t(genPreviewPlaying ? "gen.previewPlay" : "gen.previewPause"),
  );
  playButton
    .querySelector("use")
    ?.setAttribute("href", genPreviewPlaying ? "#mc-play" : "#mc-pause");
}

async function generateAsset() {
  if (genState.generating) return;
  const prompt = $("#gen-prompt").value.trim();
  if (!prompt) {
    setGenStatus(t("gen.empty"), "warn");
    return;
  }
  const style = $("#gen-style").value;
  const color = $("#gen-color").value;
  const material = readMaterialSettings();
  const seedInput = $("#gen-seed").value.trim();
  const seed =
    seedInput === "" ? null : Math.max(0, Math.floor(Number(seedInput) || 0));
  genState.generating = true;
  setGenStatus(t("gen.generating"), "info");
  setGenActions(false);
  try {
    const assetType = parseAssetPrompt(prompt, style);
    const model = generateThreeAsset(assetType.type, {
      size: assetType.size,
      segments: assetType.segments,
      style: assetType.style,
      color: color,
      seed,
      material,
      texture: material.texture,
      textureStrength: material.textureStrength,
    });
    genState.model = {
      ...assetType,
      threeObject: model,
      color,
      seed,
      material,
      texture: material.texture,
      textureStrength: material.textureStrength,
      tags: getAssetTags(assetType.type),
    };
    genState.originalModel = cloneModelDeep(model);
    genState.lods = [];
    genState.activeLod = 0;
    const stats = getAssetStats(model);
    setGenStatus(
      `${t("gen.applied")} (${stats.triangles} ${t("gen.triangles")} · ${stats.vertices} ${t("gen.vertices")} · ${stats.parts} ${t("gen.parts")})`,
      "ok",
    );
    setGenActions(true);
    setGenOptimizePanel(false);
    showGenPreview();
  } catch (err) {
    setGenStatus(t("gen.error"), "error");
  } finally {
    genState.generating = false;
  }
}

function generateVariants() {
  if (genState.generating) return;
  const prompt = $("#gen-prompt").value.trim();
  if (!prompt) {
    setGenStatus(t("gen.empty"), "warn");
    return;
  }
  const style = $("#gen-style").value;
  const color = $("#gen-color").value;
  const material = readMaterialSettings();
  const seedInput = $("#gen-seed").value.trim();
  const baseSeed =
    seedInput === ""
      ? Math.floor(Math.random() * 1_000_000)
      : Math.max(0, Math.floor(Number(seedInput) || 0));
  const count = Math.max(
    1,
    Math.min(12, Number($("#gen-variant-count").value) || 4),
  );
  genState.generating = true;
  setGenStatus(t("gen.generating"), "info");
  try {
    const assetType = parseAssetPrompt(prompt, style);
    const variants = generateVariantSet(assetType.type, {
      size: assetType.size,
      segments: assetType.segments,
      style: assetType.style,
      color,
      material,
      texture: material.texture,
      textureStrength: material.textureStrength,
      count,
      baseSeed,
    });
    genState.variants = variants.map((variant) => ({
      ...assetType,
      seed: variant.seed,
      stats: variant.stats,
      threeObject: variant.model,
      color,
      material,
      texture: material.texture,
      textureStrength: material.textureStrength,
    }));
    renderVariantGrid();
    setGenStatus(
      t("gen.variantsReady", { count: String(genState.variants.length) }),
      "ok",
    );
  } catch {
    setGenStatus(t("gen.error"), "error");
  } finally {
    genState.generating = false;
  }
}

function renderVariantGrid() {
  const container = $("#gen-variants");
  if (!container) return;
  const saveAll = $("#gen-variants-save-all");
  saveAll.hidden = genState.variants.length === 0;
  if (genState.variants.length === 0) {
    container.innerHTML = `<div class="gen-library-empty">${t("gen.variantsEmpty")}</div>`;
    return;
  }
  container.innerHTML = genState.variants
    .map(
      (variant, index) => `
    <div class="gen-variant-card" data-index="${index}" title="${esc(variant.type)} #${esc(String(variant.seed))}">
      <div class="gen-asset-preview" data-preview="variant-${index}"></div>
      <div class="gen-variant-meta">
        <strong>#${esc(String(variant.seed))}</strong>
        <small>${variant.stats.triangles} ${t("gen.triangles")}</small>
      </div>
      <div class="gen-variant-actions">
        <button type="button" class="quiet" data-variant-save="${index}">${t("mcp.save")}</button>
        <button type="button" class="quiet" data-variant-load="${index}">${t("gen.import")}</button>
      </div>
    </div>
  `,
    )
    .join("");
  genState.variants.forEach((variant, index) =>
    renderAssetPreview({ ...variant, id: `variant-${index}` }),
  );
}

function saveVariant(index) {
  const variant = genState.variants[index];
  if (!variant) return;
  assetLibrary.add({
    ...variant,
    threeObject: null,
  });
  renderAssetLibrary();
  setGenStatus(t("gen.applied"), "ok");
}

function saveAllVariants() {
  if (genState.variants.length === 0) {
    setGenStatus(t("gen.variantsEmpty"), "warn");
    return;
  }
  genState.variants.forEach((variant) => {
    assetLibrary.add({
      ...variant,
      threeObject: null,
    });
  });
  renderAssetLibrary();
  setGenStatus(t("gen.applied"), "ok");
}

function loadVariant(index) {
  const variant = genState.variants[index];
  if (!variant) return;
  const model = cloneModelDeep(variant.threeObject);
  genState.model = { ...variant, threeObject: model };
  genState.originalModel = cloneModelDeep(model);
  genState.lods = [];
  genState.activeLod = 0;
  setGenOptimizePanel(false);
  setGenExportPanel(false);
  setGenActions(true);
  setGenStatus(t("gen.applied"), "ok");
  showGenPreview();
}

function readMaterialSettings() {
  const emissive = $("#gen-emissive").value;
  return {
    roughness: parseFloat($("#gen-roughness").value),
    metalness: parseFloat($("#gen-metalness").value),
    emissive: emissive === "#000000" ? null : emissive,
    texture: $("#gen-texture").value || "auto",
    textureStrength: parseFloat($("#gen-texture-strength").value) || 0.8,
  };
}

function pngBytesToDataUrl(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
    );
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

function renderTextureStrip() {
  const strip = $("#gen-texture-strip");
  if (!strip) return;
  const choice = $("#gen-texture").value || "auto";
  const strength = parseFloat($("#gen-texture-strength").value) || 0.8;
  const info = getAssetTextureInfo(
    { type: "cube", texture: choice, textureStrength: strength },
    1,
  );
  if (!info) {
    strip.innerHTML = "";
    return;
  }
  strip.innerHTML = ["albedo", "normal", "roughness", "metalness"]
    .filter((name) => info.textures[name])
    .map(
      (name) =>
        `<span class="gen-texture-swatch"><img src="${pngBytesToDataUrl(info.textures[name])}" alt="" draggable="false"><small>${name}</small></span>`,
    )
    .join("");
}

function parseAssetPrompt(prompt, style) {
  const lower = prompt.toLowerCase();
  let type = "cube";
  let size = 1;
  let segments = 16;

  for (const { alias, type: matched } of PROMPT_ALIASES) {
    if (lower.includes(alias)) {
      type = matched;
      break;
    }
  }

  // Extract size hints
  const sizeMatch = lower.match(/(\d+(?:\.\d+)?)\s*(m|meter)/);
  if (sizeMatch) size = parseFloat(sizeMatch[1]);

  // Extract segment hints for low-poly
  if (style === "lowpoly") segments = 8;
  else if (style === "realistic") segments = 32;
  else segments = 16;

  return { type, size, segments, style, prompt };
}

function importGenModel() {
  if (!genState.model || !genState.model.threeObject) {
    setGenStatus(t("gen.noModel"), "warn");
    return;
  }
  // Dispatch event for viewer to pick up
  window.dispatchEvent(
    new CustomEvent("ai3d:import-generated", { detail: genState.model }),
  );
  setGenStatus(t("gen.applied"), "ok");
}

function setGenOptimizePanel(show) {
  $("#gen-optimize-panel").hidden = !show;
}

function refreshGenOptimizePanel() {
  const count = genState.model?.threeObject
    ? countTriangles(genState.model.threeObject)
    : 0;
  const tri = $("#gen-tri-count");
  if (tri) tri.textContent = String(count);
  const target = $("#gen-target-tri");
  if (target) {
    const next = Math.max(100, Math.floor(Number(target.value) || 0));
    target.value = String(next);
  }
  const lodRow = $("#gen-lod-row");
  if (lodRow) lodRow.hidden = genState.lods.length === 0;
  document.querySelectorAll("#gen-lod-row [data-lod]").forEach((btn) => {
    btn.classList.toggle(
      "active",
      Number(btn.dataset.lod) === genState.activeLod,
    );
  });
}

function optimizeGenModel() {
  if (!genState.model || !genState.model.threeObject) {
    setGenStatus(t("gen.noModel"), "warn");
    return;
  }
  setGenOptimizePanel(true);
  refreshGenOptimizePanel();
}

function decimateGenModel() {
  if (!genState.model || !genState.originalModel) return;
  setGenStatus(t("gen.optimizing"), "info");
  const target = Math.max(
    100,
    Math.min(100000, Math.floor(Number($("#gen-target-tri").value) || 0)),
  );
  const working = cloneModelDeep(genState.originalModel);
  const thresholds = [
    0.01, 0.02, 0.04, 0.06, 0.1, 0.15, 0.25, 0.4, 0.6, 0.9, 1.4, 2.2, 3.2, 4.5,
  ];
  let current = countTriangles(working);
  for (const threshold of thresholds) {
    if (current <= target) break;
    working.traverse((child) => {
      if (child.isMesh) decimateMesh(child, threshold);
    });
    current = countTriangles(working);
  }
  genState.model.threeObject = working;
  genState.lods = [];
  genState.activeLod = 0;
  refreshGenOptimizePanel();
  setGenStatus(`${t("gen.applied")} (${current} ${t("gen.triangles")})`, "ok");
  syncGenPreview();
}

function buildGenLods() {
  if (!genState.model || !genState.originalModel) return;
  setGenStatus(t("gen.optimizing"), "info");
  genState.lods = generateLOD(genState.originalModel, 4);
  genState.activeLod = 0;
  genState.model.threeObject = genState.lods[0].mesh;
  refreshGenOptimizePanel();
  const lod = genState.lods[0];
  setGenStatus(
    `${t("gen.applied")} (${lod.triangles} ${t("gen.triangles")})`,
    "ok",
  );
  syncGenPreview();
}

function setGenLod(level) {
  const lod = genState.lods[level];
  if (!lod?.mesh) return;
  genState.model.threeObject = lod.mesh;
  genState.activeLod = level;
  refreshGenOptimizePanel();
  setGenStatus(
    `${t("gen.applied")} (${lod.triangles} ${t("gen.triangles")})`,
    "ok",
  );
  syncGenPreview();
}

function restoreGenModel() {
  if (!genState.model || !genState.originalModel) return;
  genState.model.threeObject = genState.originalModel;
  genState.lods = [];
  genState.activeLod = 0;
  refreshGenOptimizePanel();
  const count = countTriangles(genState.originalModel);
  setGenStatus(`${t("gen.applied")} (${count} ${t("gen.triangles")})`, "ok");
  syncGenPreview();
}

function exportGenModel() {
  if (!genState.model) {
    setGenStatus(t("gen.noModel"), "warn");
    return;
  }
  setGenExportPanel(true);
}

async function downloadObjectAsFile(object, filename, format, options = {}) {
  let blob;
  let extension = format;
  if (format === "glb") {
    const result = await exportGLB(object, options);
    blob = new Blob([result], { type: "application/octet-stream" });
  } else if (format === "obj") {
    const result = exportOBJ(object, options);
    blob = new Blob([result], { type: "text/plain" });
  } else {
    const result = await exportGLB(object, options);
    blob = new Blob([result], { type: "application/octet-stream" });
    extension = "glb";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.${extension}`;
  a.click();
  URL.revokeObjectURL(url);
  await new Promise((r) => setTimeout(r, 120));
}

function exportOptionsForCurrentModel() {
  return {
    upAxis: $("#gen-coord").value === "zup" ? "Z" : "Y",
    scale: parseFloat($("#gen-scale").value) || 1,
  };
}

async function downloadGenModel() {
  if (!genState.model || !genState.model.threeObject) {
    setGenStatus(t("gen.noModel"), "warn");
    return;
  }
  const format = $("#gen-format").value;
  const options = exportOptionsForCurrentModel();
  const withLod = $("#gen-export-lod")?.checked || false;
  const animationChoice = $("#gen-animation")?.value || "auto";
  const source = genState.originalModel || genState.model.threeObject;
  const baseName = `asset-${genState.model.type}`;
  try {
    if (withLod) {
      const lods = generateLOD(source, 4);
      for (const lod of lods) {
        lod.mesh.animations = selectAnimations(lod.mesh, animationChoice);
        await downloadObjectAsFile(
          lod.mesh,
          `${baseName}-LOD${lod.level}`,
          format,
          options,
        );
      }
    } else {
      const exportModel =
        animationChoice === "auto"
          ? genState.model.threeObject
          : Object.assign(cloneModelDeep(genState.model.threeObject), {
              animations: selectAnimations(
                genState.model.threeObject,
                animationChoice,
              ),
            });
      await downloadObjectAsFile(exportModel, baseName, format, options);
    }
    setGenStatus(t("gen.applied"), "ok");
  } catch (err) {
    setGenStatus(t("gen.error"), "error");
  }
}

function downloadBytesAsFile(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadGenPack() {
  if (!genState.model || !genState.model.threeObject) {
    setGenStatus(t("gen.noModel"), "warn");
    return;
  }
  const engine = $("#gen-engine")?.value || "unity";
  const collision = $("#gen-collision")?.value || "auto";
  const animation = $("#gen-animation")?.value || "auto";
  const withLod = $("#gen-export-lod")?.checked || false;
  const source = genState.originalModel || genState.model.threeObject;
  const asset = {
    id: genState.model.id || `${genState.model.type}-${Date.now()}`,
    name: genState.model.name || null,
    type: genState.model.type,
    favorite: genState.model.favorite ?? false,
    seed: genState.model.seed ?? null,
    size: genState.model.size ?? 1,
    segments: genState.model.segments ?? 16,
    style: genState.model.style ?? "lowpoly",
    color: genState.model.color || null,
    material: genState.model.material || null,
    texture: genState.model.texture ?? "auto",
    textureStrength: genState.model.textureStrength ?? 0.8,
  };
  setGenStatus(t("gen.generating"), "info");
  try {
    const thumbnailDataUrl = renderAssetThumbnail(source, 256, 192);
    const pack = await exportGamePack({
      model: source,
      asset,
      engine,
      collision,
      animation,
      withLod,
      thumbnailDataUrl,
    });
    downloadBytesAsFile(pack, `ai3d-pack-${assetSlugForUi(asset.id)}.zip`);
    setGenStatus(t("gen.packReady"), "ok");
  } catch (err) {
    setGenStatus(t("gen.error"), "error");
  }
}

function assetSlugForUi(value) {
  return (
    String(value || "asset")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "asset"
  );
}

function renderGenTypeChips() {
  const container = $("#gen-types");
  if (!container) return;
  container.innerHTML = getAssetTypes()
    .map(
      (type) =>
        `<button type="button" class="gen-type-chip" data-type="${esc(type)}">${esc(t(GEN_TYPE_KEYS[type]))}</button>`,
    )
    .join("");
}

function renderGenKitChips() {
  const container = $("#gen-kits");
  if (!container) return;
  container.innerHTML = getGameKits()
    .map(
      (kit) =>
        `<button type="button" class="gen-type-chip${kit.id === selectedGenKit ? " active" : ""}" data-kit="${esc(kit.id)}">${esc(t(GEN_KIT_KEYS[kit.id]))}</button>`,
    )
    .join("");
}

function composeGameKitScene(kitId) {
  if (genState.generating) return;
  genState.generating = true;
  setGenActions(false);
  setGenStatus(t("gen.composing"), "info");
  try {
    const seedInput = $("#gen-seed").value.trim();
    const seed =
      seedInput === ""
        ? Math.floor(Math.random() * 1_000_000)
        : Math.max(0, Math.floor(Number(seedInput) || 0));
    const scene = composeGameKit(kitId, { seed });
    const stats = getAssetStats(scene);
    genState.model = {
      type: kitId,
      kind: "scene",
      threeObject: scene,
      color: null,
      seed,
      material: null,
    };
    genState.originalModel = null;
    genState.lods = [];
    genState.activeLod = 0;
    setGenOptimizePanel(false);
    setGenExportPanel(false);
    setGenActions(true);
    setGenStatus(
      `${t("gen.sceneReady")} (${scene.userData.props} ${t("gen.parts")} · ${stats.triangles} ${t("gen.triangles")})`,
      "ok",
    );
    showGenPreview();
  } catch {
    setGenStatus(t("gen.error"), "error");
  } finally {
    genState.generating = false;
  }
}

$("#gen-generate").addEventListener("click", generateAsset);
$("#gen-import").addEventListener("click", importGenModel);
$("#gen-optimize").addEventListener("click", optimizeGenModel);
$("#gen-decimate").addEventListener("click", decimateGenModel);
$("#gen-lod").addEventListener("click", buildGenLods);
$("#gen-restore").addEventListener("click", restoreGenModel);
$("#gen-lod-row").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-lod]");
  if (btn) setGenLod(Number(btn.dataset.lod));
});
$("#gen-export").addEventListener("click", exportGenModel);
$("#gen-download").addEventListener("click", downloadGenModel);
$("#gen-pack-download").addEventListener("click", downloadGenPack);
$("#gen-color-reset").addEventListener("click", () => {
  $("#gen-color").value = "#808080";
});
$("#gen-seed-reset").addEventListener("click", () => {
  $("#gen-seed").value = "";
});
$("#gen-seed-random").addEventListener("click", () => {
  $("#gen-seed").value = String(Math.floor(Math.random() * 1_000_000));
  if ($("#gen-prompt").value.trim()) generateAsset();
});
$("#gen-variants-generate").addEventListener("click", generateVariants);
$("#gen-variants-save-all").addEventListener("click", saveAllVariants);
$("#gen-variants").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (btn) {
    if (btn.dataset.variantSave !== undefined)
      saveVariant(Number(btn.dataset.variantSave));
    else if (btn.dataset.variantLoad !== undefined)
      loadVariant(Number(btn.dataset.variantLoad));
    return;
  }
  const card = e.target.closest(".gen-variant-card");
  if (card) loadVariant(Number(card.dataset.index));
});
$("#gen-emissive-reset").addEventListener("click", () => {
  $("#gen-emissive").value = "#000000";
});
$("#gen-texture").addEventListener("change", renderTextureStrip);
$("#gen-texture-strength").addEventListener("input", renderTextureStrip);
$("#gen-style").addEventListener("change", (e) => {
  const presets = {
    lowpoly: { roughness: 0.8, metalness: 0.1 },
    realistic: { roughness: 0.3, metalness: 0.6 },
    stylized: { roughness: 0.5, metalness: 0.2 },
  };
  const next = presets[e.target.value] || presets.lowpoly;
  $("#gen-roughness").value = String(next.roughness);
  $("#gen-metalness").value = String(next.metalness);
});
$("#gen-types").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  $("#gen-prompt").value = t(GEN_TYPE_KEYS[btn.dataset.type]);
  generateAsset();
});
$("#gen-kits").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-kit]");
  if (!btn) return;
  selectedGenKit = btn.dataset.kit;
  renderGenKitChips();
});
$("#gen-compose").addEventListener("click", () =>
  composeGameKitScene(selectedGenKit),
);

// --- Generated asset preview ---
const genPreviewStage = $("#gen-preview-stage");
if (genPreviewStage) {
  genPreview = new AssetPreview(genPreviewStage);
  genPreview.setAutoRotate(true);
}
$("#gen-preview-clip")?.addEventListener("change", (e) => {
  genPreview?.setClip(e.target.value);
  const animationSelect = $("#gen-animation");
  if (animationSelect && e.target.value) {
    animationSelect.value = e.target.value;
  }
});
$("#gen-preview-play")?.addEventListener("click", () => {
  if (!genPreview || genPreview.clips.length === 0) return;
  genPreviewPlaying = !genPreviewPlaying;
  genPreview.setPlaying(genPreviewPlaying);
  updateGenPreviewPlayButton();
});
$("#gen-preview-spin")?.addEventListener("click", (e) => {
  genPreviewSpin = !genPreviewSpin;
  genPreview?.setAutoRotate(genPreviewSpin);
  e.currentTarget.classList.toggle("active", genPreviewSpin);
  e.currentTarget.setAttribute("aria-pressed", String(genPreviewSpin));
});
$("#gen-animation")?.addEventListener("change", syncGenPreview);

// --- Asset Library UI ---
function renderAssetLibrary() {
  const container = $("#gen-library");
  if (!container) return;
  populateTagFilter();
  const query = $("#gen-search").value.trim();
  const tagFilter = $("#gen-tag-filter")?.value || "";
  const favoritesOnly = $("#gen-favorites-only")?.checked || false;
  let assets = query ? assetLibrary.search(query) : assetLibrary.assets;
  if (tagFilter) {
    assets = assets.filter((a) => a.tags && a.tags.includes(tagFilter));
  }
  if (favoritesOnly) {
    assets = assets.filter((a) => a.favorite);
  } else {
    assets = [...assets].sort(
      (a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)),
    );
  }
  if (assets.length === 0) {
    container.innerHTML = `<div class="gen-library-empty">${t("gen.empty")}</div>`;
    return;
  }
  container.innerHTML = assets
    .map(
      (a) => `
    <div class="gen-asset-card" data-id="${a.id}">
      <div class="gen-asset-preview" data-preview="${a.id}"></div>
      <div class="gen-asset-info">
        <strong>${esc(a.name || a.type)}</strong>
        <span>${a.prompt.slice(0, 50)}${a.prompt.length > 50 ? "..." : ""}</span>
        <small>${new Date(a.createdAt).toLocaleDateString()}</small>
        <div class="gen-asset-tags">${(a.tags || []).map((tag) => `<span class="gen-tag">${tag}</span>`).join("")}</div>
      </div>
      <div class="gen-asset-actions">
        <button class="gen-asset-fav${a.favorite ? " active" : ""}" data-id="${a.id}" title="${t(a.favorite ? "gen.unfavorite" : "gen.favorite")}" aria-label="${t(a.favorite ? "gen.unfavorite" : "gen.favorite")}">${icon("star")}</button>
        <button class="gen-asset-rename" data-id="${a.id}" title="${t("gen.rename")}">${t("gen.rename")}</button>
        <button class="gen-asset-load" data-id="${a.id}">${t("gen.import")}</button>
        <button class="gen-asset-delete" data-id="${a.id}">${t("mcp.remove")}</button>
      </div>
    </div>
  `,
    )
    .join("");
  // Render thumbnails for each asset
  assets.forEach((a) => renderAssetPreview(a));
}

function populateTagFilter() {
  const select = $("#gen-tag-filter");
  if (!select) return;
  const tags = assetLibrary.getAllTags();
  const currentValue = select.value;
  select.innerHTML = '<option value="">All tags</option>';
  tags.forEach((tag) => {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    select.appendChild(option);
  });
  select.value = currentValue;
}

/**
 * Render a 3D thumbnail preview for an asset.
 */
function renderAssetPreview(asset) {
  const container = document.querySelector(`[data-preview="${asset.id}"]`);
  if (!container) return;
  try {
    const model = generateThreeAsset(asset.type, {
      size: asset.size,
      segments: Math.min(asset.segments || 8, 8), // Low segments for preview
      style: asset.style,
      color: asset.color || null,
      seed: asset.seed ?? null,
      material: asset.material || null,
      texture: asset.texture ?? "auto",
      textureStrength: asset.textureStrength ?? 0.8,
    });
    const dataUrl = renderAssetThumbnail(model, 120, 90);
    if (dataUrl) {
      const img = document.createElement("img");
      img.src = dataUrl;
      img.alt = asset.type;
      img.className = "gen-asset-thumbnail";
      container.appendChild(img);
    } else {
      // Fallback when WebGL is unavailable: a labelled swatch.
      const swatch = document.createElement("div");
      swatch.className = "gen-asset-thumbnail";
      swatch.style.background = asset.color || "#808080";
      swatch.textContent = asset.type;
      container.appendChild(swatch);
    }
  } catch {
    container.innerHTML = `<div class="gen-asset-preview-placeholder">${t("gen.previewError")}</div>`;
  }
}

function saveCurrentAsset() {
  if (!genState.model) {
    setGenStatus(t("gen.noModel"), "warn");
    return;
  }
  assetLibrary.add({
    ...genState.model,
    threeObject: null, // Don't serialize Three.js objects
  });
  renderAssetLibrary();
  setGenStatus(t("gen.applied"), "ok");
}

function loadAsset(id) {
  const asset = assetLibrary.assets.find((a) => a.id === id);
  if (!asset) return;
  const model = generateThreeAsset(asset.type, {
    size: asset.size,
    segments: asset.segments,
    style: asset.style,
    color: asset.color || null,
    seed: asset.seed ?? null,
    material: asset.material || null,
    texture: asset.texture ?? "auto",
    textureStrength: asset.textureStrength ?? 0.8,
  });
  genState.model = { ...asset, threeObject: model };
  genState.originalModel = cloneModelDeep(model);
  genState.lods = [];
  genState.activeLod = 0;
  setGenOptimizePanel(false);
  setGenStatus(t("gen.applied"), "ok");
  setGenActions(true);
  syncGenPreview();
}

function deleteAsset(id) {
  assetLibrary.remove(id);
  renderAssetLibrary();
}

function toggleAssetFavorite(id) {
  assetLibrary.toggleFavorite(id);
  renderAssetLibrary();
}

function renameAsset(id) {
  const asset = assetLibrary.assets.find((a) => a.id === id);
  if (!asset) return;
  const name = window.prompt(t("gen.renamePrompt"), asset.name || asset.type);
  if (name === null) return;
  assetLibrary.rename(id, name.trim());
  renderAssetLibrary();
}

$("#gen-save").addEventListener("click", saveCurrentAsset);
$("#gen-search").addEventListener("input", renderAssetLibrary);
$("#gen-tag-filter").addEventListener("change", renderAssetLibrary);
$("#gen-favorites-only").addEventListener("change", renderAssetLibrary);
$("#gen-library").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.classList.contains("gen-asset-load")) loadAsset(id);
  else if (btn.classList.contains("gen-asset-delete")) deleteAsset(id);
  else if (btn.classList.contains("gen-asset-fav")) toggleAssetFavorite(id);
  else if (btn.classList.contains("gen-asset-rename")) renameAsset(id);
});

// --- Batch Export ---
async function batchExportAssets() {
  const assets = assetLibrary.assets;
  if (assets.length === 0) {
    setGenStatus(t("gen.empty"), "warn");
    return;
  }
  const format = $("#gen-format").value;
  const withLod = $("#gen-export-lod")?.checked || false;
  setGenStatus(t("gen.generating"), "info");
  try {
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const model = generateThreeAsset(asset.type, {
        size: asset.size,
        segments: asset.segments,
        style: asset.style,
        color: asset.color || null,
        seed: asset.seed ?? null,
        material: asset.material || null,
        texture: asset.texture ?? "auto",
        textureStrength: asset.textureStrength ?? 0.8,
      });
      const baseName = `asset-${asset.type}-${asset.id.slice(0, 8)}`;
      if (withLod) {
        const lods = generateLOD(model, 4);
        for (const lod of lods) {
          await downloadObjectAsFile(
            lod.mesh,
            `${baseName}-LOD${lod.level}`,
            format,
          );
        }
      } else {
        await downloadObjectAsFile(model, baseName, format);
      }
    }
    setGenStatus(t("gen.applied"), "ok");
  } catch (err) {
    setGenStatus(t("gen.error"), "error");
  }
}

$("#gen-batch-export").addEventListener("click", batchExportAssets);

// --- Asset Manifest Export ---
function exportManifest() {
  const assets = assetLibrary.assets;
  if (assets.length === 0) {
    setGenStatus(t("gen.manifestEmpty"), "warn");
    return;
  }
  const format = $("#gen-manifest-format").value;
  const content = exportAssetManifest(assets, format);
  const blob = new Blob([content], {
    type: format === "csv" ? "text/csv" : "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ai3d-manifest-${new Date().toISOString().slice(0, 10)}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
  setGenStatus(t("gen.applied"), "ok");
}

$("#gen-manifest-export").addEventListener("click", exportManifest);

// --- Library Game Pack Export ---
async function exportLibraryPack() {
  const assets = assetLibrary.assets;
  if (assets.length === 0) {
    setGenStatus(t("gen.empty"), "warn");
    return;
  }
  const engine = $("#gen-engine")?.value || "unity";
  const enginePreset = getEnginePresets().find((p) => p.id === engine) || {
    upAxis: "Y",
    scale: 1,
  };
  const collisionChoice = $("#gen-collision")?.value || "auto";
  const animationChoice = $("#gen-animation")?.value || "auto";
  setGenStatus(t("gen.generating"), "info");
  try {
    const packAssets = await Promise.all(
      assets.map(async (asset) => {
        const model = generateThreeAsset(asset.type, {
          size: asset.size,
          segments: asset.segments,
          style: asset.style,
          color: asset.color || null,
          seed: asset.seed ?? null,
          material: asset.material || null,
          texture: asset.texture ?? "auto",
          textureStrength: asset.textureStrength ?? 0.8,
        });
        const selectedAnimations = selectAnimations(model, animationChoice);
        const animations = selectedAnimations.map((clip) => ({
          name: clip.name,
          duration: Math.round(clip.duration * 100) / 100,
          tracks: clip.tracks.length,
        }));
        const glbBytes = new Uint8Array(
          await exportGLB(model, {
            ...enginePreset,
            animations: selectedAnimations,
          }),
        );
        let collision = null;
        let colliderBytes = null;
        const collisionShape =
          collisionChoice === "none"
            ? null
            : collisionChoice === "auto"
              ? getColliderShape(asset.type)
              : collisionChoice;
        if (collisionShape) {
          collision = computeCollider(model, collisionShape);
          if (collision?.shape !== "mesh") {
            const colliderModel = buildColliderModel(collision);
            if (colliderModel) {
              colliderBytes = new Uint8Array(
                await exportGLB(colliderModel, enginePreset),
              );
            }
          }
        }
        const thumbnailDataUrl = renderAssetThumbnail(model, 256, 192);
        const thumbnailBytes = thumbnailDataUrl
          ? await dataUrlToBytes(thumbnailDataUrl)
          : null;
        return {
          ...asset,
          stats: getAssetStats(model),
          glbBytes,
          thumbnailBytes,
          animations,
          collision,
          colliderBytes,
        };
      }),
    );
    const pack = buildGamePackFiles({
      assets: packAssets,
      engine,
    });
    downloadBytesAsFile(
      pack,
      `ai3d-library-pack-${new Date().toISOString().slice(0, 10)}.zip`,
    );
    setGenStatus(t("gen.packReady"), "ok");
  } catch (err) {
    setGenStatus(t("gen.error"), "error");
  }
}

async function dataUrlToBytes(dataUrl) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const base64 = dataUrl.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

$("#gen-library-pack").addEventListener("click", exportLibraryPack);

renderGenTypeChips();
renderGenKitChips();
renderAssetLibrary();
renderVariantGrid();
renderTextureStrip();

initAiDock();
loadMcpConnections();
// Read-only diagnostics for browser acceptance checks; never mutate review state.
window.__reviewDiagnostics = () => ({
  versionId: loadedId,
  modelFilename: loadedFilename,
  reviewId: loadedReviewId,
  draftCacheKey: draftKey(),
  precision: loadedPrecision,
  accessBlocked,
  revision,
  annotationCount: annotations.length,
  labelCursor,
  dirty: editSeq > savedSeq,
  annotations: viewer.serializeAnnotations(annotations),
  camera: viewer.cameraState(),
  // Which way the camera calls up. It is deliberately not part of the camera a
  // draft stores — that one is a place to stand, and this is how a view can be
  // upright from the right place and still be lying on its side.
  cameraUp: viewer.camera.up.toArray(),
  screenUp: viewer.screenUp(),
  viewer: viewer.stats(),
  locked: state?.locked,
  owned: state?.owned,
  viewing: viewingId,
  followActive,
  capabilities: state?.capabilities || null,
  versions: (state?.versions || []).map((v) => ({
    id: v.id,
    version: v.version,
    active: v.active,
    annotations: v.annotations,
    unsubmitted: v.unsubmitted,
    submissions: v.submissions,
  })),
});
