// The Compile window (sidebar → Compile & export): choose a format and a preset, which chapters go
// in, the title page and the other front and back matter, and the layout. A live preview on the
// right shows the result. The settings are saved with the project (p.compile).

import { api, scheduleSave, countWords } from "../store.js";
import { $, $$, esc, fmt, modal, toast, download, pickFile, slideTabs } from "../ui.js";
import {
  FORMATS, PRESETS, PAGE_SIZES, MARGINS, FONTS, HEADINGS, SCENE_BREAKS, RUNNING_HEADS,
  compileSettings, applyPreset, presetEdited, buildBook, fileBase, copyrightText,
} from "../compile/model.js";
import { bookHtml, paginatePreview, bookMarkdown, bookText } from "../compile/html.js";

let tab = "contents";            // "contents" | "front" | "layout"

const LANGUAGES = { en: "English", "en-GB": "English (UK)", "en-US": "English (US)", es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese", nl: "Dutch", sv: "Swedish", da: "Danish", nb: "Norwegian", fi: "Finnish", pl: "Polish", ta: "Tamil", hi: "Hindi" };
// numeric choices are lists of [value, label]: an object would put whole-number keys first (10, 11, …, then 10.5)
const SIZES = [10, 10.5, 11, 11.5, 12, 13, 14].map(s => [s, s + " pt"]);
const SPACINGS = [[1, "Single"], [1.15, "1.15"], [1.5, "1.5 lines"], [2, "Double"]];
const INDENTS = [[0, "None"], [0.2, "0.2 in"], [0.25, "0.25 in"], [0.3, "0.3 in"], [0.4, "0.4 in"], [0.5, "0.5 in"]];

// which formats a setting matters for (rows with data-for are hidden for the others)
const PAGED = "docx pdf", TYPESET = "docx pdf html", STYLED = "docx pdf html epub", ALL = "docx pdf html epub md txt";

// ---------------------------------------------------------------- small builders

const get = (c, path) => path.split(".").reduce((o, k) => o?.[k], c);
function set(c, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((o, k) => o[k], c)[last] = value;
}

const check = (c, path, label, hint = "", forFormats = ALL) =>
  `<label class="chk" data-for="${forFormats}"><input type="checkbox" data-k="${path}" ${get(c, path) ? "checked" : ""}>
    <span>${label}${hint ? `<span class="chk-hint">${hint}</span>` : ""}</span></label>`;

const choice = (c, path, label, values, { forFormats = ALL, num = false } = {}) =>
  `<label class="field" data-for="${forFormats}"><span>${label}</span><select data-k="${path}"${num ? " data-num" : ""}>${
    (Array.isArray(values) ? values : Object.entries(values)).map(([v, text]) => `<option value="${esc(v)}" ${String(get(c, path)) === String(v) ? "selected" : ""}>${esc(text)}</option>`).join("")
  }</select></label>`;

const text = (c, path, label, { placeholder = "", area = false, rows = 3, forFormats = ALL } = {}) =>
  `<label class="field" data-for="${forFormats}"><span>${label}</span>${area
    ? `<textarea data-k="${path}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(get(c, path))}</textarea>`
    : `<input type="text" data-k="${path}" value="${esc(get(c, path))}" placeholder="${esc(placeholder)}">`}</label>`;

/** A checkbox with fields that show only while it's ticked. */
const toggled = (c, path, label, inner, forFormats = ALL) =>
  `${check(c, path, label, "", forFormats)}<div class="cmp-sub" data-when="${path}" data-for="${forFormats}">${inner}</div>`;

// ---------------------------------------------------------------- the panes

function contentsPane(p, c) {
  return `
    <div class="cmp-row-head"><span class="field-label">Chapters</span><span class="grow"></span>
      <button class="btn sm" data-all>All</button><button class="btn sm" data-none>None</button></div>
    <div class="cmp-chapters">${p.chapters.map(ch => {
      const words = ch.scenes.reduce((n, s) => n + countWords(s.content), 0);
      return `<label class="chk cmp-ch"><input type="checkbox" data-ch="${ch.id}" ${c.exclude.includes(ch.id) ? "" : "checked"}>
        <span class="grow">${esc(ch.title || "Untitled chapter")}</span><span class="faint">${fmt(words)}</span></label>`;
    }).join("") || `<p class="faint">No chapters yet.</p>`}</div>
    ${check(c, "skipTodo", "Leave out scenes marked “to do”", "Unwritten scenes and placeholders stay out of the file.")}
    ${check(c, "layout.sceneTitles", "Show scene titles", "Each scene starts with its title instead of a scene break: handy for beta readers.")}`;
}

function frontPane(p, c) {
  const manuscriptLook = c.layout.look === "manuscript";
  return `
    <div class="cmp-group-title">Title page</div>
    ${check(c, "front.titlePage", "Title page")}
    <div class="cmp-sub" data-when="front.titlePage">
      ${text(c, "text.subtitle", "Subtitle", { placeholder: "Optional" })}
      <div class="cmp-grid">
        ${text(c, "text.penName", "Name on the book", { placeholder: "Pen name or your name" })}
        ${text(c, "text.author", "Legal name", { placeholder: "For contracts and the header" })}
      </div>
      ${manuscriptLook ? text(c, "text.contact", "Contact details", { area: true, rows: 4, placeholder: "Address\nEmail\nPhone\nAgent (if you have one)", forFormats: TYPESET }) : ""}
      ${manuscriptLook ? `<p class="cmp-hint" data-for="${TYPESET}">A manuscript title page puts your legal name and contact details at the top left and the word count, rounded, at the top right.</p>` : ""}
    </div>

    <div class="cmp-group-title">Front matter</div>
    ${toggled(c, "front.copyright", "Copyright page", text(c, "text.copyright", "Copyright text", { area: true, rows: 5, placeholder: copyrightText(p, { text: { ...c.text, copyright: "" } }) }))}
    ${toggled(c, "front.dedication", "Dedication", text(c, "text.dedication", "Dedication", { area: true, placeholder: "For …" }))}
    ${toggled(c, "front.epigraph", "Epigraph", text(c, "text.epigraph", "Quotation", { area: true }) + text(c, "text.epigraphSource", "Source", { placeholder: "Author, Work" }))}
    ${check(c, "front.toc", "Table of contents", "Linked chapter list. E-books always have one in the reader’s menu.", "docx pdf html epub")}

    <div class="cmp-group-title">Back matter</div>
    ${check(c, "back.theEnd", "“The End” after the last chapter")}
    ${toggled(c, "back.acknowledgements", "Acknowledgements", text(c, "text.acknowledgements", "Acknowledgements", { area: true, rows: 4 }))}
    ${toggled(c, "back.about", "About the author", text(c, "text.about", "About the author", { area: true, rows: 4 }))}

    <div data-for="epub">
      <div class="cmp-group-title">E-book</div>
      ${choice(c, "language", "Language", LANGUAGES, { forFormats: "epub" })}
      <div class="field"><span class="field-label">Cover image</span>
        <div class="cmp-cover">${c.cover ? `<img src="${esc(c.cover)}" alt="Cover">` : ""}
          <button class="btn sm" data-cover>${c.cover ? "Change…" : "Choose image…"}</button>
          ${c.cover ? `<button class="btn sm" data-cover-remove>Remove</button>` : ""}</div>
        <span class="chk-hint">JPEG or PNG, ideally 1600 × 2560 pixels. Stores also ask for the cover separately.</span></div>
    </div>`;
}

function layoutPane(p, c) {
  return `
    <div class="cmp-group-title">Chapters and scenes</div>
    <div class="cmp-grid">
      ${choice(c, "layout.heading", "Chapter headings", HEADINGS)}
      ${choice(c, "layout.sceneBreak", "Scene breaks", SCENE_BREAKS)}
    </div>
    ${check(c, "layout.chapterTitles", "Show chapter titles", "Titles like “Chapter One” are left out when the heading already numbers the chapter.")}
    ${check(c, "layout.newPage", "Start each chapter on a new page", "", PAGED)}
    ${check(c, "layout.chapterDrop", "Start chapters a third of the way down the page", "", PAGED)}

    <div class="cmp-group-title" data-for="${STYLED}">Text</div>
    ${choice(c, "layout.look", "Style", { manuscript: "Manuscript: plain headings, contact details on the title page", book: "Book: display headings and title page" }, { forFormats: TYPESET })}
    <div class="cmp-grid">
      ${choice(c, "layout.font", "Font", Object.fromEntries(Object.keys(FONTS).map(f => [f, f])), { forFormats: TYPESET })}
      ${choice(c, "layout.size", "Size", SIZES, { forFormats: TYPESET, num: true })}
      ${choice(c, "layout.spacing", "Line spacing", SPACINGS, { forFormats: TYPESET, num: true })}
      ${choice(c, "layout.indent", "First-line indent", INDENTS, { forFormats: TYPESET, num: true })}
    </div>
    ${check(c, "layout.indentFirst", "Indent the first paragraph too", "Manuscripts indent every paragraph; books usually don’t indent the first one after a heading or break.", STYLED)}
    ${check(c, "layout.justify", "Justify (straight right edge)", "", TYPESET)}
    ${check(c, "layout.keepFormatting", "Keep my fonts, sizes, colours and highlights", "Off gives the clean, uniform text agents and printers expect.", STYLED)}
    ${check(c, "layout.underlineItalics", "Underline instead of italics", "Only for an agent or editor who asks for the old typewriter style.", "docx pdf")}

    <div class="cmp-group-title" data-for="${PAGED}">Page</div>
    <div class="cmp-grid">
      ${choice(c, "layout.pageSize", "Page size", Object.fromEntries(Object.entries(PAGE_SIZES).map(([k, v]) => [k, v.label])), { forFormats: PAGED })}
      ${choice(c, "layout.margins", "Margins", Object.fromEntries(Object.entries(MARGINS).map(([k, v]) => [k, v.label])), { forFormats: PAGED })}
    </div>
    ${choice(c, "layout.header", "Header and page numbers", RUNNING_HEADS, { forFormats: PAGED })}
    <div class="cmp-sub-plain" data-for="${PAGED}" data-header="manuscript">${text(c, "text.header", "Header text", { placeholder: "Surname / TITLE (automatic)", forFormats: PAGED })}</div>`;
}

const PANES = { contents: contentsPane, front: frontPane, layout: layoutPane };

// ---------------------------------------------------------------- the window

export function openCompile(p) {
  const c = compileSettings(p);
  let previewTimer = null;

  const body = `
    <div class="compile">
      <div class="cmp-side">
        <div class="cmp-formats">${Object.entries(FORMATS).map(([k, f]) =>
          `<button class="cmp-format ${c.format === k ? "on" : ""}" data-format="${k}"><b>${f.label}</b><span>${f.hint}</span></button>`).join("")}</div>
        <label class="field cmp-preset"><span>Preset</span><select data-preset>${Object.entries(PRESETS).map(([k, pr]) =>
          `<option value="${k}" ${c.preset === k ? "selected" : ""}>${pr.label}</option>`).join("")}</select></label>
        <p class="cmp-hint" id="cmp-preset-hint"></p>
        <div class="seg small cmp-tabs">
          <button data-tab="contents" class="${tab === "contents" ? "on" : ""}">Contents</button>
          <button data-tab="front" class="${tab === "front" ? "on" : ""}">Title & extras</button>
          <button data-tab="layout" class="${tab === "layout" ? "on" : ""}">Layout</button>
        </div>
        <div class="cmp-pane" id="cmp-pane"></div>
      </div>
      <div class="cmp-preview">
        <div class="cmp-preview-bar"><span id="cmp-stats"></span><span class="grow"></span><span class="faint">Preview</span></div>
        <iframe id="cmp-frame" title="Preview of the compiled book"></iframe>
      </div>
    </div>`;

  const goLabel = () => ({ docx: "Download Word file", pdf: "Open for PDF…", epub: "Download EPUB", html: "Download web page", md: "Download Markdown", txt: "Download text" }[c.format]);

  return modal({
    title: "Compile & export",
    wide: "xl",
    body,
    buttons: [
      { label: "Project backup (.json)", value: "json", left: true },
      { label: "Close", value: null },
      { label: goLabel(), kind: "primary", value: "go" },
    ],
    onMount(box) {
      const pane = $("#cmp-pane", box);
      const goBtn = $$(".modal-foot .btn", box).at(-1);
      // Enter in a text box shouldn't start an export
      box.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT") e.stopPropagation(); });

      const saveAndPreview = () => { scheduleSave(p); refresh(); schedulePreview(); };

      const refresh = () => {
        box.querySelectorAll("[data-for], [data-when], [data-header]").forEach(el => {
          const d = el.dataset;
          el.hidden = (d.for && !d.for.split(" ").includes(c.format)) || (d.when && !get(c, d.when))
            || (d.header && c.layout.header !== d.header) || false;
        });
        $$(".cmp-format", box).forEach(b => b.classList.toggle("on", b.dataset.format === c.format));
        const edited = presetEdited(c);
        $("#cmp-preset-hint", box).innerHTML = esc(PRESETS[c.preset].hint) +
          (edited ? ` <span class="cmp-edited">You’ve changed some of its settings. <button class="link" data-reset>Reset</button></span>` : "") +
          (!c.text.author.trim() && !c.text.penName.trim() && ["docx", "pdf", "epub"].includes(c.format)
            ? `<span class="cmp-warn">Add your name under <button class="link" data-goto-front>Title & extras</button>: it goes on the title page${c.layout.header === "manuscript" ? " and in the header" : ""}.</span>` : "");
        $("[data-goto-front]", box)?.addEventListener("click", () => $('.cmp-tabs [data-tab="front"]', box).click());
        $("[data-reset]", box)?.addEventListener("click", () => choosePreset(c.preset));
        goBtn.textContent = goLabel();
      };

      const renderPane = (from = null) => {
        pane.innerHTML = PANES[tab](p, c);
        $(".cmp-tabs .seg-thumb", box)?.remove();
        slideTabs($(".cmp-tabs", box), from, "data-tab", pane);
        refresh();
      };

      const choosePreset = key => {
        applyPreset(c, key);
        renderPane();
        saveAndPreview();
      };

      // format tiles, preset, tabs
      $$(".cmp-format", box).forEach(b => b.onclick = () => { c.format = b.dataset.format; saveAndPreview(); });
      $("[data-preset]", box).addEventListener("change", e => choosePreset(e.target.value));
      $(".cmp-tabs", box).addEventListener("click", e => {
        const b = e.target.closest("[data-tab]");
        if (!b || b.dataset.tab === tab) return;
        const from = tab;
        tab = b.dataset.tab;
        $$(".cmp-tabs button", box).forEach(x => x.classList.toggle("on", x === b));
        renderPane(from);
      });

      // every setting in the panes
      const onEdit = e => {
        const el = e.target.closest("[data-k]");
        if (el) {
          const value = el.type === "checkbox" ? el.checked : el.hasAttribute("data-num") ? parseFloat(el.value) : el.value;
          set(c, el.dataset.k, value);
          if (el.dataset.k === "layout.look") renderPane();
          saveAndPreview();
          return;
        }
        const ch = e.target.closest("[data-ch]");
        if (ch) {
          c.exclude = c.exclude.filter(id => id !== ch.dataset.ch);
          if (!ch.checked) c.exclude.push(ch.dataset.ch);
          saveAndPreview();
        }
      };
      pane.addEventListener("change", onEdit);
      pane.addEventListener("input", e => { if (e.target.matches("input[type=text], textarea")) onEdit(e); });
      pane.addEventListener("click", async e => {
        if (e.target.closest("[data-all], [data-none]")) {
          c.exclude = e.target.closest("[data-none]") ? p.chapters.map(ch => ch.id) : [];
          $$("[data-ch]", pane).forEach(x => { x.checked = !c.exclude.includes(x.dataset.ch); });
          saveAndPreview();
        }
        if (e.target.closest("[data-cover]")) {
          const file = await pickFile("image/jpeg,image/png");
          if (!file) return;
          try {
            c.cover = await api.uploadAsset(p.id, file);
          } catch (err) {
            return toast("Couldn’t store the cover: " + err.message);
          }
          renderPane();
          saveAndPreview();
        }
        if (e.target.closest("[data-cover-remove]")) { c.cover = ""; renderPane(); saveAndPreview(); }
      });

      // ---- preview
      const frame = $("#cmp-frame", box);
      const schedulePreview = () => { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 180); };
      function renderPreview() {
        if (!frame.isConnected) return;
        const book = buildBook(p, c, { limit: 3 });
        const chapters = book.chapters.length + book.more;
        $("#cmp-stats", box).textContent = chapters
          ? `${chapters} chapter${chapters === 1 ? "" : "s"} · ${fmt(book.words)} words`
          : "No chapters chosen";
        goBtn.disabled = !chapters;
        const paged = c.format === "docx" || c.format === "pdf";
        let html;
        if (c.format === "md" || c.format === "txt") {
          const out = (c.format === "md" ? bookMarkdown : bookText)(book);
          html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;color:#222;font:13px/1.6 Consolas,"Courier New",monospace}
            pre{white-space:pre-wrap;margin:0;padding:24px 28px}</style><pre>${esc(out)}${book.more ? `\n\n… and ${book.more} more chapters` : ""}</pre>`;
        } else {
          html = bookHtml(book, { mode: paged ? "preview" : "web" });
        }
        const y = frame.contentWindow?.scrollY || 0;
        frame.onload = async () => {
          const doc = frame.contentDocument;
          if (paged) {
            await paginatePreview(doc, book);
            if (frame.contentDocument !== doc) return;      // a newer preview has started
            const pageW = (PAGE_SIZES[c.layout.pageSize] || PAGE_SIZES.letter).w * 96;
            doc.documentElement.style.zoom = Math.min(1, (frame.clientWidth - 36) / pageW).toFixed(3);
          }
          frame.contentWindow.scrollTo(0, y);
        };
        frame.srcdoc = html;
      }

      renderPane();
      renderPreview();
    },
  }).then(r => {
    if (r?.value === "json") download(`${fileBase(p)}.noirwriter.json`, JSON.stringify(p, null, 1), "application/json");
    if (r?.value === "go") return exportBook(p, c);
  });
}

