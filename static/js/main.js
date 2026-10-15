// NoirWrite: the app's entry point. Routes the address (#/ for home, #/p/<project>/<page>/<item>),
// loads the project, draws the sidebar shell around the current page, and handles saving status,
// the same project open in two windows, global search (Ctrl+K) and the sprint pill.

import {
  api, uid, scheduleSave, flushSave, hasPendingSave, onSaveState, clearConflict,
  saveState, totalWords, allScenes, hasFeature,
} from "./store.js";
import { GENRES, GROUPS, FEATURES, NOTES_FEATURE, peopleLabel } from "./features.js";
import { $, $$, esc, fmt, inlineEdit, modal, toast } from "./ui.js";
import { applyLayout, bindResizers, resizer, setTheme, getTheme, themeSwitch, bindThemeSwitch } from "./layout.js";
import { renderOverview } from "./views/overview.js";
import { renderHome, renderOffline, setRetry } from "./views/home.js";
import { renderManuscript, setPendingFind } from "./views/manuscript.js";
import { renderCharacters } from "./views/characters.js";
import { renderPlot } from "./views/plot.js";
import { renderClues, renderSuspects } from "./views/clues.js";
import { renderCodex } from "./views/codex.js";
import { renderMaps } from "./views/maps.js";
import { renderStats } from "./views/stats.js";
import { openCompile } from "./views/compile.js";
import { icon } from "./icons.js";
import "./dropdown.js";   // every <select> gets the themed dropdown
import { openSearch } from "./search.js";
import { onSprint, onSprintEnd, sprintState, stopSprint, remaining, mmss } from "./sprint.js";

const CUSTOM_VIEWS = { plot: renderPlot, clues: renderClues, suspects: renderSuspects, maps: renderMaps };

/** Navigation for a project: core pages + enabled features + always-on notes and stats. */
function viewsFor(p) {
  const views = [
    { key: "overview", label: "Overview", icon: "grid", render: renderOverview },
    { key: "manuscript", label: "Manuscript", icon: "pen", render: renderManuscript, count: p => allScenes(p).length },
    { key: "characters", label: peopleLabel(p.genre).plural, icon: "user", render: renderCharacters, count: p => p.characters.length },
  ];
  for (const group of Object.keys(GROUPS)) {
    const feats = FEATURES.filter(f => f.group === group && hasFeature(p, f.key));
    feats.forEach((f, i) => views.push({
      key: f.key, label: f.label, icon: f.icon, groupLabel: i === 0 ? GROUPS[group] : "",
      render: f.kind === "codex" ? ctx => renderCodex(ctx, f) : CUSTOM_VIEWS[f.key],
      count: f.kind === "codex" ? p => p.codex[f.key].length
        : f.key === "plot" ? p => p.events.length : f.key === "clues" ? p => p.clues.length
        : f.key === "maps" ? p => p.maps.length : null,
    }));
  }
  views.push(
    { key: "notes", label: NOTES_FEATURE.label, icon: NOTES_FEATURE.icon, groupLabel: "Desk",
      render: ctx => renderCodex(ctx, NOTES_FEATURE), count: p => p.codex.notes.length },
    { key: "stats", label: "Writing stats", icon: "barChart", render: renderStats },
  );
  return views;
}

const app = $("#app");
setTheme(getTheme());
setRetry(() => route());
applyLayout();
let project = null;

// ---------------------------------------------------------------- routing
// #/                         home
// #/p/<projectId>/<view>/<itemId?>

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] !== "p" || !parts[1]) return { home: true };
  return { projectId: parts[1], view: parts[2] || "overview", item: parts[3] || "" };
}

export function go(view, item = "") {
  if (!project) return route();
  location.hash = `#/p/${project.id}/${view}${item ? "/" + item : ""}`;
}

async function route() {
  const r = parseHash();
  if (r.home) {
    if (project && hasPendingSave()) await flushSave(project);
    project = null;
    shell = null;
    return renderHome();
  }
  if (!project || project.id !== r.projectId) {
    if (project && hasPendingSave()) await flushSave(project);
    try {
      project = await api.load(r.projectId);
    } catch (e) {
      if (e instanceof TypeError) return renderOffline();
      toast("That project couldn't be found");
      location.hash = "#/";
      return;
    }
  }
  renderProject(r.view, r.item);
}

window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", e => {
  if (project && hasPendingSave()) {
    flushSave(project);
    e.preventDefault();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && project && hasPendingSave()) flushSave(project);
  if (!document.hidden) checkForOutsideChanges();
});
window.addEventListener("focus", () => checkForOutsideChanges());

// ---------------------------------------------------------------- the same project open twice
// Every save carries a version number (`rev`). Coming back to this tab, we ask the server whether
// the file moved on; if this tab has nothing unsaved we quietly load the newer version, otherwise
// the save is refused and the writer chooses what to keep.

let conflictOpen = false;

