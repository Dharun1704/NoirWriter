// The writing page: formatting toolbar (fixed or floating), find & replace, the style check,
// smart punctuation, page settings and writing sprints. Writing by chapter, the page holds the
// whole chapter and every edit is split back into its scenes (see content.js).

import { uid, newScene, countWords, chapterWords, totalWords, logWriting, logStats, CODEX_KEYS } from "../../store.js";
import { GENRES } from "../../features.js";
import { resetLayout } from "../../layout.js";
import { icon } from "../../icons.js";
import { startSprint, sprintState, stopSprint, remaining, mmss } from "../../sprint.js";
import { $, $$, esc, fmt, confirmBox, promptBox, toast } from "../../ui.js";
import { renderManuscript, openScene } from "../manuscript.js";
import { prefs, savePrefs, resetPrefs, editorStyle, view, byChapter, rememberScene, chapterTarget } from "./state.js";
import { popover, closePopover, currentPopover, onPopoverClose, popoverCloseHook } from "./popover.js";
import { chapterHtml, splitChapter, findRanges, countInHtml, countInManuscript, replaceInHtml, sanitizeHtml, autoSnapshot } from "./content.js";
import { analyseStyle } from "./style-check.js";
import { renderBinder } from "./binder.js";
import { renderMeta, renderEditorCrumb } from "./meta.js";

const FONTS = ["Lora", "EB Garamond", "Georgia", "Times New Roman", "Courier Prime", "Special Elite", "Cinzel", "Inter", "Arial"];
const SIZES = [12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48];
const STYLES = [["p", "Body text"], ["h1", "Heading 1"], ["h2", "Heading 2"], ["h3", "Heading 3"], ["blockquote", "Block quote"], ["pre", "Typewriter / letter"]];
const ALIGNS = [["justifyLeft", "alignLeft", "Align left"], ["justifyCenter", "alignCenter", "Centre"], ["justifyRight", "alignRight", "Align right"], ["justifyFull", "alignJustify", "Justify"]];
const COLORS = ["#e8e2d6", "#9a9184", "#c9a45c", "#c4544a", "#d08a4e", "#7fa36b", "#5fa8a0", "#6d8fb3", "#a07cc0", "#111111"];
const HIGHLIGHTS = ["#5c4b2a", "#5c2f2a", "#3c5232", "#34475c", "#4a3a5c", "#f3e38a", "#f6b4a8", "#bfe3b4"];

let sessionAdded = 0;          // words added since the app was opened
let findState = { open: false, query: "", replace: "", caseSensitive: false, scope: "scene", index: 0 };

/** Global search opens a scene with its match highlighted in the find bar. */
export function setPendingFind(query) {
  findState = { ...findState, open: true, query, index: 0, scope: "scene" };
  prefs.mode = "write";
  savePrefs();
}

