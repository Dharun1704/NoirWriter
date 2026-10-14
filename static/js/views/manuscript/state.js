// Manuscript state shared by its parts: the writer's editor preferences (kept in this browser),
// focus mode, the last scene opened, and small helpers for writing a whole chapter as one page.

import { SCENE_STATUSES } from "../../store.js";

// ---------------------------------------------------------------- per-viewer preferences

const PREF_KEY = "noirwriter:editorPrefs";
const DEFAULT_PREFS = {
  font: "Lora", size: 18, lineHeight: 1.8, width: 720, indent: false,
  typewriter: false, smart: true, mode: "write", toolbar: "fixed",
};

/** Editor preferences: font, page width, current view (write / corkboard / …), toolbar mode, etc. */
export const prefs = { ...DEFAULT_PREFS };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || "{}")); } catch {}
export const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {} };

/** Back to the defaults (the current view is kept). */
export function resetPrefs() {
  const mode = prefs.mode;
  for (const k of Object.keys(prefs)) delete prefs[k];
  Object.assign(prefs, DEFAULT_PREFS, { mode });
  savePrefs();
}

/** Page look for the editor and the read-through, as CSS variables. */
export function editorStyle() {
  return `--ed-font:'${prefs.font}';--ed-size:${prefs.size}px;--ed-lh:${prefs.lineHeight};--ed-width:${prefs.width}px`;
}

/** State that lasts while the app is open (not saved). */
export const view = { focusMode: false };

// ---------------------------------------------------------------- last scene & chapter mode

const lastSceneKey = p => `noirwriter:lastScene:${p.id}`;
export function rememberScene(p, id) { try { localStorage.setItem(lastSceneKey(p), id); } catch {} }
export function recallScene(p) { try { return localStorage.getItem(lastSceneKey(p)); } catch { return null; } }

/** Writing a whole chapter as one page (instead of scene by scene)? A per-project choice. */
export { byChapter } from "../../store.js";

// A chapter's summary for chapter-mode cards and rows: built from its scenes, so nothing is stored twice.
export const chapterSynopsis = ch => ch.scenes.map(s => s.synopsis.trim()).filter(Boolean).join(" · ");
export const chapterStatus = ch => ch.scenes.length
  ? SCENE_STATUSES[Math.min(...ch.scenes.map(s => Math.max(0, SCENE_STATUSES.indexOf(s.status))))]
  : SCENE_STATUSES[0];
export const chapterTarget = ch => ch.scenes.reduce((n, s) => n + (s.target || 0), 0);
