# Administrator-reviewed activation of a new gateway bundle

The CI promoter (`deploy/ovh/ci/promote.py`) refuses, on purpose, any release whose engine or gateway bundle differs from the active release:

> `Engine/gateway artifact changed; separate administrator review required`

**This refusal stays.** `activate-reviewed.py` is that separate review. Only an administrator can run it, it applies to the gateway only, and it is surrounded by two checks added to the existing scripts:
- `08-gateway.sh` changes the gateway only while downloads are closed;
- `11-downloads.sh open` refuses as long as the engine or gateway in service does not belong to the active release;
- `set-ready.sh 1` applies the same refusal, even when it is called directly rather than through `11-downloads.sh`. `set-ready.sh 0` is never blocked: closing must always be possible.

**What "in service" means.** It is the bundle that each unit's **main process** executes, not only the one its configuration names. All three conditions must hold, otherwise opening is refused:
- the unit has a running process;
- that process runs the `.cjs` file named in `ExecStart` (`/proc/<PID>/cmdline`);
- the file has not changed since that process started (`ctime` ≤ start + 2 s, since both clocks are rounded down).

So a unit edited, or a bundle rewritten, without a restart is refused until the service is restarted. `activate-reviewed.py` and `rollback.py` (separate PR) already compared the process; the shell check now does too.

## 1. Invariants

