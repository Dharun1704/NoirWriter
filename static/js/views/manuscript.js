// The Manuscript page: binder on the left, then Write (editor + scene details), Corkboard,
// Outliner or Read-through in the middle. The parts live in ./manuscript/; this file lays out the
// page and switches between the views.

import { newScene, findScene } from "../store.js";
import { resizer, bindResizers, applyLayout, togglePanel, isCollapsed, setCollapsed } from "../layout.js";
import { icon } from "../icons.js";
import { sprintState } from "../sprint.js";
import { $, $$, afterPaint, collapsible, followThumb, segOpenClass } from "../ui.js";
import { prefs, savePrefs, view, rememberScene, recallScene } from "./manuscript/state.js";
import { renderBinder } from "./manuscript/binder.js";
import { renderEditor } from "./manuscript/editor.js";
import { renderMeta } from "./manuscript/meta.js";
import { renderCorkboard } from "./manuscript/corkboard.js";
import { renderOutliner } from "./manuscript/outliner.js";
import { renderReadThrough } from "./manuscript/readthrough.js";

export { setPendingFind } from "./manuscript/editor.js";

export function renderManuscript(ctx) {
  const { project: p, el } = ctx;
  let current = findScene(p, ctx.item) || findScene(p, recallScene(p));
  if (!current) {
    const firstCh = p.chapters.find(ch => ch.scenes.length);
    if (firstCh) current = findScene(p, firstCh.scenes[0].id);
  }
  if (current) rememberScene(p, current.scene.id);
  if (ctx.item && prefs.mode !== "write") switchMode("write");

  const meta = prefs.mode === "write";
  document.body.classList.toggle("focus-mode", view.focusMode);
  const shell = `
    <div class="ms ${view.focusMode ? "focus" : ""}">
      <aside class="binder" id="binder"></aside>
      ${resizer("binder", 1)}
      <section class="center" id="center">
        <div class="mode-bar">
          <button class="tb" data-toggle-binder title="Show / hide binder">${icon("panelLeft")}</button>
          <div class="seg seg-modes sliding${prefs.mode === "read" ? "" : " collapsible" + segOpenClass("modes")}" title="Switch view">${[["write", "Write"], ["corkboard", "Corkboard"], ["outliner", "Outliner"]]
            .map(([k, l]) => `<button data-mode="${k}" class="${prefs.mode === k ? "on" : ""}">${l}</button>`).join("")}</div>
          <span class="grow"></span>
          <button class="tb tb-read ${prefs.mode === "read" ? "on" : ""}" data-read title="${prefs.mode === "read" ? "Back to " + (prefs.beforeRead || "write") : "Read-through: the whole book as one continuous text"}" aria-pressed="${prefs.mode === "read"}">${icon("bookOpen")}</button>
          ${prefs.mode === "write" ? `
            <button class="tb ${sprintState()?.projectId === p.id ? "on" : ""}" data-sprint title="Writing sprint: a timer plus the words you write">${icon("timer")}</button>
            <button class="tb ${prefs.styleCheck ? "on" : ""}" data-style-check title="Style check: mark adverbs, overused words and very long sentences">${icon("styleCheck")}</button>
            <button class="tb" data-find title="Find &amp; replace (Ctrl+F)">${icon("search")}</button>
            <button class="tb" data-settings title="Page &amp; writing settings">${icon("sliders")}</button>
            <button class="tb" data-toolbar-mode title="${prefs.toolbar === "floating" ? "Floating toolbar: appears when you select text. Click for a fixed toolbar." : "Fixed toolbar. Click for a floating toolbar that appears when you select text."}">${icon(prefs.toolbar === "floating" ? "toolbarFloat" : "toolbarFixed")}</button>
            <button class="tb" data-focus title="${view.focusMode ? "Exit focus mode (Esc)" : "Focus mode (Ctrl+Shift+F)"}">${icon(view.focusMode ? "unfocus" : "focus")}</button>
            <span class="sep"></span>
            <button class="tb mode-meta" data-toggle-meta title="Show / hide scene details">${icon("panelRight")}</button>` : ""}
        </div>
        <div class="center-body" id="center-body"></div>
      </section>
      ${meta ? `${resizer("meta", -1)}<aside class="meta-panel" id="meta"></aside>` : ""}
    </div>`;

  // Opening another chapter or scene keeps the page frame (top bar, panels) exactly as it is;
  // only the binder, the editor and the details are redrawn. Anything else rebuilds the frame.
  if (el.__ms && el.contains(el.__ms) && el.__msShell === shell && el.__msProject === p) {
    $("#center-body", el).className = "center-body";
    fillManuscript(ctx, current, meta);
    return;
  }
  el.innerHTML = shell;
  el.__ms = $(".ms", el);
  el.__msShell = shell;
  el.__msProject = p;

  $$("[data-mode]", el).forEach(b => b.onclick = () => {
    if (b.dataset.mode === prefs.mode) return;
    switchMode(b.dataset.mode);
    renderManuscript({ ...ctx, item: "" });
  });
  $("[data-read]", el).onclick = () => {
    if (prefs.mode === "read") switchMode(prefs.beforeRead || "write");
    else { prefs.beforeRead = prefs.mode; switchMode("read"); }
    renderManuscript({ ...ctx, item: "" });
  };
  // keep the binder header exactly as tall as the top bar, so their bottom lines meet at one level
  const bar = $(".mode-bar", el);
  const syncBar = () => document.documentElement.style.setProperty("--bar-h", bar.offsetHeight + "px");
  syncBar();
  new ResizeObserver(syncBar).observe(bar);
  $("[data-toggle-binder]", el).onclick = () => togglePanel("binder");
  const tm = $("[data-toggle-meta]", el);
  if (tm) tm.onclick = () => togglePanel("meta");
  bindResizers(el);
  applyLayout();

  fillManuscript(ctx, current, meta);
  // last, once everything is built: the highlight slides with nothing else competing for the browser
  slideSegThumb($(".mode-bar .seg", el));
  collapsible($(".mode-bar .seg", el), "modes");
}

