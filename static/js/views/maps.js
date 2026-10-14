// Maps: upload an image, pan and zoom it, and drop pins that link to places and other entries.

import { uid, api, findItem, refTargets, hasFeature, CODEX_KEYS } from "../store.js";
import { featureByKey, peopleLabel } from "../features.js";
import { $, $$, esc, plural, modal, confirmInline, undoable, promptBox, pickFile, toast } from "../ui.js";

const PIN_COLORS = ["#c9a45c", "#c4544a", "#6d8fb3", "#7fa36b", "#a07cc0", "#e8e2d6"];
const views = {};          // per-map zoom/pan
let addMode = false;

export function renderMaps(ctx) {
  const { project: p, el } = ctx;
  const map = p.maps.find(m => m.id === ctx.item) || p.maps[0];

  el.innerHTML = `
    <div class="page-head">
      <h2>Maps</h2>
      <div class="map-tabs">${p.maps.map(m =>
        `<button class="map-tab ${m === map ? "on" : ""}" data-map="${m.id}">${esc(m.name)}</button>`).join("")}
        ${p.maps.length ? `<button class="map-tab add" data-new-map title="Upload another map">+ New map</button>` : ""}</div>
      <div class="grow"></div>
    </div>
    <div class="map-layout" id="map-layout"></div>`;

  $$("[data-map]", el).forEach(b => b.onclick = () => ctx.go("maps", b.dataset.map));
  $("[data-new-map]", el)?.addEventListener("click", () => newMap(ctx));

  const layout = $("#map-layout");
  if (!map) {
    layout.innerHTML = `<div class="empty" style="grid-column:1/-1">No maps yet.<br>
      <span class="small" style="font-family:var(--font-ui)">Upload a map image (PNG, JPG or WebP) — drawn by hand, made in Inkarnate or Wonderdraft, anything.</span><br>
      <button class="btn primary" data-first>Upload a map</button></div>`;
    $("[data-first]", layout).onclick = () => newMap(ctx);
    return;
  }
  renderMap(ctx, map);
}

