#!/usr/bin/env python3
"""Usage ledger 2.0.0: allowlisted input hooks, bounded private queue, no transcripts.
Invoked asynchronously by Claude Code. It never prints hook content or adds model context.
"""
import contextlib
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit
import uuid

VERSION = "2.0.0"
MAX_EVENTS = 5000
MAX_BYTES = 100 * 1024 * 1024
MAX_AGE = 7 * 86400
ID = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


def write_private(path, value):
    fd, name = tempfile.mkstemp(prefix=".ledger-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            os.chmod(name, stat.S_IRUSR | stat.S_IWUSR)
            json.dump(value, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def read_private(path, fallback=None):
    if path.is_symlink():
        raise ValueError("symlink")
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


@contextlib.contextmanager
def lock(path):
    try:
        fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        # Every operation has a short bounded lifetime; recover a crashed worker.
        if path.is_symlink() or time.time() - path.stat().st_mtime < 60:
            yield False
            return
        path.unlink()
        try:
            fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            yield False
            return
    try:
        os.close(fd)
        yield True
    finally:
        path.unlink(missing_ok=True)


def issue(root, code, dropped=0):
    with lock(root / "diagnostics.lock") as owned:
        if not owned:
            return
        old = read_private(root / "diagnostics.json", {})
        write_private(root / "diagnostics.json", {"lastIssue": code, "at": time.time(),
            "droppedCount": min(9007199254740991, old.get("droppedCount", 0) + dropped)})


def queue_files(root):
    return sorted(p for p in (root / "queue").glob("*.json") if p.is_file() and not p.is_symlink())


def capture(root, mode, data, now=None):
    now = time.time() if now is None else now
    config = read_private(root / "config.json")
    if not config or (root / "paused.json").exists():
        return False
    event_name = "UserPromptSubmit" if mode == "submit" else "Stop"
    if data.get("hook_event_name") != event_name:
        return False
    session, prompt = data.get("session_id"), data.get("prompt_id")
    if not isinstance(session, str) or not ID.fullmatch(session) or not isinstance(prompt, str) or not ID.fullmatch(prompt):
        issue(root, "missing-correlation-id", 1)
        return False
    # Build fresh data: never forward assistant text, cwd, transcript paths or raw hook input.
    event = {"type": mode, "sessionId": session, "promptId": prompt,
        "observedAt": datetime.datetime.fromtimestamp(now, datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")}
    if mode == "submit":
        text = data.get("prompt")
        if not isinstance(text, str):
            issue(root, "missing-prompt", 1)
            return False
        event.update(prompt=text[:16000], promptLength=min(len(text), 10000000))
    for name in ["queue", "seen"]:
        folder = root / name
        if folder.is_symlink():
            return False
        folder.mkdir(mode=0o700, exist_ok=True)
    identity = hashlib.sha256(json.dumps([mode, session, prompt]).encode()).hexdigest()
    with lock(root / "capture.lock") as owned:
        if not owned:
            issue(root, "capture-busy", 1)
            return False
        if mode == "submit" and ((root / "seen" / (identity + ".json")).exists() or (root / "queue" / (identity + ".json")).exists()):
            return False
        files = queue_files(root)
        sizes = []
        for path in files:
            try:
                sizes.append(path.stat().st_size)
            except FileNotFoundError:
                pass  # A concurrent successful flush already removed this record.
        if len(files) >= MAX_EVENTS or sum(sizes) + len(json.dumps(event, ensure_ascii=False).encode("utf-8")) > MAX_BYTES:
            issue(root, "queue-full", 1)
            return False
        filename = identity if mode == "submit" else uuid.uuid4().hex
        write_private(root / "queue" / (filename + ".json"), event)
        return True


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward an ingestion key to a redirected destination.


def post(origin, key, payload):
    request = urllib.request.Request(origin + "/v1/history", data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Tracker-Key": key}, method="POST")
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=4) as response:
            body = json.loads(response.read(16000))
            return response.status, body
    except urllib.error.HTTPError as error:
        return error.code, None
    except (OSError, ValueError, urllib.error.URLError):
        return 503, None


def flush(root, sender=post, now=None, budget=8):
    now = time.time() if now is None else now
    config = read_private(root / "config.json")
    if not config or (root / "paused.json").exists():
        return
    origin = config["backendUrl"]
    url = urlsplit(origin)
    if url.scheme != "https" and not (url.scheme == "http" and url.hostname in ["localhost", "127.0.0.1", "::1"]):
        return
    with lock(root / "flush.lock") as owned:
        if not owned:
            return
        deadline = time.monotonic() + budget
        single = False
        while time.monotonic() < deadline:
            selected = []
            for path in queue_files(root):
                try:
                    event = read_private(path)
                    age = now - datetime.datetime.fromisoformat(event["observedAt"].replace("Z", "+00:00")).timestamp()
                    if age > MAX_AGE:
                        path.unlink()
                        issue(root, "queue-expired", 1)
                        continue
                    selected.append((path, event))
                    if len(selected) >= (1 if single else 20):
                        break
                except (ValueError, KeyError, TypeError):
                    path.unlink(missing_ok=True)
                    issue(root, "invalid-local-record", 1)
            if not selected:
                break
            state = read_private(root / "diagnostics.json", {})
            payload = {"version": 2, "deviceId": config["deviceId"], "diagnostics": {"setupVersion": VERSION,
                "platform": "windows" if os.name == "nt" else "macos" if sys.platform == "darwin" else "linux",
                "pendingCount": min(MAX_EVENTS, max(0, len(queue_files(root)) - len(selected))), "droppedCount": state.get("droppedCount", 0)},
                "events": [event for _, event in selected]}
            code, body = sender(origin, config["key"], payload)
            if code == 200 and isinstance(body, dict) and type(body.get("accepted")) is int and 0 <= body["accepted"] <= len(selected):
                for path, event in selected:
                    if event["type"] == "submit":
                        write_private(root / "seen" / path.name, {"at": now})
                    path.unlink(missing_ok=True)
                write_private(root / "last-success.json", {"at": now, "setupVersion": VERSION})
                single = False
            elif code in (401, 403):
                write_private(root / "paused.json", {"at": now, "reason": "authorization"})
                issue(root, "authorization-paused")
                break
            elif code in (400, 409, 413):
                if len(selected) > 1:
                    single = True  # Isolate bad records rather than dropping a valid batch.
                    continue
                selected[0][0].unlink(missing_ok=True)
                issue(root, "report-rejected", 1)
                single = False
            else:
                issue(root, "receiver-unavailable")
                break
        # Local dedup receipts retain no prompt text and are bounded to the retry window.
        for path in (root / "seen").glob("*.json"):
            if not path.is_symlink() and now - path.stat().st_mtime > MAX_AGE:
                path.unlink()


def main():
    root = Path(__file__).resolve().parent
    if root.is_symlink():
        return
    mode = sys.argv[1] if len(sys.argv) > 1 else "status"
    if mode == "status":
        print(json.dumps({"setupVersion": VERSION, "configured": (root / "config.json").is_file(),
            "paused": (root / "paused.json").exists(), "pending": len(queue_files(root)),
            "diagnostics": read_private(root / "diagnostics.json", {})}))
        return
    if mode in ["submit", "stop"]:
        raw = sys.stdin.buffer.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            issue(root, "oversized-hook-input", 1)
            return
        capture(root, mode, json.loads(raw))
    if mode in ["submit", "stop", "flush"]:
        flush(root)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # A diagnostic hook must never block normal Claude work or expose a prompt/key.
        sys.exit(0)
