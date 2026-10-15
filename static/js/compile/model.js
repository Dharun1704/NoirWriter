// Compile settings (saved with the project as p.compile), the presets, and buildBook(): the project
// turned into a book (front matter, numbered chapters with their scenes, back matter) that every
// export format (Word, PDF, EPUB, web page, Markdown, plain text) renders from.

import { countWords, totalWords } from "../store.js";

export const FORMATS = {
  docx: { label: "Word", ext: "docx", hint: "Agents, editors, print-on-demand" },
  pdf:  { label: "PDF", ext: "pdf", hint: "Print, or save as PDF" },
  epub: { label: "EPUB", ext: "epub", hint: "Kindle, Apple Books, Kobo" },
  html: { label: "Web page", ext: "html", hint: "One page to read online" },
  md:   { label: "Markdown", ext: "md", hint: "For other writing apps" },
  txt:  { label: "Plain text", ext: "txt", hint: "Just the words" },
};

export const PAGE_SIZES = {
  letter: { label: "US Letter (8.5 × 11 in)", w: 8.5, h: 11 },
  a4:     { label: "A4 (210 × 297 mm)", w: 8.27, h: 11.69 },
  "6x9":  { label: "Trade paperback (6 × 9 in)", w: 6, h: 9 },
  "5.5x8.5": { label: "Digest (5.5 × 8.5 in)", w: 5.5, h: 8.5 },
  "5x8":  { label: "Pocket (5 × 8 in)", w: 5, h: 8 },
};

/** Page margins in inches: top, bottom, inside (left), outside (right); `mirror` for facing pages. */
export const MARGINS = {
  "1in":    { label: "1 inch all round", top: 1, bottom: 1, inside: 1, outside: 1 },
  "0.75in": { label: "¾ inch all round", top: 0.75, bottom: 0.75, inside: 0.75, outside: 0.75 },
  book:     { label: "Book (mirrored, wider inside)", top: 0.75, bottom: 0.75, inside: 0.875, outside: 0.625, mirror: true },
};

export const FONTS = {
  "Times New Roman": '"Times New Roman", Times, serif',
  "Courier New": '"Courier New", Courier, monospace',
  "Garamond": 'Garamond, "EB Garamond", "Adobe Garamond Pro", Georgia, serif',
  "Georgia": "Georgia, serif",
  "Palatino Linotype": '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  "Book Antiqua": '"Book Antiqua", Palatino, "Palatino Linotype", Georgia, serif',
  "Cambria": "Cambria, Georgia, serif",
};

export const HEADINGS = {
  "chapter-words": "Chapter One",
  "chapter-numbers": "Chapter 1",
  "words": "One",
  "numbers": "1",
  "roman": "I",
  "title": "Chapter title only",
};

export const SCENE_BREAKS = { "#": "#", "* * *": "* * *", "❦": "❦", "⁂": "⁂", "blank": "A blank line" };

export const RUNNING_HEADS = {
  manuscript: "Name / TITLE / page (manuscript)",
  book: "Author and title, page numbers at the foot",
  numbers: "Page numbers only",
  none: "None",
};

