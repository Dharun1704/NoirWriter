// The book as HTML: the compile preview, the PDF (a print-ready page the browser saves as PDF) and
// the web page. Also the Markdown and plain-text versions. All of them render from buildBook().

import { FONTS, PAGE_SIZES, MARGINS, headingText, breakMark, paragraphsOf } from "./model.js";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cssString = s => '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ") + '"';
const paras = (text, cls = "") => paragraphsOf(text).map(t => `<p${cls ? ` class="${cls}"` : ""}>${esc(t).replace(/\n/g, "<br>")}</p>`).join("");

// ---------------------------------------------------------------- chapter bodies (shared with Word and EPUB)

/**
 * A chapter's heading and scenes as clean HTML: <h1 class="ch-head">, optional scene titles, each
 * scene in <div class="scene">, scene breaks as <p class="scene-break">. The paragraph that opens
 * the chapter, a scene or follows a break gets class "first" (it isn't indented in book layouts).
 */
export function chapterBodyHtml(ch, L) {
  const mark = breakMark(L);
  const breakHtml = `<p class="scene-break">${esc(mark) || "&nbsp;"}</p>`;
  const head = `<h1 class="ch-head">${ch.label ? `<span class="ch-label">${esc(ch.label)}</span>` : ""}${
    ch.title ? `<span class="ch-title">${esc(ch.title)}</span>` : ""}</h1>`;
  const scenes = ch.scenes.map((s, i) =>
    (i > 0 && !L.sceneTitles ? breakHtml : "") +
    (L.sceneTitles && s.title ? `<h2 class="scene-title">${esc(s.title)}</h2>` : "") +
    `<div class="scene">${s.html.replace(/<hr\s*\/?>/gi, breakHtml)}</div>`).join("");
  const div = document.createElement("div");
  div.innerHTML = head + scenes;
  // mark the opening paragraphs
  let opening = true;
  const walk = node => {
    for (const el of node.children) {
      if (el.matches(".ch-head, .scene-title, .scene-break")) { opening = true; continue; }
      if (el.classList.contains("scene")) { opening = true; walk(el); continue; }
      if (el.tagName === "P" && opening) { el.classList.add("first"); opening = false; continue; }
      if (el.textContent.trim()) opening = false;
    }
  };
  walk(div);
  return div.innerHTML;
}

// ---------------------------------------------------------------- the whole book

function frontHtml(book, item, L) {
  switch (item.kind) {
    case "title":
      if (L.look === "manuscript") {
        const contact = [book.legalName, ...book.contact.split("\n")].map(s => s.trim()).filter(Boolean);
        return `<section class="sheet front title-page manuscript">
          <div class="tp-top"><div class="tp-contact">${contact.map(esc).join("<br>") || "&nbsp;"}</div>
          <div class="tp-words">about ${book.approxWords.toLocaleString("en-US")} words</div></div>
          <div class="tp-middle"><p class="tp-title">${esc(book.title)}</p>${book.subtitle ? `<p class="tp-sub">${esc(book.subtitle)}</p>` : ""}
          ${book.author ? `<p class="tp-by">by ${esc(book.author)}</p>` : ""}</div></section>`;
      }
      return `<section class="sheet front title-page book"><div class="tp-middle">
        <p class="tp-title">${esc(book.title)}</p>${book.subtitle ? `<p class="tp-sub">${esc(book.subtitle)}</p>` : ""}
        ${book.author ? `<p class="tp-author">${esc(book.author)}</p>` : ""}</div></section>`;
    case "copyright":
      return `<section class="sheet front copyright">${paras(item.text)}</section>`;
    case "dedication":
      return `<section class="sheet front dedication">${paras(item.text)}</section>`;
    case "epigraph":
      return `<section class="sheet front epigraph">${paras(item.text)}${item.source ? `<p class="source">— ${esc(item.source)}</p>` : ""}</section>`;
    case "toc":
      return `<section class="sheet front toc"><h1 class="front-head">${esc(item.title)}</h1><ol>${book.chapters.map(ch =>
        `<li><a href="#ch-${ch.n}">${esc(headingText(ch))}</a></li>`).join("")}</ol></section>`;
    default:
      return "";
  }
}

