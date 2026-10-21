# Reviewed engine change (PR B): specification v3

**Status, 21/10/2026: v3, the final version before implementation.**
- v3 records the owner's design decisions of 21/10 (§7).
- The plan, with the commit split, is in `docs/VIDFETCH-MOTEUR-REVUE-PLAN.md`.
- **No implementation is authorized:** `13-engine.sh` does not exist, and no administrator script is modified in this branch.
- The tests are written and fail until the implementation exists (§6).

**Why.** Every planned engine change needs a reviewed path to production:
- PR #7 (error classification);
- the platform registry (PR C) and the short-link resolver (PR D);
- each new platform (F1, F2…).

The CI promoter's refusal of any engine or gateway change **stays**. PR #16 covers the gateway; PR B adds the engine, and an observation that is **enforced** before downloads reopen after any engine or gateway change.

**Not covered:** the yt-dlp, ffmpeg and Node binaries (`/opt/vidfetch/tools`), which have their own procedure.

## 1. Facts the design depends on

**Confirmed** = read on the VPS on 21/10 at 20:03 UTC (`systemctl cat` and `systemctl show`, read-only). The others come from the repository. Every row is re-read at W0.

| # | Fact | Status | Consequence |
|---|---|---|---|
| F1 | Engine and gateway run from `/opt/vidfetch/releases/<dir>`, not from the frontend release pointer:<br>- engine `ovh-20261012-rnllrb69-ipv4/vidfetch-ovh.cjs` (`fa0d3d4e…`), named by the unit file;<br>- gateway `gateway-0fa1404530c272b7/…`, through `20-gateway-release.conf` (written by `08-gateway.sh` on 13/10);<br>- no `vidfetch.service.d/`. | confirmed | each one is upgraded by its own script; the first engine upgrade creates the engine drop-in |
| F2 | Engine: `User=vidfetch-worker`, `NoNewPrivileges=true`, `CapabilityBoundingSet=`, `worker.env`, listener `127.0.0.1:8788`. Its process: `NoNewPrivs=1`, `CapEff=0`. | confirmed | check uid, privileges and listener, not only "it answers" |
| F3 | At every health call, the engine re-checks its isolation and reports `isolationProfile = vidfetch-uid-nft-v1`. | repository | the health answer is an isolation proof |
| F4 | The gateway has `Requires=vidfetch.service` and `After=vidfetch.service`. Nothing else depends on the engine. | confirmed | an engine restart also restarts the gateway (accepted, decision 1 of 20/10) |
| F5 | `08-gateway.sh` refuses unless the running engine is the release's. | repository | the engine goes first |
| F6 | `release_drift` (PR #16) blocks `open` and `set-ready.sh 1` when a bundle in service is not the active release's. | repository | the same release everywhere before reopening |
| F7 | With `ready=1`, the PR #17 guard in `rollback.py` refuses an engine or gateway that differs from those in service. | repository | frontend rollback protected |
| F8 | Deterministic engine build: `node backend/ovh/build.mjs`. | rebuilt three times on 21/10 | `ENGINE_SHA256` is rebuilt independently |
| F9 | The engine has `Requires=` and `BindsTo=vidfetch-egress.service`, a oneshot unit with `RemainAfterExit`. Its **`ExecStop` (`egress-control.py stop`) removes the worker's egress policy.** | confirmed | the egress unit is **never** stopped, restarted or reloaded |
| F10 | `StartLimitBurst=3` within `StartLimitIntervalSec=300` on the engine and on the gateway. | confirmed | a targeted `reset-failed` before each start (§3 B2) |
| F11 | **Units:**<br>- engine: `NRestarts=1`, active since 12/10 17:10 UTC;<br>- gateway: `NRestarts=0`, active since 13/10 22:26 UTC;<br>- egress: active since 12/10 16:47:53 UTC.<br>**All three report `Result=success`:** systemd resets `Result` after a successful automatic restart. | confirmed (second reading, 21/10) | counters are compared with their own starting value. Precondition 4 (§3 B2), "not failed and `Result=success`", accepts today's production. |
| F12 | `08-gateway.sh` writes `upgraded` and `rolled-back` (UTC time) into its backup directory, pointed to by `vidfetch-gateway-upgrade-latest`. | repository | the observation gate (B4) sees a gateway operation **without modifying `08-gateway.sh`** |

## 2. Security invariants

| # | Rule | Enforced by (§3) | Tested by (§6) |
|---|---|---|---|
| E1 | **Downloads are open only if the frontend, engine and gateway come from the same release.** Every change happens with `ready=0`. | `release_drift` (PR #16); `ready=0` precondition of B1 and B2 | gate, systemd |
| E2 | The new engine is the one the administrator **rebuilt independently**: `ENGINE_SHA256` = manifest = extracted file = installed file. | B1, B2 | B1, systemd |
| E3 | The isolation does not change:<br>- uid, `NoNewPrivs=1`, `CapEff=0`, isolation proof;<br>- `worker.env`, `isolation.json` and the units byte-identical;<br>- the nft ruleset identical;<br>- loopback listeners only. | B2, B3 (O5) | systemd |
| E4 | **Network protection actually active:**<br>- `vidfetch-egress.service` never stopped, restarted or reloaded, and its activation time unchanged;<br>- the `vidfetch_egress` table present and identical;<br>- **a probe from the worker uid to a private address is dropped**, and the rule's drop counter moves. | B2 (`check` and after the switch), B3 (start and end of the observation) | source checks, systemd |
| E5 | Only the engine and the gateway restart: the gateway on the same bundle; frontend, Caddy and SSH keep their PIDs; `gateway.env`, `web.env`, Caddy, SSH and the secrets are unchanged. | B2 | systemd |
| E6 | No operation is cut: downloads closed, no connection on 8788 or 8789 (keep-alive retried up to 10 s), no media process, empty queue. | B2 | systemd |
| E7 | **Automatic rollback during the 60 s settling period after the switch:** a failed check or an interruption (TERM, INT, HUP) brings the previous engine back, then verifies it. **This mechanism stays.** | B2 | systemd |
| E8 | **The 15-minute observation never acts.** On failure:<br>- detailed report and `failed` record;<br>- downloads stay closed (the gate refuses);<br>- **no automatic rollback**: rollback only through the procedure, authorized explicitly. | B3, B4 | gate, systemd, source checks |
| E9 | **Enforced observation gate:** `11-downloads.sh open` and `set-ready.sh 1` refuse unless the latest observation record:<br>- is trusted;<br>- is successful;<br>- lasted ≥ 900 s;<br>- covers the engine and gateway bundles in service;<br>- has no reviewed operation (engine or gateway) after its start.<br>**A close and reopen without a bundle change, or a crash restart on the same bundle, needs no new observation.** | B4 | gate |
| E10 | **Closing is never blocked.** `11-downloads.sh close`, `set-ready.sh 0` and the cancel and restore scripts do not know the gate, and are not modified. | B4 (limited scope) | source checks, gate |
| E11 | **Targeted, visible `reset-failed`:**<br>- only on `vidfetch.service` and `vidfetch-gateway.service`;<br>- only right before a start issued by the tool, after writing the unit's state to `events.log`;<br>- **never on a unit that was already failed before the operation**: refused, so the fault stays visible;<br>- never in `check` or `observe`. | B2 | source checks, systemd |
| E12 | **Old bundles are never removed** by any tool under `/opt/vidfetch/releases/`. | B2 | source checks, systemd |
| E13 | **`08-gateway.sh` is not modified** (its hash is pinned to PR #16's in the tests); the gateway path stays the one PR #16 reviewed. | scope | source checks |
| E14 | One operation at a time: `upgrade` and `rollback` take the toolkit lock. `observe` takes none: it is read-only and may run while an operation holds the lock. | B2, B3 | systemd |
| E15 | No secret in the output, the journal, the records or the backup reports. Backups and records are root-only (`0700`/`0600`). | B2, B3 | systemd, gate |
| E16 | The CI is unchanged: the promoter rule and `ENGINE_FILES` stay; the CI account can run none of these tools. | scope | B1, source checks |

## 3. Components

### B1. `activate-reviewed.py`: optional fifth argument `ENGINE_SHA256`

```sh
sudo python3 activate-reviewed.py check|activate SHA ARCHIVE_SHA256 GATEWAY_SHA256                # unchanged: gateway only
sudo python3 activate-reviewed.py check|activate SHA ARCHIVE_SHA256 GATEWAY_SHA256 ENGINE_SHA256  # new
```

**Rules:**
- Both fingerprints are always given. Each equals the manifest and the extracted file.
- At least one bundle changes; otherwise "use the CI promoter".
- No drift beforehand.
- `activate` requires downloads to be closed.
- Everything else is the promoter's: archive checks, lock, guard, health, switch, `pending.json` and `previous.json`, and the infrastructure compared before and after. The frontend switch never restarts the engine.

**Record:** `engine_sha256`, `engine_in_service`, `engine_changed`, `gateway_changed`.

**Next steps printed:**
1. `13-engine.sh upgrade`, if the engine changed;
2. `08-gateway.sh upgrade`, if the gateway changed;
3. **`13-engine.sh observe`**;
4. guard reconciliation;
5. `11-downloads.sh open`.

**Four arguments:** today's behaviour, and the message names the five-argument form.

### B2. `13-engine.sh check | upgrade | rollback`

**Preconditions, shared by check and upgrade.** The first that fails is printed:
1. a well-formed fingerprint;
2. the release copy is root-owned and read-only for others, and has the fingerprint, which the manifest also lists;
3. the gateway in service belongs to the active release or to `previous.json`;
4. engine, gateway and egress units active, **and neither engine nor gateway in a `failed` state or carrying a non-`success` `Result`** (E11: the fault is not reset);
5. unit files, `worker.env` and `isolation.json` root-owned and not writable by others;
6. the engine `ExecStart` names one `.cjs`, and the process runs it;
7. the engine process meets E3;
8. **E4 effective:** the `vidfetch_egress` table is present and the egress probe is dropped (`egress_probe=dropped`).
   - The probe is one TCP attempt from the worker uid (`setpriv --reuid=vidfetch-worker --no-new-privs`) to `10.255.255.1:9`, with a 2 s timeout.
   - The drop counter of the rule must move.
   - The cloud metadata address is never used;
9. at least 1 GiB free on the release disk (`VM_MIN_FREE_MIB`, test override).

**upgrade only:** `ready=0` (missing counts as open), toolkit lock, no dead-man timer armed, idle (E6).

**Steps:**
1. **Backup** (`0700`, link `vidfetch-engine-upgrade-latest`):
   - the engine unit and the state of its drop-in directory;
   - `worker.env`, the engine bundle in use, and the gateway's bundle path and SHA-256;
   - the quota ledger, copied while the gateway is stopped;
   - `before.txt` (PIDs, `NRestarts`, `ExecStart`, the egress unit's activation time) and `events.log`;
   - `MANIFEST.sha256`.
2. **New bundle** in `/opt/vidfetch/releases/engine-<16>/`:
   - through `.new`, then `mv`;
   - never overwritten (E12);
   - `node --check` must pass.
3. **Drop-in** `vidfetch.service.d/20-engine-release.conf`: the unit's own `ExecStart` with only the bundle path replaced.
4. **Restart sequence:**
   1. `daemon-reload`;
   2. stop the gateway, then the engine, never the egress unit;
   3. copy the ledger;
   4. `reset_and_start <engine>` and wait for its health;
   5. `reset_and_start <gateway>` and wait until it answers.

   `reset_and_start` writes `reset-failed <unit> (before: ActiveState=… Result=… NRestarts=…)` to `events.log`, then runs `reset-failed` on that unit alone, then starts it. At most one call per unit and per start the tool issues.
5. **Verification.** Anything wrong triggers the automatic rollback (E7):
   - **engine:** a new PID, the new bundle, isolation (uid, privileges, proof);
   - **gateway:** a new PID on the **same** bundle, `alive=True`, signed `/auth/deployment` 200, unsigned refused, internal listeners on loopback;
   - **network (E4):** egress unit active with the same activation time, rules identical, probe dropped;
   - **files and other services:** identical (E5);
   - **settling:** **60 s** (`SETTLE`, `VM_ENGINE_SETTLE` override) with neither process restarting.
6. **Markers:** `upgraded` (UTC) in the backup; `rolled-back` after a verified rollback, automatic or not. The observation gate reads them (B4).
7. **Printed output:**
   - `08-gateway.sh upgrade` if the gateway changes too;
   - then `13-engine.sh observe`;
   - the guard commands;
   - the rollback command.

**rollback:**
- **Refuses if:**
  - downloads are open;
  - the system is not idle;
  - the backup fails its integrity check;
  - the gateway in service is not the one recorded in the backup (run `08-gateway.sh rollback` first);
  - a unit is failed (E11).
- **Restores** the drop-in state and `worker.env`.
- **Restart sequence:** gateway stop, engine stop, then `reset_and_start` for the engine, then for the gateway.
- **Verifies** the same points as the upgrade, against the previous bundle.
- **Writes** `rolled-back`.
- **Removes no bundle.**

**Output:**
- the probe lines of `08-gateway.sh`, plus `egress_probe=dropped|NOT-DROPPED`;
- the verdicts: `VERDICT: upgrade needed and possible`, `already is the expected bundle`, `nothing to do`, `UPGRADED`, `FAILED:`, `ROLLBACK VERIFIED`.

### B3. `13-engine.sh observe [SECONDS]`: the 15-minute observation

```sh
sudo bash 13-engine.sh observe        # 900 s by default and at minimum (decision 3)
```

**It never acts:**
- no lock, no stop, start, restart or reload, no `reset-failed`;
- no write except its own record;
- no rollback.

It can run with downloads open, for example at W0.

**Every 30 s** (`VM_OBSERVE_INTERVAL` for the tests), for the whole duration:

| # | Check |
|---|---|
| O1 | engine and gateway: same `MainPID`, `NRestarts` unchanged since the start of the observation |
| O2 | **bundle compatibility:** `release_drift`, so the bundles in service are the active release's (process, ctime, manifest) |
| O3 | **gateway/engine compatibility:** the engine answers `ok=True` with its isolation proof; the gateway answers `alive=True` and the signed `/auth/deployment` 200, and refuses unsigned and anonymous requests |
| O4 | **frontend compatibility:** local `/api/health` reports the active release, and `downloads.available` matches `ready` |
| O5 | **network (E4):** egress unit active with the same activation time, rules identical, loopback listeners; **probe dropped at the start and at the end** of the observation (one packet each time, dropped locally) |
| O6 | journal: no line at priority `warning` or above from `vidfetch` or `vidfetch-gateway` since the start |
| O7 | `MemoryCurrent` below `MemoryHigh` (engine 768 MiB, gateway 192 MiB) |
| O8 | frontend, Caddy and SSH PIDs unchanged; environment files, `isolation.json`, units and drop-ins unchanged |

**Record**, root-only `0600` in `/var/lib/vidfetch-admin/observations/` (`0700`), named after its end time (`YYYYmmddTHHMMSS.<ns>Z-ok|failed.json`). It holds:
- `result`, `started`, `ended`, `duration_s`, `rounds`, `failed_check`;
- for the engine and the gateway: unit, PID, bundle and SHA-256.

**`OBSERVED OK`** only if every round passed for at least 900 s. `VM_OBSERVE_MIN` is a test-only override; without it, any duration below 900 is refused.

**On failure:** `OBSERVATION FAILED: <O#> <detail>`, plus a **detailed report**:
- the failed check, its round and its time;
- the values seen: PIDs, `NRestarts`, the redacted journal lines, memory, the result of the egress probe;
- the state of the bundles;
- **the rollback procedure for the current state, printed but not run**;
- "downloads stay closed".

The `failed` record keeps the gate closed (B4) until the procedure has run **and** a new observation has passed.

### B4. The observation gate (`common.sh`: `observation_problem`)

**Called** only by `11-downloads.sh open` and `set-ready.sh 1`, right after `release_drift`.

**Same convention as `release_drift`:** status 0 with a reason when reopening is refused, status 1 when it is allowed.

**Rules, in order:**
1. The observation directory must be `0700` and root-owned. Otherwise: refused.
2. **The latest record** (by name, so by end time) is the only one read.
   - A non-regular file, a symbolic link, or a mode other than `0600 root` makes the record "untrusted", and the gate looks for the previous trusted one. None left: "no observation record".
   - A trusted latest record that cannot be read **refuses**; there is no fallback to an older record.
3. `result` = `ok`, otherwise "the latest observation failed (<check>)".
4. `duration_s` ≥ 900, with no override.
5. Its `engine.sha256` and `gateway.sha256` equal the bundles in service. Otherwise "the engine/gateway changed since the last observation".
6. No `upgraded` or `rolled-back` marker of the latest engine or gateway backup is later than its `started`. Otherwise "an engine/gateway operation ran after the last observation".

**Consequences:**
- **A close and reopen without a change** passes immediately: same bundles, no new operation.
- **A crash restart on the same bundle** passes (decision 1: no automatic observation without a bundle change).
- **Any reviewed engine or gateway operation, including a rollback to the earlier bundles**, needs a new observation.
- **Bootstrap:** before any first reopening, one observation of the current production (W0, read-only, downloads open).

## 4. Maintenance window (engine and gateway together)

Downloads are closed for about 30 minutes; the site and the SEO pages stay online.

| Step | Command | Expected |
|---|---|---|
| W0 | reference state, F1–F12 re-read, `13-engine.sh observe` (downloads open) | `OBSERVED OK` (also the gate's bootstrap) |
| W1 | `11-downloads.sh close`, then `guard-update.py accept web.env` | `ready=0`; no observation required to close |
| W2–W3 | `activate-reviewed.py check`, then `activate` (five arguments) | `CHECKED`, then `ACTIVATED` |
| W4 | `13-engine.sh check`, then `upgrade` | `UPGRADED` after 60 s; `egress_probe=dropped` |
| W5 | `08-gateway.sh check`, then `upgrade` (if the gateway changes) | `UPGRADED` |
| W6 | **`13-engine.sh observe`** | **`OBSERVED OK` after 15 min** |
| W7 | `guard-update.py add` for the drop-ins and bundles | guard N+4/0 (or N+2/0) |
| W8 | `11-downloads.sh open`, then `accept web.env` | refused without W6 (gate) or with a mismatched bundle (F6) |
| W9 | real tests, monitoring, leak scan | no 5xx, no secret |

**Rollback: the order is always reversed, downloads stay closed, and each sequence is authorized explicitly.**

| Situation | Sequence |
|---|---|
| Failure in W4 within the 60 s | **automatic** (E7); then `rollback.py` (frontend); then `observe`; then `open` |
| Failure in W5 | `08-gateway.sh` rolls back by itself; then `13-engine.sh rollback`, `rollback.py`, `observe`, `open` |
| `OBSERVATION FAILED` in W6 | **nothing automatic.** Report to the owner; on authorization: `08-gateway.sh rollback` (if W5 ran), `13-engine.sh rollback`, `rollback.py`, `observe`, `open` |
| Problem after W8 | `close` (never blocked), then the same procedure, then the guard backup, `observe`, `open` |

## 5. What does not change

- `08-gateway.sh` (pinned hash).
- `11-downloads.sh close` and `close_now`, `set-ready.sh 0`.
- `04-cancel.sh`, `05-cancel.sh`, `07-restore-full.sh`, `10-dl-cancel.sh`, `restore-*.sh`.
- The CI promoter and `rollback.py`.
- The units (`vidfetch*.service`), `worker.env`, `isolation.json`, `egress-control.py`.

## 6. Tests (written now, red until the implementation)

| File | Covers | Status on 21/10 |
|---|---|---|
| `test_activate_reviewed_engine.py` | B1: 16 tests (success, refusals, order of the next steps including `observe`, four-argument compatibility, CI promoter unchanged) | 14 red ("usage"); 2 already green and must stay so |
| `engine-upgrade-systemd.test.sh` + `test_engine_upgrade_systemd.py` (slow) | B2 and B3, about 76 checks. Real systemd with the VPS units; an egress unit whose stop removes the rules; the gateway through its drop-in; a failed unit not reset; start limit; egress probe; `observe` OK and four failures (O1, O2, O5, O6) without any action; HUP/TERM; neighbours; bundles kept | stops at its first line (not implemented) |
| `test_engine_upgrade_systemd.py` (source checks) | egress unit only read; targeted and logged `reset-failed`; `observe` read-only; nothing removed under releases; preconditions before any stop; CI out of reach | 7 red (not implemented) |
| `observation-gate.test.sh` + `test_observation_gate.py` | B4: 15 gate cases; `set-ready.sh 1` and `set-ready.sh 0`; secrets | 16 red ("not implemented"); 4 green: `set-ready.sh 1` with a valid record, `set-ready.sh 0` never blocked (×2), no secret |
| `test_observation_gate.py` (source checks) | gate only on the opening paths; close, cancel and restore scripts do not know it; **`08-gateway.sh` = PR #16** | 3 red (gate absent); 2 green and must stay so |
| Existing suites (PR #16) | `test_activate_reviewed.py` 44, etc. | **green** |

**This branch must not be merged as it is.** The plan sets the order of the commits so that every existing suite stays green at each commit.

## 7. Owner decisions

**Decisions of 21/10/2026:**
1. **Observation mandatory** before reopening after any engine or gateway change, **enforced technically** (B4). A close without a bundle change does not trigger it.
2. **On observation failure:** no automatic rollback during the long observation; downloads stay closed; detailed report; rollback only through a procedure authorized explicitly. **The automatic rollback on an immediate failure of the switch stays** (E7).
3. **60 s of settling** after the switch, then **15 minutes of continuous observation** before reopening.
4. **Extra protections:**
   - never stop or reload `vidfetch-egress.service`;
   - verify that the network protection is actually active;
   - account for `Requires=` and `StartLimit`;
   - targeted `reset-failed` that does not hide a failure;
   - keep the old bundles;
   - no modification of `08-gateway.sh`;
   - no unnecessary modification of the closing and emergency procedures.

**Earlier decisions (20/10):**
- the gateway restart is accepted;
- the units were read;
- old bundles are never removed.
