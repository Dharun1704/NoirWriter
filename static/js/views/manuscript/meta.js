// The scene-details panel beside the editor (synopsis, status, POV, characters, links, comments,
// snapshots, notes) and the breadcrumb under the scene title.

import { uid, countWords, cluesForScene, SCENE_STATUSES, character, hasFeature, findItem, CODEX_KEYS } from "../../store.js";
import { featureByKey } from "../../features.js";
import { icon } from "../../icons.js";
import { $, $$, esc, fmt, options, multiSelect, readMulti, modal, promptBox, toast } from "../../ui.js";
import { renderManuscript } from "../manuscript.js";
import { byChapter } from "./state.js";
import { openCompare } from "./compare.js";
import { chapterSnapshot, chapterSnapshotHtml, chapterSnapshotText, restoreChapterSnapshot } from "./content.js";
import { renderBinder } from "./binder.js";

export function renderEditorCrumb(ctx, current) {
  const crumb = $("#crumb");
  if (!crumb || !current) return;
  const p = ctx.project;
  const pov = character(p, current.scene.povId);
  const loc = findItem(p, current.scene.locationId)?.item;
  const ci = p.chapters.indexOf(current.chapter);
  const n = current.chapter.scenes.length;
  crumb.textContent = [
    byChapter(p) ? `Chapter ${ci + 1}` : current.chapter.title,
    byChapter(p) ? (n > 1 ? `Scene ${current.si + 1} of ${n}: ${current.scene.title}` : "") : `Scene ${current.si + 1}`,
    pov && `POV: ${pov.name}`,
    loc ? loc.name : current.scene.location, current.scene.storyTime,
  ].filter(Boolean).join(" · ");
}