async function newMap(ctx) {
  const file = await pickFile("image/png,image/jpeg,image/webp,image/gif");
  if (!file) return;
  const name = await promptBox("New map", "Map name", file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  if (!name) return;
  try {
    const image = await api.uploadAsset(ctx.project.id, file);
    const m = { id: uid(), name, image, pins: [] };
    ctx.project.maps.push(m);
    ctx.save();
    ctx.go("maps", m.id);
  } catch (e) { toast(e.message); }
}

function linkTargets(p) {
  const groups = [{ key: "characters", label: peopleLabel(p.genre).plural, items: p.characters }];
  for (const k of CODEX_KEYS) {
    if (k === "notes" || !hasFeature(p, k)) continue;
    const items = refTargets(p, k);
    if (items.length) groups.push({ key: k, label: featureByKey(k).label, items });
  }
  return groups;
}

function renderMap(ctx, map) {
  const { project: p } = ctx;
  const layout = $("#map-layout");
  const v = (views[map.id] ||= { zoom: 1, x: 0, y: 0, fitted: false });
  if (!(v.zoom > 0.01)) v.fitted = false;

  layout.innerHTML = `
    <div class="map-stage ${addMode ? "adding" : ""}" id="stage">
      <div class="map-inner" id="inner">
        <img src="${esc(map.image)}" id="map-img" draggable="false" alt="${esc(map.name)}">
        ${map.pins.map(pin => {
          const linked = findItem(p, pin.itemId)?.item;
          return `<div class="pin" data-pin="${pin.id}" style="left:${pin.x}%;top:${pin.y}%;--pin:${pin.color || PIN_COLORS[0]}">
            <span class="pin-dot"></span><span class="pin-label">${esc(pin.label || linked?.name || "Pin")}</span></div>`;
        }).join("")}
      </div>
      <div class="map-controls">
        <button class="btn sm ${addMode ? "primary" : ""}" data-add-pin title="Click on the map to drop a pin">${addMode ? "Click the map…" : "⌖ Add pin"}</button>
        <button class="btn sm" data-zoom="1.25" title="Zoom in">＋</button>
        <button class="btn sm" data-zoom="0.8" title="Zoom out">－</button>
        <button class="btn sm" data-fit title="Fit to screen">Fit</button>
      </div>
    </div>
    <aside class="map-side">
      <div class="section-title">${esc(map.name)}</div>
      <div class="map-actions">
        <button class="btn sm" data-rename>Rename</button>
        <button class="btn sm" data-replace>Replace image</button>
        <button class="btn sm danger" data-delete>Delete</button>
      </div>
      <div class="section-title" style="margin-top:18px">Pins (${map.pins.length})</div>
      ${map.pins.length ? map.pins.map(pin => {
        const f = findItem(p, pin.itemId);
        return `<div class="pin-row" data-pin-row="${pin.id}">
          <span class="dot" style="background:${pin.color || PIN_COLORS[0]}"></span>
          <span class="grow"><b>${esc(pin.label || f?.item.name || "Pin")}</b>${f ? `<br><span class="faint small">${esc(f.key === "characters" ? "Character" : featureByKey(f.key).singular)}</span>` : ""}</span>
        </div>`;
      }).join("") : `<div class="faint small">Press “Add pin”, then click anywhere on the map. Drag pins to move them.</div>`}
    </aside>`;

  const stage = $("#stage");
  const inner = $("#inner");
  const img = $("#map-img");
  const apply = () => {
    inner.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
    inner.style.setProperty("--inv", 1 / v.zoom);
  };
  const fit = () => {
    const sw = stage.clientWidth, sh = stage.clientHeight;
    if (!sw || !sh) return requestAnimationFrame(() => document.body.contains(stage) && fit());
    const iw = img.naturalWidth || 1000, ih = img.naturalHeight || 700;
    v.zoom = Math.min(sw / iw, sh / ih) * 0.96;
    v.x = (sw - iw * v.zoom) / 2;
    v.y = (sh - ih * v.zoom) / 2;
    v.fitted = true;
    apply();
  };
  const zoomAt = (factor, cx, cy) => {
    const nz = Math.max(0.05, Math.min(8, v.zoom * factor));
    v.x = cx - (cx - v.x) * (nz / v.zoom);
    v.y = cy - (cy - v.y) * (nz / v.zoom);
    v.zoom = nz;
    apply();
  };
  if (img.complete && img.naturalWidth) { v.fitted ? apply() : fit(); }
  else img.onload = () => (v.fitted ? apply() : fit());
  img.onerror = () => toast("Couldn't load the map image");

  stage.onwheel = e => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  };
  $$("[data-zoom]", layout).forEach(b => b.onclick = () => zoomAt(+b.dataset.zoom, stage.clientWidth / 2, stage.clientHeight / 2));
  $("[data-fit]", layout).onclick = fit;
  $("[data-add-pin]", layout).onclick = () => { addMode = !addMode; renderMap(ctx, map); };

  // pan the map, or drop a pin in add mode
  stage.onmousedown = e => {
    if (e.button !== 0 || e.target.closest(".pin, .map-controls")) return;
    const start = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y };
    let moved = false;
    const move = ev => {
      if (Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) > 4) moved = true;
      v.x = start.vx + ev.clientX - start.x;
      v.y = start.vy + ev.clientY - start.y;
      apply();
    };
    const up = ev => {
      removeEventListener("mousemove", move);
      removeEventListener("mouseup", up);
      if (!moved && addMode) {
        const r = img.getBoundingClientRect();
        const x = ((ev.clientX - r.left) / r.width) * 100;
        const y = ((ev.clientY - r.top) / r.height) * 100;
        if (x < 0 || x > 100 || y < 0 || y > 100) return;
        const pin = { id: uid(), x: +x.toFixed(2), y: +y.toFixed(2), label: "", itemId: "", color: PIN_COLORS[0], note: "" };
        map.pins.push(pin);
        addMode = false;
        ctx.save();
        renderMap(ctx, map);
        editPin(ctx, map, pin, true);
      }
    };
    addEventListener("mousemove", move);
    addEventListener("mouseup", up);
  };

  // drag pins; a click without movement opens the editor
  $$("[data-pin]", stage).forEach(el => {
    el.onmousedown = e => {
      e.stopPropagation();
      const pin = map.pins.find(x => x.id === el.dataset.pin);
      const start = { x: e.clientX, y: e.clientY };
      let moved = false;
      const move = ev => {
        if (Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) > 3) moved = true;
        if (!moved) return;
        const r = img.getBoundingClientRect();
        pin.x = +Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100)).toFixed(2);
        pin.y = +Math.max(0, Math.min(100, ((ev.clientY - r.top) / r.height) * 100)).toFixed(2);
        el.style.left = pin.x + "%";
        el.style.top = pin.y + "%";
      };
      const up = () => {
        removeEventListener("mousemove", move);
        removeEventListener("mouseup", up);
        if (moved) ctx.save(); else editPin(ctx, map, pin, false);
      };
      addEventListener("mousemove", move);
      addEventListener("mouseup", up);
    };
  });
  $$("[data-pin-row]", layout).forEach(row => row.onclick = () => {
    const pin = map.pins.find(x => x.id === row.dataset.pinRow);
    const r = img.getBoundingClientRect(), s = stage.getBoundingClientRect();
    // centre the pin
    v.x += s.left + s.width / 2 - (r.left + (pin.x / 100) * r.width);
    v.y += s.top + s.height / 2 - (r.top + (pin.y / 100) * r.height);
    apply();
    const pinEl = $(`[data-pin="${pin.id}"]`);
    pinEl.classList.add("flash");
    setTimeout(() => pinEl.classList.remove("flash"), 1200);
  });

  $("[data-rename]", layout).onclick = async () => {
    const name = await promptBox("Rename map", "Map name", map.name);
    if (name) { map.name = name; ctx.save(); renderMaps({ ...ctx, item: map.id }); }
  };
  $("[data-replace]", layout).onclick = async () => {
    const file = await pickFile("image/png,image/jpeg,image/webp,image/gif");
    if (!file) return;
    try {
      map.image = await api.uploadAsset(p.id, file);
      v.fitted = false;
      ctx.save();
      renderMap(ctx, map);
      toast("Image replaced — pins kept their positions");
    } catch (e) { toast(e.message); }
  };
  $("[data-delete]", layout).onclick = async e => {
    if (!await confirmInline(e.currentTarget, `Delete this map and its ${plural(map.pins.length, "pin")}?`)) return;
    undoable(ctx, `Deleted map “${map.name}”`, () => { p.maps = p.maps.filter(m => m !== map); },
      undone => ctx.go("maps", undone ? map.id : ""));
  };
}