// ---------------------------------------------------------------- making the file

export async function exportBook(p, c, { format = c.format } = {}) {
  const book = buildBook(p, c);
  if (!book.chapters.length) return toast("Nothing to compile: no chapters are chosen.");
  const name = `${fileBase(p)}.${FORMATS[format].ext}`;
  try {
    switch (format) {
      case "docx": {
        const { bookDocx } = await import("../compile/docx.js");
        download(name, await bookDocx(book), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        break;
      }
      case "epub": {
        const { bookEpub } = await import("../compile/epub.js");
        let cover = null;
        if (c.cover) {
          const r = await fetch(c.cover);
          if (r.ok) cover = { bytes: new Uint8Array(await r.arrayBuffer()), ext: c.cover.split(".").pop().toLowerCase().replace("jpeg", "jpg") };
        }
        download(name, await bookEpub(book, { id: c.bookId, cover }), "application/epub+zip");
        break;
      }
      case "pdf": {
        const url = URL.createObjectURL(new Blob([bookHtml(book, { mode: "print", autoPrint: true })], { type: "text/html" }));
        const win = window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        if (!win) return toast("The browser blocked the new tab. Allow pop-ups for NoirWrite and try again.");
        toast("In the print window choose “Save as PDF”, and switch off “Headers and footers”.", { duration: 9000 });
        return;
      }
      case "html":
        download(name, bookHtml(book, { mode: "web" }), "text/html");
        break;
      case "md":
        download(name, bookMarkdown(book), "text/markdown");
        break;
      case "txt":
        download(name, bookText(book), "text/plain");
        break;
    }
    toast(`Downloaded “${name}”.`);
  } catch (err) {
    console.error(err);
    toast("Couldn’t compile the book: " + err.message);
  }
}
