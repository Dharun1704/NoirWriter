// Working with scene text: the chapter page that joins a chapter's scenes (and splits edits back),
// find & replace helpers, cleaning pasted HTML, and the automatic daily snapshots.

import { uid, newScene, countWords, today, htmlToText, findScene } from "../../store.js";
import { $$, esc } from "../../ui.js";

// ---------------------------------------------------------------- chapter mode: one page per chapter
// The chapter's scenes are shown as one text, joined by scene-break markers that remember which
// scene follows. Every edit is split back into the scenes, so nothing about the data changes and
// switching back to scene mode shows the same scenes (plus any new scene breaks you added).

export function chapterHtml(ch) {
  return ch.scenes.map((s, i) => {
    const html = s.content || (ch.scenes.length > 1 ? "<p><br></p>" : "");
    return (i ? `<hr class="scene-split" data-split="${s.id}" title="${esc(s.title)}">` : "") + html;
  }).join("");
}

/** Write the page back into its scenes. Returns scenes whose break was deleted (merged into the one before). */
export function splitChapter(p, ch, root, state) {
  // a marker that ended up inside a paragraph is lifted out to the top level
  $$("hr.scene-split", root).forEach(hr => {
    let top = hr;
    while (top.parentNode !== root) top = top.parentNode;
    if (top !== hr) top.after(hr);
  });
  autoChapterSnapshot(ch);        // the chapter as it was before today's first edit
  const parts = [{ scene: ch.scenes[0], html: "" }];
  for (const n of root.childNodes) {
    if (n.nodeType === 1 && n.matches("hr.scene-split")) {
      const id = n.dataset.split;
      let sc = ch.scenes.find(x => x.id === id) || state.removed.get(id) || state.pending.get(id);
      if (!sc || parts.some(x => x.scene === sc)) {          // a pasted copy of a break: a scene of its own
        sc = newScene(`Scene ${parts.length + 1}`);
        n.dataset.split = sc.id;
      }
      state.removed.delete(sc.id);
      state.pending.delete(sc.id);
      parts.push({ scene: sc, html: "" });
    } else if (n.nodeType === 1) parts.at(-1).html += n.outerHTML;
    else if (n.nodeType === 3 && n.textContent.trim()) parts.at(-1).html += esc(n.textContent);
  }
  const kept = new Set(parts.map(x => x.scene));
  const merged = ch.scenes.filter(sc => !kept.has(sc));
  for (const part of parts) part.scene.content = part.html;
  // a deleted break merges that scene into the one before it: keep its details there too
  for (const m of merged) {
    const old = ch.scenes.indexOf(m);
    const into = [...ch.scenes.slice(0, old)].reverse().find(x => kept.has(x)) || parts[0].scene;
    const union = (a, b) => [...new Set([...a, ...b])];
    into.characterIds = union(into.characterIds, m.characterIds);
    into.arcIds = union(into.arcIds, m.arcIds);
    into.links = union(into.links, m.links);
    if (m.synopsis.trim() && !into.synopsis.includes(m.synopsis.trim())) into.synopsis = [into.synopsis.trim(), m.synopsis.trim()].filter(Boolean).join(" ");
    if (m.notes.trim() && !into.notes.includes(m.notes.trim())) into.notes = [into.notes.trim(), m.notes.trim()].filter(Boolean).join("\n\n");
    p.events.forEach(e => { if (e.sceneId === m.id) e.sceneId = into.id; });
    p.clues.forEach(c => { for (const k of ["plantedIn", "revealedIn", "payoffIn"]) if (c[k] === m.id) c[k] = into.id; });
    state.removed.set(m.id, m);                       // Ctrl+Z brings the break (and the scene) back
  }
  ch.scenes = parts.map(x => x.scene);
  // only mention merges of scenes that had something in them
  return merged.filter(m => countWords(m.content) || m.synopsis.trim() || m.notes.trim());
}

// ---------------------------------------------------------------- find & replace, pasting

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function findRanges(root, q, caseSensitive) {
  if (!q) return [];
  const re = new RegExp(escapeRe(q), caseSensitive ? "g" : "gi");
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    for (const m of node.textContent.matchAll(re)) {
      const r = document.createRange();
      r.setStart(node, m.index);
      r.setEnd(node, m.index + m[0].length);
      out.push(r);
    }
  }
  return out;
}

export function countInHtml(html, q, cs) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return findRanges(div, q, cs).length;
}

export const countInManuscript = (p, q, cs) => p.chapters.reduce((n, ch) => n + ch.scenes.reduce((m, s) => m + countInHtml(s.content, q, cs), 0), 0);

export function replaceInHtml(html, q, rep, cs) {
  const div = document.createElement("div");
  div.innerHTML = html;
  const re = new RegExp(escapeRe(q), cs ? "g" : "gi");
  let count = 0;
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    node.textContent = node.textContent.replace(re, () => { count++; return rep; });
  }
  return { html: div.innerHTML, count };
}

