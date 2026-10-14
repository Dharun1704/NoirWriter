// Two craft views shown under Plot & Timeline:
//  - Structure: a story-structure template laid over the manuscript, showing where each beat falls
//  - Story vs truth: reading order beside the true chronology, linked scene <-> event
// Writing by chapter, both work in whole chapters instead of scenes (see storyUnits in store.js).
import { countWords, sceneLabel, storyUnits, unitChoices, unitWord, byChapter } from "../store.js";
import { $, $$, esc, options } from "../ui.js";

// beat = [id, name, position in the book (%), what happens]
export const STRUCTURES = {
  "three-act": {
    name: "Three-act structure",
    blurb: "The classic shape: set-up, confrontation, resolution, turned by two plot points.",
    beats: [
      ["setup", "Set-up", 0, "Meet the protagonist, their world and what they want."],
      ["inciting", "Inciting incident", 12, "The event that knocks ordinary life off course."],
      ["pp1", "Plot point 1", 25, "The protagonist commits; there is no going back. Act two begins."],
      ["midpoint", "Midpoint", 50, "A reversal or revelation that raises the stakes."],
      ["pp2", "Plot point 2", 75, "The lowest point or a decisive discovery. Act three begins."],
      ["climax", "Climax", 88, "The final confrontation."],
      ["resolution", "Resolution", 97, "The new normal; loose ends tied."],
    ],
  },
  "save-the-cat": {
    name: "Save the Cat",
    blurb: "Blake Snyder's 15 beats, as a share of the whole book.",
    beats: [
      ["opening", "Opening image", 0, "A snapshot of the hero's life before the change."],
      ["theme", "Theme stated", 5, "Someone hints at the lesson the hero must learn."],
      ["setup", "Set-up", 8, "The hero's world, flaws and what is missing."],
      ["catalyst", "Catalyst", 10, "The life-changing event."],
      ["debate", "Debate", 15, "Should they go? Doubt and hesitation."],
      ["break2", "Break into Two", 20, "The hero chooses to act and enters a new world."],
      ["bstory", "B story", 22, "A new relationship that carries the theme."],
      ["fun", "Fun and games", 30, "The promise of the premise."],
      ["midpoint", "Midpoint", 50, "A false victory or false defeat; stakes rise."],
      ["badguys", "Bad guys close in", 62, "Pressure mounts inside and out."],
      ["allislost", "All is lost", 75, "The lowest point; something or someone dies."],
      ["darknight", "Dark night of the soul", 78, "The hero wallows, then finds the lesson."],
      ["break3", "Break into Three", 80, "The solution, using what was learned."],
      ["finale", "Finale", 90, "The plan is carried out; the hero is changed."],
      ["final", "Final image", 99, "The opposite of the opening image."],
    ],
  },
  "heros-journey": {
    name: "Hero's Journey",
    blurb: "Vogler's 12 stages of the monomyth.",
    beats: [
      ["ordinary", "Ordinary world", 0, "The hero at home, before the adventure."],
      ["call", "Call to adventure", 10, "A problem or challenge appears."],
      ["refusal", "Refusal of the call", 15, "Fear or doubt holds the hero back."],
      ["mentor", "Meeting the mentor", 20, "Advice, training or a gift."],
      ["threshold", "Crossing the threshold", 25, "The hero leaves the known world."],
      ["tests", "Tests, allies, enemies", 35, "Learning the rules of the new world."],
      ["approach", "Approach to the inmost cave", 50, "Preparing for the central ordeal."],
      ["ordeal", "The ordeal", 60, "The greatest challenge yet; a brush with death."],
      ["reward", "Reward", 70, "The hero seizes the prize."],
      ["roadback", "The road back", 75, "Consequences chase the hero home."],
      ["resurrection", "Resurrection", 90, "A final test that transforms the hero."],
      ["elixir", "Return with the elixir", 98, "Home again, changed, bringing something back."],
    ],
  },
  "mystery": {
    name: "Mystery / noir",
    blurb: "The crime-story shape: the body, the hunt, the false trails, the reveal.",
    beats: [
      ["crime", "The crime", 0, "The body, the theft, the disappearance — or its first shadow."],
      ["hook", "The detective is hooked", 8, "Someone takes the case, willingly or not."],
      ["investigation", "First investigation", 15, "Scene of the crime, first witnesses, first clues."],
      ["suspect", "First suspect", 25, "An obvious answer that will not hold."],
      ["herrings", "False trails", 35, "Red herrings, lies, a second line of inquiry."],
      ["revelation", "Midpoint revelation", 50, "A discovery that changes what the case is about."],
      ["stakes", "Stakes rise", 62, "A second crime, a threat, the detective in danger."],
      ["darkmoment", "Dark moment", 75, "The case collapses; the detective is wrong or beaten."],
      ["breakthrough", "Breakthrough", 85, "The overlooked clue clicks into place."],
      ["reveal", "Confrontation and reveal", 92, "The truth laid out; the culprit faces it."],
      ["aftermath", "Aftermath", 98, "What justice, or its absence, costs."],
    ],
  },
};

