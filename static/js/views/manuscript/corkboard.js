// Corkboard: index cards per chapter (or one card per chapter when writing by chapter).
// Cards are dragged with a pointer-based engine: a floating copy follows the cursor, a gap shows
// where it will land, other cards glide aside (FLIP), and the board scrolls near its edges.

import { uid, newScene, countWords, chapterWords, findScene, character } from "../../store.js";
import { $, $$, esc, fmt, promptBox, toast } from "../../ui.js";
import { renderManuscript, openScene, openChapter } from "../manuscript.js";
import { prefs, savePrefs, byChapter, chapterSynopsis, chapterStatus } from "./state.js";
import { moveScene } from "./binder.js";

let corkScroll = 0;      // kept across re-renders so a drop doesn't jump the board
let corkSettle = null;   // id of the card that just landed (gets a small settle pop)

export function renderCorkboard(ctx) {
  const { project: p } = ctx;
  const body = $("#center-body");
  if (!p.chapters.length) { body.innerHTML = `<div class="empty">No chapters yet.</div>`; return; }
  const compact = !!prefs.corkCompact;
  const chapterCards = byChapter(p);
  const card = (id, title, synopsis, status, arc, pov, words) => `
        <div class="index-card" data-card="${id}" style="${arc ? `border-top-color:${arc.color}` : ""}">
          <span class="stamp s-${status.replace(/\s/g, "")}">${status}</span>
          <h4>${esc(title)}</h4>
          <p>${synopsis ? esc(synopsis) : `<span class="no-syn">+ synopsis</span>`}</p>
          <div class="foot">
            ${pov ? `<span>POV ${esc(pov.name)}</span>` : ""}
            <span>${fmt(words)} w</span>
          </div>
        </div>`;
  body.innerHTML = `<div class="cork ${compact ? "compact" : ""}">
    <div class="cork-bar">
      <span class="faint small">Drag cards to reorder · hold near the top or bottom edge to scroll · Esc cancels</span>
      <span class="grow"></span>
      <div class="seg small" role="group" aria-label="Card size">
        <button data-density="full" class="${compact ? "" : "on"}">Full cards</button>
        <button data-density="compact" class="${compact ? "on" : ""}">Compact</button>
      </div>
    </div>
    ${chapterCards ? `<div class="board chapter-board"><div class="board-col chapter-grid" data-col="chapters">${p.chapters.map((ch, ci) =>
      card(ch.id, `${ci + 1}. ${ch.title}`, chapterSynopsis(ch), chapterStatus(ch),
        p.arcs.find(a => ch.scenes.some(s => s.arcIds.includes(a.id))), character(p, ch.scenes[0]?.povId), chapterWords(ch))).join("")}
      <div class="add-card" data-add-chapter-card>+ Chapter</div></div></div>` : `
    <div class="board">${p.chapters.map((ch, ci) => `
    <div class="board-col" data-col="${ch.id}">
      <h3><span class="ellipsis" title="${ci + 1}. ${esc(ch.title)}">${ci + 1}. ${esc(ch.title)}</span><span class="faint">${fmt(chapterWords(ch))} w</span></h3>
      ${ch.scenes.map(s => {
        const arc = p.arcs.find(a => s.arcIds.includes(a.id));
        const pov = character(p, s.povId);
        return `
        <div class="index-card" data-card="${s.id}" style="${arc ? `border-top-color:${arc.color}` : ""}">
          <span class="stamp s-${s.status.replace(/\s/g, "")}">${s.status}</span>
          <h4>${esc(s.title)}</h4>
          <p>${s.synopsis ? esc(s.synopsis) : `<span class="no-syn">+ synopsis</span>`}</p>
          <div class="foot">
            ${pov ? `<span>POV ${esc(pov.name)}</span>` : ""}
            <span>${fmt(countWords(s.content))} w</span>
          </div>
        </div>`;
      }).join("")}
      <div class="add-card" data-add-card="${ch.id}">+ Card</div>
    </div>`).join("")}</div>`}</div>`;

  const cork = $(".cork", body);
  cork.scrollTop = corkScroll;
  cork.onscroll = () => { corkScroll = cork.scrollTop; };
  $$("[data-density]", body).forEach(b => b.onclick = () => {
    prefs.corkCompact = b.dataset.density === "compact";
    savePrefs();
    renderCorkboard(ctx);
  });
  const addCh = $("[data-add-chapter-card]", body);
  if (addCh) addCh.onclick = async () => {
    const title = await promptBox("New chapter", "Chapter title", `Chapter ${p.chapters.length + 1}`);
    if (!title) return;
    p.chapters.push({ id: uid(), title, open: true, scenes: [newScene("Scene 1")] });
    ctx.save();
    renderManuscript(ctx);
  };
  $$("[data-add-card]", body).forEach(b => b.onclick = async () => {
    const title = await promptBox("New scene", "Scene title");
    if (!title) return;
    p.chapters.find(c => c.id === b.dataset.addCard).scenes.push(newScene(title));
    ctx.save();
    renderManuscript(ctx);
  });

  if (corkSettle) {
    const landed = $(`[data-card="${corkSettle}"]`, body);
    corkSettle = null;
    if (landed) {
      landed.classList.add("just-dropped");
      setTimeout(() => landed.classList.remove("just-dropped"), 700);
    }
  }

  // ---- pointer-based drag engine ---------------------------------------------------------
  // The card under the cursor is our own floating copy (lifted, tilting with the motion).
  // A gap marks where it will land; cards slide aside and columns grow/shrink smoothly (FLIP);
  // the board auto-scrolls near its edges; on release the copy flies into the gap.
  let drag = null;
  let suppressClick = false;

  const glide = (el, dx, dy) => {
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.getBoundingClientRect();
    el.style.transition = "";
    el.style.transform = "";
  };
  const growTo = (col, from, to) => {
    if (Math.abs(from - to) < 1) return;
    col.style.transition = "none";
    col.style.height = from + "px";
    col.getBoundingClientRect();
    col.style.transition = "";
    col.style.height = to + "px";
    clearTimeout(col._grow);
    col._grow = setTimeout(() => { col.style.height = ""; }, 340);
  };
  /** Run a DOM change, then animate every card and column from where it was to where it is now. */
  const flip = mutate => {
    const cols = $$(".board-col", body);
    const cards = $$(".board .index-card:not(.drag-source)", body);   // not the floating copy
    const colBefore = new Map(cols.map(c => [c, c.getBoundingClientRect()]));
    const cardBefore = new Map(cards.map(c => [c, { r: c.getBoundingClientRect(), col: c.parentNode }]));
    mutate();
    // measure the final layout with every in-flight animation switched off
    cols.forEach(c => { c.style.transition = "none"; c.style.height = ""; });
    cards.forEach(c => { c.style.transition = "none"; c.style.transform = "none"; });
    const colAfter = new Map(cols.map(c => [c, c.getBoundingClientRect()]));
    const cardAfter = new Map(cards.map(c => [c, c.getBoundingClientRect()]));
    cols.forEach(c => { c.style.transition = ""; growTo(c, colBefore.get(c).height, colAfter.get(c).height); });
    cards.forEach(c => {
      c.style.transform = "";
      const a = cardBefore.get(c), b = cardAfter.get(c);
      const ca = colBefore.get(a.col), cb = colAfter.get(c.parentNode);
      // positions relative to the card's column; the column's own movement is plain layout
      glide(c, (a.r.left - ca.left) - (b.left - cb.left), (a.r.top - ca.top) - (b.top - cb.top));
    });
  };

  const beginDrag = (card, ev) => {
    const r = card.getBoundingClientRect();
    const float = card.cloneNode(true);
    float.classList.add("drag-float");
    float.classList.remove("just-dropped");
    float.style.width = r.width + "px";
    float.style.height = r.height + "px";
    float.style.translate = `${r.left}px ${r.top}px`;
    cork.appendChild(float);
    setTimeout(() => float.classList.add("lifted"), 16);
    const ph = document.createElement("div");
    ph.className = "card-placeholder live";
    ph.style.height = r.height + "px";
    card.before(ph);
    card.classList.add("drag-source");
    document.body.classList.add("cork-dragging");
    drag = {
      id: card.dataset.card, card, float, ph,
      ox: ev.clientX - r.left, oy: ev.clientY - r.top,
      x: r.left, y: r.top, px: ev.clientX, py: ev.clientY,
      lockUntil: 0, raf: 0,
    };
    drag.raf = requestAnimationFrame(tick);
    addEventListener("keydown", onKey, true);
    addEventListener("blur", cancelDrag);
  };

  const tick = () => {
    if (!drag) return;
    // spring the floating card toward the pointer and tilt it with its speed
    const tx = drag.px - drag.ox, ty = drag.py - drag.oy;
    const nx = drag.x + (tx - drag.x) * 0.32, ny = drag.y + (ty - drag.y) * 0.32;
    const tilt = Math.max(-7, Math.min(7, (nx - drag.x) * 0.45));
    drag.x = nx;
    drag.y = ny;
    drag.float.style.translate = `${nx}px ${ny}px`;
    drag.float.style.rotate = `${1.5 + tilt}deg`;
    autoScroll();
    hitTest();
    drag.raf = requestAnimationFrame(tick);
  };

  // speed grows as the pointer nears the edge; time-based so it feels the same on any refresh rate
  const autoScroll = () => {
    const now = performance.now(), dt = Math.min(50, now - (drag.t || now)) / 1000;
    drag.t = now;
    const r = cork.getBoundingClientRect(), edge = 90, maxPerSec = 900;
    let f = 0;
    if (drag.py < r.top + edge) f = -Math.min(1, (r.top + edge - drag.py) / edge);
    else if (drag.py > r.bottom - edge) f = Math.min(1, (drag.py - (r.bottom - edge)) / edge);
    if (f) cork.scrollTop += f * f * Math.sign(f) * maxPerSec * dt;
  };

  const hitTest = () => {
    if (performance.now() < drag.lockUntil) return;   // let the last move settle (no flicker)
    const el = document.elementFromPoint(drag.px, drag.py);
    if (!el || !cork.contains(el) || el.closest(".card-placeholder")) return;
    const col = el.closest("[data-col]");
    if (!col) return;
    const target = el.closest("[data-card]");
    let before;
    if (target) {
      const r = target.getBoundingClientRect();
      const after = chapterCards ? drag.px > r.left + r.width / 2 : drag.py > r.top + r.height / 2;
      before = after ? target.nextElementSibling : target;
    } else if (chapterCards) {
      return;                                   // between cards of the grid: keep the current spot
    } else {
      before = $(".add-card", col);
    }
    while (before && (before === drag.card || before === drag.ph)) before = before.nextElementSibling;
    // already there?
    let cur = drag.ph.nextElementSibling;
    while (cur === drag.card) cur = cur.nextElementSibling;
    if (drag.ph.parentNode === col && cur === before) return;
    flip(() => col.insertBefore(drag.ph, before));
    $$(".board-col", body).forEach(c => c.classList.toggle("drop-col", c === col));
    drag.lockUntil = performance.now() + 140;
  };

  const stopDrag = () => {
    cancelAnimationFrame(drag.raf);
    removeEventListener("keydown", onKey, true);
    removeEventListener("blur", cancelDrag);
    document.body.classList.remove("cork-dragging");
    $$(".board-col.drop-col", body).forEach(c => c.classList.remove("drop-col"));
    const d = drag;
    drag = null;
    return d;
  };

  // fly the floating card into the gap, then call done()
  const land = (d, done) => {
    const r = d.ph.getBoundingClientRect();
    d.float.classList.add("landing");
    d.float.classList.remove("lifted");
    d.float.style.translate = `${r.left}px ${r.top}px`;
    d.float.style.rotate = "0deg";
    setTimeout(done, 270);
  };

  const cancelDrag = () => {
    if (!drag) return;
    const d = stopDrag();
    flip(() => d.card.before(d.ph));   // the gap slides back home
    land(d, () => {
      d.ph.remove();
      d.card.classList.remove("drag-source");
      d.float.remove();
    });
  };
  const onKey = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelDrag(); } };

  const dropDrag = () => {
    const d = stopDrag();
    if (chapterCards) return land(d, () => {
      // the new chapter order is simply the order of the cards, with the gap standing in for the dragged one
      const order = $$("[data-card], .card-placeholder", $(".chapter-grid", body))
        .filter(x => x !== d.card).map(x => x === d.ph ? d.id : x.dataset.card);
      const before = p.chapters.slice();
      const moved = order.some((id, i) => before[i].id !== id);
      p.chapters = order.map(id => before.find(c => c.id === id));
      corkSettle = d.id;
      ctx.save();
      renderManuscript(ctx);
      d.float.remove();
      if (moved) {
        const chap = before.find(c => c.id === d.id);
        toast(`Moved “${chap.title}” to position ${order.indexOf(d.id) + 1}`, {
          action: "Undo",
          onAction: () => { p.chapters = before; corkSettle = d.id; ctx.save(); renderManuscript(ctx); },
        });
      }
    });
    land(d, () => {
      let next = d.ph.nextElementSibling;
      while (next === d.card) next = next.nextElementSibling;
      if (next && !next.dataset.card) next = null;
      const toCol = d.ph.parentNode.dataset.col;
      // remember where it came from so Undo can put it back (order only, never content)
      const from = findScene(p, d.id);
      const fromNext = from.chapter.scenes[from.si + 1]?.id || null;
      const fromCh = from.chapter.id;
      moveScene(p, d.id, next ? next.dataset.card : null, next ? null : toCol);
      const to = findScene(p, d.id);
      const moved = to.chapter.id !== fromCh || (to.chapter.scenes[to.si + 1]?.id || null) !== fromNext;
      corkSettle = d.id;
      ctx.save();
      renderManuscript(ctx);
      d.float.remove();
      if (moved) {
        toast(`Moved “${to.scene.title}” to ${to.chapter.title}`, {
          action: "Undo",
          onAction: () => {
            moveScene(p, d.id, fromNext, fromNext ? null : fromCh);
            corkSettle = d.id;
            ctx.save();
            renderManuscript(ctx);
          },
        });
      }
    });
  };

  $$("[data-card]", body).forEach(card => {
    card.onclick = () => {
      if (suppressClick) { suppressClick = false; return; }
      if (chapterCards) openChapter(ctx, p.chapters.find(c => c.id === card.dataset.card));
      else openScene(ctx, card.dataset.card);
    };
    card.onpointerdown = e => {
      if (e.button !== 0 || drag) return;
      e.preventDefault();                       // no text selection while dragging
      const sx = e.clientX, sy = e.clientY;
      const move = ev => {
        if (!drag && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        if (!drag) beginDrag(card, ev);
        if (drag) { drag.px = ev.clientX; drag.py = ev.clientY; }
      };
      const up = ev => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
        removeEventListener("pointercancel", up);
        if (!drag) return;                        // a plain click: onclick opens the scene
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
        if (ev.type === "pointercancel") return cancelDrag();
        // a fast flick can end before the next frame: settle the drop spot from the release point
        drag.px = ev.clientX; drag.py = ev.clientY; drag.lockUntil = 0;
        hitTest();
        dropDrag();
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", up);
      addEventListener("pointercancel", up);
    };
  });
}
