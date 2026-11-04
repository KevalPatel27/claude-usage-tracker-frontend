#!/usr/bin/env python3
"""Opt-in user prompt history setup. Python 3.8+, no package installs or account access.
Run as the ordinary Claude user. Existing metrics, hooks and status lines are preserved.
"""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
from urllib.parse import urlsplit
import uuid
import warnings

# __HISTORY_CLIENT_SOURCE__


class SetupError(Exception):
    pass


def read_map(path):
    if path.is_symlink():
        raise SetupError("Refusing a symlink configuration file.")
    if not path.exists():
        return {}
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise SetupError("Duplicate JSON keys. Repair settings before setup.")
            result[key] = value
        return result
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=unique,
            parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except (ValueError, UnicodeError):
        raise SetupError("Malformed JSON. No configuration changed.") from None
    if not isinstance(value, dict):
        raise SetupError("Settings must be a JSON object.")
    return value


def write_private(path, value):
    fd, temp = tempfile.mkstemp(prefix=".ledger-setup-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as stream:
            os.chmod(temp, stat.S_IRUSR | stat.S_IWUSR)
            stream.write(value if isinstance(value, bytes) else (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def validate_origin(value):
    try:
        u = urlsplit(value)
        if (u.scheme != "https" and not (u.scheme == "http" and u.hostname in ["localhost", "127.0.0.1", "::1"])) or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ["", "/"] or any(c.isspace() or ord(c) < 32 for c in value):
            raise ValueError()
        if u.port is not None and not 1 <= u.port <= 65535:
            raise ValueError()
        return value.rstrip("/")
    except (ValueError, TypeError, AttributeError):
        raise SetupError("Use a plain HTTPS backend origin without paths, credentials or Markdown. Loopback HTTP is allowed for local tests.") from None


def merge_hooks(settings, state, installed):
    # Work on copies so validation failures cannot partly mutate the caller's settings.
    result = json.loads(json.dumps(settings))
    if "hooks" in result and not isinstance(result["hooks"], dict):
        raise SetupError("Existing hooks must be an object.")
    hooks = result.setdefault("hooks", {})
    previous = state.get("installed", {})
    if not isinstance(previous, dict) or not set(previous).issubset({"UserPromptSubmit", "Stop"}):
        raise SetupError("Invalid history ownership record.")
    for event in ["UserPromptSubmit", "Stop"]:
        entries = hooks.get(event, [])
        if not isinstance(entries, list) or any(not isinstance(e, dict) or not isinstance(e.get("hooks"), list) for e in entries):
            raise SetupError("Existing hook entries are malformed. No changes made.")
        old = previous.get(event)
        if old is not None and (not isinstance(old, dict) or old.get("type") != "command" or not ("history-client.py" in old.get("command", "") or (isinstance(old.get("args"), list) and old["args"] and isinstance(old["args"][0], str) and old["args"][0].endswith("/history-client.py")))):
            raise SetupError("Invalid owned hook record.")
        kept = []
        for entry in entries:
            handlers = []
            for handler in entry["hooks"]:
                if not isinstance(handler, dict):
                    raise SetupError("Existing hook handlers are malformed.")
                if old and handler.get("command") == old.get("command") and ("args" not in old or (isinstance(handler.get("args"), list) and handler["args"][:1] == old["args"][:1])) and handler != old:
                    raise SetupError("A tracker hook was edited later. Review it before updating/removing; no settings changed.")
                if not old or handler != old:
                    handlers.append(handler)
            if handlers:
                kept.append({**entry, "hooks": handlers})
        if event in installed:
            kept.append({"hooks": [installed[event]]})
        if kept:
            hooks[event] = kept
        else:
            hooks.pop(event, None)
    if not hooks and not state.get("hadHooks", "hooks" in settings):
        result.pop("hooks", None)
    return result


def configure(settings_path, backend=None, device_id=None, key=None, remove=False, dry_run=False):
    settings_path = Path(os.path.abspath(os.path.expanduser(str(settings_path))))
    state_path = Path(str(settings_path) + ".usage-ledger-history-state.json")
    root = settings_path.parent / "usage-ledger-history"
    if root.is_symlink():
        raise SetupError("Refusing a symlink history directory.")
    settings, state = read_map(settings_path), read_map(state_path)
    for name in ["queue", "seen"]:
        if (root / name).is_symlink():
            raise SetupError("Refusing a symlink history directory.")
    installed = {}
    if remove and not state:
        print("No prompt-history ownership record. Nothing changed.")
        return
    if not remove:
        backend = validate_origin(backend)
        if not isinstance(device_id, str) or not re.fullmatch(r"[a-f0-9]{24}", device_id):
            raise SetupError("Use the existing device ID copied by the dashboard. Do not register a duplicate PC.")
        config = read_map(root / "config.json")
        if config and config.get("deviceId") != device_id:
            raise SetupError("This profile is configured for another device. Remove the old history setup first; queued prompts cannot be reassigned.")
        if config and config.get("backendUrl") != backend:
            raise SetupError("Backend address changed. Remove old history setup first so its queued prompts cannot be sent elsewhere.")
        python = Path(sys.executable).as_posix()
        script = (root / "history-client.py").as_posix()
        for event, mode in [("UserPromptSubmit", "submit"), ("Stop", "stop")]:
            installed[event] = {"type": "command", "command": python, "args": [script, mode], "async": True}
    merged = merge_hooks(settings, state, installed)
    if dry_run:
        print("Dry run: would " + ("remove owned prompt hooks and erase the local queue" if remove else "back up settings and append two async prompt-history hooks") + ". No key requested or files changed.")
        return
    if not remove:
        if not key:
            env = settings.get("env", {})
            header = env.get("OTEL_EXPORTER_OTLP_METRICS_HEADERS", "") if isinstance(env, dict) else ""
            match = re.fullmatch(r"X-Tracker-Key=(dkey_[a-f0-9]{64})", header) if isinstance(header, str) else None
            endpoint = env.get("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", "") if isinstance(env, dict) else ""
            if match and endpoint == backend + "/v1/metrics":
                key = match.group(1)
            else:
                if not sys.stdin.isatty():
                    raise SetupError("Run in an interactive terminal, or use --key-stdin for managed installation.")
                try:
                    with warnings.catch_warnings():
                        warnings.simplefilter("error", getpass.GetPassWarning)
                        key = getpass.getpass("Existing device key (hidden): ")
                except getpass.GetPassWarning:
                    raise SetupError("This terminal cannot hide key input. Use a normal interactive terminal.") from None
        if not isinstance(key, str) or not re.fullmatch(r"dkey_[a-f0-9]{64}", key):
            raise SetupError("Invalid device key. No changes made.")
    settings_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock_path = Path(str(settings_path) + ".usage-tracker.lock")
    try:
        fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        raise SetupError("Another setup may be running. Review its lock before retrying.") from None
    try:
        os.close(fd)
        if read_map(settings_path) != settings or read_map(state_path) != state:
            raise SetupError("Settings changed concurrently; retry setup.")
        if settings_path.exists():
            write_private(Path(str(settings_path) + ".backup." + uuid.uuid4().hex + ".json"), settings_path.read_bytes())
        if remove:
            # Erase only known owned queue/config files; never recursively remove a computed directory.
            for folder in [root / "queue", root / "seen"]:
                if folder.exists():
                    for file in folder.glob("*.json"):
                        if file.is_file() and not file.is_symlink():
                            file.unlink()
            for name in ["config.json", "paused.json"]:
                file = root / name
                if file.is_symlink():
                    raise SetupError("Refusing a symlink config file.")
                file.unlink(missing_ok=True)
            if settings_path.exists():
                write_private(settings_path, merged)
            state_path.unlink()
        else:
            root.mkdir(mode=0o700, exist_ok=True)
            for name in ["queue", "seen"]:
                (root / name).mkdir(mode=0o700, exist_ok=True)
            write_private(root / "history-client.py", CLIENT_SOURCE.encode("utf-8"))
            write_private(root / "config.json", {"version": "2.0.0", "deviceId": device_id, "backendUrl": backend, "key": key})
            write_private(state_path, {"version": 2, "hadHooks": state.get("hadHooks", "hooks" in settings), "installed": installed})
            write_private(settings_path, merged)
            (root / "paused.json").unlink(missing_ok=True)
    finally:
        lock_path.unlink(missing_ok=True)
    print("Prompt history removed; pending local prompts erased. Revoke/disable reporting in the dashboard separately." if remove else "Prompt-history hooks saved. Only submitted input and correlation/completion metadata are collected. Automated notifications may also appear; author identity is not guaranteed. Transcript files, assistant-response fields and tool-output fields are not read.")
    print("Existing metrics, other hooks and your status line were preserved. Backups may contain keys: keep them private.")
    print("Exit existing Code sessions and completely quit/reopen Desktop. Start a NEW local session and check Sessions > Collection diagnostics.")
    if not remove:
        print("The private queue is bounded to 5,000 events / 100 MiB and seven days. Retries run on later hooks or manual --flush; no always-running service is installed. Delivery is not guaranteed.")
        print("Local diagnostics: run this setup file with --status. Flush pending events with --flush. Authorization failures pause capture until setup is rerun.")


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        raise SetupError("Invalid options. Use --help; never put device keys in command arguments.")


def main():
    parser = SafeParser(description="Opt-in captured-input history for existing Claude Code devices. Python 3.8+, no sudo.")
    parser.add_argument("--backend-url")
    parser.add_argument("--device-id")
    parser.add_argument("--settings-path", default=str(Path(os.environ.get("CLAUDE_CONFIG_DIR") or str(Path.home() / ".claude")) / "settings.json"))
    parser.add_argument("--remove", action="store_true", help="Remove owned hooks and erase this helper's private pending prompt queue")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--key-stdin", action="store_true")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--flush", action="store_true")
    args = parser.parse_args()
    if os.name == "posix" and os.geteuid() == 0:
        raise SetupError("Run as the ordinary Claude user, without sudo.")
    if args.status or args.flush:
        import subprocess
        script = Path(args.settings_path).expanduser().resolve().parent / "usage-ledger-history" / "history-client.py"
        if not script.is_file() or script.is_symlink():
            raise SetupError("History helper is not installed for this settings file.")
        subprocess.run([sys.executable, str(script), "flush" if args.flush else "status"], check=True)
        return
    key = sys.stdin.readline().rstrip("\r\n") if args.key_stdin and not args.remove and not args.dry_run else None
    configure(args.settings_path, args.backend_url, args.device_id, key, args.remove, args.dry_run)


if __name__ == "__main__":
    try:
        main()
    except SetupError as error:
        print("Setup failed: " + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, EOFError, KeyboardInterrupt):
        print("Setup could not complete. Check permissions and private backups before retrying; no credentials were printed.", file=sys.stderr)
        sys.exit(1)