/** Each scene's (or chapter's) start / middle / end as a % of the book, by word count (or by count while words are few). */
function unitPositions(p) {
  const list = storyUnits(p);
  const words = list.map(u => u.scenes.reduce((n, s) => n + countWords(s.content), 0));
  const total = words.reduce((a, b) => a + b, 0);
  const useWords = total >= 500;
  const sizes = useWords ? words.map(w => Math.max(w, 1)) : list.map(() => 1);
  const sum = sizes.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return list.map((x, i) => {
    const start = (acc / sum) * 100;
    acc += sizes[i];
    return { ...x, start, end: (acc / sum) * 100, mid: (start + (acc / sum) * 100) / 2, byWords: useWords };
  });
}

// ---------------------------------------------------------------- structure

export function renderStructure(ctx, body) {
  const { project: p } = ctx;
  const pos = unitPositions(p);
  const unit = unitWord(p);
  const holding = sid => sid && pos.find(x => x.scenes.some(s => s.id === sid));   // the unit a linked scene sits in
  const tpl = STRUCTURES[p.structure.template] || STRUCTURES["three-act"];
  const assigned = p.structure.beats;
  if (!pos.length) { body.innerHTML = `<p class="list-hint">Add some ${unit}s in the Manuscript first.</p>`; return; }
  const at = pct => pos.find(x => pct >= x.start && pct < x.end) || pos.at(-1);
  const chapterSpans = p.chapters.map((ch, ci) => {
    const mine = pos.filter(x => x.chapter === ch);
    return mine.length ? { ch, ci, start: mine[0].start, end: mine.at(-1).end } : null;
  }).filter(Boolean);

  body.innerHTML = `
    <div class="structure">
      <div class="structure-head">
        <label class="field" style="margin:0"><span>Template</span>
          <select data-template>${Object.entries(STRUCTURES).map(([k, t]) => `<option value="${k}" ${t === tpl ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
        <p class="muted small">${esc(tpl.blurb)} Positions are measured by ${pos[0].byWords ? "word count" : `number of ${unit}s (until you have 500+ words)`}.</p>
      </div>

      <div class="beat-ruler" aria-label="Where each beat falls in the book">
        <div class="ruler-beats">${tpl.beats.map(([id, name, pct], i) => {
          const sc = holding(assigned[id]);
          return `<div class="ruler-beat ${i % 2 ? "low" : ""} ${sc ? "set" : ""}" style="left:${pct}%" title="${esc(name)} · ${pct}%">
            <span class="rb-label">${esc(name)}</span><span class="rb-tick"></span></div>`;
        }).join("")}</div>
        <div class="ruler-bar">${chapterSpans.map(c => `
          <div class="ruler-ch" style="left:${c.start}%;width:${c.end - c.start}%" title="${c.ci + 1}. ${esc(c.ch.title)}"><span>${c.ci + 1}</span></div>`).join("")}
          ${Object.entries(assigned).map(([beatId, sid]) => {
            const sc = holding(sid);
            return sc && tpl.beats.some(b => b[0] === beatId) ? `<span class="ruler-actual" style="left:${sc.mid}%" title="Your ${unit}: ${esc(sceneLabel(p, sid))}"></span>` : "";
          }).join("")}
        </div>
        <div class="ruler-scale"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
      </div>

      <table class="data-table beat-table">
        <thead><tr><th style="width:34%">Beat</th><th class="num" style="width:70px">Target</th><th>Falls in (by length)</th><th style="width:26%">Your ${unit}</th><th style="width:120px">Fit</th></tr></thead>
        <tbody>${tpl.beats.map(([id, name, pct, what]) => {
          const natural = at(pct);
          const mine = holding(assigned[id]);
          let fit = `<span class="faint small">not set</span>`;
          if (mine) {
            const diff = Math.round(mine.mid - pct);
            fit = Math.abs(diff) <= 5 ? `<span class="tag green">on target</span>`
              : `<span class="tag ${Math.abs(diff) > 15 ? "red" : "gold"}">${diff < 0 ? `${-diff}% early` : `${diff}% late`}</span>`;
          }
          return `<tr>
            <td><b>${esc(name)}</b><div class="faint small">${esc(what)}</div></td>
            <td class="num">${pct}%</td>
            <td><a data-open-scene="${natural.id}">${esc(natural.label)}</a></td>
            <td><select data-beat="${id}">${options(unitChoices(p, assigned[id]), assigned[id] || "", { empty: `— choose a ${unit} —` })}</select></td>
            <td>${fit}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>`;

  $("[data-template]", body).onchange = e => { p.structure.template = e.target.value; ctx.save(); renderStructure(ctx, body); };
  $$("[data-beat]", body).forEach(sel => sel.onchange = () => {
    if (sel.value) p.structure.beats[sel.dataset.beat] = sel.value; else delete p.structure.beats[sel.dataset.beat];
    ctx.save();
    renderStructure(ctx, body);
  });
  $$("[data-open-scene]", body).forEach(a => a.onclick = () => ctx.go("manuscript", a.dataset.openScene));
}

// ---------------------------------------------------------------- story order vs true chronology

export function renderCompare(ctx, body, { editEvent }) {
  const { project: p } = ctx;
  const units = storyUnits(p);       // scenes, or chapters when writing by chapter
  const unit = unitWord(p);
  const events = p.events;
  if (!units.length && !events.length) { body.innerHTML = `<p class="list-hint">Add ${unit}s and timeline events to compare them.</p>`; return; }
  const sceneIdx = id => units.findIndex(u => u.scenes.some(s => s.id === id));
  const links = events.map((e, ei) => ({ e, ei, si: sceneIdx(e.sceneId) })).filter(l => l.si >= 0);
  let crossings = 0;
  for (let a = 0; a < links.length; a++) for (let b = a + 1; b < links.length; b++) if (links[a].si > links[b].si) crossings++;
  const shown = links.length, offPage = events.length - shown;
  const linkedScenes = new Set(links.map(l => l.si));

  body.innerHTML = `
    <p class="compare-summary">${events.length
      ? `${shown} of ${events.length} events appear on the page${offPage ? ` · ${offPage} ${offPage === 1 ? "happens" : "happen"} off-page` : ""} · ${crossings
        ? `the story is told <b>out of order</b> in ${crossings} place${crossings === 1 ? "" : "s"} (crossing lines)`
        : "told in chronological order"}.`
      : "Add events on the Timeline tab, then link each one to the scene that shows it."}
      <span class="faint">Click an event to link it to a ${unit}.</span></p>
    <div class="compare">
      <div class="compare-col">
        <div class="section-title">As the reader meets it</div>
        ${units.map((u, i) => {
          const time = u.scenes[0].storyTime;
          // scene by scene, each chapter gets a heading above its first scene
          const heading = !byChapter(p) && u.chapter.scenes[0] === u.scenes[0] ? `<div class="cmp-chapter">${u.ci + 1}. ${esc(u.chapter.title)}</div>` : "";
          return `${heading}<div class="cmp-row cmp-scene ${linkedScenes.has(i) ? "linked" : ""}" data-si="${i}" data-scene-id="${u.id}">
            <span class="cmp-num">${u.num}</span><span class="cmp-title">${esc(u.title)}</span>
            ${time ? `<span class="cmp-when faint">${esc(time)}</span>` : ""}</div>`;
        }).join("")}
      </div>
      <svg class="compare-lines" aria-hidden="true"></svg>
      <div class="compare-col">
        <div class="section-title">As it really happened</div>
        ${events.map((e, ei) => {
          const arc = p.arcs.find(a => a.id === e.arcId);
          return `<div class="cmp-row cmp-event ${sceneIdx(e.sceneId) >= 0 ? "linked" : ""}" data-ei="${ei}" style="--arc:${arc ? arc.color : "var(--line-2)"}">
            <span class="cmp-when">${esc(e.when) || "—"}</span><span class="cmp-title">${esc(e.title)}</span>
            ${sceneIdx(e.sceneId) < 0 ? `<span class="offpage">${e.offPage ? "off-page" : "not shown"}</span>` : ""}</div>`;
        }).join("") || `<p class="faint small">No events yet.</p>`}
      </div>
    </div>`;

  const wrap = $(".compare", body), svg = $(".compare-lines", body);
  const draw = () => {
    if (!document.body.contains(svg)) return;
    const w = wrap.getBoundingClientRect(), sv = svg.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${sv.width} ${w.height}`);
    svg.style.height = w.height + "px";
    svg.innerHTML = links.map(l => {
      const a = $(`.cmp-scene[data-si="${l.si}"]`, body), b = $(`.cmp-event[data-ei="${l.ei}"]`, body);
      if (!a || !b) return "";
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const y1 = ra.top + ra.height / 2 - w.top, y2 = rb.top + rb.height / 2 - w.top, x2 = sv.width;
      const arc = p.arcs.find(x => x.id === l.e.arcId);
      return `<path data-link="${l.ei}" data-si="${l.si}" d="M0 ${y1} C ${x2 * 0.5} ${y1}, ${x2 * 0.5} ${y2}, ${x2} ${y2}"
        stroke="${arc ? arc.color : "var(--accent)"}" />`;
    }).join("");
  };
  draw();
  const ro = new ResizeObserver(() => draw());
  ro.observe(wrap);

  // hover: light up a scene, its event(s) and the line between them
  const lightUp = (si, ei) => {
    $$(".cmp-row.hot, .compare-lines path.hot", body).forEach(x => x.classList.remove("hot"));
    if (si == null && ei == null) return;
    links.filter(l => (si != null && l.si === si) || (ei != null && l.ei === ei)).forEach(l => {
      $(`.cmp-scene[data-si="${l.si}"]`, body)?.classList.add("hot");
      $(`.cmp-event[data-ei="${l.ei}"]`, body)?.classList.add("hot");
      $(`.compare-lines path[data-link="${l.ei}"]`, body)?.classList.add("hot");
    });
  };
  $$(".cmp-scene", body).forEach(r => {
    r.onmouseenter = () => lightUp(+r.dataset.si, null);
    r.onmouseleave = () => lightUp(null, null);
    r.onclick = () => ctx.go("manuscript", r.dataset.sceneId);
  });
  $$(".cmp-event", body).forEach(r => {
    r.onmouseenter = () => lightUp(null, +r.dataset.ei);
    r.onmouseleave = () => lightUp(null, null);
    r.onclick = () => editEvent(ctx, events[+r.dataset.ei], false);
  });
}