/**
 * The full HTML document. `mode`:
 *   "print"   pages for printing / saving as PDF (also shown as sheets on screen);
 *   "preview" the same, for the compile window (with "…and N more chapters");
 *   "web"     a single readable column.
 */
export function bookHtml(book, { mode = "print", autoPrint = false } = {}) {
  const L = book.layout;
  const theEnd = book.theEnd ? `<p class="the-end">${L.look === "manuscript" ? "THE END" : "The End"}</p>` : "";
  const chapters = book.chapters.map((ch, i) =>
    `<section class="sheet chapter" id="ch-${ch.n}">${chapterBodyHtml(ch, L)}${
      i === book.chapters.length - 1 && !book.more ? theEnd : ""}</section>`).join("\n");
  const more = book.more
    ? `<section class="sheet more"><p>… and ${book.more} more chapter${book.more === 1 ? "" : "s"} in the finished file.</p></section>` : "";
  const back = book.back.map(b => `<section class="sheet back"><h1 class="front-head">${esc(b.title)}</h1>${paras(b.text, "plain")}</section>`).join("");
  const webFont = /Garamond/.test(L.font)
    ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap">` : "";
  const print = autoPrint
    ? `<script>addEventListener("load", () => document.fonts.ready.then(() => setTimeout(() => print(), 300)));</script>` : "";
  return `<!doctype html>
<html lang="${esc(book.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(book.title)}${book.author ? " — " + esc(book.author) : ""}</title>${webFont}
<style>${bookCss(book, mode)}</style>${print}</head>
<body class="${mode} look-${L.look}${L.indentFirst ? "" : " no-first-indent"}${L.justify ? " justify" : ""}">
${book.front.map(f => frontHtml(book, f, L)).join("\n")}${
  // facing pages: chapter one starts on a right-hand page, so an odd number of front pages gets a blank one
  (MARGINS[L.margins] || {}).mirror && mode !== "web" && book.front.length % 2 ? `<section class="sheet front blank-page"></section>` : ""}
${chapters}${more}
${back}
</body></html>`;
}