async function editPin(ctx, map, pin, isNew) {
  const { project: p } = ctx;
  const groups = linkTargets(p);
  let color = pin.color || PIN_COLORS[0];
  const linked = findItem(p, pin.itemId);
  const r = await modal({
    title: isNew ? "New pin" : "Edit pin",
    body: `
      <label class="field"><span>Linked to</span><select name="itemId"><option value="">— nothing —</option>
        ${groups.map(g => `<optgroup label="${esc(g.label)}">${g.items.map(it =>
          `<option value="${it.id}" ${it.id === pin.itemId ? "selected" : ""}>${esc(it.name)}</option>`).join("")}</optgroup>`).join("")}
      </select></label>
      <label class="field"><span>Label (optional — defaults to the linked name)</span><input type="text" name="label" value="${esc(pin.label)}"></label>
      <label class="field"><span>Colour</span><div class="color-swatches">${PIN_COLORS.map(c =>
        `<button type="button" data-color="${c}" class="${c === color ? "on" : ""}" style="background:${c}"></button>`).join("")}</div></label>
      <label class="field"><span>Note</span><textarea name="note" rows="2">${esc(pin.note || "")}</textarea></label>`,
    buttons: [
      { label: "Delete pin", value: "delete", left: true, kind: "danger", confirm: "Delete this pin?" },
      ...(linked ? [{ label: `Open ${linked.item.name}`, value: "open" }] : []),
      { label: "Save", kind: "primary", value: "save" },
    ],
    onMount: root => $$("[data-color]", root).forEach(b => b.onclick = () => {
      color = b.dataset.color;
      $$("[data-color]", root).forEach(x => x.classList.toggle("on", x === b));
    }),
  });
  if (!r) { if (isNew && !pin.itemId && !pin.label) { map.pins = map.pins.filter(x => x !== pin); ctx.save(); renderMap(ctx, map); } return; }
  if (r.value === "delete") {
    map.pins = map.pins.filter(x => x !== pin);
  } else if (r.value === "open") {
    return ctx.go(linked.key, linked.item.id);
  } else {
    pin.itemId = r.root.querySelector("[name=itemId]").value;
    pin.label = r.root.querySelector("[name=label]").value.trim();
    pin.note = r.root.querySelector("[name=note]").value;
    pin.color = color;
  }
  ctx.save();
  renderMap(ctx, map);
}
