// An EPUB 3 e-book (with an EPUB 2 table of contents for older readers): one XHTML file per chapter
// and per front/back-matter page, a stylesheet, the linked contents, and an optional cover image.
// Works with Send to Kindle / KDP, Apple Books, Kobo and Google Play Books.

import { makeZip } from "./zip.js";
import { headingText, paragraphsOf } from "./model.js";
import { chapterBodyHtml } from "./html.js";

const xml = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
  .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const paras = (text, cls = "") => paragraphsOf(text).map(t => `<p${cls ? ` class="${cls}"` : ""}>${xml(t).replace(/\n/g, "<br/>")}</p>`).join("\n");

/** HTML (as the editor stores it) → well-formed XHTML. */
function toXhtml(html) {
  const section = document.createElement("section");
  section.innerHTML = html;
  return new XMLSerializer().serializeToString(section)
    .replace(/^<section xmlns="http:\/\/www\.w3\.org\/1999\/xhtml">/, "").replace(/<\/section>$/, "");
}

function page(book, title, body, type = "") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(book.language)}" lang="${xml(book.language)}">
<head><meta charset="UTF-8"/><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body${type ? ` epub:type="${type}"` : ""}>
${body}
</body>
</html>`;
}

function css(book) {
  const L = book.layout;
  return `@charset "UTF-8";
body { margin: 0 5%; line-height: 1.5; }
p { margin: 0; text-indent: 1.5em; orphans: 2; widows: 2; }
p.first, p.plain, .scene-break, .center p { text-indent: 0; }
${L.indentFirst ? "p.first { text-indent: 1.5em; }" : ""}
.scene blockquote { margin: 1em 2em; }
.scene blockquote p { text-indent: 0; }
.scene h1, .scene h2, .scene h3 { font-size: 1em; text-align: center; margin: 1em 0; }
h1.ch-head { font-weight: normal; text-align: center; margin: 3em 0 2em; page-break-after: avoid; }
h1.ch-head span { display: block; }
.ch-label { font-size: .8em; letter-spacing: .15em; text-transform: uppercase; }
.ch-title { font-size: 1.4em; margin-top: .3em; }
.ch-head span:only-child.ch-label { font-size: 1.2em; }
.scene-title { font-weight: normal; font-style: italic; font-size: 1em; text-align: center; margin: 1.5em 0 1em; }
.scene-break { text-align: center; margin: .8em 0; page-break-after: avoid; }
.the-end { text-align: center; margin-top: 2em; text-indent: 0; }
.title-page { text-align: center; margin-top: 25%; }
.title-page p { text-indent: 0; }
.tp-title { font-size: 2em; line-height: 1.2; }
.tp-sub { font-style: italic; font-size: 1.15em; margin-top: .4em; }
.tp-author { font-size: 1.2em; margin-top: 2.5em; }
.copyright { margin-top: 30%; font-size: .85em; }
.copyright p { text-indent: 0; margin-bottom: .8em; }
.center { text-align: center; font-style: italic; margin-top: 30%; }
.center p { margin-bottom: .6em; }
.center .source { font-style: normal; }
h1.front-head { font-weight: normal; text-align: center; margin: 3em 0 1.5em; font-size: 1.4em; }
nav ol { list-style: none; padding: 0; }
nav li { margin: .4em 0; }
nav a { text-decoration: none; }
.cover { margin: 0; padding: 0; text-align: center; }
.cover img { max-width: 100%; max-height: 100%; }
`;
}

const COVER_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

/** Build the .epub file for a book (from buildBook). `cover` is {bytes, ext} or null. */
export async function bookEpub(book, { id, cover = null, date = new Date() } = {}) {
  const L = book.layout;
  const files = [];       // {id, href, type, xml|data, spine?, props?, title?}
  const add = f => files.push(f);
  const theEnd = book.theEnd ? `<p class="the-end">The End</p>` : "";

  if (cover) {
    const href = `images/cover.${cover.ext}`;
    add({ id: "cover-image", href, type: COVER_TYPES[cover.ext], data: cover.bytes, props: "cover-image" });
    add({ id: "cover", href: "cover.xhtml", spine: true, xml: page(book, "Cover", `<div class="cover"><img src="${href}" alt="${xml(book.title)}"/></div>`, "cover") });
  }
  for (const f of book.front) {
    if (f.kind === "title") {
      add({ id: "title", href: "title.xhtml", spine: true, xml: page(book, book.title, `<section class="title-page" epub:type="titlepage">
