// Resizable side panels (project sidebar, binder, scene details) and the app-wide colour theme.
// Sizes and theme are per-viewer conveniences, so they live in localStorage.

const LAYOUT_KEY = "noirwriter:layout";
const THEME_KEY = "noirwriter:theme";
const DEFAULTS = { nav: 228, binder: 250, meta: 300 };
const LIMITS = { nav: [160, 420], binder: [170, 560], meta: [230, 640] };
const COLLAPSE_AT = 90;   // drag a panel narrower than this and it folds away
const CSS_VAR = { nav: "--nav-w", binder: "--binder-w", meta: "--meta-w" };

let state = { widths: { ...DEFAULTS }, collapsed: { nav: false, binder: false, meta: false } };
try {
  const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null");
  if (saved) state = { widths: { ...DEFAULTS, ...saved.widths }, collapsed: { ...state.collapsed, ...saved.collapsed } };
  // carry over the old show/hide toggles from the editor preferences
  const old = JSON.parse(localStorage.getItem("noirwriter:editorPrefs") || "{}");
  if (!saved && old.showBinder === false) state.collapsed.binder = true;
  if (!saved && old.showMeta === false) state.collapsed.meta = true;
} catch {}

const chev = right => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${right ? "m10 7 5 5-5 5" : "m14 7-5 5 5 5"}"/></svg>`;
const persist = () => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(state)); } catch {} };

function paint(key, width, collapsed) {
  document.documentElement.style.setProperty(CSS_VAR[key], collapsed ? "0px" : width + "px");
  document.body.classList.toggle("collapse-" + key, collapsed);
  document.querySelectorAll(`[data-resize="${key}"]`).forEach(h => {
    h.classList.toggle("collapsed", collapsed);
    const btn = h.querySelector(".resizer-btn");
    if (btn) btn.innerHTML = chev((+h.dataset.dir > 0) === collapsed);
  });
}

export function applyLayout() {
  for (const k of Object.keys(DEFAULTS)) paint(k, state.widths[k], state.collapsed[k]);
}

export const isCollapsed = key => state.collapsed[key];

export function setCollapsed(key, collapsed) {
  state.collapsed[key] = collapsed;
  persist();
  paint(key, state.widths[key], collapsed);
}

export const togglePanel = key => setCollapsed(key, !state.collapsed[key]);

/**
 * HTML for a drag handle. `dir` is +1 when the panel sits to the left of the handle
 * (dragging right grows it) and -1 when it sits to the right.
 */
export function resizer(key, dir) {
  const arrow = chev((dir > 0) === state.collapsed[key]);
  return `<div class="resizer ${dir < 0 ? "dir-left" : ""} ${state.collapsed[key] ? "collapsed" : ""}" data-resize="${key}" data-dir="${dir}"
    title="Drag to resize · drag to the edge to hide · double-click to hide/show" role="separator" aria-orientation="vertical">
    <button class="resizer-btn" type="button" tabindex="-1" aria-label="Show panel">${arrow}</button></div>`;
}

export function bindResizers(root = document) {
  root.querySelectorAll("[data-resize]").forEach(handle => {
    const key = handle.dataset.resize;
    const dir = +handle.dataset.dir;
    handle.onpointerdown = e => {
      if (e.button !== 0) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startW = state.collapsed[key] ? 0 : state.widths[key];
      let width = startW, collapsed = state.collapsed[key], moved = false;
      document.body.classList.add("resizing");
      handle.classList.add("dragging");
      handle.onpointermove = ev => {
        const dx = (ev.clientX - startX) * dir;
        if (Math.abs(dx) > 3) moved = true;
        const raw = startW + dx;
        collapsed = raw < COLLAPSE_AT;
        width = Math.max(LIMITS[key][0], Math.min(LIMITS[key][1], raw));
        paint(key, width, collapsed);
      };
      handle.onpointerup = () => {
        handle.onpointermove = handle.onpointerup = null;
        document.body.classList.remove("resizing");
        handle.classList.remove("dragging");
        if (!moved) {
          // a plain click on a folded panel's strip opens it again
          if (state.collapsed[key]) setCollapsed(key, false);
          else paint(key, state.widths[key], false);
          return;
        }
        if (!collapsed) state.widths[key] = Math.round(width);
        setCollapsed(key, collapsed);
      };
    };
    handle.ondblclick = () => togglePanel(key);
  });
}

export function resetLayout() {
  state = { widths: { ...DEFAULTS }, collapsed: { nav: false, binder: false, meta: false } };
  persist();
  applyLayout();
}

// ---------------------------------------------------------------- theme

export const THEMES = ["dark", "sepia"];
export const THEME_NAMES = { dark: "Noir (black & orange)", sepia: "Honey (warm cream & orange)" };

export function getTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light") return "sepia";   // the white "Paper" theme was retired; Honey is its closest match
    if (THEMES.includes(t)) return t;
    const old = JSON.parse(localStorage.getItem("noirwriter:editorPrefs") || "{}").paper;
    if (THEMES.includes(old)) return old;
  } catch {}
  return "dark";
}

export function setTheme(theme) {
  if (!THEMES.includes(theme)) theme = "dark";
  document.body.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  document.querySelectorAll("[data-theme-pick]").forEach(b => b.classList.toggle("on", b.dataset.themePick === theme));
}

export function themeSwitch() {
  const cur = getTheme();
  return `<span class="theme-switch" role="group" aria-label="Theme">${THEMES.map(t =>
    `<button type="button" data-theme-pick="${t}" class="${t === cur ? "on" : ""}" title="${THEME_NAMES[t]} theme" aria-label="${THEME_NAMES[t]} theme"></button>`).join("")}</span>`;
}

export function bindThemeSwitch(root = document) {
  root.querySelectorAll("[data-theme-pick]").forEach(b => b.onclick = () => setTheme(b.dataset.themePick));
}
