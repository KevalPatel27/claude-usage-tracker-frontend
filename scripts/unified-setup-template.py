#!/usr/bin/env python3
"""Single-entry Usage ledger installer. Bundled engines, no downloads or account access."""
import argparse
import base64
import copy
import getpass
import json
import os
from pathlib import Path
import re
import sys
import types
import uuid
import warnings

# __BUNDLED_ENGINES__


def engine(name, source):
    result = types.ModuleType(name)
    exec(compile(base64.b64decode(source), name, "exec"), result.__dict__)
    return result


metrics = engine("ledger_metrics", METRICS_SOURCE)
history = engine("ledger_history", HISTORY_SOURCE)
SetupError = metrics.SetupError


def installed_key(settings, config, backend):
    env = settings.get("env", {})
    if isinstance(env, dict) and env.get("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT") == backend + "/v1/metrics":
        header = env.get("OTEL_EXPORTER_OTLP_METRICS_HEADERS", "")
        match = re.fullmatch(r"X-Tracker-Key=(dkey_[a-f0-9]{64})", header) if isinstance(header, str) else None
        if match:
            return match.group(1)
    if config.get("backendUrl") == backend and isinstance(config.get("key"), str) and re.fullmatch(r"dkey_[a-f0-9]{64}", config["key"]):
        return config["key"]
    return None


def configure(path, backend=None, device_id=None, key=None, include_history=True, remove=False, dry_run=False):
    path = Path(os.path.abspath(os.path.expanduser(str(path))))
    metric_state = Path(str(path) + ".usage-tracker-state.json")
    hook_state = Path(str(path) + ".usage-ledger-history-state.json")
    root = path.parent / "usage-ledger-history"
    for folder in [root, root / "queue", root / "seen"]:
        if folder.is_symlink():
            raise SetupError("Refusing a symlink history directory. No settings changed.")
    settings, original = metrics.read_map(path)
    old_metrics, metric_raw = metrics.read_map(metric_state)
    old_hooks, hook_raw = metrics.read_map(hook_state)
    config, config_raw = metrics.read_map(root / "config.json")
    metrics.validate_state(old_metrics)  # Compatible with prior Windows and POSIX ownership records.
    if "env" in settings and not isinstance(settings["env"], dict):
        raise SetupError("Existing env must be an object. No settings changed.")
    if remove and not old_metrics and not old_hooks:
        print("No tracker ownership records. Nothing changed.")
        return
    if not remove:
        backend = metrics.origin(backend)
        if config and config.get("backendUrl") != backend:
            raise SetupError("History belongs to another backend. Remove the old tracker setup first; queued inputs cannot be sent to a different server.")
        device_id = device_id or config.get("deviceId")
        if include_history and (not isinstance(device_id, str) or not re.fullmatch(r"[a-f0-9]{24}", device_id)):
            raise SetupError("Copy the command containing this PC's existing device ID from the dashboard.")
        if config and device_id and config.get("deviceId") != device_id:
            raise SetupError("This profile belongs to another device. Do not reassign its queued inputs; remove the old setup first.")
    handlers = {}
    if include_history and not remove:
        for event, mode in [("UserPromptSubmit", "submit"), ("Stop", "stop")]:
            handlers[event] = {"type": "command", "command": Path(sys.executable).as_posix(), "args": [(root / "history-client.py").as_posix(), mode], "async": True}
    # Validate hook ownership even for metrics-only updates/removal, before any writes or key prompt.
    merged = history.merge_hooks(settings, old_hooks, handlers)
    if dry_run:
        print("Dry run: would " + ("remove tracker-owned metrics/history" if remove else "install/update metrics" + (" and input history" if include_history else " only")) + ". No key requested or files changed.")
        return
    if not remove:
        key = key or installed_key(settings, config, backend)
        if not key:
            if not sys.stdin.isatty():
                raise SetupError("Use an interactive terminal for the hidden key prompt, or managed --key-stdin.")
            with warnings.catch_warnings():
                warnings.simplefilter("error", getpass.GetPassWarning)
                try:
                    key = getpass.getpass("Device key (hidden; existing PCs use the same key): ")
                except getpass.GetPassWarning:
                    raise SetupError("This terminal cannot hide key input. Use a normal interactive terminal.") from None
        installed = metrics.installed_settings(backend, key)
    state = copy.deepcopy(old_metrics)
    if not state:
        state = {"previous": {}, "hadEnv": "env" in settings}
    env = merged.setdefault("env", {})
    if remove:
        for name, value in old_metrics.get("installed", {}).items():
            if env.get(name) == value:
                prior = old_metrics["previous"][name]
                if prior["existed"]:
                    env[name] = prior["value"]
                else:
                    env.pop(name, None)
            else:
                print("Preserved subsequently changed setting: " + name)
        if not env and not state["hadEnv"]:
            merged.pop("env", None)
    else:
        for name, value in installed.items():
            if name not in state["previous"]:
                state["previous"][name] = {"existed": name in env, "value": env.get(name)}
            env[name] = value
        state["installed"] = installed
    changes = {metric_state: None if remove else metrics.json_bytes(state)}
    if handlers:
        changes.update({root / "history-client.py": history.CLIENT_SOURCE.encode("utf-8"),
            root / "config.json": metrics.json_bytes({"version": "2.0.0", "deviceId": device_id, "backendUrl": backend, "key": key}),
            hook_state: metrics.json_bytes({"version": 2, "hadHooks": old_hooks.get("hadHooks", "hooks" in settings), "installed": handlers}), root / "paused.json": None})
    elif old_hooks:
        changes.update({hook_state: None, root / "config.json": None, root / "paused.json": None})
    # Settings are the final commit: a helper/config must exist before its hooks become active.
    if original is not None or not remove:
        changes[path] = metrics.json_bytes(merged)
    snapshots = {target: metrics.read_map(target)[1] for target in changes if target.name != "history-client.py"}
    helper = root / "history-client.py"
    if helper in changes:
        if helper.is_symlink():
            raise SetupError("Refusing a symlink helper file.")
        snapshots[helper] = helper.read_bytes() if helper.exists() else None
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with metrics.setup_lock(path):
        if metrics.read_map(path)[1] != original or metrics.read_map(metric_state)[1] != metric_raw or metrics.read_map(hook_state)[1] != hook_raw or metrics.read_map(root / "config.json")[1] != config_raw:
            raise SetupError("Configuration changed concurrently. Retry setup; nothing overwritten.")
        if handlers:
            root.mkdir(mode=0o700, exist_ok=True)
            for name in ["queue", "seen"]:
                (root / name).mkdir(mode=0o700, exist_ok=True)
        # Back up settings AND ownership/config so a failed/interrupted upgrade can be reviewed.
        backup_id = uuid.uuid4().hex
        for target in [path, metric_state, hook_state, root / "config.json"]:
            raw = snapshots.get(target)
            if raw is not None:
                metrics.private_write(Path(str(target) + ".backup." + backup_id + ".json"), raw)
        written = []
        try:
            for target, raw in changes.items():
                written.append(target)
                if raw is None:
                    target.unlink(missing_ok=True)
                else:
                    metrics.private_write(target, raw)
        except OSError:
            # Restore only exact known targets. A hard power loss still requires private backup review.
            try:
                for target in reversed(written):
                    if snapshots[target] is None:
                        target.unlink(missing_ok=True)
                    else:
                        metrics.private_write(target, snapshots[target])
            except OSError:
                raise SetupError("Setup failed and rollback was incomplete. Review private backups before retrying.") from None
            raise SetupError("Setup failed; previous configuration restored. Review private backups before retrying.") from None
        if not handlers and old_hooks:
            for folder in [root / "queue", root / "seen"]:
                for file in folder.glob("*.json"):
                    if file.is_file() and not file.is_symlink():
                        file.unlink()
    print("Tracker-owned settings removed; pending input history erased." if remove else "Tracker setup complete: metrics" + (" and captured-input history." if include_history else " only."))
    print("Existing device/key reused when available for the same backend. No device registration or key rotation was performed.")
    print("Other Claude settings preserved. Settings, ownership/config backups and keys must stay private.")
    if not remove and include_history:
        print("Captured inputs can include pasted private content and automated notifications. No transcript files or assistant/tool-output fields are read. Queue delivery is bounded, not guaranteed.")
    print("Completely quit/reopen Desktop or terminal Code, start a NEW local session, send a harmless prompt, wait at least 60 seconds, then ask your admin to verify reports.")