| # | Rule | Enforced by |
|---|---|---|
| I1 | **Downloads are open only if the frontend, engine and gateway come from the same release.** A new frontend never runs with an older gateway while downloads are open. | `activate-reviewed.py` (refuses if downloads are open); `08-gateway.sh upgrade` and `rollback` (same); `11-downloads.sh open` and `set-ready.sh 1`, even called directly (both refuse on any difference between the bundles in service and the active release manifest) |
| I2 | The CI promoter is neither modified nor bypassed; the CI account cannot run the tool. | unchanged promoter (test); tool refuses `SUDO_USER=vidfetch-deploy`, `USER=vidfetch-deploy` and the CI forced command; absent from the CI's `install.py`, `dispatch.py` and sudoers |
| I3 | The new gateway is the one the administrator **rebuilt independently**. | `GATEWAY_SHA256` = manifest = file extracted from the archive |
| I4 | Engine, secrets, network rules, Caddy, SSH and protected services are unchanged. | engine: new manifest = active manifest = process in service; guard (env files, units) before and after; Caddy (pointer and file), nftables rules, `sshd_config`, protected PIDs and both bundles in service identical after the switch, otherwise automatic rollback |
| I5 | Commit, archive, manifest and active version are consistent. | commit = `release` in the manifest (promoter's `extract_checked`); archive = CI checksum; after the switch the frontend must report this release (`wait_health`) |
| I6 | One operation at a time, recorded. | promoter lock and admin toolkit lock; JSON record `/opt/vidfetch-ci-web/reviewed/*.json` (root, 0600, no secret) |
| I7 | Reliable rollback. | promoter's own switch (`pending.json` then `previous.json`): `rollback.py` restores the previous release; a restoration that cannot be validated leaves `pending.json` and blocks any new operation until `rollback.py` |

## 2. Usage

```sh
cd ~/media-test-stage/admin
sudo python3 activate-reviewed.py check    <SHA> <ARCHIVE_SHA256> <GATEWAY_SHA256>   # every check, release extracted, no switch
sudo python3 activate-reviewed.py activate <SHA> <ARCHIVE_SHA256> <GATEWAY_SHA256>   # same, then the switch
```

| Input | Where it comes from (independently) |
|---|---|
| `SHA` | the commit merged into `main` (`git rev-parse origin/main`) |
| `ARCHIVE_SHA256` | `gh run download <build> -n release-<SHA>` then `sha256sum release-<SHA>.tgz` on the administrator's machine |
| `GATEWAY_SHA256` | `git worktree add /tmp/vf <SHA> && cd /tmp/vf && npm ci && node backend/gateway/build.mjs /tmp/g.cjs && sha256sum /tmp/g.cjs`. The build is deterministic: `main` rebuilds exactly the production bundle `0fa14045…` |

**Exit status = the state actually reached.** It is also written in the record (`exit_code`).

| Code | State | What to do |
|---|---|---|
| 0 | `check`: everything verified, nothing switched. `activate`: new release active and re-checked | continue the plan |
| 1 | refused, nothing switched: arguments, access, a lock held (concurrent operation), any pre-check, or an interruption before the switch | read the reason |
| 2 | activated, but the final re-check failed or was interrupted; the new release stays active, nothing undone | downloads stay closed; inspect; to go back, `rollback.py` |
| 3 | failed during the switch; the promoter's own rollback restored the previous release and validated it | downloads stay closed; fix the cause, re-run |
| 4 | failed, restoration **not** validated: `pending.json` kept, or another release active; also any unexpected error | downloads stay closed; inspect, then `rollback.py`; every new operation is refused until then |

The code is read from the promoter's own state (`pending.json`, the `current` pointer), not from the error message. While the record is written, interruptions are ignored, so they can neither lose the record nor change the code.

**How the archive reaches the VPS.** It is transferred by the CI with `operation=verify -f artifact_run_id=<build>`, which places it in `/var/lib/vidfetch-deploy/ci-incoming/`. The promoter's verification then reports `Engine/gateway artifact changed…`, and the CI run fails. **That is expected**: it is the lock doing its job.

## 3. Tests

**`deploy/ovh/tests/test_activate_reviewed.py`: 44 tests.** They use the real promoter and its archive library; only `systemctl`, `nft`, `/proc` and the HTTP checks are simulated.

- **Success**
  - check without switching (allowed even with downloads open);
  - activation: switch, `previous.json` for `rollback.py`, record 0600 in a 0700 directory;
  - idempotent re-run;
  - dynamic set elements are ignored;
  - no secret in the output or the record.
- **Refusals, nothing changed**
  - wrong gateway fingerprint;
  - **modified manifest** (announced file ≠ delivered file);
  - archive without the CI checksum;
  - release id ≠ commit;
  - engine changed;
  - gateway unchanged (back to the CI);
  - downloads open (5 combinations of `ready` and profile);
  - gateway in service ≠ active release;
  - process ≠ its unit (restart pending);
  - **service unavailable**;
  - unfinished promotion (`pending.json`), then **resumption after `rollback.py`**;
  - different release already present;
  - **concurrent operation** (each of the two locks);
  - non-administrator (3 cases);
  - malformed arguments.
- **Failures after the switch: automatic restoration of the previous release (code 3)**
  - frontend not ready;
  - nftables rules modified;
  - Caddy modified;
  - protected service restarted;
  - downloads reopened during the activation;
  - **interrupted activation** (SIGTERM), then a successful re-run;
  - restoration that cannot be validated (code 4): `pending.json` kept and a new run refused until `rollback.py`;
  - restart of the previous release failing during the restoration (code 4, `pending.json` kept);
  - switch unable to record its predecessor (`previous.json`) after the new release passed (code 4);
  - another release active after a failure (code 4).
- **State transitions:**
  - an interruption during the pre-checks is a refusal, recorded, nothing changed;
  - inside the switch, an interruption is undone by the promoter;
  - once switched, interruptions are ignored, nothing is undone automatically, and a failed final re-check is reported as such ("activated; final re-check FAILED", code 2, `rollback.py` named), never as a rollback;
  - an interruption between the end of the switch and the final re-check: code 2, release active, `previous.json` written;
  - a second run started during the switch is refused (lock) and the first one completes;
  - the record is written with interruptions ignored, and carries the code;
  - command line: malformed arguments and a non-root run exit with 1 (`REFUSED`);
  - re-running on the active release is refused;
  - every run keeps its own record, even within one second.
- **Lock unchanged:** the CI promoter still refuses this release, and its rule and its list are identical.

**Mutations: 14 out of 14 caught.** The tests fail if one removes:
- the fingerprint comparison;
- the engine check;
- the "downloads closed" requirement;
- the infrastructure comparison;
- the refusal of the CI account;
- the gateway drift check;
- interruptions being ignored once the switch is done;
- the refusal of an already active release;
- `pending.json` meaning "not validated" (code 4);
- the "another release active" case (code 4);
- code 2 for an interruption after the switch;
- the exit status instead of re-raising;
- interruptions ignored while the record is written;
- the code in the record.

**Shell scripts:**
- `public-downloads.test.sh`:
  - `11-downloads.sh open` refuses with an older gateway, and with a foreign engine;
  - `set-ready.sh 1` called directly refuses an older gateway: `ready` stays 0, nothing restarted, no backup written;
  - `set-ready.sh 0` is never blocked by a difference;
  - the process, not only the unit (fake `/proc`), each refused with its reason:
    - the gateway process still runs another bundle than the one its unit names;
    - the engine bundle was rewritten after its process started;
    - the gateway has no process;
    - the engine start time cannot be read;
  - a bundle written within the 2 s tolerance is accepted;
  - `set-ready.sh 1` called directly refuses a pending restart, while `set-ready.sh 0` and `11-downloads.sh close` still work during it;
  - `08-gateway.sh upgrade` and `rollback` refuse while downloads are open, with nothing touched;
  - a missing `ready` counts as open.
- `gateway-upgrade-systemd.test.sh` (real systemd, Debian 13): refusals with `ready=1` before the upgrade and before the rollback; the upgraded gateway keeps running untouched.
- `caddy-window-systemd.test.sh` (real systemd and Caddy): the engine and gateway units name their bundles and run them, as on the VPS. `11-downloads.sh open` and `set-ready.sh 1` both refuse in three cases:
  - an older gateway;
  - a new `ExecStart` (drop-in plus `daemon-reload`) with no restart;
  - the bundle rewritten in place, with the same bytes, after the process started.

  `set-ready.sh 0` still works during these differences. After a restart, the opening succeeds.

## 4. Deployment plan: gateway first, then frontend

### Prerequisites (each one authorized)
1. **D3**: browser tests of the current production (TikTok MP4/MP3, tokens, YouTube refusal), recorded with timestamps.
2. **D4**: `guard-update.py accept /etc/vidfetch/web.env`, guard at 19/0.
3. Merge **this PR**, CI validation, then `send-to-vps.sh` from `main` to the staging directory.
   - Only `activate-reviewed.py`, `08-gateway.sh`, `11-downloads.sh` and `common.sh` change.
   - No installation, no restart.
4. Merge **PR #15** (direct download), then CI build (`push` run, deploy skipped since `VIDFETCH_DEPLOY_ENABLED=false`).
5. Independent inputs (§2): `SHA`, `ARCHIVE_SHA256` from the downloaded artifact, `GATEWAY_SHA256` rebuilt (expected `4718ed7e…` for PR #15).
6. Transfer: `gh workflow run deploy.yml --ref main -f operation=verify -f artifact_run_id=<build>`. The archive reaches the VPS and the promoter refuses (expected).

### Maintenance window (downloads closed, about 10 minutes, site and SEO still online)

**Readings:** "same release" means the bundles in service equal those of the active release manifest.

| Step | Command (VPS, `~/media-test-stage/admin`) | Production check right after | Expected |
|---|---|---|---|
| W0 | reference state | — | equal to the D4 state |
| W1 | `sudo bash 11-downloads.sh close` then `sudo python3 guard-update.py accept /etc/vidfetch/web.env` | state | `ready=0`, `public` profile, guard 19/0; only the frontend restarted |
| W2 | `sudo python3 activate-reviewed.py check <SHA> <ARCHIVE> <GATEWAY>` | state | `CHECKED`; nothing switched |
| W3 | `sudo python3 activate-reviewed.py activate <SHA> <ARCHIVE> <GATEWAY>` | state + record | `ACTIVATED`; new active release; **old gateway still running, downloads closed** (I1); Caddy, nftables, SSH, engine, gateway, PIDs identical |
| W4 | `sudo bash 08-gateway.sh check <GATEWAY>` then `upgrade <GATEWAY>` | state + `00-preflight.sh` | `UPGRADED`; `helper_fr=200`, `deployment_signed=200`; engine untouched; "gateway: running bundle = release manifest" |
| W5 | `sudo python3 guard-update.py accept /etc/systemd/system/vidfetch-gateway.service.d/20-gateway-release.conf` then `add /opt/vidfetch/releases/gateway-<16>/vidfetch-gateway.cjs` | state | guard 20/0 |
| W6 | `sudo bash 11-downloads.sh open` then `guard-update.py accept /etc/vidfetch/web.env` | state + `seo-check-open.sh` + `verify-outsider.sh --public-dl` (sandbox) | refuses if W4 was not done; `ready=1`, `public-downloads` |
| W7 | real tests: Chrome, Safari, Firefox, then iPhone and Android (direct download, no tab) | monitoring, leak scan | MP4/MP3 OK, no 5xx, no secret |

### Rollback (I1 is kept at every step)

| Situation | Sequence | Why it is safe |
|---|---|---|
| Failure in W3, code 3 | automatic (promoter's switch); then `11-downloads.sh open` | old frontend + old gateway, same release |
| W3 ends with code 2 | downloads stay closed; inspect; `rollback.py` if needed | the new frontend is active; `open` refuses until the gateway follows |
| W3 ends with code 4 | downloads stay closed; inspect; `rollback.py` | every new operation refused while `pending.json` exists |
| Failure in W4 | `08-gateway.sh` rolls back on its own; then `sudo /usr/local/libexec/vidfetch-ci/rollback.py`; then `open` | `open` refuses as long as frontend and gateway differ |
| Problem after W6 | 1. `11-downloads.sh close` 2. `rollback.py` (frontend) 3. `08-gateway.sh rollback` (gateway) 4. restore the guard (`ci-web-test-guard.json.bak.<time>`) 5. `11-downloads.sh open` | downloads closed during every mixed state; `08-gateway.sh rollback` refuses while open; `open` refuses until everything is back on the same release |
| Restoration that cannot be validated (`pending.json`) | downloads stay closed; inspect; `rollback.py` | no new operation possible before that |

**Only partial rollback allowed:** going back on the frontend **and** the gateway together. "Old frontend + new gateway" works technically, but invariant I1 forbids opening downloads in that state.

## 5. Remaining risks
- **`rollback.py` checks nothing about downloads.** It is the installed helper, which this PR does not modify.
  - A separate PR (rollback guard) makes it refuse, unless downloads are confirmed closed, a release whose engine or gateway differs from the ones in service.
  - Until that PR is installed: always close downloads first.
  - If it is run while downloads are open, the old frontend (tab) and the new gateway run together. That works and is not a security problem, but I1 then forbids reopening after a close.
- **CI deployment between W3 and W4.** `VIDFETCH_DEPLOY_ENABLED` stays `false`. And with downloads closed, a frontend cannot use the gateway anyway.
- **Same trust model as the other admin scripts.** The tool runs from `~/media-test-stage/admin` (owned by `debian`) with `sudo`. The promoter it loads, however, must be root-owned and non-writable.
- **Not covered:** a change of **engine** (e.g. PR #7) stays refused; its own procedure is still to be written.
- **Manual:** the window (W1–W6) closes downloads for a few minutes, and the real-device tests of W7 are done by hand.
- **Records:** one JSON file per run under `/opt/vidfetch-ci-web/reviewed/`, never pruned.
- **Upload space:** the archive must fit within the CI upload bound (700 MiB total in `ci-incoming`). Check before the transfer.
