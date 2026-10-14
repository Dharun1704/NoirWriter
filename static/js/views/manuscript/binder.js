// The binder: chapters and scenes (or just chapters when writing by chapter), with inline rename,
// delete with Undo, drag to reorder, and the Scenes / Chapters switch.

import { uid, newScene, countWords, chapterWords, findScene, deleteScene, SCENE_STATUSES } from "../../store.js";
import { icon } from "../../icons.js";
import { $, $$, esc, fmt, toast, plural, inlineEdit, slideTabs, collapsible, segOpenClass } from "../../ui.js";
import { renderManuscript, openScene, openChapter } from "../manuscript.js";
import { prefs, byChapter, chapterSynopsis, chapterStatus } from "./state.js";
import { renderEditorCrumb } from "./meta.js";

// The binder keeps its scroll position across re-renders, and can glide to a newly added item.
let binderScroll = 0;
let binderRevealId = null;
let writeByFrom = null;
let reordering = false;          // the binder is showing the "Reorder chapters" list          // previous Scenes / Chapters choice, so the highlight slides across

export function renderBinder(ctx, current) {
  if (reordering) return renderReorder(ctx, current);
  const { project: p } = ctx;
  const binder = $("#binder");
  binder.innerHTML = `
    <div class="binder-head">
      <div class="seg small write-by sliding collapsible${segOpenClass("write-by")}" role="group" aria-label="Write by" title="Write scene by scene, or each chapter as one continuous page">
        <button data-write-by="chapter" class="${byChapter(p) ? "on" : ""}">Chapters</button>
        <button data-write-by="scene" class="${byChapter(p) ? "" : "on"}">Scenes</button>
      </div>
      <span class="binder-tools">
        <button class="btn sm binder-reorder" data-reorder title="Reorder chapters" aria-label="Reorder chapters">${icon("reorder", 13)}</button>
        <button class="btn sm add-btn" data-add-chapter title="New chapter">+<span class="add-label"> Chapter</span></button>
      </span>
    </div>
    ${p.chapters.map((ch, ci) => byChapter(p) ? `
      <div class="chapter" data-ch="${ch.id}">
        <div class="chapter-row leaf ${current && current.chapter.id === ch.id && prefs.mode === "write" ? "active" : ""}" data-open-ch="${ch.id}" title="${esc(chapterSynopsis(ch))}">
          <span class="status-dot s-${chapterStatus(ch).replace(/\s/g, "")}"></span>
          <span class="ellipsis" data-ch-title="${ch.id}" title="Double-click to rename">${ci + 1}. ${esc(ch.title)}</span>
          <span class="wc" data-ch-wc="${ch.id}">${fmt(chapterWords(ch))}</span>
          <span class="row-actions">
            <button class="icon-btn" data-ch-rename="${ch.id}" title="Rename" aria-label="Rename">${icon("pencil", 15)}</button>
            <button class="icon-btn danger" data-ch-del="${ch.id}" title="Delete chapter" aria-label="Delete chapter">${icon("trash", 15)}</button>
          </span>
        </div>
      </div>` : `
      <div class="chapter" data-ch="${ch.id}">
        <div class="chapter-row" data-toggle="${ch.id}" data-drop-ch="${ch.id}">
          <span class="caret">${icon(ch.open ? "chevron" : "chevronRight", 14)}</span>
          <span class="ellipsis" data-ch-title="${ch.id}" title="Double-click to rename">${ci + 1}. ${esc(ch.title)}</span>
          <span class="wc" data-ch-wc="${ch.id}">${fmt(chapterWords(ch))}</span>
          <span class="row-actions">
            <button class="icon-btn" data-ch-rename="${ch.id}" title="Rename" aria-label="Rename">${icon("pencil", 15)}</button>
            <button class="icon-btn danger" data-ch-del="${ch.id}" title="Delete chapter" aria-label="Delete chapter">${icon("trash", 15)}</button>
          </span>
        </div>
        ${ch.open ? ch.scenes.map(s => `
          <div class="scene-row ${current && current.scene.id === s.id && prefs.mode === "write" ? "active" : ""}" draggable="true"
               data-scene="${s.id}" title="${esc(s.synopsis)}">
            <span class="status-dot s-${s.status.replace(/\s/g, "")}"></span>
            <span class="ellipsis" data-scene-title="${s.id}" title="Double-click to rename">${esc(s.title)}</span>
            <span class="wc" data-scene-wc="${s.id}">${fmt(countWords(s.content))}</span>
            <span class="row-actions">
              <button class="icon-btn" data-scene-rename="${s.id}" title="Rename" aria-label="Rename">${icon("pencil", 15)}</button>
              <button class="icon-btn" data-scene-dup="${s.id}" title="Duplicate scene" aria-label="Duplicate scene">${icon("copy", 15)}</button>
              <button class="icon-btn danger" data-scene-del="${s.id}" title="Delete scene" aria-label="Delete scene">${icon("trash", 15)}</button>
            </span>
          </div>`).join("") + `<div class="add-scene" data-add-scene="${ch.id}">+ Add scene</div>` : ""}
      </div>`).join("")}
    ${p.chapters.length ? "" : `<div class="empty" style="padding:24px 8px">No chapters yet.</div>`}
    <div class="binder-legend">
      ${SCENE_STATUSES.map(s => `<span><span class="status-dot s-${s.replace(/\s/g, "")}"></span>${s}</span>`).join("")}
    </div>`;

  slideTabs($(".write-by", binder), writeByFrom, "data-write-by");
  collapsible($(".write-by", binder), "write-by");
  writeByFrom = null;
  binder.scrollTop = binderScroll;
  binder.onscroll = () => { binderScroll = binder.scrollTop; };
  if (binderRevealId) {
    const target = binder.querySelector(`[data-ch="${binderRevealId}"], [data-scene="${binderRevealId}"]`);
    binderRevealId = null;
    if (target) {
      // glide so the new item sits comfortably below the pinned header, then flash it
      const head = binder.querySelector(".binder-head")?.offsetHeight || 0;
      const top = target.getBoundingClientRect().top - binder.getBoundingClientRect().top + binder.scrollTop - head - 12;
      const max = binder.scrollHeight - binder.clientHeight;
      binder.scrollTo({ top: Math.max(0, Math.min(max, top)), behavior: "smooth" });
      target.classList.add("just-added");
      setTimeout(() => target.classList.remove("just-added"), 1600);
    }
  }

  const save = () => { ctx.save(); renderBinder(ctx, current); };

  $$("[data-write-by]", binder).forEach(b => b.onclick = () => {
    if ((b.dataset.writeBy === "chapter") === byChapter(p)) return;
    writeByFrom = p.writeBy || "scene";
    p.writeBy = b.dataset.writeBy;
    ctx.save();
    renderManuscript(ctx);
    toast(byChapter(p)
      ? "Writing by chapter: each chapter opens as one page. Scenes you already have show inside it, split by ⁂"
      : "Writing by scene: each scene has its own page again");
  });
  // chapter mode: a chapter row opens the whole chapter (an empty chapter gets its first page)
  $$("[data-open-ch]", binder).forEach(row => {
    row.onclick = e => {
      if (e.target.closest(".row-actions")) return;
      const ch = p.chapters.find(c => c.id === row.dataset.openCh);
      if (current?.chapter === ch && prefs.mode === "write") return;
      later(() => openChapter(ctx, ch));
    };
    row.ondblclick = e => {
      if (e.target.closest(".row-actions")) return;
      clearTimeout(clickTimer);
      renameChapter(p.chapters.find(c => c.id === row.dataset.openCh));
    };
  });

  $("[data-reorder]", binder).onclick = () => { reordering = true; renderBinder(ctx, current); };
  $("[data-add-chapter]", binder).onclick = () => {
    const ch = { id: uid(), title: `Chapter ${p.chapters.length + 1}`, open: true, scenes: [newScene("Scene 1")] };
    p.chapters.push(ch);
    ctx.save();
    binderRevealId = ch.id;
    openScene(ctx, ch.scenes[0].id);
  };
  // single clicks wait a moment so a double-click can rename instead
  let clickTimer = null;
  const later = fn => { clearTimeout(clickTimer); clickTimer = setTimeout(fn, 220); };
  const renameChapter = ch => inlineEdit($(`[data-ch-title="${ch.id}"]`, binder), ch.title, v => {
    ch.title = v;
    ctx.save();
    renderBinder(ctx, current);
    renderEditorCrumb(ctx, current);
    if (byChapter(p) && current?.chapter === ch && $("#scene-title")) $("#scene-title").value = v;
  });
  const renameScene = id => {
    const f = findScene(p, id);
    inlineEdit($(`[data-scene-title="${id}"]`, binder), f.scene.title, v => {
      f.scene.title = v;
      ctx.save();
      renderBinder(ctx, current);
      if (current?.scene.id === id && $("#scene-title")) $("#scene-title").value = v;
    });
  };
  $$("[data-toggle]", binder).forEach(row => {
    row.onclick = e => {
      if (e.target.closest(".row-actions")) return;
      later(() => {
        const ch = p.chapters.find(c => c.id === row.dataset.toggle);
        ch.open = !ch.open;
        save();
      });
    };
    row.ondblclick = e => {
      if (e.target.closest(".row-actions")) return;
      clearTimeout(clickTimer);
      renameChapter(p.chapters.find(c => c.id === row.dataset.toggle));
    };
  });
  $$("[data-ch-rename]", binder).forEach(btn => btn.onclick = () =>
    renameChapter(p.chapters.find(c => c.id === btn.dataset.chRename)));
  $$("[data-ch-del]", binder).forEach(btn => btn.onclick = () => {
    const ch = p.chapters.find(c => c.id === btn.dataset.chDel);
    const words = chapterWords(ch);
    const doDelete = () => undoableDelete(ctx, `Deleted “${ch.title}” (${plural(ch.scenes.length, "scene")}${words ? `, ${plural(words, "word")}` : ""})`, () => {
      ch.scenes.forEach(s => deleteScene(p, s.id));
      p.chapters = p.chapters.filter(c => c !== ch);
    }, current && !ch.scenes.includes(current.scene) ? current.scene.id : "");
    // anything with writing in it asks first, right there in the binder
    if (words) inlineConfirm(btn.closest(".chapter-row"), `Delete “${ch.title}” and its ${plural(words, "word")}?`, doDelete, true);
    else doDelete();
  });
  $$("[data-add-scene]", binder).forEach(btn => btn.onclick = () => {
    const ch = p.chapters.find(c => c.id === btn.dataset.addScene);
    const s = newScene(`Scene ${ch.scenes.length + 1}`);
    ch.scenes.push(s);
    ctx.save();
    binderRevealId = s.id;
    openScene(ctx, s.id);
  });
  $$("[data-scene]", binder).forEach(row => {
    row.onclick = e => {
      if (e.target.closest(".row-actions")) return;
      if (current?.scene.id === row.dataset.scene && prefs.mode === "write") return;
      later(() => openScene(ctx, row.dataset.scene));
    };
    row.ondblclick = e => {
      if (e.target.closest(".row-actions")) return;
      clearTimeout(clickTimer);
      renameScene(row.dataset.scene);
    };
    row.ondragstart = e => { e.dataTransfer.setData("text/scene", row.dataset.scene); e.dataTransfer.effectAllowed = "move"; };
    row.ondragover = e => { e.preventDefault(); row.classList.add("drag-over"); };
    row.ondragleave = () => row.classList.remove("drag-over");
    row.ondrop = e => {
      e.preventDefault();
      row.classList.remove("drag-over");
      moveScene(p, e.dataTransfer.getData("text/scene"), row.dataset.scene, null);
      ctx.save();
      renderManuscript(ctx);
    };
  });
  $$("[data-drop-ch]", binder).forEach(row => {
    row.ondragover = e => { e.preventDefault(); row.classList.add("drag-over"); };
    row.ondragleave = () => row.classList.remove("drag-over");
    row.ondrop = e => {
      e.preventDefault();
      row.classList.remove("drag-over");
      moveScene(p, e.dataTransfer.getData("text/scene"), null, row.dataset.dropCh);
      ctx.save();
      renderManuscript(ctx);
    };
  });
  $$("[data-scene-dup]", binder).forEach(btn => btn.onclick = () => {
    const f = findScene(p, btn.dataset.sceneDup);
    const copy = { ...structuredClone(f.scene), id: uid(), title: f.scene.title + " (copy)", snapshots: [] };
    f.chapter.scenes.splice(f.si + 1, 0, copy);
    ctx.save();
    openScene(ctx, copy.id);
  });
  $$("[data-scene-rename]", binder).forEach(btn => btn.onclick = () => renameScene(btn.dataset.sceneRename));
  $$("[data-scene-del]", binder).forEach(btn => btn.onclick = () => {
    const f = findScene(p, btn.dataset.sceneDel);
    const words = countWords(f.scene.content);
    const doDelete = () => undoableDelete(ctx, `Deleted “${f.scene.title}”${words ? ` (${plural(words, "word")})` : ""}`,
      () => deleteScene(p, f.scene.id),
      current && current.scene.id !== f.scene.id ? current.scene.id : "");
    if (words) inlineConfirm(btn.closest(".scene-row"), `Delete “${f.scene.title}” (${plural(words, "word")})?`, doDelete);
    else doDelete();
  });
}

