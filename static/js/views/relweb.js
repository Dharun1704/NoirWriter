// Relationship web: characters as nodes, their relationships as labelled lines.
// A live force simulation (in the spirit of Obsidian's graph view): people repel each other,
// relationships act as springs, and dragging someone pulls their connections along before
// everything settles. Scroll to zoom, drag the background to pan. Dragged layouts are saved.

import { $, $$, esc, initials } from "../ui.js";

const W = 1000, H = 640;
const LINK = 120;                 // resting length of a relationship
const CHARGE = 1100;              // how strongly people push apart
const CENTER = 0.03;              // gentle pull to the middle
const DECAY = 0.6;                // velocity kept each frame
const ALPHA_DECAY = 0.022;        // how quickly the motion cools down
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let view = null;                  // {k, x, y}: zoom and pan survive re-renders while you stay on the page

export function renderRelationshipWeb(ctx, body) {
  const { project: p } = ctx;
  if (p.characters.length < 2) {
    body.innerHTML = `<p class="list-hint">Add at least two characters and give them relationships (on each character's page) to see the web.</p>`;
    return;
  }

  // ---- graph data
  const nodes = p.characters.map((c, i) => ({ c, id: c.id, i, x: c.webPos?.x, y: c.webPos?.y, vx: 0, vy: 0, deg: 0 }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const pairs = new Map();          // one edge per pair; both directions' labels kept
  for (const c of p.characters) for (const r of c.relationships) {
    if (!r.targetId || !byId.has(r.targetId) || r.targetId === c.id) continue;
    const key = [c.id, r.targetId].sort().join("|");
    const e = pairs.get(key) || { a: byId.get(c.id), b: byId.get(r.targetId), labels: [] };
    e.labels.push({ from: c.id, text: r.type || "related" });
    pairs.set(key, e);
  }
  const edges = [...pairs.values()];
  edges.forEach(e => { e.a.deg++; e.b.deg++; });
  nodes.forEach(n => { n.r = Math.min(9 + n.deg * 2.5, 20); });     // better-connected people are bigger
  const lonely = nodes.filter(n => !n.deg).length;

  // anyone without a saved spot starts in a small ring at the centre and bursts outwards
  const placed = nodes.filter(n => n.x != null).length;
  nodes.filter(n => n.x == null).forEach((n, i, arr) => {
    const a = (i / arr.length) * Math.PI * 2 + 0.4;
    n.x = W / 2 + Math.cos(a) * 30;
    n.y = H / 2 + Math.sin(a) * 30;
  });

  body.innerHTML = `
    <div class="relweb-head">
      <span class="muted small">${edges.length} relationship${edges.length === 1 ? "" : "s"} between ${p.characters.length} characters${lonely ? ` · ${lonely} with none yet` : ""}.
        Drag people · scroll to zoom · drag the background to pan · click to open.</span>
      <span class="grow"></span>
      <button class="btn sm ghost" data-relayout title="Forget the saved layout and let the web find its own shape">Reset layout</button>
    </div>
    <div class="relweb">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Character relationship web">
        <defs>${nodes.filter(n => n.c.portrait).map(n =>
          `<pattern id="pt-${n.id}" patternUnits="objectBoundingBox" width="1" height="1"><image href="${n.c.portrait}" width="${n.r * 2}" height="${n.r * 2}" preserveAspectRatio="xMidYMid slice"/></pattern>`).join("")}</defs>
        <g class="rw-world">
          <g class="rw-edges">${edges.map((e, i) => {
            const label = e.labels.length === 2 && e.labels[0].text !== e.labels[1].text
              ? `${e.labels.find(l => l.from === e.a.id).text} / ${e.labels.find(l => l.from === e.b.id).text}`
              : e.labels[0].text;
            return `<g data-edge="${i}" data-a="${e.a.id}" data-b="${e.b.id}"><line/><text text-anchor="middle">${esc(label.length > 34 ? label.slice(0, 33) + "…" : label)}</text></g>`;
          }).join("")}</g>
          <g class="rw-nodes">${nodes.map(n => `
            <g class="rw-node" data-node="${n.id}">
              <g class="rw-pop" style="--d:${n.i * 35}ms">
                <circle r="${n.r}" ${n.c.portrait ? `fill="url(#pt-${n.id})"` : ""}/>
                ${n.c.portrait || n.r < 13 ? "" : `<text class="rw-initials" text-anchor="middle" dy="3.5">${initials(n.c.name)}</text>`}
                <text class="rw-name" text-anchor="middle" y="${n.r + 15}">${esc(n.c.name)}</text>
                <text class="rw-role" text-anchor="middle" y="${n.r + 28}">${esc(n.c.role || "")}</text>
              </g>
            </g>`).join("")}</g>
        </g>
      </svg>
      <div class="rw-zoom">
        <button class="icon-btn" data-zoom="in" title="Zoom in">+</button>
        <button class="icon-btn" data-zoom="out" title="Zoom out">−</button>
        <button class="icon-btn" data-zoom="fit" title="Fit everyone in view">⤢</button>
      </div>
    </div>`;

  const svg = $("svg", body);
  const world = $(".rw-world", svg);
  const nodeEls = new Map($$(".rw-node", svg).map(g => [g.dataset.node, g]));
  const edgeEls = $$("[data-edge]", svg).map(g => ({ line: $("line", g), text: $("text", g) }));

  // ---- zoom & pan
  view = view || { k: 1, x: 0, y: 0 };
  if (!nodes.every(n => n.c.webPos)) view = { k: 1, x: 0, y: 0 };
  const applyView = () => {
    world.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.k})`);
    svg.classList.toggle("far", view.k < 0.65);       // zoomed out: labels fade, like Obsidian
  };
  applyView();
  const toSvg = e => {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  const toWorld = e => { const q = toSvg(e); return { x: (q.x - view.x) / view.k, y: (q.y - view.y) / view.k }; };
  const clampK = k => Math.max(0.3, Math.min(3, k));
  let viewAnim = 0;
  const animateView = target => {
    cancelAnimationFrame(viewAnim);
    const from = { ...view }, t0 = performance.now(), dur = reduceMotion ? 1 : 420;
    const step = now => {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      view.k = from.k + (target.k - from.k) * e;
      view.x = from.x + (target.x - from.x) * e;
      view.y = from.y + (target.y - from.y) * e;
      applyView();
      if (t < 1) viewAnim = requestAnimationFrame(step);
    };
    viewAnim = requestAnimationFrame(step);
  };
  const fitTarget = () => {
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    const x0 = Math.min(...xs) - 90, x1 = Math.max(...xs) + 90, y0 = Math.min(...ys) - 50, y1 = Math.max(...ys) + 70;
    const k = Math.max(0.3, Math.min(1.3, W / (x1 - x0), H / (y1 - y0)));
    return { k, x: W / 2 - k * (x0 + x1) / 2, y: H / 2 - k * (y0 + y1) / 2 };
  };
  const fit = () => { follow = false; animateView(fitTarget()); };
  // while a new web unfolds, the camera eases along so everyone ends up in frame
  let follow = !nodes.every(n => n.c.webPos) && !reduceMotion;
  const followCamera = () => {
    const t = fitTarget();
    view.k += (t.k - view.k) * 0.08; view.x += (t.x - view.x) * 0.08; view.y += (t.y - view.y) * 0.08;
    applyView();
  };
  svg.addEventListener("wheel", e => {
    e.preventDefault();
    cancelAnimationFrame(viewAnim);
    follow = false;
    const q = toSvg(e), k = clampK(view.k * Math.exp(-e.deltaY * 0.0015));
    view.x = q.x - (q.x - view.x) * k / view.k;      // zoom around the pointer
    view.y = q.y - (q.y - view.y) * k / view.k;
    view.k = k;
    applyView();
  }, { passive: false });
  $$("[data-zoom]", body).forEach(b => b.onclick = () => {
    if (b.dataset.zoom === "fit") return fit();
    follow = false;
    const k = clampK(view.k * (b.dataset.zoom === "in" ? 1.3 : 1 / 1.3));
    animateView({ k, x: W / 2 - (W / 2 - view.x) * k / view.k, y: H / 2 - (H / 2 - view.y) * k / view.k });
  });
  svg.addEventListener("dblclick", e => { if (!e.target.closest(".rw-node")) fit(); });

  // ---- the simulation
  let alpha = placed === nodes.length ? 0.12 : 1;     // a saved layout only breathes; a new one unfolds
  let alphaTarget = 0, raf = 0, dragged = null, userMoved = false;

  function tick() {
    alpha += (alphaTarget - alpha) * ALPHA_DECAY;
    for (let i = 0; i < nodes.length; i++) {          // everyone pushes everyone away
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        if (!dx && !dy) { dx = (i - j) * 0.1; dy = 0.1; }
        const d2 = Math.max(dx * dx + dy * dy, 400), f = CHARGE * alpha / d2;
        a.vx += dx * f; a.vy += dy * f;
        b.vx -= dx * f; b.vy -= dy * f;
      }
      a.vx += (W / 2 - a.x) * CENTER * alpha;
      a.vy += (H / 2 - a.y) * CENTER * alpha * 1.3;
    }
    for (const e of edges) {                          // relationships pull people together
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.hypot(dx, dy) || 1;
      const f = (d - LINK) / d * 0.06 * alpha;
      e.a.vx += dx * f; e.a.vy += dy * f;
      e.b.vx -= dx * f; e.b.vy -= dy * f;
    }
    for (const n of nodes) {
      if (n === dragged) { n.vx = n.vy = 0; continue; }
      n.vx *= DECAY; n.vy *= DECAY;
      n.x += n.vx; n.y += n.vy;
    }
  }

  function paint() {
    for (const n of nodes) nodeEls.get(n.id).setAttribute("transform", `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`);
    edges.forEach((e, i) => {
      const { line, text } = edgeEls[i];
      line.setAttribute("x1", e.a.x.toFixed(1)); line.setAttribute("y1", e.a.y.toFixed(1));
      line.setAttribute("x2", e.b.x.toFixed(1)); line.setAttribute("y2", e.b.y.toFixed(1));
      text.setAttribute("x", ((e.a.x + e.b.x) / 2).toFixed(1));
      text.setAttribute("y", ((e.a.y + e.b.y) / 2 - 5).toFixed(1));
    });
  }

  function frame() {
    if (!svg.isConnected) { raf = 0; return; }       // page changed: stop quietly
    tick();
    paint();
    if (follow) followCamera();
    if (alpha > 0.004 || alphaTarget > 0) raf = requestAnimationFrame(frame);
    else { raf = 0; follow = false; settled(); }
  }
  const heat = (a = 0.3) => {
    alpha = Math.max(alpha, a);
    if (!raf) raf = requestAnimationFrame(frame);
  };
  // after you've rearranged things, remember where everyone ended up
  function settled() {
    if (!userMoved) return;
    userMoved = false;
    nodes.forEach(n => { n.c.webPos = { x: Math.round(n.x), y: Math.round(n.y) }; });
    ctx.save();
  }

  if (reduceMotion) { for (let s = 0; s < 300; s++) tick(); alpha = 0; paint(); }
  else {
    paint();
    if (!placed) { svg.classList.add("entering"); setTimeout(() => svg.classList.remove("entering"), 1200); }
    heat(alpha);
  }

  // ---- hover highlight
  const neighbours = id => new Set(edges.flatMap(e => e.a.id === id ? [e.b.id] : e.b.id === id ? [e.a.id] : []));
  const highlight = id => {
    svg.classList.toggle("focus", !!id);
    const near = id ? neighbours(id) : new Set();
    nodeEls.forEach((g, nid) => g.classList.toggle("hot", !!id && (nid === id || near.has(nid))));
    $$("[data-edge]", svg).forEach(g => g.classList.toggle("hot", !!id && (g.dataset.a === id || g.dataset.b === id)));
  };

  // ---- dragging people and panning the background
  svg.addEventListener("pointerover", e => { if (!dragged) highlight(e.target.closest(".rw-node")?.dataset.node || null); });
  svg.addEventListener("pointerleave", () => { if (!dragged) highlight(null); });
  svg.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    e.preventDefault();
    const g = e.target.closest(".rw-node");
    const start = toSvg(e);
    let moved = false;
    if (g) {
      const n = byId.get(g.dataset.node), w0 = toWorld(e), ox = n.x, oy = n.y;
      dragged = n;
      svg.classList.add("dragging");
      const move = ev => {
        const q = toSvg(ev);
        if (!moved && Math.hypot(q.x - start.x, q.y - start.y) < 4) return;
        if (!moved) { moved = true; follow = false; alphaTarget = 0.3; heat(); }
        const w = toWorld(ev);
        n.x = ox + w.x - w0.x; n.y = oy + w.y - w0.y;
      };
      const up = () => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
        dragged = null;
        alphaTarget = 0;
        svg.classList.remove("dragging");
        if (!moved) return ctx.go("characters", n.id);
        userMoved = true;
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", up);
    } else {
      const v0 = { ...view };
      cancelAnimationFrame(viewAnim);
      follow = false;
      svg.classList.add("panning");
      const move = ev => {
        const q = toSvg(ev);
        view.x = v0.x + q.x - start.x; view.y = v0.y + q.y - start.y;
        applyView();
      };
      const up = () => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
        svg.classList.remove("panning");
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", up);
    }
  });

  $("[data-relayout]", body).onclick = () => {
    p.characters.forEach(c => { delete c.webPos; });
    ctx.save();
    view = { k: 1, x: 0, y: 0 };
    renderRelationshipWeb(ctx, body);
  };
}
