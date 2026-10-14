// Snapshots, compared: the window that shows what changed between two versions of a scene or chapter
// (like Scrivener's snapshot Compare). Removed words are struck through, added words highlighted.
//
// The comparison works on the plain text, paragraph by paragraph first (unchanged paragraphs are
// matched quickly), then word by word inside the paragraphs that changed.

import { countWords, htmlToText } from "../../store.js";
import { $, $$, esc, modal, plural } from "../../ui.js";
import { icon } from "../../icons.js";

// ---------------------------------------------------------------- the comparison

const paragraphs = text => text.split(/\n+/).map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const tokens = text => text.match(/\n|[\p{L}\p{N}'’-]+|[^\s\p{L}\p{N}]|\s+/gu) || [];

/** Longest common subsequence of two lists; returns [["=", x] | ["-", x] | ["+", x], …]. */
function lcsDiff(a, b, same = (x, y) => x === y) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = same(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (same(a[i], b[j])) { out.push(["=", a[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(["-", a[i++]]);
    else out.push(["+", b[j++]]);
  }
  while (i < n) out.push(["-", a[i++]]);
  while (j < m) out.push(["+", b[j++]]);
  return out;
}

/** Word-level diff of two passages (falls back to "all replaced" if they are huge and very different). */
function wordDiff(oldText, newText) {
  let a = tokens(oldText), b = tokens(newText);
  if (a.length * b.length <= 6e6) return tidyOps(lcsDiff(a, b));
  // a very long passage: match the unchanged start and end directly; only the middle is compared in full
  let pre = 0, post = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  while (post < a.length - pre && post < b.length - pre && a[a.length - 1 - post] === b[b.length - 1 - post]) post++;
  const head = a.slice(0, pre).join(""), tail = post ? a.slice(a.length - post).join("") : "";
  a = a.slice(pre, a.length - post);
  b = b.slice(pre, b.length - post);
  const ops = a.length * b.length > 6e6
    ? [["-", a.join("")], ["+", b.join("")]]
    : lcsDiff(a, b);
  if (head) ops.unshift(["=", head]);
  if (tail) ops.push(["=", tail]);
  return tidyOps(ops);
}

/** Make a diff read naturally: whole edits instead of word-by-word flicker. */
function tidyOps(ops) {
  // spaces between two changes join the change, so "the old cat" -> "a new dog" reads as one edit
  for (let k = 1; k < ops.length - 1; k++) {
    if (ops[k][0] === "=" && /^[ \t]+$/.test(ops[k][1]) && ops[k - 1][0] !== "=" && ops[k + 1][0] !== "=") {
      ops.splice(k, 1, ["-", ops[k][1]], ["+", ops[k][1]]);
    }
  }
  // merge runs of the same kind; inside a change, show all removals before all additions
  const merged = [];
  for (const [t, x] of ops) {
    const last = merged.at(-1);
    if (last && last[0] === t) last[1] += x; else merged.push([t, x]);
  }
  const tidy = [];
  for (let k = 0; k < merged.length; k++) {
    if (merged[k][0] === "=") { tidy.push(merged[k]); continue; }
    let del = "", ins = "";
    while (k < merged.length && merged[k][0] !== "=") { if (merged[k][0] === "-") del += merged[k][1]; else ins += merged[k][1]; k++; }
    k--;
    if (del) tidy.push(["-", del]);
    if (ins) tidy.push(["+", ins]);
  }
  return tidy;
}

/**
 * Compare two texts. Returns { html, added, removed, changes }:
 * the newer text with removed words (<del>) and added words (<ins>) marked, and the counts.
 */
export function compareTexts(oldText, newText) {
  const A = paragraphs(oldText), B = paragraphs(newText);
  const paraOps = A.length * B.length > 4e6
    ? [...A.map(x => ["-", x]), ...B.map(x => ["+", x])]
    : lcsDiff(A, B);
  const segs = [];                   // [type, text] with "\n" between paragraphs
  for (let k = 0; k < paraOps.length; k++) {
    if (paraOps[k][0] === "=") { segs.push(["=", paraOps[k][1] + "\n"]); continue; }
    const del = [], ins = [];
    while (k < paraOps.length && paraOps[k][0] !== "=") { (paraOps[k][0] === "-" ? del : ins).push(paraOps[k][1]); k++; }
    k--;
    const oldPart = del.join("\n"), newPart = ins.join("\n");
    if (!oldPart) segs.push(["+", newPart + "\n"]);
    else if (!newPart) segs.push(["-", oldPart + "\n"]);
    else { segs.push(...wordDiff(oldPart, newPart)); segs.push(["=", "\n"]); }
  }

  let added = 0, removed = 0, changes = 0, prev = "=";
  const paras = [[]];
  for (const [t, text] of segs) {
    if (t === "+") added += countWords(esc(text));
    if (t === "-") removed += countWords(esc(text));
    if (t !== "=" && prev === "=") changes++;
    prev = t;
    // split into paragraphs: a removed paragraph break shows as ¶ and doesn't break the line
    text.split("\n").forEach((piece, i) => {
      if (i > 0) {
        if (t === "-") paras.at(-1).push(["-", "¶ "]);
        else paras.push([]);
      }
      if (piece) paras.at(-1).push([t, piece]);
    });
  }
  let n = 0;
  const html = paras.filter(p => p.length).map(p => `<p>${p.map(([t, x], i) => {
    if (t === "=") return esc(x);
    const startsChange = i === 0 || p[i - 1][0] === "=";
    const tag = t === "+" ? "ins" : "del";
    return `<${tag}${startsChange ? ` class="chg" data-chg="${n++}"` : ""}>${esc(x)}</${tag}>`;
  }).join("")}</p>`).join("");
  return { html, added, removed, changes };
}

// ---------------------------------------------------------------- the window

/**
 * Open the compare window.
 * versions: [{ id, name, at, auto, html }] (newest last) — the snapshots
 * current:  { html } — the text as it is now
 * startId:  the snapshot to compare against the current text
 * what:     "scene" | "chapter" (for the wording)
 * onRestore(version), onDelete(version): called when the writer asks for them
 */
export function openCompare({ versions, current, startId, what, onRestore, onDelete }) {
  const NOW = "__now";
  const all = [...versions.map(v => ({ ...v, text: v.text ?? htmlToText(v.html) })),
    { id: NOW, name: "Current text", at: Date.now(), html: current.html, text: current.text ?? htmlToText(current.html) }];
  const byId = id => all.find(v => v.id === id);
  const when = v => v.id === NOW ? "now" : new Date(v.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const label = v => v.id === NOW ? "Current text" : `${v.name || "Snapshot"}${v.auto ? " (auto)" : ""} · ${when(v)}`;
  const choices = selected => [...all].reverse().map(v => `<option value="${v.id}" ${v.id === selected ? "selected" : ""}>${esc(label(v))}</option>`).join("");
  let olderId = startId, newerId = NOW, view = "changes", at = -1;

  return modal({
    title: `Compare ${what} versions`,
    wide: true,
    body: `
      <div class="cmpv-pick">
        <label class="field"><span>Older</span><select data-older>${choices(olderId)}</select></label>
        <span class="cmpv-arrow">${icon("chevronRight", 18)}</span>
        <label class="field"><span>Newer</span><select data-newer>${choices(newerId)}</select></label>
      </div>
      <div class="cmpv-bar">
        <div class="seg small" role="tablist">
          <button data-view="changes" class="on">Changes</button><button data-view="older">Older</button><button data-view="newer">Newer</button>
        </div>
        <span class="cmpv-stats"></span>
        <span class="grow"></span>
        <span class="cmpv-nav">
          <button class="btn sm" data-prev title="Previous change">↑</button>
          <button class="btn sm" data-next title="Next change">↓</button>
        </span>
      </div>
      <div class="prose cmpv-text"></div>`,
    buttons: [
      { label: "Delete snapshot", value: "delete", left: true, kind: "sm danger", confirm: "Delete the older snapshot?" },
      { label: "Close", kind: "sm", value: null },
      { label: "Restore older version", kind: "sm primary", value: "restore" },
    ],
    onMount: (root, close) => {
      const out = $(".cmpv-text", root), stats = $(".cmpv-stats", root);
      const footBtn = v => $$(".modal-foot .btn", root).find(b => b.dataset.i === String(["delete", null, "restore"].indexOf(v)));
      const paint = () => {
        const older = byId(olderId), newer = byId(newerId);
        $$("[data-view]", root).forEach(b => b.classList.toggle("on", b.dataset.view === view));
        // restore / delete act on the older version, which must be a snapshot
        const isSnap = older.id !== NOW;
        [footBtn("restore"), footBtn("delete")].forEach(b => { if (b) b.disabled = !isSnap; });
        at = -1;
        if (view === "older" || view === "newer") {
          const v = view === "older" ? older : newer;
          out.innerHTML = v.html || `<p class="faint">Empty</p>`;
          stats.innerHTML = `${esc(label(v))} · ${plural(countWords(v.html), "word")}`;
          $(".cmpv-nav", root).hidden = true;
          return;
        }
        const r = compareTexts(older.text, newer.text);
        out.innerHTML = r.html || `<p class="faint">Both versions are empty.</p>`;
        stats.innerHTML = r.changes
          ? [r.added && `<span class="tag green">+${plural(r.added, "word")}</span>`, r.removed && `<span class="tag red">−${plural(r.removed, "word")}</span>`,
            `<span class="faint">${plural(r.changes, "change")}</span>`].filter(Boolean).join(" ")
          : `<span class="faint">No changes — the two versions are the same.</span>`;
        $(".cmpv-nav", root).hidden = !r.changes;
      };
      const jump = dir => {
        const marks = $$(".chg", out);
        if (!marks.length) return;
        at = (at + dir + marks.length) % marks.length;
        const m = marks[at];
        out.scrollTo({ top: m.offsetTop - out.clientHeight / 3, behavior: "smooth" });
        m.classList.remove("flash"); void m.offsetWidth; m.classList.add("flash");
      };
      $("[data-older]", root).onchange = e => { olderId = e.target.value; paint(); };
      $("[data-newer]", root).onchange = e => { newerId = e.target.value; paint(); };
      $$("[data-view]", root).forEach(b => b.onclick = () => { view = b.dataset.view; paint(); });
      $("[data-prev]", root).onclick = () => jump(-1);
      $("[data-next]", root).onclick = () => jump(1);
      paint();
      // the footer buttons act on whichever older version is chosen
      root.__older = () => byId(olderId);
    },
  }).then(async r => {
    if (!r) return;
    const older = r.root.__older();
    if (older.id === NOW) return;
    if (r.value === "restore") await onRestore(older);
    if (r.value === "delete") await onDelete(older);
  });
}
