# Reviewed engine change (PR B): specification

**Status: specification and tests only.** The tests in this branch describe the expected behaviour and **fail until the implementation exists**. Nothing here changes the engine, the gateway, production, the CI promoter or its account. Implementation needs the owner's authorization.

**Why.** Every planned engine change needs a reviewed path to production:
- PR #7 (error classification);
- the platform registry (PR C) and the short-link resolver (PR D);
- each new platform (PR F1, F2…).

Today the CI promoter refuses any release whose engine or gateway changed, and **that refusal stays**. PR #16 adds the reviewed path for the **gateway** only (`activate-reviewed.py` plus `08-gateway.sh`). This PR adds the same for the **engine**.

**Not covered:** the yt-dlp, ffmpeg and Node binaries (`/opt/vidfetch/tools`). They change through their own reviewed procedure: pinned binary, official checksum, tests.

## 1. Facts the design depends on

Each fact is read from the repository. Each is re-checked read-only at W0 (§4) before any window.

| # | Fact | Source | Consequence |
|---|---|---|---|
| F1 | Engine and gateway run from `/opt/vidfetch/releases/<dir>`, not from the frontend release pointer. | `08-gateway.sh` header; `backend/preproduction/ovh/vidfetch.service` | A new frontend release does not move them: each one is upgraded by its own script. |
| F2 | `vidfetch.service` runs with:<br>- `User=vidfetch-worker`, `NoNewPrivileges=true`, `CapabilityBoundingSet=`;<br>- `BindsTo=vidfetch-egress.service` and `EnvironmentFile=/etc/vidfetch/worker.env`;<br>- a listener on `127.0.0.1:8788`. | engine unit template, `backend/ovh/main.ts` | The upgrade must check uid, privileges and listener, not only "it answers". |
| F3 | At every health call, the engine re-checks its isolation and reports `engine.isolationProfile = "vidfetch-uid-nft-v1"`. The check covers:<br>- `/etc/vidfetch/isolation.json` (root-owned);<br>- its own uid, `CapEff=0` and `NoNewPrivs=1`;<br>- the hash of the nft rules file;<br>- no cookie or proxy variable. | `backend/ovh/isolation.ts` | The health answer is an isolation proof. A bundle that fails it must be rolled back. |
| F4 | **The gateway unit has `Requires=vidfetch.service` and `After=vidfetch.service`.** | gateway unit read on the VPS on 13/10, reproduced in `gateway-upgrade-systemd.test.sh` | **Stopping or restarting the engine stops or restarts the gateway.** An engine change always gives the gateway a new PID. The procedure restarts the gateway explicitly on its **unchanged** bundle and verifies it. Unit files are not modified. |
| F5 | `08-gateway.sh` refuses unless the running engine is the engine of the active release. | `08-gateway.sh` `blocker()` | When both bundles change, **the engine goes first**. |
| F6 | `11-downloads.sh open` and `set-ready.sh 1` refuse if the engine **or** the gateway in service is not the active release's (manifest, process, ctime). | `common.sh` `release_drift` (PR #16) | Downloads cannot reopen before both follow. Nothing to add there. |
| F7 | With `ready=1`, the PR #17 guard in `rollback.py` refuses a release whose engine or gateway differs from those in service. | `deploy/ovh/ci/rollback.py` (PR #17) | Same protection for a frontend rollback after an engine change. |
| F8 | The engine bundle is deterministic: `node backend/ovh/build.mjs /tmp/e.cjs`. | rebuilt three times on 21/10: `fa0d3d4e…` = production | `ENGINE_SHA256` can be rebuilt independently by the administrator, like `GATEWAY_SHA256`. |

## 2. Invariants

These extend I1–I7 of `docs/VIDFETCH-ACTIVATION-REVUE.md`.

