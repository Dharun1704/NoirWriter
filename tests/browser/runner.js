// The test page: runs every test in tests.js against the real app in the frame, shows progress,
// and sends the results (and the style snapshots) to the test server for run_tests.py to print.

import { TESTS } from "./tests.js";

const frame = document.getElementById("app");
const list = document.getElementById("list");
const summary = document.getElementById("summary");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const put = (name, body) => fetch(`/api/test-results/${name}`, { method: "PUT", body: typeof body === "string" ? body : JSON.stringify(body) });

/** Everything a test can use; `t.win` / `t.doc` are the app's window and document. */
function makeContext(record) {
  const t = {
    get win() { return frame.contentWindow; },
    get doc() { return frame.contentDocument; },
    $: sel => frame.contentDocument.querySelector(sel),
    $$: sel => [...frame.contentDocument.querySelectorAll(sel)],
    sleep,
    /** Wait until fn() gives something truthy (or time runs out, then return null). */
    async until(fn, ms = 6000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        try { const v = await fn(); if (v) return v; } catch {}
        await sleep(100);
      }
      return null;
    },
    /** Load the app fresh at a route (clears nothing; see reset()). */
    async load(hash = "#/") {
      await new Promise(resolve => { frame.onload = resolve; frame.src = `/?test=1&t=${Date.now()}${hash}`; });
      watchErrors();
      await t.until(() => t.$("#app")?.children.length, 10000);
      await sleep(300);
    },
    /** Go to a route inside the running app. */
    async go(hash, wait = 500) {
      t.win.location.hash = hash;
      await sleep(wait);
    },
    click(target) {
      const el = typeof target === "string" ? t.$(target) : target;
      if (!el) throw new Error(`nothing to click: ${target}`);
      el.click();
      return el;
    },
    key(key, opts = {}, target = null) {
      (target || t.doc).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));
    },
    /** Put the caret at the end of an element inside the editor. */
    caretAtEnd(el) {
      el.closest("[contenteditable]")?.focus();
      const r = t.doc.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      const sel = t.win.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    },
    type(text) { t.doc.execCommand("insertText", false, text); },
    pointer(type, x, y, target = null) {
      (target || t.win).dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, pointerId: 1 }));
    },
    /** The project as saved on the server. */
    async saved(id) { return (await fetch(`/api/projects/${id}`)).json(); },
    async savedWhen(id, fn, ms = 6000) { return t.until(async () => fn(await t.saved(id)), ms); },
    /** Choose an option in one of the app's themed dropdowns, by its text. */
    async choose(dd, text) {
      dd.click();
      await sleep(150);
      const item = t.$$(".dd-menu .menu-item").find(b => b.textContent.trim() === text);
      if (!item) throw new Error(`no option "${text}" in the dropdown`);
      item.click();
      await sleep(150);
    },
    ok(cond, message) { if (!cond) record.failures.push(message); return !!cond; },
    eq(actual, expected, message) {
      const same = JSON.stringify(actual) === JSON.stringify(expected);
      if (!same) record.failures.push(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      return same;
    },
    note(text) { record.notes.push(text); },
    snapshot: name => snapshot(name),
    put,
  };
  return t;
}

// errors inside the app fail the test that is running
let errors = [];
function watchErrors() {
  const w = frame.contentWindow;
  w.addEventListener("error", e => errors.push(e.message || String(e.error)));
  w.addEventListener("unhandledrejection", e => errors.push("Unhandled: " + (e.reason?.message || e.reason)));
}

// ---------------------------------------------------------------- style snapshots (the look check)
// Every element's computed style (a fixed list of properties), as a compact table. run_tests.py
// compares it with tests/baseline. SVG geometry is left out (the relationship web moves on its own).

const PROPS = ["display", "position", "top", "left", "right", "bottom", "width", "height", "min-width", "max-width", "min-height",
  "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-top-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
  "background-color", "background-image", "background-size", "background-position", "background-repeat",
  "color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-transform",
  "text-align", "text-decoration-line", "text-indent", "white-space", "text-overflow", "vertical-align",
  "opacity", "visibility", "overflow-x", "overflow-y", "z-index", "cursor", "box-shadow", "transform",
  "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis", "align-items", "justify-content",
  "gap", "row-gap", "grid-template-columns", "grid-template-rows", "grid-column", "outline-style", "outline-color",
  "fill", "stroke", "stroke-width", "filter", "pointer-events", "user-select", "resize", "appearance", "box-sizing",
  "list-style-type", "content", "table-layout", "border-collapse", "aspect-ratio", "isolation", "touch-action", "accent-color",
  "text-align-last", "text-underline-offset", "text-decoration-color", "container-type", "translate", "rotate", "scale", "backdrop-filter"];
