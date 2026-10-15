// Project data model, persistence, writing log and derived queries.
import { GENRES, FEATURES, SCHEMAS, allCharacterFields } from "./features.js";

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const SCENE_STATUSES = ["to do", "draft", "revised", "final"];
export const CLUE_TYPES = ["Clue", "Red herring", "Twist", "Secret", "Open question"];
export const ARC_COLORS = [
  "#f5a623", "#c4544a", "#6d8fb3", "#7fa36b", "#a07cc0", "#d08a4e", "#5fa8a0", "#b3b3b3",
];
export const CODEX_KEYS = ["notes", ...FEATURES.filter(f => f.kind === "codex").map(f => f.key)];

export function newProject({ title, genre = "thriller", features }) {
  const now = Date.now();
  return normalize({
    id: slugify(title) + "-" + uid().slice(-5),
    version: 2,
    title,
    genre,
    features: features || [...GENRES[genre].defaults],
    createdAt: now,
    updatedAt: now,
    chapters: [{ id: uid(), title: "Chapter One", open: true, scenes: [newScene("Opening scene")] }],
    arcs: [{ id: uid(), name: genre === "fantasy" ? "The quest" : genre === "nonfiction" ? "Main thread" : "Main mystery", color: ARC_COLORS[0], description: "" }],
  });
}

export function newScene(title = "Untitled scene") {
  return {
    id: uid(), title, content: "", synopsis: "", status: "to do",
    povId: "", characterIds: [], arcIds: [], locationId: "", location: "", storyTime: "",
    notes: "", target: 0, links: [], snapshots: [],
  };
}

export function newCharacter(name = "New character", role = "Minor") {
  const c = { id: uid(), name, role, portrait: "", relationships: [] };
  for (const f of allCharacterFields()) c[f.key] = f.type === "ref" ? [] : "";
  return c;
}

export function newEntry(key, name) {
  const e = { id: uid(), name: name || "Untitled", image: "" };
  for (const f of SCHEMAS[key] || []) {
    e[f.key] = f.type === "ref" || f.type === "table" ? [] : f.type === "select" ? f.options[0] : "";
  }
  return e;
}

export function newEvent() {
  return { id: uid(), title: "New event", when: "", description: "", arcId: "", characterIds: [], sceneId: "", offPage: false };
}

export function newClue() {
  return {
    id: uid(), name: "New clue", type: "Clue", description: "", truth: "",
    plantedIn: "", revealedIn: "", payoffIn: "", characterIds: [], notes: "",
  };
}

function slugify(s) {
  return (s || "story").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "story";
}

/** Fill in fields missing from older/imported projects so the UI never trips on undefined. */
export function normalize(p) {
  const fill = (obj, tpl) => { for (const k in tpl) if (obj[k] === undefined) obj[k] = structuredClone(tpl[k]); return obj; };
  const isV1 = !p.version || p.version < 2;
  fill(p, {
    genre: "thriller", logline: "", genreLabel: "", targetWords: 80000, chapters: [], characters: [], arcs: [],
    events: [], clues: [], notes: "", mystery: {}, codex: {}, maps: [], log: {},
    goals: { daily: 1000, deadline: "" }, rev: 0,
    structure: { template: "three-act", beats: {} },   // story-structure template + beat -> scene id
    sprints: [],                                       // [{at, minutes, words}]
    writeBy: "scene",                                  // "scene" | "chapter": how the manuscript is written
  });
  fill(p.structure, { template: "three-act", beats: {} });
  if (!GENRES[p.genre]) p.genre = "thriller";
  if (!Array.isArray(p.features)) p.features = [...GENRES[p.genre].defaults];
  fill(p.mystery, { culpritIds: [], truth: "" });
  fill(p.goals, { daily: 1000, deadline: "" });
  for (const k of CODEX_KEYS) {
    if (!Array.isArray(p.codex[k])) p.codex[k] = [];
    p.codex[k].forEach(e => fill(e, newEntry(k)));
  }
  p.chapters.forEach(ch => { fill(ch, { open: true, scenes: [], snapshots: [] }); ch.scenes.forEach(s => fill(s, newScene())); });
  p.characters.forEach(c => fill(c, newCharacter()));
  p.events.forEach(e => fill(e, newEvent()));
  p.clues.forEach(c => fill(c, newClue()));
  p.maps.forEach(m => fill(m, { name: "Map", image: "", pins: [] }));
  if (isV1) {
    // v1 "Overview notes" became the synopsis; v1 used "draft" as the starting status.
    p.version = 2;
  }
  return p;
}

