// A real Word document (.docx): WordprocessingML in a ZIP. Built with Word styles (Normal, Heading 1
// for chapters, …) so the writer, an agent or a print-on-demand service can restyle it in Word,
// and so Word's navigation pane lists the chapters.
//
// Layout: front matter (title page, copyright, …) in its own section without headers; the story in
// a second section whose page numbers start at 1, with the running head chosen in the settings.

import { makeZip } from "./zip.js";
import { PAGE_SIZES, MARGINS, headingText, paragraphsOf } from "./model.js";
import { chapterBodyHtml } from "./html.js";

const TW = 1440;                       // twips per inch
const tw = inches => Math.round(inches * TW);
const xml = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
  .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;

// ---------------------------------------------------------------- runs and paragraphs

/** A run of text with formatting {b, i, u, strike, sup, sub, color, font, size (pt), shade}. */
function run(text, f = {}) {
  const props = [
    f.font ? `<w:rFonts w:ascii="${xml(f.font)}" w:hAnsi="${xml(f.font)}" w:cs="${xml(f.font)}"/>` : "",
    f.b ? "<w:b/>" : "", f.i ? "<w:i/>" : "", f.caps ? "<w:caps/>" : "", f.strike ? "<w:strike/>" : "",
    f.color ? `<w:color w:val="${f.color}"/>` : "",
    f.size ? `<w:sz w:val="${Math.round(f.size * 2)}"/><w:szCs w:val="${Math.round(f.size * 2)}"/>` : "",
    f.u ? `<w:u w:val="single"/>` : "",
    f.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${f.shade}"/>` : "",
    f.sup ? `<w:vertAlign w:val="superscript"/>` : f.sub ? `<w:vertAlign w:val="subscript"/>` : "",
  ].join("");
  const rPr = props ? `<w:rPr>${props}</w:rPr>` : "";
  // tabs and line breaks inside the text become Word's own tab and break elements
  const body = String(text).split(/(\t|\n)/).map(part =>
    part === "\t" ? "<w:tab/>" : part === "\n" ? "<w:br/>" : part ? `<w:t xml:space="preserve">${xml(part)}</w:t>` : "").join("");
  return body ? `<w:r>${rPr}${body}</w:r>` : "";
}

