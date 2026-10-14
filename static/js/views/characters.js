// Characters (or "People" in non-fiction): the card grid, the relationship web tab, and each
// character's page (portrait, profile sections, relationships, and where they appear).

import { newCharacter, deleteCharacter, scenesForItem, character, backlinks, hasFeature } from "../store.js";
import { GENRES, CHARACTER_SECTIONS, peopleLabel } from "../features.js";
import { fieldHtml, bindFields, fieldVisible } from "../fields.js";
import { $, $$, esc, options, plural, confirmInline, undoable, drafts, pickFile, imageToDataUrl, initials, toast,
  nameField, cardDelete, addTile, bindCardDeletes, slideTabs } from "../ui.js";
import { flushSave } from "../store.js";
import { icon } from "../icons.js";

import { renderRelationshipWeb } from "./relweb.js";

let roleFilter = "";
let charTab = "cards";     // "cards" | "web"
let charTabFrom = null;    // previous tab, so the highlight can slide across
let search = "";

export function renderCharacters(ctx) {
  const c = character(ctx.project, ctx.item) || (drafts.get(ctx.item)?.key === "characters" ? drafts.get(ctx.item).item : null);
  if (c) return renderDetail(ctx, c);
  renderList(ctx);
}

function renderList(ctx) {
  const { project: p, el } = ctx;
  const q = search.toLowerCase();
  const list = p.characters.filter(c =>
    (!roleFilter || c.role === roleFilter) &&
    (!q || [c.name, c.occupation, c.role].join(" ").toLowerCase().includes(q)));
  const roles = [...new Set(p.characters.map(c => c.role))];

  el.innerHTML = `
    <div class="page-head">
      <h2>${esc(peopleLabel(p.genre).plural)}</h2>
      <div class="seg sliding" role="tablist">
        <button data-char-tab="cards" class="${charTab === "cards" ? "on" : ""}">Cards</button>
        <button data-char-tab="web" class="${charTab === "web" ? "on" : ""}">Relationship web</button>
      </div>
      <div class="grow"></div>
      <div class="filter-bar" ${charTab === "web" ? "hidden" : ""}>
        <input type="text" id="char-search" placeholder="Search..." value="${esc(search)}">
        <select id="role-filter" style="width:auto">${options(roles.map(r => ({ id: r, name: r })), roleFilter, { empty: "All roles" })}</select>
      </div>
    </div>
    <div class="page-body">
      ${!p.characters.length ? `<p class="list-hint">No characters yet. Start with your protagonist.</p>` : ""}
      ${p.characters.length && !list.length ? `<p class="list-hint">No one matches that description.</p>` : ""}
      <div class="char-grid">${list.map(c => {
        const n = scenesForItem(p, c.id).length;
        return `
        <div class="char-card" data-open="${c.id}">
          ${cardDelete(c.id, `Delete ${c.name}`)}
          <div class="portrait" style="${c.portrait ? `background-image:url('${c.portrait}')` : ""}">${c.portrait ? "" : initials(c.name)}</div>
          <div class="body">
            <h3>${esc(c.name)}</h3>
            <div class="sub">${esc(c.role)}${c.occupation ? ` · ${esc(c.occupation)}` : ""}</div>
            <div class="sub faint" style="margin-top:6px">${plural(n, "scene")}</div>
          </div>
        </div>`;
      }).join("")}${addTile(`New ${peopleLabel(p.genre).singular}`)}</div>
    </div>`;

  $$("[data-char-tab]", el).forEach(b => b.onclick = () => {
    if (b.dataset.charTab === charTab) return;
    charTabFrom = charTab; charTab = b.dataset.charTab; renderList(ctx);
  });
  slideTabs($(".page-head .seg", el), charTabFrom, "data-char-tab", $(".page-body", el));
  charTabFrom = null;
  if (charTab === "web") {
    renderRelationshipWeb(ctx, $(".page-body", el));
    return;
  }
  $$("[data-add]", el).forEach(b => b.onclick = () => {
    const c = newCharacter("", GENRES[p.genre].roles[0]);
    drafts.set(c.id, { key: "characters", item: c });
    ctx.go("characters", c.id);
  });
  $$("[data-open]", el).forEach(card => card.onclick = () => ctx.go("characters", card.dataset.open));
  bindCardDeletes(el, ctx, {
    describe: id => character(p, id)?.name || peopleLabel(p.genre).singular,
    remove: id => deleteCharacter(p, id),
    after: () => renderList(ctx),
  });
  const s = $("#char-search");
  s.oninput = () => {
    search = s.value;
    renderList(ctx);
    const again = $("#char-search");
    again.focus();
    again.setSelectionRange(again.value.length, again.value.length);
  };
  $("#role-filter").onchange = e => { roleFilter = e.target.value; renderList(ctx); };
}

