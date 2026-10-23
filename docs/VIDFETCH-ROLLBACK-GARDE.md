# Rollback guard: `rollback.py` never reopens a mixed release while downloads are open

## 1. The problem

`rollback.py` is the administrator recovery helper (`/usr/local/libexec/vidfetch-ci/rollback.py`). It restores the frontend release that `pending.json` or `previous.json` names. It never changes the engine or the gateway.

The installed version (`76bb56b6…`) checks nothing about downloads.

**When the gap appears.** After a reviewed activation of a new gateway (PR #16) and `08-gateway.sh upgrade`, `previous.json` names a release built with the **older** gateway.

**What the installed helper does then.** Run while `ready=1`, it restores that frontend next to the **newer** gateway, with downloads open. This breaks invariant I1: downloads are open only if the frontend, engine and gateway come from the same release.

The CI promoter never creates this situation by itself, because it refuses any release whose engine or gateway changed. Only a reviewed activation does.

## 2. The rule

| `VIDFETCH_CONNECTION_READY` in `/etc/vidfetch/web.env` | Release to restore | Result |
|---|---|---|
| `0` (every line), downloads confirmed closed | any recorded release | restored, **exactly as before**: the emergency recovery is unchanged |
| `1` | engine and gateway equal to the bundles in service | restored (normal CI rollback, interrupted promotion) |
| `1` | another engine or gateway | **refused, nothing changed** |
| absent, unreadable (missing, symlink, not root-owned, not text) or inconsistent (lines that disagree, value other than `0`/`1`) | engine and gateway equal to the bundles in service | restored |
| same | another engine or gateway, **or anything that cannot be read** | **refused, nothing changed** |

**What "in service" means.** It is the bundle that each unit's **main process** executes:
- the `.cjs` file named in `ExecStart`;
- that file must be the one in `/proc/<MainPID>/cmdline`;
- its SHA-256 is taken.

This is the same reading as `activate-reviewed.py`.

**What counts as "cannot be read".** Any of these reasons refuses the restore when downloads are not closed:
- malformed manifest;
- `systemctl` failing or timing out;
- unit without a process;
- missing bundle;
- unreadable `/proc`;
- restart pending.

**What the refusal does.** It happens before `guards()`, before the pointer switch and before any restart. `pending.json` and `previous.json` stay in place.

**The message names the way out:**
1. `11-downloads.sh close`;
2. `rollback.py` again;
3. `08-gateway.sh rollback`.

**Unchanged:**
- With `ready=0`, every step runs as before, in the same order.
- The interrupted-promotion recovery (`pending.json`) works with `ready=1` whenever the bundles match, which is always the case after a CI promotion.
- The administrator check (`root`, never `SUDO_USER=vidfetch-deploy`), the lock, the allowed release directories, `trusted()` on the record and the manifest, and the post-restore health checks.
- The CI promoter, its rule `Engine/gateway artifact changed; separate administrator review required`, `dispatch.py`, `release-lib.py` and the CI sudoers, which still names `promote.py` only.

**Reviewing the diff.** Use `git diff -w deploy/ovh/ci/rollback.py`:
- the original statements only moved into `main()`;
- the only removed line is the literal promoter path, now the `HELPER` constant;
- the new code is `ready_state()`, `running_bundle()`, `incompatibility()` and the three lines that call them.

## 3. Installation: `12-rollback-helper.sh`

The helper is installed by `deploy/ovh/ci/install.py` only, so nothing replaced it until now. `12-rollback-helper.sh` is modelled on `09-ci-helper.sh`.

| Command | Effect |
|---|---|
| `check` | Read-only. Shows both fingerprints and whether they differ, and checks that the CI sudoers does not name the helper. |
| `install` | Refuses, with nothing changed, if any of these holds: <ul><li>the CI sudoers names the helper, or cannot be read;</li><li>the new `rollback.py` does not parse;</li><li>it lost the administrator check or the guard;</li><li>the installed promoter lacks `command()`/`trusted()`.</li></ul> Otherwise it: <ol><li>keeps the current helper in `/var/backups/vidfetch-rollback-helper-<UTC>.XXXXXX/` (root, 0700), checked byte for byte;</li><li>installs the new one (root, 0755, atomic `mv`);</li><li>checks it is in place and parses.</li></ol> If that check fails, the previous helper is put back at once. |
| `restore` | Puts back the helper of the latest backup. It accepts only a dated directory created by `install` directly in `/var/backups`. The replaced helper is kept as `rollback.py.replaced`. On failure, the replaced helper is put back. |

**What it never does:**
- restore a release or restart anything;
- read or print a secret;
- touch `ready`, the guard, Caddy, nftables or SSH;
- remove anything recursively.

`send-to-vps.sh` now also ships `deploy/ovh/ci/rollback.py` to `~/media-test-stage/rollback.py`, covered by `SHA256SUMS.toolkit`, next to `promote.py`.

### Procedure (each step authorized separately)

1. Merge this PR, CI validation, then `send-to-vps.sh` from `main`.
2. On the VPS: `cd ~/media-test-stage/admin && sudo bash 12-rollback-helper.sh check`.
   - Expected: `installed: 76bb56b6…`, `differs`, "the CI account cannot run it".
3. `sudo bash 12-rollback-helper.sh install`.
   - Then `check` must report `identical`.
4. Production checks right after:
   - `ready`, the profile, the guard, Caddy, the nftables rules, SSH and the PIDs are unchanged (only a file under `/usr/local/libexec/vidfetch-ci/` changed);
   - the guard does not list the CI helpers: `install.py` computed it before installing them, and `09-ci-helper.sh install` already replaced `promote.py` without touching it;
   - `sha256sum /usr/local/libexec/vidfetch-ci/{promote,rollback}.py` gives `54f217fa…` (unchanged) and the new helper.
5. To go back: `sudo bash 12-rollback-helper.sh restore`.
   - `sha256sum` must give `76bb56b6…` again.

## 4. Tests

### `deploy/ovh/tests/test_rollback_guard.py`: 20 tests, using the real promoter and its release library

**The five situations:**
1. `ready=1`, compatible release → restored.
2. `ready=1`, older gateway → refused. Older engine → refused.
3. `ready=0`, incompatible release → restored as before.
4. Interrupted promotion (`pending.json`), `ready=1`:
   - compatible → recovered, `recovered-*.json`;
   - incompatible → refused, `pending.json` kept, then recovered after `ready=0`.
5. `ready` in an unknown state, nine cases:
   - absent;
   - missing file;
   - symlink;
   - not root-owned;
   - not text;
   - `0` then `1`;
   - `1` then `0`;
   - `yes`;
   - ` 0`.

   Each case refuses an incompatible release, never a compatible one. Recovery succeeds once `ready=0` is confirmed. Two `0` lines count as closed.

**Metadata read errors (nine cases):**
- manifest not JSON;
- manifest without `files`;
- manifest whose `files` is not a mapping;
- `systemctl` failing;
- `systemctl` timing out;
- missing bundle;
- unit without a process;
- unreadable `/proc`;
- restart pending.

Each one refuses while downloads are not closed and **never blocks** the `ready=0` recovery.

**The installed helper (fixture `76bb56b6…`):** it restores the older-gateway release with `ready=1`, and the guarded one refuses it.

**Protections that still hold:**
- non-root and the CI account refused;
- lock held;
- unexpected path;
- failed restoration keeps `pending.json`;
- sudoers names `promote.py` only;
- `dispatch.py` and the workflow do not reference `rollback.py`;
- promoter rule unchanged;
- the lines the installer checks exist in the helper.

**No secret is printed:** a canary in `web.env` never appears in the output.

### `deploy/ovh/tests/rollback-helper.test.sh` (Docker, root): 30 checks

Starts from the real installed helper (fixture):
- `check` is read-only;
- 8 `install` refusals, each with nothing changed and no backup;
- path safety: empty path, `/etc/passwd`, `..`, and the overrides outside the tests;
- failed install → the VPS helper stays byte for byte;
- install, with backup 0700 and helper 0755, and no `__pycache__` or `.next`;
- idempotent install;
- CI sudoers and promoter untouched;
- failed restore → the guarded helper stays;
- restore → the helper is back byte for byte;
- idempotent restore;
- reinstall;
- `restore` refuses a backup outside `/var/backups`, a foreign directory, an unparsable copy, and no backup at all.

### `send-to-vps.test.sh`

`rollback.py` arrives byte-identical and covered by the checksums.

## 5. Remaining risks

- **`ready=0` is trusted as stated.** That is the requested emergency path. If the file says `0` while a frontend still offers downloads, which `set-ready.sh` prevents, the restoration is not checked.
- **Pre-existing behaviour kept with `ready=0`:** a release whose manifest is not JSON is switched to, then the health check fails without restoring anything. With `ready≠0` it is now refused before any change.
- **No lock shared with the administrator toolkit.**
  - `rollback.py` keeps only the promoter lock, so that a stuck toolkit operation never blocks an emergency recovery.
  - Do not run it concurrently with `11-downloads.sh` or `08-gateway.sh`.
- **The guard reads the bundles before the switch.** A gateway restarted on another bundle in between is not seen. `08-gateway.sh` refuses while downloads are open (PR #16), which closes that window when `ready=1`.
