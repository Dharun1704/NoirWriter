"""Run NoirWrite's tests: server checks, then the app in your browser, then the look check.

    python tests/run_tests.py                    run everything (about 3 minutes)
    python tests/run_tests.py --server-only      just the server checks (a few seconds)
    python tests/run_tests.py --update-baseline  accept the current look as the new reference

A private copy of the server is started on a free port with an empty, temporary data folder,
so your own projects and your running NoirWrite are never touched. Uses only the Python standard library.
"""

import argparse
import gzip
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.request
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
BASELINE = HERE / "baseline"
sys.path.insert(0, str(HERE))
import server_tests  # noqa: E402

GEOMETRY = {"top", "left", "right", "bottom", "width", "height", "translate", "transform"}
GEOMETRY_TOLERANCE = 2.0      # px: font rendering can shift layouts by a pixel between runs
BROWSER_TIMEOUT = 15 * 60     # seconds to wait for the browser tests

GREEN, RED, YELLOW, DIM, BOLD, RESET = ("\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[1m", "\033[0m") \
    if sys.stdout.isatty() else ("",) * 6


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_server(data: Path, port: int) -> subprocess.Popen:
    env = dict(os.environ, NOIRWRITER_PORT=str(port), NOIRWRITER_DATA=str(data),
               NOIRWRITER_TEST="1", NOIRWRITER_MIRROR_INTERVAL="3")
    proc = subprocess.Popen([sys.executable, str(ROOT / "server.py"), "--no-browser"], cwd=ROOT, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    for _ in range(100):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/api/projects", timeout=1)
            return proc
        except Exception:
            if proc.poll() is not None:
                raise SystemExit("The test server didn't start:\n" + proc.stderr.read().decode(errors="replace"))
            time.sleep(0.1)
    proc.kill()
    raise SystemExit("The test server didn't answer.")


# ---------------------------------------------------------------- server checks

def run_server_checks(base: str, data: Path, scratch: Path) -> list[dict]:
    print(f"\n{BOLD}Server checks{RESET}")
    results = []
    for fn in server_tests.CHECKS:
        name = fn.__name__[len("check_"):].replace("_", " ")
        t = server_tests.Ctx(base, data, scratch)
        start = time.time()
        try:
            fn(t)
            ok, msg = True, ""
        except AssertionError as e:
            ok, msg = False, str(e)
        except Exception:
            ok, msg = False, traceback.format_exc(limit=3)
        ms = (time.time() - start) * 1000
        results.append({"name": name, "ok": ok, "message": msg, "notes": t.notes})
        mark = f"{GREEN}PASS{RESET}" if ok else f"{RED}FAIL{RESET}"
        print(f"  {mark}  {name} {DIM}({ms:.0f} ms){'  ' + '; '.join(t.notes) if t.notes else ''}{RESET}")
        if msg:
            print(f"        {RED}{msg}{RESET}")
    return results


# ---------------------------------------------------------------- browser checks

def run_browser_checks(base: str, results_dir: Path, open_browser: bool) -> dict | None:
    url = f"{base}/tests/"
    print(f"\n{BOLD}App checks{RESET} in your browser: {url}")
    print(f"  {DIM}Keep that tab in front until it finishes (browsers slow down background tabs).{RESET}")
    if open_browser:
        webbrowser.open(url)
    report = results_dir / "report.json"
    progress = results_dir / "progress.json"
    deadline, shown = time.time() + BROWSER_TIMEOUT, ""
    while time.time() < deadline:
        if report.exists():
            print()
            return json.loads(report.read_text("utf-8"))
        if progress.exists():
            try:
                p = json.loads(progress.read_text("utf-8"))
                line = f"  {p['done']}/{p['total']}  {p['current']}"
                if line != shown:
                    print(f"\r{line[:110]:<110}", end="", flush=True)
                    shown = line
            except (json.JSONDecodeError, KeyError, OSError):
                pass
        time.sleep(0.5)
    print(f"\n  {RED}No result from the browser within {BROWSER_TIMEOUT // 60} minutes.{RESET}")
    return None


def print_browser_report(report: dict) -> list[dict]:
    for r in report["results"]:
        mark = f"{GREEN}PASS{RESET}" if r["ok"] else f"{RED}FAIL{RESET}"
        notes = f"  {'; '.join(r.get('notes', []))}" if r.get("notes") else ""
        print(f"  {mark}  {r['name']} {DIM}({r['ms']} ms){notes}{RESET}")
        for m in r.get("failures", []):
            print(f"        {RED}{m}{RESET}")
    return report["results"]


# ---------------------------------------------------------------- the look check (style snapshots)

def load_snapshot(path: Path) -> dict:
    data = gzip.decompress(path.read_bytes()) if path.suffix == ".gz" else path.read_bytes()
    return json.loads(data)


def browser_name(user_agent: str) -> str:
    """'Edge 131', 'Chrome 131', 'Firefox 133'…: browsers can compute styles a little differently."""
    for token, name in (("Edg/", "Edge"), ("OPR/", "Opera"), ("Firefox/", "Firefox"), ("Chrome/", "Chrome"), ("Version/", "Safari")):
        m = re.search(re.escape(token) + r"(\d+)", user_agent)
        if m:
            return f"{name} {m.group(1)}"
    return "unknown browser"


def compare_snapshots(results_dir: Path, update: bool, browser: str) -> dict:
    current = {f.stem[len("snap-"):]: f for f in sorted(results_dir.glob("snap-*.json"))}
    print(f"\n{BOLD}Look check{RESET} ({len(current)} page states, {browser})")
    if not current:
        print(f"  {YELLOW}No snapshots were taken.{RESET}")
        return {"ok": False, "changed": 0}
    # a reference recorded in another browser isn't comparable: record one for this browser
    meta_file = BASELINE / "browser.txt"
    recorded_in = meta_file.read_text("utf-8").strip() if meta_file.exists() else ""
    if recorded_in and recorded_in.split()[0] != browser.split()[0] and not update:
        print(f"  {YELLOW}The reference look was recorded in {recorded_in}; recording it again for {browser}.{RESET}")
        update = True
    if update or not any(BASELINE.glob("*.json.gz")):
        BASELINE.mkdir(exist_ok=True)
        for old in BASELINE.glob("*.json.gz"):
            old.unlink()
        for name, f in current.items():
            (BASELINE / f"{name}.json.gz").write_bytes(gzip.compress(f.read_bytes(), 9))
        meta_file.write_text(browser + "\n", "utf-8")
        why = "updated" if update else "recorded for the first time"
        print(f"  {GREEN}Reference look {why}{RESET} ({len(current)} page states in tests/baseline).")
        return {"ok": True, "changed": 0}

    changed_pages = 0
    for name, f in current.items():
        ref = BASELINE / f"{name}.json.gz"
        if not ref.exists():
            print(f"  {YELLOW}NEW {RESET} {name}  (no reference yet; run with --update-baseline to accept)")
            changed_pages += 1
            continue
        a, b = load_snapshot(ref), load_snapshot(f)
        props = a["props"] + ["::before", "::after"]
        rows_a = {r[0]: (r[1], a["styles"][r[2]]) for r in a["rows"]}
        rows_b = {r[0]: (r[1], b["styles"][r[2]]) for r in b["rows"]}
        diffs = []
        for path in rows_a.keys() & rows_b.keys():
            (cls, va), (_, vb) = rows_a[path], rows_b[path]
            if va == vb:
                continue
            xa, xb = va.split("|"), vb.split("|")
            changes = []
            for i, (x, y) in enumerate(zip(xa, xb)):
                if x == y:
                    continue
                prop = props[i] if i < len(props) else f"#{i}"
                if prop in GEOMETRY and close_enough(x, y):
                    continue
                changes.append((prop, x, y))
            if changes:
                diffs.append((path, cls, changes))
        missing, added = rows_a.keys() - rows_b.keys(), rows_b.keys() - rows_a.keys()
        if diffs or missing or added:
            changed_pages += 1
            print(f"  {RED}DIFF{RESET} {name}: {len(diffs)} elements look different"
                  f"{f', {len(missing)} gone' if missing else ''}{f', {len(added)} new' if added else ''}")
            for path, cls, changes in diffs[:6]:
                print(f"        {DIM}{path[-60:]}{RESET} .{cls[:40]}")
                for prop, x, y in changes[:5]:
                    print(f"            {prop}: {x[:60]}  ->  {y[:60]}")
    if not changed_pages:
        print(f"  {GREEN}PASS{RESET}  every page looks exactly like the reference")
    else:
        print(f"  {YELLOW}{changed_pages} page states differ from the reference.{RESET} If you changed the look on purpose, "
              f"run {BOLD}python tests/run_tests.py --update-baseline{RESET}.")
    return {"ok": not changed_pages, "changed": changed_pages}


def close_enough(x: str, y: str) -> bool:
    try:
        return abs(float(x.rstrip("px")) - float(y.rstrip("px"))) <= GEOMETRY_TOLERANCE
    except ValueError:
        return False


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="Run NoirWrite's tests against a private test server.")
    ap.add_argument("--server-only", action="store_true", help="only the server checks")
    ap.add_argument("--update-baseline", action="store_true", help="accept the current look as the reference")
    ap.add_argument("--no-open", action="store_true", help="don't open the browser (open the printed address yourself)")
    ap.add_argument("--keep", action="store_true", help="keep the test server running and its data afterwards")
    args = ap.parse_args()
    if os.name == "nt":
        os.system("")                      # let Windows terminals show colours

    # test folders left behind by a run that was stopped abruptly are cleared after a day
    for old in Path(tempfile.gettempdir()).glob("noirwrite-tests-*"):
        if time.time() - old.stat().st_mtime > 86400:
            shutil.rmtree(old, ignore_errors=True)
    scratch = Path(tempfile.mkdtemp(prefix="noirwrite-tests-"))
    data = scratch / "data"
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    server = start_server(data, port)
    print(f"{BOLD}NoirWrite tests{RESET}  {DIM}(test server {base}, data in {scratch}){RESET}")
    started = time.time()
    failed = 0
    try:
        server_results = run_server_checks(base, data, scratch)
        failed += sum(not r["ok"] for r in server_results)
        look = {"ok": True}
        if not args.server_only:
            # the app checks get a fresh server and an empty data folder of their own
            server.terminate()
            server.wait(5)
            data = scratch / "app-data"
            server = start_server(data, port)
            report = run_browser_checks(base, data / "test-results", not args.no_open)
            if report is None:
                failed += 1
            else:
                failed += sum(not r["ok"] for r in print_browser_report(report))
                look = compare_snapshots(data / "test-results", args.update_baseline, browser_name(report.get("browser", "")))
        total_time = time.time() - started
        print()
        if failed == 0 and look.get("ok"):
            print(f"{GREEN}{BOLD}All checks passed{RESET} in {total_time:.0f} s.")
        else:
            parts = []
            if failed:
                parts.append(f"{failed} check{'s' if failed != 1 else ''} failed")
            if not look.get("ok"):
                parts.append(f"{look.get('changed', 0)} page states look different")
            print(f"{RED}{BOLD}{', '.join(parts)}{RESET} ({total_time:.0f} s).")
        if args.keep:
            input(f"\nThe test server is still running at {base} (data in {data}). Press Enter to stop it. ")
        return 0 if failed == 0 and look.get("ok") else 1
    finally:
        server.terminate()
        try:
            server.wait(5)
        except subprocess.TimeoutExpired:
            server.kill()
        if not args.keep:
            shutil.rmtree(scratch, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
