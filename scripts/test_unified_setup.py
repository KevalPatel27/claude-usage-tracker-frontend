"""Disposable synthetic configuration only. Never reads real Claude user settings."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("unified_setup", ROOT / "public/setup-unified.py")
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)
KEY = "dkey_" + "a" * 64
DEVICE = "1" * 24
BACKEND = "http://127.0.0.1:4001"


class UnifiedTests(unittest.TestCase):
    def setUp(self):
        (ROOT / ".local").mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / ".local")
        self.root = Path(self.temp.name)
        self.path = self.root / "settings.json"
        self.original = {"env": {"KEEP": "yes", "OTEL_METRICS_EXPORTER": "console"}, "statusLine": {"command": "keep-status"}, "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "keep-hook"}]}]}}
        self.path.write_text(json.dumps(self.original), encoding="utf-8")
        self.home = self.root / "usage-ledger-history"

    def tearDown(self):
        self.temp.cleanup()

    def install(self, **options):
        setup.configure(self.path, BACKEND, DEVICE, **options)

    def test_new_install_configures_both_with_one_key_and_removes_both(self):
        self.install(key=KEY)
        value = json.loads(self.path.read_text())
        self.assertEqual(value["env"]["OTEL_EXPORTER_OTLP_METRICS_HEADERS"], "X-Tracker-Key=" + KEY)
        self.assertEqual(value["env"]["OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE"], "cumulative")
        self.assertEqual(value["env"]["KEEP"], "yes")
        self.assertEqual(value["statusLine"], self.original["statusLine"])
        self.assertEqual(len(value["hooks"]["Stop"]), 2)
        self.assertEqual(json.loads((self.home / "config.json").read_text())["key"], KEY)
        self.assertTrue((self.home / "history-client.py").exists())
        setup.configure(self.path, remove=True)
        self.assertEqual(json.loads(self.path.read_text()), self.original)
        self.assertFalse((self.home / "config.json").exists())

    def test_update_reuses_key_keeps_queue_and_does_not_duplicate_hooks(self):
        self.install(key=KEY)
        queued = self.home / "queue/synthetic.json"
        queued.write_text('{"synthetic":"pending"}')
        with patch.object(setup.getpass, "getpass", side_effect=AssertionError("Must not ask for key")):
            self.install()
        value = json.loads(self.path.read_text())
        self.assertEqual(len(value["hooks"]["UserPromptSubmit"]), 1)
        self.assertEqual(len(value["hooks"]["Stop"]), 2)
        self.assertTrue(queued.exists())

    def test_upgrade_metrics_only_legacy_ownership_without_new_key(self):
        setup.metrics.configure(self.path, BACKEND, KEY)
        state = Path(str(self.path) + ".usage-tracker-state.json")
        previous = json.loads(state.read_text())["previous"]
        self.install()
        self.assertEqual(json.loads(state.read_text())["previous"], previous)
        self.assertTrue((self.home / "config.json").exists())

    def test_upgrade_previously_separate_history_installer(self):
        setup.metrics.configure(self.path, BACKEND, KEY)
        setup.history.configure(self.path, BACKEND, DEVICE, key=KEY)
        self.install()
        self.assertEqual(len(json.loads(self.path.read_text())["hooks"]["UserPromptSubmit"]), 1)
        setup.configure(self.path, remove=True)
        self.assertEqual(json.loads(self.path.read_text()), self.original)

    def test_metrics_only_removes_owned_history_and_queue_but_keeps_metrics(self):
        self.install(key=KEY)
        (self.home / "queue/synthetic.json").write_text('{}')
        self.install(include_history=False)
        value = json.loads(self.path.read_text())
        self.assertEqual(value["hooks"], self.original["hooks"])
        self.assertEqual(value["env"]["OTEL_METRICS_EXPORTER"], "otlp")
        self.assertFalse((self.home / "config.json").exists())
        self.assertEqual(list((self.home / "queue").glob("*.json")), [])

    def test_invalid_hook_ownership_fails_before_metrics_changes(self):
        self.install(key=KEY)
        value = json.loads(self.path.read_text())
        value["hooks"]["Stop"][-1]["hooks"][0]["timeout"] = 123
        self.path.write_text(json.dumps(value))
        before = self.path.read_bytes()
        with self.assertRaises(setup.history.SetupError):
            self.install(key="dkey_" + "b" * 64)
        self.assertEqual(self.path.read_bytes(), before)

    def test_cross_backend_or_device_cannot_reassign_pending_text(self):
        self.install(key=KEY)
        before = self.path.read_bytes()
        for backend, device in [("https://other.example", DEVICE), (BACKEND, "2" * 24)]:
            with self.assertRaises(setup.SetupError):
                setup.configure(self.path, backend, device, key=KEY)
        self.assertEqual(self.path.read_bytes(), before)

    def test_dry_run_and_bad_device_or_json_never_write(self):
        before = self.path.read_bytes()
        self.install(dry_run=True)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertFalse(self.home.exists())
        with self.assertRaises(setup.SetupError):
            setup.configure(self.path, BACKEND, "bad", key=KEY)
        self.path.write_text('{"env":{},"env":{}}')
        with self.assertRaises(setup.SetupError):
            self.install(key=KEY)

    def test_write_failure_restores_metrics_history_and_config(self):
        self.install(key=KEY)
        files = [self.path, Path(str(self.path) + ".usage-tracker-state.json"), Path(str(self.path) + ".usage-ledger-history-state.json"), self.home / "config.json", self.home / "history-client.py"]
        original = {p: p.read_bytes() for p in files}
        write = setup.metrics.private_write
        failed = False
        def fail_once(path, raw):
            nonlocal failed
            if path == self.path and not failed:
                failed = True
                raise OSError("Synthetic disk failure")
            return write(path, raw)
        with patch.object(setup.metrics, "private_write", side_effect=fail_once):
            with self.assertRaises(setup.SetupError):
                self.install(key="dkey_" + "b" * 64)
        for p in files:
            self.assertEqual(p.read_bytes(), original[p])

    def test_busy_lock_and_later_env_changes_preserved(self):
        lock = Path(str(self.path) + ".usage-tracker.lock")
        lock.write_text("")
        with self.assertRaises(setup.SetupError):
            self.install(key=KEY)
        lock.unlink()
        self.install(key=KEY)
        value = json.loads(self.path.read_text())
        value["env"]["OTEL_METRICS_EXPORTER"] = "prometheus"
        self.path.write_text(json.dumps(value))
        setup.configure(self.path, remove=True)
        self.assertEqual(json.loads(self.path.read_text())["env"]["OTEL_METRICS_EXPORTER"], "prometheus")


if __name__ == "__main__":
    unittest.main()
