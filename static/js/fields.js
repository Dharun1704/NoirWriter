// Render and bind schema-driven fields (used by codex entries and character sheets).
import { refTargets, hasFeature, CODEX_KEYS } from "./store.js";
import { featureByKey, peopleLabel } from "./features.js";
import { $$, esc, multiSelect, readMulti } from "./ui.js";
import { icon } from "./icons.js";

/** Is this field visible for the project's enabled features? */
export function fieldVisible(p, f) {
  if (f.feature && !hasFeature(p, f.feature)) return false;
  if (f.type === "ref" && f.to !== "characters" && !hasFeature(p, f.to)) return false;
  return true;
}

export function fieldHtml(p, f, obj, { collection = [] } = {}) {
  if (!fieldVisible(p, f)) return "";
  const v = obj[f.key];
  const span = f.wide || f.type === "table" || f.type === "ref" || (f.rows || 0) >= 5 ? "wide" : "";
  const wrap = inner => `<label class="field ${span}"><span>${esc(f.label)}</span>${inner}</label>`;
  switch (f.type) {
    case "text":
      return wrap(`<input type="text" data-k="${f.key}" value="${esc(v)}">`);
    case "textarea":
      return wrap(`<textarea data-k="${f.key}" rows="${f.rows || 3}">${esc(v)}</textarea>`);
    case "select": {
      const opts = f.options.includes(v) || !v ? f.options : [...f.options, v];
      return wrap(`<select data-k="${f.key}">${opts.map(o => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`);
    }
    case "parent": {
      const banned = descendants(collection, obj.id);
      const choices = collection.filter(e => !banned.has(e.id));
      return wrap(`<select data-k="${f.key}"><option value="">— top level —</option>${choices.map(e =>
        `<option value="${e.id}" ${e.id === v ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</select>`);
    }
    case "ref": {
      const targets = refTargets(p, f.to).filter(t => t.id !== obj.id);
      const label = f.to === "characters" ? peopleLabel(p.genre).plural : featureByKey(f.to)?.label;
      const body = targets.length ? multiSelect(`ref-${f.key}`, targets, v || [])
        : `<span class="faint" style="font-size:13px">No ${esc(label.toLowerCase())} yet.</span>`;
      return `<div class="field wide"><span class="field-label">${esc(f.label)}</span>${body}</div>`;
    }
    case "table": {
      // always show at least one empty row to type into; it's only saved once something is written
      const rows = v && v.length ? v : [f.columns.map(() => "")];
      return `<div class="field wide"><span class="field-label">${esc(f.label)}</span>
        <table class="mini-table" data-table="${f.key}">
          <thead><tr>${f.columns.map(c => `<th>${esc(c)}</th>`).join("")}<th></th></tr></thead>
          <tbody>${rows.map((r, ri) => `<tr>${f.columns.map((c, ci) =>
            `<td><input type="text" data-cell="${ri}:${ci}" value="${esc(r[ci] ?? "")}"></td>`).join("")}
            <td><button class="icon-btn danger" data-row-del="${ri}" title="Remove row" aria-label="Remove row">${icon("x", 16)}</button></td></tr>`).join("")}</tbody>
        </table>
        <button class="btn sm add-btn" data-row-add="${f.key}" type="button">+ Row</button></div>`;
    }
  }
  return "";
}

/** Wire up inputs rendered by fieldHtml. `rerender` is called when structure changes (table rows). */
export function bindFields(root, obj, fields, { save, rerender }) {
  $$("[data-k]", root).forEach(inp => {
    inp[inp.tagName === "SELECT" ? "onchange" : "oninput"] = () => { obj[inp.dataset.k] = inp.value; save(); };
  });
  for (const f of fields) {
    if (f.type === "ref") {
      const box = root.querySelector(`[data-multi="ref-${f.key}"]`);
      if (box) box.onchange = () => { obj[f.key] = readMulti(root, `ref-${f.key}`); save(); };
    }
    if (f.type === "table") {
      const table = root.querySelector(`[data-table="${f.key}"]`);
      if (!table) continue;
      const ensureRow = ri => {
        if (!Array.isArray(obj[f.key])) obj[f.key] = [];
        while (obj[f.key].length <= ri) obj[f.key].push(f.columns.map(() => ""));
      };
      $$("[data-cell]", table).forEach(inp => inp.oninput = () => {
        const [ri, ci] = inp.dataset.cell.split(":").map(Number);
        ensureRow(ri);
        obj[f.key][ri][ci] = inp.value;
        save();
      });
      $$("[data-row-del]", table).forEach(b => b.onclick = () => {
        const ri = +b.dataset.rowDel;
        if (ri < (obj[f.key] || []).length) obj[f.key].splice(ri, 1);
        save();
        rerender();
      });
      const add = root.querySelector(`[data-row-add="${f.key}"]`);
      add.onclick = () => {
        // the visible starter row counts as row one even before anything is typed in it
        ensureRow(Math.max(0, (obj[f.key] || []).length === 0 ? 0 : obj[f.key].length - 1));
        obj[f.key].push(f.columns.map(() => ""));
        save();
        rerender();
        const cells = root.querySelectorAll(`[data-table="${f.key}"] tbody tr:last-child input`);
        cells[0]?.focus();
      };
    }
  }
}

function descendants(collection, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of collection) if (e.parentId && out.has(e.parentId) && !out.has(e.id)) { out.add(e.id); grew = true; }
  }
  return out;
}

export { CODEX_KEYS };
