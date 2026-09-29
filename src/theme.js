/* Light or dark was decided entirely by `prefers-color-scheme`, and a media
   query is not something script can overrule. That is fine until the automatic
   answer is the wrong one — a dark room and a model that reads better light, or
   a system that reports a preference nobody set. So the page carries the
   decision on <html data-theme>, the system supplies it when nobody has chosen,
   and choosing writes it down.

   Resolving it before the interface is built matters: the alternative is one
   frame of the wrong theme on every load. */

export const THEMES = ["system", "light", "dark"];
const KEY = "ai3d-theme";

export function systemTheme(matcher) {
  return matcher?.matches ? "dark" : "light";
}

export function resolveTheme(choice, matcher) {
  return choice === "light" || choice === "dark"
    ? choice
    : systemTheme(matcher);
}

export function readThemeChoice() {
  try {
    const stored = localStorage.getItem(KEY);
    return THEMES.includes(stored) ? stored : "system";
  } catch {
    /* a reviewer with no storage still gets the system's answer */
    return "system";
  }
}

export function storeThemeChoice(choice) {
  if (!THEMES.includes(choice)) return readThemeChoice();
  try {
    // "system" is the absence of a choice, not a third stored value: keeping it
    // would pin today's default into a browser that should keep following.
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* the choice still holds for this visit */
  }
  return choice;
}

export function applyTheme(choice, matcher, root = document.documentElement) {
  const resolved = resolveTheme(choice, matcher);
  root.dataset.theme = resolved;
  return resolved;
}