def main():
    parser = history.SafeParser(description="One installer for Claude usage metrics and optional captured-input history. Python 3.8+, no sudo.")
    parser.add_argument("--backend-url")
    parser.add_argument("--device-id")
    parser.add_argument("--no-history", action="store_true", help="Metrics only; removes owned history hooks and pending queued input if previously installed")
    parser.add_argument("--remove", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--key-stdin", action="store_true")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--flush", action="store_true")
    parser.add_argument("--settings-path", default=str(Path(os.environ.get("CLAUDE_CONFIG_DIR") or str(Path.home() / ".claude")) / "settings.json"))
    args = parser.parse_args()
    if os.name == "posix" and os.geteuid() == 0:
        raise SetupError("Run as the normal Claude user, without sudo.")
    if args.status or args.flush:
        import subprocess
        helper = Path(args.settings_path).expanduser().absolute().parent / "usage-ledger-history/history-client.py"
        if not helper.is_file() or helper.is_symlink():
            raise SetupError("History helper is not installed for this settings file.")
        subprocess.run([sys.executable, str(helper), "flush" if args.flush else "status"], check=True)
        return
    key = sys.stdin.readline().rstrip("\r\n") if args.key_stdin and not args.remove and not args.dry_run else None
    configure(args.settings_path, args.backend_url, args.device_id, key, not args.no_history, args.remove, args.dry_run)


if __name__ == "__main__":
    try:
        main()
    except (SetupError, history.SetupError) as error:
        print("Setup failed: " + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, EOFError, KeyboardInterrupt):
        print("Setup could not complete. Review permissions/private backups. No key was printed.", file=sys.stderr)
        sys.exit(1)
