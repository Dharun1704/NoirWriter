"""NoirWrite local server.

Serves the web app from ./static and stores projects as JSON files in ./data.
Run:  python server.py   (then open http://127.0.0.1:8765)
"""

import json
import os
import re
import shutil
import sys
import threading
import time
import webbrowser
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
PORT = int(os.environ.get("NOIRWRITER_PORT", "8765"))
ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
DATA_DIR = Path(os.environ.get("NOIRWRITER_DATA") or ROOT / "data")
BACKUP_DIR = DATA_DIR / "backups"
TRASH_DIR = DATA_DIR / "trash"
ASSET_DIR = DATA_DIR / "assets"
ASSET_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif"}
MAX_ASSET_BYTES = 40 * 1024 * 1024
BACKUPS_RECENT = 30            # always keep the newest 30 backups...
BACKUP_DAYS = 60               # ...plus the last backup of each of the last 60 days
BACKUP_INTERVAL_SECONDS = 300  # at most one routine backup per project every 5 minutes
SETTINGS_PATH = DATA_DIR / "settings.conf"   # JSON; not *.json, so it never shows up as a project
MIRROR_FOLDER_NAME = "NoirWrite Backup"
MIRROR_INTERVAL_SECONDS = int(os.environ.get("NOIRWRITER_MIRROR_INTERVAL", "120"))  # copy a project to the backup folder at most every 2 minutes (tests use less)
MIRROR_DAYS = 30               # dated daily copies kept in the backup folder

# Test mode is switched on only by tests/run_tests.py (never in normal use). It serves the browser
# test page from tests/browser, prepares the app for testing (fixed clock, no animations), and
# accepts the test results.
TEST_MODE = os.environ.get("NOIRWRITER_TEST") == "1"
TESTS_DIR = ROOT / "tests" / "browser"
RESULTS_DIR = DATA_DIR / "test-results"
TEST_FILE_RE = re.compile(r"^[A-Za-z0-9_.-]{1,80}$")
TEST_TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}

ID_RE = re.compile(r"^[a-z0-9-]{1,64}$")
ASSET_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}\.(png|jpe?g|webp|gif)$")
BACKUP_RE = re.compile(r"^([a-z0-9-]{1,64})--(\d{8}-\d{6})\.json$")

# one lock for every read-check-write of a project file (the server is multi-threaded)
WRITE_LOCK = threading.Lock()


def project_path(project_id: str) -> Path | None:
    if not ID_RE.match(project_id):
        return None
    return DATA_DIR / f"{project_id}.json"


