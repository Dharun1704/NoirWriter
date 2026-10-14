// The home page: the list of projects, the "Recently deleted" trash, importing a backup, and the
// New project dialog (fiction or non-fiction, then the kind of fiction, which pre-selects features).
// Also the page shown when the local server can't be reached.

import { api, newProject, normalize, uid } from "../store.js";
import { GENRES, KINDS } from "../features.js";
import { $, $$, esc, plural, inlineEdit, addTile, timeAgo, modal, confirmInline, toast, pickFile } from "../ui.js";
import { themeSwitch, bindThemeSwitch } from "../layout.js";
import { featureChecklist } from "./overview.js";
import { icon } from "../icons.js";

const app = document.getElementById("app");
let retry = () => location.reload();

/** main.js passes its router, so "Retry" on the offline page tries the current address again. */
export function setRetry(fn) { retry = fn; }

export function renderOffline() {
  app.innerHTML = `
    <div class="home"><h1 class="brand">Noir<span>Write</span></h1>
      <div class="card offline">
        <h3>Can't reach the NoirWrite server</h3>
        <p>Start it by double-clicking <b>NoirWriter.bat</b> in your NoirWriter folder (keep that window open), then press Retry.</p>
        <button class="btn primary" data-retry>Retry</button>
      </div></div>`;
  $("[data-retry]", app).onclick = retry;
}

export async function renderHome() {
  document.title = "NoirWrite";
  let projects;
  try { projects = await api.list(); } catch { return renderOffline(); }
  app.innerHTML = `
    <div class="home">
      <header class="home-header">
        <div class="home-title">
          <h1 class="brand">Noir<span>Write</span></h1>
          <p class="tagline">Every story has bones. Keep them in order.</p>
        </div>
        <div class="home-tools">
          <button class="btn" data-import title="Import a project backup (.json)">${icon("download")} Import</button>
          ${themeSwitch()}
        </div>
      </header>
      <div class="backup-line" id="backup-line"></div>
      ${projects.length ? `<div class="section-title home-count">Your projects · ${projects.length}</div>
      <div class="project-grid">${projects.map(p => `
        <div class="project-card" data-open="${esc(p.id)}">
          <span class="menu">
            <button class="icon-btn" data-rename="${esc(p.id)}" title="Rename" aria-label="Rename">${icon("pencil", 16)}</button>
            <button class="icon-btn danger" data-del="${esc(p.id)}" data-title="${esc(p.title)}" title="Delete" aria-label="Delete">${icon("trash", 16)}</button>
          </span>
          <span class="genre-badge">${esc(GENRES[p.genre]?.label || "Thriller / Crime")}</span>
          <h3 data-title-of="${esc(p.id)}">${esc(p.title)}</h3>
          <p>${esc(p.logline) || "No logline yet."}</p>
          <div class="meta"><span>${plural(p.wordCount || 0, "word")}</span><span>${timeAgo(p.updatedAt)}</span></div>
        </div>`).join("")}${addTile("New project", "data-new")}</div>`
      : `<div class="empty">The desk is empty.<br><button class="btn primary" data-new>Start your first project</button></div>`}
      <div class="home-foot" id="home-foot"></div>
    </div>`;
  showTrashLink();
  showBackupLine();

  bindThemeSwitch(app);
  $$("[data-new]", app).forEach(b => b.onclick = createProject);
  $("[data-import]", app).onclick = importProject;
  $$("[data-open]", app).forEach(card => card.onclick = () => (location.hash = `#/p/${card.dataset.open}/overview`));
  $$("[data-rename]", app).forEach(btn => btn.onclick = e => {
    e.stopPropagation();
    const id = btn.dataset.rename;
    const h3 = $(`[data-title-of="${id}"]`, app);
    inlineEdit(h3, h3.textContent, async title => {
      h3.textContent = title;
      try {
        const p = await api.load(id);
        p.title = title;
        p.updatedAt = Date.now();
        await api.save(p);
        toast("Renamed");
      } catch { toast("Couldn't rename — is the server running?"); renderHome(); }
    });
  });
  $$("[data-del]", app).forEach(btn => btn.onclick = async e => {
    e.stopPropagation();
    if (await confirmInline(btn, `Move “${btn.dataset.title}” to the trash?`)) {
      await api.remove(btn.dataset.del);
      renderHome();
    }
  });
}

// ---------------------------------------------------------------- backup folder
// The server can also copy every project to a folder of the writer's choosing (ideally one that
// syncs to OneDrive / Google Drive / Dropbox), so a book survives a broken drive.