/** Presets set the layout, front and back matter, and the usual format. Everything stays editable. */
export const PRESETS = {
  manuscript: {
    label: "Standard manuscript",
    hint: "What agents and editors expect: 12 pt Times New Roman, double-spaced, 1-inch margins, a header with your name, the title and the page number, and chapters starting a third of the way down a new page.",
    format: "docx",
    layout: {
      look: "manuscript", font: "Times New Roman", size: 12, spacing: 2, indent: 0.5, indentFirst: true, justify: false,
      pageSize: "letter", margins: "1in", header: "manuscript", newPage: true, chapterDrop: true,
      heading: "chapter-words", chapterTitles: true, sceneTitles: false, sceneBreak: "#", keepFormatting: false, underlineItalics: false,
    },
    front: { titlePage: true, copyright: false, dedication: false, epigraph: false, toc: false },
    back: { theEnd: true, acknowledgements: false, about: false },
  },
  paperback: {
    label: "Paperback",
    hint: "A print-ready 6 × 9 in book for KDP, IngramSpark or Lulu: a book typeface, justified text, mirrored margins, author and title at the top of the pages and page numbers at the foot.",
    format: "docx",
    layout: {
      look: "book", font: "Garamond", size: 11.5, spacing: 1.15, indent: 0.3, indentFirst: false, justify: true,
      pageSize: "6x9", margins: "book", header: "book", newPage: true, chapterDrop: true,
      heading: "chapter-words", chapterTitles: true, sceneTitles: false, sceneBreak: "* * *", keepFormatting: false, underlineItalics: false,
    },
    front: { titlePage: true, copyright: true, dedication: true, epigraph: true, toc: false },
    back: { theEnd: false, acknowledgements: true, about: true },
  },
  ebook: {
    label: "E-book",
    hint: "A reflowable EPUB for Kindle (Send to Kindle or KDP), Apple Books, Kobo and Google Play: readers choose the font and size, with a linked table of contents.",
    format: "epub",
    layout: {
      look: "book", font: "Georgia", size: 12, spacing: 1.5, indent: 0.3, indentFirst: false, justify: false,
      pageSize: "6x9", margins: "book", header: "none", newPage: true, chapterDrop: true,
      heading: "chapter-words", chapterTitles: true, sceneTitles: false, sceneBreak: "❦", keepFormatting: false, underlineItalics: false,
    },
    front: { titlePage: true, copyright: true, dedication: true, epigraph: true, toc: true },
    back: { theEnd: false, acknowledgements: true, about: true },
  },
  readers: {
    label: "Beta readers",
    hint: "Easy to read on screen or on paper, with scene titles shown so readers can tell you where things stopped working: Georgia 12 pt, 1.5 line spacing.",
    format: "docx",
    layout: {
      look: "book", font: "Georgia", size: 12, spacing: 1.5, indent: 0.3, indentFirst: false, justify: false,
      pageSize: "letter", margins: "1in", header: "numbers", newPage: true, chapterDrop: false,
      heading: "chapter-words", chapterTitles: true, sceneTitles: true, sceneBreak: "* * *", keepFormatting: false, underlineItalics: false,
    },
    front: { titlePage: true, copyright: false, dedication: false, epigraph: false, toc: false },
    back: { theEnd: false, acknowledgements: false, about: false },
  },
};

/** US-style paper where people use it; A4 everywhere else. */
const localPaper = () => (/^(en-US|en-CA|es-MX|fr-CA)$/i.test(navigator.language || "") ? "letter" : "a4");

function presetValues(key) {
  const preset = structuredClone(PRESETS[key]);
  if (preset.layout.pageSize === "letter") preset.layout.pageSize = localPaper();
  return preset;
}

/** The project's compile settings, created with the manuscript preset the first time. */
export function compileSettings(p) {
  const base = presetValues("manuscript");
  p.compile ||= {};
  const c = p.compile;
  const fill = (obj, tpl) => { for (const k in tpl) if (obj[k] === undefined) obj[k] = tpl[k]; return obj; };
  fill(c, {
    preset: "manuscript", format: base.format, exclude: [], skipTodo: false, language: "en", cover: "", bookId: "",
    layout: {}, front: {}, back: {}, text: {},
  });
  fill(c.layout, base.layout);
  fill(c.front, base.front);
  fill(c.back, base.back);
  fill(c.text, {
    subtitle: "", author: "", penName: "", contact: "", header: "",
    copyright: "", dedication: "", epigraph: "", epigraphSource: "", acknowledgements: "", about: "",
  });
  if (!c.bookId) c.bookId = crypto.randomUUID?.() || ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, d => (d ^ Math.random() * 16 >> d / 4).toString(16));
  return c;
}

/** Switch to a preset: its layout, front and back matter and format. The texts you typed are kept. */
export function applyPreset(c, key) {
  const preset = presetValues(key);
  c.preset = key;
  c.format = preset.format;
  Object.assign(c.layout, preset.layout);
  Object.assign(c.front, preset.front);
  Object.assign(c.back, preset.back);
}

/** Has the layout been changed since the preset was chosen? */
export function presetEdited(c) {
  const preset = presetValues(c.preset);
  if (!preset) return true;
  return Object.keys(preset.layout).some(k => k !== "pageSize" && preset.layout[k] !== c.layout[k])
    || !PAGE_SIZES[c.layout.pageSize]
    || (["6x9", "5.5x8.5", "5x8"].includes(preset.layout.pageSize) && c.layout.pageSize !== preset.layout.pageSize);
}

