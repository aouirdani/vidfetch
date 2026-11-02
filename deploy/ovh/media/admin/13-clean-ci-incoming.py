#!/usr/bin/env python3
"""Move old CI archives to a dated backup, preserving active and newest releases."""
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import sys
import time
from datetime import datetime, timezone

INCOMING = Path(os.environ.get("VM_CI_INCOMING", "/var/lib/vidfetch-deploy/ci-incoming"))
BACKUPS = Path(os.environ.get("VM_BACKUPS", "/var/backups"))
CI_STORE = Path(os.environ.get("VM_CI_STORE", "/opt/vidfetch-ci-web"))
WEB_BASE = Path(os.environ.get("VM_WEB_BASE", "/opt/vidfetch-web-preproduction-20261013"))
LOCK = Path(os.environ.get("VM_INCOMING_LOCK", str(INCOMING / ".lock")))
CI_LOCK = Path(os.environ.get("VM_CI_LOCK", str(CI_STORE / "lock")))
ARCHIVE = re.compile(r"^[a-f0-9]{40}\.tgz$")
GRACE_SECONDS = 30 * 60


def log(message):
    print(f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {message}", flush=True)


def safe_directory(path, allow_deploy_owner=False):
    if not path.is_absolute() or path.is_symlink() or not path.is_dir():
        raise RuntimeError(f"refusing unsafe or missing directory: {path}")
    st = os.stat(path, follow_symlinks=False)
    if os.environ.get("VM_TEST_ALLOW_NONROOT") != "1":
        trusted_owners = {0}
        if allow_deploy_owner:
            try:
                trusted_owners.add(pwd.getpwnam("vidfetch-deploy").pw_uid)
            except KeyError:
                pass
        if st.st_uid not in trusted_owners or st.st_mode & 0o022:
            raise RuntimeError(f"directory has an unexpected owner or writable mode: {path} (uid={st.st_uid}, mode={st.st_mode & 0o777:o})")


def active_release():
    current = WEB_BASE / "current"
    if current.is_symlink():
        release_dir = current.resolve(strict=True)
    else:
        release_dir = (CI_STORE / "current").resolve(strict=True)
    manifest_path = release_dir / "manifest.json"
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise RuntimeError("active release manifest is missing or symlinked")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    release = manifest.get("release")
    if not isinstance(release, str) or not re.fullmatch(r"[a-f0-9]{40}", release):
        raise RuntimeError("active release manifest has no valid release SHA")
    return release


def main():
    if os.geteuid() != 0 and os.environ.get("VM_TEST_ALLOW_NONROOT") != "1":
        raise RuntimeError("must run as root")
    safe_directory(INCOMING, allow_deploy_owner=True)
    safe_directory(BACKUPS)
    now = float(os.environ.get("VM_NOW_EPOCH", time.time()))

    # Lock order matches dispatch.py (incoming .lock, then promote.py's CI store lock).
    with LOCK.open("a") as incoming_lock:
        try:
            fcntl.flock(incoming_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            log("skipped: dispatcher holds ci-incoming/.lock")
            return 0
        # promote.py creates this lock file; opening read-only avoids needing write access
        # to the CI release tree while still taking the same exclusive flock.
        with CI_LOCK.open("r") as ci_lock:
            fcntl.flock(ci_lock, fcntl.LOCK_EX)
            active = active_release()
            archives = []
            for path in INCOMING.iterdir():
                try:
                    st = path.lstat()
                except FileNotFoundError:
                    continue
                if ARCHIVE.fullmatch(path.name) and path.is_file() and not path.is_symlink():
                    archives.append((path, st.st_mtime, st.st_size))
            newest = {p.name for p, _, _ in sorted(archives, key=lambda row: (row[1], row[0].name), reverse=True)[:3]}
            eligible = [(p, mtime, size) for p, mtime, size in archives
                        if p.name[:-4] != active and p.name not in newest and now - mtime >= GRACE_SECONDS]
            active_present = any(p.name == f"{active}.tgz" for p, _, _ in archives)
            young = sum(1 for _, mtime, _ in archives if now - mtime < GRACE_SECONDS)
            if not eligible:
                log(f"complete: archives={len(archives)} active={active} active_archive_present={str(active_present).lower()} newest_kept={len(newest)} young_ignored={young} moved=0")
                return 0
            stamp = datetime.fromtimestamp(now, timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            target = BACKUPS / f"vidfetch-ci-incoming-{stamp}"
            suffix = 1
            while target.exists():
                target = BACKUPS / f"vidfetch-ci-incoming-{stamp}-{suffix}"
                suffix += 1
            target.mkdir(mode=0o700)
            if os.geteuid() == 0:
                os.chown(target, 0, 0)
            if os.stat(INCOMING).st_dev != os.stat(target).st_dev:
                target.rmdir()
                raise RuntimeError("incoming and backup directories are on different filesystems; refusing non-atomic move")
            moved = 0
            try:
                for path, _, _ in sorted(eligible, key=lambda row: row[0].name):
                    destination = target / path.name
                    if destination.exists() or destination.is_symlink():
                        raise RuntimeError(f"backup destination already exists: {destination.name}")
                    os.rename(path, destination)
                    moved += 1
                directory_fd = os.open(target, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
                try:
                    os.fsync(directory_fd)
                finally:
                    os.close(directory_fd)
            except Exception:
                log(f"partial move: {moved} archive(s) retained in {target}; inspect before retry")
                raise
            total = sum(size for _, _, size in eligible)
            log(f"complete: archives={len(archives)} active={active} active_archive_present={str(active_present).lower()} newest_kept={len(newest)} young_ignored={young} moved={moved} bytes={total} backup={target}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        log(f"ERROR: {exc}")
        sys.exit(1)