| # | Rule |
|---|---|
| E1 | **Downloads are open only if the frontend, engine and gateway come from the same release.** Every engine change happens with `ready=0`. |
| E2 | The new engine is the one the administrator **rebuilt independently**: `ENGINE_SHA256` = manifest = extracted file = installed file. |
| E3 | The isolation does not change:<br>- same uid (`vidfetch-worker`), `NoNewPrivs=1`, `CapEff=0`;<br>- `isolationProfile` reported;<br>- byte-identical: `worker.env`, `isolation.json`, the engine unit file, the nft ruleset (dynamic set elements excluded);<br>- the engine listens on `127.0.0.1:8788` only. |
| E4 | Only the engine and the gateway restart (F4):<br>- the gateway restarts on **the same bundle** as before;<br>- frontend, Caddy and SSH keep their PIDs;<br>- `gateway.env`, `web.env`, Caddy, `sshd_config` and the secrets are unchanged. |
| E5 | No operation is cut:<br>- downloads are closed;<br>- no established connection on 8788 or 8789;<br>- no `yt-dlp`, `ffmpeg` or `ffprobe` process;<br>- the gateway queue is empty (signed `/auth/deployment`: `active=False waiting=False`). |
| E6 | Any failed verification, or an interruption (SIGTERM, SIGINT, SIGHUP) before the end of the settling period, rolls back automatically to the previous engine bundle, then verifies the restoration. |
| E7 | One operation at a time: the toolkit lock is shared with `08-gateway.sh`, `11-downloads.sh` and `set-ready.sh`. |
| E8 | No secret appears in the output, the journal or the records. Backups are root-only (`0700`). |
| E9 | The CI is unchanged:<br>- the promoter rule and `ENGINE_FILES` stay as they are;<br>- the CI account cannot run either tool (absent from `install.py`, `dispatch.py` and the sudoers). |

## 3. Components

### B1. `activate-reviewed.py`: optional fifth argument `ENGINE_SHA256`

```sh
sudo python3 activate-reviewed.py check|activate SHA ARCHIVE_SHA256 GATEWAY_SHA256                # unchanged: gateway only
sudo python3 activate-reviewed.py check|activate SHA ARCHIVE_SHA256 GATEWAY_SHA256 ENGINE_SHA256  # new
```

**With five arguments:**
- Both fingerprints are always given, even for a bundle that does not change. The administrator states the whole expected pair, with no default.
- The release gateway = `GATEWAY_SHA256` = the extracted file. The release engine = `ENGINE_SHA256` = the extracted file.
- At least one of the two bundles differs from the active release. Otherwise: "use the CI promoter".
- The engine and the gateway in service are those of the active release (no drift beforehand).
- `activate` requires downloads to be closed. `check` does not.
- Everything else is unchanged:
  - the promoter's archive checks, lock, guard, health and origin checks, and switch;
  - `pending.json` and `previous.json`;
  - the infrastructure compared before and after, including both bundles in service and the protected PIDs. The frontend switch never restarts the engine.
- The record also carries:
  - `engine_sha256`, the reviewed engine. With four arguments it is still the engine in service, which then equals the release's;
  - `engine_in_service`, `engine_changed` and `gateway_changed`.
- The next steps printed after `ACTIVATED` depend on what changed:
  1. `13-engine.sh check|upgrade <ENGINE>`, only if the engine changed;
  2. `08-gateway.sh check|upgrade <GATEWAY>`, only if the gateway changed;
  3. reconcile the guard;
  4. `11-downloads.sh open`.

**With four arguments:** exactly today's behaviour. An engine change is still refused ("engine bundle changed: not covered by this review"), and the message now names the five-argument form.

### B2. `13-engine.sh check | upgrade | rollback` (new, mirrors `08-gateway.sh`)

```sh
sudo bash 13-engine.sh check    ENGINE_SHA256   # read-only report and verdict
sudo bash 13-engine.sh upgrade  ENGINE_SHA256   # one controlled stop/start of the engine (and therefore of the gateway, F4)
sudo bash 13-engine.sh rollback                 # back to the drop-in state saved by upgrade
```