export const hasFeature = (p, key) => key === "notes" || key === "characters" || p.features.includes(key);

// ---------------------------------------------------------------- API

export const api = {
  async list() {
    const r = await fetch("/api/projects");
    return r.json();
  },
  async load(id) {
    const r = await fetch(`/api/projects/${id}`);
    if (!r.ok) throw new Error("Project not found");
    return normalize(await r.json());
  },
  /**
   * Save the whole project. The body carries `rev` (the version this tab last loaded or saved);
   * the server refuses with 409 if the file has changed since, unless `force` is set.
   */
  async save(project, { force = false } = {}) {
    const r = await fetch(`/api/projects/${project.id}${force ? "?force=1" : ""}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
    const j = await r.json();
    if (r.status === 409) throw Object.assign(new Error("conflict"), { conflict: true, rev: j.rev, updatedAt: j.updatedAt });
    if (!r.ok) throw new Error(j.error || "Save failed");
    project.rev = j.rev;
    return j;
  },
  /** App settings kept by the server (the backup folder), with cloud folders found on this computer. */
  async settings() {
    const r = await fetch("/api/settings");
    return r.json();
  },
  async saveSettings(changes) {
    const r = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Couldn't save the setting");
    return j;
  },
  async meta(id) {
    const r = await fetch(`/api/projects/${id}/meta`);
    if (!r.ok) throw new Error("Project not found");
    return r.json();
  },
  async backups(id) {
    return (await fetch(`/api/projects/${id}/backups`)).json();
  },
  async restoreBackup(id, file) {
    const r = await fetch(`/api/projects/${id}/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file }) });
    if (!r.ok) throw new Error((await r.json()).error || "Restore failed");
    return normalize(await r.json());
  },
  async trash() {
    return (await fetch("/api/trash")).json();
  },
  async restoreTrash(file) {
    const r = await fetch("/api/trash/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Restore failed");
    return j;
  },
  async remove(id) {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
  },
  async uploadAsset(projectId, file) {
    const ext = (file.name.match(/\.(png|jpe?g|webp|gif)$/i) || [".png"])[0].toLowerCase();
    const name = uid() + ext;
    const r = await fetch(`/api/assets/${projectId}/${name}`, { method: "PUT", body: file });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Upload failed");
    return j.url;
  },
};

// ---------------------------------------------------------------- autosave

let saveTimer = null;
const saveListeners = [];
export const saveState = { status: "saved", lastSaved: null, conflict: null };

export function onSaveState(fn) { saveListeners.push(fn); }
function emitSave(status, conflict = null) {
  saveState.status = status;
  saveState.conflict = conflict;
  if (status === "saved") saveState.lastSaved = new Date();
  saveListeners.forEach(fn => fn(saveState));
}

export function scheduleSave(project, delay = 700) {
  project.updatedAt = Date.now();
  if (saveState.status === "conflict") return;   // wait for the writer to resolve the conflict
  emitSave("dirty");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flushSave(project), delay);
}

// Saves run one at a time: two overlapping PUTs would carry the same `rev` and the second would
// look like a conflict. A save requested while one is in flight runs right after it.
let inFlight = null;
let againAfter = false;

export async function flushSave(project, { force = false } = {}) {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (saveState.status === "conflict" && !force) return;
  if (inFlight) { againAfter = true; return inFlight; }
  project.wordCount = totalWords(project);
  inFlight = (async () => {
    try {
      await api.save(project, { force });
      emitSave("saved");
    } catch (e) {
      if (e.conflict) {
        // another tab or window saved a newer version: stop and let the writer choose
        emitSave("conflict", { rev: e.rev, updatedAt: e.updatedAt });
        return;
      }
      if (saveState.status !== "error") console.warn("NoirWrite: save failed, will keep retrying —", e.message);
      emitSave("error");
      // retry in a bit so a briefly-stopped server doesn't lose work
      saveTimer = setTimeout(() => flushSave(project), 5000);
    }
  })();
  try { await inFlight; } finally { inFlight = null; }
  if (againAfter && saveState.status !== "conflict") { againAfter = false; return flushSave(project); }
  againAfter = false;
}

/** Forget an unresolved conflict (after the writer reloads or keeps their version). */
export function clearConflict() { if (saveState.status === "conflict") emitSave("saved"); }

export const hasPendingSave = () => saveTimer !== null || inFlight !== null || saveState.status === "dirty";

// ---------------------------------------------------------------- writing log

export const today = (d = new Date()) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
let lastActivity = 0;
const writingListeners = [];
/** Subscribe to every net word change typed in the editor (used by writing sprints). */
export const onWriting = fn => writingListeners.push(fn);