export function renderEditor(ctx, current) {
  const { project: p } = ctx;
  const body = $("#center-body");
  if (!current) {
    body.innerHTML = `<div class="empty">Nothing on the page yet.<br><button class="btn primary" data-first>Add a scene</button></div>`;
    $("[data-first]", body).onclick = () => {
      if (!p.chapters.length) p.chapters.push({ id: uid(), title: "Chapter One", open: true, scenes: [] });
      const s = newScene("Opening scene");
      p.chapters[0].scenes.push(s);
      ctx.save();
      openScene(ctx, s.id);
    };
    return;
  }
  const chapterPage = byChapter(p);
  const ch = current.chapter;
  const s = current.scene;                 // chapter mode: the scene shown in the details panel
  const split = { removed: new Map(), pending: new Map() };
  body.innerHTML = `
    <div class="toolbar ${prefs.toolbar === "floating" ? "floating" : ""}" id="toolbar" role="toolbar" aria-label="Formatting">
      <span class="tb-group fixed-only">
        <button class="tb" data-cmd="undo" title="Undo (Ctrl+Z)">${icon("undo")}</button>
        <button class="tb" data-cmd="redo" title="Redo (Ctrl+Y)">${icon("redo")}</button>
      </span>
      <span class="tb-group">
        <button class="tb tb-drop w-style" data-drop="style" title="Paragraph style"><span class="lbl" id="lbl-style">Body text</span>${icon("chevron", 14)}</button>
        <button class="tb tb-drop w-font" data-drop="font" title="Font"><span class="lbl" id="lbl-font">${esc(prefs.font)}</span>${icon("chevron", 14)}</button>
        <button class="tb tb-drop w-size" data-drop="size" title="Text size"><span class="lbl" id="lbl-size">${prefs.size}</span>${icon("chevron", 14)}</button>
      </span>
      <span class="tb-group">
        <button class="tb" data-cmd="bold" data-state="bold" title="Bold (Ctrl+B)">${icon("bold")}</button>
        <button class="tb" data-cmd="italic" data-state="italic" title="Italic (Ctrl+I)">${icon("italic")}</button>
        <button class="tb" data-cmd="underline" data-state="underline" title="Underline (Ctrl+U)">${icon("underline")}</button>
        <button class="tb" data-cmd="strikeThrough" data-state="strikeThrough" title="Strikethrough">${icon("strike")}</button>
      </span>
      <span class="tb-group">
        <button class="tb tb-color" data-color="foreColor" title="Text colour">${icon("color")}<span class="color-bar" id="color-bar"></span></button>
        <button class="tb tb-color" data-color="hiliteColor" title="Highlight">${icon("highlight")}<span class="color-bar hl" id="hl-bar"></span></button>
      </span>
      <span class="tb-group">
        <button class="tb tb-drop icon-drop" data-drop="align" title="Alignment"><span id="lbl-align">${icon("alignLeft")}</span>${icon("chevron", 14)}</button>
        <button class="tb" data-cmd="insertUnorderedList" data-state="insertUnorderedList" title="Bulleted list">${icon("bullets")}</button>
        <button class="tb" data-cmd="insertOrderedList" data-state="insertOrderedList" title="Numbered list">${icon("numbers")}</button>
      </span>
      <span class="tb-group">
        <button class="tb" data-link title="Insert link">${icon("link")}</button>
        <button class="tb" data-comment title="Comment on selected text">${icon("comment")}</button>
      </span>
      <span class="tb-group">
        <button class="tb fixed-only" data-drop="insert" title="Insert scene break, dashes…">${icon("plus")}</button>
        <button class="tb" data-drop="more" title="More formatting">${icon("more")}</button>
      </span>
    </div>
    <div class="find-bar" id="find-bar" ${findState.open ? "" : "hidden"}>
      <input type="text" id="find-q" placeholder="Find" value="${esc(findState.query)}">
      <input type="text" id="find-r" placeholder="Replace with" value="${esc(findState.replace)}">
      <label class="chk"><input type="checkbox" id="find-case" ${findState.caseSensitive ? "checked" : ""}> Aa</label>
      <select id="find-scope" style="width:auto"><option value="scene">${chapterPage ? "This chapter" : "This scene"}</option><option value="all" ${findState.scope === "all" ? "selected" : ""}>Whole manuscript</option></select>
      <span class="faint" id="find-count"></span>
      <button class="btn sm" data-find-prev title="Previous (Shift+Enter)">↑</button>
      <button class="btn sm" data-find-next title="Next (Enter)">↓</button>
      <button class="btn sm" data-replace>Replace</button>
      <button class="btn sm" data-replace-all>Replace all</button>
      <button class="icon-btn" data-find-close title="Close find (Esc)" aria-label="Close find">${icon("x", 16)}</button>
    </div>
    <div class="editor-scroll" id="editor-scroll">
      <div class="page" style="${editorStyle()}">
        <input class="scene-title-input" id="scene-title" value="${esc(chapterPage ? ch.title : s.title)}" placeholder="${chapterPage ? "Chapter title" : "Scene title"}">
        <div class="scene-crumb" id="crumb"></div>
        <div class="prose ${prefs.indent ? "indent" : ""}" id="prose" contenteditable="true" spellcheck="true"
             data-placeholder="${esc(GENRES[p.genre].placeholder)}"></div>
      </div>
    </div>
    <div class="status-bar" id="status-bar"></div>`;

  const prose = $("#prose");
  prose.innerHTML = chapterPage ? chapterHtml(ch) : s.content;
  renderEditorCrumb(ctx, current);
  document.execCommand("defaultParagraphSeparator", false, "p");
  // opened at a later scene of the chapter: start there
  if (chapterPage && ch.scenes[0] !== s) {
    const mark = prose.querySelector(`hr.scene-split[data-split="${s.id}"]`);
    if (mark) requestAnimationFrame(() => {
      const scroller = $("#editor-scroll");      // gone if the writer already moved on
      if (scroller) scroller.scrollTop = mark.offsetTop - 40;
    });
  }

  let words = chapterPage ? chapterWords(ch) : countWords(s.content);
  const otherWords = totalWords(p) - words;
  let styleCounts = null;

  const updateStatus = () => {
    const sel = getSelection();
    const selWords = sel && !sel.isCollapsed && prose.contains(sel.anchorNode) ? countWords(sel.toString().replace(/[<>&]/g, " ")) : 0;
    const chars = prose.textContent.length;
    const ls = logStats(p);
    const goal = chapterPage ? chapterTarget(ch) : s.target;
    const target = goal ? Math.min(100, Math.round((words / goal) * 100)) : 0;
    $("#status-bar").innerHTML = `
      <span><b>${fmt(words)}</b> words</span>
      ${goal ? `<span class="target">target ${fmt(goal)} <span class="mini-progress"><span style="width:${target}%"></span></span> ${target}%</span>` : ""}
      <span>${fmt(chars)} characters</span>
      ${selWords ? `<span class="sel">${fmt(selWords)} selected</span>` : ""}
      <span>${Math.max(1, Math.round(words / 250))} min read</span>
      ${prefs.styleCheck && styleCounts ? `<span class="style-legend" title="Style check is on (the Aa✓ button)">
        <span class="sl sl-adverb"></span>${styleCounts.adverbs} adverb${styleCounts.adverbs === 1 ? "" : "s"}
        <span class="sl sl-repeat"></span>${styleCounts.repeats} repeated
        <span class="sl sl-long"></span>${styleCounts.longs} long sentence${styleCounts.longs === 1 ? "" : "s"}</span>` : ""}
      <span class="grow"></span>
      <span title="Words added since you opened NoirWrite">session +${fmt(sessionAdded)}</span>
      <span title="Net words today">today ${fmt(ls.todayNet)}${ls.goal ? ` / ${fmt(ls.goal)}` : ""}</span>
      <span>${fmt(otherWords + words)} total</span>`;
    const sw = $(`[data-scene-wc="${s.id}"]`);
    if (sw) sw.textContent = fmt(words);
    const cw = $(`[data-ch-wc="${current.chapter.id}"]`);
    if (cw) cw.textContent = fmt(chapterWords(current.chapter));
  };
  updateStatus();

  const changed = () => {
    let w;
    if (chapterPage) {
      // about to lose a scene break? keep the chapter as it was, so Undo can bring it back exactly
      const marks = new Set($$("hr.scene-split", prose).map(h => h.dataset.split));
      const before = ch.scenes.slice(1).some(sc => !marks.has(sc.id))
        ? JSON.stringify({ chapters: p.chapters, events: p.events, clues: p.clues }) : null;
      const merged = splitChapter(p, ch, prose, split);
      w = chapterWords(ch);
      if (merged.length) {
        renderBinder(ctx, current);
        toast(`Removed the scene break: “${merged[0].title}” joined the scene before it`, {
          action: "Undo",
          onAction: () => {
            Object.assign(p, JSON.parse(before));
            ctx.save();
            renderManuscript({ ...ctx, item: merged[0].id });
            toast("Scene break restored");
          },
        });
      }
    } else {
      autoSnapshot(s, s.content);          // the scene as it was before today's first edit
      s.content = prose.innerHTML;
      w = countWords(s.content);
    }
    const delta = w - words;
    words = w;
    logWriting(p, delta);
    if (delta > 0) sessionAdded += delta;
    updateStatus();
    ctx.save(1000);
    if (findState.open) runFind(false);
    clearTimeout(styleTimer);
    styleTimer = setTimeout(runStyleCheck, 350);
  };
  let styleTimer = 0;

  // ---- style check: CSS Custom Highlights, so the text itself is never modified
  function runStyleCheck() {
    if (!window.CSS?.highlights || !document.body.contains(prose)) return;
    const names = ["style-adverb", "style-repeat", "style-long"];
    if (!prefs.styleCheck) { names.forEach(n => CSS.highlights.delete(n)); styleCounts = null; updateStatus(); return; }
    // names of characters, places and other entries naturally recur: never flag them as repeats
    const properNames = new Set();
    const addName = n => String(n || "").toLowerCase().split(/[^\p{L}'’]+/u).forEach(w => w.length >= 3 && properNames.add(w));
    p.characters.forEach(c => addName(c.name));
    CODEX_KEYS.forEach(k => (p.codex[k] || []).forEach(e => addName(e.name)));
    const found = analyseStyle(prose, properNames);
    CSS.highlights.set("style-adverb", new Highlight(...found.adverbs));
    CSS.highlights.set("style-repeat", new Highlight(...found.repeats));
    CSS.highlights.set("style-long", new Highlight(...found.longs));
    styleCounts = { adverbs: found.adverbs.length, repeats: found.repeatWords, longs: found.longs.length };
    updateStatus();
  }

  prose.addEventListener("focus", () => {
    if (!prose.innerHTML.trim()) {
      prose.innerHTML = "<p><br></p>";
      placeCaret(prose.firstChild);
    }
  });
  prose.addEventListener("blur", () => {
    if (prose.textContent.trim() === "" && !prose.querySelector("hr,img")) prose.innerHTML = "";
  });
  prose.addEventListener("input", () => {
    // bare text typed straight into the editor (no paragraph yet) gets wrapped in <p>
    wrapStrayText(prose);
    changed(); if (prefs.typewriter) typewriterScroll(); });
  prose.addEventListener("keyup", e => { if (prefs.typewriter && e.key.startsWith("Arrow")) typewriterScroll(); });
  document.onselectionchange = () => { if (document.body.contains(prose)) updateStatus(); else document.onselectionchange = null; };

  // smart punctuation: curly quotes and -- to em dash
  prose.addEventListener("beforeinput", e => {
    if (!prefs.smart || e.inputType !== "insertText") return;
    const prev = charBeforeCaret();
    if (e.data === '"' || e.data === "'") {
      e.preventDefault();
      const opening = !prev || /[\s(\[{—–-]/.test(prev);
      const ch = e.data === '"' ? (opening ? "“" : "”") : (opening ? "‘" : "’");
      document.execCommand("insertText", false, ch);
    } else if (e.data === "-" && prev === "-") {
      e.preventDefault();
      document.execCommand("delete");
      document.execCommand("insertText", false, "—");
    }
  });

  // paste: keep basic formatting (italics, bold, paragraphs, headings, lists), drop the rest
  prose.addEventListener("paste", e => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    if (html) {
      document.execCommand("insertHTML", false, sanitizeHtml(html));
    } else {
      const text = e.clipboardData.getData("text/plain");
      const paras = text.replace(/\r/g, "").split(/\n\s*\n|\n/).filter(x => x.trim());
      if (paras.length <= 1) document.execCommand("insertText", false, text);
      else document.execCommand("insertHTML", false, paras.map(x => `<p>${esc(x.trim())}</p>`).join(""));
    }
  });

  $("#scene-title").oninput = e => {
    if (chapterPage) {
      ch.title = e.target.value;
      const row = $(`[data-ch-title="${ch.id}"]`);
      if (row) row.textContent = `${p.chapters.indexOf(ch) + 1}. ${ch.title}`;
      renderEditorCrumb(ctx, metaAt);
    } else {
      s.title = e.target.value;
      const row = $(`[data-scene-title="${s.id}"]`);
      if (row) row.textContent = s.title;
    }
    ctx.save();
  };

  // chapter mode: the details panel follows the scene the caret is in
  let metaAt = current;
  const followCaret = () => {
    if (!chapterPage || ch.scenes.length < 2) return;
    const sel = getSelection();
    if (!sel.rangeCount || !prose.contains(sel.anchorNode)) return;
    let node = sel.anchorNode === prose ? prose.childNodes[Math.min(sel.anchorOffset, prose.childNodes.length - 1)] : sel.anchorNode;
    if (!node) return;
    let id = ch.scenes[0].id;
    for (const hr of $$("hr.scene-split", prose)) {
      if (hr === node || hr.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) id = hr.dataset.split;
      else break;
    }
    if (id === metaAt.scene.id) return;
    const si = ch.scenes.findIndex(x => x.id === id);
    if (si < 0) return;
    metaAt = { chapter: ch, scene: ch.scenes[si], si, ci: p.chapters.indexOf(ch) };
    rememberScene(p, id);
    renderEditorCrumb(ctx, metaAt);
    renderMeta(ctx, metaAt);
  };
  $("#scene-title").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); prose.focus(); } };

  // ---- toolbar
  const tb = $("#toolbar");
  const exec = (cmd, val = null) => {
    document.execCommand("styleWithCSS", false, ["foreColor", "hiliteColor", "fontName"].includes(cmd));
    document.execCommand(cmd, false, val);
    changed();
    updateToolbar();
  };
  // keep the editor's selection while clicking toolbar buttons
  $$("button.tb", tb).forEach(b => b.addEventListener("mousedown", e => e.preventDefault()));
  let savedRange = null;
  const saveRange = () => {
    const sel = getSelection();
    if (sel.rangeCount && prose.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
  };
  const restoreRange = () => {
    if (!savedRange) return false;
    prose.focus({ preventScroll: true });
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    return true;
  };
  const applySize = px => {
    document.execCommand("styleWithCSS", false, true);
    document.execCommand("fontSize", false, "7");
    $$('[style*="xxx-large"], font[size="7"]', prose).forEach(n => {
      if (n.tagName === "FONT") { const sp = document.createElement("span"); sp.append(...n.childNodes); n.replaceWith(sp); n = sp; }
      n.style.fontSize = px + "px";
    });
    changed();
    updateToolbar();
  };
  // pick an item from a toolbar menu without losing the text selection
  const menu = (anchor, html, onPick, onMount) => {
    if (currentPopover()?.dataset.anchor === anchor.dataset.drop + anchor.dataset.color) return closePopover();
    saveRange();
    popover(anchor, html, pop => {
      pop.dataset.anchor = anchor.dataset.drop + anchor.dataset.color;
      $$("[data-pick]", pop).forEach(item => item.onmousedown = e => {
        e.preventDefault();
        restoreRange();
        onPick(item.dataset.pick);
        closePopover();
      });
      onMount?.(pop);
    });
  };

  $$("[data-cmd]", tb).forEach(b => b.onclick = () => exec(b.dataset.cmd));
  const MENUS = {
    style: b => menu(b, `<div class="menu-list">${STYLES.map(([tag, label]) =>
        `<button class="menu-item style-${tag} ${$("#lbl-style").textContent === label ? "on" : ""}" data-pick="${tag}">${label}</button>`).join("")}</div>`,
      tag => exec("formatBlock", tag)),
    font: b => menu(b, `
        <div class="menu-title">Font for selected text</div>
        <div class="menu-list">${FONTS.map(f =>
          `<button class="menu-item ${$("#lbl-font").textContent === f ? "on" : ""}" data-pick="${f}" style="font-family:'${f}'">${f}</button>`).join("")}</div>
        <div class="menu-sep"></div>
        <label class="field menu-field"><span>Default font for the whole editor</span>
          <select data-default-font>${FONTS.map(f => `<option ${f === prefs.font ? "selected" : ""}>${f}</option>`).join("")}</select></label>`,
      f => exec("fontName", f),
      pop => { $("[data-default-font]", pop).onchange = e => { prefs.font = e.target.value; applyPrefs(); updateToolbar(); }; }),
    size: b => menu(b, `
        <div class="menu-title">Size for selected text</div>
        <div class="menu-grid">${SIZES.map(n =>
          `<button class="menu-item ${+$("#lbl-size").textContent === n ? "on" : ""}" data-pick="${n}">${n}</button>`).join("")}</div>
        <div class="menu-sep"></div>
        <label class="field menu-field"><span>Default size for the whole editor · <b data-v>${prefs.size}px</b></span>
          <input type="range" data-default-size min="13" max="28" value="${prefs.size}"></label>`,
      px => applySize(px),
      pop => {
        $("[data-default-size]", pop).oninput = e => {
          prefs.size = +e.target.value;
          $("[data-v]", pop).textContent = prefs.size + "px";
          applyPrefs();
          updateToolbar();
        };
      }),
    align: b => menu(b, `<div class="menu-list">${ALIGNS.map(([cmd, ic, label]) =>
        `<button class="menu-item with-icon ${document.queryCommandState(cmd) ? "on" : ""}" data-pick="${cmd}">${icon(ic)}${label}</button>`).join("")}</div>`,
      cmd => exec(cmd)),
    insert: b => menu(b, `<div class="menu-list">
        <button class="menu-item" data-pick="break"><span class="mi-glyph">⁂</span>Scene break</button>
        <button class="menu-item" data-pick="—"><span class="mi-glyph">—</span>Em dash</button>
        <button class="menu-item" data-pick="–"><span class="mi-glyph">–</span>En dash</button>
        <button class="menu-item" data-pick="…"><span class="mi-glyph">…</span>Ellipsis</button></div>`,
      v => {
        if (v !== "break") return exec("insertText", v);
        if (!chapterPage) return exec("insertHTML", "<hr><p><br></p>");
        // writing by chapter, a scene break starts a new scene (visible when you switch to scenes)
        const sc = newScene(`Scene ${ch.scenes.length + 1}`);
        split.pending.set(sc.id, sc);
        exec("insertHTML", `<hr class="scene-split" data-split="${sc.id}"><p><br></p>`);
        renderBinder(ctx, current);
      }),
    more: b => menu(b, `<div class="menu-list">
        <button class="menu-item" data-pick="superscript"><span class="mi-glyph">x²</span>Superscript</button>
        <button class="menu-item" data-pick="subscript"><span class="mi-glyph">x₂</span>Subscript</button>
        <button class="menu-item with-icon" data-pick="outdent">${icon("outdent")}Decrease indent</button>
        <button class="menu-item with-icon" data-pick="indent">${icon("indent")}Increase indent</button>
        <div class="menu-sep"></div>
        <button class="menu-item with-icon" data-pick="removeFormat">${icon("clear")}Clear formatting</button></div>`,
      cmd => exec(cmd)),
  };
  $$("[data-drop]", tb).forEach(b => b.onclick = () => MENUS[b.dataset.drop](b));
  $$("[data-color]", tb).forEach(b => b.onclick = () => {
    const cmd = b.dataset.color;
    const palette = cmd === "foreColor" ? COLORS : HIGHLIGHTS;
    menu(b, `<div class="swatches">${palette.map(c => `<button data-pick="${c}" style="background:${c}"></button>`).join("")}
      ${cmd === "hiliteColor" ? `<button data-pick="transparent" class="none" title="No highlight">✕</button>` : ""}</div>`,
      c => exec(cmd, c));
  });
  $("[data-link]", tb).onclick = async () => {
    saveRange();
    const url = await promptBox("Insert link", "URL", "https://");
    if (url && restoreRange()) exec("createLink", url);
  };
  $("[data-comment]", tb).onclick = async () => {
    saveRange();
    if (!savedRange || savedRange.collapsed) return toast("Select some text to comment on first");
    const note = await promptBox("Add comment", "Comment");
    if (!note || !restoreRange()) return;
    const range = getSelection().getRangeAt(0);
    const span = document.createElement("span");
    span.className = "comment";
    span.dataset.note = note;
    span.title = note;
    span.append(range.extractContents());
    range.insertNode(span);
    changed();
    renderMeta(ctx, current);
  };
  $("[data-focus]").onclick = () => { view.focusMode = !view.focusMode; renderManuscript(ctx); };
  $("[data-settings]").onclick = e => openSettings(e.currentTarget, ctx);
  $("[data-find]").onclick = () => openFind();
  $("[data-style-check]").onclick = e => {
    prefs.styleCheck = !prefs.styleCheck;
    savePrefs();
    e.currentTarget.classList.toggle("on", prefs.styleCheck);
    runStyleCheck();
    toast(prefs.styleCheck ? "Style check on: adverbs underlined, repeated words and long sentences shaded" : "Style check off");
  };
  $("[data-sprint]").onclick = e => openSprintMenu(e.currentTarget, ctx);
  runStyleCheck();
  $("[data-toolbar-mode]").onclick = () => {
    prefs.toolbar = prefs.toolbar === "floating" ? "fixed" : "floating";
    savePrefs();
    renderManuscript(ctx);
    toast(prefs.toolbar === "floating" ? "Floating toolbar: select text to format it" : "Fixed toolbar");
  };

  // show the style, font, size and on/off states of whatever is under the cursor
  function updateToolbar() {
    const sel = getSelection();
    if (!sel.rangeCount || !prose.contains(sel.anchorNode)) return;
    let node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
    if (node === prose) node = prose.children[Math.min(sel.anchorOffset, prose.children.length - 1)] || prose;
    const block = node.closest("h1, h2, h3, blockquote, pre, p, li");
    const tag = block && prose.contains(block) ? block.tagName.toLowerCase() : "p";
    const cs = getComputedStyle(node);
    $("#lbl-style").textContent = (STYLES.find(([t]) => t === tag) || STYLES[0])[1];
    $("#lbl-font").textContent = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    $("#lbl-size").textContent = Math.round(parseFloat(cs.fontSize));
    $$("[data-state]", tb).forEach(b => b.classList.toggle("on", document.queryCommandState(b.dataset.state)));
    const align = ALIGNS.find(([cmd]) => document.queryCommandState(cmd)) || ALIGNS[0];
    $("#lbl-align").innerHTML = icon(align[1]);
    $("#color-bar").style.background = cs.color;
    let bg = "transparent";
    for (let n = node; n && n !== prose; n = n.parentElement) {
      const b = getComputedStyle(n).backgroundColor;
      if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") { bg = b; break; }
    }
    $("#hl-bar").style.background = bg;
  }

  // floating mode: the toolbar hovers just above the selected text
  function placeFloating() {
    if (prefs.toolbar !== "floating" || !document.body.contains(tb)) return;
    const sel = getSelection();
    const active = sel.rangeCount && !sel.isCollapsed && prose.contains(sel.anchorNode);
    if (!active) { if (!currentPopover()) tb.classList.remove("show"); return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    tb.classList.add("show");
    const w = tb.offsetWidth, h = tb.offsetHeight;
    let top = r.top - h - 10;
    if (top < 56) top = r.bottom + 10;
    const left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    tb.style.top = top + "px";
    tb.style.left = left + "px";
  }
  onPopoverClose(placeFloating);
  $("#editor-scroll").addEventListener("scroll", placeFloating, { passive: true });
  let tbFrame = 0;
  document.addEventListener("selectionchange", function track() {
    if (!document.body.contains(prose)) return document.removeEventListener("selectionchange", track);
    clearTimeout(tbFrame);
    tbFrame = setTimeout(() => { updateToolbar(); placeFloating(); followCaret(); }, 30);
  });
  setTimeout(updateToolbar, 0);

  // ---- find & replace (uses CSS Custom Highlights so the text itself isn't modified)
  let matches = [];
  function runFind(scroll = true) {
    findState.query = $("#find-q").value;
    findState.replace = $("#find-r").value;
    findState.caseSensitive = $("#find-case").checked;
    findState.scope = $("#find-scope").value;
    matches = findRanges(prose, findState.query, findState.caseSensitive);
    if (findState.index >= matches.length) findState.index = 0;
    if (window.CSS?.highlights) {
      CSS.highlights.set("find", new Highlight(...matches));
      CSS.highlights.set("find-current", new Highlight(...(matches[findState.index] ? [matches[findState.index]] : [])));
    }
    let label = findState.query ? `${matches.length ? findState.index + 1 : 0} of ${matches.length}` : "";
    if (findState.query && findState.scope === "all") {
      const elsewhere = countInManuscript(p, findState.query, findState.caseSensitive) - matches.length;
      label += ` · ${elsewhere} in other scenes`;
    }
    $("#find-count").textContent = label;
    if (scroll && matches[findState.index]) scrollToRange(matches[findState.index]);
  }
  function step(dir) {
    if (!matches.length) return;
    findState.index = (findState.index + dir + matches.length) % matches.length;
    runFind();
  }
  function openFind() {
    findState.open = true;
    $("#find-bar").hidden = false;
    const sel = getSelection().toString();
    if (sel && sel.length < 60) $("#find-q").value = sel;
    $("#find-q").focus();
    $("#find-q").select();
    runFind();
  }
  function closeFind() {
    findState.open = false;
    $("#find-bar").hidden = true;
    CSS.highlights?.delete("find");
    CSS.highlights?.delete("find-current");
  }
  $("#find-q").oninput = () => { findState.index = 0; runFind(); };
  $("#find-r").oninput = () => { findState.replace = $("#find-r").value; };
  $("#find-case").onchange = () => runFind();
  $("#find-scope").onchange = () => runFind();
  $("#find-q").onkeydown = e => {
    if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    if (e.key === "Escape") closeFind();
  };
  $("[data-find-next]").onclick = () => step(1);
  $("[data-find-prev]").onclick = () => step(-1);
  $("[data-find-close]").onclick = closeFind;
  $("[data-replace]").onclick = () => {
    const r = matches[findState.index];
    if (!r) return;
    prose.focus();
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand("insertText", false, $("#find-r").value);
    changed();
  };
  $("[data-replace-all]").onclick = async () => {
    const q = $("#find-q").value;
    const rep = $("#find-r").value;
    if (!q) return;
    let n = 0;
    // current scene through the editor so it stays undoable
    for (const r of [...findRanges(prose, q, findState.caseSensitive)].reverse()) {
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand("insertText", false, rep);
      n++;
    }
    if (findState.scope === "all") {
      const others = countInManuscript(p, q, findState.caseSensitive) - countInHtml(prose.innerHTML, q, findState.caseSensitive);
      if (others > 0 && await confirmBox("Replace in whole manuscript",
        `Also replace ${others} match(es) in other scenes? (Take a snapshot first if unsure — this can't be undone with Ctrl+Z.)`, "Replace")) {
        for (const chap of p.chapters) for (const sc of chap.scenes) {
          if (chapterPage ? chap === ch : sc === s) continue;
          const res = replaceInHtml(sc.content, q, rep, findState.caseSensitive);
          sc.content = res.html;
          n += res.count;
        }
      }
    }
    changed();
    toast(`Replaced ${n} match${n === 1 ? "" : "es"}`);
  };
  if (findState.open) runFind(false);

  // ---- keyboard
  const onKey = e => {
    if (!document.body.contains(prose)) return document.removeEventListener("keydown", onKey);
    if (document.querySelector(".modal")) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "h")) { e.preventDefault(); openFind(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); view.focusMode = !view.focusMode; renderManuscript(ctx); }
    if (e.key === "Escape") {
      if (findState.open) closeFind();
      else if (view.focusMode) { view.focusMode = false; renderManuscript(ctx); }
    }
  };
  document.addEventListener("keydown", onKey);
}