async function checkForOutsideChanges() {
  if (!project || document.hidden || conflictOpen) return;
  try {
    const meta = await api.meta(project.id);
    if (!(meta.rev > (project.rev || 0))) return;
    if (hasPendingSave() || saveState.status === "error") await flushSave(project);   // will come back as a conflict
    else await reloadProject("Updated with changes made in another window");
  } catch { /* offline or deleted: the normal save path reports it */ }
}

async function reloadProject(message) {
  clearConflict();
  const r = parseHash();
  project = await api.load(project.id);
  renderProject(r.view, r.item);
  if (message) toast(message);
}

async function showConflict() {
  if (conflictOpen || !project) return;
  conflictOpen = true;
  const at = saveState.conflict?.updatedAt;
  const when = at ? new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "just now";
  const r = await modal({
    title: "This project changed in another window",
    body: `<p>“${esc(project.title)}” was saved from another tab or window at <b>${when}</b>, after this tab last loaded it.
      Nothing has been overwritten. Choose which version to keep:</p>
      <ul class="choice-list">
        <li><b>Load the newer version</b> — use what the other window saved. Changes made only in this tab are dropped.</li>
        <li><b>Keep this tab's version</b> — save this tab over it. The other version is kept in Backups.</li>
        <li><b>Save mine as a copy</b> — keep both: this tab's version becomes a separate project.</li>
      </ul>`,
    buttons: [
      { label: "Save mine as a copy", value: "copy", left: true },
      { label: "Load the newer version", value: "reload" },
      { label: "Keep this tab's version", kind: "primary", value: "mine" },
    ],
  });
  conflictOpen = false;
  if (r?.value === "reload") return reloadProject("Loaded the newer version");
  if (r?.value === "mine") {
    clearConflict();
    await flushSave(project, { force: true });
    return toast("Kept this tab's version — the other one is in Backups");
  }
  if (r?.value === "copy") {
    const copy = structuredClone(project);
    copy.id = (project.id.replace(/-[a-z0-9]{5}$/, "").slice(0, 44) + "-copy-" + uid().slice(-5)).replace(/-+/g, "-");
    copy.title = project.title + " (my copy)";
    copy.rev = 0;
    await api.save(copy);
    clearConflict();
    project = await api.load(project.id);   // the original tab now shows the newer saved version
    toast(`Saved as “${copy.title}”`);
    location.hash = `#/p/${copy.id}/overview`;
    return;
  }
  // dismissed: saving stays paused; the sidebar line reopens this dialog
}
const searchHere = () => openSearch(project, (view, id, { find } = {}) => {
  if (find) setPendingFind(find);
  go(view, id);
});

document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && project) {
    e.preventDefault();
    searchHere();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (project) flushSave(project).then(() => toast(saveState.status === "saved" ? "Saved" : "Save failed"));
  }
});

// ---------------------------------------------------------------- project shell

let views = [];
let shell = null;      // { project, key }: whose sidebar is on screen, so moving between pages can keep it

/**
 * Draw a project page inside the sidebar shell. The sidebar is kept when only the page or item
 * changes (no flicker, no lost scroll position); `fresh` rebuilds it (genre or features changed).
 */
function renderProject(viewKey, item, { fresh = false } = {}) {
  views = viewsFor(project);
  const view = views.find(v => v.key === viewKey) || views[0];
  document.title = `${project.title} · NoirWrite`;
  document.body.classList.remove("focus-mode");
  const key = project.genre + "|" + views.map(v => v.key + ":" + v.label).join(",");
  if (!fresh && shell && shell.project === project && shell.key === key && $("#main", app)) {
    $$("[data-view]", app).forEach(n => n.classList.toggle("active", n.dataset.view === view.key));
    refreshNavCounts();
  } else {
    shell = { project, key };
    renderShell(view);
  }
  view.render({
    project,
    el: $("#main"),
    item,
    go,
    save: (delay) => { scheduleSave(project, delay); refreshNavCounts(); },
    rerender: () => renderProject(view.key, item, { fresh: true }),
    replaceProject: (p, message) => { project = p; renderProject(view.key, "", { fresh: true }); if (message) toast(message); },
  });
}