/** A paragraph: style, alignment (left/center/right/both), keepNext, page break, extra spacing. */
function para(runs, { style = "", jc = "", keepNext = false, pageBreak = false, before = null, after = null, ind = null, tabs = "", sect = "" } = {}) {
  const spacing = before !== null || after !== null
    ? `<w:spacing${before !== null ? ` w:before="${before}"` : ""}${after !== null ? ` w:after="${after}"` : ""}/>` : "";
  const pPr = [
    style ? `<w:pStyle w:val="${style}"/>` : "", keepNext ? "<w:keepNext/>" : "", pageBreak ? "<w:pageBreakBefore/>" : "",
    tabs, spacing, ind !== null ? `<w:ind w:firstLine="${ind}"/>` : "", jc ? `<w:jc w:val="${jc}"/>` : "", sect,
  ].join("");
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${runs}</w:p>`;
}

/**
 * An empty paragraph of exact height that opens a page: how chapters and front-matter pages start a
 * third of the way down. (Word drops "space before" at the top of a new page, but not a line's height.)
 */
const spacer = (height, pageBreak = true) =>
  `<w:p><w:pPr><w:pStyle w:val="Spacer"/><w:keepNext/>${pageBreak ? "<w:pageBreakBefore/>" : ""}<w:spacing w:before="0" w:after="0" w:line="${Math.max(20, Math.round(height))}" w:lineRule="exact"/></w:pPr></w:p>`;

/** Where a chapter heading or front-matter page starts, in twips from the top margin. */
function dropOf(L) {
  const page = PAGE_SIZES[L.pageSize] || PAGE_SIZES.letter;
  const m = MARGINS[L.margins] || MARGINS["1in"];
  return tw(L.chapterDrop && L.newPage ? Math.max(0.5, page.h / 3 - m.top) : 0.5);
}

const ALIGN = { center: "center", right: "right", justify: "both", left: "left", start: "left", end: "right" };

/** CSS colour (rgb() or #hex) to Word's RRGGBB, or "" for none / white-ish backgrounds we skip. */
function hexColor(css) {
  if (!css) return "";
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  if (m) return m[4] === "0" ? "" : [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, "0")).join("").toUpperCase();
  const h = css.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (h) return (h[1].length === 3 ? h[1].replace(/./g, "$&$&") : h[1]).toUpperCase();
  return "";
}

/** Inline content of an element → runs, carrying formatting down from <b>, <i>, styled spans… */
function inlineRuns(node, f, L) {
  let out = "";
  for (const child of node.childNodes) {
    if (child.nodeType === 3) { out += run(child.textContent.replace(/[\r\n]+/g, " "), f); continue; }
    if (child.nodeType !== 1) continue;
    const g = { ...f };
    switch (child.tagName) {
      case "B": case "STRONG": g.b = true; break;
      case "I": case "EM": if (L.underlineItalics) g.u = true; else g.i = true; break;
      case "U": g.u = true; break;
      case "S": case "STRIKE": case "DEL": g.strike = true; break;
      case "SUP": g.sup = true; break;
      case "SUB": g.sub = true; break;
      case "BR": out += "<w:r><w:br/></w:r>"; continue;
    }
    if (L.keepFormatting && child.style) {
      const st = child.style;
      if (st.fontStyle === "italic") g.i = true;
      if (/bold|[6-9]00/.test(st.fontWeight)) g.b = true;
      if (st.color) g.color = hexColor(st.color) || g.color;
      if (st.backgroundColor) g.shade = hexColor(st.backgroundColor) || g.shade;
      if (st.fontFamily) g.font = st.fontFamily.split(",")[0].replace(/["']/g, "").trim();
      if (/px$/.test(st.fontSize)) g.size = parseFloat(st.fontSize) * 0.75;
    }
    out += inlineRuns(child, g, L);
  }
  return out;
}

/** A chapter's HTML (from chapterBodyHtml) → Word paragraphs. */
function chapterParagraphs(ch, L, bookmarkId, pageBreak = L.newPage) {
  const div = document.createElement("div");
  div.innerHTML = chapterBodyHtml(ch, L);
  const out = [];
  const blocks = (node, ctx = {}) => {
    for (const el of node.children) {
      const jc = ALIGN[el.style?.textAlign] || "";
      if (el.classList.contains("ch-head")) {
        const parts = [...el.children].map(s => run(s.textContent, s.classList.contains("ch-label") && L.look !== "manuscript" ? { caps: true } : {}));
        const name = `_Chapter${ch.n}`;
        out.push(spacer(L.newPage ? dropOf(L) : tw(0.5), pageBreak));
        out.push(para(`<w:bookmarkStart w:id="${bookmarkId}" w:name="${name}"/>${parts.join("<w:r><w:br/></w:r>")}<w:bookmarkEnd w:id="${bookmarkId}"/>`, { style: "Heading1" }));
        continue;
      }
      if (el.classList.contains("scene-title")) { out.push(para(run(el.textContent), { style: "Heading2" })); continue; }
      if (el.classList.contains("scene-break")) { out.push(para(run(el.textContent.trim()), { style: "SceneBreak" })); continue; }
      if (el.classList.contains("scene")) { blocks(el, ctx); continue; }
      switch (el.tagName) {
        case "P":
          out.push(para(inlineRuns(el, {}, L), { style: ctx.quote ? "Quote" : el.classList.contains("first") ? "FirstParagraph" : "", jc }));
          break;
        case "H1": case "H2": case "H3":
          out.push(para(inlineRuns(el, {}, L), { style: "Subheading", jc }));
          break;
        case "BLOCKQUOTE":
          if ([...el.children].some(c => /^(P|DIV|UL|OL|BLOCKQUOTE)$/.test(c.tagName))) blocks(el, { ...ctx, quote: true });
          else out.push(para(inlineRuns(el, {}, L), { style: "Quote", jc }));
          break;
        case "UL": case "OL":
          [...el.children].forEach((li, i) =>
            out.push(para(run(el.tagName === "OL" ? `${i + 1}.\t` : "•\t") + inlineRuns(li, {}, L), { style: "ListItem" })));
          break;
        case "PRE":
          out.push(para(run(el.textContent, { font: "Courier New" }), { style: "Plain" }));
          break;
        case "HR":
          out.push(para(run(""), { style: "SceneBreak" }));
          break;
        default:
          if (el.textContent.trim()) out.push(para(inlineRuns(el, {}, L), { jc }));
      }
    }
  };
  blocks(div);
  return out;
}

// ---------------------------------------------------------------- the parts of the package

function stylesXml(L) {
  const font = xml(L.font);
  const size = Math.round(L.size * 2);
  const line = Math.round(240 * L.spacing);
  const indent = tw(L.indent);
  const manuscript = L.look === "manuscript";
  const headSize = manuscript ? size : Math.round(size * 1.5);
  const style = (id, name, body, { based = "Normal", next = "" } = {}) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${based ? `<w:basedOn w:val="${based}"/>` : ""}${next ? `<w:next w:val="${next}"/>` : ""}<w:qFormat/>${body}</w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS}>
<w:docDefaults>
  <w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>
  <w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>
  <w:pPr><w:widowControl/><w:ind w:firstLine="${indent}"/>${L.justify ? `<w:jc w:val="both"/>` : ""}</w:pPr></w:style>
${style("FirstParagraph", "First Paragraph", `<w:pPr><w:ind w:firstLine="${L.indentFirst ? indent : 0}"/></w:pPr>`, { next: "Normal" })}
${style("Heading1", "heading 1", `<w:pPr><w:keepNext/><w:spacing w:before="0" w:after="${manuscript ? line * 2 : 600}"/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:sz w:val="${headSize}"/><w:szCs w:val="${headSize}"/></w:rPr>`, { next: "FirstParagraph" })}
${style("Heading2", "heading 2", `<w:pPr><w:keepNext/><w:spacing w:before="360" w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:i/></w:rPr>`, { next: "FirstParagraph" })}
${style("Subheading", "Subheading", `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/></w:rPr>`, { next: "FirstParagraph" })}
${style("SceneBreak", "Scene Break", `<w:pPr><w:keepNext/>${manuscript ? "" : `<w:spacing w:before="120" w:after="120"/>`}<w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>`, { next: "FirstParagraph" })}
${style("Quote", "Quote", `<w:pPr><w:ind w:left="720" w:right="720" w:firstLine="0"/></w:pPr>`)}
${style("ListItem", "List Item", `<w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360" w:firstLine="0"/></w:pPr>`)}
${style("Plain", "Plain", `<w:pPr><w:ind w:firstLine="0"/></w:pPr>`)}
${style("Title", "Title", `<w:pPr><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:spacing w:line="${manuscript ? line : 276}" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="${manuscript ? size : Math.round(size * 2.4)}"/><w:szCs w:val="${manuscript ? size : Math.round(size * 2.4)}"/></w:rPr>`)}
${style("Subtitle", "Subtitle", `<w:pPr><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:spacing w:before="120"/></w:pPr><w:rPr><w:i/><w:sz w:val="${manuscript ? size : Math.round(size * 1.25)}"/></w:rPr>`)}
${style("Byline", "Byline", `<w:pPr><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:spacing w:before="${manuscript ? line : 1200}"/></w:pPr><w:rPr><w:sz w:val="${manuscript ? size : Math.round(size * 1.3)}"/></w:rPr>`)}
${style("Contact", "Contact Info", `<w:pPr><w:ind w:firstLine="0"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>`)}
${style("FrontText", "Front Matter Text", `<w:pPr><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:i/></w:rPr>`)}
${style("Copyright", "Copyright Text", `<w:pPr><w:ind w:firstLine="0"/><w:spacing w:after="160" w:line="264" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="${Math.round(size * 0.85)}"/><w:szCs w:val="${Math.round(size * 0.85)}"/></w:rPr>`)}
${style("FrontHeading", "Front Matter Heading", `<w:pPr><w:keepNext/><w:spacing w:before="0" w:after="480"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="${headSize}"/><w:szCs w:val="${headSize}"/></w:rPr>`)}
${style("BackText", "Back Matter Text", `<w:pPr><w:ind w:firstLine="0"/><w:spacing w:after="160"/></w:pPr>`)}
${style("TocEntry", "Contents Entry", `<w:pPr><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr>`)}
${style("TheEnd", "The End", `<w:pPr><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:spacing w:before="${line}"/></w:pPr>`)}
${style("Spacer", "Spacer", `<w:pPr><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:sz w:val="2"/></w:rPr>`)}
${style("Header", "header", `<w:pPr><w:ind w:firstLine="0"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>`)}
${style("Footer", "footer", `<w:pPr><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>`)}
</w:styles>`;
}

// Word insists on the schema's order for paragraph and run properties; sort them to be safe.
const P_ORDER = ["pStyle", "keepNext", "keepLines", "pageBreakBefore", "widowControl", "tabs", "spacing", "ind", "jc", "outlineLvl", "rPr", "sectPr"];
const R_ORDER = ["rFonts", "b", "bCs", "i", "iCs", "caps", "strike", "color", "sz", "szCs", "u", "shd", "vertAlign", "lang"];

function orderProperties(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const sort = (tag, order) => {
    for (const el of doc.getElementsByTagNameNS(W, tag)) {
      [...el.children]
        .sort((a, b) => order.indexOf(a.localName) - order.indexOf(b.localName))
        .forEach(child => el.appendChild(child));
    }
  };
  sort("pPr", P_ORDER);
  sort("rPr", R_ORDER);
  const out = new XMLSerializer().serializeToString(doc);
  return out.startsWith("<?xml") ? out : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${out}`;
}

