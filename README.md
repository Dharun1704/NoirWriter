# NoirWrite

A personal novel-writing studio. It runs locally in your browser and needs nothing but Python.

## Start it

Double-click **`NoirWriter.bat`**. NoirWrite opens in your browser at http://127.0.0.1:8765, and that address works in Edge, Chrome or Firefox.

> **Keep the black NoirWrite window open while you write.** That window *is* NoirWrite. If you close it, the browser shows "unable to connect", and NoirWrite shows a red "server offline" banner. Your typing stays safe in the open tab and saves as soon as you start NoirWrite again.

## Projects and genres

When you create a project, you first choose **Fiction** or **Non-fiction**. For fiction you then pick **Crime / Thriller** or **Fantasy**. Each choice comes with a ready-made set of tools, and you can switch any tool on or off later under **Overview → Features**. Switching a tool off only hides it; nothing you wrote is deleted.

**Non-fiction** (memoir, biography, history, essays, guides) starts with **Plot & Timeline** and **Sources**. Sources holds books, articles, interviews and archives with their citations, key quotes and reliability notes. In non-fiction projects, "Characters" is called **People**.

**Every project includes**
- **Manuscript**: the main writing space (see below)
- **Characters**: character sheets whose fields change with the genre and the tools you've switched on
- **Notes & Research**
- **Writing stats**

**Thriller & crime tools**
- **Clues**: tracks every clue, red herring and twist from planted → revealed → paid off, and warns about continuity errors
- **Suspects & Solution**: a board of suspects with motive, alibi and secret, plus a private page for the real answer

**Fantasy worldbuilding tools**
- **Maps**: upload map images, zoom and pan, and drop pins linked to places, realms or characters
- **Magic Systems**: source, rules, costs and limits, plus a table of spells
- **Races & Creatures**, **Factions & Realms**, **Cultures & Religions**, **Artifacts & Items**, **Lore & History**
- **Languages**: a lexicon table, grammar notes and sample phrases

**Story tools for either genre**
- **Plot & Timeline**: colour-coded arcs and the true chronology of events, including off-page ones
- **Locations**: places nested inside places

Entries link to each other: a character's homeland, a faction's leader, a spell's practitioners. Every entry shows which scenes it appears in and where else it's mentioned.

## The Manuscript

- **Binder**: chapters and scenes. Drag scenes to reorder them, including into another chapter; scenes can also be duplicated. To reorder chapters, press the **⇅ Reorder** button at the top of the binder: drag chapters into place (the binder scrolls when you drag near its edge; Alt+↑/↓ moves the selected chapter; each move can be undone), then press **Done**. Each scene has a status: to do, draft, revised or final.
- **Write by scenes or by chapters** (the switch at the top of the binder, saved per project):
  - **Scenes:** every scene has its own page, as before.
  - **Chapters:** the binder lists chapters only, and a chapter opens as one continuous page. Scenes it already has appear inside, separated by ⁂, and the scene-details panel follows whichever scene your cursor is in. Inserting a **Scene break** (the + menu in the toolbar) starts a new scene there; deleting a ⁂ joins that scene to the one before it, keeping its details, with an Undo.
  - The **Corkboard** shows one card per chapter (drag to reorder chapters), and the **Outliner** one row per chapter; setting a chapter's status or POV sets it for all its scenes.
  - Switching never changes your writing: flip back to Scenes at any time and each scene is where you left it.
  - Plot & Timeline and Clues follow the same choice: links, the structure ruler and Story vs truth show chapters ("Ch 2 · The Docks") when you write by chapter.
- **Four views**:
  - **Write**: the editor
  - **Corkboard**: index cards you can drag around
  - **Outliner**: a table of every scene, editable in place
  - **Read-through**: the whole book as one continuous text
- **Formatting**: paragraph styles, fonts, sizes, bold, italic, underline, strikethrough, superscript and subscript, text colour, highlight, alignment, lists, indents, links, scene breaks, em dashes and clear-formatting.
- **Find & replace**: within a scene or across the whole manuscript (Ctrl+F).
- **Comments**: select text and press 💬. Comments are left out of exports.
- **Snapshots** (in the scene details panel): save a version with **+ Take** before a rewrite. **Compare** shows exactly what changed since then: removed words struck through in red, added words in green, with the word counts and ↑ ↓ to jump between changes. Pick any two versions to compare (two snapshots, or a snapshot and the current text), view either in full, or restore the older one (the current text is saved as a snapshot first). Writing by chapter, snapshots and Compare cover the whole chapter.
- **Focus mode** (Ctrl+Shift+F): hides everything except the page.
- **Typewriter scrolling**: keeps the line you're typing centred.
- **Smart quotes and em dashes**: typed quotes become curly, and `--` becomes —.
- **View settings (Aa)**: font, size, line spacing, page width, book-style indented paragraphs, and dark, sepia or light paper.
- **Status bar**: live counts of words, characters and selected words, plus reading time, progress towards the scene's word target, words this session and words today versus your goal.
- **Pasting from Word or Google Docs** keeps italics, bold and paragraph breaks and drops everything else.

