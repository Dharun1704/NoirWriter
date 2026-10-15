// Small DOM helpers shared by all views.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function initials(name) {
  return esc((name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(""));
}

export function avatar(c, size = 34) {
  if (!c) return "";
  const style = `width:${size}px;height:${size}px;` + (c.portrait ? `background-image:url('${c.portrait}')` : "");
  return `<span class="avatar" style="${style}" title="${esc(c.name)}">${c.portrait ? "" : initials(c.name)}</span>`;
}

export function options(items, selected, { empty = null, value = x => x.id, label = x => x.name } = {}) {
  let out = empty !== null ? `<option value="">${esc(empty)}</option>` : "";
  for (const it of items) {
    const v = value(it);
    out += `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(label(it))}</option>`;
  }
  return out;
}

export function multiSelect(name, items, selectedIds, label = x => x.name) {
  if (!items.length) return `<span class="faint">None yet</span>`;
  return `<div class="multi-select" data-multi="${esc(name)}">` + items.map(it =>
    `<label><input type="checkbox" value="${esc(it.id)}" ${selectedIds.includes(it.id) ? "checked" : ""}>${esc(label(it))}</label>`
  ).join("") + `</div>`;
}

export function readMulti(root, name) {
  return $$(`[data-multi="${name}"] input:checked`, root).map(i => i.value);
}

export function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${plural(Math.floor(s / 86400), "day")} ago`;
  return new Date(ts).toLocaleDateString();
}

export const fmt = n => n.toLocaleString();

// ---------------------------------------------------------------- toast

let toastTimer;
/** Show a short message. Pass {action, onAction} for an inline button such as "Undo". */
export function toast(msg, { action, onAction, duration } = {}) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="toast-action">${esc(action)}</button>` : ""}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  const hide = () => (el.hidden = true);
  if (action) $(".toast-action", el).onclick = () => { hide(); onAction(); };
  toastTimer = setTimeout(hide, duration || (action ? 7000 : 2200));
}

export const plural = (n, word, many = word + "s") => `${n.toLocaleString()} ${n === 1 ? word : many}`;

/**
 * Swap `el` for a text input to rename something in place.
 * Enter or clicking away saves, Escape cancels. `onCommit(newValue)` runs only if the value changed.
 */
export function inlineEdit(el, value, onCommit) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "inline-edit";
  input.value = value;
  const draggable = el.closest("[draggable]");
  if (draggable) draggable.draggable = false;
  el.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = save => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (input.isConnected) input.replaceWith(el);
    if (draggable) draggable.draggable = true;
    if (save && v && v !== value) onCommit(v);
  };
  input.onkeydown = e => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    if (e.key === "Escape") { e.preventDefault(); finish(false); }
  };
  input.onblur = () => finish(true);
  for (const ev of ["click", "dblclick", "mousedown", "pointerdown"]) input.addEventListener(ev, e => e.stopPropagation());
}

// ---------------------------------------------------------------- modal

/**
 * Open a modal. `body` is HTML. Buttons: [{label, kind, value, left, confirm}]. `wide`: true, or "xl".
 * A button with `confirm: "message"` asks in place (inside the footer) before closing.
 * Resolves with {value, root} when a button is pressed, or null on dismiss.
 * `onMount(root, close)` lets callers wire up extra behaviour.
 */
export function modal({ title, body, buttons = [{ label: "Close", value: null }], wide = false, onMount }) {
  return new Promise(resolve => {
    const root = $("#modal-root");
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    back.innerHTML = `
      <div class="modal ${wide === "xl" ? "wide xl" : wide ? "wide" : ""}" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-x title="Close (Esc)" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot">${buttons.map((b, i) =>
          `<button class="btn ${b.kind || ""} ${b.left ? "left" : ""}" data-i="${i}">${esc(b.label)}</button>`).join("")}</div>
      </div>`;
    root.appendChild(back);
    const box = $(".modal", back);
    const close = value => {
      document.removeEventListener("keydown", onKey);
      back.remove();
      resolve(value);
    };
    const onKey = e => {
      if (e.key === "Escape") close(null);
      if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") {
        const primary = buttons.findIndex(b => b.kind === "primary");
        if (primary >= 0) { e.preventDefault(); close({ value: buttons[primary].value, root: box }); }
      }
    };
    document.addEventListener("keydown", onKey);
    back.addEventListener("mousedown", e => { if (e.target === back) close(null); });
    $("[data-x]", back).onclick = () => close(null);
    $$("[data-i]", back).forEach(btn => {
      const b = buttons[+btn.dataset.i];
      btn.onclick = async () => {
        if (b.confirm && !await confirmInline(btn, b.confirm, { yes: b.label })) return;
        close({ value: b.value, root: box });
      };
    });
    onMount?.(box, close);
    const first = $("input, textarea, select", box);
    first?.focus();
    first?.select?.();
  });
}