const PAGE_FIELD =`<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>`;
const headerPart = (tag, body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:${tag} ${NS}>${body}</w:${tag}>`;

/** The header and footer parts for the running-head choice: [{file, rel type, ref xml}]. */
function headerParts(book) {
  const L = book.layout;
  const size = L.size * 0.85;
  const parts = [];
  const add = (kind, which, body) => {
    const n = parts.length + 1;
    parts.push({ file: `${kind}${n}.xml`, kind, which, rid: `rIdH${n}`, xml: headerPart(kind === "header" ? "hdr" : "ftr", body) });
  };
  if (L.header === "manuscript") {
    add("header", "default", para(run(book.runningHead) + PAGE_FIELD, { style: "Header", jc: "right" }));
  } else if (L.header === "book") {
    add("header", "default", para(run(book.title, { caps: true, size }), { style: "Header", jc: "center" }));
    add("header", "even", para(run(book.author || book.title, { caps: true, size }), { style: "Header", jc: "center" }));
    add("footer", "default", para(PAGE_FIELD, { style: "Footer" }));
    add("footer", "even", para(PAGE_FIELD, { style: "Footer" }));
    // a chapter's opening page has no running head, just the page number (each chapter is a section)
    add("header", "first", para("", { style: "Header" }));
    add("footer", "first", para(PAGE_FIELD, { style: "Footer" }));
  } else if (L.header === "numbers") {
    add("footer", "default", para(PAGE_FIELD, { style: "Footer" }));
  }
  return parts;
}

function sectPr(L, { headers = [], restart = false, titlePg = false } = {}) {
  const page = PAGE_SIZES[L.pageSize] || PAGE_SIZES.letter;
  const m = MARGINS[L.margins] || MARGINS["1in"];
  const w = L.pageSize === "a4" ? 11906 : tw(page.w), h = L.pageSize === "a4" ? 16838 : tw(page.h);
  const refs = headers.map(p => `<w:${p.kind}Reference w:type="${p.which}" r:id="${p.rid}"/>`).join("");
  return `<w:sectPr>${refs}<w:type w:val="nextPage"/><w:pgSz w:w="${w}" w:h="${h}"/>`
    + `<w:pgMar w:top="${tw(m.top)}" w:right="${tw(m.outside)}" w:bottom="${tw(m.bottom)}" w:left="${tw(m.inside)}" w:header="${tw(Math.max(0.3, m.top / 2))}" w:footer="${tw(Math.max(0.3, m.bottom / 2))}" w:gutter="0"/>`
    + (restart ? `<w:pgNumType w:start="1"/>` : "") + (titlePg ? "<w:titlePg/>" : "") + `</w:sectPr>`;
}

function frontParagraphs(book, item, first) {
  const L = book.layout;
  const page = PAGE_SIZES[L.pageSize] || PAGE_SIZES.letter;
  const m = MARGINS[L.margins] || MARGINS["1in"];
  const contentH = page.h - m.top - m.bottom;
  const textW = page.w - m.inside - m.outside;
  const brk = !first;
  switch (item.kind) {
    case "title": {
      if (L.look === "manuscript") {
        const contact = [book.legalName, ...book.contact.split("\n")].map(s => s.trim()).filter(Boolean);
        const words = `about ${book.approxWords.toLocaleString("en-US")} words`;
        const tabs = `<w:tabs><w:tab w:val="right" w:pos="${tw(textW)}"/></w:tabs>`;
        const lines = contact.length ? contact : [""];
        const out = lines.map((line, i) => para(run(i === 0 ? `${line}\t${words}` : line), { style: "Contact", tabs: i === 0 ? tabs : "", pageBreak: brk && i === 0 }));
        out.push(para(run(book.title), { style: "Title", before: tw(Math.max(0.5, contentH / 2 - 0.2 * lines.length - 0.5)) }));
        if (book.subtitle) out.push(para(run(book.subtitle), { style: "Subtitle" }));
        if (book.author) out.push(para(run(`by ${book.author}`), { style: "Byline" }));
        return out;
      }
      const out = [spacer(tw(contentH / 4), brk), para(run(book.title), { style: "Title" })];
      if (book.subtitle) out.push(para(run(book.subtitle), { style: "Subtitle" }));
      if (book.author) out.push(para(run(book.author), { style: "Byline" }));
      return out;
    }
    case "copyright":
      return [spacer(tw(contentH * 0.55), brk), ...paragraphsOf(item.text).map(t => para(run(t), { style: "Copyright" }))];
    case "dedication":
    case "epigraph": {
      const out = [spacer(tw(Math.max(0.5, page.h / 3 - m.top)), brk), ...paragraphsOf(item.text).map(t => para(run(t), { style: "FrontText" }))];
      if (item.source) out.push(para(run(`— ${item.source}`, {}), { style: "Plain", jc: "center" }));
      return out;
    }
    case "toc":
      return [
        spacer(dropOf(L), brk),
        para(run(item.title), { style: "FrontHeading" }),
        ...book.chapters.map(ch => para(`<w:hyperlink w:anchor="_Chapter${ch.n}">${run(headingText(ch))}</w:hyperlink>`, { style: "TocEntry" })),
      ];
    default:
      return [];
  }
}

/** Build the .docx file for a book (from buildBook). */
export async function bookDocx(book, { date = new Date() } = {}) {
  const L = book.layout;
  const headers = headerParts(book);
  const body = [];

  // front matter: its own section, no headers, page numbers not shown
  const front = book.front.flatMap((item, i) => frontParagraphs(book, item, i === 0));
  if (front.length) {
    const last = front.pop();
    front.push(last.replace(/<\/w:pPr>/, sectPr(L) + "</w:pPr>").replace(/^<w:p>(?!<w:pPr>)/, `<w:p><w:pPr>${sectPr(L)}</w:pPr>`));
    body.push(...front);
  }
  // the story. In a book layout each chapter is a section of its own, so its opening page can go
  // without the running head; the section break starts the new page.
  const perChapter = L.header === "book" && L.newPage;
  const lastChapter = book.chapters.length - 1;
  book.chapters.forEach((ch, i) => {
    const paras = chapterParagraphs(ch, L, i + 1, L.newPage && !perChapter);
    if (perChapter && i < lastChapter) {
      const end = sectPr(L, { headers, restart: i === 0 && front.length > 0, titlePg: true });
      paras.push(paras.pop().replace(/<\/w:pPr>/, end + "</w:pPr>").replace(/^<w:p>(?!<w:pPr>)/, `<w:p><w:pPr>${end}</w:pPr>`));
    }
    body.push(...paras);
  });
  if (book.theEnd) body.push(para(run(L.look === "manuscript" ? "THE END" : "The End"), { style: "TheEnd" }));
  for (const b of book.back) {
    body.push(spacer(dropOf(L)), para(run(b.title), { style: "FrontHeading" }));
    body.push(...paragraphsOf(b.text).map(t => para(run(t), { style: "BackText" })));
  }
  if (!book.chapters.length && !book.back.length) body.push(para(""));

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${body.join("\n")}${sectPr(L, { headers, restart: front.length > 0 && (!perChapter || lastChapter <= 0), titlePg: perChapter })}</w:body></w:document>`;

  const m = MARGINS[L.margins] || MARGINS["1in"];
  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings ${NS}><w:zoom w:percent="100"/>${m.mirror ? "<w:mirrorMargins/>" : ""}<w:defaultTabStop w:val="720"/>${L.justify ? `<w:autoHyphenation/>` : ""}${
  headers.some(h => h.which === "even") ? "<w:evenAndOddHeaders/>" : ""}<w:characterSpacingControl w:val="doNotCompress"/>
<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

  const iso = date.toISOString().replace(/\.\d+Z$/, "Z");
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xml(book.title)}</dc:title><dc:creator>${xml(book.author)}</dc:creator><cp:lastModifiedBy>${xml(book.author)}</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>NoirWrite</Application><Words>${book.words}</Words></Properties>`;

  const OD = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="${OD}/styles" Target="styles.xml"/>
<Relationship Id="rIdSettings" Type="${OD}/settings" Target="settings.xml"/>
${headers.map(h => `<Relationship Id="${h.rid}" Type="${OD}/${h.kind}" Target="${h.file}"/>`).join("\n")}
</Relationships>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${OD}/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="${OD}/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
  const WML = "application/vnd.openxmlformats-officedocument.wordprocessingml";
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="${WML}.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="${WML}.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="${WML}.settings+xml"/>
${headers.map(h => `<Override PartName="/word/${h.file}" ContentType="${WML}.${h.kind}+xml"/>`).join("\n")}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  return makeZip([
    { name: "[Content_Types].xml", data: types },
    { name: "_rels/.rels", data: rels },
    { name: "docProps/core.xml", data: core },
    { name: "docProps/app.xml", data: app },
    { name: "word/document.xml", data: document },
    { name: "word/styles.xml", data: orderProperties(stylesXml(L)) },
    { name: "word/settings.xml", data: settings },
    { name: "word/_rels/document.xml.rels", data: docRels },
    ...headers.map(h => ({ name: `word/${h.file}`, data: h.xml })),
  ], "application/vnd.openxmlformats-officedocument.wordprocessingml.document", date);
}
