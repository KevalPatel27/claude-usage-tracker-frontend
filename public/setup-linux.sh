#!/usr/bin/env bash
# Usage ledger Linux setup. Review before running. No sudo, shell profile edits or network calls.
set -euo pipefail
if [ "$(uname -s)" != "Linux" ]; then
  printf '%s\n' 'This download is for Linux. Choose the matching operating system in the dashboard.' >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' 'Python 3.8+ is required. Install it using your organization-approved method, then rerun. No settings changed.' >&2
  exit 1
fi
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,8) else 1)' || { printf '%s\n' 'Python 3.8+ required. No settings changed.' >&2; exit 1; }
exec python3 -c "$(cat <<'USAGE_TRACKER_PY'
#!/usr/bin/env python3
"""Usage ledger settings installer. Python 3.8+, standard library only, no network calls.
Configures existing local Claude Code; does not install Claude, agents or shell profiles.
"""
import argparse
import contextlib
import getpass
import ipaddress
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

OWNED = {
    "CLAUDE_CODE_ENABLE_TELEMETRY", "OTEL_METRICS_EXPORTER", "OTEL_LOGS_EXPORTER",
    "OTEL_TRACES_EXPORTER", "OTEL_EXPORTER_OTLP_METRICS_PROTOCOL",
    "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", "OTEL_EXPORTER_OTLP_METRICS_HEADERS",
    "OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE", "OTEL_METRIC_EXPORT_INTERVAL",
    "OTEL_METRICS_INCLUDE_SESSION_ID",
}


class SetupError(Exception):
    pass


def origin(value):
    try:
        value = value.strip()
        if value.startswith("["):
            raise ValueError()
        url = urlsplit(value)
        host = url.hostname
        loopback = host == "localhost"
        if host:
            try:
                loopback = loopback or ipaddress.ip_address(host).is_loopback
            except ValueError:
                pass
        port = url.port
        if (not host or (url.scheme != "https" and not (url.scheme == "http" and loopback))
                or url.username is not None or url.password is not None or url.query
                or url.fragment or url.path not in ("", "/") or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value)
                or (port is not None and not 1 <= port <= 65535)):
            raise ValueError()
        return value.rstrip("/")
    except (ValueError, AttributeError):
        raise SetupError("Use a plain HTTPS backend origin without path, credentials, query or Markdown. HTTP is allowed only for loopback development.") from None


def installed_settings(backend, key):
    if not isinstance(key, str) or not re.fullmatch(r"dkey_[a-f0-9]{64}", key):
        raise SetupError("Invalid device key format. No settings changed.")
    return {
        "CLAUDE_CODE_ENABLE_TELEMETRY": "1", "OTEL_METRICS_EXPORTER": "otlp",
        "OTEL_LOGS_EXPORTER": "none", "OTEL_TRACES_EXPORTER": "none",
        "OTEL_EXPORTER_OTLP_METRICS_PROTOCOL": "http/json",
        "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT": backend + "/v1/metrics",
        "OTEL_EXPORTER_OTLP_METRICS_HEADERS": "X-Tracker-Key=" + key,
        "OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE": "cumulative",
        "OTEL_METRIC_EXPORT_INTERVAL": "60000", "OTEL_METRICS_INCLUDE_SESSION_ID": "true",
    }


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise SetupError("JSON contains duplicate keys. Repair it before running setup; no settings changed.")
        result[key] = value
    return result