// ---------------------------------------------------------------- numbers and names

const ONES = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

export function numberWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + numberWords(n % 100) : "");
  return String(n);
}

export function roman(n) {
  const table = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
}

function chapterLabel(n, style) {
  switch (style) {
    case "chapter-words": return "Chapter " + numberWords(n);
    case "chapter-numbers": return "Chapter " + n;
    case "words": return numberWords(n);
    case "numbers": return String(n);
    case "roman": return roman(n);
    default: return "";
  }
}

/** "Chapter One", "Chapter 12", "3": a title that only numbers the chapter adds nothing under a heading. */
const NUMBER_WORDS = new Set([...ONES, ...TENS.filter(Boolean), "hundred", "and"].map(w => w.toLowerCase()));
function isNumberOnlyTitle(title) {
  const t = title.trim().replace(/[.:]$/, "").replace(/^chapter\s+/i, "");
  if (/^\d+$/.test(t)) return true;
  if (t && /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(t)) return true;   // "XII", not "Civil"
  return t.toLowerCase().split(/[\s-]+/).every(w => NUMBER_WORDS.has(w));
}

/** Agents expect a rounded count: to the nearest hundred for short works, the nearest thousand for books. */
export function approxWords(n) {
  const step = n < 20000 ? 100 : 1000;
  return Math.max(step, Math.round(n / step) * step);
}

export const byline = (c) => c.text.penName.trim() || c.text.author.trim();

/** "Surname / TITLE / " for the manuscript header (the page number follows). */
export function runningHead(p, c) {
  if (c.text.header.trim()) return c.text.header.trim() + " / ";
  const name = (c.text.author.trim() || c.text.penName.trim()).split(/\s+/).pop() || "Author";
  const words = p.title.trim().toUpperCase().split(/\s+/);
  return `${name} / ${(words.length > 4 ? words.slice(0, 3) : words).join(" ")} / `;
}

export function copyrightText(p, c, year = new Date().getFullYear()) {
  if (c.text.copyright.trim()) return c.text.copyright.trim();
  const who = byline(c) || "the author";
  const lines = [`Copyright © ${year} ${who}`, "All rights reserved."];
  if (p.genre !== "nonfiction") {
    lines.push("This is a work of fiction. Names, characters, places and incidents are either the products of the author’s imagination or are used fictitiously. Any resemblance to actual persons, living or dead, events or locales is entirely coincidental.");
  }
  return lines.join("\n\n");
}

// ---------------------------------------------------------------- the book

/**
 * Clean a scene's HTML for the page: comments (editor notes) go, and unless the writer asked to keep
 * them, fonts, sizes, colours and highlights go too. Bold, italics, underline, alignment and the
 * like stay. Empty paragraphs at the start and end of a scene are dropped.
 */
export function cleanSceneHtml(html, keepFormatting = false) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  div.querySelectorAll("span.comment").forEach(s => s.replaceWith(...s.childNodes));
  div.querySelectorAll("hr.scene-split, script, style").forEach(n => n.remove());
  div.querySelectorAll("*").forEach(el => {
    const align = el.style?.textAlign;
    if (!keepFormatting) {
      el.removeAttribute("style");
      if (align && /^(P|H[1-6]|BLOCKQUOTE|LI|DIV|PRE)$/.test(el.tagName)) el.style.textAlign = align;
    }
    for (const a of [...el.attributes]) if (a.name !== "style") el.removeAttribute(a.name);
  });
  // spans and <font>s left with nothing to say are unwrapped
  div.querySelectorAll("span, font").forEach(el => {
    if (el.tagName === "FONT" || !el.getAttribute("style")) {
      if (el.tagName === "FONT" && keepFormatting) {
        const span = document.createElement("span");
        if (el.getAttribute("face")) span.style.fontFamily = el.getAttribute("face");
        if (el.getAttribute("color")) span.style.color = el.getAttribute("color");
        span.append(...el.childNodes);
        el.replaceWith(span);
      } else {
        el.replaceWith(...el.childNodes);
      }
    }
  });
  // old scenes may have <div>s, or text straight in the scene: make paragraphs of them
  div.querySelectorAll("div").forEach(d => {
    if (d.querySelector("p, div, h1, h2, h3, blockquote, ul, ol, pre, hr")) { d.replaceWith(...d.childNodes); return; }
    const p = document.createElement("p");
    p.append(...d.childNodes);
    if (d.style.textAlign) p.style.textAlign = d.style.textAlign;
    d.replaceWith(p);
  });
  let loose = null;
  for (const node of [...div.childNodes]) {
    if (node.nodeType === 1 && /^(P|H[1-6]|BLOCKQUOTE|UL|OL|HR|PRE)$/.test(node.tagName)) { loose = null; continue; }
    if (node.nodeType !== 1 && node.nodeType !== 3) { node.remove(); continue; }
    if (!loose && node.nodeType === 3 && !node.textContent.trim()) { node.remove(); continue; }
    if (!loose) { loose = document.createElement("p"); node.before(loose); }
    loose.append(node);
  }
  const empty = el => el && el.nodeType === 1 && /^(P|DIV)$/.test(el.tagName) && !el.textContent.trim() && !el.querySelector("img");
  while (empty(div.firstElementChild) && div.firstChild === div.firstElementChild) div.firstElementChild.remove();
  while (empty(div.lastElementChild)) div.lastElementChild.remove();
  return div.innerHTML.trim();
}