function bookCss(book, mode) {
  const L = book.layout;
  const page = PAGE_SIZES[L.pageSize] || PAGE_SIZES.letter;
  const m = MARGINS[L.margins] || MARGINS["1in"];
  const lh = (L.spacing * 1.15).toFixed(3);
  const font = FONTS[L.font] || FONTS["Times New Roman"];
  const manuscript = L.look === "manuscript";
  const contentH = page.h - m.top - m.bottom;
  const drop = L.chapterDrop && L.newPage ? Math.max(0.5, page.h / 3 - m.top) : 0.6;
  const web = mode === "web";

  let css = `
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font-family: ${font}; font-size: ${L.size}pt; line-height: ${lh}; color: #111; background: #fff; }
p { margin: 0; text-indent: ${L.indent}in; orphans: 2; widows: 2; }
body.justify .scene p:not(.scene-break) { text-align: justify; hyphens: auto; }
body.no-first-indent p.first, .scene-break, .the-end, p.plain { text-indent: 0; }
p.cont { text-indent: 0; }
body.justify .scene p.split { text-align-last: justify; }
.scene p:empty::before { content: "\\00a0"; }
.scene h1, .scene h2, .scene h3 { font-size: 1em; font-weight: bold; text-align: center; margin: 1em 0; }
.scene blockquote { margin: 0 0.5in; }
.scene blockquote p { text-indent: 0; }
.scene ul, .scene ol { margin: 0 0 0 0.5in; padding: 0; }
.scene pre { font-family: "Courier New", monospace; white-space: pre-wrap; margin: 0; }
.ch-head { text-align: center; font-weight: normal; font-size: 1em; margin: ${web ? "3em" : drop + "in"} 0 ${manuscript ? `${lh * 2}em` : "2.2em"}; break-after: avoid; }
.ch-head span { display: block; }
.scene-title { text-align: center; font-weight: normal; font-style: italic; font-size: 1em; margin: 1.5em 0 1em; break-after: avoid; }
.scene-break { text-align: center; margin: ${L.sceneBreak === "blank" ? "0" : manuscript ? "0" : "0.6em 0"}; break-after: avoid; }
.the-end { text-align: center; margin-top: 2em; }
.front-head { text-align: center; font-weight: normal; font-size: ${manuscript ? "1em" : "1.4em"}; margin: ${web ? "3em" : drop + "in"} 0 2em; }
.title-page { text-align: center; }
.title-page p { text-indent: 0; }
.tp-title { font-size: ${manuscript ? "1em" : "2.4em"}; line-height: 1.2; }
.tp-sub { font-size: ${manuscript ? "1em" : "1.25em"}; font-style: italic; margin-top: .4em; }
.tp-by { margin-top: ${lh}em; }
.tp-author { font-size: 1.3em; margin-top: 2.5em; letter-spacing: .04em; }
.manuscript .tp-top { display: flex; justify-content: space-between; text-align: left; line-height: 1.15; }
.manuscript .tp-words { text-align: right; }
.copyright p { text-indent: 0; font-size: .85em; line-height: 1.4; margin-bottom: .8em; }
.dedication, .epigraph { text-align: center; font-style: italic; }
.dedication p, .epigraph p { text-indent: 0; margin-bottom: .6em; }
.dedication { padding-top: ${web ? "2em" : drop + "in"}; }
.epigraph { padding-top: ${web ? "2em" : drop + "in"}; }
.epigraph .source { font-style: normal; margin-top: .6em; }
.toc ol { list-style: none; padding: 0; margin: 0 auto; max-width: 30em; }
.toc li { margin: .35em 0; }
.toc a { color: inherit; text-decoration: none; }
.back p { text-indent: 0; margin-bottom: .8em; }
.more p { text-indent: 0; text-align: center; font-style: italic; color: #777; padding-top: 2in; }
`;
  if (!manuscript) {
    css += `
.ch-label { font-size: .85em; letter-spacing: .18em; text-transform: uppercase; }
.ch-title { font-size: ${book.chapters.some(c => c.label) ? "1.5em" : "1.7em"}; margin-top: .35em; line-height: 1.25; }
.ch-head span:only-child.ch-label { font-size: 1.3em; letter-spacing: .12em; }
`;
  }

  if (web) {
    return css + `
body { background: #faf8f3; padding: 0 20px; }
.sheet { max-width: 34em; margin: 0 auto; padding: 2em 0; }
.sheet + .sheet { border-top: 1px solid #ddd; }
.title-page { padding: 6em 0; }
.manuscript .tp-top { margin-bottom: 4em; }
`;
  }

  // ---- pages: @page rules for print / PDF, and paper-like sheets on screen
  const head = book.runningHead;
  const box = `font-family: ${font}; font-size: ${L.size}pt;`;
  let margins = `margin: ${m.top}in ${m.outside}in ${m.bottom}in ${m.inside}in;`;
  let pageRules = `@page { size: ${page.w}in ${page.h}in; ${margins} }\n`;
  if (m.mirror) {
    pageRules += `@page :left { margin-left: ${m.outside}in; margin-right: ${m.inside}in; }
@page :right { margin-left: ${m.inside}in; margin-right: ${m.outside}in; }\n`;
  }
  if (L.header === "manuscript") {
    pageRules += `@page { @top-right { content: ${cssString(head)} counter(page); ${box} } }\n`;
  } else if (L.header === "book") {
    pageRules += `@page :left { @top-center { content: ${cssString(book.author || book.title)}; ${box} font-size: ${L.size * 0.85}pt; letter-spacing: .08em; } }
@page :right { @top-center { content: ${cssString(book.title)}; ${box} font-size: ${L.size * 0.85}pt; letter-spacing: .08em; } }
@page { @bottom-center { content: counter(page); ${box} font-size: ${L.size * 0.9}pt; } }\n`;
  } else if (L.header === "numbers") {
    pageRules += `@page { @bottom-center { content: counter(page); ${box} } }\n`;
  }
  // front-matter pages carry no header and aren't counted: the story starts on page 1, as in Word
  pageRules += `@page front { counter-increment: page 0; @top-right { content: none } @top-center { content: none } @bottom-center { content: none } }\n`;

  return css + pageRules + `
.front { page: front; }
${L.header === "book" ? `.chapter { page: chapter; }
@page chapter:first { @top-center { content: none } }` : ""}
.sheet { break-before: ${L.newPage ? "page" : "auto"}; }
.front, .back { break-before: page; }
.sheet:first-child { break-before: auto; }
.title-page { height: ${contentH - 0.05}in; display: flex; flex-direction: column; }
.title-page.book .tp-middle { margin-top: ${contentH / 4}in; }
.title-page.manuscript .tp-middle { margin: auto 0; }
.copyright { padding-top: ${contentH * 0.55}in; }
${L.newPage ? "" : ".chapter .ch-head { margin-top: 2.5em; }"}
@media screen {
  html { background: #6b6b6b; }
  body { padding: 28px 0; }
  .sheet {
    box-sizing: border-box; width: ${page.w}in; min-height: ${page.h}in; margin: 0 auto 28px; position: relative;
    padding: ${m.top}in ${m.outside}in ${m.bottom}in ${m.inside}in; background: #fff; box-shadow: 0 2px 14px rgba(0,0,0,.35);
  }
  .title-page { height: ${page.h}in; }
  .sheet.page { height: ${page.h}in; overflow: hidden; }
  .sheet.verso { padding-left: ${m.outside}in; padding-right: ${m.inside}in; }
  .sheet.verso .running-head { left: ${m.outside}in; right: ${m.inside}in; }
  .running-head { position: absolute; top: ${Math.max(0.3, m.top / 2)}in; left: ${m.inside}in; right: ${m.outside}in; ${box} line-height: 1.2; color: #444; }
  .running-head.manuscript { text-align: right; }
  .running-head.book { text-align: center; font-size: ${L.size * 0.85}pt; letter-spacing: .08em; }
  .running-foot { position: absolute; bottom: ${Math.max(0.3, m.bottom / 2)}in; left: 0; right: 0; text-align: center; ${box} font-size: ${L.size * 0.9}pt; color: #444; }
}
@media print {
  .running-head, .running-foot { display: none; }
  a { color: inherit; text-decoration: none; }
}
`;
}

