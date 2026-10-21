# Reviewed engine change (PR B): specification v2

**Status, 21/10/2026: v2.**
- v2 records the owner's design decisions (§6) and the read-only reading of the VPS units (21/10, 20:03 UTC, §1).
- **No implementation is authorized yet.** The plan is in `docs/VIDFETCH-MOTEUR-REVUE-PLAN.md`.
- The tests in this branch were written against v1 and fail until the implementation exists. Step 1 of the plan brings them to v2.
- Nothing here changes the engine, the gateway, production, the CI promoter or its account.

**Why.** Every planned engine change needs a reviewed path to production:
- PR #7 (error classification);
- the platform registry (PR C) and the short-link resolver (PR D);
- each new platform (PR F1, F2…).

Today the CI promoter refuses any release whose engine or gateway changed, and **that refusal stays**. PR #16 adds the reviewed path for the **gateway** only (`activate-reviewed.py` plus `08-gateway.sh`). This PR adds the same for the **engine**.

**Not covered:** the yt-dlp, ffmpeg and Node binaries (`/opt/vidfetch/tools`). They change through their own reviewed procedure: pinned binary, official checksum, tests.

## 1. Facts the design depends on

**Confirmed** = read on the VPS on 21/10 at 20:03 UTC (`systemctl cat` and `systemctl show`, read-only). The other rows come from the repository. Every row is re-read at W0 before any window.

| # | Fact | Status | Consequence |
|---|---|---|---|
| F1 | Engine and gateway run from `/opt/vidfetch/releases/<dir>`, not from the frontend release pointer. | **confirmed**: engine in `ovh-20261012-rnllrb69-ipv4/vidfetch-ovh.cjs` (`fa0d3d4e…`, from the unit file itself); gateway in `gateway-0fa1404530c272b7/vidfetch-gateway.cjs`, through the drop-in `20-gateway-release.conf` that `08-gateway.sh` installed on 13/10 | A new frontend release does not move them: each one is upgraded by its own script. `vidfetch.service.d/` does not exist yet, so the first engine upgrade creates it. |
| F2 | `vidfetch.service` runs with:<br>- `User=vidfetch-worker`, `NoNewPrivileges=true`, `CapabilityBoundingSet=`;<br>- `EnvironmentFile=/etc/vidfetch/worker.env`;<br>- a listener on `127.0.0.1:8788`. | **confirmed**; the process (PID 9270) runs as `vidfetch-worker` with `NoNewPrivs=1` and `CapEff=0` | The upgrade checks uid, privileges and listener, not only "it answers". |
| F3 | At every health call, the engine re-checks its isolation and reports `engine.isolationProfile = "vidfetch-uid-nft-v1"`. The check covers:<br>- `isolation.json`;<br>- its uid, `CapEff` and `NoNewPrivs`;<br>- the hash of the nft rules file;<br>- no cookie or proxy variable. | repository (`backend/ovh/isolation.ts`) | The health answer is an isolation proof. A bundle that fails it is rolled back. |
| F4 | **The gateway has `Requires=vidfetch.service` and `After=vidfetch.service`.** The engine shows `RequiredBy=vidfetch-gateway.service`. No other unit depends on the engine. | **confirmed** | **Stopping or restarting the engine stops or restarts the gateway.** Accepted by the owner (§6, decision 1). The procedure restarts the gateway explicitly on its unchanged bundle and verifies it. No unit file is modified. |
| F5 | `08-gateway.sh` refuses unless the running engine is the engine of the active release. | repository | When both bundles change, **the engine goes first**. |
| F6 | `11-downloads.sh open` and `set-ready.sh 1` refuse if the engine or the gateway in service is not the active release's (manifest, process, ctime). | repository (PR #16) | Downloads cannot reopen before both follow. |
| F7 | With `ready=1`, the PR #17 guard in `rollback.py` refuses a release whose engine or gateway differs from those in service. | repository (PR #17) | Same protection for a frontend rollback. |
| F8 | The engine bundle is deterministic: `node backend/ovh/build.mjs /tmp/e.cjs`. | rebuilt three times on 21/10: `fa0d3d4e…` | `ENGINE_SHA256` is rebuilt independently, like `GATEWAY_SHA256`. |
| F9 | **The engine has `Requires=` and `BindsTo=vidfetch-egress.service`.** That oneshot unit runs `egress-control.py start`, and on stop runs `egress-control.py stop`, which **removes the worker's egress policy**. | **confirmed** (new in v2) | **The procedure never stops, restarts or reloads `vidfetch-egress.service`.** Stopping the engine leaves it active (`RemainAfterExit`). The verification requires its `ActiveEnterTimestamp` to be unchanged and the egress rules to be identical. |
| F10 | **`StartLimitBurst=3` within `StartLimitIntervalSec=300`** on the engine and on the gateway. | **confirmed** (new in v2) | One upgrade followed by an automatic rollback is 2 starts per unit, and a crash can add one more. **`reset-failed` before every start**, rollback included, as `08-gateway.sh` already does. Otherwise a third start within 5 minutes would leave the unit stopped. |
| F11 | Restart counters at the time of the reading: engine `NRestarts=1`, gateway `NRestarts=0`. | **confirmed** | The observation (§3 B3) compares `NRestarts` with its own starting value, not with zero. |