## Writing tools

- **Search everything (Ctrl+K):** press Ctrl+K, or click **Search** at the top of the sidebar, to find scenes (including their text), chapters, characters, every worldbuilding entry, clues, timeline events and notes. Use ↑ ↓ and Enter to jump; a scene found by its text opens with the match highlighted.
- **Writing sprints:** click the timer button above the editor, pick 10–60 minutes and an optional word goal, and write. A live countdown and word count sit in the sidebar (it keeps running while you move between pages). Finished sprints show a summary and are listed under **Writing stats → Writing sprints**.
- **Style check:** the Aa✓ button above the editor marks adverbs (wavy underline), words repeated close together (blue) and sentences over 35 words (red tint) directly in your text, with counts in the status bar. Character and place names are never flagged. Nothing in your text is changed.
- **Story structure (Plot & Timeline → Structure):** choose Three-act, Save the Cat, Hero's Journey or Mystery / noir. A ruler over your chapters shows where each beat should fall, measured by word count. Assign a scene to each beat to see whether it lands on target, early or late.
- **Story vs truth (Plot & Timeline → Story vs truth):** your scenes in reading order beside the timeline in the order things really happened, joined by lines. Crossing lines show where the story is told out of order, and events with no scene are marked off-page.
- **Relationship web (Characters → Relationship web):** a live graph in the style of Obsidian's graph view. People push apart and relationships pull together like springs, so the web unfolds on its own; drag someone and their connections follow, then everything settles (the layout is remembered). Scroll to zoom, drag the background to pan, double-click the background or use ⤢ to fit everyone in view. Hover over a person to light up their connections; click to open their page. Better-connected people are drawn bigger.

## Layout & themes

- **Resize panels:** drag the edge of the sidebar, the binder or the scene-details panel to make it wider or narrower.
- **Hide a panel:** drag its edge all the way in. It folds into a thin strip; click the strip or drag it out to bring the panel back. Double-clicking an edge also hides or shows its panel.
- **Themes:** switch between **Noir** (black & orange) and **Honey** (warm cream & orange) with the two dots at the bottom of the sidebar or at the top right of the home page. The theme applies to the whole app.
- Panel sizes and theme are remembered in your browser. **Aa → Reset** restores the defaults.

## Writing stats

- **Goals**: words today versus your daily goal, current and best streak, and words in the last 7 and 30 days.
- **Pace**: writing time, words per hour, and how many words a day you need to meet your deadline.
- **Charts**: a 30-day bar chart and a 26-week writing calendar.
- **Manuscript analysis**: reading ease (Flesch score), grade level, sentence length, how much of the text is dialogue, -ly adverbs, your most-used words, crutch words and how often each character is mentioned.
- **Breakdowns**: a per-chapter table and a daily log.

## Your data

- Each project is one file: `data/<project-id>.json`. Changes autosave within about a second, and **Ctrl+S** saves immediately.
- Map and entry images are stored in `data/assets/<project-id>/`.
- A backup is taken at most every 5 minutes while you write and saved to `data/backups/`. NoirWrite keeps the newest 30 plus one for each of the last 60 days. To put one back, go to **Overview → Backups → Restore an earlier version**. The version you replace is backed up first.
- Every scene also keeps an **automatic daily snapshot**: the first time you edit a scene on a given day, a copy of how it looked before is saved under that scene's Snapshots (the last 10 per scene are kept). Writing by chapter, the daily copy is of the whole chapter.
- **Same project open in two windows?** Every save carries a version number. When you switch back to a tab, it picks up changes made elsewhere automatically. If both windows changed the project, NoirWrite stops and asks whether to load the newer version, keep yours, or save yours as a copy. Nothing is overwritten silently.
- **Backup folder (protects against a broken drive):** on the home page, choose a folder, ideally inside OneDrive, Google Drive or Dropbox so it syncs to the cloud. NoirWrite then keeps a copy of every project in `NoirWrite Backup` inside it, updated a couple of minutes after you write, plus one copy per day for the last 30 days and your images. It catches up whenever NoirWrite starts. The home page shows when the last copy was made, or warns if the folder can't be reached (your work still saves on this computer). To bring a book back, copy its `.json` file from the backup folder into `data`, or use **Import** on the home page.
- Deleted projects go to `data/trash/` and can be brought back from **Recently deleted** at the bottom of the home page.
- **Export / compile** (bottom of the sidebar) gives you Word (.doc), HTML (print it to get a PDF), Markdown, plain text or a full project backup (.json).

- **How big is it?** Text takes about 7 bytes per word, so a 35,000-word novel is roughly 250 KB on disk. Portraits add about 30–60 KB each, and snapshots add a copy of their scene. Map images are stored as separate files.

To back everything up by hand, copy the `data` folder.

## Testing

Double-click **RunTests.bat** (or run `python testsun_tests.py`) to check the whole app in about three minutes: server checks, every feature in a browser tab, and a look check of every page in both themes. Your own projects are never touched. See `tests/README.md`.