/** The binder, then the current view (with the details panel when writing). */
function fillManuscript(ctx, current, meta) {
  renderBinder(ctx, current);
  if (prefs.mode === "write") {
    renderEditor(ctx, current);
    if (meta) renderMeta(ctx, current);
  } else if (prefs.mode === "corkboard") renderCorkboard(ctx);
  else if (prefs.mode === "outliner") renderOutliner(ctx);
  else renderReadThrough(ctx);
}

export const openScene = (ctx, id) => { switchMode("write"); ctx.go("manuscript", id); };
/** Chapter mode: open a chapter as one page (giving an empty chapter its first scene). */
export function openChapter(ctx, ch) {
  if (!ch.scenes.length) { ch.scenes.push(newScene("Scene 1")); ctx.save(); }
  openScene(ctx, ch.scenes[0].id);
}

// Read-through folds the binder away for a clean reading page, and brings it back afterwards
// (only if it was open before — a binder you hid yourself stays hidden).
let segFrom = null;
export function switchMode(mode) {
  if (mode === prefs.mode) return;
  segFrom = prefs.mode;
  if (mode === "read" && !isCollapsed("binder")) {
    prefs.binderAutoHidden = true;
    setCollapsed("binder", true);
  } else if (prefs.mode === "read" && prefs.binderAutoHidden) {
    prefs.binderAutoHidden = false;
    setCollapsed("binder", false);
  }
  prefs.mode = mode;
  savePrefs();
}

/**
 * Slide the highlight from the previous view's button to the new one, and fade the new view in.
 * Both start only after the new page has been drawn (afterPaint), so they don't stutter.
 */
function slideSegThumb(seg) {
  if (!seg) return;
  const target = seg.querySelector("button.on");
  seg.classList.add("sliding");
  const thumb = document.createElement("span");
  thumb.className = "seg-thumb";
  seg.prepend(thumb);
  const place = btn => { thumb.style.left = btn.offsetLeft + "px"; thumb.style.width = btn.offsetWidth + "px"; };
  const from = segFrom && seg.querySelector(`[data-mode="${segFrom}"]`);
  const switched = !!segFrom;
  segFrom = null;
  const body = $("#center-body");

  followThumb(seg, thumb, place, switched ? 450 : 0);
  if (!switched) {                              // first render: just sit on the current view
    if (target) place(target); else thumb.classList.add("gone");
    requestAnimationFrame(() => thumb.classList.add("animate"));
    return;
  }
  // start where the highlight was: on the previous button, or hidden when coming back from Read-through
  if (from) place(from); else { place(target); thumb.classList.add("gone"); }
  body?.classList.add("view-pending");          // the new view waits, invisible, for its fade-in
  afterPaint(() => {
    thumb.classList.add("animate");
    if (!target) thumb.classList.add("gone");   // into Read-through (not in the switcher): fade out where it was
    else { place(target); thumb.classList.remove("gone"); }
    body?.classList.replace("view-pending", "view-enter");
  });
}
