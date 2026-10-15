# NoirWrite

A personal novel-writing studio. It runs on your own computer, in your browser, and needs nothing but Python.

- **Write** scene by scene or a whole chapter at a time, with a corkboard, an outliner and a read-through view.
- **Plan** with a plot timeline, story-structure beats, a character relationship web, and genre tools for crime, fantasy and non-fiction.
- **Revise** with snapshots that show exactly what changed, a style check, and find & replace across the book.
- **Finish** by compiling to a standard manuscript for agents, a print-ready paperback, or an EPUB e-book.
- **Keep it safe** with autosave, automatic backups and an optional backup folder in the cloud.

## Contents

- [Install](#install)
- [Projects and genres](#projects-and-genres)
- [The manuscript](#the-manuscript)
- [Writing tools](#writing-tools)
- [Compile & export](#compile--export)
- [Writing stats](#writing-stats)
- [Layout & themes](#layout--themes)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Your data and backups](#your-data-and-backups)
- [For developers](#for-developers)
- [Licence](#licence)

## Install

1. **Install Python 3.10 or newer** from https://www.python.org/downloads/.
   - **Windows:** during setup, tick **"Add python.exe to PATH"**.
   - **macOS:** run the installer. Linux usually has Python already.
2. **Download NoirWrite:** on the GitHub page, open **Releases** and download the latest ZIP (or click **Code → Download ZIP**). Unzip it somewhere you'll keep it, for example in Documents.
3. **Start it:**
   - **Windows:** double-click **`NoirWriter.bat`**.
   - **macOS:** double-click **`NoirWriter.command`**. The first time, macOS may say it's from an unidentified developer: right-click the file, choose **Open**, then **Open** again.
   - **Linux:** run `./NoirWriter.command` in a terminal.

NoirWrite opens in your browser at http://127.0.0.1:8765 (Edge, Chrome, Firefox or Safari).

> **Keep the NoirWrite window open while you write.** That window *is* NoirWrite. If you close it, the page shows a red "server offline" banner. Your typing stays safe in the open tab and saves as soon as you start NoirWrite again.

**Updating to a new version:** download and unzip the new version, then copy your old `data` folder into it. Your books, backups and images are all in `data`.

## Projects and genres

When you create a project, you choose **Fiction** or **Non-fiction**; for fiction, then **Crime / Thriller** or **Fantasy**. Each choice comes with a ready-made set of tools. You can switch any tool on or off later under **Overview → Features**; switching a tool off only hides it, and nothing you wrote is deleted.

**Every project includes**
- **Manuscript:** the main writing space
- **Characters:** character sheets whose fields fit the genre and the tools you've switched on
- **Notes & Research**
- **Writing stats**

**Thriller & crime**
- **Clues:** tracks every clue, red herring and twist from planted → revealed → paid off, and warns about continuity errors
- **Suspects & Solution:** a board of suspects with motive, alibi and secret, plus a private page for the real answer

**Fantasy worldbuilding**
- **Maps:** upload map images, zoom and pan, and drop pins linked to places, realms or characters
- **Magic Systems:** source, rules, costs and limits, plus a table of spells
- **Languages:** a lexicon, grammar notes and sample phrases
- **Races & Creatures**, **Factions & Realms**, **Cultures & Religions**, **Artifacts & Items**, **Lore & History**

**Non-fiction** (memoir, biography, history, essays, guides)
- **Sources:** books, articles, interviews and archives, with citations, key quotes and reliability notes
- "Characters" is called **People**

**For any genre**
- **Plot & Timeline:** colour-coded arcs and the true chronology of events, including off-page ones
- **Locations:** places nested inside places

Entries link to each other: a character's homeland, a faction's leader, a spell's practitioners. Every entry shows which scenes it appears in and where else it's mentioned.

## The manuscript

**Four views**, switched at the top of the editor:
- **Write:** the editor
- **Corkboard:** index cards you can drag around
- **Outliner:** a table of every scene, editable in place
- **Read-through:** the whole book as one continuous text

**The binder** lists your chapters and scenes.
- Drag scenes to reorder them, including into another chapter. Scenes can also be duplicated.
- Each scene has a status: to do, draft, revised or final.
- To reorder chapters, press **⇅ Reorder** at the top of the binder, drag the chapters into place (or use Alt+↑/↓), then press **Done**. Every move can be undone.

**Write by scenes or by chapters.** The switch at the top of the binder is saved per project.
- **Scenes:** every scene has its own page.
- **Chapters:** a chapter opens as one continuous page, with its scenes separated by ⁂. The scene-details panel follows whichever scene your cursor is in.
  - **Toolbar + → Scene break** starts a new scene where the cursor is.
  - Deleting a ⁂ joins that scene to the one before it, keeping its details, with an Undo.
  - The corkboard shows one card per chapter, and the outliner one row per chapter. Setting a chapter's status or POV sets it for all its scenes.
  - Plot & Timeline and Clues show chapters too ("Ch 2 · The Docks").
- Switching never changes your writing: flip back at any time and each scene is where you left it.

**In the editor**
- **Formatting:** paragraph styles, fonts, sizes, bold, italic, underline, strikethrough, superscript and subscript, text colour, highlight, alignment, lists, indents, links and scene breaks.
- **Smart typing:** straight quotes become curly, and `--` becomes an em dash (—).
- **Find & replace** within a scene or across the whole manuscript.
- **Comments:** select text and press 💬. Comments are never included when you compile.
- **Focus mode** hides everything except the page; **typewriter scrolling** keeps the line you're typing centred.
- **View settings (Aa):** font, size, line spacing, page width, book-style indented paragraphs, and dark, sepia or light paper.
- **Status bar:** words, characters and selected words, reading time, progress towards the scene's word target, words this session and words today.
- **Pasting from Word or Google Docs** keeps italics, bold and paragraph breaks and drops everything else.

**Snapshots** (in the scene-details panel) save a version before a rewrite: press **+ Take**.
- **Compare** shows exactly what changed: removed words struck through in red, added words in green, with ↑ ↓ to jump between changes.
- Compare any two versions, view either in full, or restore an older one. The current text is saved as a snapshot first.
- Every scene also gets an **automatic daily snapshot** the first time you edit it each day (the last 10 are kept).
- When writing by chapter, snapshots cover the whole chapter.

## Writing tools

- **Search everything:** press Ctrl+K (or click **Search** in the sidebar) to find scenes and their text, chapters, characters, worldbuilding entries, clues, timeline events and notes. A scene found by its text opens with the match highlighted.
- **Writing sprints:** click the timer above the editor, pick 10–60 minutes and an optional word goal, and write. The countdown stays in the sidebar while you move between pages, and finished sprints are listed under **Writing stats**.
- **Style check:** the **Aa✓** button marks adverbs (wavy underline), words repeated close together (blue) and sentences over 35 words (red tint), with counts in the status bar. Character and place names are never flagged, and nothing in your text is changed.
- **Story structure** (Plot & Timeline → Structure): choose Three-act, Save the Cat, Hero's Journey or Mystery / noir. A ruler over your chapters shows where each beat should fall by word count; assign a scene to each beat to see whether it lands early, on target or late.
- **Story vs truth** (Plot & Timeline → Story vs truth): your scenes in reading order beside the events in the order they really happened, joined by lines. Crossing lines show where the story is told out of order; events with no scene are marked off-page.
- **Relationship web** (Characters → Relationship web): a live graph in the style of Obsidian's graph view.
  - People push apart and relationships pull together like springs. Drag someone and their connections follow; the layout is remembered.
  - Scroll to zoom, drag the background to pan, and double-click the background (or press ⤢) to fit everyone in view.
  - Hover over a person to light up their connections; click to open their page. Better-connected people are drawn bigger.

## Compile & export

**Compile & export** (bottom of the sidebar) turns your book into a finished file, with a live, page-by-page preview as you change the settings. Your choices are saved with the project, so the next compile is one click.

**Formats:** Word (.docx), PDF, EPUB e-book, web page, Markdown and plain text, plus a full project backup (.json).

**Presets**
- **Standard manuscript**, for agents and editors: 12 pt Times New Roman, double-spaced, 1-inch margins, a `Surname / TITLE / page` header, a title page with your contact details and a rounded word count, and chapters starting a third of the way down a new page.
- **Paperback**, for KDP, IngramSpark or Lulu: 6 × 9 in, Garamond, justified, mirrored margins, author and title running heads, page numbers at the foot, no running head on chapter openings, and Chapter One on a right-hand page.
- **E-book:** a reflowable EPUB with a linked table of contents and an optional cover image.
- **Beta readers:** easy to read, with scene titles shown.

**Settings**
- **Contents:** pick the chapters, and optionally leave out scenes marked "to do".
- **Title & extras:** subtitle, pen name and legal name, contact details, copyright page (written for you, or your own text), dedication, epigraph, table of contents, "The End", acknowledgements and about the author.
- **Layout:** chapter headings (Chapter One, Chapter 1, One, 1, I, or the title only), chapter and scene titles, the scene-break mark, font, size, line spacing, indents, justification, page size, margins and the header. The fonts, colours and highlights you used while writing are left out unless you choose to keep them.

**Good to know**
- The **Word file** uses real Word styles (Heading 1 for chapters, and so on), so Word's navigation pane lists your chapters and you can restyle the whole book in one place.
- **PDF** opens the book in a new tab with the print window: choose *Save as PDF* and switch off the browser's *Headers and footers*. For a print-on-demand interior, the Word file is more precise: browsers can't yet leave the running head off a chapter's first page.

## Writing stats

- **Goals:** words today against your daily goal, current and best streak, and words in the last 7 and 30 days.
- **Pace:** writing time, words per hour, and how many words a day you need to meet your deadline.
- **Charts:** a 30-day bar chart and a 26-week writing calendar.
- **Manuscript analysis:** reading ease (Flesch score), grade level, sentence length, how much of the text is dialogue, -ly adverbs, your most-used words, crutch words, and how often each character is mentioned.
- **Breakdowns:** a per-chapter table and a daily log.

## Layout & themes

- **Resize panels:** drag the edge of the sidebar, the binder or the scene-details panel.
- **Hide a panel:** drag its edge all the way in, or double-click the edge. It folds into a thin strip; click the strip to bring it back.
- **Themes:** **Noir** (black & orange) or **Honey** (warm cream & orange), using the two dots at the bottom of the sidebar or at the top right of the home page.
- Panel sizes and the theme are remembered in your browser. **Aa → Reset** restores the defaults.

## Keyboard shortcuts

| Keys | What it does |
|---|---|
| Ctrl+K | Search everything |
| Ctrl+F or Ctrl+H | Find & replace (in the editor) |
| Ctrl+S | Save now |
| Ctrl+Shift+F | Focus mode |
| Alt+↑ / Alt+↓ | Move a chapter (while reordering) |

On a Mac, use Cmd instead of Ctrl.

## Your data and backups

Everything lives in the `data` folder next to NoirWrite. To back it all up by hand, copy that folder.

- **Saving:** each project is one file, `data/<project-id>.json`. Changes save automatically within about a second.
- **Images:** map and entry images are stored in `data/assets/<project-id>/`.
- **Automatic backups:** taken at most every 5 minutes while you write, in `data/backups/`. The newest 30 are kept, plus one for each of the last 60 days. To go back, open **Overview → Backups → Restore an earlier version**; the version you replace is backed up first.
- **Backup folder** (protects against a broken drive): on the home page, choose a folder, ideally inside OneDrive, Google Drive or Dropbox so it syncs to the cloud.
  - NoirWrite keeps a copy of every project in `NoirWrite Backup` inside it, updated a couple of minutes after you write, plus one copy per day for the last 30 days and your images.
  - The home page shows when the last copy was made, or warns if the folder can't be reached (your work still saves on this computer).
  - To bring a book back, copy its `.json` file into `data`, or use **Import** on the home page.
- **Deleted projects** go to `data/trash/` and can be brought back from **Recently deleted** at the bottom of the home page.
- **Two windows on one project:** every save carries a version number, and each window picks up changes made in the other. If both changed the project, NoirWrite asks whether to load the newer version, keep yours, or save yours as a copy. Nothing is overwritten silently.
- **How big is it?** About 7 bytes per word, so a 35,000-word novel takes roughly 250 KB. Portraits add about 30–60 KB each, and snapshots add a copy of their scene.

## For developers

NoirWrite is a small Python standard-library server (`server.py`) and a plain JavaScript app (`static/`), with no build step and no dependencies.

**Tests:** double-click **RunTests.bat**, or run `python tests/run_tests.py`, to check the whole app in a few minutes: server checks, every feature driven in a browser tab, and a look check of every page in both themes. Your own projects are never touched. See [`tests/README.md`](tests/README.md).

## Licence

NoirWrite is free software: you can use it, share it and change it under the terms of the **GNU General Public License, version 3** or (at your option) any later version. See [`LICENSE`](LICENSE). If you share a changed version, you must share its source code under the same licence. NoirWrite comes with no warranty.

Copyright © 2026 Dharun Vaibhav U.
