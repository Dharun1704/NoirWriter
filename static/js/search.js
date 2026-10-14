// Global search (Ctrl+K): one box that finds scenes, chapters, characters, every worldbuilding / notes
// entry, clues and timeline events in the open project, and jumps to the result.
import { allScenes, htmlToText, hasFeature, CODEX_KEYS } from "./store.js";
import { featureByKey, peopleLabel, SCHEMAS } from "./features.js";
import { $, $$, esc } from "./ui.js";
import { icon } from "./icons.js";

let open = false;

/** Everything searchable in the project, as flat records. */
function buildIndex(p) {
  const items = [];
  const people = peopleLabel(p.genre);
  allScenes(p).forEach(({ scene, chapter, ci, si }) => {
    items.push({
      kind: "Scene", icon: "pen", label: scene.title, sub: `Ch ${ci + 1}.${si + 1} · ${chapter.title}`,
      text: [scene.synopsis, scene.notes, htmlToText(scene.content)].join("\n"),
      view: "manuscript", id: scene.id, isScene: true,
    });
  });
  p.chapters.forEach((ch, ci) => items.push({
    kind: "Chapter", icon: "pen", label: `${ci + 1}. ${ch.title}`, sub: `${ch.scenes.length} scene${ch.scenes.length === 1 ? "" : "s"}`,
    text: "", view: "manuscript", id: ch.scenes[0]?.id || "",
  }));
  p.characters.forEach(c => items.push({
    kind: people.singular[0].toUpperCase() + people.singular.slice(1), icon: "user", label: c.name, sub: [c.role, c.occupation].filter(Boolean).join(" · "),
    text: Object.values(c).filter(v => typeof v === "string" && !v.startsWith("data:")).join("\n"),
    view: "characters", id: c.id,
  }));
  for (const key of CODEX_KEYS) {
    if (!hasFeature(p, key)) continue;
    const f = featureByKey(key);
    const fields = SCHEMAS[key] || [];
    for (const e of p.codex[key]) {
      items.push({
        kind: f.singular, icon: f.icon, label: e.name, sub: e.type || f.label,
        text: fields.map(fd => fd.type === "table" ? (e[fd.key] || []).flat().join(" ") : typeof e[fd.key] === "string" ? e[fd.key] : "").join("\n"),
        view: key, id: e.id,
      });
    }
  }
  if (hasFeature(p, "clues")) p.clues.forEach(c => items.push({
    kind: "Clue", icon: "magnifier", label: c.name, sub: c.type, text: [c.description, c.truth, c.notes].join("\n"), view: "clues", id: c.id,
  }));
  if (hasFeature(p, "plot")) p.events.forEach(e => items.push({
    kind: "Event", icon: "plot", label: e.title, sub: e.when || "Timeline", text: e.description, view: "plot", id: e.id,
  }));
  return items;
}

const PAGES = [
  ["overview", "Overview", "grid"], ["manuscript", "Manuscript", "pen"], ["characters", "Characters", "user"],
  ["plot", "Plot & Timeline", "plot"], ["stats", "Writing stats", "barChart"], ["notes", "Notes & Research", "notebook"],
];

function snippet(text, terms) {
  const lower = text.toLowerCase();
  const at = Math.min(...terms.map(t => lower.indexOf(t)).filter(i => i >= 0));
  if (!isFinite(at)) return "";
  const start = Math.max(0, at - 40), end = Math.min(text.length, at + 90);
  let s = (start ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ") + (end < text.length ? "…" : "");
  s = esc(s);
  for (const t of terms) s = s.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), m => `<mark>${m}</mark>`);
  return s;
}

function search(items, q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  for (const it of items) {
    const label = it.label.toLowerCase(), hay = (label + "\n" + it.sub + "\n" + it.text).toLowerCase();
    if (!terms.every(t => hay.includes(t))) continue;
    let score = 0;
    for (const t of terms) score += label.startsWith(t) ? 30 : label.includes(t) ? 15 : 1;
    if (it.kind === "Scene") score += 2;
    out.push({ ...it, score, snip: terms.some(t => !label.includes(t)) ? snippet(it.text, terms) : "" });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 40);
}

/**
 * Open the search palette. `go(view, id, {find})` navigates; for a scene matched inside its text,
 * `find` carries the query so the editor can highlight it.
 */
export function openSearch(project, go) {
  if (open || !project) return;
  open = true;
  const items = buildIndex(project);
  const back = document.createElement("div");
  back.className = "search-backdrop";
  back.innerHTML = `
    <div class="search-box" role="dialog" aria-modal="true" aria-label="Search this project">
      <div class="search-input">${icon("search", 18)}<input type="text" placeholder="Search scenes, characters, places, clues, notes…" aria-label="Search">
        <kbd>Esc</kbd></div>
      <div class="search-results" role="listbox"></div>
      <div class="search-foot faint small"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> search anywhere</span></div>
    </div>`;
  document.body.appendChild(back);
  const input = $("input", back), list = $(".search-results", back);
  let results = [], sel = 0;

  const close = () => { open = false; back.remove(); document.removeEventListener("keydown", onKey, true); };
  const choose = r => {
    close();
    if (r) go(r.view, r.id, { find: r.isScene && r.snip ? input.value.trim() : "" });
  };
  const paint = () => {
    const q = input.value.trim();
    if (!q) {
      results = PAGES.filter(([k]) => k === "overview" || k === "manuscript" || k === "characters" || k === "stats" || k === "notes" || hasFeature(project, k))
        .map(([view, label, ic]) => ({ kind: "Go to", icon: ic, label, sub: "", view, id: "" }));
    } else {
      results = search(items, q);
    }
    sel = Math.min(sel, Math.max(0, results.length - 1));
    if (!results.length) { list.innerHTML = `<div class="search-empty">Nothing matches “${esc(q)}”.</div>`; return; }
    let lastKind = null;
    list.innerHTML = results.map((r, i) => {
      const head = r.kind !== lastKind ? `<div class="search-group">${esc(r.kind === "Go to" ? "Go to" : r.kind)}</div>` : "";
      lastKind = r.kind;
      return `${head}<div class="search-item ${i === sel ? "on" : ""}" data-i="${i}" role="option" aria-selected="${i === sel}">
        <span class="si-ic">${icon(r.icon, 16)}</span>
        <span class="si-main"><b>${esc(r.label)}</b>${r.sub ? ` <span class="faint">${esc(r.sub)}</span>` : ""}
          ${r.snip ? `<span class="si-snip">${r.snip}</span>` : ""}</span>
        <span class="si-kind faint small">${esc(r.kind)}</span>
      </div>`;
    }).join("");
    $$(".search-item", list).forEach(el => {
      el.onmousemove = () => { if (sel !== +el.dataset.i) { sel = +el.dataset.i; mark(); } };
      el.onclick = () => choose(results[+el.dataset.i]);
    });
  };
  const mark = () => {
    $$(".search-item", list).forEach(el => el.classList.toggle("on", +el.dataset.i === sel));
    $(`.search-item[data-i="${sel}"]`, list)?.scrollIntoView({ block: "nearest" });
  };
  const onKey = e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); mark(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === "Enter") { e.preventDefault(); choose(results[sel]); }
  };
  document.addEventListener("keydown", onKey, true);
  back.addEventListener("mousedown", e => { if (e.target === back) close(); });
  input.oninput = () => { sel = 0; paint(); };
  paint();
  input.focus();
}
