// Read-through: the whole book as one continuous, read-only text (double-click a passage to edit it).

import { totalWords } from "../../store.js";
import { $, $$, esc, plural } from "../../ui.js";
import { openScene } from "../manuscript.js";
import { prefs, editorStyle } from "./state.js";

export function renderReadThrough(ctx) {
  const { project: p } = ctx;
  const body = $("#center-body");
  const words = totalWords(p);
  body.innerHTML = `
    <div class="editor-scroll">
      <div class="page read-through" style="${editorStyle()}">
        <h1 class="rt-title">${esc(p.title)}</h1>
        <p class="faint" style="text-align:center">${plural(words, "word")} · about ${plural(Math.max(1, Math.round(words / 250)), "minute")} to read</p>
        ${p.chapters.map(ch => `
          <h2 class="rt-chapter">${esc(ch.title)}</h2>
          ${ch.scenes.map((s, i) => `
            ${i > 0 ? `<div class="rt-break">⁂</div>` : ""}
            <div class="rt-scene" data-open="${s.id}" title="Double-click to edit “${esc(s.title)}”">
              <div class="prose ${prefs.indent ? "indent" : ""}">${s.content || `<p class="faint"><i>${esc(s.title)} — not written yet.</i></p>`}</div>
            </div>`).join("")}`).join("")}
      </div>
    </div>`;
  $$("[data-open]", body).forEach(d => d.ondblclick = () => openScene(ctx, d.dataset.open));
}
