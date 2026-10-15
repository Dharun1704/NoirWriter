// NoirWrite's app tests. Each entry is [name, async t => { … }]; `t` is described in runner.js.
// They drive the real app in the frame like a person would (clicks, typing, keys, drags) and check
// both what's on screen and what the server saved. They run in order; most start from a fresh book.

import * as st from "/js/store.js";
import { FEATURES } from "/js/features.js";

const BOOK = "harness-book";
const P = `#/p/${BOOK}`;

// ---------------------------------------------------------------- the test book (always the same)

let n = 0;
const id = prefix => `${prefix}${String(++n).padStart(4, "0")}`;

async function seedBook({ writeBy = "scene" } = {}) {
  n = 0;
  const scene = (title, paras, extra = {}) => Object.assign(st.newScene(title), {
    id: id("sc"), content: paras.map(x => `<p>${x}</p>`).join(""), ...extra,
  });
  const p = st.newProject({ title: "Harness Book", genre: "thriller", features: FEATURES.map(f => f.key) });
  p.id = BOOK;
  const chars = ["Mara Quinn", "Leo Vance", "Iris Cole", "Dex Hollis"].map((nm, i) =>
    Object.assign(st.newCharacter(nm, i ? "Suspect" : "Protagonist"), { id: id("ch"), occupation: "Detective" }));
  chars[0].relationships.push({ targetId: chars[1].id, type: "ex-partner" });
  chars[1].relationships.push({ targetId: chars[0].id, type: "owes a debt" });
  chars[2].relationships.push({ targetId: chars[3].id, type: "lover" });
  chars.forEach((c, i) => { c.webPos = { x: 300 + i * 140, y: 200 + (i % 2) * 180 }; });
  p.characters = chars;
  const s1 = scene("Phone rings", ["The phone rang at three.", "Mara let it ring twice, quickly and quietly."],
    { synopsis: "A call wakes Mara.", povId: chars[0].id, status: "draft", characterIds: [chars[0].id] });
  const s2 = scene("The drive", ["Rain on the windscreen.", "The city slid past, slick and orange."], { synopsis: "She drives to the docks.", status: "revised" });
  const s3 = scene("Body", ["The body lay face down by the crane."], { synopsis: "They find the body.", status: "final", target: 500 });
  p.chapters = [
    { id: "chap1", title: "The Call", open: true, scenes: [s1, s2], snapshots: [] },
    { id: "chap2", title: "The Docks", open: true, scenes: [s3], snapshots: [] },
  ];
  p.arcs[0].id = "arc1";
  p.events = [
    Object.assign(st.newEvent(), { id: "ev1", title: "The murder", when: "Mon 1am", arcId: "arc1", sceneId: s3.id }),
    Object.assign(st.newEvent(), { id: "ev2", title: "The call", when: "Mon 3am", arcId: "arc1", sceneId: s1.id }),
  ];
  p.clues = [Object.assign(st.newClue(), { id: "cl1", name: "Torn ticket", description: "A ferry ticket.", plantedIn: s1.id, revealedIn: s3.id })];
  p.codex.locations = [
    Object.assign(st.newEntry("locations"), { id: "loc1", name: "The Docks", type: "City", description: "Wet and dark." }),
    Object.assign(st.newEntry("locations"), { id: "loc2", name: "Pier 9", type: "Town / village", parentId: "loc1" }),
  ];
  p.codex.magic = [Object.assign(st.newEntry("magic"), { id: "mag1", name: "Ember craft", type: "Hard magic" })];
  p.codex.notes = [Object.assign(st.newEntry("notes"), { id: "note1", name: "Research", body: "Tides." })];
  p.sprints = [{ at: Date.now() - 86400000, minutes: 25, words: 400 }];
  p.writeBy = writeBy;
  await st.api.save(p, { force: true });
  return { p, s1, s2, s3, chars };
}

const scenesOf = book => book.chapters.flatMap(c => c.scenes);

// ---------------------------------------------------------------- the look check: every page, both themes

