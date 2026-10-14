// Overview: the project's title, logline and goals, progress, story warnings, which features are on,
// and the Backups card with "Restore an earlier version".

import { totalWords, allScenes, storyWarnings, clueStatus, countWords, logStats, hasFeature, api, flushSave } from "../store.js";
import { GENRES, GROUPS, FEATURES } from "../features.js";
import { $, $$, esc, fmt, plural, timeAgo, modal, confirmBox, confirmInline, toast } from "../ui.js";
import { icon } from "../icons.js";

export function featureChecklist(selected) {
  return Object.entries(GROUPS).map(([g, label]) => `
    <div class="feature-group">
      <div class="section-title">${esc(label)}</div>
      ${FEATURES.filter(f => f.group === g).map(f => `
        <label class="feature-opt">
          <input type="checkbox" value="${f.key}" ${selected.includes(f.key) ? "checked" : ""}>
          <span class="fi">${icon(f.icon, 18)}</span>
          <span><b>${esc(f.label)}</b><small>${esc(f.desc)}</small></span>
        </label>`).join("")}
    </div>`).join("");
}

export function renderOverview(ctx) {
  const { project: p, el } = ctx;
  const words = totalWords(p);
  const scenes = allScenes(p);
  const pct = p.targetWords ? Math.min(100, Math.round((words / p.targetWords) * 100)) : 0;
  const statusCount = s => scenes.filter(x => x.scene.status === s).length;
  const warnings = storyWarnings(p);
  const ls = logStats(p);
  const goalPct = ls.goal ? Math.min(100, Math.round((Math.max(0, ls.todayNet) / ls.goal) * 100)) : 0;

  el.innerHTML = `
    <div class="page-head"><h2>${GENRES[p.genre].overview || (p.genre === "fantasy" ? "The tome" : "Case file")}</h2></div>
    <div class="page-body"><div class="overview">
      <div class="stat-grid">
        <div class="stat"><div class="n">${fmt(words)}</div><div class="l">Words${p.targetWords ? ` of ${fmt(p.targetWords)} · ${pct}%` : ""}</div>
          ${p.targetWords ? `<div class="progress"><div style="width:${pct}%"></div></div>` : ""}</div>
        <div class="stat"><div class="n">${fmt(ls.todayNet)}</div><div class="l">Today${ls.goal ? ` · goal ${fmt(ls.goal)}` : ""}</div>
          ${ls.goal ? `<div class="progress"><div style="width:${goalPct}%"></div></div>` : ""}</div>
        <div class="stat"><div class="n">${ls.streak}<span class="faint" style="font-size:15px"> day${ls.streak === 1 ? "" : "s"}</span></div><div class="l">Writing streak</div></div>
        <div class="stat"><div class="n">${p.chapters.length} / ${scenes.length}</div><div class="l">Chapters / scenes</div></div>
        <div class="stat"><div class="n">${statusCount("final")}<span class="faint" style="font-size:15px"> / ${scenes.length}</span></div><div class="l">Scenes final</div></div>
        ${hasFeature(p, "clues") ? `<div class="stat"><div class="n">${p.clues.filter(c => clueStatus(p, c).label === "Resolved").length} / ${p.clues.length}</div><div class="l">Clues resolved</div></div>` : ""}
      </div>

      <div class="two-col">
        <div>
          <div class="card">
            <h3 class="section-title">The story</h3>
            <label class="field"><span>Title</span><input type="text" data-f="title" value="${esc(p.title)}"></label>
            <label class="field"><span>Logline</span><textarea data-f="logline" rows="2" placeholder="One sentence: who wants what, and what stands in the way.">${esc(p.logline)}</textarea></label>
            <div class="row">
              <label class="field"><span>Genre</span><select data-genre>${Object.entries(GENRES).map(([k, g]) =>
                `<option value="${k}" ${k === p.genre ? "selected" : ""}>${esc(g.label)}</option>`).join("")}</select></label>
              <label class="field"><span>Sub-genre</span><input type="text" data-f="genreLabel" value="${esc(p.genreLabel)}" placeholder="${p.genre === "fantasy" ? "Epic, grimdark, sword & sorcery..." : p.genre === "nonfiction" ? "Memoir, history, self-help, essays..." : "Noir, police procedural, cosy..."}"></label>
            </div>
            <div class="row">
              <label class="field"><span>Target words</span><input type="number" data-f="targetWords" min="0" step="1000" value="${p.targetWords || 0}"></label>
              <label class="field"><span>Daily goal</span><input type="number" data-goal="daily" min="0" step="100" value="${p.goals.daily || 0}"></label>
              <label class="field"><span>Deadline</span><input type="date" data-goal="deadline" value="${esc(p.goals.deadline)}"></label>
            </div>
            <label class="field"><span>Synopsis</span><textarea data-f="notes" rows="9" placeholder="${p.genre === "fantasy" ? "The world, the threat, the quest, the price, the ending..." : p.genre === "nonfiction" ? "The argument, the structure, what the reader walks away with..." : "The crime, the cover-up, the twist, the ending..."}">${esc(p.notes)}</textarea></label>
          </div>

          <div class="card">
            <h3 class="section-title">Chapter lengths</h3>
            ${p.chapters.map((ch, i) => {
              const w = ch.scenes.reduce((n, s) => n + countWords(s.content), 0);
              const max = Math.max(1, ...p.chapters.map(c => c.scenes.reduce((n, s) => n + countWords(s.content), 0)));
              return `<div class="len-row">
                <span class="muted">${i + 1}. ${esc(ch.title)}</span>
                <div class="progress" style="margin:0"><div style="width:${(w / max) * 100}%"></div></div>
                <span class="faint" style="text-align:right">${fmt(w)}</span></div>`;
            }).join("") || `<p class="muted">No chapters yet.</p>`}
          </div>
        </div>

        <div>
          <div class="card">
            <h3 class="section-title">Loose ends <span class="tag ${warnings.length ? "red" : "green"}">${warnings.length}</span></h3>
            ${warnings.length ? `<ul class="warn-list">${warnings.slice(0, 40).map(w => `
              <li><span class="tag">${esc(w.kind)}</span>
              <a data-goto="${w.view}" data-id="${esc(w.id)}">${esc(w.text)}</a></li>`).join("")}</ul>`
            : `<p class="muted">No loose ends found.</p>`}
          </div>

          <div class="card">
            <h3 class="section-title">Features</h3>
            <p class="muted" style="margin-top:0;font-size:13px">Switch tools on or off for this project. Switching one off only hides it — nothing you wrote is deleted.</p>
            <div id="features">${featureChecklist(p.features)}</div>
          </div>

          <div class="card">
            <h3 class="section-title">Backups</h3>
            <p class="muted" style="margin-top:0;font-size:13px">While you write, NoirWrite keeps a copy of this project at most every 5 minutes: the newest 30, plus one for each of the last 60 days. Each scene also keeps a daily automatic snapshot (see a scene's Snapshots).</p>
            <button class="btn" data-backups>${icon("history", 16)} Restore an earlier version…</button>
          </div>
        </div>
      </div>
    </div></div>`;

  $$("[data-f]", el).forEach(input => {
    input.oninput = () => {
      const f = input.dataset.f;
      p[f] = f === "targetWords" ? +input.value || 0 : input.value;
      if (f === "title") {
        $(".project-title .title-text").textContent = p.title;
        document.title = `${p.title} · NoirWrite`;
      }
      ctx.save();
    };
  });
  $$("[data-goal]", el).forEach(input => {
    input.oninput = () => {
      const k = input.dataset.goal;
      p.goals[k] = k === "daily" ? +input.value || 0 : input.value;
      ctx.save();
    };
  });
  $("[data-genre]", el).onchange = async e => {
    const g = e.target.value;
    const add = GENRES[g].defaults.filter(k => !p.features.includes(k));
    p.genre = g;
    if (add.length && await confirmBox("Switch genre", `Also switch on the ${GENRES[g].label} tools (${add.length} more)?`, "Switch on")) {
      p.features.push(...add);
    }
    ctx.save();
    ctx.rerender();
  };
  $("#features").onchange = () => {
    p.features = $$("#features input:checked", el).map(i => i.value);
    ctx.save();
    ctx.rerender();
  };
  $$("[data-goto]", el).forEach(a => a.onclick = () => ctx.go(a.dataset.goto, a.dataset.id));
  $("[data-backups]", el).onclick = () => openBackups(ctx);
}