// ---------------------------------------------------------------- the preview's pages

/**
 * Lay the preview out as real pages: chapters and back matter are split into page-sized sheets
 * (paragraphs break across pages mid-way), then each page gets its header and page number and, for
 * facing pages, its margins mirrored, as in the Word file. The PDF is paged by the browser instead.
 */
export async function paginatePreview(doc, book) {
  const L = book.layout;
  const page = PAGE_SIZES[L.pageSize] || PAGE_SIZES.letter;
  const m = MARGINS[L.margins] || MARGINS["1in"];
  await doc.fonts?.ready;                                  // measure with the real fonts
  const limit = (page.h - m.top - m.bottom) * 96;          // the text area's height in px
  for (const sheet of [...doc.querySelectorAll(".sheet.chapter, .sheet.back")]) paginateSheet(doc, sheet, limit);

  let physical = 0, n = 0;
  doc.querySelectorAll(".sheet").forEach(sheet => {
    physical++;
    if (m.mirror && physical % 2 === 0) sheet.classList.add("verso");    // a left-hand page
    if (sheet.classList.contains("front")) return;
    n++;     // the story's pages are numbered from 1, after the front matter
    if (L.header === "manuscript") {
      sheet.insertAdjacentHTML("afterbegin", `<div class="running-head manuscript">${esc(book.runningHead)}${n}</div>`);
    } else if (L.header === "book" || L.header === "numbers") {
      // in a book, a chapter's opening page has no running head, only the page number
      if (L.header === "book" && sheet.classList.contains("cont-page")) {
        sheet.insertAdjacentHTML("afterbegin", `<div class="running-head book">${esc(n % 2 ? book.title : book.author || book.title)}</div>`);
      }
      sheet.insertAdjacentHTML("beforeend", `<div class="running-foot">${n}</div>`);
    }
  });
}