def read_map(path):
    if path.is_symlink():
        raise SetupError("Refusing a symlink settings/state file. Review it and pass the real file using --settings-path.")
    if not path.exists():
        return {}, None
    if not path.is_file():
        raise SetupError("Settings/state path must be a regular file. No settings changed.")
    raw = path.read_bytes()
    try:
        value = json.loads(raw.decode("utf-8-sig"), object_pairs_hook=no_duplicates,
                           parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except (ValueError, UnicodeError):
        raise SetupError("Malformed JSON settings/state file. No settings changed; repair the JSON first.") from None
    if not isinstance(value, dict):
        raise SetupError("Settings/state must contain a JSON object. No settings changed.")
    return value, raw


def validate_state(state):
    if not state:
        return
    if (not isinstance(state.get("installed"), dict) or not isinstance(state.get("previous"), dict)
            or not isinstance(state.get("hadEnv"), bool) or not set(state["installed"]).issubset(OWNED)):
        raise SetupError("Invalid tracker ownership state. No settings changed.")
    for key, value in state["installed"].items():
        previous = state["previous"].get(key)
        if (not isinstance(value, str) or not isinstance(previous, dict)
                or not isinstance(previous.get("existed"), bool) or "value" not in previous):
            raise SetupError("Invalid tracker ownership state. No settings changed.")


def private_write(path, data):
    fd, temporary = tempfile.mkstemp(prefix=".usage-tracker-", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as handle:
            os.chmod(temporary, stat.S_IRUSR | stat.S_IWUSR)
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


@contextlib.contextmanager
def setup_lock(path):
    lock = Path(str(path) + ".usage-tracker.lock")
    try:
        fd = os.open(str(lock), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise SetupError("Another setup may be running. If a prior run was interrupted, review and remove only its .usage-tracker.lock file before retrying.") from None
    try:
        os.close(fd)
        yield
    finally:
        lock.unlink()


def configure(path, backend=None, key=None, remove=False, dry_run=False):
    path = Path(os.path.abspath(os.path.expanduser(str(path))))
    state_path = Path(str(path) + ".usage-tracker-state.json")
    # Validate before any backup/mkdir/write, including in dry-run mode.
    settings, _ = read_map(path)
    state, _ = read_map(state_path)
    if "env" in settings and not isinstance(settings["env"], dict):
        raise SetupError("Existing env must be a JSON object. No settings changed.")
    validate_state(state)
    installed = None if remove else installed_settings(origin(backend), key) if not dry_run else None
    if not remove:
        origin(backend)
    if remove and not state:
        print("No tracker ownership record. Nothing changed.")
        return
    if dry_run:
        print("Would " + ("restore tracker-owned settings in " if remove else "back up and merge metrics settings in ") + str(path))
        print("Dry run: no files changed and no key requested.")
        return
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with setup_lock(path):
        settings, original = read_map(path)
        state, original_state = read_map(state_path)
        if "env" in settings and not isinstance(settings["env"], dict):
            raise SetupError("Existing env must be a JSON object. No settings changed.")
        validate_state(state)
        had_env = "env" in settings
        env = settings.setdefault("env", {})
        if remove:
            if not state:
                print("No tracker ownership record. Nothing changed.")
                return
            for name, value in state["installed"].items():
                if name in env and env[name] == value:
                    previous = state["previous"][name]
                    if previous["existed"]:
                        env[name] = previous["value"]
                    else:
                        del env[name]
                else:
                    print("Preserved subsequently changed setting: " + name)
            if not env and not state["hadEnv"]:
                del settings["env"]
        else:
            if not state:
                state = {"previous": {}, "hadEnv": had_env}
            for name, value in installed.items():
                if name not in state["previous"]:
                    state["previous"][name] = {"existed": name in env, "value": env.get(name)}
                env[name] = value
            state["installed"] = installed
        # Do not overwrite another program's changes made while preparing this merge.
        if read_map(path)[1] != original or read_map(state_path)[1] != original_state:
            raise SetupError("Settings changed concurrently. No settings overwritten; retry setup.")
        if original is not None:
            private_write(Path(str(path) + ".backup." + uuid.uuid4().hex + ".json"), original)
        if remove:
            if original is not None:
                private_write(path, json_bytes(settings))
            state_path.unlink()
        else:
            # State first: removal can recover if the subsequent settings write is interrupted.
            private_write(state_path, json_bytes(state))
            private_write(path, json_bytes(settings))
    print("Tracker-owned settings restored." if remove else "Metrics settings saved: " + str(path))
    print("Settings and private ownership/backups can contain device keys. Keep them private; backups remain after removal.")
    print("Exit existing Claude Code sessions. On macOS fully quit Desktop with Cmd+Q; on Linux quit Desktop if installed, then reopen it.")
    print("Start a NEW local Code session (or terminal claude), send a short prompt, wait at least 60 seconds, and use dashboard Verify.")
    print("Health alone does not prove telemetry. Managed/launcher environment can override user settings. Remote/cloud sessions are not configured.")
    if not remove:
        print("Updating an existing PC? Keep the same registered device and key. This script does not create a device or rotate its key.")
        print("If your admin enabled input history, also run the latest setup-history.py using that same device ID. Metrics setup alone does not enable input history.")
    if remove:
        print("Revoke the device key in People & devices to stop reporting authorization.")


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        raise SetupError("Invalid options. Use --help; enter the key only at the hidden prompt or via managed --key-stdin input.")


def main():
    parser = SafeParser(description="Configure Usage ledger metrics for local macOS/Linux Claude Code. No sudo or network calls.")
    parser.add_argument("--backend-url")
    parser.add_argument("--remove", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--settings-path", default=str(Path((os.environ.get("CLAUDE_CONFIG_DIR") or str(Path.home() / ".claude"))) / "settings.json"))
    parser.add_argument("--key-stdin", action="store_true", help="Managed automation only: read key from standard input instead of hidden terminal prompt")
    args = parser.parse_args()
    if os.name == "posix" and os.geteuid() == 0:
        raise SetupError("Run as your normal Claude Code user without sudo; root would configure the wrong profile.")
    key = None
    if not args.remove:
        origin(args.backend_url)
        if not args.dry_run:
            if args.key_stdin:
                key = sys.stdin.readline().rstrip("\r\n")
            else:
                if not sys.stdin.isatty():
                    raise SetupError("Run from an interactive terminal for a hidden key prompt. Managed automation may use --key-stdin.")
                try:
                    with warnings.catch_warnings():
                        warnings.simplefilter("error", getpass.GetPassWarning)
                        key = getpass.getpass("Device tracker key (hidden): ")
                except getpass.GetPassWarning:
                    raise SetupError("This terminal cannot hide key input. Use a normal interactive Terminal; no key was read or saved.") from None
    configure(args.settings_path, args.backend_url, key, args.remove, args.dry_run)


if __name__ == "__main__":
    try:
        main()
    except SetupError as error:
        print("Setup failed: " + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, KeyboardInterrupt, EOFError):
        print("Setup could not complete. Check file permissions and terminal input; no credentials were printed. Review private backups before retrying.", file=sys.stderr)
        sys.exit(1)

USAGE_TRACKER_PY
)" "$@"