const GEOM = new Set(["top", "left", "right", "bottom", "width", "height", "transform", "translate"]);

async function snapshot(name) {
  await sleep(400);
  const doc = frame.contentDocument;
  // let passing things settle so they don't show up as differences:
  // web fonts still loading, a save in flight, a toast left over from the step before
  await doc.fonts.ready;
  const end = Date.now() + 6000;
  while (doc.querySelector(".save-state.dirty") && Date.now() < end) await sleep(100);
  doc.querySelectorAll(".toast").forEach(el => { el.hidden = true; });
  doc.activeElement?.blur?.();
  const w = frame.contentWindow;
  const styles = new Map(), rows = [];
  const visit = (el, path, inSvg) => {
    const cs = w.getComputedStyle(el);
    const vals = PROPS.map(k => (inSvg && GEOM.has(k)) ? "-" : cs.getPropertyValue(k));
    const key = vals.join("|") + "|" + w.getComputedStyle(el, "::before").content + "|" + w.getComputedStyle(el, "::after").content;
    if (!styles.has(key)) styles.set(key, styles.size);
    rows.push([path, typeof el.className === "string" ? el.className : "", styles.get(key)]);
    [...el.children].forEach((c, i) => visit(c, `${path}>${c.tagName.toLowerCase()}${i}`, inSvg || c.tagName === "svg"));
  };
  visit(frame.contentDocument.body, "body", false);
  await put(`snap-${name}`, { name, props: PROPS, styles: [...styles.keys()], rows });
}

// ---------------------------------------------------------------- run

async function run() {
  try { localStorage.clear(); } catch {}
  // ?only=word,word runs just the tests whose names contain one of the words (handy while fixing one)
  const only = (new URLSearchParams(location.search).get("only") || "").toLowerCase().split(",").map(w => w.trim()).filter(Boolean);
  const chosen = only.length ? TESTS.filter(([name]) => only.some(w => name.toLowerCase().includes(w))) : TESTS;
  const results = [];
  const started = Date.now();
  const items = chosen.map(([name]) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="mark">…</span><span class="name"></span>`;
    li.querySelector(".name").textContent = name;
    list.append(li);
    return li;
  });
  for (let i = 0; i < chosen.length; i++) {
    const [name, fn] = chosen[i];
    const li = items[i];
    li.classList.add("run");
    li.scrollIntoView({ block: "nearest" });
    summary.textContent = `${i + 1} of ${chosen.length}: ${name}`;
    put("progress", { done: i, total: chosen.length, current: name });
    const record = { name, ok: true, failures: [], notes: [], ms: 0 };
    errors = [];
    const t0 = performance.now();
    try {
      await Promise.race([fn(makeContext(record)), sleep(120000).then(() => { throw new Error("timed out after 2 minutes"); })]);
    } catch (e) {
      record.failures.push(`${e.message}${e.stack ? "  @ " + e.stack.split("\n").find(l => l.includes("tests.js"))?.trim() : ""}`);
    }
    await sleep(50);
    if (errors.length) record.failures.push(...errors.map(e => "error in the app: " + e));
    record.ms = Math.round(performance.now() - t0);
    record.ok = !record.failures.length;
    results.push(record);
    li.classList.remove("run");
    li.classList.add(record.ok ? "ok" : "fail");
    li.querySelector(".mark").textContent = record.ok ? "PASS" : "FAIL";
    for (const f of record.failures) {
      const why = document.createElement("span");
      why.className = "why";
      why.textContent = f;
      li.querySelector(".name").append(why);
    }
  }
  const failed = results.filter(r => !r.ok).length;
  summary.textContent = failed ? `${failed} of ${results.length} failed. You can close this tab.` : `All ${results.length} passed. You can close this tab.`;
  await put("report", { results, failed, total: results.length, ms: Date.now() - started, browser: navigator.userAgent });
}

run();