export async function confirmBox(title, message, okLabel = "Delete") {
  const r = await modal({
    title, body: `<p>${esc(message)}</p>`,
    buttons: [{ label: "Cancel", value: false }, { label: okLabel, kind: "primary", value: true }],
  });
  return r?.value === true;
}

/**
 * Swap `anchor` (usually a Delete button) for a small "message  Keep  Delete" bar.
 * Resolves true if confirmed. Esc or Keep cancels. Nothing pops up over the page.
 */
export function confirmInline(anchor, message, { yes = "Delete" } = {}) {
  return new Promise(resolve => {
    document.querySelectorAll(".confirm-inline").forEach(el => el.cancel?.());
    const bar = document.createElement("span");
    bar.className = "confirm-inline";
    bar.setAttribute("role", "alertdialog");
    bar.innerHTML = `<span class="msg">${esc(message)}</span>
      <button class="btn sm" type="button" data-keep>Keep</button>
      <button class="btn sm danger-solid" type="button" data-yes>${esc(yes)}</button>`;
    const prevDisplay = anchor.style.display;
    anchor.style.display = "none";
    anchor.after(bar);
    const done = ok => {
      document.removeEventListener("keydown", onKey, true);
      bar.remove();
      anchor.style.display = prevDisplay;
      resolve(ok);
    };
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); done(false); } };
    bar.cancel = () => done(false);
    document.addEventListener("keydown", onKey, true);
    for (const ev of ["click", "mousedown"]) bar.addEventListener(ev, e => e.stopPropagation());
    $("[data-keep]", bar).onclick = () => done(false);
    $("[data-yes]", bar).onclick = () => done(true);
    $("[data-keep]", bar).focus();
  });
}

/**
 * New items that haven't been added yet: id -> {key, item}.
 * They live only here (not in the project) until the writer clicks "Add",
 * so backing out of a new character / entry leaves nothing behind.
 */
export const drafts = new Map();

/**
 * Apply a destructive change to the project with an Undo button in the toast.
 * `after` re-renders the page; it runs after the change and again after an undo.
 */
export function undoable(ctx, message, mutate, after) {
  const p = ctx.project;
  const before = JSON.stringify(p);
  mutate();
  ctx.save();
  after();
  toast(message, {
    action: "Undo",
    onAction: () => {
      const restored = JSON.parse(before);
      // the save version (rev) has moved on since: keep it, or the next save looks like an old copy
      restored.rev = p.rev;
      for (const k of Object.keys(p)) if (!(k in restored)) delete p[k];
      Object.assign(p, restored);
      ctx.save();
      after(true);
      toast("Restored");
    },
  });
}

export async function promptBox(title, label, value = "") {
  const r = await modal({
    title,
    body: `<label class="field"><span>${esc(label)}</span><input type="text" value="${esc(value)}"></label>`,
    buttons: [{ label: "Cancel", value: false }, { label: "OK", kind: "primary", value: true }],
  });
  if (!r?.value) return null;
  const v = $("input", r.root).value.trim();
  return v || null;
}

// ---------------------------------------------------------------- files