/** Record words added/removed in the editor today, plus active writing time. */
export function logWriting(p, delta) {
  writingListeners.forEach(fn => fn(delta, p));
  const day = (p.log[today()] ||= { added: 0, removed: 0, seconds: 0 });
  if (delta > 0) day.added += delta;
  if (delta < 0) day.removed += -delta;
  const now = Date.now();
  if (lastActivity && now - lastActivity < 120000) day.seconds += Math.round((now - lastActivity) / 1000);
  lastActivity = now;
}

export function logStats(p) {
  const days = Object.keys(p.log).sort();
  const net = d => (p.log[d] ? p.log[d].added - p.log[d].removed : 0);
  const goal = p.goals.daily || 0;
  // streak: consecutive days (ending today or yesterday) with any words added
  let streak = 0;
  const cursor = new Date();
  if (!(p.log[today(cursor)]?.added > 0)) cursor.setDate(cursor.getDate() - 1);
  while (p.log[today(cursor)]?.added > 0) { streak++; cursor.setDate(cursor.getDate() - 1); }
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    if (!(p.log[d].added > 0)) { run = 0; prev = d; continue; }
    const contiguous = prev && (new Date(d) - new Date(prev)) === 86400000 && p.log[prev]?.added > 0;
    run = contiguous ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const t = p.log[today()] || { added: 0, removed: 0, seconds: 0 };
  const lastN = n => {
    let sum = 0;
    const d = new Date();
    for (let i = 0; i < n; i++) { sum += net(today(d)); d.setDate(d.getDate() - 1); }
    return sum;
  };
  const activeDays = days.filter(d => p.log[d].added > 0);
  const totalSeconds = days.reduce((s, d) => s + (p.log[d].seconds || 0), 0);
  const totalAdded = days.reduce((s, d) => s + p.log[d].added, 0);
  return {
    today: t, todayNet: t.added - t.removed, goal, streak, best: Math.max(best, streak),
    week: lastN(7), month: lastN(30),
    avgPerActiveDay: activeDays.length ? Math.round(activeDays.reduce((s, d) => s + net(d), 0) / activeDays.length) : 0,
    totalSeconds, wordsPerHour: totalSeconds > 600 ? Math.round(totalAdded / (totalSeconds / 3600)) : 0,
    net, activeDays: activeDays.length,
  };
}

// ---------------------------------------------------------------- queries

const wordCache = new Map();
export function countWords(html) {
  if (!html) return 0;
  const hit = wordCache.get(html);
  if (hit !== undefined) return hit;
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, "x");
  const m = text.match(/[\p{L}\p{N}'’-]+/gu);
  const n = m ? m.length : 0;
  if (wordCache.size > 2000) wordCache.clear();
  wordCache.set(html, n);
  return n;
}

export function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = (html || "").replace(/<\/(p|h\d|blockquote|li|div)>/g, "$&\n").replace(/<br\s*\/?>/g, "\n");
  return div.textContent;
}

export function allScenes(p) {
  const out = [];
  p.chapters.forEach((ch, ci) => ch.scenes.forEach((s, si) => out.push({ scene: s, chapter: ch, ci, si })));
  return out;
}

export function findScene(p, id) {
  return allScenes(p).find(x => x.scene.id === id) || null;
}

export function sceneIndex(p, id) {
  if (!id) return -1;
  return allScenes(p).findIndex(x => x.scene.id === id);
}

/** Writing a whole chapter as one page (instead of scene by scene)? A per-project choice. */
export const byChapter = p => p.writeBy === "chapter";

/** "Ch 2.1 · Body" — or, writing by chapter, the chapter it belongs to: "Ch 2 · The Docks". */
export function sceneLabel(p, id) {
  const f = findScene(p, id);
  if (!f) return "";
  return byChapter(p) ? `Ch ${f.ci + 1} · ${f.chapter.title}` : `Ch ${f.ci + 1}.${f.si + 1} · ${f.scene.title}`;
}

/**
 * The pieces of the book in reading order: every scene, or every chapter when writing by chapter.
 * Links (events, clues, structure beats) always point at a scene, so a chapter is represented by its
 * first scene and "contains" all of its scenes. Empty chapters have nothing to link to and are left out.
 * Each unit: { id, scenes, chapter, ci, num, title, label }
 */