<p class="tp-title">${xml(book.title)}</p>${book.subtitle ? `<p class="tp-sub">${xml(book.subtitle)}</p>` : ""}${book.author ? `<p class="tp-author">${xml(book.author)}</p>` : ""}
</section>`, "frontmatter") });
    }
    if (f.kind === "copyright") add({ id: "copyright", href: "copyright.xhtml", spine: true, xml: page(book, "Copyright", `<section class="copyright" epub:type="copyright-page">${paras(f.text)}</section>`, "frontmatter") });
    if (f.kind === "dedication") add({ id: "dedication", href: "dedication.xhtml", spine: true, xml: page(book, "Dedication", `<section class="center" epub:type="dedication">${paras(f.text)}</section>`, "frontmatter") });
    if (f.kind === "epigraph") add({ id: "epigraph", href: "epigraph.xhtml", spine: true, xml: page(book, "Epigraph", `<section class="center" epub:type="epigraph">${paras(f.text)}${f.source ? `<p class="source">— ${xml(f.source)}</p>` : ""}</section>`, "frontmatter") });
  }
  const chapterFile = ch => `chapter-${String(ch.n).padStart(3, "0")}.xhtml`;
  const nav = `<nav epub:type="toc" id="toc"><h1 class="front-head">Contents</h1>
<ol>
${book.chapters.map(ch => `<li><a href="${chapterFile(ch)}">${xml(headingText(ch))}</a></li>`).join("\n")}
${book.back.map(b => `<li><a href="${b.kind}.xhtml">${xml(b.title)}</a></li>`).join("\n")}
</ol></nav>
<nav epub:type="landmarks" id="landmarks" hidden="hidden"><ol>
${book.chapters.length ? `<li><a epub:type="bodymatter" href="${chapterFile(book.chapters[0])}">Start of the story</a></li>` : ""}
<li><a epub:type="toc" href="nav.xhtml">Contents</a></li>
</ol></nav>`;
  // the contents page is in the reading order only if it was asked for; it's always in the e-reader's menu
  add({ id: "nav", href: "nav.xhtml", spine: book.front.some(f => f.kind === "toc"), props: "nav", xml: page(book, "Contents", nav, "frontmatter") });
  book.chapters.forEach((ch, i) => {
    const body = toXhtml(chapterBodyHtml(ch, L)) + (i === book.chapters.length - 1 ? theEnd : "");
    add({ id: `ch${ch.n}`, href: chapterFile(ch), spine: true, title: headingText(ch), xml: page(book, headingText(ch), `<section epub:type="chapter">\n${body}\n</section>`, "bodymatter") });
  });
  for (const b of book.back) {
    add({ id: b.kind, href: `${b.kind}.xhtml`, spine: true, title: b.title, xml: page(book, b.title, `<section epub:type="${b.kind === "about" ? "appendix" : "acknowledgments"}"><h1 class="front-head">${xml(b.title)}</h1>${paras(b.text, "plain")}</section>`, "backmatter") });
  }

  const ncxPoints = files.filter(f => f.title).map((f, i) =>
    `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${xml(f.title)}</text></navLabel><content src="${f.href}"/></navPoint>`).join("\n");
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:${id}"/></head>
<docTitle><text>${xml(book.title)}</text></docTitle><navMap>
${ncxPoints}
</navMap></ncx>`;

  const modified = date.toISOString().replace(/\.\d+Z$/, "Z");
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${xml(book.language)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:uuid:${id}</dc:identifier>
<dc:title>${xml(book.title)}</dc:title>
${book.author ? `<dc:creator id="author">${xml(book.author)}</dc:creator>` : ""}
<dc:language>${xml(book.language)}</dc:language>
<meta property="dcterms:modified">${modified}</meta>
${cover ? `<meta name="cover" content="cover-image"/>` : ""}
</metadata>
<manifest>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="style" href="style.css" media-type="text/css"/>
${files.map(f => `<item id="${f.id}" href="${f.href}" media-type="${f.type || "application/xhtml+xml"}"${f.props ? ` properties="${f.props}"` : ""}/>`).join("\n")}
</manifest>
<spine toc="ncx">
${files.filter(f => f.spine).map(f => `<itemref idref="${f.id}"/>`).join("\n")}
</spine>
</package>`;

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

  return makeZip([
    { name: "mimetype", data: "application/epub+zip", store: true },
    { name: "META-INF/container.xml", data: container },
    { name: "OEBPS/content.opf", data: opf },
    { name: "OEBPS/toc.ncx", data: ncx },
    { name: "OEBPS/style.css", data: css(book) },
    ...files.map(f => ({ name: `OEBPS/${f.href}`, data: f.xml || f.data, store: !!f.data })),
  ], "application/epub+zip", date);
}