async function showBackupLine() {
  let s;
  try { s = await api.settings(); } catch { return; }
  const line = $("#backup-line");
  if (!line) return;
  const when = s.status.lastAt ? timeAgo(s.status.lastAt) : "";
  if (!s.mirror) {
    line.className = "backup-line warn";
    line.innerHTML = `${icon("cloud", 16)}<span><b>Your books are saved only on this computer.</b> If its drive fails, they're gone. Keep a copy in a folder that syncs to the cloud.</span>
      <button class="btn sm primary" data-backup-folder>Choose a backup folder</button>`;
  } else if (s.status.error) {
    line.className = "backup-line bad";
    line.innerHTML = `${icon("cloud", 16)}<span title="${esc(s.status.error)}"><b>The backup folder can't be reached</b> (is the drive or cloud app connected?). Your work is still saved on this computer${when ? `; last copy ${when}` : ""}.</span>
      <button class="btn sm" data-backup-folder>Fix</button>`;
  } else {
    line.className = "backup-line ok";
    line.innerHTML = `${icon("cloud", 16)}<span title="${esc(s.folder)}">Also backed up${when ? ` (last copy ${when})` : ""} to <b>${esc(s.folder)}</b></span>
      <button class="btn sm ghost" data-backup-folder>Change</button>`;
  }
  $("[data-backup-folder]", line).onclick = () => backupFolderDialog(s);
}

async function backupFolderDialog(s, error = "") {
  let path = s.mirror || s.suggestions[0] || "";
  const r = await modal({
    title: "Backup folder",
    body: `
      <p class="muted" style="margin-top:0">NoirWrite keeps a copy of every project in this folder: updated a couple of minutes after you write,
        plus one copy per day for the last 30 days, and your images. Choose a folder that syncs to the cloud
        (OneDrive, Google Drive, Dropbox), and your books are safe even if this computer breaks.</p>
      ${s.suggestions.length ? `<div class="section-title">Cloud folders on this computer</div>
        <div class="folder-choices">${s.suggestions.map(f => `
          <button type="button" class="folder-choice ${f === path ? "on" : ""}" data-folder="${esc(f)}">${icon("cloud", 16)}<span>${esc(f)}</span></button>`).join("")}</div>`
        : `<p class="faint small">No OneDrive, Google Drive or Dropbox folder was found. Any folder works, for example on a USB drive or a second disk.</p>`}
      <label class="field"><span>Folder</span><input type="text" data-folder-path value="${esc(path)}" placeholder="C:\\Users\\you\\OneDrive"></label>
      <p class="faint small" style="margin:-6px 0 0">A folder called <b>NoirWrite Backup</b> is made inside it.</p>
      ${error ? `<p class="folder-error">${esc(error)}</p>` : ""}`,
    buttons: [
      ...(s.mirror ? [{ label: "Turn off", value: "off", left: true, kind: "sm" }] : []),
      { label: "Cancel", kind: "sm", value: null },
      { label: "Use this folder", kind: "sm primary", value: "save" },
    ],
    onMount: root => {
      const input = $("[data-folder-path]", root);
      $$("[data-folder]", root).forEach(b => b.onclick = () => {
        input.value = b.dataset.folder;
        $$("[data-folder]", root).forEach(x => x.classList.toggle("on", x === b));
      });
      input.oninput = () => $$("[data-folder]", root).forEach(x => x.classList.toggle("on", x.dataset.folder === input.value.trim()));
    },
  });
  if (!r?.value) return;
  const chosen = r.value === "off" ? "" : $("[data-folder-path]", r.root).value.trim();
  if (r.value === "save" && !chosen) return backupFolderDialog(s, "Type or pick a folder first.");
  try {
    const res = await api.saveSettings({ mirror: chosen });
    toast(chosen ? (res.ok ? "Backup folder set — your projects were copied there" : "Folder set, but some projects couldn't be copied") : "Backup folder turned off");
  } catch (e) {
    return backupFolderDialog({ ...s, mirror: s.mirror }, e.message);
  }
  showBackupLine();
}

async function showTrashLink() {
  let items = [];
  try { items = await api.trash(); } catch { return; }
  const foot = $("#home-foot");
  if (!foot || !items.length) return;
  foot.innerHTML = `<button class="btn ghost sm" data-trash>${icon("trash", 15)} Recently deleted · ${items.length}</button>`;
  $("[data-trash]", foot).onclick = () => trashDialog(items);
}

async function trashDialog(items) {
  await modal({
    title: "Recently deleted",
    wide: true,
    body: `<p class="muted" style="margin-top:0">Deleted projects stay here until you remove them from the <code>data/trash</code> folder.</p>
      <div class="version-list">${items.map(t => `
        <div class="version-row">
          <div class="v-main"><b>${esc(t.title || t.id)}</b>
            <span class="faint small">deleted ${timeAgo(t.deletedAt)} · ${plural(t.wordCount || 0, "word")} · ${plural(t.chapters, "chapter")}</span></div>
          <button class="btn sm" data-restore-trash="${esc(t.file)}">Restore</button>
        </div>`).join("")}</div>`,
    buttons: [{ label: "Close", kind: "sm", value: null }],   // small, to match the Restore buttons
    onMount: (root, close) => $$("[data-restore-trash]", root).forEach(b => b.onclick = async () => {
      b.disabled = true;
      try {
        const res = await api.restoreTrash(b.dataset.restoreTrash);
        close(null);
        toast(`Restored “${res.title}”`);
        renderHome();
      } catch (e) { toast(e.message); b.disabled = false; }
    }),
  });
}