/** Replace a binder row with a small "Delete? / Keep" bar until the writer decides. */
function inlineConfirm(row, message, onConfirm, isChapter = false) {
  document.querySelectorAll(".confirm-row").forEach(el => el.cancel?.());
  const bar = document.createElement("div");
  bar.className = "confirm-row" + (isChapter ? " chapter" : "");
  bar.setAttribute("role", "alertdialog");
  bar.innerHTML = `<span>${esc(message)}</span>
    <button class="btn sm" data-keep>Keep</button>
    <button class="btn sm danger-solid" data-yes>Delete</button>`;
  row.hidden = true;
  row.after(bar);
  const cancel = () => { bar.remove(); row.hidden = false; document.removeEventListener("keydown", onKey, true); };
  const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); cancel(); } };
  bar.cancel = cancel;
  document.addEventListener("keydown", onKey, true);
  bar.querySelector("[data-keep]").onclick = cancel;
  bar.querySelector("[data-yes]").onclick = () => { cancel(); onConfirm(); };
  bar.querySelector("[data-keep]").focus();
}

/** Delete right away, with an Undo button in the toast instead of a confirmation dialog. */
function undoableDelete(ctx, message, mutate, nextSceneId) {
  const p = ctx.project;
  const before = JSON.stringify({ chapters: p.chapters, events: p.events, clues: p.clues });
  mutate();
  ctx.save();
  const target = `#/p/${p.id}/manuscript${nextSceneId ? "/" + nextSceneId : ""}`;
  if (location.hash === target) renderManuscript({ ...ctx, item: nextSceneId });
  else ctx.go("manuscript", nextSceneId);
  toast(message, {
    action: "Undo",
    onAction: () => {
      Object.assign(p, JSON.parse(before));
      ctx.save();
      if ($("#binder")) renderManuscript({ ...ctx, item: nextSceneId });
      toast("Restored");
    },
  });
}