/** The sidebar (project title, search, pages, sprint, save status, export, theme) around #main. */
function renderShell(view) {
  app.innerHTML = `
    <div class="shell">
      <nav class="nav">
        <div class="back" data-home>← All projects</div>
        <div class="project-title"><span class="title-text" data-rename-project title="Click to rename">${esc(project.title)}</span><small>${esc(GENRES[project.genre].label)}</small></div>
        <button class="nav-search" type="button" data-search title="Search this project (Ctrl+K)">${icon("search", 16)}<span>Search</span><kbd>Ctrl K</kbd></button>
        <div class="nav-scroll">
        ${views.map(v => `
          ${v.groupLabel ? `<div class="nav-group">${esc(v.groupLabel)}</div>` : ""}
          <div class="nav-item ${v === view ? "active" : ""}" data-view="${v.key}">
            <span class="ic">${icon(v.icon)}</span>${esc(v.label)}
            ${v.count ? `<span class="count">${v.count(project)}</span>` : ""}
          </div>`).join("")}
        </div>
        <div class="sprint-pill" id="sprint-pill" hidden></div>
        <div class="save-state" id="save-state"></div>
        <div class="nav-item" data-export><span class="ic">${icon("download")}</span>Compile & export</div>
        <div class="stats"><span><b id="total-words">${fmt(totalWords(project))}</b> words</span>${themeSwitch()}</div>
      </nav>
      ${resizer("nav", 1)}
      <main class="main" id="main"></main>
    </div>
    <div class="offline-banner" id="offline-banner" hidden>
      ⚠ Can't reach the NoirWrite server — is the NoirWriter.bat window still open? Your changes are safe in this tab and will save automatically once it's back.
    </div>`;
  $("[data-home]", app).onclick = () => (location.hash = "#/");
  $("[data-rename-project]", app).onclick = e => inlineEdit(e.currentTarget, project.title, title => {
    project.title = title;
    $("[data-rename-project]", app).textContent = title;
    document.title = `${title} · NoirWrite`;
    const field = $('[data-f="title"]', app);
    if (field) field.value = title;
    scheduleSave(project);
  });
  $$("[data-view]", app).forEach(n => n.onclick = () => go(n.dataset.view));
  $("[data-export]", app).onclick = () => openCompile(project);
  $("[data-search]", app).onclick = searchHere;
  paintSprint();
  bindResizers(app);
  bindThemeSwitch(app);
  applyLayout();
  updateSaveState(saveState);
}

function refreshNavCounts() {
  $$("[data-view]", app).forEach(n => {
    const v = views.find(x => x.key === n.dataset.view);
    const c = $(".count", n);
    if (v?.count && c) c.textContent = v.count(project);
  });
  const tw = $("#total-words");
  if (tw) tw.textContent = fmt(totalWords(project));
}

function updateSaveState(s) {
  const el = $("#save-state");
  const banner = $("#offline-banner");
  if (banner) banner.hidden = s.status !== "error";
  if (s.status === "conflict") showConflict();
  if (!el) return;
  el.className = "save-state " + s.status;
  el.textContent = s.status === "dirty" ? "● Saving…"
    : s.status === "error" ? "⚠ Not saved — server offline"
    : s.status === "conflict" ? "⚠ Not saved — changed in another window. Click to resolve"
    : s.lastSaved ? `✓ Saved ${s.lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "✓ All changes saved";
  el.onclick = s.status === "conflict" ? showConflict : null;
}
onSaveState(updateSaveState);

// ---------------------------------------------------------------- writing sprint pill + summary

function paintSprint() {
  const pill = $("#sprint-pill");
  if (!pill) return;
  const sp = sprintState();
  if (!sp || !project || sp.projectId !== project.id) { pill.hidden = true; return; }
  pill.hidden = false;
  const goal = sp.goal ? ` / ${fmt(sp.goal)}` : "";
  const pct = sp.goal ? Math.min(100, Math.round((Math.max(0, sp.words) / sp.goal) * 100)) : Math.round(100 - (remaining() / (sp.minutes * 60000)) * 100);
  pill.innerHTML = `
    <span class="sp-ic">${icon("timer", 15)}</span>
    <span class="sp-time">${mmss(remaining())}</span>
    <span class="sp-words">${sp.words >= 0 ? "+" : "−"}${fmt(Math.abs(sp.words))}${goal} words</span>
    <button class="icon-btn danger" data-stop-sprint title="End sprint now" aria-label="End sprint">${icon("x", 14)}</button>
    <span class="sp-bar"><span style="width:${pct}%"></span></span>`;
  $("[data-stop-sprint]", pill).onclick = () => stopSprint(true);
}
onSprint(paintSprint);

onSprintEnd(async result => {
  paintSprint();
  if (!result.recorded || !project || project.id !== result.projectId) return;
  const minutes = result.minutes;
  project.sprints.push({ at: result.startedAt, minutes, words: result.words });
  scheduleSave(project);
  const wpm = minutes ? Math.round(result.words / minutes) : 0;
  const hit = result.goal && result.words >= result.goal;
  const best = Math.max(...project.sprints.map(s => s.minutes ? s.words / s.minutes : 0));
  await modal({
    title: "Sprint finished",
    body: `<div class="sprint-summary">
        <div><span class="n">${result.words >= 0 ? "+" : "−"}${fmt(Math.abs(result.words))}</span><span class="l">words</span></div>
        <div><span class="n">${minutes}</span><span class="l">minutes</span></div>
        <div><span class="n">${wpm}</span><span class="l">words / min</span></div>
      </div>
      <p class="muted">${result.goal ? (hit ? `Goal of ${fmt(result.goal)} words reached.` : `Goal was ${fmt(result.goal)} words.`) : ""}
        ${wpm && wpm >= best ? " Your fastest sprint so far." : ""} Sprint history is on the Writing stats page.</p>`,
    buttons: [{ label: "Done", kind: "primary", value: null }],
  });
});

route();