**Preconditions, shared by check and upgrade.** The first one that fails is printed:
1. `ENGINE_SHA256` is 64 hexadecimal characters.
2. `<active release>/backend/vidfetch-ovh.cjs` is root-owned and not writable by others, and has `ENGINE_SHA256`. The manifest lists the same value.
3. The **gateway in service** is the gateway of the active release **or** of `previous.json`; any other bundle is refused. With both bundles changing, the old gateway is still running at this point.
4. Both units are active. The engine unit file, `worker.env` and `isolation.json` are root-owned and not writable by others; the content of the last two is never printed.
5. The engine `ExecStart` names exactly one `.cjs`, and the engine process runs it (`/proc/<PID>/cmdline`).
6. The engine process already meets E3: it runs as `vidfetch-worker`, with `NoNewPrivs=1` and `CapEff=0`. A sound starting state is required. A stray drop-in such as `User=root` is refused before anything changes, not discovered after.

**upgrade only:**
- `ready=0`; a missing or unreadable value counts as open;
- toolkit lock held;
- no dead-man timer armed;
- idle as defined in E5.
  - Node's HTTP keep-alive leaves a socket between the gateway and the engine open for up to 5 s after a request. The connection check on 8788 is therefore retried for up to 10 s before refusing.
  - A connection still open after that is real activity.

**Interface details fixed by the tests:**
- **Output:** the same probe lines as `08-gateway.sh` (`engine_health=… ok=… isolation=…`, `alive=…`, `deployment_signed=…`, `deployment_unsigned=…`).
- **Verdicts:** `VERDICT: upgrade needed and possible`, `already is the expected bundle`, `nothing to do`, `UPGRADED`, `FAILED:`, `ROLLBACK VERIFIED`.
- **Test overrides:** `VM_ENGINE_SETTLE` (settling time) and `VM_PREVIOUS` (`/opt/vidfetch-ci-web/previous.json` by default), in addition to the `VM_*` variables of `common.sh` and `08-gateway.sh`.

**Steps:**
1. **Backup** in `/var/backups/vidfetch-engine-upgrade-<UTC>.XXXXXX` (`0700`), pointed to by the link `vidfetch-engine-upgrade-latest`. It holds:
   - the engine unit and the state of its drop-in directory;
   - `worker.env` and the directory of the engine bundle in use;
   - the gateway's bundle path and SHA-256;
   - the quota ledger, copied while the gateway is stopped;
   - `before.txt` (PIDs, ExecStart) and `MANIFEST.sha256`.
2. **New bundle** in `/opt/vidfetch/releases/engine-<16 hex>/vidfetch-ovh.cjs`:
   - written root `0644` through `.new`, then `mv`;
   - an existing file with other content is refused, never overwritten;
   - `node --check` must pass.
3. **Drop-in** `vidfetch.service.d/20-engine-release.conf`: the unit's own `ExecStart` with only the bundle path replaced.
4. `daemon-reload`, then:
   - stop the gateway, stop the engine, copy the ledger;
   - `reset-failed` both units;
   - start the engine and wait for its health;
   - start the gateway and wait until it answers.
5. **Verification.** Anything wrong rolls back automatically (E6):
   - **Engine process:** a new PID, `cmdline` = new bundle, uid = `vidfetch-worker`, `NoNewPrivs=1`, `CapEff=0`.
   - **Engine answer:** `engine_health=200 ok=True isolation=vidfetch-uid-nft-v1`; listener `127.0.0.1:8788` only.
   - **Gateway process:** a new PID (F4), running **the same path and SHA-256** as before.
   - **Gateway answer:**
     - `alive=True`;
     - `deployment_signed=200 draining=False active=False`, with `deployment_unsigned` 401 or 403;
     - `helper_fr=200`, `unknown_path=404`, `fetch_info_anonymous` 401 or 403;
     - listener `127.0.0.1:8789` only.
   - **Files identical** (content, owner, mode): `worker.env`, `isolation.json`, `gateway.env`, both unit files, the old release directory.
   - **Network and other services:** the nft ruleset hash is identical (dynamic elements excluded); the frontend, Caddy and SSH PIDs are unchanged.
   - **Settling:** after `SETTLE` seconds (12 by default), neither process has restarted.
6. **Printed output:**
   - the guard commands, to run only once satisfied: `guard-update.py add <drop-in> <new bundle>`;
   - the next step, `08-gateway.sh upgrade`, if the gateway changes too;
   - the rollback command.

