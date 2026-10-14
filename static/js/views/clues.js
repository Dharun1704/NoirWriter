// Thriller tools: the Clues table (planted → revealed → pays off, with warnings when the order is off)
// and the Suspects & Solution page.

import { newClue, clueStatus, unitChoices, sceneLabel, character, scenesForCharacter, hasFeature, CLUE_TYPES } from "../store.js";
import { $, $$, esc, plural, options, multiSelect, readMulti, modal, avatar, undoable, cardDelete, bindCardDeletes } from "../ui.js";
import { icon } from "../icons.js";

let typeFilter = "";

const SUSPECT_ROLES = ["Suspect", "Antagonist", "Villain", "Femme / Homme fatale"];

export function renderClues(ctx) {
  const { project: p, el } = ctx;
  const openClue = ctx.item ? p.clues.find(c => c.id === ctx.item) : null;
  ctx.item = "";

  el.innerHTML = `
    <div class="page-head">
      <h2>Clues</h2>
      <div class="grow"></div>
      <select id="type-filter" style="width:auto">${options(CLUE_TYPES.map(t => ({ id: t, name: t })), typeFilter, { empty: "All types" })}</select>
    </div>
    <div class="page-body" id="clue-body"></div>`;

  $("#type-filter").onchange = e => { typeFilter = e.target.value; renderClues(ctx); };
  renderTracker(ctx);

  if (openClue) {
    history.replaceState(null, "", `#/p/${p.id}/clues`);
    editClue(ctx, openClue, false);
  }
}

// ---------------------------------------------------------------- tracker

function renderTracker(ctx) {
  const { project: p } = ctx;
  const body = $("#clue-body");
  const clues = p.clues.filter(c => !typeFilter || c.type === typeFilter);
  const typeTag = t => ({ "Clue": "gold", "Red herring": "red", "Twist": "green", "Secret": "blue", "Open question": "" }[t] ?? "");
  body.innerHTML = `
    ${p.clues.length ? "" : `<p class="list-hint">Plant it, reveal it, pay it off. Track where each clue lands so nothing gets lost, and nothing comes out of nowhere.</p>`}
    <table class="clue-table">
      <colgroup><col style="width:30%"><col style="width:40%"><col style="width:26%"><col style="width:4%"></colgroup>
      <thead><tr><th class="c-clue">Clue</th><th class="c-track">Planted → Revealed → Pays off</th><th class="c-who">Who</th><th class="c-del"></th></tr></thead>
      <tbody>${clues.map(c => {
        const st = clueStatus(p, c);
        const step = (label, sceneId, idx, bad) => `
          <div class="step"><span class="bulb ${idx >= 0 ? (bad ? "bad" : "on") : ""}"></span>
          <span class="lbl"><b>${label}</b>${sceneId && idx >= 0 ? esc(shortLabel(p, sceneId)) : "—"}</span></div>`;
        const badReveal = st.ri >= 0 && st.pi >= 0 && st.ri < st.pi;
        const badPayoff = st.oi >= 0 && ((st.pi >= 0 && st.oi < st.pi) || (st.ri >= 0 && st.oi < st.ri));
        return `
        <tr class="click" data-clue="${c.id}">
          <td>
            <div class="clue-name">${esc(c.name)} <span class="tag ${typeTag(c.type)}">${esc(c.type)}</span></div>
            ${c.description ? `<div class="clue-desc">${esc(c.description)}</div>` : ""}
            ${st.problems.map(pr => `<div style="color:var(--red);font-size:12px;margin-top:4px">⚠ ${esc(pr)}</div>`).join("")}
          </td>
          <td><div class="track">
            ${step("Planted", c.plantedIn, st.pi, false)}<span class="wire"></span>
            ${step("Revealed", c.revealedIn, st.ri, badReveal)}<span class="wire"></span>
            ${step(c.type === "Red herring" ? "Debunked" : "Pays off", c.payoffIn, st.oi, badPayoff)}
          </div></td>
          <td><div class="chips">${c.characterIds.map(id => avatar(character(p, id), 26)).join("")}</div></td>
          <td class="row-del">${cardDelete(c.id, `Delete ${c.name}`)}</td>
        </tr>`;
      }).join("")}
        <tr class="add-row"><td colspan="4"><button class="add-tile wide" type="button" data-add>${icon("plus")}<span>New clue</span></button></td></tr>
      </tbody>
    </table>`;
  $$("[data-clue]", body).forEach(row => row.onclick = e => {
    if (e.target.closest(".card-actions, .confirm-inline")) return;
    editClue(ctx, p.clues.find(c => c.id === row.dataset.clue), false);
  });
  $("[data-add]", body).onclick = () => editClue(ctx, newClue(), true);
  bindCardDeletes(body, ctx, {
    describe: id => `“${p.clues.find(x => x.id === id)?.name || "clue"}”`,
    remove: id => { p.clues = p.clues.filter(x => x.id !== id); },
    after: () => renderTracker(ctx),
  });
}

function shortLabel(p, sceneId) {
  const full = sceneLabel(p, sceneId);
  return full.length > 26 ? full.slice(0, 25) + "…" : full;
}