function renderDetail(ctx, c) {
  const { project: p, el } = ctx;
  const scenes = scenesForItem(p, c.id);
  const others = p.characters.filter(x => x.id !== c.id);
  const links = backlinks(p, c.id);
  const roles = GENRES[p.genre].roles.includes(c.role) ? GENRES[p.genre].roles : [...GENRES[p.genre].roles, c.role];
  const sections = CHARACTER_SECTIONS.filter(sec => !sec.feature || hasFeature(p, sec.feature))
    .map(sec => ({ ...sec, fields: sec.fields.filter(f => fieldVisible(p, f)) }))
    .filter(sec => sec.fields.length);
  const scrollTop = $(".page-body", el)?.scrollTop || 0;
  const isDraft = drafts.has(c.id);

  el.innerHTML = `
    <div class="page-head">
      <button class="btn ghost" data-back>← ${esc(peopleLabel(p.genre).plural)}</button>
      <span class="faint small">${isDraft ? `New ${peopleLabel(p.genre).singular} — not added until you click Add` : "Changes save automatically"}</span>
      <div class="grow"></div>
      ${isDraft
        ? `<button class="btn ghost" data-discard>Cancel</button><button class="btn primary" data-done>Add ${peopleLabel(p.genre).singular}</button>`
        : `<button class="btn primary" data-done>Done</button>`}
    </div>
    <div class="page-body">
      <div class="detail">
        <div>
          <div class="portrait" id="portrait" title="Click to set a portrait" style="${c.portrait ? `background-image:url('${c.portrait}')` : ""}">${c.portrait ? "" : initials(c.name)}</div>
          ${c.portrait ? `<button class="btn ghost sm" data-clear-portrait style="margin-top:6px">Remove portrait</button>` : ""}
          <h3 class="section-title" style="margin-top:22px">Appears in</h3>
          ${scenes.length ? scenes.map(({ scene, ci, si }) => `
            <div class="side-link"><a data-scene="${scene.id}">Ch ${ci + 1}.${si + 1} · ${esc(scene.title)}</a>
              ${scene.povId === c.id ? `<span class="tag gold">POV</span>` : ""}</div>`).join("")
            : `<div class="faint small">Not in any scene yet. Tag them from a scene's details panel.</div>`}
          ${links.length ? `<h3 class="section-title" style="margin-top:22px">Mentioned in</h3>` + links.map(l => `
            <div class="side-link"><a data-goto="${l.view}" data-id="${l.target}">${esc(l.label)}</a> <span class="faint">${esc(l.where)}</span></div>`).join("") : ""}
          ${isDraft ? "" : `<div class="detail-danger"><button class="btn sm ghost danger" data-del>Delete ${peopleLabel(p.genre).singular}</button></div>`}
        </div>
        <div>
          ${nameField(c.name, "Name", "Character name")}
          <div class="fields-grid">
            <label class="field"><span>Role</span><select data-k="role">${roles.map(r => `<option ${r === c.role ? "selected" : ""}>${esc(r)}</option>`).join("")}</select></label>
            <span></span>
          </div>
          ${sections.map(sec => `
            ${sec.title ? `<h3 class="section-title" style="margin-top:8px">${esc(sec.title)}</h3>` : ""}
            <div class="fields-grid">${sec.fields.map(f => fieldHtml(p, f, c)).join("")}</div>`).join("")}
          <h3 class="section-title" style="margin-top:8px">Relationships</h3>
          <div id="rels">
            ${c.relationships.map((r, i) => `
              <div class="rel-row">
                <select data-rel-target="${i}">${options(others, r.targetId, { empty: "— choose —" })}</select>
                <input type="text" data-rel-type="${i}" value="${esc(r.type)}" placeholder="${p.genre === "fantasy" ? "e.g. sworn brother, mentor, betrayed by" : p.genre === "nonfiction" ? "e.g. mother, mentor, business partner" : "e.g. ex-wife, blackmailer, owes money to"}">
                <button class="icon-btn danger" data-rel-del="${i}" title="Remove relationship" aria-label="Remove relationship">${icon("x", 16)}</button>
              </div>`).join("")}
          </div>
          ${others.length ? `<button class="btn sm add-btn" data-rel-add>+ Relationship</button>` : `<span class="faint small">Add more characters to define relationships.</span>`}
        </div>
      </div>
    </div>`;
  $(".page-body", el).scrollTop = scrollTop;

  const rerender = () => renderDetail(ctx, c);
  bindFields(el, c, sections.flatMap(s => s.fields), { save: () => ctx.save(), rerender });
  $(".name-input", el).oninput = e => { c.name = e.target.value; ctx.save(); };
  $("[data-k=role]", el).onchange = e => { c.role = e.target.value; ctx.save(); };

  const leave = () => { drafts.delete(c.id); ctx.go("characters"); };
  $("[data-back]", el).onclick = leave;
  $("[data-done]", el).onclick = async () => {
    if (isDraft) {
      if (!c.name.trim()) c.name = `Unnamed ${peopleLabel(p.genre).singular}`;
      drafts.delete(c.id);
      p.characters.push(c);
    }
    ctx.save();
    await flushSave(p);
    toast(isDraft ? `Added ${c.name}` : "Saved");
    ctx.go("characters");
  };
  const remove = message => undoable(ctx, message, () => deleteCharacter(p, c.id),
    undone => ctx.go("characters", undone ? c.id : ""));
  const discard = $("[data-discard]", el);
  if (discard) discard.onclick = leave;
  if (isDraft) setTimeout(() => $(".name-input", el)?.focus());
  const del = $("[data-del]", el);
  if (del) del.onclick = async () => {
    if (await confirmInline(del, `Delete ${c.name}? They'll be unlinked everywhere.`)) remove(`Deleted ${c.name}`);
  };
  $("#portrait").onclick = async () => {
    const file = await pickFile("image/*");
    if (!file) return;
    try {
      c.portrait = await imageToDataUrl(file);
      ctx.save();
      rerender();
    } catch { toast("Couldn't read that image"); }
  };
  const clear = $("[data-clear-portrait]", el);
  if (clear) clear.onclick = () => { c.portrait = ""; ctx.save(); rerender(); };

  $$("[data-rel-target]", el).forEach(s => s.onchange = () => { c.relationships[+s.dataset.relTarget].targetId = s.value; ctx.save(); });
  $$("[data-rel-type]", el).forEach(s => s.oninput = () => { c.relationships[+s.dataset.relType].type = s.value; ctx.save(); });
  $$("[data-rel-del]", el).forEach(b => b.onclick = () => { c.relationships.splice(+b.dataset.relDel, 1); ctx.save(); rerender(); });
  const add = $("[data-rel-add]", el);
  if (add) add.onclick = () => { c.relationships.push({ targetId: "", type: "" }); ctx.save(); rerender(); };
  $$("[data-scene]", el).forEach(a => a.onclick = () => ctx.go("manuscript", a.dataset.scene));
  $$("[data-goto]", el).forEach(a => a.onclick = () => ctx.go(a.dataset.goto, a.dataset.id));
}