/** Split one sheet into as many page-sized sheets as its content needs. */
function paginateSheet(doc, sheet, limit) {
  // the blocks in order, remembering which scene each came from (scenes are re-made on every page)
  const items = [];
  let sceneNo = 0;
  for (const child of [...sheet.children]) {
    if (child.classList.contains("scene")) {
      sceneNo++;
      for (const block of [...child.children]) items.push([block, sceneNo]);
    } else {
      items.push([child, 0]);
    }
  }
  sheet.replaceChildren();
  sheet.classList.add("page");
  let current = sheet, sceneEl = null, sceneOf = 0;

  const textTop = () => current.getBoundingClientRect().top + parseFloat(doc.defaultView.getComputedStyle(current).paddingTop);
  const overflows = el => el.getBoundingClientRect().bottom - textTop() > limit + 0.5;
  const container = s => {
    if (!s) return current;
    if (!sceneEl || sceneOf !== s || sceneEl.parentNode !== current) {
      sceneEl = doc.createElement("div");
      sceneEl.className = "scene";
      current.append(sceneEl);
      sceneOf = s;
    }
    return sceneEl;
  };
  const newPage = () => {
    const next = sheet.cloneNode(false);
    next.removeAttribute("id");
    next.classList.add("cont-page");
    current.after(next);
    current = next;
    sceneEl = null;
  };
  const isFirstOnPage = el => {
    const first = current.firstElementChild;
    return first === el || (first?.classList.contains("scene") && first.firstElementChild === el);
  };

  for (let [el, s] of items) {
    for (let guard = 0; guard < 500; guard++) {
      container(s).append(el);
      if (!overflows(el)) break;
      if (/^(P|LI|BLOCKQUOTE)$/.test(el.tagName) && !el.classList.contains("scene-break")) {
        const rest = splitBlock(doc, el, textTop() + limit);
        if (rest) { newPage(); el = rest; continue; }
      }
      if (isFirstOnPage(el)) break;                       // taller than a page: let it overflow
      el.remove();
      if (sceneEl && !sceneEl.childElementCount) sceneEl.remove();
      // a scene break or scene title doesn't stay alone at the foot of a page
      const last = current.lastElementChild;
      const prev = last?.classList.contains("scene") ? last.lastElementChild : last;
      const carry = prev && prev.matches(".scene-break, .scene-title") && !isFirstOnPage(prev) ? prev : null;
      if (carry) {
        carry.remove();
        if (sceneEl && !sceneEl.childElementCount) sceneEl.remove();
      }
      newPage();
      if (carry) container(s).append(carry);
    }
  }
}

/**
 * Split a paragraph at the last word that fits above `bottom` (px, in the page's coordinates).
 * Returns the rest as a new element, or null if not even one line fits.
 */
function splitBlock(doc, el, bottom) {
  const texts = [];
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) texts.push(walker.currentNode);
  const starts = [];
  let total = 0;
  for (const t of texts) { starts.push(total); total += t.length; }
  if (!total) return null;
  const locate = g => {
    let k = starts.length - 1;
    while (k > 0 && starts[k] > g) k--;
    return [texts[k], g - starts[k]];
  };
  const range = doc.createRange();
  const bottomOf = g => {
    const [node, i] = locate(g);
    range.setStart(node, i);
    range.setEnd(node, Math.min(i + 1, node.length));
    const rects = range.getClientRects();
    return rects.length ? rects[rects.length - 1].bottom : -Infinity;
  };
  // the first character below the line (the text runs top to bottom, so a binary search works)
  let lo = 0, hi = total - 1;
  if (bottomOf(hi) <= bottom) return null;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bottomOf(mid) > bottom) hi = mid; else lo = mid + 1;
  }
  const full = texts.map(t => t.data).join("");
  let cut = lo;
  while (cut > 0 && !/\s/.test(full[cut - 1])) cut--;     // back to the start of that word
  if (cut === 0) return null;
  const [node, offset] = locate(cut);
  range.setStart(node, offset);
  range.setEndAfter(el.lastChild);
  const rest = el.cloneNode(false);
  rest.append(range.extractContents());
  rest.classList.remove("first");
  rest.classList.add("cont");
  el.classList.add("split");
  return rest;
}

