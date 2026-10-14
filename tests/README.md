# NoirWrite tests

One command checks the whole app in about three minutes:

```
python tests\run_tests.py
```

or double-click **RunTests.bat** in the NoirWriter folder.

Nothing to install: only Python and your normal browser are used. Your own projects are never touched: the tests start a private copy of the server on a free port, with an empty temporary data folder that is deleted afterwards. Your running NoirWrite (port 8765) is not affected.

## What it checks

1. **Server checks** (a few seconds, in the terminal):
   - bad and malicious requests are refused;
   - a 1.3 MB book saves and loads quickly;
   - a save from an out-of-date window is refused, and a forced save is backed up;
   - 20 simultaneous saves (exactly one wins, and the file stays valid);
   - 100 saves in a row;
   - the trash and restoring from it;
   - restoring a backup;
   - listing many projects;
   - the backup folder (copies, grouping of quick saves, daily copies, images, and an unplugged drive).
2. **App checks** (a browser tab opens and drives the real app):
   - writing and the toolbar, find, settings, focus mode, the style check, sprints;
   - the binder, writing by chapter, snapshots and Compare;
   - corkboard drag, reordering chapters, the outliner;
   - themed dropdowns and checkboxes, the folding switchers;
   - search, Plot & Timeline, characters, places;
   - two windows, working offline, exports, backups, the home page;
   - the speed of a 60-chapter, 300-scene book.
3. **Look check:** every element's style on 30 pages, in both themes, compared with the reference in `tests/baseline/`. It catches accidental visual changes from a CSS edit.

The terminal prints PASS / FAIL for every check, with the reason for each failure, and ends with "All checks passed" (exit code 0) or a count of failures (exit code 1).

## Options

| Command | What it does |
|---|---|
| `python tests\run_tests.py --server-only` | Just the server checks (seconds). |
| `python tests\run_tests.py --update-baseline` | You changed the look on purpose: accept the current look as the new reference. |
| `python tests\run_tests.py --no-open` | Don't open the browser; open the printed address yourself. |
| `python tests\run_tests.py --keep` | Leave the test server running afterwards, to look around. |

While fixing one check, open the test page with `?only=` and a word from its name, e.g. `http://127.0.0.1:<port>/tests/?only=snapshots` (with `--keep`).

## Good to know

- **Keep the test tab in front** while it runs. Browsers slow down background tabs, which makes the run take longer and can make timing-sensitive checks fail.
- The app runs in a fixed 1400 × 900 frame with a fixed clock and animations off, so results don't depend on your window size or the time of day.
- **Different browsers compute styles slightly differently.** The reference remembers which browser recorded it; the first run in a different browser records a new reference for that browser instead of reporting differences.
- Google Fonts are loaded from the internet. Offline, the look check will report differences (other fonts have other sizes).

## Files

| File | What it is |
|---|---|
| `run_tests.py` | Starts the test server, runs everything, prints the report, compares the look. |
| `server_tests.py` | The server checks (`check_*` functions). |
| `browser/tests.js` | The app checks, plus the seeded test book and the 30-page tour for the look check. |
| `browser/runner.js` | The test page: helpers for driving the app, error catching, style snapshots, reporting. |
| `browser/test-mode.js` | Loaded into the app under test: fixed clock, no animations. |
| `baseline/` | The reference look (`*.json.gz`) and the browser it was recorded in. |

The server only serves the test page and accepts results when the runner starts it with `NOIRWRITER_TEST=1`. Normal use is unaffected.

## Adding a check

- **Server:** add a function `check_something(t)` to `server_tests.py`. Use `t.req(method, path, body)` and `t.ok(condition, "message")`.
- **App:** add `["Name", async t => { … }]` to `TESTS` in `browser/tests.js`. Useful helpers:
  - `seedBook()`, `t.load(route)`, `t.go(route)`;
  - `t.click(selector)`, `t.type(text)`, `t.key("Escape")`, `t.choose(dropdown, "text")`;
  - `t.until(fn)`, `t.savedWhen(id, book => …)`;
  - `t.ok(condition, "message")`, `t.eq(actual, expected, "what")`.
