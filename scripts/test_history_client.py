"""Synthetic hook inputs in isolated workspace files. Never touches real Claude settings."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time
import unittest

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


client = module("history_client", ROOT / "public/history-client.py")
setup = module("history_setup", ROOT / "public/setup-history.py")
KEY = "dkey_" + "a" * 64
DEVICE = "1" * 24


class HistoryTests(unittest.TestCase):
    def setUp(self):
        parent = ROOT / ".local/history-client-tests"
        parent.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=str(parent))
        self.root = Path(self.temp.name)
        self.settings = self.root / "settings.json"
        self.original = {"env": {"OTEL_EXPORTER_OTLP_METRICS_ENDPOINT": "http://127.0.0.1:4001/v1/metrics", "OTEL_EXPORTER_OTLP_METRICS_HEADERS": "X-Tracker-Key=" + KEY, "KEEP": "yes"},
            "statusLine": {"type": "command", "command": "keep-my-status"},
            "hooks": {"UserPromptSubmit": [{"matcher": "", "hooks": [{"type": "command", "command": "keep-my-hook"}]}]}}
        self.settings.write_text(json.dumps(self.original), encoding="utf-8")
        self.home = self.root / "usage-ledger-history"

    def tearDown(self):
        self.temp.cleanup()

    def install(self, **options):
        setup.configure(self.settings, "http://127.0.0.1:4001", DEVICE, **options)

    def hook(self, mode="submit", prompt="Synthetic task", prompt_id="prompt-1", now=None):
        return client.capture(self.home, mode, {"hook_event_name": "UserPromptSubmit" if mode == "submit" else "Stop", "prompt": prompt,
            "session_id": "session-1", "prompt_id": prompt_id, "last_assistant_message": "PRIVATE RESPONSE", "cwd": "PRIVATE PATH", "other": "PRIVATE VALUE"}, now)

    def test_merge_rotation_repeat_and_removal_preserve_other_hooks_and_statusline(self):
        self.install(); self.install(key="dkey_" + "b" * 64)
        value = json.loads(self.settings.read_text())
        self.assertEqual(value["statusLine"], self.original["statusLine"])
        self.assertEqual(value["env"], self.original["env"])
        self.assertEqual(len(value["hooks"]["UserPromptSubmit"]), 2)
        self.assertEqual(json.loads((self.home / "config.json").read_text())["key"], "dkey_" + "b" * 64)
        self.hook(); setup.configure(self.settings, remove=True)
        self.assertEqual(json.loads(self.settings.read_text()), self.original)
        self.assertFalse((self.home / "config.json").exists())
        self.assertEqual(client.queue_files(self.home), [])

    def test_existing_later_edits_survive_and_changed_owned_hook_is_rejected(self):
        self.install(); value = json.loads(self.settings.read_text()); value["newPreference"] = "keep"
        value["hooks"]["UserPromptSubmit"][0]["hooks"].append({"type": "command", "command": "later-hook"})
        self.settings.write_text(json.dumps(value)); setup.configure(self.settings, remove=True)
        self.assertEqual(json.loads(self.settings.read_text())["newPreference"], "keep")
        self.assertEqual(len(json.loads(self.settings.read_text())["hooks"]["UserPromptSubmit"][0]["hooks"]), 2)
        self.install(); value = json.loads(self.settings.read_text()); value["hooks"]["Stop"][0]["hooks"][0]["async"] = False
        self.settings.write_text(json.dumps(value)); original = self.settings.read_bytes()
        with self.assertRaises(setup.SetupError): setup.configure(self.settings, remove=True)
        self.assertEqual(self.settings.read_bytes(), original)

    def test_dry_run_invalid_json_origin_and_device_do_not_write(self):
        self.install(dry_run=True); self.assertFalse(self.home.exists())
        for url in ["https://host/path", "http://remote.example", "[https://host](https://host)"]:
            with self.assertRaises(setup.SetupError): setup.configure(self.settings, url, DEVICE, key=KEY)
        with self.assertRaises(setup.SetupError): setup.configure(self.settings, "https://host", "bad", key=KEY)
        self.settings.write_text('{"hooks":{},"hooks":{}}')
        with self.assertRaises(setup.SetupError): self.install()
        self.assertFalse(self.home.exists())

    def test_cross_device_and_origin_changes_cannot_reassign_queued_prompts(self):
        self.install(); self.hook()
        with self.assertRaises(setup.SetupError): setup.configure(self.settings, "http://127.0.0.1:4001", "2" * 24, key=KEY)
        with self.assertRaises(setup.SetupError): setup.configure(self.settings, "https://different.example", DEVICE, key=KEY)
        self.assertEqual(len(client.queue_files(self.home)), 1)

    def test_callback_allowlist_excludes_assistant_and_paths_and_requires_ids(self):
        self.install(); self.assertTrue(self.hook()); self.assertTrue(self.hook("stop"))
        records = [json.loads(p.read_text()) for p in client.queue_files(self.home)]
        for row in records:
            self.assertFalse(set(row) - {"type", "sessionId", "promptId", "observedAt", "prompt", "promptLength"})
            self.assertNotIn("PRIVATE", json.dumps(row))
        self.assertFalse(client.capture(self.home, "submit", {"hook_event_name": "UserPromptSubmit", "prompt": "ignored", "session_id": "id"}))

    def test_unicode_truncation_and_local_duplicate_submission(self):
        self.install(); self.hook(prompt="👋" * 16010); self.hook(prompt="other text")
        records = [json.loads(p.read_text()) for p in client.queue_files(self.home)]
        self.assertEqual(len(records), 1); self.assertEqual(len(records[0]["prompt"]), 16000); self.assertEqual(records[0]["promptLength"], 16010)

    def test_outage_keeps_queue_and_success_ack_then_receipt_prevents_resend(self):
        self.install(); self.hook()
        client.flush(self.home, sender=lambda *_: (503, None)); self.assertEqual(len(client.queue_files(self.home)), 1)
        sent = []
        def success(origin, key, payload):
            self.assertEqual(origin, "http://127.0.0.1:4001"); self.assertEqual(key, KEY); sent.append(payload)
            return 200, {"accepted": len(payload["events"])}
        client.flush(self.home, sender=success); self.assertEqual(client.queue_files(self.home), [])
        self.assertFalse(self.hook()); self.assertEqual(sent[0]["deviceId"], DEVICE)
        self.assertEqual(sent[0]["diagnostics"]["setupVersion"], "2.0.0")
        self.assertNotIn("PRIVATE", json.dumps(sent))

    def test_malformed_success_does_not_drop_queue_and_authorization_pauses_capture(self):
        self.install(); self.hook(); client.flush(self.home, sender=lambda *_: (200, {"ok": True}))
        self.assertEqual(len(client.queue_files(self.home)), 1)
        client.flush(self.home, sender=lambda *_: (403, None)); self.assertTrue((self.home / "paused.json").exists())
        self.assertFalse(self.hook(prompt_id="another"))
        self.install(); self.assertFalse((self.home / "paused.json").exists())

    def test_rejected_batch_isolated_so_valid_prompt_is_not_discarded(self):
        self.install(); self.hook(prompt_id="first"); self.hook(prompt_id="second")
        calls = []
        def send(origin, key, payload):
            calls.append(payload)
            return (400, None) if len(payload["events"]) > 1 or payload["events"][0]["promptId"] == "first" else (200, {"accepted": 1})
        client.flush(self.home, sender=send)
        self.assertEqual(client.queue_files(self.home), [])
        self.assertTrue(any(c["events"][0]["promptId"] == "second" and len(c["events"]) == 1 for c in calls))
        self.assertEqual(json.loads((self.home / "diagnostics.json").read_text())["droppedCount"], 1)

    def test_expired_queue_and_caps_report_loss_honestly(self):
        self.install(); self.hook(now=time.time() - 8 * 86400)
        client.flush(self.home, sender=lambda *_: self.fail("Expired events must not be sent"))
        self.assertEqual(client.queue_files(self.home), [])
        old = client.MAX_EVENTS
        try:
            client.MAX_EVENTS = 0; self.assertFalse(self.hook(prompt_id="new"))
        finally: client.MAX_EVENTS = old
        self.assertEqual(json.loads((self.home / "diagnostics.json").read_text())["lastIssue"], "queue-full")

    def test_busy_setup_lock_and_invalid_ownership_do_not_overwrite(self):
        lock = Path(str(self.settings) + ".usage-tracker.lock"); lock.write_text("")
        with self.assertRaises(setup.SetupError): self.install()
        lock.unlink(); self.install()
        state = Path(str(self.settings) + ".usage-ledger-history-state.json"); state.write_text('{"installed":{"Unknown":{}}}')
        before = self.settings.read_bytes()
        with self.assertRaises(setup.SetupError): setup.configure(self.settings, remove=True)
        self.assertEqual(self.settings.read_bytes(), before)

    def test_exec_form_preserves_unrelated_python_hooks_and_does_not_recreate_deleted_settings(self):
        self.install()
        value = json.loads(self.settings.read_text())
        handler = value["hooks"]["UserPromptSubmit"][-1]["hooks"][0]
        self.assertTrue(handler["async"])
        self.assertEqual(handler["command"], Path(sys.executable).as_posix())
        self.assertEqual(handler["args"], [(self.home / "history-client.py").as_posix(), "submit"])
        value["hooks"]["UserPromptSubmit"][0]["hooks"].append({"type":"command", "command":handler["command"], "args":["unrelated.py"]})
        self.settings.write_text(json.dumps(value))
        self.install()
        self.assertTrue(any(h.get("args") == ["unrelated.py"] for e in json.loads(self.settings.read_text())["hooks"]["UserPromptSubmit"] for h in e["hooks"]))
        self.settings.unlink()
        setup.configure(self.settings, remove=True)
        self.assertFalse(self.settings.exists())
        self.assertFalse((self.home / "config.json").exists())

    @unittest.skipUnless(os.name == "posix", "POSIX-only native filesystem assertion")
    def test_native_permissions_and_symlink_rejection(self):
        self.install(); self.assertEqual((self.home / "config.json").stat().st_mode & 0o777, 0o600)
        link = self.root / "linked.json"; link.symlink_to(self.settings)
        with self.assertRaises(setup.SetupError): setup.configure(link, "http://127.0.0.1:4001", DEVICE, key=KEY)


if __name__ == "__main__":
    unittest.main()