async function tour(t, theme) {
  const { s1, s2, chars } = await seedBook();
  try { t.win.localStorage.clear(); } catch {}
  await t.load(`${P}/overview`);
  t.click(`[data-theme-pick="${theme}"]`);
  const shot = name => t.snapshot(`${theme}-${name}`);
  const esc = async () => { t.key("Escape"); await t.sleep(200); };
  await t.go("#/"); await shot("home");
  t.click("[data-new]"); await t.sleep(300); await shot("new-project"); t.$(".modal-backdrop")?.remove();
  await t.go(`${P}/overview`); await shot("overview");
  await t.go(`${P}/manuscript/${s1.id}`); await shot("write");
  t.click("[data-find]"); await shot("write-find"); t.click("[data-find-close]");
  t.click("[data-settings]"); await shot("settings-pop"); await esc();
  t.click('[data-drop="style"]'); await shot("style-menu"); await esc();
  t.click('[data-mode="corkboard"]'); await t.sleep(300); await shot("cork");
  t.click('[data-density="compact"]'); await shot("cork-compact"); t.click('[data-density="full"]');
  t.click('[data-mode="outliner"]'); await t.sleep(300); await shot("outliner");
  t.click("[data-read]"); await t.sleep(300); await shot("read"); t.click("[data-read]"); await t.sleep(300);
  t.click('[data-write-by="chapter"]'); await t.sleep(300); await shot("ch-outliner");
  t.click('[data-mode="corkboard"]'); await t.sleep(300); await shot("ch-cork");
  await t.go(`${P}/manuscript/${s2.id}`); await shot("ch-write");
  t.click('[data-write-by="scene"]'); await t.sleep(300);
  await t.go(`${P}/characters`); await shot("chars");
  t.click('[data-char-tab="web"]'); await t.sleep(800); await shot("chars-web"); t.click('[data-char-tab="cards"]');
  await t.go(`${P}/characters/${chars[0].id}`); await shot("char-detail");
  await t.go(`${P}/plot`); await shot("plot");
  t.click('[data-plot-tab="compare"]'); await t.sleep(300); await shot("plot-compare");
  t.click('[data-plot-tab="structure"]'); await t.sleep(300); await shot("plot-structure"); t.click('[data-plot-tab="timeline"]');
  await t.go(`${P}/clues`); await shot("clues");
  await t.go(`${P}/suspects`); await shot("suspects");
  await t.go(`${P}/locations`); await shot("locations");
  await t.go(`${P}/locations/loc1`); await shot("location-detail");
  await t.go(`${P}/magic/mag1`); await shot("magic-detail");
  await t.go(`${P}/notes`); await shot("notes");
  await t.go(`${P}/maps`); await shot("maps");
  await t.go(`${P}/stats`); await shot("stats");
  await t.go(`${P}/overview`); t.click("[data-search]"); await t.sleep(200); await shot("search"); await esc();
  t.click("[data-export]"); await t.sleep(200); await shot("export"); t.$(".modal-backdrop")?.remove();
  t.note("30 page states recorded");
}

// ---------------------------------------------------------------- tests

// ---------------------------------------------------------------- reading compiled files

/** The text files inside a ZIP (a .docx or .epub), by name. */
async function readZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer);
  const files = {};
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const method = view.getUint16(at + 8, true), size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true), extra = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(buf.slice(at + 30, at + 30 + nameLen));
    let data = buf.slice(at + 30 + nameLen + extra, at + 30 + nameLen + extra + size);
    if (method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    files[name] = new TextDecoder().decode(data);
    at += 30 + nameLen + extra + size;
  }
  return files;
}

const isXml = text => !!text && !new DOMParser().parseFromString(text, "application/xml").querySelector("parsererror");