**rollback:**
- **Refuses if:**
  - downloads are open;
  - the system is not idle;
  - the backup fails its integrity check;
  - **the gateway in service is not the one recorded in the backup**, meaning `08-gateway.sh upgrade` ran after this engine upgrade. Run `08-gateway.sh rollback` first, so the order is always the reverse of the upgrade.
- **Restores:**
  - this script's drop-in: the saved one, or none (removed by name; the directory is removed only if this script created it and it is empty);
  - `worker.env` from the backup.
- **Then:** stop the gateway, stop the engine, start the engine, start the gateway.
- **Verifies:**
  - the engine runs the previous path and SHA-256, with the same isolation checks as the upgrade;
  - the gateway runs the bundle recorded in the backup;
  - the files are byte-identical to the backup.

**Path safety:** the same rules as `08-gateway.sh`, so `${VAR:?}`, exact expected paths, files named one by one, no `rm -rf`, and a test with empty and invalid paths.

## 4. Maintenance window (engine and gateway changing together)

Downloads are closed for about 12 minutes. The site and the SEO pages stay online, because only the engine and the gateway restart.

| Step | Command (VPS, `~/media-test-stage/admin`) | Expected |
|---|---|---|
| W0 | reference state + read-only confirmation of F1–F4 (unit files, `Requires=`, drop-in directories) | equal to the last reading |
| W1 | `11-downloads.sh close`, then `guard-update.py accept /etc/vidfetch/web.env` | `ready=0`, `public` profile, guard N/0 |
| W2 | `activate-reviewed.py check <SHA> <ARCHIVE> <GATEWAY> <ENGINE>` | `CHECKED`; nothing switched |
| W3 | `activate-reviewed.py activate …` (same five arguments) | `ACTIVATED`; old engine and old gateway still running; downloads closed |
| W4 | `13-engine.sh check <ENGINE>`, then `upgrade <ENGINE>` | `UPGRADED`; new engine; gateway restarted on its unchanged bundle |
| W5 | `08-gateway.sh check <GATEWAY>`, then `upgrade <GATEWAY>` (only if the gateway changes) | `UPGRADED`; the engine is not restarted |
| W6 | `guard-update.py add` for both drop-ins and both bundles | guard N+4/0 (or N+2/0) |
| W7 | `11-downloads.sh open`, then `guard-update.py accept /etc/vidfetch/web.env` | refused if W4 or W5 was skipped; otherwise `ready=1`, `public-downloads` |
| W8 | real tests (MP4 and MP3 per validated platform), monitoring, leak scan | no 5xx, no secret, quota +N |

**Rollback, always in the reverse order, with downloads closed:**

| Situation | Sequence |
|---|---|
| Failure in W4 | automatic (E6); then `rollback.py` (frontend); then `open` |
| Failure in W5 | `08-gateway.sh` rolls back by itself; then `13-engine.sh rollback`; then `rollback.py`; then `open` |
| Problem after W7 | 1. `close`<br>2. `08-gateway.sh rollback`<br>3. `13-engine.sh rollback`<br>4. `rollback.py`<br>5. restore the guard backup<br>6. `open` |

At every step `open` refuses until the frontend, engine and gateway match again (F6).

## 5. Tests

### Written in this branch (red until the implementation exists)

**`deploy/ovh/tests/test_activate_reviewed_engine.py`** reuses the harness of `test_activate_reviewed.py`: the real promoter, with `systemctl`, `nft` and `/proc` simulated. It covers:
- **Success:**
  - engine only: `check` and `activate`, the record, the next steps;
  - engine and gateway together: the order printed (engine first).
- **Refusals, nothing changed:**
  - wrong engine fingerprint, and the right fingerprint but a tampered file;
  - nothing changed (back to the CI);
  - engine drift beforehand;
  - downloads open;
  - malformed fifth argument;
  - a gateway fingerprint that is not the release's when only the engine changes.
- **Failure inside the switch:** an engine restarted during the frontend switch is undone by the promoter (code 3).
- **Compatibility:**
  - the four-argument form still refuses an engine change and names the five-argument form;
  - the CI promoter still refuses the release.