// ---------------------------------------------------------------- Markdown and plain text

function htmlToMarkdown(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  const walk = node => {
    if (node.nodeType === 3) return node.textContent.replace(/\s+/g, " ");
    if (node.nodeType !== 1) return "";
    const inner = [...node.childNodes].map(walk).join("");
    switch (node.nodeName) {
      case "B": case "STRONG": return inner.trim() ? `**${inner}**` : inner;
      case "I": case "EM": return inner.trim() ? `*${inner}*` : inner;
      case "S": case "STRIKE": case "DEL": return inner.trim() ? `~~${inner}~~` : inner;
      case "H1": case "H2": case "H3": return `\n#### ${inner.trim()}\n\n`;
      case "BLOCKQUOTE": return inner.trim().split("\n").map(l => `> ${l}`).join("\n") + "\n\n";
      case "LI": return (node.parentNode.nodeName === "OL" ? `${[...node.parentNode.children].indexOf(node) + 1}. ` : "- ") + inner.trim() + "\n";
      case "UL": case "OL": return inner + "\n";
      case "BR": return "  \n";
      case "P": case "DIV": case "PRE":
        if (node.classList.contains("scene-break")) return `\n${node.textContent.trim() ? node.textContent.trim().replace(/^#/, "\\#") : "&nbsp;"}\n\n`;
        return inner.trim() + "\n\n";
      default: return inner;
    }
  };
  return walk(div).trim();
}

function htmlToPlain(html) {
  const div = document.createElement("div");
  div.innerHTML = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|h[1-6]|li|blockquote|pre|div)>/gi, "$&\n\n");
  return div.textContent.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function bookMarkdown(book) {
  const out = [`# ${book.title}`];
  if (book.subtitle) out.push(`*${book.subtitle}*`);
  if (book.author) out.push(`by ${book.author}`);
  for (const f of book.front) {
    if (f.kind === "copyright" || f.kind === "dedication") out.push(paragraphsOf(f.text).join("\n\n"));
    if (f.kind === "epigraph") out.push(paragraphsOf(f.text).map(t => `> ${t}`).join("\n>\n") + (f.source ? `\n>\n> — ${f.source}` : ""));
    if (f.kind === "toc") out.push(`## Contents\n\n${book.chapters.map(ch => `- ${headingText(ch)}`).join("\n")}`);
  }
  for (const ch of book.chapters) {
    out.push(`## ${headingText(ch)}`);
    out.push(htmlToMarkdown(chapterBodyHtml(ch, book.layout).replace(/<h1 class="ch-head">.*?<\/h1>/, "")));
  }
  if (book.theEnd) out.push("THE END");
  for (const b of book.back) out.push(`## ${b.title}`, paragraphsOf(b.text).join("\n\n"));
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

export function bookText(book) {
  const L = book.layout;
  const out = [book.title.toUpperCase()];
  if (book.subtitle) out.push(book.subtitle);
  if (book.author) out.push(`by ${book.author}`);
  for (const f of book.front) {
    if (f.kind === "copyright" || f.kind === "dedication") out.push(paragraphsOf(f.text).join("\n\n"));
    if (f.kind === "epigraph") out.push(paragraphsOf(f.text).join("\n\n") + (f.source ? `\n\n— ${f.source}` : ""));
    if (f.kind === "toc") out.push("CONTENTS\n\n" + book.chapters.map(ch => headingText(ch)).join("\n"));
  }
  for (const ch of book.chapters) {
    out.push("", [ch.label, ch.title].filter(Boolean).join("\n").toUpperCase());
    const body = chapterBodyHtml(ch, L).replace(/<h1 class="ch-head">.*?<\/h1>/, "");
    out.push(htmlToPlain(body.replace(/<p class="scene-break">[^<]*<\/p>/g, `<p>${breakMark(L) || " "}</p>`)));
  }
  if (book.theEnd) out.push("", "THE END");
  for (const b of book.back) out.push("", b.title.toUpperCase(), paragraphsOf(b.text).join("\n\n"));
  return out.join("\n\n").replace(/\n{4,}/g, "\n\n\n").trim() + "\n";
}