export function download(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function pickFile(accept) {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

/** Read an image file and downscale it so portraits don't bloat the project JSON. */
export function imageToDataUrl(file, max = 480) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ---------------------------------------------------------------- shared list/detail pieces

const TRASH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const PENCIL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/></svg>';
const PLUS = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

/** A big, obviously-editable name field for detail pages. */
export function nameField(value, label = "Name", placeholder = "Name") {
  return `<label class="name-field"><span class="field-label">${esc(label)}</span>
    <input class="name-input" data-k="name" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">
    <span class="name-pencil">${PENCIL}</span></label>`;
}

/** Hover delete button placed in a card's corner. */
export const cardDelete = (id, label = "Delete") =>
  `<div class="card-actions"><button class="card-del" type="button" data-card-del="${esc(id)}" title="${esc(label)}" aria-label="${esc(label)}">${TRASH}</button></div>`;

/** Dashed "add" tile that sits at the end of a grid. */
export const addTile = (label, attrs = "data-add") =>
  `<button class="add-tile" type="button" ${attrs}>${PLUS}<span>${esc(label)}</span></button>`;

/**
 * Wire every [data-card-del] in `root`: ask in place, then delete with Undo.
 * `describe(id)` returns the item's name; `remove(id)` mutates the project; `after()` re-renders.
 */
export function bindCardDeletes(root, ctx, { describe, remove, after }) {
  $$("[data-card-del]", root).forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      const id = btn.dataset.cardDel;
      const name = describe(id);
      if (!await confirmInline(btn, `Delete ${name}?`)) return;
      undoable(ctx, `Deleted ${name}`, () => remove(id), after);
    };
    btn.onmousedown = e => e.stopPropagation();
  });
}

/**
 * Run `fn` once the browser has laid out and drawn the current changes (two animation frames later).
 * Animations started then run smoothly, instead of stalling while a freshly built page is laid out.
 */
// ---- collapsible switchers: only the active option shows; the others slide out on hover / focus.
const openSegs = new Set();      // switchers that were open when an option was clicked (they re-render open)

/** " open" if this switcher should start open (it was open when its option was chosen). */
export const segOpenClass = key => (openSegs.has(key) ? " open" : "");

/** Make a .seg.collapsible switcher remember being open across a re-render, and close when left. */
export function collapsible(seg, key) {
  if (!seg?.classList.contains("collapsible")) return;
  const close = () => { openSegs.delete(key); seg.classList.remove("open"); };
  seg.addEventListener("click", () => { if (seg.matches(":hover, :focus-within")) openSegs.add(key); }, true);
  seg.addEventListener("mouseleave", close);
  seg.addEventListener("focusout", e => { if (!seg.contains(e.relatedTarget) && !seg.matches(":hover")) close(); });
  // re-rendered open, but the pointer has already moved away: close on the next move
  if (seg.classList.contains("open")) {
    const check = () => { removeEventListener("pointermove", check); if (!seg.matches(":hover")) close(); };
    addEventListener("pointermove", check);
  }
}

/**
 * Keep a switcher's highlight on its active button while the switcher changes size (a collapsible one
 * opening or closing). Starts after `delay` ms, so it never interrupts the slide to a new option.
 */
export function followThumb(seg, thumb, place, delay = 0) {
  if (!seg.classList.contains("collapsible")) return;
  let ready = false;
  const sync = () => {
    const on = seg.querySelector("button.on");
    if (!ready || !on || !thumb.isConnected) return;
    thumb.classList.remove("animate");
    place(on);
    void thumb.offsetWidth;
    thumb.classList.add("animate");
  };
  setTimeout(() => { ready = true; sync(); }, delay);
  new ResizeObserver(sync).observe(seg);
}

export const afterPaint = fn => requestAnimationFrame(() => requestAnimationFrame(fn));

/**
 * Orange sliding highlight for a tab switcher (.seg), like the Write / Corkboard / Outliner bar.
 * `fromKey` is the previously selected tab's value (or null on first render); `attr` names the data attribute.
 * When the tab changed, the highlight slides over and `content` (the new tab's body) fades in.
 */
export function slideTabs(seg, fromKey, attr, content = null) {
  if (!seg) return false;
  const target = seg.querySelector("button.on");
  seg.classList.add("sliding");
  const thumb = document.createElement("span");
  thumb.className = "seg-thumb";
  seg.prepend(thumb);
  const place = btn => { thumb.style.left = btn.offsetLeft + "px"; thumb.style.width = btn.offsetWidth + "px"; };
  const from = fromKey && seg.querySelector(`[${attr}="${fromKey}"]`);
  if (!target) { thumb.classList.add("gone"); return false; }
  place(from || target);
  followThumb(seg, thumb, place, from && from !== target ? 450 : 0);
  if (from && from !== target) {
    content?.classList.add("tab-pending");      // the new tab waits, invisible, for its fade-in
    afterPaint(() => {
      thumb.classList.add("animate");
      place(target);
      content?.classList.replace("tab-pending", "tab-enter");
    });
    return true;
  }
  requestAnimationFrame(() => thumb.classList.add("animate"));
  return false;
}
