"""Server checks: run by run_tests.py against a private test server (its own port and data folder).

Each check is a function `check_*(t)`; `t` has the server address, the test data folder and helpers.
"""

import json
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path


class Ctx:
    def __init__(self, base: str, data: Path, scratch: Path):
        self.base, self.data, self.scratch = base, data, scratch
        self.notes: list[str] = []

    def req(self, method, path, body=None, raw=None, ctype="application/json"):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        r = urllib.request.Request(self.base + path, data=data, method=method, headers={"Content-Type": ctype})
        try:
            with urllib.request.urlopen(r, timeout=60) as resp:
                text = resp.read()
                return resp.status, (json.loads(text) if text[:1] in (b"{", b"[") else text)
        except urllib.error.HTTPError as e:
            text = e.read()
            return e.code, (json.loads(text) if text[:1] in (b"{", b"[") else text)

    def ok(self, cond, message):
        if not cond:
            raise AssertionError(message)

    def note(self, text):
        self.notes.append(text)


def project(pid, words=60, chapters=2, text=None):
    para = text or "The rain fell on the city all night. " * (words // 8 + 1)
    return {"id": pid, "title": f"Test {pid}", "genre": "thriller", "version": 2, "rev": 0,
            "chapters": [{"id": f"c{i}", "title": f"Chapter {i + 1}",
                          "scenes": [{"id": f"s{i}", "title": "Scene", "content": f"<p>{para}</p>"}]} for i in range(chapters)]}


# ---------------------------------------------------------------- safety: bad requests are refused

def check_bad_requests_are_refused(t: Ctx):
    for path in ["/api/projects/..%2F..%2Fserver", "/api/projects/../../server.py", "/api/projects/UPPER", "/api/projects/a%00b"]:
        status, _ = t.req("GET", path)
        t.ok(status in (400, 404), f"GET {path} gave {status}")
    t.ok(t.req("PUT", "/api/projects/bad..id", project("x"))[0] in (400, 404), "a bad project id was accepted")
    t.ok(t.req("PUT", "/api/projects/x-1", raw=b"{not json")[0] == 400, "broken JSON was accepted")
    t.ok(t.req("PUT", "/api/projects/x-1", project("different-id"))[0] == 400, "a body for another project id was accepted")
    t.ok(t.req("PUT", "/api/assets/x-1/..%2Fevil.png", raw=b"x", ctype="image/png")[0] in (400, 404), "asset path escaped")
    t.ok(t.req("PUT", "/api/assets/x-1/script.js", raw=b"alert(1)", ctype="image/png")[0] == 400, "a non-image upload was accepted")
    t.ok(t.req("GET", "/../server.py")[0] in (400, 403, 404), "a file outside the app was served")
    t.ok(t.req("GET", "/assets/../../server.py")[0] in (400, 403, 404), "an asset path escaped")
    t.ok(t.req("GET", "/favicon.ico")[0] == 204, "favicon request isn't answered quietly")


# ---------------------------------------------------------------- saving

def check_big_book_saves_and_loads_quickly(t: Ctx):
    big = project("big-book", chapters=1)
    big["chapters"] = [{"id": f"c{i}", "title": f"Chapter {i}", "scenes": [
        {"id": f"s{i}-{j}", "title": "S", "content": "<p>" + ("The rain fell on the city all night. " * 120) + "</p>"} for j in range(5)]}
        for i in range(60)]
    payload = json.dumps(big).encode()
    start = time.time()
    status, _ = t.req("PUT", "/api/projects/big-book", raw=payload)
    save_ms = (time.time() - start) * 1000
    t.ok(status == 200, f"saving a {len(payload) // 1024} KB book failed ({status})")
    start = time.time()
    status, loaded = t.req("GET", "/api/projects/big-book")
    load_ms = (time.time() - start) * 1000
    t.ok(status == 200 and loaded["chapters"][59]["scenes"][4]["id"] == "s59-4", "the big book didn't load back intact")
    t.ok(save_ms < 3000 and load_ms < 3000, f"too slow: save {save_ms:.0f} ms, load {load_ms:.0f} ms")
    t.note(f"{len(payload) // 1024} KB book: save {save_ms:.0f} ms, load {load_ms:.0f} ms")


def check_stale_save_is_refused_and_force_overrides(t: Ctx):
    t.req("PUT", "/api/projects/two-windows?force=1", project("two-windows"))
    _, cur = t.req("GET", "/api/projects/two-windows")
    stale = dict(cur, rev=cur["rev"] - 1, title="stale")
    t.ok(t.req("PUT", "/api/projects/two-windows", stale)[0] == 409, "a save from an out-of-date window wasn't refused")
    t.ok(t.req("PUT", "/api/projects/two-windows?force=1", stale)[0] == 200, "a forced save was refused")
    t.ok(any(t.data.joinpath("backups").glob("two-windows--*.json")), "the overwritten version wasn't backed up")


def check_simultaneous_saves(t: Ctx):
    t.req("PUT", "/api/projects/race?force=1", project("race"))
    _, cur = t.req("GET", "/api/projects/race")
    codes = []

    def writer(i):
        p = project("race")
        p["rev"], p["title"] = cur["rev"], f"writer {i}"
        codes.append(t.req("PUT", "/api/projects/race", p)[0])

    threads = [threading.Thread(target=writer, args=(i,)) for i in range(20)]
    [th.start() for th in threads]
    [th.join() for th in threads]
    t.ok(codes.count(200) == 1 and codes.count(409) == 19, f"20 simultaneous saves: {codes.count(200)} won, {codes.count(409)} refused, others {[c for c in codes if c not in (200, 409)]}")
    status, after = t.req("GET", "/api/projects/race")
    t.ok(status == 200 and after["title"].startswith("writer"), "the file isn't valid after the race")
    t.ok(not list(t.data.glob("*.tmp")), "temporary files were left behind")


def check_many_saves_in_a_row(t: Ctx):
    t.req("PUT", "/api/projects/autosave?force=1", project("autosave"))
    start = time.time()
    for i in range(100):
        _, meta = t.req("GET", "/api/projects/autosave/meta")
        p = project("autosave")
        p["rev"], p["title"] = meta["rev"], f"save {i}"
        status, _ = t.req("PUT", "/api/projects/autosave", p)
        t.ok(status == 200, f"save {i} failed ({status})")
    each = (time.time() - start) * 10
    t.note(f"100 saves in a row: {each:.0f} ms each")


# ---------------------------------------------------------------- versions, trash, backups

def check_trash_and_restore(t: Ctx):
    t.req("PUT", "/api/projects/to-trash?force=1", project("to-trash"))
    t.ok(t.req("DELETE", "/api/projects/to-trash")[0] == 200, "delete failed")
    t.ok(t.req("GET", "/api/projects/to-trash")[0] == 404, "the deleted project still loads")
    _, trash = t.req("GET", "/api/trash")
    item = next((x for x in trash if x["id"] == "to-trash"), None)
    t.ok(item, "the deleted project isn't in the trash")
    t.ok(t.req("POST", "/api/trash/restore", {"file": item["file"]})[0] == 200, "restore from the trash failed")
    t.ok(t.req("GET", "/api/projects/to-trash")[0] == 200, "the restored project doesn't load")


def check_backup_restore(t: Ctx):
    t.req("PUT", "/api/projects/backed?force=1", project("backed", text="First version."))
    _, cur = t.req("GET", "/api/projects/backed")
    cur["chapters"][0]["scenes"][0]["content"] = "<p>Second version.</p>"
    t.req("PUT", "/api/projects/backed?force=1", cur)          # forced save: backs up the first version
    _, backups = t.req("GET", "/api/projects/backed/backups")
    t.ok(backups, "no backup was made")
    status, restored = t.req("POST", "/api/projects/backed/restore", {"file": backups[-1]["file"]})
    t.ok(status == 200 and "First version" in restored["chapters"][0]["scenes"][0]["content"], "restoring the backup didn't bring back the old text")
    t.ok(restored["rev"] > cur["rev"], "the restored version didn't get a newer version number")
    t.ok(t.req("POST", "/api/projects/backed/restore", {"file": "../../server.py"})[0] == 400, "a bad backup name was accepted")


def check_many_projects_list(t: Ctx):
    for i in range(30):
        t.req("PUT", f"/api/projects/many-{i}?force=1", project(f"many-{i}"))
    start = time.time()
    status, projects = t.req("GET", "/api/projects")
    ms = (time.time() - start) * 1000
    t.ok(status == 200 and len(projects) >= 30, "the project list is incomplete")
    t.ok(all(p["id"] != "settings" for p in projects), "the settings file shows up as a project")
    t.note(f"{len(projects)} projects listed in {ms:.0f} ms")


# ---------------------------------------------------------------- backup folder (mirror)

def check_backup_folder(t: Ctx):
    target = t.scratch / "backup-folder"
    root = target / "NoirWrite Backup"
    status, s = t.req("GET", "/api/settings")
    t.ok(status == 200 and "suggestions" in s, "settings can't be read")
    status, j = t.req("PUT", "/api/settings", {"mirror": str(t.scratch / "missing")})
    t.ok(status == 400 and "doesn't exist" in j["error"], "a missing folder wasn't refused clearly")
    t.ok(t.req("PUT", "/api/settings", {"mirror": "relative\\path"})[0] == 400, "a relative path was accepted")
    t.req("PUT", "/api/projects/mirrored?force=1", project("mirrored", text="First words."))
    t.req("PUT", "/api/assets/mirrored/pic.png", raw=b"\x89PNG not really an image", ctype="image/png")
    target.mkdir()
    status, j = t.req("PUT", "/api/settings", {"mirror": str(target)})
    t.ok(status == 200 and j["ok"], f"choosing the folder failed: {j}")
    t.ok((root / "mirrored.json").exists(), "projects weren't copied when the folder was chosen")
    t.ok(any((root / "daily").glob("mirrored--*.json")), "no daily copy")
    t.ok((root / "assets" / "mirrored" / "pic.png").exists(), "images weren't copied")

    def save(text):
        _, cur = t.req("GET", "/api/projects/mirrored")
        cur["chapters"][0]["scenes"][0]["content"] = f"<p>{text}</p>"
        t.ok(t.req("PUT", "/api/projects/mirrored", cur)[0] == 200, "save failed")

    def copied():
        return json.loads((root / "mirrored.json").read_text("utf-8"))["chapters"][0]["scenes"][0]["content"]

    save("Second words.")
    time.sleep(1)
    t.ok("Second words" in copied(), "a save didn't reach the backup folder")
    save("Third words.")
    save("Fourth words.")
    time.sleep(0.5)
    t.ok("Second words" in copied(), "quick saves weren't grouped")
    deadline = time.time() + 15
    while "Fourth words" not in copied() and time.time() < deadline:
        time.sleep(0.5)
    t.ok("Fourth words" in copied(), "the newest save never reached the backup folder")
    t.ok(not list(root.glob("*.tmp")), "temporary files left in the backup folder")

    # an unplugged drive: saving still works, and the problem is reported
    (t.data / "settings.conf").write_text(json.dumps({"mirror": "Q:/Unplugged Drive"}), "utf-8")
    start = time.time()
    save("Written while unplugged.")
    t.ok((time.time() - start) < 2, "saving was slowed down by the missing backup folder")
    deadline = time.time() + 15
    while not t.req("GET", "/api/settings")[1]["status"]["error"] and time.time() < deadline:
        time.sleep(0.5)
    t.ok(t.req("GET", "/api/settings")[1]["status"]["error"], "the unreachable folder wasn't reported")
    t.ok(t.req("PUT", "/api/settings", {"mirror": ""})[0] == 200, "turning the backup folder off failed")


CHECKS = [v for k, v in list(globals().items()) if k.startswith("check_")]