async function createProject() {
  let kind = "fiction";
  let genre = "thriller";
  let lastFiction = "thriller";   // remembered if you hop to Non-fiction and back
  const card = (attr, key, g) => `
    <button type="button" class="genre-card" ${attr}="${key}">
      <span class="gi">${icon(g.icon, 22)}</span><b>${esc(g.label)}</b><small>${esc(g.blurb)}</small>
    </button>`;
  const r = await modal({
    title: "New project",
    wide: true,
    body: `
      <div class="section-title">What are you writing?</div>
      <div class="genre-pick">${Object.entries(KINDS).map(([k, g]) => card("data-kind-pick", k, g)).join("")}</div>
      <div class="subgenre" id="subgenre"><div class="subgenre-inner">
        <div class="section-title">What kind of fiction?</div>
        <div class="genre-pick">${KINDS.fiction.genres.map(k => card("data-genre-pick", k, GENRES[k])).join("")}</div>
      </div></div>
      <label class="field"><span>Title</span><input type="text" name="title" placeholder="Working title"></label>
      <label class="field"><span>Logline</span><textarea name="logline" rows="2" placeholder="One sentence: who wants what, and what stands in the way."></textarea></label>
      <div class="row">
        <label class="field"><span>Target word count</span><input type="number" name="target" value="90000" min="0" step="1000"></label>
        <label class="field"><span>Daily word goal</span><input type="number" name="daily" value="1000" min="0" step="100"></label>
      </div>
      <details class="feature-details">
        <summary>Features <span class="muted" id="feat-summary"></span></summary>
        <p class="muted" style="margin:8px 0 14px">The manuscript editor, characters (or people), notes and writing stats are always included. The tools below are pre-selected for your choice; change them any time from the project overview.</p>
        <div id="feature-list"></div>
      </details>`,
    buttons: [{ label: "Cancel", value: false }, { label: "Create project", kind: "primary", value: true }],
    onMount: root => {
      const paint = () => {
        $$("[data-kind-pick]", root).forEach(b => b.classList.toggle("on", b.dataset.kindPick === kind));
        $$("[data-genre-pick]", root).forEach(b => b.classList.toggle("on", b.dataset.genrePick === genre));
        $("#subgenre", root).classList.toggle("open", kind === "fiction");
        $("#feature-list", root).innerHTML = featureChecklist(GENRES[genre].defaults);
        $("#feat-summary", root).textContent = `— ${GENRES[genre].defaults.length} pre-selected for ${GENRES[genre].label}`;
        $("[name=target]", root).value = kind === "nonfiction" ? 60000 : 90000;
        $("[name=logline]", root).placeholder = kind === "nonfiction"
          ? "One sentence: what this book is about and why it matters."
          : "One sentence: who wants what, and what stands in the way.";
      };
      $$("[data-kind-pick]", root).forEach(b => b.onclick = () => {
        kind = b.dataset.kindPick;
        if (KINDS.fiction.genres.includes(genre)) lastFiction = genre;
        genre = kind === "fiction" ? lastFiction : "nonfiction";
        paint();
      });
      $$("[data-genre-pick]", root).forEach(b => b.onclick = () => { genre = b.dataset.genrePick; paint(); });
      paint();
    },
  });
  if (!r?.value) return;
  const title = $("[name=title]", r.root).value.trim() || "Untitled";
  const features = $$("#feature-list input:checked", r.root).map(i => i.value);
  const p = newProject({ title, genre, features });
  p.logline = $("[name=logline]", r.root).value.trim();
  p.targetWords = +$("[name=target]", r.root).value || 0;
  p.goals.daily = +$("[name=daily]", r.root).value || 0;
  await api.save(p);
  location.hash = `#/p/${p.id}/manuscript`;
}

async function importProject() {
  const file = await pickFile(".json,application/json");
  if (!file) return;
  try {
    const p = normalize(JSON.parse(await file.text()));
    if (!p.title || !Array.isArray(p.chapters)) throw new Error("Not a NoirWrite project");
    const existing = await api.list();
    if (!p.id || existing.some(x => x.id === p.id)) p.id = "import-" + uid();
    await api.save(p);
    toast(`Imported “${p.title}”`);
    renderHome();
  } catch (e) {
    toast("Import failed: " + e.message);
  }
}
