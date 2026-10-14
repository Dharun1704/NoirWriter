// Plot & Timeline: arcs, the timeline of events (what really happened), and the Story vs truth and
// Structure tabs (drawn by storyviews.js).

import { uid, newEvent, deleteArc, character, sceneLabel, unitChoices, unitWord, ARC_COLORS } from "../store.js";
import { $, $$, esc, options, multiSelect, readMulti, modal, avatar, toast, slideTabs, undoable, cardDelete, bindCardDeletes } from "../ui.js";
import { icon } from "../icons.js";
import { renderStructure, renderCompare } from "./storyviews.js";

let hiddenArcs = new Set();
let plotTab = "timeline";      // "timeline" | "compare" | "structure"
let plotTabFrom = null;        // previous tab, so the highlight can slide across

export function renderPlot(ctx) {
  const { project: p, el } = ctx;
  const openEvent = ctx.item ? p.events.find(e => e.id === ctx.item) : null;
  if (openEvent) plotTab = "timeline";
  ctx.item = "";
  const tabs = [["timeline", "Timeline"], ["compare", "Story vs truth"], ["structure", "Structure"]];
  const hint = {
    timeline: "What really happened, in the order it happened.",
    compare: "The order the reader meets things, beside the order they really happened.",
    structure: "A story-structure template laid over your chapters.",
  }[plotTab];

  el.innerHTML = `
    <div class="page-head">
      <h2>Plot &amp; Timeline</h2>
      <div class="seg sliding" role="tablist">${tabs.map(([k, l]) => `<button data-plot-tab="${k}" class="${plotTab === k ? "on" : ""}" role="tab">${l}</button>`).join("")}</div>
      <span class="faint small">${hint}</span>
    </div>
    <div class="page-body">
      <div class="arc-list" ${plotTab === "timeline" ? "" : "hidden"}>
        <span class="section-title" style="margin:0 6px 0 0">Arcs</span>
        ${p.arcs.map(a => `
          <span class="arc-pill ${hiddenArcs.has(a.id) ? "off" : ""}" data-arc="${a.id}" title="Click to show/hide · double-click to edit">
            <span class="dot" style="background:${a.color}"></span>${esc(a.name)}
          </span>`).join("")}
        <button class="btn sm add-btn ghost" data-add-arc>+ Arc</button>
      </div>
      <div id="plot-body"></div>
    </div>`;

  $$("[data-arc]", el).forEach(pill => {
    pill.onclick = () => {
      const id = pill.dataset.arc;
      hiddenArcs.has(id) ? hiddenArcs.delete(id) : hiddenArcs.add(id);
      renderPlot(ctx);
    };
    pill.ondblclick = () => editArc(ctx, p.arcs.find(a => a.id === pill.dataset.arc));
  });
  $("[data-add-arc]", el).onclick = () => editArc(ctx, null);
  $$("[data-plot-tab]", el).forEach(b => b.onclick = () => {
    if (b.dataset.plotTab === plotTab) return;
    plotTabFrom = plotTab; plotTab = b.dataset.plotTab; renderPlot(ctx);
  });
  slideTabs($(".page-head .seg", el), plotTabFrom, "data-plot-tab", $(".page-body", el));
  plotTabFrom = null;

  if (plotTab === "compare") renderCompare(ctx, $("#plot-body"), { editEvent });
  else if (plotTab === "structure") renderStructure(ctx, $("#plot-body"));
  else renderTimeline(ctx);

  if (openEvent) {
    history.replaceState(null, "", `#/p/${p.id}/plot`);
    editEvent(ctx, openEvent, false);
  }
}

const arcVisible = ids => !ids.length || ids.some(id => !hiddenArcs.has(id));

// ---------------------------------------------------------------- timeline

function renderTimeline(ctx) {
  const { project: p } = ctx;
  const body = $("#plot-body");
  const events = p.events.filter(e => arcVisible(e.arcId ? [e.arcId] : []));
  body.innerHTML = `
    ${p.events.length ? "" : `<p class="list-hint">Stories are often told out of order: flashbacks, hidden crimes, ancient history. The timeline keeps the truth straight.</p>`}
    <div class="timeline">${events.map(e => {
    const arc = p.arcs.find(a => a.id === e.arcId);
    const idx = p.events.indexOf(e);
    return `
    <div class="t-event">
      <div class="t-when">${esc(e.when) || "—"}</div>
      <div class="t-node" style="${arc ? `background:${arc.color}` : ""}"></div>
      <div class="t-card" data-ev="${e.id}" style="border-left-color:${arc ? arc.color : "var(--line)"}">
        <h4>${esc(e.title)} ${e.offPage ? `<span class="offpage">off-page</span>` : ""}</h4>
        ${e.description ? `<p>${esc(e.description)}</p>` : ""}
        <div class="foot chips">
          ${e.characterIds.map(id => avatar(character(p, id), 22)).join("")}
          ${e.sceneId ? `<span class="chip">↳ ${esc(sceneLabel(p, e.sceneId))}</span>` : ""}
          ${arc ? `<span class="chip"><span class="dot" style="background:${arc.color}"></span>${esc(arc.name)}</span>` : ""}
        </div>
      </div>
      <div class="order-btns">
        <button class="icon-btn" data-up="${idx}" title="Earlier" aria-label="Move earlier">${icon("arrowUp", 15)}</button>
        <button class="icon-btn" data-down="${idx}" title="Later" aria-label="Move later">${icon("arrowDown", 15)}</button>
        ${cardDelete(e.id, `Delete ${e.title}`)}
      </div>
    </div>`;
  }).join("")}
    <div class="t-event t-add">
      <div class="t-node"></div>
      <button class="add-tile wide" type="button" data-add-event>${icon("plus")}<span>New event</span></button>
    </div></div>`;

  $("[data-add-event]", body).onclick = () => editEvent(ctx, newEvent(), true);
  bindCardDeletes(body, ctx, {
    describe: id => `“${p.events.find(x => x.id === id)?.title || "event"}”`,
    remove: id => { p.events = p.events.filter(x => x.id !== id); },
    after: () => renderTimeline(ctx),
  });

  $$("[data-ev]", body).forEach(card => card.onclick = () => editEvent(ctx, p.events.find(e => e.id === card.dataset.ev), false));
  $$("[data-up],[data-down]", body).forEach(b => b.onclick = e => {
    e.stopPropagation();
    const i = +(b.dataset.up ?? b.dataset.down);
    const j = b.dataset.up !== undefined ? i - 1 : i + 1;
    if (j < 0 || j >= p.events.length) return;
    [p.events[i], p.events[j]] = [p.events[j], p.events[i]];
    ctx.save();
    renderTimeline(ctx);
  });
}