/**
 * Everything a format needs: title, author, the front and back matter that are switched on and
 * filled in, and the chapters chosen, numbered, with their scenes' cleaned HTML.
 * `limit` stops after that many chapters (for the preview).
 */
export function buildBook(p, c, { limit = Infinity } = {}) {
  const L = c.layout;
  const chapters = [];
  let number = 0, words = 0, more = 0;
  for (const ch of p.chapters) {
    if (c.exclude.includes(ch.id)) continue;
    const scenes = ch.scenes
      .filter(s => !(c.skipTodo && s.status === "to do"))
      .map(s => ({ id: s.id, title: s.title.trim(), html: cleanSceneHtml(s.content, L.keepFormatting), words: countWords(s.content) }))
      .filter(s => s.html || (L.sceneTitles && s.title));
    if (!scenes.length) continue;
    number++;
    words += scenes.reduce((n, s) => n + s.words, 0);
    if (chapters.length >= limit) { more++; continue; }
    const label = chapterLabel(number, L.heading);
    const own = ch.title.trim();
    let title = L.chapterTitles && own && !(label && isNumberOnlyTitle(own)) ? own : "";
    if (!label && !title) title = own || "Chapter " + numberWords(number);
    chapters.push({ id: ch.id, n: number, label, title, scenes });
  }

  const F = c.front, B = c.back, T = c.text;
  const front = [];
  if (F.titlePage) front.push({ kind: "title" });
  if (F.copyright) front.push({ kind: "copyright", text: copyrightText(p, c) });
  if (F.dedication && T.dedication.trim()) front.push({ kind: "dedication", text: T.dedication.trim() });
  if (F.epigraph && T.epigraph.trim()) front.push({ kind: "epigraph", text: T.epigraph.trim(), source: T.epigraphSource.trim() });
  if (F.toc && chapters.length) front.push({ kind: "toc", title: "Contents" });
  const back = [];
  if (B.acknowledgements && T.acknowledgements.trim()) back.push({ kind: "acknowledgements", title: "Acknowledgements", text: T.acknowledgements.trim() });
  if (B.about && T.about.trim()) back.push({ kind: "about", title: "About the Author", text: T.about.trim() });

  return {
    title: p.title.trim() || "Untitled",
    subtitle: T.subtitle.trim(),
    author: byline(c),
    legalName: T.author.trim(),
    contact: T.contact.trim(),
    words,
    approxWords: approxWords(words),
    projectWords: totalWords(p),
    runningHead: runningHead(p, c),
    language: c.language || "en",
    front, back, chapters, more,
    theEnd: B.theEnd,
    layout: L,
  };
}

/** The text of a chapter's heading on one line: "Chapter One: The Call". */
export const headingText = ch => [ch.label, ch.title].filter(Boolean).join(": ");

/** The scene-break mark, or "" for a blank line. */
export const breakMark = L => (L.sceneBreak === "blank" ? "" : L.sceneBreak);

/** Paragraphs of a multi-line text box (dedication, about the author, …). */
export const paragraphsOf = text => text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);

/** A safe file name from the book's title. */
export const fileBase = p => p.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, " ") || "story";