// ---------------------------------------------------------------- caret & typing helpers

const BLOCKS = new Set(["P", "H1", "H2", "H3", "BLOCKQUOTE", "PRE", "UL", "OL", "HR", "DIV"]);
/** Wrap top-level text/inline nodes in <p>, keeping the caret where it was. */
function wrapStrayText(root) {
  if (![...root.childNodes].some(n => !BLOCKS.has(n.nodeName) && (n.nodeType !== 3 || n.textContent.trim()))) return;
  const sel = getSelection();
  const caret = sel.rangeCount ? { node: sel.anchorNode, offset: sel.anchorOffset } : null;
  let p = null;
  for (const n of [...root.childNodes]) {
    if (BLOCKS.has(n.nodeName)) { p = null; continue; }
    if (!p) { p = document.createElement("p"); root.insertBefore(p, n); }
    p.appendChild(n);
  }
  if (caret && root.contains(caret.node)) {
    try { sel.collapse(caret.node, caret.offset); } catch {}
  }
}

function placeCaret(node, atEnd = false) {
  const r = document.createRange();
  r.selectNodeContents(node);
  r.collapse(!atEnd);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
}

function charBeforeCaret() {
  const sel = getSelection();
  if (!sel.rangeCount) return "";
  const r = sel.getRangeAt(0);
  if (r.startContainer.nodeType === 3 && r.startOffset > 0) return r.startContainer.textContent[r.startOffset - 1];
  return "";
}