async function editClue(ctx, c, isNew) {
  const { project: p } = ctx;
  const sceneSelect = (name, value, empty) => `<select name="${name}">${options(unitChoices(p, value), value, { empty })}</select>`;
  const r = await modal({
    title: isNew ? "New clue" : "Edit clue",
    wide: true,
    body: `
      <div class="row">
        <label class="field" style="flex:2"><span>Clue</span><input type="text" name="name" value="${esc(c.name)}" placeholder="Lipstick on the cigarette"></label>
        <label class="field"><span>Type</span><select name="type">${options(CLUE_TYPES.map(t => ({ id: t, name: t })), c.type)}</select></label>
      </div>
      <label class="field"><span>What the reader sees</span><textarea name="description" rows="2">${esc(c.description)}</textarea></label>
      <label class="field"><span>What it really means (the truth)</span><textarea name="truth" rows="2">${esc(c.truth)}</textarea></label>
      <div class="row">
        <label class="field"><span>Planted in</span>${sceneSelect("plantedIn", c.plantedIn, "— not yet —")}</label>
        <label class="field"><span>Revealed / noticed in</span>${sceneSelect("revealedIn", c.revealedIn, "— not yet —")}</label>
        <label class="field"><span>Pays off / debunked in</span>${sceneSelect("payoffIn", c.payoffIn, "— not yet —")}</label>
      </div>
      <label class="field"><span>Points to / involves</span>${multiSelect("chars", p.characters, c.characterIds)}</label>
      <label class="field"><span>Notes</span><textarea name="notes" rows="2">${esc(c.notes)}</textarea></label>`,
    buttons: [
      ...(isNew ? [] : [{ label: "Delete", value: "delete", left: true, kind: "danger", confirm: "Delete this clue?" }]),
      { label: "Cancel", value: null },
      { label: isNew ? "Add clue" : "Save", kind: "primary", value: "save" },
    ],
  });
  if (!r?.value) return;
  if (r.value === "delete") {
    return undoable(ctx, `Deleted “${c.name}”`, () => { p.clues = p.clues.filter(x => x !== c); }, () => renderClues(ctx));
  } else {
    const f = n => r.root.querySelector(`[name=${n}]`);
    c.name = f("name").value.trim() || "Untitled clue";
    for (const k of ["type", "description", "truth", "plantedIn", "revealedIn", "payoffIn", "notes"]) c[k] = f(k).value;
    c.characterIds = readMulti(r.root, "chars");
    if (isNew) p.clues.push(c);
  }
  ctx.save();
  renderClues(ctx);
}

// ---------------------------------------------------------------- suspects & solution

export function renderSuspects(ctx) {
  const { project: p, el } = ctx;
  el.innerHTML = `
    <div class="page-head"><h2>Suspects &amp; Solution</h2></div>
    <div class="page-body" id="clue-body"></div>`;
  const body = $("#clue-body");
  const suspects = p.characters.filter(c => SUSPECT_ROLES.includes(c.role) || p.mystery.culpritIds.includes(c.id));
  body.innerHTML = `
    <div class="card">
      <h3 class="section-title">The solution <span class="faint" style="text-transform:none;letter-spacing:0">— for your eyes only</span></h3>
      <label class="field"><span>Who did it</span>${multiSelect("culprits", p.characters, p.mystery.culpritIds)}</label>
      <label class="field"><span>What really happened</span>
        <textarea id="truth" rows="6" placeholder="The full truth, step by step, the way the detective lays it out at the end.">${esc(p.mystery.truth)}</textarea></label>
    </div>
    <h3 class="section-title">Suspects</h3>
    ${suspects.length ? `<div class="suspect-grid">${suspects.map(c => {
      const clueCount = p.clues.filter(x => x.characterIds.includes(c.id)).length;
      const isCulprit = p.mystery.culpritIds.includes(c.id);
      return `
      <div class="suspect" style="${isCulprit ? "border-color:var(--red)" : ""}">
        <h4>${avatar(c, 34)} <a data-char="${c.id}" style="cursor:pointer;color:var(--text)">${esc(c.name)}</a>
          ${isCulprit ? `<span class="tag red" style="margin-left:auto">Guilty</span>` : ""}</h4>
        <dl>
          <dt>Motive</dt><dd>${esc(c.motive) || `<span class="faint">unknown</span>`}</dd>
          <dt>Alibi</dt><dd>${esc(c.alibi) || `<span class="faint">none</span>`}</dd>
          <dt>Secret</dt><dd>${esc(c.secret) || `<span class="faint">—</span>`}</dd>
          <dt>Evidence</dt><dd>${hasFeature(p, "clues") ? `${plural(clueCount, "clue")} · ` : ""}${plural(scenesForCharacter(p, c.id).length, "scene")}</dd>
        </dl>
      </div>`;
    }).join("")}</div>`
    : `<div class="empty">No suspects yet. Give characters the role “Suspect”, “Antagonist” or “Femme / Homme fatale” and they'll line up here.</div>`}`;

  $("#truth").oninput = e => { p.mystery.truth = e.target.value; ctx.save(); };
  body.querySelector("[data-multi=culprits]")?.addEventListener("change", () => {
    p.mystery.culpritIds = readMulti(body, "culprits");
    ctx.save();
    renderSuspects(ctx);
  });
  $$("[data-char]", body).forEach(a => a.onclick = () => ctx.go("characters", a.dataset.char));
}
