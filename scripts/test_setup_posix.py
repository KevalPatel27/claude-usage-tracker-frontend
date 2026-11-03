"""Isolated settings tests; never reads or modifies a real Claude profile."""
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
ENGINE = Path(__file__).resolve().parents[1] / "public" / "setup-posix.py"
spec = importlib.util.spec_from_file_location("tracker_setup", ENGINE)
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)
KEY = "dkey_" + "a" * 64


class SettingsSetup(unittest.TestCase):
    def setUp(self):
        test_root = ENGINE.parents[1] / ".local" / "posix-setup-tests"
        test_root.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=str(test_root))
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "config" / "settings.json"
        self.state = Path(str(self.path) + ".usage-tracker-state.json")

    def seed(self, value):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(value), encoding="utf-8")

    def install(self, key=KEY):
        setup.configure(self.path, "https://tracker.example.test", key)

    def test_merge_rotate_remove_restores_original_and_preserves_unrelated_values(self):
        original = {"permissions": {"allow": ["Read"]}, "env": {"KEEP": "yes", "OTEL_METRICS_EXPORTER": "console"}, "notes": "Unicode café"}
        self.seed(original)
        self.install()
        data = json.loads(self.path.read_text())
        self.assertEqual(data["permissions"], original["permissions"])
        self.assertEqual(data["env"]["OTEL_EXPORTER_OTLP_METRICS_ENDPOINT"], "https://tracker.example.test/v1/metrics")
        self.assertEqual(data["env"]["OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE"], "cumulative")
        self.assertEqual(data["env"]["OTEL_METRICS_INCLUDE_SESSION_ID"], "true")
        self.assertEqual(data["env"]["OTEL_LOGS_EXPORTER"], "none")
        self.install("dkey_" + "b" * 64)
        setup.configure(self.path, remove=True)
        self.assertEqual(json.loads(self.path.read_text()), original)
        self.assertFalse(self.state.exists())
        self.assertGreaterEqual(len(list(self.path.parent.glob("*.backup.*.json"))), 3)

    def test_removal_keeps_later_manual_changes_and_drops_only_created_env(self):
        self.seed({"model": "existing"})
        self.install()
        data = json.loads(self.path.read_text())
        data["env"]["OTEL_METRICS_EXPORTER"] = "prometheus"
        data["env"]["NEW"] = "keep"
        self.path.write_text(json.dumps(data))
        setup.configure(self.path, remove=True)
        self.assertEqual(json.loads(self.path.read_text())["env"], {"OTEL_METRICS_EXPORTER": "prometheus", "NEW": "keep"})

    def test_new_profile_remove_and_missing_settings_do_not_restore_deleted_file(self):
        self.install()
        setup.configure(self.path, remove=True)
        self.assertEqual(json.loads(self.path.read_text()), {})
        self.install()
        self.path.unlink()
        setup.configure(self.path, remove=True)
        self.assertFalse(self.path.exists())
        self.assertFalse(self.state.exists())

    def test_bad_json_duplicate_keys_and_nonobject_env_leave_files_unchanged(self):
        self.path.parent.mkdir()
        for value in ['{"secret":', '{"env":{},"env":{}}', '{"env":null}', '[]', '{"value":NaN}']:
            self.path.write_text(value)
            with self.assertRaises(setup.SetupError):
                self.install()
            self.assertEqual(self.path.read_text(), value)
            self.assertFalse(self.state.exists())
            self.assertEqual(list(self.path.parent.glob("*.backup.*.json")), [])

    def test_bad_origins_and_keys_and_dry_run_have_no_write_side_effects(self):
        for url in ['[https://x.test](https://x.test)', 'http://x.test', 'https://u:p@x.test', 'https://x.test/path', 'https://x.test/?key=secret', 'https://x.test/#x', 'https://x.test\x00']:
            with self.assertRaises(setup.SetupError):
                setup.configure(self.path, url, KEY)
        for key in ["invalid", None]:
            with self.assertRaises(setup.SetupError):
                setup.configure(self.path, "https://x.test", key)
        setup.configure(self.path, "http://127.0.0.1:4000", dry_run=True)
        self.assertFalse(self.path.parent.exists())

    def test_invalid_state_lock_and_symlink_fail_closed(self):
        self.seed({"env": {"KEEP": "yes"}})
        before = self.path.read_bytes()
        self.state.write_text('{"installed":{"UNRELATED":"value"}}')
        with self.assertRaises(setup.SetupError):
            self.install()
        self.assertEqual(self.path.read_bytes(), before)
        self.state.unlink()
        lock = Path(str(self.path) + ".usage-tracker.lock")
        lock.write_text("existing")
        with self.assertRaises(setup.SetupError):
            self.install()
        self.assertEqual(lock.read_text(), "existing")
        lock.unlink()
        if os.name == "posix":
            target = self.path.parent / "actual.json"
            self.path.rename(target)
            self.path.symlink_to(target)
            with self.assertRaises(setup.SetupError):
                self.install()
            self.assertEqual(target.read_bytes(), before)

    def test_private_permissions_on_posix_and_rollback_ownership_after_write_failure(self):
        self.seed({"keep": True})
        real_write = setup.private_write
        def interrupted(path, data):
            if path == self.path:
                raise OSError("injected settings write failure")
            real_write(path, data)
        with patch.object(setup, "private_write", side_effect=interrupted):
            with self.assertRaises(OSError):
                self.install()
        self.assertTrue(self.state.exists())
        self.assertEqual(json.loads(self.path.read_text()), {"keep": True})
        setup.configure(self.path, remove=True)
        self.assertEqual(json.loads(self.path.read_text()), {"keep": True})
        self.install()
        if os.name == "posix":
            for path in [self.path, self.state, *self.path.parent.glob("*.backup.*.json")]:
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)

    def test_unavailable_hidden_terminal_never_falls_back_to_echoing_the_key(self):
        with patch.object(sys, "argv", ["setup", "--backend-url", "https://x.test", "--settings-path", str(self.path)]), patch.object(sys.stdin, "isatty", return_value=True), patch.object(setup.getpass, "getpass", side_effect=setup.getpass.GetPassWarning("private-warning")):
            with self.assertRaisesRegex(setup.SetupError, "cannot hide"):
                setup.main()
        self.assertFalse(self.path.exists())

    def test_cli_stdin_does_not_print_keys_and_config_dir_is_honored(self):
        env = {**os.environ, "CLAUDE_CONFIG_DIR": str(self.path.parent), "PYTHONIOENCODING": "utf-8"}
        run = subprocess.run([sys.executable, str(ENGINE), "--backend-url", "https://x.test", "--key-stdin"], input=KEY + "\n", text=True, capture_output=True, env=env, encoding="utf-8")
        if os.name == "posix" and os.geteuid() == 0:
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("without sudo", run.stderr)
            self.assertFalse(self.path.exists())
            return
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertNotIn(KEY, run.stdout + run.stderr)
        self.assertEqual(json.loads(self.path.read_text())["env"]["OTEL_EXPORTER_OTLP_METRICS_HEADERS"], "X-Tracker-Key=" + KEY)
        result = subprocess.run([sys.executable, str(ENGINE), "--remove"], text=True, capture_output=True, env=env, encoding="utf-8")
        self.assertEqual(result.returncode, 0)
        bad = subprocess.run([sys.executable, str(ENGINE), "--tracker-key", KEY], text=True, capture_output=True, env=env, encoding="utf-8")
        self.assertNotEqual(bad.returncode, 0)
        self.assertNotIn(KEY, bad.stdout + bad.stderr)


if __name__ == "__main__":
    unittest.main()
