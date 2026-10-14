// Themed dropdowns: every <select> in the app gets the same look as the editor toolbar's dropdowns
// (a bordered button with the current value and a line chevron, opening a themed menu).
//
// The real <select> stays in the page, hidden, and still holds the value: choosing from the menu sets
// it and fires the usual "input" and "change" events, so the code that reads or listens to selects
// doesn't need to know about this. Selects added later are picked up automatically.
// Just before its menu opens, a select receives a "dd-open" event: a page with hundreds of long lists
// can render each with only its current option and fill in the rest then.

import { icon } from "./icons.js";

const valueProp = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
const indexProp = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");

let open = null;   // { select, trigger, el, items, active }

// One button is built once and copied for every select, and one observer watches them all:
// a page with hundreds of dropdowns (the outliner) stays quick to draw.
let template = null;
const repaint = new WeakMap();      // select -> its paint()
const watcher = new MutationObserver(records => {
  const seen = new Set();
  for (const r of records) {
    const sel = r.target.closest ? r.target.closest("select") : r.target.parentNode?.closest?.("select");
    if (sel && !seen.has(sel)) { seen.add(sel); repaint.get(sel)?.(); }
  }
});

function enhance(select) {
  if (select.dataset.dd || select.multiple) return;
  select.dataset.dd = "1";
  if (!template) {
    template = document.createElement("button");
    template.type = "button";
    template.className = "dd";
    template.setAttribute("aria-haspopup", "listbox");
    template.innerHTML = `<span class="dd-label"></span>${icon("chevron", 14)}`;
  }
  const trigger = template.cloneNode(true);
  const style = select.getAttribute("style");
  if (style) trigger.setAttribute("style", style);
  select.after(trigger);
  select.classList.add("dd-native");
  select.tabIndex = -1;

  const paint = () => {
    const o = select.options[select.selectedIndex];
    trigger.firstChild.textContent = o ? o.textContent : "";
    trigger.disabled = select.disabled;
    if (select.title) trigger.title = select.title;
  };
  // code that sets .value / .selectedIndex directly repaints the button too
  Object.defineProperty(select, "value", { configurable: true, get() { return valueProp.get.call(this); }, set(v) { valueProp.set.call(this, v); paint(); } });
  Object.defineProperty(select, "selectedIndex", { configurable: true, get() { return indexProp.get.call(this); }, set(v) { indexProp.set.call(this, v); paint(); } });
  select.addEventListener("change", paint);
  repaint.set(select, paint);
  watcher.observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled"] });

  trigger.addEventListener("mousedown", e => e.preventDefault());     // keep the editor's text selection
  trigger.onclick = e => {
    e.stopPropagation();
    if (open?.select === select) close();
    else openMenu(select, trigger);
  };
  trigger.onkeydown = e => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openMenu(select, trigger); }
  };
  paint();
}

function openMenu(select, trigger) {
  close();
  select.dispatchEvent(new Event("dd-open"));      // a select may fill in its full list only now (see the outliner)
  const el = document.createElement("div");
  el.className = "popover dd-menu";
  el.setAttribute("role", "listbox");
  let html = "";
  for (const child of select.children) {
    if (child.tagName === "OPTGROUP") {
      html += `<div class="menu-title">${escapeHtml(child.label)}</div>`;
      for (const o of child.children) html += item(o);
    } else html += item(child);
  }
  el.innerHTML = `<div class="menu-list">${html}</div>`;
  document.body.appendChild(el);

  // below the button (or above it when there's no room), at least as wide as the button
  const r = trigger.getBoundingClientRect();
  el.style.minWidth = r.width + "px";
  const below = innerHeight - r.bottom - 12, above = r.top - 12;
  const up = below < 220 && above > below;
  el.style.maxHeight = Math.max(140, Math.min(340, up ? above : below)) + "px";
  el.style.left = Math.max(8, Math.min(r.left, innerWidth - el.offsetWidth - 8)) + "px";
  el.style.top = (up ? r.top - 4 - el.offsetHeight : r.bottom + 4) + "px";

  const items = [...el.querySelectorAll(".menu-item")];
  open = { select, trigger, el, items, active: Math.max(0, items.findIndex(b => b.classList.contains("on"))) };
  trigger.classList.add("open");
  trigger.setAttribute("aria-expanded", "true");
  highlight(open.active, "center");
  items.forEach((b, i) => {
    b.onmousedown = e => e.preventDefault();
    b.onclick = () => choose(+b.dataset.i);
    b.onmousemove = () => highlight(i);
  });
  addEventListener("mousedown", outside, true);
  addEventListener("keydown", keys, true);
  addEventListener("scroll", onScroll, true);
  addEventListener("resize", close);
}

const item = o => `<button type="button" role="option" class="menu-item ${o.selected ? "on" : ""}" data-i="${o.index}" ${o.disabled ? "disabled" : ""}>${escapeHtml(o.textContent)}</button>`;
const escapeHtml = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function highlight(i, block = "nearest") {
  if (!open || !open.items.length) return;
  open.active = (i + open.items.length) % open.items.length;
  open.items.forEach((b, k) => b.classList.toggle("active", k === open.active));
  open.items[open.active].scrollIntoView({ block });
}

function choose(index) {
  const { select, trigger } = open;
  close();
  trigger.focus({ preventScroll: true });
  if (select.selectedIndex === index) return;
  indexProp.set.call(select, index);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

export function close() {
  if (!open) return;
  open.el.remove();
  open.trigger.classList.remove("open");
  open.trigger.setAttribute("aria-expanded", "false");
  open = null;
  removeEventListener("mousedown", outside, true);
  removeEventListener("keydown", keys, true);
  removeEventListener("scroll", onScroll, true);
  removeEventListener("resize", close);
}

function outside(e) {
  if (open && e.target instanceof Node && !open.el.contains(e.target) && !open.trigger.contains(e.target)) close();
}
function onScroll(e) {
  if (open && !open.el.contains(e.target)) close();
}

// arrows move, Enter picks, Escape closes, letters jump to the next matching option
let typed = "", typedAt = 0;
function keys(e) {
  if (!open) return;
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === "Escape") { stop(); const t = open.trigger; close(); t.focus(); }
  else if (e.key === "ArrowDown") { stop(); highlight(open.active + 1); }
  else if (e.key === "ArrowUp") { stop(); highlight(open.active - 1); }
  else if (e.key === "Home") { stop(); highlight(0); }
  else if (e.key === "End") { stop(); highlight(-1); }
  else if (e.key === "Enter" || e.key === " ") { stop(); choose(+open.items[open.active].dataset.i); }
  else if (e.key === "Tab") close();
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    stop();
    typed = Date.now() - typedAt > 700 ? e.key.toLowerCase() : typed + e.key.toLowerCase();
    typedAt = Date.now();
    // a single letter moves on to the next match; a longer word keeps refining the current one
    const n = open.items.length, start = typed.length > 1 ? open.active : open.active + 1;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (open.items[i].textContent.trim().toLowerCase().startsWith(typed)) { highlight(i); break; }
    }
  }
}

// enhance the selects already on the page, and every one added later
document.querySelectorAll("select").forEach(enhance);
new MutationObserver(records => {
  for (const r of records) for (const n of r.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.tagName === "SELECT") enhance(n);
    else n.querySelectorAll?.("select").forEach(enhance);
  }
}).observe(document.body, { childList: true, subtree: true });
