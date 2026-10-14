// Writing stats: words per day, the calendar heatmap, streaks, chapter lengths, overused words and
// the writing sprint history.

import { logStats, today, totalWords, allScenes, chapterWords, htmlToText, SCENE_STATUSES } from "../store.js";
import { $, $$, esc, fmt, plural } from "../ui.js";

const STOP = new Set(("a about above after again against all am an and any are as at be because been before being below between both but by " +
  "can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in " +
  "into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should " +
  "so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were " +
  "what when where which while who whom why will with would you your yours yourself yourselves said says say s t don didn wasn couldn wouldn " +
  "isn aren hadn hasn won i'm it's don't didn't i'd i'll you're he's she's that's there's can't couldn't wouldn't wasn't one back like got get " +
  "know went go going come came").split(" "));
const CRUTCH = ["very", "really", "just", "suddenly", "began to", "started to", "seemed", "somehow", "almost", "quite", "rather", "felt", "realized", "noticed"];

export function renderStats(ctx) {
  const { project: p, el } = ctx;
  const ls = logStats(p);
  const words = totalWords(p);
  const goalPct = ls.goal ? Math.min(100, Math.round((Math.max(0, ls.todayNet) / ls.goal) * 100)) : 0;

  // deadline pace
  let pace = "";
  if (p.goals.deadline && p.targetWords) {
    const daysLeft = Math.ceil((new Date(p.goals.deadline + "T23:59") - new Date()) / 86400000);
    const left = Math.max(0, p.targetWords - words);
    pace = daysLeft > 0
      ? `<div class="stat"><div class="n">${fmt(Math.ceil(left / daysLeft))}</div><div class="l">Words / day to hit ${esc(p.goals.deadline)} (${plural(daysLeft, "day")} left)</div></div>`
      : `<div class="stat"><div class="n">—</div><div class="l">Deadline passed</div></div>`;
  }

  const a = analyse(p);

  el.innerHTML = `
    <div class="page-head"><h2>Writing stats</h2><div class="grow"></div>
      <label class="inline-field">Daily goal <input type="number" id="goal" min="0" step="100" value="${p.goals.daily || 0}"></label>
      <label class="inline-field">Deadline <input type="date" id="deadline" value="${esc(p.goals.deadline)}"></label>
    </div>
    <div class="page-body"><div class="stats-page">
      <div class="stat-grid">
        <div class="stat"><div class="n">${fmt(ls.todayNet)}</div><div class="l">Today · +${fmt(ls.today.added)} / −${fmt(ls.today.removed)}</div>
          ${ls.goal ? `<div class="progress"><div style="width:${goalPct}%"></div></div><div class="l" style="margin-top:4px">${goalPct}% of ${fmt(ls.goal)} goal</div>` : ""}</div>
        <div class="stat"><div class="n">${ls.streak}<span class="faint" style="font-size:15px"> / best ${ls.best}</span></div><div class="l">Day streak</div></div>
        <div class="stat"><div class="n">${fmt(ls.week)}</div><div class="l">Last 7 days</div></div>
        <div class="stat"><div class="n">${fmt(ls.month)}</div><div class="l">Last 30 days</div></div>
        <div class="stat"><div class="n">${fmt(ls.avgPerActiveDay)}</div><div class="l">Avg per writing day (${plural(ls.activeDays, "day")})</div></div>
        <div class="stat"><div class="n">${dur(ls.today.seconds)}</div><div class="l">Writing time today · ${dur(ls.totalSeconds)} total</div></div>
        ${ls.wordsPerHour ? `<div class="stat"><div class="n">${fmt(ls.wordsPerHour)}</div><div class="l">Words per hour</div></div>` : ""}
        ${pace}
      </div>

      <div class="two-col">
        <div class="card">
          <h3 class="section-title">Net words per day · last 30 days</h3>
          <div class="chart" id="bar-chart"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Writing calendar · last 26 weeks</h3>
          <div class="chart" id="heatmap"></div>
        </div>
      </div>

      <div class="two-col">
        <div class="card">
          <h3 class="section-title">Manuscript</h3>
          <table class="kv">
            <tr><td>Words</td><td>${fmt(words)}${p.targetWords ? ` <span class="faint">of ${fmt(p.targetWords)} (${Math.round((words / p.targetWords) * 100)}%)</span>` : ""}</td></tr>
            <tr><td>Characters</td><td>${fmt(a.chars)} <span class="faint">(${fmt(a.charsNoSpaces)} without spaces)</span></td></tr>
            <tr><td>Paragraphs · sentences</td><td>${fmt(a.paragraphs)} · ${fmt(a.sentences)}</td></tr>
            <tr><td>Paperback pages (≈)</td><td>${fmt(Math.ceil(words / 275))}</td></tr>
            <tr><td>Reading time</td><td>${dur(Math.round((words / 250) * 60))}</td></tr>
            <tr><td>Avg sentence length</td><td>${a.avgSentence.toFixed(1)} words</td></tr>
            <tr><td>Avg word length</td><td>${a.avgWord.toFixed(2)} letters</td></tr>
            <tr><td>Reading ease (Flesch)</td><td>${a.flesch.toFixed(0)} <span class="faint">— ${fleschLabel(a.flesch)}</span></td></tr>
            <tr><td>Grade level</td><td>${a.grade.toFixed(1)}</td></tr>
            <tr><td>Dialogue</td><td>${a.dialoguePct.toFixed(0)}% of words</td></tr>
            <tr><td>-ly adverbs</td><td>${fmt(a.adverbs)} <span class="faint">(${a.words ? ((a.adverbs / a.words) * 100).toFixed(1) : 0}%)</span></td></tr>
            <tr><td>Longest sentence</td><td>${plural(a.longest, "word")}</td></tr>
          </table>
        </div>
        <div class="card">
          <h3 class="section-title">Most used words</h3>
          <div class="word-cloud">${a.top.map(([w, n]) => `<span class="wc-item" title="${n} times">${esc(w)} <b>${n}</b></span>`).join("") || `<span class="faint">Write something first.</span>`}</div>
          <h3 class="section-title" style="margin-top:18px">Crutch words</h3>
          <div class="word-cloud">${a.crutch.filter(([, n]) => n).map(([w, n]) => `<span class="wc-item warn">${esc(w)} <b>${n}</b></span>`).join("") || `<span class="faint">None found.</span>`}</div>
          ${a.mentions.length ? `<h3 class="section-title" style="margin-top:18px">Character mentions</h3>
            ${a.mentions.map(([name, n]) => `<div class="len-row"><span class="muted">${esc(name)}</span>
              <div class="progress" style="margin:0"><div style="width:${(n / a.mentions[0][1]) * 100}%"></div></div><span class="faint" style="text-align:right">${n}</span></div>`).join("")}` : ""}
        </div>
      </div>

      <div class="two-col">
      <div class="card">
        <h3 class="section-title">Chapters</h3>
        <table class="data-table">
          <thead><tr><th>Chapter</th><th class="num">Scenes</th><th class="num">Words</th><th class="num">Avg scene</th><th class="num">Share</th>
            ${SCENE_STATUSES.map(s => `<th class="num">${s}</th>`).join("")}</tr></thead>
          <tbody>${p.chapters.map((ch, i) => {
            const w = chapterWords(ch);
            return `<tr><td>${i + 1}. ${esc(ch.title)}</td><td class="num">${ch.scenes.length}</td><td class="num">${fmt(w)}</td>
              <td class="num">${ch.scenes.length ? fmt(Math.round(w / ch.scenes.length)) : "—"}</td>
              <td class="num">${words ? Math.round((w / words) * 100) : 0}%</td>
              ${SCENE_STATUSES.map(s => `<td class="num">${ch.scenes.filter(x => x.status === s).length || ""}</td>`).join("")}</tr>`;
          }).join("")}</tbody>
        </table>
      </div>

      <div class="card">
        <h3 class="section-title">Daily log</h3>
        <table class="data-table">
          <thead><tr><th>Date</th><th class="num">Added</th><th class="num">Removed</th><th class="num">Net</th><th class="num">Time</th><th class="num">Goal</th></tr></thead>
          <tbody>${Object.keys(p.log).sort().reverse().slice(0, 30).map(d => {
            const l = p.log[d], net = l.added - l.removed;
            return `<tr><td>${new Date(d + "T12:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td>
              <td class="num">+${fmt(l.added)}</td><td class="num">−${fmt(l.removed)}</td><td class="num"><b>${fmt(net)}</b></td>
              <td class="num">${dur(l.seconds)}</td><td class="num">${ls.goal ? (net >= ls.goal ? "✓ met" : `${Math.round((Math.max(0, net) / ls.goal) * 100)}%`) : ""}</td></tr>`;
          }).join("") || `<tr><td colspan="6" class="faint">No writing logged yet — words you type in the editor are counted here automatically.</td></tr>`}</tbody>
        </table>
      </div>
      </div>

      ${sprintCard(p)}
    </div></div>`;

  $("#goal").oninput = e => { p.goals.daily = +e.target.value || 0; ctx.save(); };
  $("#deadline").onchange = e => { p.goals.deadline = e.target.value; ctx.save(); renderStats(ctx); };
  barChart($("#bar-chart"), p, ls);
  heatmap($("#heatmap"), p);
}

function sprintCard(p) {
  const list = [...(p.sprints || [])].sort((a, b) => b.at - a.at);
  if (!list.length) return `<div class="card"><h3 class="section-title">Writing sprints</h3>
    <p class="muted small" style="margin:0">No sprints yet. Start one from the timer button above the editor: pick 10–60 minutes, write without stopping, and the words you add are recorded here.</p></div>`;
  const total = list.reduce((n, s) => n + s.words, 0), mins = list.reduce((n, s) => n + s.minutes, 0);
  const best = list.reduce((b, s) => (s.words / s.minutes > b.words / b.minutes ? s : b), list[0]);
  return `<div class="card">
    <h3 class="section-title">Writing sprints</h3>
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat"><div class="n">${list.length}</div><div class="l">Sprints</div></div>
      <div class="stat"><div class="n">${fmt(total)}</div><div class="l">Words in sprints</div></div>
      <div class="stat"><div class="n">${mins ? Math.round(total / mins) : 0}</div><div class="l">Avg words / min</div></div>
      <div class="stat"><div class="n">${Math.round(best.words / best.minutes)}</div><div class="l">Best words / min</div></div>
    </div>
    <table class="data-table">
      <thead><tr><th>When</th><th class="num">Minutes</th><th class="num">Words</th><th class="num">Words / min</th></tr></thead>
      <tbody>${list.slice(0, 15).map(s => `<tr>
        <td>${new Date(s.at).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
        <td class="num">${s.minutes}</td><td class="num">${s.words >= 0 ? "+" : "−"}${fmt(Math.abs(s.words))}</td>
        <td class="num">${s === best ? "<b>" : ""}${Math.round(s.words / s.minutes)}${s === best ? "</b>" : ""}</td></tr>`).join("")}</tbody>
    </table></div>`;
}

function dur(sec) {
  if (!sec) return "0m";
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function fleschLabel(f) {
  return f >= 80 ? "very easy" : f >= 70 ? "easy" : f >= 60 ? "plain English" : f >= 50 ? "fairly difficult" : f >= 30 ? "difficult" : "very difficult";
}

function syllables(w) {
  w = w.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const m = w.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}

function analyse(p) {
  const text = allScenes(p).map(({ scene }) => htmlToText(scene.content)).join("\n\n");
  const wordList = text.match(/[\p{L}\p{N}'’-]+/gu) || [];
  const words = wordList.length;
  const sentenceList = text.split(/(?<=[.!?…])["”’)]?\s+|\n+/).map(s => s.trim()).filter(s => /\p{L}/u.test(s));
  const sentences = Math.max(1, sentenceList.length);
  const syl = wordList.reduce((n, w) => n + syllables(w), 0);
  const letters = wordList.reduce((n, w) => n + w.replace(/['’-]/g, "").length, 0);
  const dialogue = (text.match(/[“"][^”"]*[”"]/g) || []).join(" ").match(/[\p{L}\p{N}'’-]+/gu)?.length || 0;

  const freq = new Map();
  for (const w of wordList) {
    const lw = w.toLowerCase().replace(/’/g, "'");
    if (lw.length < 3 || STOP.has(lw) || /^\d+$/.test(lw)) continue;
    freq.set(lw, (freq.get(lw) || 0) + 1);
  }
  const lower = " " + text.toLowerCase() + " ";
  const countPhrase = ph => (lower.match(new RegExp(`[^\\p{L}]${ph}[^\\p{L}]`, "gu")) || []).length;
  const mentions = p.characters.map(c => {
    const first = c.name.trim().split(/\s+/)[0];
    return [c.name, first && first.length > 1 ? countPhrase(first.toLowerCase()) : 0];
  }).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 12);

  const avgSentence = words / sentences;
  const sylPerWord = words ? syl / words : 0;
  return {
    words, chars: text.replace(/\n/g, "").length, charsNoSpaces: text.replace(/\s/g, "").length,
    paragraphs: allScenes(p).reduce((n, { scene }) => n + (scene.content.match(/<(p|h\d|blockquote|li)[\s>]/g) || []).length, 0),
    sentences: sentenceList.length, avgSentence: words ? avgSentence : 0, avgWord: words ? letters / words : 0,
    flesch: words ? 206.835 - 1.015 * avgSentence - 84.6 * sylPerWord : 0,
    grade: words ? Math.max(0, 0.39 * avgSentence + 11.8 * sylPerWord - 15.59) : 0,
    dialoguePct: words ? (dialogue / words) * 100 : 0,
    adverbs: wordList.filter(w => w.length > 4 && /ly$/i.test(w) && !/^(only|family|early|reply|holy|ugly|belly|bully|rally|silly|lily|jelly|supply|apply|fly|july|italy)$/i.test(w)).length,
    longest: sentenceList.reduce((m, s) => Math.max(m, (s.match(/[\p{L}\p{N}'’-]+/gu) || []).length), 0),
    top: [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
    crutch: CRUTCH.map(w => [w, countPhrase(w)]).sort((a, b) => b[1] - a[1]),
    mentions,
  };
}

// ---------------------------------------------------------------- charts

function tooltip(container) {
  let tip = $(".chart-tip", container);
  if (!tip) { tip = document.createElement("div"); tip.className = "chart-tip"; tip.hidden = true; container.appendChild(tip); }
  return {
    show(html, x, y) {
      tip.innerHTML = html;
      tip.hidden = false;
      const r = container.getBoundingClientRect();
      tip.style.left = Math.min(x - r.left + 12, r.width - tip.offsetWidth - 4) + "px";
      tip.style.top = y - r.top - tip.offsetHeight - 10 + "px";
    },
    hide() { tip.hidden = true; },
  };
}

function barChart(container, p, ls) {
  const days = [];
  const d = new Date();
  d.setDate(d.getDate() - 29);
  for (let i = 0; i < 30; i++) { days.push(today(d)); d.setDate(d.getDate() + 1); }
  const vals = days.map(k => Math.max(0, ls.net(k)));
  const goal = ls.goal;
  const max = Math.max(goal * 1.15, ...vals, 10);
  const W = Math.max(360, Math.round(container.clientWidth) || 900), H = 220, padL = 44, padB = 26, padT = 10;
  const bw = (W - padL) / days.length;
  const y = v => padT + (H - padT - padB) * (1 - v / max);
  const ticks = niceTicks(max);
  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="svg-chart" role="img" aria-label="Net words per day for the last 30 days">
      ${ticks.map(t => `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid"/>
        <text x="${padL - 8}" y="${y(t) + 4}" class="axis" text-anchor="end">${t >= 1000 ? (t / 1000) + "k" : t}</text>`).join("")}
      ${vals.map((v, i) => {
        const h = Math.max(0, y(0) - y(v));
        const x = padL + i * bw + 1;
        const w = bw - 2;
        const r = Math.min(4, w / 2, h);
        const path = h > 0 ? `M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + w - r} Q${x + w},${y(v)} ${x + w},${y(v) + r} V${y(0)} Z` : "";
        return `<g data-i="${i}"><rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}" class="hit"/>
          ${path ? `<path d="${path}" class="bar ${goal && v >= goal ? "met" : ""}"/>` : ""}</g>`;
      }).join("")}
      ${goal ? `<line x1="${padL}" x2="${W}" y1="${y(goal)}" y2="${y(goal)}" class="goal-line"/>
        <text x="${W - 4}" y="${y(goal) - 6}" class="axis" text-anchor="end">goal ${fmt(goal)}</text>` : ""}
      <line x1="${padL}" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="baseline"/>
      ${days.map((k, i) => (i % (W < 600 ? 7 : 5) === 0 && 29 - i >= (W < 600 ? 5 : 3)) || i === 29 ? `<text x="${padL + i * bw + bw / 2}" y="${H - 8}" class="axis" text-anchor="middle">${
        new Date(k + "T12:00").toLocaleDateString([], { day: "numeric", month: "short" })}</text>` : "").join("")}
    </svg>`;
  const tip = tooltip(container);
  $$("[data-i]", container).forEach(g => {
    g.onmousemove = e => {
      const i = +g.dataset.i, k = days[i], l = p.log[k];
      g.classList.add("hover");
      tip.show(`<b>${new Date(k + "T12:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}</b><br>
        ${l ? `${fmt(l.added - l.removed)} net · +${fmt(l.added)} / −${fmt(l.removed)}` : "No writing"}`, e.clientX, e.clientY);
    };
    g.onmouseleave = () => { g.classList.remove("hover"); tip.hide(); };
  });
}

function niceTicks(max) {
  const step = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000].find(s => max / s <= 4) || 20000;
  const out = [];
  for (let t = 0; t <= max; t += step) out.push(t);
  return out;
}

function heatmap(container, p) {
  // size the squares to the card so labels stay at normal text size instead of scaling up
  const weeks = 26, gap = 3, padL = 34, padT = 18;
  const avail = Math.max(300, Math.round(container.clientWidth) || 500);
  const cell = Math.max(9, Math.min(16, Math.floor((avail - padL) / (weeks + 1) - gap)));
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));
  // align start to a Monday
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const cells = [];
  const vals = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = today(d);
    const l = p.log[k];
    const v = l ? Math.max(0, l.added - l.removed) : 0;
    vals.push(v);
    cells.push({ k, v, col: Math.floor((d - start) / 86400000 / 7), row: (d.getDay() + 6) % 7 });
  }
  const goal = p.goals.daily || Math.max(...vals, 1);
  const level = v => (v <= 0 ? 0 : v < goal * 0.25 ? 1 : v < goal * 0.6 ? 2 : v < goal ? 3 : 4);
  const W = padL + (weeks + 1) * (cell + gap), H = padT + 7 * (cell + gap);
  let lastMonth = -1;
  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H + 24}" width="${W}" height="${H + 24}" class="svg-chart heat" style="width:${W}px;max-width:100%" role="img" aria-label="Writing calendar">
      ${["Mon", "", "Wed", "", "Fri", "", ""].map((l, i) => l ? `<text x="0" y="${padT + i * (cell + gap) + cell - 3}" class="axis">${l}</text>` : "").join("")}
      ${cells.map(c => {
        const d = new Date(c.k + "T12:00");
        let label = "";
        if (c.row === 0 && d.getMonth() !== lastMonth) {
          lastMonth = d.getMonth();
          label = `<text x="${padL + c.col * (cell + gap)}" y="${padT - 6}" class="axis">${d.toLocaleDateString([], { month: "short" })}</text>`;
        }
        return `${label}<rect data-k="${c.k}" data-v="${c.v}" x="${padL + c.col * (cell + gap)}" y="${padT + c.row * (cell + gap)}" width="${cell}" height="${cell}" rx="3" class="lv${level(c.v)}"/>`;
      }).join("")}
      <text x="${padL}" y="${H + 16}" class="axis">Less</text>
      ${[0, 1, 2, 3, 4].map(i => `<rect x="${padL + 34 + i * (cell + gap)}" y="${H + 16 - cell + 2}" width="${cell}" height="${cell}" rx="3" class="lv${i}"/>`).join("")}
      <text x="${padL + 40 + 5 * (cell + gap)}" y="${H + 16}" class="axis">${p.goals.daily ? "Goal met" : "More"}</text>
    </svg>`;
  const tip = tooltip(container);
  $$("rect[data-k]", container).forEach(r => {
    r.onmousemove = e => tip.show(`<b>${new Date(r.dataset.k + "T12:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</b><br>${plural(+r.dataset.v, "word")}`, e.clientX, e.clientY);
    r.onmouseleave = () => tip.hide();
  });
}