## 2. Invariants

These extend I1–I7 of `docs/VIDFETCH-ACTIVATION-REVUE.md`.

| # | Rule |
|---|---|
| E1 | **Downloads are open only if the frontend, engine and gateway come from the same release.** Every engine change happens with `ready=0`. |
| E2 | The new engine is the one the administrator **rebuilt independently**: `ENGINE_SHA256` = manifest = extracted file = installed file. |
| E3 | The isolation does not change:<br>- same uid, `NoNewPrivs=1`, `CapEff=0`;<br>- `isolationProfile` reported;<br>- byte-identical: `worker.env`, `isolation.json`, unit files, the nft ruleset (dynamic set elements excluded);<br>- `vidfetch-egress.service` not stopped (F9);<br>- loopback listeners only. |
| E4 | Only the engine and the gateway restart (F4):<br>- the gateway on **the same bundle**;<br>- frontend, Caddy and SSH keep their PIDs;<br>- `gateway.env`, `web.env`, Caddy, `sshd_config` and the secrets are unchanged. |
| E5 | No operation is cut:<br>- downloads closed;<br>- no established connection on 8788 or 8789 (retried for up to 10 s, because of Node's keep-alive);<br>- no `yt-dlp`, `ffmpeg` or `ffprobe` process;<br>- empty queue (signed `/auth/deployment`: `active=False waiting=False`). |
| E6 | **During the settling period of `upgrade`:** any failed verification, or an interruption (SIGTERM, SIGINT, SIGHUP), rolls back automatically, then verifies the restoration. |
| E7 | One operation at a time: the toolkit lock is shared with `08-gateway.sh`, `11-downloads.sh` and `set-ready.sh`. |
| E8 | No secret appears in the output, the journal or the records. Backups are root-only (`0700`). |
| E9 | The CI is unchanged:<br>- the promoter rule and `ENGINE_FILES` stay as they are;<br>- the CI account can run none of these tools. |
| **E10** | **Observation (decision 2).** Downloads reopen only after **at least 15 minutes** of uninterrupted observation of the processes in service, with the compatibility checks of §3 B3, all green. |
| **E11** | **Old bundles (decision 3).** No tool removes a file or a directory under `/opt/vidfetch/releases/`. Pruning stays a separate, manual and named operation. |

## 3. Components

### B1. `activate-reviewed.py`: optional fifth argument `ENGINE_SHA256` (unchanged since v1)

```sh
sudo python3 activate-reviewed.py check|activate SHA ARCHIVE_SHA256 GATEWAY_SHA256                # unchanged: gateway only
sudo python3 activate-reviewed.py check|activate SHA ARCHIVE_SHA256 GATEWAY_SHA256 ENGINE_SHA256  # new
```

**Rules:**
- Both fingerprints are always given, even for a bundle that does not change. Each must equal the release manifest and the extracted file.
- At least one bundle differs from the active release. Otherwise: "use the CI promoter".
- No drift beforehand: the engine and the gateway in service are those of the active release.
- `activate` requires downloads to be closed.
- Everything else is the promoter's: archive checks, lock, guard, health and origin checks, switch, `pending.json` and `previous.json`, and the infrastructure compared before and after. The frontend switch never restarts the engine.

**Record:**
- `engine_sha256`, the reviewed engine;
- `engine_in_service`, `engine_changed` and `gateway_changed`.

**Next steps printed** after `ACTIVATED`:
1. `13-engine.sh`, if the engine changed;
2. `08-gateway.sh`, if the gateway changed;
3. `13-engine.sh observe`;
4. guard reconciliation;
5. `11-downloads.sh open`.

**Four arguments:** today's behaviour. An engine change is refused, and the message names the five-argument form.

### B2. `13-engine.sh check | upgrade | rollback` (mirrors `08-gateway.sh`)

```sh
sudo bash 13-engine.sh check    ENGINE_SHA256   # read-only report and verdict
sudo bash 13-engine.sh upgrade  ENGINE_SHA256   # controlled stop/start of the engine, therefore of the gateway (F4)
sudo bash 13-engine.sh rollback                 # back to the state saved by upgrade
```

**Preconditions, shared by check and upgrade.** The first one that fails is printed:
1. `ENGINE_SHA256` is 64 hexadecimal characters.
2. `<active release>/backend/vidfetch-ovh.cjs` is root-owned and not writable by others, and has `ENGINE_SHA256`. The manifest lists the same value.
3. The gateway in service belongs to the active release or to `previous.json`. Any third bundle is refused.
4. Engine, gateway and `vidfetch-egress.service` are active. The engine unit, `worker.env` and `isolation.json` are root-owned and not writable by others; their contents are never printed.
5. The engine `ExecStart` names exactly one `.cjs`, and the process runs it.
6. The engine process already meets E3: `vidfetch-worker`, `NoNewPrivs=1`, `CapEff=0`. A stray drop-in is refused before anything changes.

**upgrade only:**
- `ready=0`; a missing or unreadable value counts as open;
- toolkit lock held;
- no dead-man timer armed;
- idle (E5).

**Steps:**
1. **Backup** in `/var/backups/vidfetch-engine-upgrade-<UTC>.XXXXXX` (`0700`), with the link `vidfetch-engine-upgrade-latest`. It holds:
   - the engine unit and the state of `vidfetch.service.d/`;
   - `worker.env` and the directory of the engine bundle in use;
   - the gateway's bundle path and SHA-256;
   - the quota ledger, copied while the gateway is stopped;
   - `before.txt`: PIDs, `NRestarts`, `ExecStart`, and the egress unit's `ActiveEnterTimestamp`;
   - `MANIFEST.sha256`.
2. **New bundle** in `/opt/vidfetch/releases/engine-<16 hex>/vidfetch-ovh.cjs`:
   - written root `0644` through `.new`, then `mv`;
   - an existing file with other content is refused, never overwritten (E11);
   - `node --check` must pass.
3. **Drop-in** `vidfetch.service.d/20-engine-release.conf`: the unit's own `ExecStart` with only the bundle path replaced.
4. **Restart sequence:**
   1. `daemon-reload`;
   2. stop the gateway, then stop the engine, **never the egress unit** (F9);
   3. copy the ledger;
   4. `reset-failed` both units (F10);
   5. start the engine and wait for its health;
   6. start the gateway and wait until it answers.
5. **Verification.** Anything wrong rolls back automatically (E6):
   - **Engine process:** a new PID, the new bundle, `vidfetch-worker`, `NoNewPrivs=1`, `CapEff=0`.
   - **Engine answer:** `engine_health=200 ok=True isolation=vidfetch-uid-nft-v1`; listener `127.0.0.1:8788` only.
   - **Gateway process:** a new PID (F4), running the same path and SHA-256 as before.
   - **Gateway answer:**
     - `alive=True`;
     - `deployment_signed=200 draining=False active=False`, with `deployment_unsigned` 401 or 403;
     - `helper_fr=200`, `unknown_path=404`, `fetch_info_anonymous` 401 or 403;
     - listener `127.0.0.1:8789` only.
   - **Egress:** `vidfetch-egress.service` active, `ActiveEnterTimestamp` unchanged, nft ruleset hash identical.
   - **Files identical** (content, owner, mode): `worker.env`, `isolation.json`, `gateway.env`, the unit files, the old release directory.
   - **Other services:** frontend, Caddy and SSH have the same PIDs.
   - **Settling (automatic rollback):** after `SETTLE` seconds, **60 by default** (was 12 in v1), neither process has restarted.
6. **Printed output:**
   - the next step: `08-gateway.sh upgrade` if the gateway changes, otherwise `13-engine.sh observe`;
   - the guard commands (`guard-update.py add <drop-in> <bundle>`);
   - the rollback command.

**rollback:**
- **Refuses if:**
  - downloads are open;
  - the system is not idle;
  - the backup fails its integrity check;
  - the gateway in service is not the one recorded in the backup. In that case `08-gateway.sh upgrade` came after, so run `08-gateway.sh rollback` first.
- **Restores:**
  - this script's drop-in: the saved one, or none (removed by name; the directory only with `rmdir`, only if this script created it and it is empty);
  - `worker.env` from the backup.
- **Then:** `daemon-reload`, stop the gateway, stop the engine, `reset-failed` both, start the engine, start the gateway.
- **Verifies** the previous engine (path, SHA-256, isolation), the recorded gateway, files identical to the backup, and the egress unit untouched.
- **Never removes** the new bundle directory (E11).

**Interface details fixed by the tests:**
- **Output:** the same probe lines as `08-gateway.sh`.
- **Verdicts:** `VERDICT: upgrade needed and possible`, `already is the expected bundle`, `nothing to do`, `UPGRADED`, `FAILED:`, `ROLLBACK VERIFIED`, `OBSERVED OK`, `OBSERVATION FAILED`.
- **Test overrides:**
  - `VM_ENGINE_SETTLE`;
  - `VM_PREVIOUS` (`/opt/vidfetch-ci-web/previous.json` by default);
  - `VM_OBSERVE_MIN`, test only: the 900 s production minimum applies whenever it is not set;
  - plus the `VM_*` variables of `common.sh`.

**Path safety:** the same rules as `08-gateway.sh`, so `${VAR:?}`, exact paths, files named one by one, no `rm -rf`, and tests with empty and invalid paths.

### B3. `13-engine.sh observe [SECONDS]`: observation and compatibility checks (new in v2, decision 2)

```sh
sudo bash 13-engine.sh observe        # 900 s (15 min) by default; a shorter value is refused
sudo bash 13-engine.sh observe 1800   # longer if wanted
```

**Read-only.** It changes nothing, restarts nothing and takes no lock. It may also run with downloads open, for example at W0 for the reference state.

**Every 30 s, for the whole duration, all of these must hold:**

| # | Check | Why |
|---|---|---|
| O1 | Engine and gateway: same `MainPID` as at the start of the observation, and `NRestarts` unchanged (F11) | a crash restart would be invisible to a single reading |
| O2 | **Compatibility of the bundles in service:** engine and gateway = the active release manifest (bundle, process, ctime). This is `release_drift`, so NO-DRIFT. | the frontend, engine and gateway come from the same release |
| O3 | **Gateway/engine compatibility:** the engine answers `ok=True` with the isolation proof. The gateway answers `alive=True` and the signed `/auth/deployment` 200, and refuses unsigned or anonymous requests. | the new engine and the gateway still speak the same contract on the internal endpoints |
| O4 | **Frontend compatibility:** local `/api/health` reports the active release, and `downloads.available` matches `ready` | the frontend sees the gateway it expects |
| O5 | **Isolation:** `vidfetch-worker`, `NoNewPrivs=1`, `CapEff=0`; egress unit `ActiveEnterTimestamp` unchanged; nft ruleset identical; loopback listeners | E3 holds for the whole duration, not only at the start |
| O6 | **Journal:** no line at priority `warning` or above from `vidfetch` or `vidfetch-gateway` since the start of the observation | early errors (crashed module, rejected configuration) |
| O7 | **Resources:** `MemoryCurrent` below `MemoryHigh` (768 MiB for the engine, 192 MiB for the gateway) | a leak or a runaway at start |
| O8 | Frontend, Caddy and SSH PIDs unchanged; `worker.env`, `gateway.env`, `web.env`, `isolation.json` and unit files unchanged | E4 |

**Result:**
- `OBSERVED OK`, written to a root-only record `/var/backups/vidfetch-observation-<UTC>.json` (PIDs, duration, checks), only if every round passed for at least 900 s.
- Otherwise `OBSERVATION FAILED: <check>`, plus the exact rollback sequence for the current state (§4). **No automatic action:** downloads are still closed and nothing is exposed. The reverse order (gateway first) makes a multi-step rollback a decision for the administrator.

**Enforcement on reopening (recommended, to confirm).** `11-downloads.sh open` and `set-ready.sh 1` (`common.sh`) refuse unless the latest `OBSERVED OK` record:
- names the current `MainPID` of the engine and of the gateway;
- lasted at least 900 s.

So after any engine or gateway restart, reopening waits for a full observation. `set-ready.sh 0` and `close` are never blocked. One consequence: the next close-and-reopen, for any reason, needs one 15-minute observation first. It is read-only and can run while downloads are still open.

### Old bundles (decision 3)

None of the three tools (`activate-reviewed.py`, `13-engine.sh`, `08-gateway.sh`) removes anything under `/opt/vidfetch/releases/`. Successive versions accumulate there; the plan includes a disk-space check in `check`. The tests check that the previous and the new directory are still present after `upgrade`, `rollback` and an automatic rollback.

## 4. Maintenance window (engine and gateway changing together)

Downloads are closed for **about 30 minutes**, including the 15 minutes of observation. The site and the SEO pages stay online.

| Step | Command (VPS, `~/media-test-stage/admin`) | Expected |
|---|---|---|
| W0 | reference state; F1–F11 re-read; `13-engine.sh observe` (downloads still open) | equal to the last reading; `OBSERVED OK` |
| W1 | `11-downloads.sh close`, then `guard-update.py accept /etc/vidfetch/web.env` | `ready=0`, `public` profile, guard N/0 |
| W2 | `activate-reviewed.py check <SHA> <ARCHIVE> <GATEWAY> <ENGINE>` | `CHECKED`; nothing switched |
| W3 | `activate-reviewed.py activate …` | `ACTIVATED`; old engine and old gateway still running |
| W4 | `13-engine.sh check <ENGINE>`, then `upgrade <ENGINE>` | `UPGRADED` after 60 s of settling; gateway restarted on its unchanged bundle |
| W5 | `08-gateway.sh check <GATEWAY>`, then `upgrade <GATEWAY>` (only if the gateway changes) | `UPGRADED`; the engine is not restarted |
| **W6** | **`13-engine.sh observe`** (≥ 15 min) | **`OBSERVED OK`** |
| W7 | `guard-update.py add` for both drop-ins and both bundles | guard N+4/0 (or N+2/0) |
| W8 | `11-downloads.sh open`, then `guard-update.py accept /etc/vidfetch/web.env` | refused without W6 (B3), or if W4/W5 was skipped (F6); otherwise `ready=1`, `public-downloads` |
| W9 | real tests (MP4 and MP3 per validated platform), monitoring, leak scan | no 5xx, no secret, quota +N |

**Rollback, always in the reverse order, with downloads closed:**

| Situation | Sequence |
|---|---|
| Failure in W4 | automatic (E6); then `rollback.py` (frontend); then `observe`; then `open` |
| Failure in W5 | `08-gateway.sh` rolls back by itself; then `13-engine.sh rollback`; then `rollback.py`; then `observe`; then `open` |
| `OBSERVATION FAILED` in W6 | `08-gateway.sh rollback` (if W5 ran), `13-engine.sh rollback`, `rollback.py`, `observe`, `open` |
| Problem after W8 | 1. `close`<br>2. `08-gateway.sh rollback`<br>3. `13-engine.sh rollback`<br>4. `rollback.py`<br>5. restore the guard backup<br>6. `observe`<br>7. `open` |

At every step `open` refuses until the frontend, engine and gateway match (F6) and a full observation of the processes in service has passed (B3).

## 5. Tests

The detail is in the plan (`docs/VIDFETCH-MOTEUR-REVUE-PLAN.md`, step 1). In short:
- **B1:** `test_activate_reviewed_engine.py`, 16 tests, already written.
- **B2 and B3:** `engine-upgrade-systemd.test.sh`, already written for B2.
  - It gains: an egress unit whose `stop` removes the rules (F9); the gateway started through a `20-gateway-release.conf` drop-in, as on the VPS (F1); a start-limit case (F10); and the `observe` cases.
  - The `observe` cases: OK; failures on a restart, a warning in the journal, a drift and a stopped egress unit; refusal of a duration below 900 s.
- **Enforcement on reopening:** `public-downloads.test.sh` gains `open` and `set-ready.sh 1` refused without an observation record, or with one naming other PIDs or lasting less than 900 s, while `close` and `set-ready.sh 0` keep working.
- **Mutations:** the list is in the plan (step 5).

**This branch must not be merged as it is.** The implementation comes in the same PR, and every test is green before the merge request.

## 6. Owner decisions (21/10/2026) and remaining questions

**Decisions:**
1. **Gateway restart accepted** when the engine change requires it (F4, confirmed), within a controlled window. The unit files stay as they are.
2. **At least 15 minutes of observation** after the restart, with compatibility checks: `observe` (B3), mandatory before reopening.
3. **Old bundles are never removed automatically** (E11).
4. **Read-only reading of the units** done on 21/10 at 20:03 UTC. F4 is confirmed; F9, F10 and F11 are new.
5. **Revised specification** (this document) and **implementation plan**, without code.

**Remaining questions:**
1. **Enforcement on reopening** (B3): enforce the observation inside `11-downloads.sh open` and `set-ready.sh 1`, or keep it as a written procedure only? Enforcing it is recommended.
2. **On `OBSERVATION FAILED`:** no automatic action (recommended, since downloads stay closed), or an automatic engine rollback when the gateway did not change?
3. **Settling period of `upgrade`:** 60 s (recommended), before the 15-minute observation.