export const TESTS = [
  ["Look check: Noir theme (30 pages)", t => tour(t, "dark")],
  ["Look check: Honey theme (30 pages)", t => tour(t, "sepia")],

  ["Write: typing saves, toolbar, find, settings, focus, style check, sprint", async t => {
    const { s1 } = await seedBook();
    await t.load(`${P}/manuscript/${s1.id}`);
    const prose = t.$("#prose");
    t.caretAtEnd(prose.lastElementChild);
    t.type(" A new sentence.");
    t.ok(await t.savedWhen(BOOK, b => scenesOf(b)[0].content.includes("A new sentence.")), "typing wasn't saved");
    t.eq(t.$("#status-bar b")?.textContent, String(st.countWords(prose.innerHTML)), "word count in the status bar");
    // paragraph style menu
    t.click('[data-drop="style"]'); await t.sleep(150);
    t.$('.popover [data-pick="h1"]').dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); await t.sleep(200);
    t.ok(prose.querySelector("h1") && !t.$(".popover"), "Heading 1 wasn't applied from the style menu");
    t.doc.execCommand("undo"); await t.sleep(100);
    // find
    t.click("[data-find]"); await t.sleep(150);
    const q = t.$("#find-q"); q.value = "rang"; q.dispatchEvent(new Event("input")); await t.sleep(150);
    t.eq(t.$("#find-count").textContent, "1 of 1", "find count");
    t.click("[data-find-close]");
    // settings: line spacing applies, reset restores it and keeps the view
    t.click("[data-settings]"); await t.sleep(150);
    const lh = t.$('.popover [data-p="lineHeight"]'); lh.value = 2.2; lh.dispatchEvent(new Event("input"));
    t.eq(t.win.getComputedStyle(t.$(".page")).getPropertyValue("--ed-lh").trim(), "2.2", "line spacing setting");
    t.click(".popover [data-reset]"); await t.sleep(300);
    const prefs = JSON.parse(t.win.localStorage.getItem("noirwriter:editorPrefs"));
    t.eq([prefs.lineHeight, prefs.mode], [1.8, "write"], "reset settings");
    // focus mode
    t.click("[data-focus]"); await t.sleep(200);
    t.ok(t.$(".ms.focus"), "focus mode didn't turn on");
    t.key("Escape"); await t.sleep(200);
    t.ok(!t.$(".ms.focus"), "Escape didn't leave focus mode");
    // style check
    t.click("[data-style-check]"); await t.sleep(500);
    t.ok(t.win.CSS.highlights?.has("style-adverb") && t.$(".style-legend"), "style check didn't mark the text");
    t.ok(/2 adverbs/.test(t.$(".style-legend").textContent), "the style check should count 2 adverbs (quickly, quietly)");
    t.click("[data-style-check]"); await t.sleep(200);
    // writing sprint: start, then cancel
    t.click("[data-sprint]"); await t.sleep(150);
    t.click(".popover [data-go]"); await t.sleep(300);
    t.ok(!t.$("#sprint-pill").hidden, "the sprint pill didn't appear");
    t.click("[data-sprint]"); await t.sleep(150);
    t.click(".popover [data-cancel-sprint]"); await t.sleep(300);
    t.ok(t.$("#sprint-pill").hidden, "the sprint didn't cancel");
    // details panel: status saves
    t.click(t.$$("#meta [data-status]").find(b => b.dataset.status === "final"));
    t.ok(await t.savedWhen(BOOK, b => scenesOf(b)[0].status === "final"), "status change wasn't saved");
  }],

  ["Binder: add a scene, rename, delete, Undo", async t => {
    await seedBook();
    await t.load(`${P}/manuscript`);
    const before = new Set(t.$$("[data-scene]").map(x => x.dataset.scene));
    t.click(t.$$("[data-add-scene]")[1]); await t.sleep(500);
    const newId = t.$$("[data-scene]").map(x => x.dataset.scene).find(x => !before.has(x));
    t.ok(newId, "no scene was added");
    t.click(`[data-scene-rename="${newId}"]`); await t.sleep(100);
    const ie = t.$(".inline-edit"); ie.value = "Renamed scene"; ie.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    t.ok(await t.savedWhen(BOOK, b => scenesOf(b).find(s => s.id === newId)?.title === "Renamed scene"), "rename wasn't saved");
    t.click(`[data-scene-del="${newId}"]`); await t.sleep(200);
    t.ok(/Deleted/.test(t.$("#toast").textContent), "no Undo message after deleting");
    t.ok(await t.savedWhen(BOOK, b => !scenesOf(b).some(s => s.id === newId)), "delete wasn't saved");
    t.click("#toast .toast-action");
    t.ok(await t.savedWhen(BOOK, b => scenesOf(b).some(s => s.id === newId)), "Undo didn't bring the scene back");
    // a scene with words asks first
    t.click(t.$$("[data-scene-del]")[0]); await t.sleep(150);
    t.ok(t.$(".confirm-row"), "deleting a scene with words didn't ask first");
    t.click(".confirm-row [data-keep]");
  }],

  ["Writing by chapter: scene break, merge with Undo, outliner, corkboard", async t => {
    await seedBook();
    await t.load(`${P}/manuscript`);
    t.click('[data-write-by="chapter"]'); await t.sleep(400);
    t.click('[data-open-ch="chap2"]');          // a single click waits a moment (a double-click renames instead)
    t.ok(await t.until(() => t.$("#scene-title")?.value === "The Docks"), "the chapter didn't open");
    const prose = t.$("#prose");
    t.caretAtEnd(prose.lastElementChild);
    t.click('[data-drop="insert"]'); await t.sleep(150);
    t.$('.popover [data-pick="break"]').dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); await t.sleep(150);
    t.type("A brand new scene.");
    t.ok(await t.savedWhen(BOOK, b => b.chapters[1].scenes.length === 2 && b.chapters[1].scenes[1].content.includes("brand new")), "the scene break didn't create a scene");
    prose.querySelector("hr.scene-split").remove(); prose.dispatchEvent(new Event("input")); await t.sleep(200);
    t.ok(/Removed the scene break/.test(t.$("#toast").textContent), "no message when a scene break was deleted");
    t.ok(await t.savedWhen(BOOK, b => b.chapters[1].scenes.length === 1), "deleting the break didn't merge the scenes");
    t.click("#toast .toast-action");
    t.ok(await t.savedWhen(BOOK, b => b.chapters[1].scenes.length === 2), "Undo didn't restore the scene break");
    await t.sleep(300);
    t.click('[data-mode="outliner"]'); await t.sleep(400);
    t.click('[data-rename="chap2"]'); await t.sleep(100);
    const ie = t.$(".o-title .inline-edit"); ie.value = "The Docks II"; ie.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); await t.sleep(300);
    await t.choose(t.$('[data-ch-row="chap2"] td:nth-child(4) .dd'), "revised");
    t.ok(await t.savedWhen(BOOK, b => b.chapters[1].title === "The Docks II" && b.chapters[1].scenes.every(s => s.status === "revised")), "outliner rename / chapter status wasn't saved");
    t.click('[data-mode="corkboard"]'); await t.sleep(400);
    t.eq(t.$$(".chapter-grid [data-card]").length, 2, "chapter cards on the corkboard");
    t.click('[data-mode="write"]'); await t.sleep(300);
    t.click('[data-write-by="scene"]'); await t.sleep(300);
  }],

  ["Snapshots: take, compare, restore (scene and chapter)", async t => {
    const { s1 } = await seedBook();
    await t.load(`${P}/manuscript/${s1.id}`);
    t.click("#meta [data-snap]"); await t.sleep(250);
    t.$(".modal input").value = "First draft";
    t.click(t.$$(".modal .btn").find(b => b.classList.contains("primary"))); await t.sleep(400);
    const prose = t.$("#prose");
    const r = t.doc.createRange(); r.selectNodeContents(prose.querySelector("p")); t.win.getSelection().removeAllRanges(); t.win.getSelection().addRange(r);
    t.type("The phone rang at four, long and shrill.");
    await t.sleep(500);
    t.click("#meta [data-snap-compare]"); await t.sleep(400);
    t.eq(t.$(".cmpv-stats").textContent.trim().replace(/\s+/g, " "), "+4 words −1 word 1 change", "compare summary");
    t.ok(t.$(".cmpv-text del")?.textContent === "three" && t.$(".cmpv-text ins")?.textContent.includes("four"), "compare doesn't mark the change");
    t.click(t.$$(".modal-foot .btn").find(b => b.textContent === "Restore older version"));
    t.ok(await t.savedWhen(BOOK, b => scenesOf(b)[0].content.includes("rang at three")), "restore didn't bring back the old text");
    t.ok(await t.savedWhen(BOOK, b => scenesOf(b)[0].snapshots.some(x => x.name.startsWith("Auto: before restoring"))), "restoring didn't keep the replaced text");
    // chapter snapshots
    t.click('[data-write-by="chapter"]'); await t.sleep(400);
    t.click('[data-open-ch="chap1"]');
    t.ok(await t.until(() => t.$("#scene-title")?.value === "The Call"), "the chapter didn't open");
    t.click("#meta [data-snap]"); await t.sleep(250);
    t.click(t.$$(".modal .btn").find(b => b.classList.contains("primary"))); await t.sleep(400);
    t.caretAtEnd(t.$("#prose").lastElementChild);
    t.type(" The wipers squeaked."); await t.sleep(500);
    t.click("#meta [data-snap-compare]"); await t.sleep(400);
    t.eq(t.$(".modal h3").textContent, "Compare chapter versions", "chapter compare title");
    t.click(t.$$(".modal-foot .btn").find(b => b.textContent === "Restore older version"));
    t.ok(await t.savedWhen(BOOK, b => !b.chapters[0].scenes.some(s => s.content.includes("wipers"))), "chapter restore didn't work");
    t.click('[data-write-by="scene"]'); await t.sleep(300);
  }],

  ["Corkboard: drag a card into another chapter, Undo", async t => {
    const { s2 } = await seedBook();
    await t.load(`${P}/manuscript`);
    t.click('[data-mode="corkboard"]'); await t.sleep(500);
    const card = t.$(`[data-card="${s2.id}"]`), target = t.$('[data-col="chap2"] [data-card]');
    const a = card.getBoundingClientRect(), b = target.getBoundingClientRect();
    card.dispatchEvent(new PointerEvent("pointerdown", { clientX: a.x + 40, clientY: a.y + 20, button: 0, bubbles: true }));
    for (let i = 1; i <= 15; i++) {
      t.pointer("pointermove", a.x + 40 + (b.x - a.x) * i / 15, a.y + 20 + (b.y - a.y - 10) * i / 15);
      await t.sleep(30);
    }
    await t.sleep(200);
    t.pointer("pointerup", b.x + 40, b.y + 10);
    t.ok(await t.savedWhen(BOOK, x => x.chapters[1].scenes.some(s => s.id === s2.id)), "the dragged card didn't move to the other chapter");
    t.click("#toast .toast-action");
    t.ok(await t.savedWhen(BOOK, x => x.chapters[0].scenes.some(s => s.id === s2.id)), "Undo didn't put the card back");
    t.click('[data-mode="write"]'); await t.sleep(300);
  }],

  ["Reorder chapters: drag, keyboard, Undo, Done", async t => {
    await seedBook();
    await t.load(`${P}/manuscript`);
    t.click("[data-reorder]"); await t.sleep(300);
    t.eq(t.$$(".reorder-row").length, 2, "reorder rows");
    const row = t.$('[data-rch="chap2"]'), r = row.getBoundingClientRect();
    row.dispatchEvent(new PointerEvent("pointerdown", { clientX: r.x + 50, clientY: r.y + 10, button: 0, bubbles: true }));
    for (let y = r.y + 5; y > r.y - 60; y -= 20) { t.pointer("pointermove", r.x + 50, y); await t.sleep(16); }
    t.pointer("pointerup", r.x + 50, r.y - 60);
    t.ok(await t.savedWhen(BOOK, b => b.chapters[0].id === "chap2"), "dragging didn't reorder the chapters");
    t.click("#toast .toast-action");
    t.ok(await t.savedWhen(BOOK, b => b.chapters[0].id === "chap1"), "Undo didn't restore the order");
    await t.sleep(300);
    t.$('[data-rch="chap1"]').dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }));
    t.ok(await t.savedWhen(BOOK, b => b.chapters[1].id === "chap1"), "Alt+Down didn't move the chapter");
    t.click("[data-done]"); await t.sleep(300);
    t.ok(!t.$(".reorder-list") && t.$("[data-ch-title]"), "Done didn't return to the binder");
    t.ok(!t.$("[data-ch-up]"), "the old up/down arrows are back");
  }],

  ["Outliner: dropdowns fill when opened, and save", async t => {
    await seedBook();
    await t.load(`${P}/manuscript`);
    t.click('[data-mode="outliner"]'); await t.sleep(400);
    const row = t.$$("[data-row]")[1];
    t.eq(row.querySelectorAll("select[data-o=povId] option").length, 1, "POV list should start with just the current choice");
    await t.choose(row.querySelector("td:nth-child(3) .dd"), "Iris Cole");
    t.ok(await t.savedWhen(BOOK, b => scenesOf(b).find(s => s.id === row.dataset.row).povId === "ch0003"), "POV choice wasn't saved");
    await t.choose(row.querySelector("td:nth-child(4) .dd"), "final");
    t.ok(await t.savedWhen(BOOK, b => scenesOf(b).find(s => s.id === row.dataset.row).status === "final"), "status choice wasn't saved");
    const syn = row.querySelector("textarea"); syn.value = "New synopsis."; syn.dispatchEvent(new Event("input"));
    t.ok(await t.savedWhen(BOOK, b => scenesOf(b).find(s => s.id === row.dataset.row).synopsis === "New synopsis."), "synopsis wasn't saved");
    t.click('[data-mode="write"]'); await t.sleep(300);
  }],

  ["Themed dropdowns, checkboxes and keyboard", async t => {
    const { s1 } = await seedBook();
    await t.load(`${P}/manuscript/${s1.id}`);
    t.eq(t.$$("select").filter(s => !s.classList.contains("dd-native")).length, 0, "every select should be themed");
    const pov = t.$("#meta .dd");
    pov.focus(); pov.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); await t.sleep(100);
    t.ok(t.$(".dd-menu"), "ArrowDown didn't open the dropdown");
    t.win.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    t.win.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await t.sleep(200);
    t.eq(pov.textContent.trim(), "Leo Vance", "keyboard choice");
    t.ok(await t.savedWhen(BOOK, b => scenesOf(b)[0].povId === "ch0002"), "keyboard POV choice wasn't saved");
    // the default-font dropdown inside the font menu keeps the menu open
    t.click('[data-drop="font"]'); await t.sleep(150);
    await t.choose(t.$(".popover .dd"), "EB Garamond");
    t.ok(t.$(".popover:not(.dd-menu)"), "choosing the default font closed the font menu");
    t.eq(JSON.parse(t.win.localStorage.getItem("noirwriter:editorPrefs")).font, "EB Garamond", "default font");
    t.key("Escape"); await t.sleep(100);
    // checkboxes match the theme
    t.click("[data-settings]"); await t.sleep(150);
    const boxes = t.$$('.popover input[type="checkbox"]');
    t.ok(boxes.length === 3 && boxes.every(b => t.win.getComputedStyle(b).appearance === "none" && b.offsetWidth === 16), "settings checkboxes aren't themed 16px boxes");
    t.key("Escape");
  }],

  ["Folding switchers show only the active choice", async t => {
    await seedBook();
    await t.load(`${P}/manuscript`);
    const visible = sel => t.$$(`${sel} button`).filter(b => b.offsetWidth > 2).map(b => b.textContent);
    t.eq(visible(".seg-modes"), ["Write"], "view switcher folded");
    t.eq(visible(".write-by"), ["Scenes"], "Chapters/Scenes switcher folded");
    t.eq(t.$$(".write-by button").map(b => b.textContent), ["Chapters", "Scenes"], "Chapters comes first");
    t.$(".seg-modes button.on").focus(); await t.sleep(400);
    t.eq(visible(".seg-modes"), ["Write", "Corkboard", "Outliner"], "keyboard focus opens the switcher");
    t.click('[data-mode="corkboard"]'); await t.sleep(400);
    t.$(".seg-modes button.on")?.blur(); t.$(".seg-modes")?.classList.remove("open"); await t.sleep(400);
    t.eq(visible(".seg-modes"), ["Corkboard"], "after choosing, the switcher folds to the new view");
    const thumb = t.$(".seg-modes .seg-thumb"), on = t.$(".seg-modes button.on");
    t.eq(thumb.style.left, on.offsetLeft + "px", "highlight sits on the active view");
    t.click("[data-read]"); await t.sleep(300);
    t.eq(visible(".seg-modes").length, 3, "in Read-through the switcher shows every view");
    t.click("[data-read]"); await t.sleep(300);
    t.click('[data-mode="write"]'); await t.sleep(300);
  }],

  ["Search (Ctrl+K) opens the scene at the match", async t => {
    await seedBook();
    await t.load(`${P}/overview`);
    t.key("k", { ctrlKey: true }); await t.sleep(200);
    const input = t.$(".search-input input"); input.value = "crane"; input.dispatchEvent(new Event("input")); await t.sleep(200);
    t.ok(t.$$(".search-item").length >= 1, "no search results");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await t.sleep(800);
    t.eq(t.$("#scene-title")?.value, "Body", "the found scene");
    t.ok(t.$("#find-bar") && !t.$("#find-bar").hidden && t.$("#find-count").textContent === "1 of 1", "the find bar didn't show the match");
  }],

  ["Plot: timeline, story vs truth, structure, in scenes and chapters", async t => {
    await seedBook();
    await t.load(`${P}/plot`);
    t.eq(t.$$(".t-card .chip").map(c => c.textContent.trim()).filter(x => x.startsWith("↳")), ["↳ Ch 2.1 · Body", "↳ Ch 1.1 · Phone rings"], "timeline scene labels");
    t.click('[data-plot-tab="compare"]'); await t.sleep(400);
    t.eq(t.$$(".cmp-scene").length, 3, "story vs truth rows");
    t.eq(t.$$(".compare-lines path").length, 2, "story vs truth lines");
    t.click('[data-plot-tab="structure"]'); await t.sleep(400);
    await t.choose(t.$$(".beat-table .dd")[3], "Ch 2.1 · Body");
    t.ok(await t.savedWhen(BOOK, b => Object.values(b.structure.beats).includes("sc0007")), "beat assignment wasn't saved");
    t.eq(t.$$(".ruler-actual").length, 1, "the beat's dot on the ruler");
    // writing by chapter: the same pages talk in chapters
    await t.go(`${P}/manuscript`); t.click('[data-write-by="chapter"]'); await t.sleep(300);
    await t.go(`${P}/plot`); t.click('[data-plot-tab="timeline"]'); await t.sleep(300);
    t.eq(t.$$(".t-card .chip").map(c => c.textContent.trim()).filter(x => x.startsWith("↳")), ["↳ Ch 2 · The Docks", "↳ Ch 1 · The Call"], "timeline chapter labels");
    t.click('[data-plot-tab="compare"]'); await t.sleep(400);
    t.eq(t.$$(".cmp-scene").length, 2, "story vs truth lists chapters");
    await t.go(`${P}/manuscript`); t.click('[data-write-by="scene"]'); await t.sleep(300);
  }],

  ["Characters: web, delete with Undo, keep saving afterwards", async t => {
    await seedBook();
    await t.load(`${P}/characters`);
    t.click('[data-char-tab="web"]'); await t.sleep(600);
    t.eq([t.$$(".rw-node").length, t.$$(".rw-edges line").length], [4, 2], "relationship web nodes and lines");
    t.click('[data-char-tab="cards"]'); await t.sleep(300);
    t.click(t.$('[data-open="ch0001"] [data-card-del]')); await t.sleep(200);
    t.click(t.$$(".confirm-inline .btn").at(-1));
    t.ok(await t.savedWhen(BOOK, b => !b.characters.some(c => c.id === "ch0001") && !scenesOf(b).some(s => s.povId === "ch0001")), "deleting a character didn't remove them and their links");
    t.click("#toast .toast-action");
    t.ok(await t.savedWhen(BOOK, b => b.characters.some(c => c.id === "ch0001")), "Undo didn't bring the character back");
    // regression: after Undo, saving must carry on normally (no false "changed in another window")
    t.click('[data-open="ch0002"]'); await t.sleep(500);
    const name = t.$(".name-input"); name.value = "Leo Vance Jr"; name.dispatchEvent(new Event("input", { bubbles: true }));
    t.ok(await t.savedWhen(BOOK, b => b.characters.find(c => c.id === "ch0002").name === "Leo Vance Jr"), "editing after Undo didn't save");
    t.ok(!/another window/.test(t.$(".save-state").textContent), "a false conflict appeared after Undo");
  }],

  ["Places: delete a place that contains another, Undo", async t => {
    await seedBook();
    await t.load(`${P}/locations`);
    t.click(t.$('[data-card-del="loc1"]')); await t.sleep(200);
    t.click(t.$$(".confirm-inline .btn").at(-1));
    t.ok(await t.savedWhen(BOOK, b => !b.codex.locations.some(l => l.id === "loc1") && !b.codex.locations.some(l => l.parentId === "loc1")), "deleting the place left a broken link");
    t.click("#toast .toast-action");
    t.ok(await t.savedWhen(BOOK, b => b.codex.locations.some(l => l.id === "loc1")), "Undo didn't bring the place back");
  }],

  ["Two windows: the conflict choice, nothing overwritten", async t => {
    const { s1 } = await seedBook();
    await t.load(`${P}/manuscript/${s1.id}`);
    const other = await t.saved(BOOK); other.title = "Changed elsewhere";
    await fetch(`/api/projects/${BOOK}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(other) });
    t.caretAtEnd(t.$("#prose").lastElementChild);
    t.type(" Conflict test.");
    t.ok(await t.until(() => t.$(".modal h3")?.textContent === "This project changed in another window"), "the conflict choice didn't appear");
    t.click(t.$$(".modal .btn").find(b => b.textContent.includes("Keep this tab")));
    t.ok(await t.savedWhen(BOOK, b => b.title === "Harness Book" && scenesOf(b)[0].content.includes("Conflict test.")), "keeping this tab's version didn't save it");
  }],

  ["Offline: warning, then saves when the server is back", async t => {
    const { s1 } = await seedBook();
    await t.load(`${P}/manuscript/${s1.id}`);
    const realFetch = t.win.fetch;
    t.win.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    t.caretAtEnd(t.$("#prose").lastElementChild);
    t.type(" Offline words.");
    t.ok(await t.until(() => !t.$("#offline-banner").hidden), "the offline banner didn't appear");
    t.ok(/server offline/.test(t.$(".save-state").textContent), "the save status didn't say offline");
    t.win.fetch = realFetch;
    t.key("s", { ctrlKey: true });
    t.ok(await t.savedWhen(BOOK, b => scenesOf(b)[0].content.includes("Offline words.")), "the words written offline weren't saved");
    t.ok(await t.until(() => t.$("#offline-banner").hidden), "the banner didn't go away");
  }],

  ["Compile: the window, presets and contents", async t => {
    await seedBook();
    await t.load(`${P}/overview`);
    t.click("[data-export]"); await t.sleep(500);
    t.eq(t.$$(".cmp-format").length, 6, "format choices");
    const frame = t.$("#cmp-frame");
    t.ok(await t.until(() => frame.contentDocument?.querySelectorAll(".ch-head").length === 2), "the preview doesn't show both chapters");
    t.ok(/2 chapters/.test(t.$("#cmp-stats").textContent), "chapter count above the preview");
    t.ok(await t.until(() => {
      const pages = [...frame.contentDocument.querySelectorAll(".sheet.page")];
      return pages.length >= 2 && pages.every(pg => pg.scrollHeight <= pg.clientHeight + 1 && pg.querySelector(".running-head"));
    }), "the preview isn't laid out as whole pages with headers");
    // the name goes on the title page and is saved with the project
    t.click('.cmp-tabs [data-tab="front"]'); await t.sleep(300);
    const pen = t.$('[data-k="text.penName"]');
    pen.value = "M. Q. Writer"; pen.dispatchEvent(new Event("input", { bubbles: true }));
    t.ok(await t.savedWhen(BOOK, b => b.compile?.text.penName === "M. Q. Writer"), "the pen name wasn't saved");
    t.ok(await t.until(() => /by M\. Q\. Writer/.test(frame.contentDocument.body.textContent)), "the pen name isn't on the title page");
    pen.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    t.ok(t.$(".cmp-format"), "Enter in a text box closed the window");
    // leave a chapter out
    t.click('.cmp-tabs [data-tab="contents"]'); await t.sleep(300);
    t.click('[data-ch="chap2"]');
    t.ok(await t.savedWhen(BOOK, b => b.compile.exclude.includes("chap2")), "leaving a chapter out wasn't saved");
    t.ok(await t.until(() => /^1 chapter /.test(t.$("#cmp-stats").textContent)), "chapter count after leaving one out");
    t.click('[data-ch="chap2"]');
    // a preset switches the format and layout
    await t.choose(t.$(".cmp-preset .dd"), "E-book");
    t.ok(t.$(".cmp-format.on")?.dataset.format === "epub", "the e-book preset didn't choose EPUB");
    t.eq(t.$$(".modal-foot .btn").at(-1).textContent, "Download EPUB", "export button label");
    t.ok(await t.savedWhen(BOOK, b => b.compile.preset === "ebook" && b.compile.layout.sceneBreak === "❦"), "the preset wasn't saved");
    t.click('.cmp-tabs [data-tab="layout"]'); await t.sleep(300);
    t.ok(t.$('[data-k="layout.pageSize"]').closest("[data-for]").hidden, "page settings show for an e-book");
    t.key("Escape");
  }],

  ["Compile: Word, EPUB, PDF page, Markdown and text files", async t => {
    await seedBook();
    const m = await import("/js/compile/model.js");
    const { bookHtml, bookMarkdown, bookText } = await import("/js/compile/html.js");
    const { bookDocx } = await import("/js/compile/docx.js");
    const { bookEpub } = await import("/js/compile/epub.js");
    const book = st.normalize(await t.saved(BOOK));
    const c = m.compileSettings(book);
    c.text.author = "Mara Writer"; c.text.contact = "1 Dock Road";
    // numbers and the small rules
    t.eq([m.numberWords(21), m.numberWords(140), m.roman(14)], ["Twenty-One", "One Hundred and Forty", "XIV"], "chapter numbers");
    t.eq([m.approxWords(85432), m.approxWords(3149)], [85000, 3100], "rounded word counts");
    book.chapters[0].title = "Chapter 1";
    let b = m.buildBook(book, c);
    t.eq(b.chapters.map(ch => m.headingText(ch)), ["Chapter One", "Chapter Two: The Docks"], "headings (a number-only title is dropped)");
    t.eq(b.runningHead, "Writer / HARNESS BOOK / ", "manuscript header");

    // Word: a real .docx with heading styles, the header and every scene
    const docx = await readZip(await bookDocx(b));
    t.ok(docx["[Content_Types].xml"] && docx["word/styles.xml"], "the Word file is missing parts");
    const docXml = docx["word/document.xml"];
    t.ok(isXml(docXml) && isXml(docx["word/styles.xml"]), "the Word XML isn't well formed");
    t.eq((docXml.match(/w:val="Heading1"/g) || []).length, 2, "chapter headings in Word");
    t.ok(["The phone rang at three.", "The body lay face down by the crane.", "about 100 words", "1 Dock Road"].every(x => docXml.includes(x)), "the Word file is missing text");
    t.ok(/Writer \/ HARNESS BOOK \/ /.test(docx["word/header1.xml"]) && /PAGE/.test(docx["word/header1.xml"]), "the Word header");

    // EPUB: mimetype first and uncompressed, valid XHTML, both chapters in the reading order
    m.applyPreset(c, "ebook"); c.front.toc = true;
    b = m.buildBook(book, c);
    const epubBlob = await bookEpub(b, { id: c.bookId });
    const head = new TextDecoder().decode(new Uint8Array(await epubBlob.slice(30, 58).arrayBuffer()));
    t.eq(head, "mimetypeapplication/epub+zip", "EPUB starts with its mimetype");
    const epub = await readZip(epubBlob);
    t.ok(["OEBPS/chapter-001.xhtml", "OEBPS/chapter-002.xhtml", "OEBPS/nav.xhtml", "OEBPS/content.opf"].every(f => isXml(epub[f])), "EPUB files aren't well formed");
    t.eq((epub["OEBPS/content.opf"].match(/<itemref idref="ch\d+"/g) || []).length, 2, "chapters in the EPUB reading order");
    t.ok(epub["OEBPS/chapter-002.xhtml"].includes("The body lay face down"), "EPUB chapter text");

    // PDF page, web page, Markdown, plain text
    m.applyPreset(c, "manuscript");
    b = m.buildBook(book, c);
    const print = bookHtml(b, { mode: "print" });
    t.ok(/@page \{ size: /.test(print) && /counter\(page\)/.test(print), "the print page has no page rules");
    const doc = new DOMParser().parseFromString(bookHtml(b, { mode: "web" }), "text/html");
    t.eq([...doc.querySelectorAll(".ch-head")].map(h => h.textContent), ["Chapter One", "Chapter TwoThe Docks"], "web page headings");
    t.ok(/^## Chapter One$/m.test(bookMarkdown(b)) && /^## Chapter Two: The Docks$/m.test(bookMarkdown(b)), "Markdown headings");
    t.ok(/CHAPTER ONE/.test(bookText(b)) && bookText(b).includes("Rain on the windscreen."), "plain text");
    t.ok(/THE END/.test(bookText(b)), "THE END in the manuscript");
  }],

  ["Backups: restore an earlier version, keep editing", async t => {
    const { s1 } = await seedBook();
    const b = await t.saved(BOOK); b.title = "Second version";
    await fetch(`/api/projects/${BOOK}?force=1`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    await t.load(`${P}/overview`);
    t.click("[data-backups]"); await t.sleep(600);
    t.ok(t.$$("[data-restore]").length >= 1, "no backups listed");
    t.click(t.$$("[data-restore]")[0]); await t.sleep(200);
    t.click(t.$$(".confirm-inline .btn").at(-1)); await t.sleep(800);
    t.ok(/Restored the version/.test(t.$("#toast").textContent), "no message after restoring");
    t.ok(await t.savedWhen(BOOK, x => x.title === "Harness Book"), "the earlier version wasn't restored");
    await t.go(`${P}/manuscript/${s1.id}`, 700);
    t.caretAtEnd(t.$("#prose").lastElementChild);
    t.type(" After restore.");
    t.ok(await t.savedWhen(BOOK, x => scenesOf(x)[0].content.includes("After restore.")), "editing after a restore didn't save");
  }],

  ["Home: new project, trash and restore, backup-folder line", async t => {
    await seedBook();
    await t.load("#/");
    t.ok(await t.until(() => t.$("#backup-line.warn")), "the 'only on this computer' line is missing");
    t.click("[data-new]"); await t.sleep(300);
    t.click('[data-genre-pick="fantasy"]'); await t.sleep(200);
    t.ok(t.$("#subgenre").classList.contains("open"), "the fiction choices didn't open");
    t.$(".modal [name=title]").value = "Home Test";
    t.click(t.$$(".modal .btn").find(b => b.classList.contains("primary"))); await t.sleep(900);
    t.ok(/#\/p\/home-test-.*\/manuscript/.test(t.win.location.hash), "the new project didn't open");
    await t.go("#/", 800);
    const card = t.$$(".project-card").find(c => c.querySelector("h3").textContent === "Home Test");
    t.ok(card, "the new project isn't on the home page");
    t.click(card.querySelector("[data-del]")); await t.sleep(200);
    t.click(t.$$(".confirm-inline .btn").at(-1)); await t.sleep(900);
    t.ok(!t.$$(".project-card h3").some(h => h.textContent === "Home Test"), "deleting didn't remove the project");
    t.click("[data-trash]"); await t.sleep(400);
    t.click(t.$$("[data-restore-trash]").at(-1)); await t.sleep(900);
    t.ok(t.$$(".project-card h3").some(h => h.textContent === "Home Test"), "restoring from the trash didn't bring it back");
    t.click("[data-backup-folder]"); await t.sleep(300);
    t.eq(t.$(".modal h3").textContent, "Backup folder", "backup folder dialog");
    t.$(".modal [data-folder-path]").value = "Z:\\No Such Folder";
    t.click(t.$$(".modal-foot .btn").find(b => b.textContent === "Use this folder")); await t.sleep(700);
    t.ok(/doesn't exist/.test(t.$(".folder-error")?.textContent || ""), "a missing folder wasn't explained");
    t.click(t.$$(".modal-foot .btn").find(b => b.textContent === "Cancel"));
  }],

  ["Speed: a 60-chapter, 300-scene book", async t => {
    const p = st.newProject({ title: "Big Book", genre: "thriller" });
    p.id = "big-book";
    const words = "rain city night detective shadow whisky neon alley truth door smoke harbour silence".split(" ");
    const para = i => Array.from({ length: 60 }, (_, k) => words[(i * 7 + k * 3) % words.length]).join(" ") + ".";
    p.characters = Array.from({ length: 40 }, (_, i) => Object.assign(st.newCharacter(`Person ${i + 1}`, "Suspect"), { id: `pc${i}` }));
    let k = 0;
    p.chapters = Array.from({ length: 60 }, (_, c) => ({ id: `bc${c}`, title: `Chapter ${c + 1}`, open: c < 2, scenes: Array.from({ length: 5 }, (_, s) =>
      Object.assign(st.newScene(`Scene ${s + 1}`), { id: `bs${k++}`, povId: `pc${k % 40}`, synopsis: "Something happens.", content: Array.from({ length: 6 }, (_, j) => `<p>${para(k + j)}</p>`).join("") })) }));
    await st.api.save(p, { force: true });
    await t.load("#/p/big-book/manuscript/bs0");
    const time = async (label, action, limit) => {
      const t0 = performance.now(); action(); const ms = Math.round(performance.now() - t0);
      t.note(`${label} ${ms} ms`);
      t.ok(ms < limit, `${label} took ${ms} ms (limit ${limit})`);
      await t.sleep(300);
    };
    const t0 = performance.now();
    t.win.location.hash = "#/p/big-book/manuscript/bs152";
    await t.until(() => t.$("#scene-title")?.value === "Scene 3", 5000);
    const openMs = Math.round(performance.now() - t0);
    t.note(`open a scene ${openMs} ms`);
    t.ok(openMs < 1500, `opening a scene took ${openMs} ms`);
    await t.sleep(300);
    await time("corkboard", () => t.click('[data-mode="corkboard"]'), 1500);
    await time("outliner", () => t.click('[data-mode="outliner"]'), 2000);
    await time("read-through", () => t.click("[data-read]"), 2000);
    t.click("[data-read]"); await t.sleep(300);
    await time("write", () => t.click('[data-mode="write"]'), 1500);
  }],
];