function typewriterScroll() {
  const sel = getSelection();
  if (!sel.rangeCount) return;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  const box = $("#editor-scroll");
  if (!rect.height || !box) return;
  const b = box.getBoundingClientRect();
  box.scrollTop += rect.top - (b.top + b.height / 2);
}

function scrollToRange(r) {
  const rect = r.getBoundingClientRect();
  const box = $("#editor-scroll");
  const b = box.getBoundingClientRect();
  if (rect.top < b.top + 60 || rect.bottom > b.bottom - 60) box.scrollTop += rect.top - (b.top + b.height / 3);
}

// ---------------------------------------------------------------- page & writing settings

function applyPrefs() {
  const page = $(".page");
  if (page) page.setAttribute("style", editorStyle());
  $("#prose")?.classList.toggle("indent", prefs.indent);
  savePrefs();
  // re-seat the caret so it follows the new page width / line height straight away
  const sel = getSelection();
  const prose = $("#prose");
  if (prose && sel.rangeCount && prose.contains(sel.anchorNode)) {
    const r = sel.getRangeAt(0).cloneRange();
    requestAnimationFrame(() => { sel.removeAllRanges(); sel.addRange(r); });
  }
}

function openSettings(anchor, ctx) {
  if (currentPopover()?.dataset.anchor === "settings") return closePopover();
  // remember where the caret was so it lands in the right place once the page reflows
  const sel = getSelection();
  const prose = $("#prose");
  const caret = prose && sel.rangeCount && prose.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
  popover(anchor, `
    <div class="settings-pop">
      <div class="menu-title">Page</div>
      <label class="field"><span>Line spacing · <b data-v="lineHeight">${prefs.lineHeight}</b></span><input type="range" data-p="lineHeight" min="1.2" max="2.4" step="0.1" value="${prefs.lineHeight}"></label>
      <label class="field"><span>Page width · <b data-v="width">${prefs.width}px</b></span><input type="range" data-p="width" min="520" max="1100" step="20" value="${prefs.width}"></label>
      <label class="chk"><input type="checkbox" data-p="indent" ${prefs.indent ? "checked" : ""}> Book-style paragraphs<span class="chk-hint">New paragraphs start with an indent instead of a blank line, like a printed novel. Turn off for spaced paragraphs.</span></label>
      <div class="menu-sep"></div>
      <div class="menu-title">Writing</div>
      <label class="chk"><input type="checkbox" data-p="typewriter" ${prefs.typewriter ? "checked" : ""}> Typewriter scrolling (keep the line centred)</label>
      <label class="chk"><input type="checkbox" data-p="smart" ${prefs.smart ? "checked" : ""}> Smart quotes &amp; em dashes</label>
      <div class="menu-sep"></div>
      <div class="menu-title">Toolbar</div>
      <div class="seg">${[["fixed", "Fixed"], ["floating", "Floating"]].map(([k, l]) =>
        `<button data-tbmode="${k}" class="${prefs.toolbar === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <p class="faint small" style="margin:10px 0 0">Font and text size are in the toolbar. The theme is at the bottom of the sidebar.</p>
      <button class="btn sm ghost" data-reset style="margin-top:10px">Reset editor &amp; panel sizes</button>
    </div>`, pop => {
    pop.dataset.anchor = "settings";
    $$("[data-p]", pop).forEach(inp => {
      inp.oninput = inp.onchange = () => {
        const k = inp.dataset.p;
        prefs[k] = inp.type === "checkbox" ? inp.checked : inp.type === "range" ? +inp.value : inp.value;
        const v = $(`[data-v="${k}"]`, pop);
        if (v) v.textContent = prefs[k] + (k === "lineHeight" ? "" : "px");
        applyPrefs();
      };
    });
    $$("[data-tbmode]", pop).forEach(b => b.onclick = () => {
      if (prefs.toolbar === b.dataset.tbmode) return;
      prefs.toolbar = b.dataset.tbmode;
      savePrefs();
      closePopover();
      renderManuscript(ctx);
    });
    $("[data-reset]", pop).onclick = () => {
      resetPrefs();
      resetLayout();
      closePopover();
      renderManuscript(ctx);
    };
  });
  // when the settings close, put the caret back where it was (now on the re-flowed page)
  const prevAfter = popoverCloseHook();
  onPopoverClose(() => {
    onPopoverClose(prevAfter);
    prevAfter?.();
    if (caret && document.body.contains(caret.startContainer) && !document.activeElement?.matches("input, textarea, select")) {
      $("#prose")?.focus({ preventScroll: true });
      sel.removeAllRanges();
      sel.addRange(caret);
    }
  });
}

// ---------------------------------------------------------------- writing sprint menu

function openSprintMenu(anchor, ctx) {
  const p = ctx.project;
  const running = sprintState();
  if (running && running.projectId === p.id) {
    popover(anchor, `<div class="sprint-pop">
        <div class="menu-title">Sprint running</div>
        <div class="sprint-live"><b>${mmss(remaining())}</b> left · ${running.words >= 0 ? "+" : "−"}${fmt(Math.abs(running.words))} words${running.goal ? ` of ${fmt(running.goal)}` : ""}</div>
        <button class="btn sm" data-end-sprint>End sprint now</button>
        <button class="btn sm ghost" data-cancel-sprint>Cancel (don't record)</button>
      </div>`, pop => {
      $("[data-end-sprint]", pop).onclick = () => { closePopover(); stopSprint(true); };
      $("[data-cancel-sprint]", pop).onclick = () => { closePopover(); stopSprint(false); toast("Sprint cancelled"); renderManuscript(ctx); };
    });
    return;
  }
  const last = prefs.sprintMinutes || 25;
  popover(anchor, `<div class="sprint-pop">
      <div class="menu-title">Writing sprint</div>
      <p class="faint small" style="margin:0 8px 10px">Write without stopping until the timer ends. The words you add are counted and saved to your stats.</p>
      <div class="menu-grid sprint-grid">${[10, 15, 25, 45, 60].map(m =>
        `<button class="menu-item ${m === last ? "on" : ""}" data-min="${m}">${m} min</button>`).join("")}</div>
      <label class="field menu-field"><span>Word goal (optional)</span><input type="number" min="0" step="50" data-goal value="${prefs.sprintGoal || ""}" placeholder="e.g. 500"></label>
      <button class="btn primary sm sprint-go" data-go>${icon("timer", 15)} Start ${last}-minute sprint</button>
    </div>`, pop => {
    let minutes = last;
    $$("[data-min]", pop).forEach(b => b.onclick = () => {
      minutes = +b.dataset.min;
      $$("[data-min]", pop).forEach(x => x.classList.toggle("on", x === b));
      $("[data-go]", pop).innerHTML = `${icon("timer", 15)} Start ${minutes}-minute sprint`;
    });
    $("[data-go]", pop).onclick = () => {
      const goal = +$("[data-goal]", pop).value || 0;
      prefs.sprintMinutes = minutes;
      prefs.sprintGoal = goal || "";
      savePrefs();
      closePopover();
      startSprint(p, minutes, goal);
      toast(`Sprint started: ${minutes} minutes${goal ? `, goal ${fmt(goal)} words` : ""}. Go!`);
      $("[data-sprint]")?.classList.add("on");
      $("#prose")?.focus();
    };
  });
}