**`deploy/ovh/tests/engine-upgrade-systemd.test.sh`** with **`test_engine_upgrade_systemd.py`** runs as an opt-in slow test (`VIDFETCH_SLOW_TESTS=1`). It uses a real systemd under Debian 13 and Node 22, with **the engine and gateway units as on the VPS**, including `Requires=` and the hardening. It covers:
- **check:** read-only; prints no secret.
- **Refusals, nothing changed:**
  - wrong or malformed fingerprint;
  - the release copy differs from the manifest;
  - a third gateway in service;
  - a connection open on 8788 or 8789;
  - a media process running;
  - the dead-man timer armed;
  - downloads open, or `ready` missing;
  - the engine not running as `vidfetch-worker` (stray drop-in).
- **upgrade:**
  - the engine runs the new bundle from its own directory, as `vidfetch-worker`, `NoNewPrivs=1`, `CapEff=0`, with the isolation reported;
  - the gateway is restarted on its unchanged bundle; the "frontend" PID is unchanged;
  - a single drop-in; files identical; backup root-only and complete;
  - no secret in the output or the journal;
  - guard untouched, its command printed;
  - a second run does nothing.
- **rollback:**
  - refused while downloads are open;
  - refused while the gateway is not the one recorded in the backup;
  - otherwise verified, with every file byte-identical.
- **Automatic rollback:**
  - a bundle that exits at start;
  - a bundle that answers without the isolation proof;
  - SIGTERM during the settling period.

  A bundle cannot change its own uid (`NoNewPrivileges`, no capability). The uid case is therefore a precondition refusal, not a rollback.

**Current state of these tests** (21/10, before any implementation):

| Suite | Result |
|---|---|
| `test_activate_reviewed_engine.py` | 16 tests: 14 fail on "usage: … GATEWAY_SHA256" or on the missing `ENGINE_SHA256` mention. 2 already pass and must stay green: the CI promoter still refuses the release; a malformed fifth argument is refused. |
| `test_engine_upgrade_systemd.py` | 4 source tests fail on "13-engine.sh is not implemented yet"; the systemd test is skipped without `VIDFETCH_SLOW_TESTS=1`. |
| `engine-upgrade-systemd.test.sh` | stops at its first line (`not ok - 13-engine.sh is not implemented yet`, exit 1), before any container. Its syntax was checked with `dash -n`. |
| `test_activate_reviewed.py` (PR #16) | 44 tests, still all green. |

**This branch must not be merged as it is.** The implementation (B1 and B2) comes in the same PR, and every test is green before the merge request.
- **Neighbours:** another drop-in in `vidfetch.service.d` is preserved.

### Mutations to run on the implementation (target: all caught)

**`activate-reviewed.py`:**
1. remove the `ENGINE_SHA256` comparison with the manifest;
2. remove the comparison with the extracted file;
3. remove the "at least one bundle changes" rule;
4. remove the engine drift check;
5. allow an engine change in the four-argument form.

**`13-engine.sh`:**
1. remove the `ready=0` requirement;
2. remove the idle check;
3. remove the uid / `NoNewPrivs` / `CapEff` check;
4. remove the isolation proof check;
5. accept a gateway restarted on another bundle;
6. remove the file comparison;
7. remove the automatic rollback on SIGTERM;
8. remove the gateway-order check in `rollback`;
9. overwrite an existing bundle directory.

## 6. Questions for the owner (before implementation)

1. **F4, the gateway restart.** I recommend accepting that an engine change also restarts the gateway, during the window and with downloads closed. The alternative is changing the gateway unit (`Requires=` → `Wants=`), which touches a protected unit for little gain.
2. **Engine settling time.** 12 s, as for the gateway, or longer? The engine is checked through its health answer only.
3. **Old bundle directories** under `/opt/vidfetch/releases/` are never removed automatically. Pruning stays a separate, manual and named operation.
4. **W0 confirmation.** One read-only reading of the two unit files on the VPS (`systemctl cat`), to confirm F2 and F4 before implementation.