export function renderMeta(ctx, current) {
  const { project: p } = ctx;
  const meta = $("#meta");
  if (!meta) return;
  if (!current) { meta.innerHTML = ""; return; }
  const s = current.scene;
  const clues = hasFeature(p, "clues") ? cluesForScene(p, s.id) : [];
  const events = hasFeature(p, "plot") ? p.events.filter(e => e.sceneId === s.id) : [];
  const prose = $("#prose");
  const comments = prose ? $$("span.comment", prose) : [];
  const links = s.links.map(id => findItem(p, id)).filter(Boolean);

  // snapshots belong to the scene, or (writing by chapter) to the whole chapter
  const chapterSnaps = byChapter(p);
  const ch = current.chapter;
  const what = chapterSnaps ? "chapter" : "scene";
  const snaps = chapterSnaps ? ch.snapshots : s.snapshots;
  const snapWords = sn => chapterSnaps ? sn.scenes.reduce((n, x) => n + countWords(x.content), 0) : countWords(sn.content);
  const scope = byChapter(p) && current.chapter.scenes.length > 1
    ? `<div class="meta-scope">Details for scene ${current.si + 1} of ${current.chapter.scenes.length} in this chapter · <b>${esc(s.title)}</b><span>They follow the scene your cursor is in.</span></div>` : "";
  meta.innerHTML = `${scope}
    <h4>Synopsis</h4>
    <textarea data-f="synopsis" rows="4" placeholder="What happens. What changes.">${esc(s.synopsis)}</textarea>
    <h4>Status</h4>
    <div class="status-pick">${SCENE_STATUSES.map(st => {
      const k = st.replace(/\s/g, "");
      return `<button data-status="${st}" class="${s.status === st ? "on" : ""}" style="--st:var(--st-${k})" aria-pressed="${s.status === st}">
        <span class="status-dot s-${k}"></span>${st}</button>`;
    }).join("")}</div>
    <div class="row" style="margin-top:14px">
      <label class="field"><span>Word target</span><input type="number" data-f="target" min="0" step="100" value="${s.target || ""}" placeholder="—"></label>
      <label class="field"><span>Story time</span><input type="text" data-f="storyTime" value="${esc(s.storyTime)}" placeholder="${p.genre === "fantasy" ? "Day 12 of the march" : "Tue, 11:40 pm"}"></label>
    </div>
    <h4>Point of view</h4>
    <select data-f="povId">${options(p.characters, s.povId, { empty: "— none —" })}</select>
    <h4>Characters in scene</h4>
    ${multiSelect("chars", p.characters, s.characterIds)}
    <h4>Location</h4>
    ${hasFeature(p, "locations") && p.codex.locations.length
      ? `<select data-f="locationId">${options(p.codex.locations, s.locationId, { empty: "— none —" })}</select>`
      : `<input type="text" data-f="location" value="${esc(s.location)}" placeholder="Where does it happen?">`}
    ${hasFeature(p, "plot") ? `<h4>Plot arcs</h4>${multiSelect("arcs", p.arcs, s.arcIds)}` : ""}
    <h4>Also in this scene <button class="btn sm add-btn ghost" data-link-items>+ Link</button></h4>
    ${links.length ? `<div class="chips">${links.map(({ item, key }) =>
      `<span class="chip" title="${esc(featureByKey(key)?.label || key)}">${featureByKey(key)?.icon ? icon(featureByKey(key).icon, 13) : ""} ${esc(item.name)}<button class="x" type="button" data-unlink="${item.id}" title="Unlink" aria-label="Unlink">${icon("x", 12)}</button></span>`).join("")}</div>`
      : `<div class="faint small">Link magic, artifacts, factions, notes…</div>`}
    ${hasFeature(p, "clues") ? `<h4>Clues in this scene</h4>
      ${clues.length ? clues.map(({ clue, stage }) => `
        <div class="linked"><span class="tag ${stage === "Planted" ? "gold" : stage === "Revealed" ? "blue" : "green"}">${stage}</span>
        <a data-clue="${clue.id}">${esc(clue.name)}</a></div>`).join("")
        : `<div class="faint small">None. Link clues from the Clues page.</div>`}` : ""}
    ${hasFeature(p, "plot") && events.length ? `<h4>Timeline events</h4>${events.map(ev =>
      `<div class="linked"><span class="faint">${esc(ev.when)}</span> ${esc(ev.title)}</div>`).join("")}` : ""}
    <h4>Comments (${comments.length})</h4>
    ${comments.length ? comments.map((c, i) => `
      <div class="comment-item" data-goto-comment="${i}">
        <div class="quote">“${esc(c.textContent.slice(0, 60))}${c.textContent.length > 60 ? "…" : ""}”</div>
        <div>${esc(c.dataset.note)}</div>
        <button class="icon-btn" data-resolve="${i}" title="Resolve (remove comment)" aria-label="Resolve comment">${icon("check", 15)}</button>
      </div>`).join("") : `<div class="faint small">Select text and press 💬 to comment.</div>`}
    <h4>${chapterSnaps ? "Chapter snapshots" : "Snapshots"} (${snaps.length}) <button class="btn sm add-btn ghost" data-snap title="Save a copy of the ${what} as it is now">+ Take</button></h4>
    ${snaps.length ? [...snaps].reverse().map(sn => `
      <div class="snap">
        <div><b>${esc(sn.name || "Snapshot")}</b>${sn.auto ? ` <span class="tag">auto</span>` : ""}<br><span class="faint">${new Date(sn.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · ${fmt(snapWords(sn))} w</span></div>
        <button class="btn sm" data-snap-compare="${sn.id}" title="See what changed since this snapshot">Compare</button>
      </div>`).join("") : `<div class="faint small">Save a copy of this ${what} before a big rewrite, then compare to see every change.</div>`}
    <h4>Scene notes</h4>
    <textarea data-f="notes" rows="5" placeholder="Research, reminders, things to fix...">${esc(s.notes)}</textarea>`;

  $$("[data-f]", meta).forEach(inp => {
    const ev = inp.tagName === "SELECT" ? "onchange" : "oninput";
    inp[ev] = () => {
      const k = inp.dataset.f;
      s[k] = k === "target" ? +inp.value || 0 : inp.value;
      ctx.save();
      renderEditorCrumb(ctx, current);
      if (k === "synopsis") $(`[data-scene="${s.id}"]`)?.setAttribute("title", s.synopsis);
      if (k === "target") $("#prose")?.dispatchEvent(new Event("input"));
    };
  });
  $$("[data-status]", meta).forEach(b => b.onclick = () => {
    s.status = b.dataset.status;
    ctx.save();
    renderMeta(ctx, current);
    renderBinder(ctx, current);
  });
  meta.onchange = e => {
    const ms = e.target.closest("[data-multi]");
    if (!ms) return;
    if (ms.dataset.multi === "chars") s.characterIds = readMulti(meta, "chars");
    if (ms.dataset.multi === "arcs") s.arcIds = readMulti(meta, "arcs");
    ctx.save();
  };
  $$("[data-clue]", meta).forEach(a => a.onclick = () => ctx.go("clues", a.dataset.clue));
  $$("[data-unlink]", meta).forEach(x => x.onclick = () => {
    s.links = s.links.filter(id => id !== x.dataset.unlink);
    ctx.save();
    renderMeta(ctx, current);
  });
  $("[data-link-items]", meta).onclick = () => linkPicker(ctx, current);

  $$("[data-goto-comment]", meta).forEach(item => item.onclick = e => {
    const c = comments[+item.dataset.gotoComment];
    if (e.target.closest("[data-resolve]")) {
      c.replaceWith(...c.childNodes);
      $("#prose").dispatchEvent(new Event("input"));
      renderMeta(ctx, current);
      return;
    }
    c.scrollIntoView({ block: "center", behavior: "smooth" });
    c.classList.add("flash");
    setTimeout(() => c.classList.remove("flash"), 1200);
  });

  $("[data-snap]", meta).onclick = async () => {
    const name = await promptBox(chapterSnaps ? "Take chapter snapshot" : "Take snapshot", "Snapshot name", `Before revision ${snaps.length + 1}`);
    if (!name) return;
    if (chapterSnaps) chapterSnapshot(ch, name);
    else s.snapshots.push({ id: uid(), at: Date.now(), name, content: s.content });
    ctx.save();
    renderMeta(ctx, current);
    toast(`Snapshot of the ${what} saved`);
  };
  $$("[data-snap-compare]", meta).forEach(b => b.onclick = async () => {
    await openCompare({
      what,
      startId: b.dataset.snapCompare,
      versions: chapterSnaps
        ? ch.snapshots.map(sn => ({ ...sn, html: chapterSnapshotHtml(sn.scenes), text: chapterSnapshotText(sn.scenes) }))
        : s.snapshots.map(sn => ({ ...sn, html: sn.content })),
      current: chapterSnaps
        ? { html: chapterSnapshotHtml(ch.scenes), text: chapterSnapshotText(ch.scenes) }
        : { html: s.content },
      onRestore: v => {
        if (chapterSnaps) restoreChapterSnapshot(p, ch, ch.snapshots.find(x => x.id === v.id));
        else {
          s.snapshots.push({ id: uid(), at: Date.now(), name: "Auto: before restoring " + (v.name || "snapshot"), content: s.content });
          s.content = v.html;
        }
        ctx.save();
        renderManuscript(ctx);
        toast("Restored — the text before restoring was saved as a snapshot");
      },
      onDelete: v => {
        if (chapterSnaps) ch.snapshots = ch.snapshots.filter(x => x.id !== v.id);
        else s.snapshots = s.snapshots.filter(x => x.id !== v.id);
        ctx.save();
        renderMeta(ctx, current);
        toast("Snapshot deleted");
      },
    });
  });
}

async function linkPicker(ctx, current) {
  const { project: p } = ctx;
  const s = current.scene;
  const groups = CODEX_KEYS.filter(k => hasFeature(p, k) && k !== "locations" && p.codex[k].length);
  if (!groups.length) return toast("Nothing to link yet — add notes, magic systems, artifacts etc. first");
  const r = await modal({
    title: "Link to this scene",
    wide: true,
    body: groups.map(k => `<div class="section-title with-icon" style="margin-top:12px">${icon(featureByKey(k).icon, 14)} ${esc(featureByKey(k).label)}</div>
      ${multiSelect("link-" + k, p.codex[k], s.links)}`).join(""),
    buttons: [{ label: "Cancel", value: false }, { label: "Save links", kind: "primary", value: true }],
  });
  if (!r?.value) return;
  const keep = s.links.filter(id => !groups.some(k => p.codex[k].some(e => e.id === id)));
  s.links = [...keep, ...groups.flatMap(k => readMulti(r.root, "link-" + k))];
  ctx.save();
  renderMeta(ctx, current);
}