function whenLabel(ms) {
  const d = new Date(ms), now = new Date(), y = new Date(now);
  y.setDate(now.getDate() - 1);
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today ${t}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday ${t}`;
  return `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${t}`;
}

/** List the project's backups and put one back. The version being replaced is backed up first. */
async function openBackups(ctx) {
  const p = ctx.project;
  await flushSave(p);                       // the newest work is on disk before anything is listed
  let items = [];
  try { items = await api.backups(p.id); } catch { return toast("Couldn't read the backups — is the server running?"); }
  const now = totalWords(p);
  const delta = n => {
    const d = n - now;
    return d === 0 ? "same length as now" : `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))} vs now`;
  };
  await modal({
    title: "Restore an earlier version",
    wide: true,
    body: items.length ? `
      <p class="muted" style="margin-top:0">Restoring replaces the whole project. The current version is backed up first, so you can always come back to it from this list.</p>
      <div class="version-list">${items.map(b => `
        <div class="version-row">
          <div class="v-main"><b>${whenLabel(b.savedAt)}</b>
            <span class="faint small">${timeAgo(b.savedAt)} · ${plural(b.wordCount || 0, "word")} (${delta(b.wordCount || 0)}) · ${plural(b.chapters, "chapter")}, ${plural(b.scenes, "scene")}</span></div>
          <button class="btn sm" data-restore="${esc(b.file)}" data-when="${esc(whenLabel(b.savedAt))}">Restore</button>
        </div>`).join("")}</div>`
      : `<p class="muted">No backups yet. The first one is made a few minutes after you start writing.</p>`,
    buttons: [{ label: "Close", kind: "sm", value: null }],   // small, to match the Restore buttons
    onMount: (root, close) => root.querySelectorAll("[data-restore]").forEach(b => b.onclick = async () => {
      if (!await confirmInline(b, `Replace the current version with ${b.dataset.when}?`, { yes: "Restore" })) return;
      try {
        const restored = await api.restoreBackup(p.id, b.dataset.restore);
        close(null);
        ctx.replaceProject(restored, `Restored the version from ${b.dataset.when}`);
      } catch (e) { toast(e.message); }
    }),
  });
}