const ALLOWED = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "S", "H1", "H2", "H3", "BLOCKQUOTE", "UL", "OL", "LI", "HR", "SUP", "SUB"]);
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const clean = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 8) { child.remove(); continue; }
      if (child.nodeType !== 1) continue;
      clean(child);
      if (["SCRIPT", "STYLE", "META", "LINK", "TITLE"].includes(child.tagName)) { child.remove(); continue; }
      if (child.tagName === "DIV") {
        const pEl = document.createElement("p");
        pEl.append(...child.childNodes);
        child.replaceWith(pEl);
        continue;
      }
      if (!ALLOWED.has(child.tagName)) {
        // keep italics/bold expressed as inline CSS (e.g. from Word / Google Docs)
        const st = child.getAttribute("style") || "";
        let wrapped = [...child.childNodes];
        if (/font-style:\s*italic/.test(st)) { const i = document.createElement("i"); i.append(...wrapped); wrapped = [i]; }
        if (/font-weight:\s*(bold|[6-9]00)/.test(st)) { const b = document.createElement("b"); b.append(...wrapped); wrapped = [b]; }
        child.replaceWith(...wrapped);
        continue;
      }
      for (const a of [...child.attributes]) child.removeAttribute(a.name);
    }
  };
  clean(doc.body);
  return doc.body.innerHTML;
}

// ---------------------------------------------------------------- automatic daily snapshots

const AUTO_SNAPSHOTS_KEPT = 10;

/**
 * The first time a scene is edited on a given day, keep a copy of how it looked before that edit.
 * Only the newest AUTO_SNAPSHOTS_KEPT automatic copies per scene are kept; manual snapshots are never pruned.
 */
export function autoSnapshot(scene, before) {
  const day = today();
  if (!before || countWords(before) === 0) return;
  if (scene.snapshots.some(x => x.auto && x.day === day)) return;
  scene.snapshots.push({
    id: uid(), at: Date.now(), day, auto: true, content: before,
    name: `Start of ${new Date().toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}`,
  });
  const autos = scene.snapshots.filter(x => x.auto);
  if (autos.length > AUTO_SNAPSHOTS_KEPT) {
    const drop = new Set(autos.slice(0, autos.length - AUTO_SNAPSHOTS_KEPT));
    scene.snapshots = scene.snapshots.filter(x => !drop.has(x));
  }
}

// ---------------------------------------------------------------- chapter snapshots (writing by chapter)
// A chapter snapshot keeps a copy of every scene in the chapter: { id, at, name, auto?, day?, scenes: [{ id, title, content }] }

const dayName = () => new Date().toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

/** Take a snapshot of the whole chapter. */
export function chapterSnapshot(ch, name, extra = {}) {
  const snap = { id: uid(), at: Date.now(), name, scenes: ch.scenes.map(s => ({ id: s.id, title: s.title, content: s.content })), ...extra };
  ch.snapshots.push(snap);
  return snap;
}

/** Like autoSnapshot, for a chapter: once a day, before the first edit, keeping the newest few. */
export function autoChapterSnapshot(ch) {
  const day = today();
  if (!ch.scenes.some(s => countWords(s.content))) return;
  if (ch.snapshots.some(x => x.auto && x.day === day)) return;
  chapterSnapshot(ch, `Start of ${dayName()}`, { auto: true, day });
  const autos = ch.snapshots.filter(x => x.auto);
  if (autos.length > AUTO_SNAPSHOTS_KEPT) {
    const drop = new Set(autos.slice(0, autos.length - AUTO_SNAPSHOTS_KEPT));
    ch.snapshots = ch.snapshots.filter(x => !drop.has(x));
  }
}

/** The chapter's text as one page (scene breaks as ⁂), for viewing and comparing. */
export const chapterSnapshotHtml = scenes => scenes.map(s => s.content).join("<hr>");
export const chapterSnapshotText = scenes => scenes.map(s => htmlToText(s.content)).join("\n* * *\n");

/**
 * Put a chapter back as it was in a snapshot. Its scenes get their old text back (a scene deleted since
 * is brought back); scenes added after the snapshot are kept where they are. The current text is
 * saved as a snapshot first, so this can be undone.
 */
export function restoreChapterSnapshot(p, ch, snap) {
  chapterSnapshot(ch, "Auto: before restoring " + (snap.name || "snapshot"));
  const current = ch.scenes;
  const restored = snap.scenes.map(saved => {
    // a scene since moved to another chapter isn't pulled back: its old text comes back as a copy
    const sc = current.find(s => s.id === saved.id)
      || Object.assign(newScene(saved.title), findScene(p, saved.id) ? {} : { id: saved.id });
    sc.content = saved.content;
    return sc;
  });
  // scenes written after the snapshot stay, right after the scene they followed
  current.forEach((sc, i) => {
    if (restored.includes(sc)) return;
    const before = current.slice(0, i).reverse().find(x => restored.includes(x));
    restored.splice(before ? restored.indexOf(before) + 1 : 0, 0, sc);
  });
  ch.scenes = restored;
}

