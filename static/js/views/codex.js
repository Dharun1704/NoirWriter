// Generic encyclopedia module: list + detail pages driven by a schema from features.js.
import { newEntry, deleteEntry, scenesForItem, backlinks, api } from "../store.js";
import { SCHEMAS } from "../features.js";
import { fieldHtml, bindFields, fieldVisible } from "../fields.js";
import { $, $$, esc, confirmInline, undoable, drafts, pickFile, initials, toast,
  nameField, cardDelete, addTile, bindCardDeletes } from "../ui.js";
import { flushSave } from "../store.js";

const listState = {};   // per-module search / type filter

export function renderCodex(ctx, feature) {
  const list = ctx.project.codex[feature.key];
  const draft = drafts.get(ctx.item);
  const entry = list.find(e => e.id === ctx.item) || (draft?.key === feature.key ? draft.item : null);
  if (entry) return renderEntry(ctx, feature, entry);
  renderList(ctx, feature);
}

function summary(e, schema) {
  const f = schema.find(f => f.type === "textarea" && e[f.key]?.trim());
  return f ? e[f.key].trim().slice(0, 140) : "";
}

function renderList(ctx, feature) {
  const { project: p, el } = ctx;
  const schema = SCHEMAS[feature.key];
  const all = p.codex[feature.key];
  const st = (listState[feature.key] ||= { q: "", type: "" });
  const typeField = schema.find(f => f.key === "type");
  const q = st.q.toLowerCase();
  const match = e => (!st.type || e.type === st.type) &&
    (!q || [e.name, e.type, summary(e, schema)].join(" ").toLowerCase().includes(q));
  const items = all.filter(match);
  const hierarchical = schema.some(f => f.type === "parent");

  el.innerHTML = `
    <div class="page-head">
      <h2>${esc(feature.label)}</h2>
      <div class="grow"></div>
      <div class="filter-bar">
        <input type="text" id="cx-search" placeholder="Search..." value="${esc(st.q)}">
        ${typeField ? `<select id="cx-type" style="width:auto"><option value="">All types</option>${typeField.options.map(o =>
          `<option ${o === st.type ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>` : ""}
      </div>
    </div>
    <div class="page-body">
      ${!all.length ? `<p class="list-hint">${esc(feature.desc || `No ${feature.label.toLowerCase()} yet.`)}</p>` : ""}
      ${all.length && !items.length ? `<p class="list-hint">Nothing matches.</p>` : ""}
      ${hierarchical && all.length && !q && !st.type
        ? `<div class="tree">${treeHtml(all, "", 0, schema)}
            <button class="tree-add" type="button" data-add>+ New ${esc(feature.singular.toLowerCase())}</button></div>`
        : `<div class="entry-grid">${items.map(e => cardHtml(e, schema)).join("")}${addTile(`New ${feature.singular.toLowerCase()}`)}</div>`}
    </div>`;

  $$("[data-add]", el).forEach(b => b.onclick = () => {
    const e = newEntry(feature.key, "");
    drafts.set(e.id, { key: feature.key, item: e });
    ctx.go(feature.key, e.id);
  });
  $$("[data-open]", el).forEach(c => c.onclick = ev => {
    if (ev.target.closest("[data-add-child], .card-actions, .confirm-inline")) return;
    ctx.go(feature.key, c.dataset.open);
  });
  bindCardDeletes(el, ctx, {
    describe: id => `“${all.find(x => x.id === id)?.name || feature.singular}”`,
    remove: id => deleteEntry(p, feature.key, id),
    after: () => renderList(ctx, feature),
  });
  $$("[data-add-child]", el).forEach(b => b.onclick = () => {
    const e = newEntry(feature.key, "");
    e.parentId = b.dataset.addChild;
    drafts.set(e.id, { key: feature.key, item: e });
    ctx.go(feature.key, e.id);
  });
  const s = $("#cx-search");
  s.oninput = () => {
    st.q = s.value;
    renderList(ctx, feature);
    const again = $("#cx-search");
    again.focus();
    again.setSelectionRange(again.value.length, again.value.length);
  };
  const t = $("#cx-type");
  if (t) t.onchange = () => { st.type = t.value; renderList(ctx, feature); };
}

function cardHtml(e, schema) {
  return `
    <div class="entry-card" data-open="${e.id}">
      ${cardDelete(e.id, `Delete ${e.name}`)}
      ${e.image ? `<div class="entry-img" style="background-image:url('${esc(e.image)}')"></div>` : ""}
      <div class="body">
        <div class="entry-type">${esc(e.type || "")}</div>
        <h3>${esc(e.name)}</h3>
        <p>${esc(summary(e, schema))}</p>
      </div>
    </div>`;
}

function treeHtml(all, parentId, depth, schema) {
  const ids = new Set(all.map(e => e.id));
  const kids = all.filter(e => (e.parentId || "") === parentId || (parentId === "" && e.parentId && !ids.has(e.parentId)));
  return kids.map(e => `
    <div class="tree-row" data-open="${e.id}" style="padding-left:${12 + depth * 22}px">
      <span class="tree-ic">${depth ? "└" : "◆"}</span>
      <b>${esc(e.name)}</b> <span class="faint">${esc(e.type || "")}</span>
      <span class="tree-sum">${esc(summary(e, schema))}</span>
      <button class="btn sm add-btn ghost" data-add-child="${e.id}" title="Add a place inside ${esc(e.name)}">+ inside</button>
      <span class="tree-del">${cardDelete(e.id, `Delete ${e.name}`)}</span>
    </div>
    ${treeHtml(all, e.id, depth + 1, schema)}`).join("");
}

function renderEntry(ctx, feature, e) {
  const { project: p, el } = ctx;
  const schema = SCHEMAS[feature.key].filter(f => fieldVisible(p, f));
  const list = p.codex[feature.key];
  const scenes = scenesForItem(p, e.id);
  const links = backlinks(p, e.id);
  const children = list.filter(x => x.parentId === e.id);
  const parentChain = [];
  for (let cur = list.find(x => x.id === e.parentId); cur && parentChain.length < 10; cur = list.find(x => x.id === cur.parentId)) parentChain.unshift(cur);
  const scrollTop = $(".page-body", el)?.scrollTop || 0;
  const isNote = feature.key === "notes";
  const isDraft = drafts.has(e.id);

  el.innerHTML = `
    <div class="page-head">
      <button class="btn ghost" data-back>← ${esc(feature.label)}</button>
      ${parentChain.length ? `<span class="faint small">${parentChain.map(x => `<a data-goto-entry="${x.id}">${esc(x.name)}</a>`).join(" › ")} ›</span>` : ""}
      <span class="faint small">${isDraft ? `New ${esc(feature.singular.toLowerCase())} — not added until you click Add` : "Changes save automatically"}</span>
      <div class="grow"></div>
      ${isDraft
        ? `<button class="btn ghost" data-discard>Cancel</button><button class="btn primary" data-done>Add ${esc(feature.singular.toLowerCase())}</button>`
        : `<button class="btn primary" data-done>Done</button>`}
    </div>
    <div class="page-body">
      <div class="detail ${isNote ? "note-detail" : ""}">
        <div>
          ${isNote ? "" : `
          <div class="portrait entry-portrait" id="entry-image" title="Click to set an image" style="${e.image ? `background-image:url('${esc(e.image)}')` : ""}">${e.image ? "" : initials(e.name)}</div>
          ${e.image ? `<button class="btn ghost sm" data-clear-image style="margin-top:6px">Remove image</button>` : ""}`}
          ${children.length ? `<h3 class="section-title" style="margin-top:22px">Contains</h3>${children.map(c =>
            `<div class="side-link"><a data-goto-entry="${c.id}">${esc(c.name)}</a> <span class="faint">${esc(c.type || "")}</span></div>`).join("")}` : ""}
          <h3 class="section-title" style="margin-top:22px">Appears in</h3>
          ${scenes.length ? scenes.map(({ scene, ci, si }) =>
            `<div class="side-link"><a data-scene="${scene.id}">Ch ${ci + 1}.${si + 1} · ${esc(scene.title)}</a></div>`).join("")
            : `<div class="faint small">Not linked to any scene yet. Link it from a scene's details panel (“Also in this scene”).</div>`}
          ${links.length ? `<h3 class="section-title" style="margin-top:22px">Mentioned in</h3>` + links.map(l => `
            <div class="side-link"><a data-goto="${l.view}" data-id="${l.target}">${esc(l.label)}</a> <span class="faint">${esc(l.where)}</span></div>`).join("") : ""}
          ${isDraft ? "" : `<div class="detail-danger"><button class="btn sm ghost danger" data-del>Delete ${esc(feature.singular.toLowerCase())}</button></div>`}
        </div>
        <div>
          ${nameField(e.name, isNote ? "Title" : "Name", `${feature.singular} name`)}
          <div class="fields-grid">${schema.map(f => fieldHtml(p, f, e, { collection: list })).join("")}</div>
        </div>
      </div>
    </div>`;
  $(".page-body", el).scrollTop = scrollTop;

  const rerender = () => renderEntry(ctx, feature, e);
  bindFields(el, e, schema, { save: () => ctx.save(), rerender });
  $$("[data-k=parentId]", el).forEach(s => s.addEventListener("change", rerender));
  const leave = () => { drafts.delete(e.id); ctx.go(feature.key); };
  $("[data-back]", el).onclick = leave;
  $("[data-done]", el).onclick = async () => {
    if (isDraft) {
      if (!e.name.trim()) e.name = `Unnamed ${feature.singular.toLowerCase()}`;
      drafts.delete(e.id);
      list.push(e);
    }
    ctx.save();
    await flushSave(p);
    toast(isDraft ? `Added “${e.name}”` : "Saved");
    ctx.go(feature.key);
  };
  const remove = message => undoable(ctx, message, () => deleteEntry(p, feature.key, e.id),
    undone => ctx.go(feature.key, undone ? e.id : ""));
  const discard = $("[data-discard]", el);
  if (discard) discard.onclick = leave;
  if (isDraft) setTimeout(() => $(".name-input", el)?.focus());
  const del = $("[data-del]", el);
  if (del) del.onclick = async () => {
    const extra = children.length ? ` ${children.length} place${children.length === 1 ? "" : "s"} inside move to the top level.` : "";
    if (await confirmInline(del, `Delete “${e.name}”?${extra}`)) remove(`Deleted “${e.name}”`);
  };
  const img = $("#entry-image");
  if (img) img.onclick = async () => {
    const file = await pickFile("image/png,image/jpeg,image/webp,image/gif");
    if (!file) return;
    try {
      e.image = await api.uploadAsset(p.id, file);
      ctx.save();
      rerender();
    } catch (err) { toast(err.message); }
  };
  const clear = $("[data-clear-image]", el);
  if (clear) clear.onclick = () => { e.image = ""; ctx.save(); rerender(); };
  $$("[data-goto-entry]", el).forEach(a => a.onclick = () => ctx.go(feature.key, a.dataset.gotoEntry));
  $$("[data-scene]", el).forEach(a => a.onclick = () => ctx.go("manuscript", a.dataset.scene));
  $$("[data-goto]", el).forEach(a => a.onclick = () => ctx.go(a.dataset.goto, a.dataset.id));
}