/** Move a scene before `beforeSceneId`, or to the end of chapter `toChapterId`. */
export function moveScene(p, sceneId, beforeSceneId, toChapterId) {
  if (!sceneId || sceneId === beforeSceneId) return;
  const from = findScene(p, sceneId);
  if (!from) return;
  from.chapter.scenes.splice(from.si, 1);
  if (beforeSceneId) {
    const target = findScene(p, beforeSceneId);
    target.chapter.scenes.splice(target.si, 0, from.scene);
  } else {
    const ch = p.chapters.find(c => c.id === toChapterId);
    ch.scenes.push(from.scene);
    ch.open = true;
  }
}

// ---------------------------------------------------------------- reorder chapters
// The binder becomes a list of chapters with drag handles. A dragged chapter follows the pointer while
// the others glide aside to open a gap (CSS transforms only, so nothing moves in the page until the
// drop); near the top or bottom edge the binder scrolls. Alt+↑ / Alt+↓ move the focused chapter.

function renderReorder(ctx, current) {
  const { project: p } = ctx;
  const binder = $("#binder");
  binder.innerHTML = `
    <div class="binder-head">
      <span class="reorder-title">${icon("reorder", 15)} Reorder chapters</span>
      <button class="btn sm primary" data-done>Done</button>
    </div>
    <p class="reorder-hint">Drag a chapter to move it.<br>Alt + ↑ / ↓ moves the selected one.</p>
    <div class="reorder-list">${p.chapters.map((ch, ci) => `
      <div class="reorder-row ${current?.chapter === ch ? "current" : ""}" data-rch="${ch.id}" tabindex="0">
        <span class="grip">${icon("grip", 16)}</span>
        <span class="r-num">${ci + 1}</span>
        <span class="ellipsis">${esc(ch.title)}</span>
        <span class="wc">${fmt(chapterWords(ch))}</span>
      </div>`).join("")}</div>`;
  binder.scrollTop = binderScroll;
  binder.onscroll = () => { binderScroll = binder.scrollTop; };
  const list = $(".reorder-list", binder);

  const done = () => {
    reordering = false;
    removeEventListener("keydown", onKey, true);
    renderManuscript(ctx);
  };
  $("[data-done]", binder).onclick = done;

  /** Move chapter `from` to position `to`, save, and offer Undo. */
  const commit = (from, to, focusAfter) => {
    removeEventListener("keydown", onKey, true);
    if (from === to) return renderReorder(ctx, current);
    const before = p.chapters.slice();
    const [ch] = p.chapters.splice(from, 1);
    p.chapters.splice(to, 0, ch);
    ctx.save();
    renderReorder(ctx, current);
    const row = $(`[data-rch="${ch.id}"]`, binder);
    row?.classList.add("settled");
    if (focusAfter) row?.focus();
    toast(`Moved “${ch.title}” to position ${to + 1}`, {
      action: "Undo",
      onAction: () => {
        p.chapters = before;
        ctx.save();
        if (reordering && $(".reorder-list")) { removeEventListener("keydown", onKey, true); renderReorder(ctx, current); }
        else renderManuscript(ctx);
      },
    });
  };

  // ---- dragging
  let drag = null;
  const onKey = e => {
    if (!list.isConnected) return removeEventListener("keydown", onKey, true);
    if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      if (drag) cancelDrag(); else done();
    }
  };
  addEventListener("keydown", onKey, true);

  const begin = (row, y) => {
    const rows = $$(".reorder-row", list);
    const from = rows.indexOf(row);
    drag = {
      row, rows, from, to: from, startY: y, y, scroll0: binder.scrollTop, t: performance.now(),
      tops: rows.map(r => r.offsetTop), heights: rows.map(r => r.offsetHeight),
    };
    drag.step = rows.length > 1 ? drag.tops[1] - drag.tops[0] : drag.heights[0];
    list.classList.add("sorting");
    row.classList.add("lifted");
    document.body.classList.add("reorder-dragging");
    drag.raf = requestAnimationFrame(tick);
  };
  const tick = now => {
    if (!drag) return;
    // scroll near the edges (time-based, so it feels the same on any screen)
    const r = binder.getBoundingClientRect(), edge = 60, dt = Math.min(50, now - drag.t) / 1000;
    drag.t = now;
    let f = 0;
    if (drag.y < r.top + edge + 40) f = -Math.min(1, (r.top + edge + 40 - drag.y) / edge);
    else if (drag.y > r.bottom - edge) f = Math.min(1, (drag.y - (r.bottom - edge)) / edge);
    if (f) binder.scrollTop += f * Math.abs(f) * 700 * dt;
    retarget();
    drag.raf = requestAnimationFrame(tick);
  };
  /** Move the dragged row to the pointer and open the gap where its middle is. */
  const retarget = () => {
    const dy = drag.y - drag.startY + (binder.scrollTop - drag.scroll0);
    drag.row.style.transform = `translateY(${dy}px)`;
    const mid = drag.tops[drag.from] + drag.heights[drag.from] / 2 + dy;
    let to = 0;
    drag.rows.forEach((x, i) => { if (i !== drag.from && drag.tops[i] + drag.heights[i] / 2 < mid) to++; });
    if (to !== drag.to) {
      drag.to = to;
      drag.rows.forEach((x, i) => {
        if (i === drag.from) return;
        const shift = drag.from < to && i > drag.from && i <= to ? -drag.step
          : drag.from > to && i >= to && i < drag.from ? drag.step : 0;
        x.style.transform = shift ? `translateY(${shift}px)` : "";
      });
    }
  };
  const finish = to => {
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.raf);
    document.body.classList.remove("reorder-dragging");
    // glide into the gap, then commit (the new list draws the rows exactly where they now are)
    d.row.classList.add("landing");
    d.row.style.transform = `translateY(${(to - d.from) * d.step}px)`;
    setTimeout(() => {
      list.classList.remove("sorting");
      if (to === d.from) { d.rows.forEach(x => { x.style.transform = ""; x.classList.remove("lifted", "landing"); }); return; }
      commit(d.from, to);
    }, 220);
  };
  const cancelDrag = () => {
    drag.rows.forEach((x, i) => { if (i !== drag.from) x.style.transform = ""; });
    finish(drag.from);
  };

  $$(".reorder-row", list).forEach(row => {
    row.onpointerdown = e => {
      if (e.button !== 0 || drag) return;
      e.preventDefault();
      row.focus({ preventScroll: true });
      const y0 = e.clientY;
      const move = ev => {
        if (!drag && Math.abs(ev.clientY - y0) < 4) return;
        if (!drag) begin(row, y0);
        drag.y = ev.clientY;
      };
      const up = ev => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
        removeEventListener("pointercancel", up);
        if (!drag) return;
        if (ev.type === "pointercancel") return cancelDrag();
        drag.y = ev.clientY;
        retarget();                 // a quick flick can end before the next frame: place it from the release point
        finish(drag.to);
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", up);
      addEventListener("pointercancel", up);
    };
    // keyboard: Alt + arrow keys move the focused chapter one place
    row.onkeydown = e => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault();
      const i = p.chapters.findIndex(c => c.id === row.dataset.rch);
      const j = e.key === "ArrowUp" ? i - 1 : i + 1;
      if (j >= 0 && j < p.chapters.length) commit(i, j, true);
    };
  });
}

