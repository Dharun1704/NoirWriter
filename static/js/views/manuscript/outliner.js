// Outliner: a table of scenes (or chapters) whose synopsis, POV, status and target are edited in place.

import { newScene, countWords, chapterWords, findScene, SCENE_STATUSES } from "../../store.js";
import { icon } from "../../icons.js";
import { $, $$, esc, fmt, options, plural, inlineEdit } from "../../ui.js";
import { openScene, openChapter } from "../manuscript.js";
import { byChapter, chapterSynopsis, chapterStatus, chapterTarget } from "./state.js";
import { renderBinder } from "./binder.js";

export function renderOutliner(ctx) {
  const { project: p } = ctx;
  const body = $("#center-body");
  if (byChapter(p)) return renderChapterOutliner(ctx);
  body.innerHTML = `<div class="outliner-wrap"><table class="outliner">
    <thead><tr><th style="width:22%">Title</th><th>Synopsis</th><th style="width:130px">POV</th><th style="width:100px">Status</th>
      <th style="width:70px" class="num">Words</th><th style="width:80px" class="num">Target</th></tr></thead>
    <tbody>${p.chapters.map((ch, ci) => `
      <tr class="ch-row"><td colspan="4">${ci + 1}. ${esc(ch.title)} <span class="faint">· ${plural(ch.scenes.length, "scene")}</span></td>
        <td class="num">${fmt(chapterWords(ch))}</td><td></td></tr>
      ${ch.scenes.map(s => `
        <tr data-row="${s.id}">
          <td class="o-title"><a class="o-link" data-open="${s.id}" title="Open “${esc(s.title)}” · double-click to rename">${esc(s.title) || "Untitled scene"}</a><button class="icon-btn o-rename" data-rename="${s.id}" title="Rename" aria-label="Rename">${icon("pencil", 14)}</button></td>
          <td><textarea data-o="synopsis" rows="2">${esc(s.synopsis)}</textarea></td>
          <td><select data-o="povId" data-lazy-pov>${povOption(p, s.povId, "—")}</select></td>
          <td><select data-o="status" data-lazy-status><option selected>${s.status}</option></select></td>
          <td class="num">${fmt(countWords(s.content))}</td>
          <td><input type="number" data-o="target" min="0" step="100" value="${s.target || ""}"></td>
        </tr>`).join("")}`).join("")}
    </tbody></table></div>`;

  $$("[data-row]", body).forEach(row => {
    const s = findScene(p, row.dataset.row).scene;
    $$("[data-o]", row).forEach(inp => {
      inp[inp.tagName === "SELECT" ? "onchange" : "oninput"] = () => {
        const k = inp.dataset.o;
        s[k] = k === "target" ? +inp.value || 0 : inp.value;
        ctx.save();
        if (k === "title" || k === "status") renderBinder(ctx, null);
      };
    });
  });
  fillPovListsOnOpen(body, p);
  bindOutlinerTitles(body, id => findScene(p, id).scene, id => openScene(ctx, id), () => { ctx.save(); renderOutliner(ctx); renderBinder(ctx, null); });
}

// With hundreds of rows, every dropdown holding its full list (the whole cast for POV) is what makes the
// outliner slow to open; so each one starts with just its current choice and gets the list when opened.
const povOption = (p, id, empty) => {
  const c = p.characters.find(x => x.id === id);
  return c ? `<option value="${c.id}" selected>${esc(c.name)}</option>` : `<option value="">${esc(empty)}</option>`;
};
function fillPovListsOnOpen(body, p) {
  $$("select[data-lazy-pov]", body).forEach(sel => sel.addEventListener("dd-open", () => {
    sel.innerHTML = options(p.characters, sel.value, { empty: sel.dataset.empty || "—" });
  }, { once: true }));
  $$("select[data-lazy-status]", body).forEach(sel => sel.addEventListener("dd-open", () => {
    sel.innerHTML = SCENE_STATUSES.map(st => `<option ${st === sel.value ? "selected" : ""}>${st}</option>`).join("");
  }, { once: true }));
}

