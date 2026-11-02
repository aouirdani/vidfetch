"""Behavioral tests for safe archival of CI incoming release bundles."""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).parents[3]
SCRIPT = ROOT / "deploy/ovh/media/admin/13-clean-ci-incoming.py"


class IncomingCleanup(unittest.TestCase):
    def test_preserves_active_three_newest_and_recent_files_and_moves_older_archives(self):
        with tempfile.TemporaryDirectory(prefix="vidfetch-ci-cleanup-") as temporary:
            root = Path(temporary)
            incoming, backups = root / "incoming", root / "backups"
            store, web = root / "store", root / "web"
            for directory in (incoming, backups, store, web):
                directory.mkdir()
            (store / "lock").touch()
            current = store / "active-release"
            current.mkdir()
            active = "a" * 40
            (current / "manifest.json").write_text(json.dumps({"release": active}))
            (store / "current").symlink_to(current)
            web_view = root / "web-view"
            web_view.mkdir()
            (web_view / "current").symlink_to(current)
            now = 2_000_000_000
            ids = [f"{i:040x}" for i in range(1, 11)]
            mtimes = [now - 50_000, now - 40_000, now - 30_000, now - 20_000,
                      now - 10_000, now - 5_000, now - 1_000, now - 500,
                      now - 60, now - 20]
            for sha, mtime in zip(ids, mtimes):
                archive = incoming / f"{sha}.tgz"
                archive.write_bytes(sha.encode())
                os.utime(archive, (mtime, mtime))
            active_archive = incoming / f"{active}.tgz"
            active_archive.write_bytes(b"active")
            os.utime(active_archive, (now - 70_000, now - 70_000))
            (incoming / "upload-partial").write_text("keep")

            environment = {
                **os.environ,
                "VM_TEST_ALLOW_NONROOT": "1",
                "VM_CI_INCOMING": str(incoming),
                "VM_BACKUPS": str(backups),
                "VM_CI_STORE": str(store),
                "VM_WEB_BASE": str(web_view),
                "VM_CI_LOCK": str(store / "lock"),
                "VM_NOW_EPOCH": str(now),
            }
            lock_path = incoming / ".lock"
            with lock_path.open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                skipped = subprocess.run(["python3", str(SCRIPT)], env=environment, text=True, capture_output=True)
                self.assertEqual(skipped.returncode, 0, skipped.stderr)
                self.assertIn("dispatcher holds ci-incoming/.lock", skipped.stdout)
                self.assertFalse(any(backups.iterdir()))

            result = subprocess.run(["python3", str(SCRIPT)], env=environment, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("moved=6", result.stdout)
            self.assertTrue((incoming / f"{active}.tgz").exists())
            self.assertTrue((incoming / "upload-partial").exists())
            self.assertTrue((incoming / f"{ids[6]}.tgz").exists())  # recent but outside newest three
            self.assertTrue((incoming / f"{ids[7]}.tgz").exists())  # newest three by mtime
            self.assertTrue((incoming / f"{ids[8]}.tgz").exists())
            self.assertTrue((incoming / f"{ids[9]}.tgz").exists())
            dated = list(backups.glob("vidfetch-ci-incoming-*"))
            self.assertEqual(len(dated), 1)
            self.assertEqual({path.name for path in dated[0].iterdir()}, {f"{ids[i]}.tgz" for i in range(6)})
            # The active release is preserved even though its age places it outside the newest three.
            self.assertTrue((incoming / f"{active}.tgz").exists())

    def test_systemd_units_are_weekly_and_journalled(self):
        service = (ROOT / "deploy/ovh/systemd/vidfetch-ci-incoming-cleanup.service").read_text()
        timer = (ROOT / "deploy/ovh/systemd/vidfetch-ci-incoming-cleanup.timer").read_text()
        self.assertIn("StandardOutput=journal", service)
        self.assertIn("13-clean-ci-incoming.py", service)
        self.assertIn("OnCalendar=Sun *-*-* 03:30:00 UTC", timer)
        self.assertIn("Persistent=true", timer)
        self.assertIn("Unit=vidfetch-ci-incoming-cleanup.service", timer)


if __name__ == "__main__":
    unittest.main()