export function storyUnits(p) {
  if (byChapter(p)) {
    return p.chapters.map((ch, ci) => ({
      id: ch.scenes[0]?.id, scenes: ch.scenes, chapter: ch, ci, num: `${ci + 1}`, title: ch.title, label: `Ch ${ci + 1} · ${ch.title}`,
    })).filter(u => u.id);
  }
  return allScenes(p).map(({ scene, chapter, ci, si }) => ({
    id: scene.id, scenes: [scene], chapter, ci, num: `${ci + 1}.${si + 1}`, title: scene.title, label: `Ch ${ci + 1}.${si + 1} · ${scene.title}`,
  }));
}

/** Choices for a "which scene / chapter" dropdown. A link to a later scene of a chapter keeps its value. */
export function unitChoices(p, current = "") {
  return storyUnits(p).map(u => ({ id: u.scenes.some(s => s.id === current) ? current : u.id, name: u.label }));
}

/** "scene" or "chapter", for labels and hints. */
export const unitWord = p => byChapter(p) ? "chapter" : "scene";

export const chapterWords = ch => ch.scenes.reduce((n, s) => n + countWords(s.content), 0);
export const totalWords = p => p.chapters.reduce((n, ch) => n + chapterWords(ch), 0);
export const character = (p, id) => p.characters.find(c => c.id === id) || null;

/** Any linkable thing: a character or a codex entry. Returns {item, key} or null. */
export function findItem(p, id) {
  if (!id) return null;
  const c = character(p, id);
  if (c) return { item: c, key: "characters" };
  for (const k of CODEX_KEYS) {
    const e = p.codex[k].find(x => x.id === id);
    if (e) return { item: e, key: k };
  }
  return null;
}

/** Items available as targets of a ref field (empty if that feature is off). */
export function refTargets(p, to) {
  if (to === "characters") return p.characters;
  if (!hasFeature(p, to)) return [];
  return p.codex[to] || [];
}

export function scenesForItem(p, id) {
  return allScenes(p).filter(({ scene: s }) =>
    s.povId === id || s.characterIds.includes(id) || s.locationId === id || s.links.includes(id));
}
export const scenesForCharacter = scenesForItem;

/** Everything that links to `id`: [{label, where, view, target}] */
export function backlinks(p, id) {
  const out = [];
  const check = (obj, fields, label, view, target) => {
    for (const f of fields) {
      if (f.type !== "ref" && f.type !== "parent") continue;
      const v = obj[f.key];
      if (Array.isArray(v) ? v.includes(id) : v === id) out.push({ label, where: f.label, view, target });
    }
  };
  for (const c of p.characters) {
    if (c.id === id) continue;
    check(c, allCharacterFields(), c.name, "characters", c.id);
    const rel = c.relationships.find(r => r.targetId === id);
    if (rel) out.push({ label: c.name, where: rel.type || "Relationship", view: "characters", target: c.id });
  }
  for (const k of CODEX_KEYS) {
    if (!hasFeature(p, k)) continue;
    for (const e of p.codex[k]) if (e.id !== id) check(e, SCHEMAS[k], e.name, k, e.id);
  }
  if (hasFeature(p, "clues")) for (const c of p.clues) if (c.characterIds.includes(id))
    out.push({ label: c.name, where: "Clue", view: "clues", target: c.id });
  if (hasFeature(p, "plot")) for (const e of p.events) if (e.characterIds.includes(id))
    out.push({ label: e.title, where: "Timeline event", view: "plot", target: e.id });
  if (hasFeature(p, "maps")) for (const m of p.maps) if (m.pins.some(pin => pin.itemId === id))
    out.push({ label: m.name, where: "Map pin", view: "maps", target: m.id });
  return out;
}

export function cluesForScene(p, sceneId) {
  const out = [];
  for (const c of p.clues) {
    if (c.plantedIn === sceneId) out.push({ clue: c, stage: "Planted" });
    if (c.revealedIn === sceneId) out.push({ clue: c, stage: "Revealed" });
    if (c.payoffIn === sceneId) out.push({ clue: c, stage: "Pays off" });
  }
  return out;
}

/** Status + continuity problems for one clue. */
export function clueStatus(p, c) {
  const pi = sceneIndex(p, c.plantedIn);
  const ri = sceneIndex(p, c.revealedIn);
  const oi = sceneIndex(p, c.payoffIn);
  const problems = [];
  if (pi < 0) problems.push("not planted in any scene");
  if (ri >= 0 && pi >= 0 && ri < pi) problems.push("revealed before it is planted");
  if (oi >= 0 && pi >= 0 && oi < pi) problems.push("pays off before it is planted");
  if (oi >= 0 && ri >= 0 && oi < ri) problems.push("pays off before it is revealed");
  if (pi >= 0 && oi < 0 && c.type !== "Red herring") problems.push("planted but never pays off");
  if (c.type === "Red herring" && pi >= 0 && ri < 0 && oi < 0) problems.push("red herring is never debunked");
  let label = "Unplanted";
  if (pi >= 0) label = "Planted";
  if (ri >= 0) label = "Revealed";
  if (oi >= 0) label = "Resolved";
  return { label, problems, pi, ri, oi };
}