def read_project(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text("utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def write_project(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), "utf-8")
    tmp.replace(path)  # atomic swap so a crash never leaves a half-written file


def stamp_of(name: str) -> str | None:
    m = BACKUP_RE.match(name)
    return m.group(2) if m else None


def prune_backups(project_id: str) -> None:
    """Keep the newest BACKUPS_RECENT, plus the newest backup of each of the last BACKUP_DAYS days."""
    files = sorted(BACKUP_DIR.glob(f"{project_id}--*.json"))
    keep = set(files[-BACKUPS_RECENT:])
    newest_per_day = {}
    for f in files:
        s = stamp_of(f.name)
        if s:
            newest_per_day[s[:8]] = f       # files are sorted, so the last one wins
    for day in sorted(newest_per_day)[-BACKUP_DAYS:]:
        keep.add(newest_per_day[day])
    for f in files:
        if f not in keep:
            f.unlink(missing_ok=True)


def make_backup(project_id: str, path: Path, force: bool = False) -> None:
    if not path.exists():
        return
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    existing = sorted(BACKUP_DIR.glob(f"{project_id}--*.json"))
    if not force and existing and time.time() - existing[-1].stat().st_mtime < BACKUP_INTERVAL_SECONDS:
        return
    stamp = time.strftime("%Y%m%d-%H%M%S")
    shutil.copy2(path, BACKUP_DIR / f"{project_id}--{stamp}.json")
    prune_backups(project_id)


def summary(data: dict) -> dict:
    """Small description of a saved project for backup / trash lists."""
    chapters = data.get("chapters") or []
    return {
        "title": data.get("title", ""),
        "wordCount": data.get("wordCount", 0),
        "chapters": len(chapters),
        "scenes": sum(len(c.get("scenes") or []) for c in chapters),
        "rev": data.get("rev", 0),
    }


def stamp_to_ms(stamp: str) -> int:
    return int(datetime.strptime(stamp, "%Y%m%d-%H%M%S").timestamp() * 1000)


# ---------------------------------------------------------------- settings

def load_settings() -> dict:
    try:
        return json.loads(SETTINGS_PATH.read_text("utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_settings(settings: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = SETTINGS_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(settings, indent=1), "utf-8")
    tmp.replace(SETTINGS_PATH)


def cloud_folder_suggestions() -> list[str]:
    """Folders on this computer that sync to the cloud (OneDrive, Dropbox, Google Drive, iCloud)."""
    home = Path.home()
    found = []
    candidates = [os.environ.get(k) for k in ("OneDrive", "OneDriveConsumer", "OneDriveCommercial")]
    candidates += [str(p) for p in home.glob("OneDrive*")]
    candidates += [str(home / n) for n in ("Dropbox", "Google Drive", "My Drive", "iCloudDrive")]
    candidates += [f"{d}:\\My Drive" for d in "DEFGHIJKLMNOPQRSTUVWXYZ"]       # Google Drive for desktop
    for c in candidates:
        try:
            if c and Path(c).is_dir() and str(Path(c)) not in found:
                found.append(str(Path(c)))
        except OSError:
            pass
    return found


# ---------------------------------------------------------------- backup folder (mirror)
# Besides the backups inside ./data, each project can be copied to a folder the writer chooses,
# ideally one that syncs to the cloud, so the book survives a broken drive. The copy is written
# from the data just saved (the project file itself is never opened while it may be replaced),
# in the background, at most every MIRROR_INTERVAL_SECONDS per project; a newer save waiting for
# its turn simply replaces the older one. Each day's last copy is also kept for MIRROR_DAYS days.

class Mirror:
    def __init__(self):
        self.lock = threading.Lock()
        self.pending: dict[str, bytes] = {}
        self.timers: dict[str, threading.Timer] = {}
        self.last: dict[str, float] = {}
        self.status = {"lastAt": 0, "error": ""}

    def folder(self) -> Path | None:
        base = load_settings().get("mirror")
        return Path(base) / MIRROR_FOLDER_NAME if base else None

    def schedule(self, project_id: str, data: bytes) -> None:
        if not self.folder():
            return
        with self.lock:
            self.pending[project_id] = data
            if project_id in self.timers:          # a copy is already waiting: it will take this newer data
                return
            wait = max(0.0, self.last.get(project_id, 0) + MIRROR_INTERVAL_SECONDS - time.time())
            timer = threading.Timer(wait, self._flush, args=(project_id,))
            timer.daemon = True
            self.timers[project_id] = timer
            timer.start()

    def _flush(self, project_id: str) -> None:
        with self.lock:
            data = self.pending.pop(project_id, None)
            self.timers.pop(project_id, None)
            self.last[project_id] = time.time()
        if data is not None:
            self.write(project_id, data)

    def write(self, project_id: str, data: bytes) -> bool:
        root = self.folder()
        if not root:
            return False
        try:
            daily = root / "daily"
            daily.mkdir(parents=True, exist_ok=True)
            tmp = root / f"{project_id}.json.tmp"
            tmp.write_bytes(data)
            tmp.replace(root / f"{project_id}.json")
            (daily / f"{project_id}--{time.strftime('%Y-%m-%d')}.json").write_bytes(data)
            cutoff = time.strftime("%Y-%m-%d", time.localtime(time.time() - MIRROR_DAYS * 86400))
            for f in daily.glob(f"{project_id}--*.json"):
                if f.stem.rsplit("--", 1)[-1] < cutoff:
                    f.unlink(missing_ok=True)
            self.copy_assets(project_id, root)
            self.status = {"lastAt": int(time.time() * 1000), "error": ""}
            return True
        except OSError as e:
            self.status = {"lastAt": self.status["lastAt"], "error": f"{type(e).__name__}: {e}"}
            print(f"Backup folder: could not copy {project_id}: {e}")
            return False

    @staticmethod
    def copy_assets(project_id: str, root: Path) -> None:
        src = ASSET_DIR / project_id
        if not src.is_dir():
            return
        dst = root / "assets" / project_id
        dst.mkdir(parents=True, exist_ok=True)
        for f in src.iterdir():
            target = dst / f.name
            if f.is_file() and (not target.exists() or target.stat().st_size != f.stat().st_size):
                shutil.copy2(f, target)

    def mirror_all(self) -> bool:
        """Copy every project now (on start-up and when the folder is chosen)."""
        if not self.folder():
            return False
        ok = True
        for path in DATA_DIR.glob("*.json"):
            with WRITE_LOCK:
                try:
                    data = path.read_bytes()
                except OSError:
                    continue
            ok = self.write(path.stem, data) and ok
        return ok


MIRROR = Mirror()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, fmt, *args):  # keep the console quiet except for errors
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # ---- helpers -------------------------------------------------------
    def send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def route(self):
        """Split the URL into (path parts after /api/, query string)."""
        path, _, query = self.path.partition("?")
        if not path.startswith("/api/"):
            return None, query
        return [p for p in path[len("/api/"):].split("/") if p], query

    # ---- GET -----------------------------------------------------------
    def send_bytes(self, body: bytes, content_type: str, status=HTTPStatus.OK):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path_only, _, query = self.path.partition("?")
        if path_only == "/favicon.ico":          # the page has its own icon; browsers ask anyway
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
            return
        if TEST_MODE and self.send_test_file(path_only, query):
            return
        if path_only.startswith("/assets/"):
            return self.send_asset(path_only[len("/assets/"):])
        parts, _ = self.route()
        if parts is None:
            return super().do_GET()

        if parts == ["projects"]:
            projects = []
            for f in DATA_DIR.glob("*.json"):
                data = read_project(f)
                if data is None:
                    continue
                projects.append({
                    "id": data.get("id", f.stem),
                    "title": data.get("title", f.stem),
                    "logline": data.get("logline", ""),
                    "genre": data.get("genre", "thriller"),
                    "updatedAt": data.get("updatedAt", 0),
                    "wordCount": data.get("wordCount", 0),
                })
            projects.sort(key=lambda p: p["updatedAt"], reverse=True)
            return self.send_json(projects)

        if parts == ["settings"]:
            settings = load_settings()
            folder = MIRROR.folder()
            return self.send_json({
                "mirror": settings.get("mirror", ""),
                "folder": str(folder) if folder else "",
                "status": MIRROR.status,
                "suggestions": cloud_folder_suggestions(),
            })

        if parts == ["trash"]:
            items = []
            for f in sorted(TRASH_DIR.glob("*.json"), reverse=True) if TRASH_DIR.exists() else []:
                m = BACKUP_RE.match(f.name)
                data = read_project(f)
                if not m or data is None:
                    continue
                items.append({"file": f.name, "id": m.group(1), "deletedAt": stamp_to_ms(m.group(2)), **summary(data)})
            return self.send_json(items)

        if len(parts) >= 2 and parts[0] == "projects":
            path = project_path(parts[1])
            if not path or not path.exists():
                return self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            if len(parts) == 2:
                return self.send_json(read_project(path))
            if parts[2:] == ["meta"]:
                data = read_project(path) or {}
                return self.send_json({"rev": data.get("rev", 0), "updatedAt": data.get("updatedAt", 0)})
            if parts[2:] == ["backups"]:
                items = []
                for f in sorted(BACKUP_DIR.glob(f"{parts[1]}--*.json"), reverse=True) if BACKUP_DIR.exists() else []:
                    s, data = stamp_of(f.name), read_project(f)
                    if s and data is not None:
                        items.append({"file": f.name, "savedAt": stamp_to_ms(s), "bytes": f.stat().st_size, **summary(data)})
                return self.send_json(items)
        return self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def send_test_file(self, path_only: str, query: str) -> bool:
        """Test mode: the test page and its scripts, and the app with test-mode.js loaded first."""
        if path_only == "/" and "test=1" in query.split("&"):
            html = (STATIC_DIR / "index.html").read_text("utf-8")
            html = html.replace("<head>", '<head>\n  <script src="/tests/test-mode.js"></script>', 1)
            self.send_bytes(html.encode("utf-8"), "text/html; charset=utf-8")
            return True
        if path_only in ("/tests", "/tests/"):
            path_only = "/tests/index.html"
        if path_only.startswith("/tests/"):
            name = path_only[len("/tests/"):]
            f = TESTS_DIR / name
            if not TEST_FILE_RE.match(name) or f.suffix not in TEST_TYPES or not f.is_file():
                self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            else:
                self.send_bytes(f.read_bytes(), TEST_TYPES[f.suffix])
            return True
        return False

    def send_asset(self, rest):
        parts = rest.split("/")
        if len(parts) != 2 or not ID_RE.match(parts[0]) or not ASSET_RE.match(parts[1]):
            return self.send_json({"error": "bad asset"}, HTTPStatus.BAD_REQUEST)
        f = ASSET_DIR / parts[0] / parts[1]
        if not f.exists():
            return self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        body = f.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ASSET_TYPES[f.suffix.lower()])
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---- PUT -----------------------------------------------------------
    def put_asset(self, rest):
        parts = rest.split("/")
        if len(parts) != 2 or not ID_RE.match(parts[0]) or not ASSET_RE.match(parts[1]):
            return self.send_json({"error": "bad asset name"}, HTTPStatus.BAD_REQUEST)
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_ASSET_BYTES:
            return self.send_json({"error": "file too large (max 40 MB)"}, HTTPStatus.BAD_REQUEST)
        folder = ASSET_DIR / parts[0]
        folder.mkdir(parents=True, exist_ok=True)
        (folder / parts[1]).write_bytes(self.rfile.read(length))
        return self.send_json({"ok": True, "url": f"/assets/{parts[0]}/{parts[1]}"})

    def do_PUT(self):
        path_only = self.path.split("?", 1)[0]
        if TEST_MODE and path_only.startswith("/api/test-results/"):
            # the browser test page reports its results (and style snapshots) here
            name = path_only[len("/api/test-results/"):]
            if not TEST_FILE_RE.match(name):
                return self.send_json({"error": "bad name"}, HTTPStatus.BAD_REQUEST)
            RESULTS_DIR.mkdir(parents=True, exist_ok=True)
            length = int(self.headers.get("Content-Length") or 0)
            (RESULTS_DIR / f"{name}.json").write_bytes(self.rfile.read(length))
            return self.send_json({"ok": True})
        if path_only.startswith("/api/assets/"):
            return self.put_asset(path_only[len("/api/assets/"):])
        parts, query = self.route()
        if parts == ["settings"]:
            return self.put_settings()
        if not parts or parts[0] != "projects" or len(parts) != 2:
            return self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        project_id = parts[1]
        path = project_path(project_id)
        if not path:
            return self.send_json({"error": "bad id"}, HTTPStatus.BAD_REQUEST)
        try:
            data = self.read_json()
        except json.JSONDecodeError:
            return self.send_json({"error": "bad json"}, HTTPStatus.BAD_REQUEST)
        if data.get("id") != project_id:
            return self.send_json({"error": "id mismatch"}, HTTPStatus.BAD_REQUEST)
        force = "force=1" in query.split("&")
        with WRITE_LOCK:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            current = read_project(path) if path.exists() else None
            current_rev = (current or {}).get("rev", 0)
            # Version check: the client sends the rev it last loaded or saved. If the file has moved
            # on since (another tab or window saved), refuse instead of silently overwriting.
            if current is not None and not force and data.get("rev", 0) != current_rev:
                return self.send_json({
                    "error": "conflict", "rev": current_rev, "updatedAt": current.get("updatedAt", 0),
                }, HTTPStatus.CONFLICT)
            make_backup(project_id, path, force=force)   # always keep what is about to be overwritten on a forced save
            data["rev"] = current_rev + 1
            write_project(path, data)
        MIRROR.schedule(project_id, json.dumps(data, ensure_ascii=False, indent=1).encode("utf-8"))
        return self.send_json({"ok": True, "rev": data["rev"], "savedAt": int(time.time() * 1000)})

    def put_settings(self):
        """Choose (or turn off) the backup folder. The folder must exist; a test copy is made at once."""
        try:
            body = self.read_json()
        except json.JSONDecodeError:
            return self.send_json({"error": "bad json"}, HTTPStatus.BAD_REQUEST)
        raw = str(body.get("mirror", "")).strip().strip('"')
        settings = load_settings()
        if not raw:
            settings.pop("mirror", None)
            save_settings(settings)
            MIRROR.status = {"lastAt": 0, "error": ""}
            return self.send_json({"ok": True, "mirror": "", "folder": "", "status": MIRROR.status})
        base = Path(os.path.expandvars(raw)).expanduser()
        if not base.is_absolute() or not base.is_dir():
            return self.send_json({"error": "That folder doesn't exist. Check the path, or create the folder first."}, HTTPStatus.BAD_REQUEST)
        try:
            (base / MIRROR_FOLDER_NAME).mkdir(exist_ok=True)
            probe = base / MIRROR_FOLDER_NAME / ".write-test"
            probe.write_text("ok", "utf-8")
            probe.unlink()
        except OSError as e:
            return self.send_json({"error": f"NoirWrite can't write to that folder ({e.strerror or e})."}, HTTPStatus.BAD_REQUEST)
        settings["mirror"] = str(base)
        save_settings(settings)
        ok = MIRROR.mirror_all()
        return self.send_json({"ok": ok, "mirror": str(base), "folder": str(MIRROR.folder()), "status": MIRROR.status})

    # ---- POST ----------------------------------------------------------
    def do_POST(self):
        parts, _ = self.route()
        try:
            body = self.read_json()
        except json.JSONDecodeError:
            return self.send_json({"error": "bad json"}, HTTPStatus.BAD_REQUEST)
        name = str(body.get("file", ""))
        m = BACKUP_RE.match(name)

        # restore one of a project's backups over the current file
        if parts and len(parts) == 3 and parts[0] == "projects" and parts[2] == "restore":
            project_id = parts[1]
            path = project_path(project_id)
            if not path or not m or m.group(1) != project_id or not (BACKUP_DIR / name).exists():
                return self.send_json({"error": "bad backup"}, HTTPStatus.BAD_REQUEST)
            with WRITE_LOCK:
                restored = read_project(BACKUP_DIR / name)
                if restored is None:
                    return self.send_json({"error": "backup unreadable"}, HTTPStatus.BAD_REQUEST)
                current = read_project(path) if path.exists() else None
                make_backup(project_id, path, force=True)    # the version being replaced stays recoverable
                restored["id"] = project_id
                restored["rev"] = (current or {}).get("rev", 0) + 1
                restored["updatedAt"] = int(time.time() * 1000)
                write_project(path, restored)
            return self.send_json(restored)

        # bring a deleted project back from the trash
        if parts == ["trash", "restore"]:
            src = TRASH_DIR / name
            if not m or not src.exists():
                return self.send_json({"error": "bad file"}, HTTPStatus.BAD_REQUEST)
            with WRITE_LOCK:
                data = read_project(src)
                if data is None:
                    return self.send_json({"error": "file unreadable"}, HTTPStatus.BAD_REQUEST)
                project_id = m.group(1)
                if (DATA_DIR / f"{project_id}.json").exists():       # a project with that id exists again
                    project_id = f"{project_id[:52]}-restored-{int(time.time()) % 100000}"
                data["id"] = project_id
                data["rev"] = 0
                write_project(DATA_DIR / f"{project_id}.json", data)
                src.unlink()
            return self.send_json({"ok": True, "id": project_id, "title": data.get("title", "")})

        return self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    # ---- DELETE --------------------------------------------------------
    def do_DELETE(self):
        parts, _ = self.route()
        if not parts or parts[0] != "projects" or len(parts) != 2:
            return self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        project_id = parts[1]
        path = project_path(project_id)
        if not path or not path.exists():
            return self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        with WRITE_LOCK:
            make_backup(project_id, path, force=True)
            TRASH_DIR.mkdir(parents=True, exist_ok=True)
            path.replace(TRASH_DIR / f"{project_id}--{time.strftime('%Y%m%d-%H%M%S')}.json")
        return self.send_json({"ok": True})


class Server(ThreadingHTTPServer):
    # On Windows SO_REUSEADDR lets a second server silently share the port; refuse instead.
    allow_reuse_address = sys.platform != "win32"

    def server_bind(self):
        if sys.platform == "win32":
            import socket
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    url = f"http://{HOST}:{PORT}"
    try:
        server = Server((HOST, PORT), Handler)
    except OSError:
        print(f"Port {PORT} is already in use - NoirWrite is probably already running.")
        print(f"Open {url} in your browser, or close the other NoirWrite window first.")
        if "--no-browser" not in sys.argv:
            webbrowser.open(url)
        return
    print(f"NoirWrite is running at {url}  (Ctrl+C to stop)")
    if MIRROR.folder():
        print(f"Your projects are also copied to {MIRROR.folder()}")
        threading.Thread(target=MIRROR.mirror_all, daemon=True).start()
    if "--no-browser" not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