/** Outliner titles are links that open the scene / chapter; double-click or the pencil renames in place. */
function bindOutlinerTitles(body, item, open, after) {
  let timer = 0;
  $$(".o-link", body).forEach(a => {
    const id = a.dataset.open || a.dataset.openCh;
    a.onclick = () => { clearTimeout(timer); timer = setTimeout(() => open(id), 220); };
    a.ondblclick = () => { clearTimeout(timer); rename(a, id); };
  });
  $$("[data-rename]", body).forEach(b => b.onclick = () => rename($(".o-link", b.closest("td")), b.dataset.rename));
  const rename = (a, id) => inlineEdit(a, item(id).title, v => { item(id).title = v; after(); });
}

/** Chapter mode: one row per chapter. Status and POV apply to the whole chapter; a chapter made of
 *  several scenes shows their synopses together (edit them one by one in scene mode). */
function renderChapterOutliner(ctx) {
  const { project: p } = ctx;
  const body = $("#center-body");
  body.innerHTML = `<div class="outliner-wrap"><table class="outliner">
    <thead><tr><th style="width:22%">Chapter</th><th>Synopsis</th><th style="width:130px">POV</th><th style="width:100px">Status</th>
      <th style="width:70px" class="num">Words</th><th style="width:80px" class="num">Target</th></tr></thead>
    <tbody>${p.chapters.map((ch, ci) => {
      const one = ch.scenes.length <= 1, s = ch.scenes[0];
      const povs = new Set(ch.scenes.map(x => x.povId));
      return `
      <tr data-ch-row="${ch.id}">
        <td class="o-title"><span class="o-num">${ci + 1}.</span><a class="o-link" data-open-ch="${ch.id}" title="Open “${esc(ch.title)}” · double-click to rename">${esc(ch.title) || "Untitled chapter"}</a><button class="icon-btn o-rename" data-rename="${ch.id}" title="Rename" aria-label="Rename">${icon("pencil", 14)}</button></td>
        <td>${one ? `<textarea data-c="synopsis" rows="2">${esc(s?.synopsis || "")}</textarea>`
          : `<div class="o-joined" title="This chapter has ${ch.scenes.length} scenes: switch the binder to Scenes to edit each synopsis">${esc(chapterSynopsis(ch)) || `<span class="faint">${ch.scenes.length} scenes, no synopsis yet</span>`}</div>`}</td>
        <td><select data-c="povId" data-lazy-pov data-empty="${povs.size > 1 ? "Mixed" : "—"}">${povOption(p, povs.size === 1 ? [...povs][0] : "", povs.size > 1 ? "Mixed" : "—")}</select></td>
        <td><select data-c="status" data-lazy-status><option selected>${chapterStatus(ch)}</option></select></td>
        <td class="num">${fmt(chapterWords(ch))}</td>
        <td class="${one ? "" : "num o-sum"}">${one ? `<input type="number" data-c="target" min="0" step="100" value="${s?.target || ""}">` : `<span class="num faint">${chapterTarget(ch) ? fmt(chapterTarget(ch)) : "—"}</span>`}</td>
      </tr>`;
    }).join("")}
    </tbody></table></div>`;

  $$("[data-ch-row]", body).forEach(row => {
    const ch = p.chapters.find(c => c.id === row.dataset.chRow);
    $$("[data-c]", row).forEach(inp => {
      inp[inp.tagName === "SELECT" ? "onchange" : "oninput"] = () => {
        const k = inp.dataset.c;
        {
          if (!ch.scenes.length) ch.scenes.push(newScene("Scene 1"));
          // status and POV set the whole chapter; synopsis and target only exist here for one-scene chapters
          const targets = k === "status" || k === "povId" ? ch.scenes : [ch.scenes[0]];
          targets.forEach(s => { s[k] = k === "target" ? +inp.value || 0 : inp.value; });
        }
        ctx.save();
        if (k === "title" || k === "status") renderBinder(ctx, null);
      };
    });
  });
  fillPovListsOnOpen(body, p);
  bindOutlinerTitles(body, id => p.chapters.find(c => c.id === id), id => openChapter(ctx, p.chapters.find(c => c.id === id)),
    () => { ctx.save(); renderOutliner(ctx); renderBinder(ctx, null); });
}