/** Story-wide continuity warnings for the overview page. */
export function storyWarnings(p) {
  const w = [];
  if (hasFeature(p, "clues")) p.clues.forEach(c => clueStatus(p, c).problems.forEach(msg =>
    w.push({ kind: "clue", view: "clues", id: c.id, text: `“${c.name}” ${msg}` })));
  p.characters.forEach(c => {
    if (hasFeature(p, "suspects")) {
      if (["Suspect", "Antagonist", "Villain"].includes(c.role) && !c.motive.trim())
        w.push({ kind: "character", view: "characters", id: c.id, text: `${c.name} is a ${c.role.toLowerCase()} with no motive` });
      if (c.role === "Suspect" && !c.alibi.trim())
        w.push({ kind: "character", view: "characters", id: c.id, text: `${c.name} has no alibi recorded` });
    }
    if (scenesForItem(p, c.id).length === 0 && c.role !== "Minor")
      w.push({ kind: "character", view: "characters", id: c.id, text: `${c.name} doesn't appear in any scene yet` });
  });
  if (hasFeature(p, "magic")) p.codex.magic.forEach(m => {
    if (!m.cost.trim()) w.push({ kind: "magic", view: "magic", id: m.id, text: `${m.name} has no cost or limitation — magic without a price feels unearned` });
  });
  allScenes(p).forEach(({ scene, ci, si }) => {
    if (!scene.synopsis.trim() && countWords(scene.content) === 0)
      w.push({ kind: "scene", view: "manuscript", id: scene.id, text: `Ch ${ci + 1}.${si + 1} “${scene.title}” is empty` });
  });
  return w;
}

// ---------------------------------------------------------------- deletion with cleanup

/** Remove every reference to `id` from scenes, characters, codex, events, clues and maps. */
function scrubRefs(p, id) {
  const scrubFields = (obj, fields) => {
    for (const f of fields) {
      if (f.type === "ref" && Array.isArray(obj[f.key])) obj[f.key] = obj[f.key].filter(x => x !== id);
      if (f.type === "parent" && obj[f.key] === id) obj[f.key] = "";
    }
  };
  p.characters.forEach(c => { scrubFields(c, allCharacterFields()); c.relationships = c.relationships.filter(r => r.targetId !== id); });
  for (const k of CODEX_KEYS) p.codex[k].forEach(e => scrubFields(e, SCHEMAS[k]));
  allScenes(p).forEach(({ scene }) => {
    if (scene.povId === id) scene.povId = "";
    if (scene.locationId === id) scene.locationId = "";
    scene.characterIds = scene.characterIds.filter(x => x !== id);
    scene.links = scene.links.filter(x => x !== id);
  });
  p.events.forEach(e => { e.characterIds = e.characterIds.filter(x => x !== id); });
  p.clues.forEach(c => { c.characterIds = c.characterIds.filter(x => x !== id); });
  p.mystery.culpritIds = p.mystery.culpritIds.filter(x => x !== id);
  p.maps.forEach(m => m.pins.forEach(pin => { if (pin.itemId === id) pin.itemId = ""; }));
}

export function deleteCharacter(p, id) {
  p.characters = p.characters.filter(c => c.id !== id);
  scrubRefs(p, id);
}

export function deleteEntry(p, key, id) {
  p.codex[key] = p.codex[key].filter(e => e.id !== id);
  scrubRefs(p, id);
}

export function deleteScene(p, sceneId) {
  p.chapters.forEach(ch => { ch.scenes = ch.scenes.filter(s => s.id !== sceneId); });
  p.events.forEach(e => { if (e.sceneId === sceneId) e.sceneId = ""; });
  p.clues.forEach(c => {
    for (const k of ["plantedIn", "revealedIn", "payoffIn"]) if (c[k] === sceneId) c[k] = "";
  });
}

export function deleteArc(p, arcId) {
  p.arcs = p.arcs.filter(a => a.id !== arcId);
  p.events.forEach(e => { if (e.arcId === arcId) e.arcId = ""; });
  allScenes(p).forEach(({ scene }) => { scene.arcIds = scene.arcIds.filter(x => x !== arcId); });
}