// ---------------------------------------------------------------- editors

async function editEvent(ctx, ev, isNew) {
  const { project: p } = ctx;
  const r = await modal({
    title: isNew ? "New event" : "Edit event",
    wide: true,
    body: `
      <div class="row">
        <label class="field" style="flex:2"><span>What happened</span><input type="text" name="title" value="${esc(ev.title)}"></label>
        <label class="field"><span>When</span><input type="text" name="when" value="${esc(ev.when)}" placeholder="${p.genre === "fantasy" ? "Year 312 of the Third Age" : "1946 · Fri night · Day 3"}"></label>
      </div>
      <label class="field"><span>Details</span><textarea name="description" rows="3">${esc(ev.description)}</textarea></label>
      <div class="row">
        <label class="field"><span>Arc</span><select name="arcId">${options(p.arcs, ev.arcId, { empty: "— none —" })}</select></label>
        <label class="field"><span>Shown in ${unitWord(p)}</span><select name="sceneId">${options(unitChoices(p, ev.sceneId), ev.sceneId, { empty: "— not shown on the page —" })}</select></label>
      </div>
      <label class="field"><span>Who was involved</span>${multiSelect("chars", p.characters, ev.characterIds)}</label>
      <label style="display:flex;gap:8px;align-items:center;cursor:pointer">
        <input type="checkbox" name="offPage" ${ev.offPage ? "checked" : ""}> Happens off-page (backstory, the crime itself, something only revealed later)
      </label>`,
    buttons: [
      ...(isNew ? [] : [{ label: "Delete", value: "delete", left: true, kind: "danger", confirm: "Delete this event?" }]),
      { label: "Cancel", value: null },
      { label: isNew ? "Add event" : "Save", kind: "primary", value: "save" },
    ],
  });
  if (!r?.value) return;
  if (r.value === "delete") {
    p.events = p.events.filter(e => e !== ev);
    toast(`Deleted “${ev.title}”`, { action: "Undo", onAction: () => { p.events.push(ev); ctx.save(); renderPlot(ctx); } });
  } else {
    const f = n => r.root.querySelector(`[name=${n}]`);
    ev.title = f("title").value.trim() || "Untitled event";
    ev.when = f("when").value.trim();
    ev.description = f("description").value;
    ev.arcId = f("arcId").value;
    ev.sceneId = f("sceneId").value;
    ev.offPage = f("offPage").checked;
    ev.characterIds = readMulti(r.root, "chars");
    if (isNew) p.events.push(ev);
  }
  ctx.save();
  renderPlot(ctx);
}

async function editArc(ctx, arc) {
  const { project: p } = ctx;
  const isNew = !arc;
  arc = arc || { id: uid(), name: "", color: ARC_COLORS[p.arcs.length % ARC_COLORS.length], description: "" };
  let color = arc.color;
  const r = await modal({
    title: isNew ? "New arc" : "Edit arc",
    body: `
      <label class="field"><span>Name</span><input type="text" name="name" value="${esc(arc.name)}" placeholder="${p.genre === "fantasy" ? "The quest · The usurper · Kael's redemption" : "The affair · The money trail · Detective's redemption"}"></label>
      <label class="field"><span>Colour</span><div class="color-swatches">${ARC_COLORS.map(c =>
        `<button type="button" data-color="${c}" class="${c === color ? "on" : ""}" style="background:${c}"></button>`).join("")}</div></label>
      <label class="field"><span>Description</span><textarea name="description" rows="3">${esc(arc.description)}</textarea></label>`,
    buttons: [
      ...(isNew ? [] : [{ label: "Delete", value: "delete", left: true, kind: "danger", confirm: "Delete this arc? Scenes and events stay." }]),
      { label: "Cancel", value: null },
      { label: "Save", kind: "primary", value: "save" },
    ],
    onMount: root => $$("[data-color]", root).forEach(b => b.onclick = () => {
      color = b.dataset.color;
      $$("[data-color]", root).forEach(x => x.classList.toggle("on", x === b));
    }),
  });
  if (!r?.value) return;
  if (r.value === "delete") {
    return undoable(ctx, `Deleted arc “${arc.name}”`, () => deleteArc(p, arc.id), () => renderPlot(ctx));
  } else {
    arc.name = r.root.querySelector("[name=name]").value.trim() || "Untitled arc";
    arc.description = r.root.querySelector("[name=description]").value;
    arc.color = color;
    if (isNew) p.arcs.push(arc);
  }
  ctx.save();
  renderPlot(ctx);
}
