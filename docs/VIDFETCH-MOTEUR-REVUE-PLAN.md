# Reviewed engine change (PR B): implementation plan

**Status, 21/10/2026: plan only.**
- No code is written; implementation waits for the owner's authorization.
- It implements `docs/VIDFETCH-MOTEUR-REVUE-SPEC.md` v2.
- Every step that touches GitHub (PR, CI) or the VPS needs its own authorization, as before.

## 0. Prerequisites and order relative to the other PRs

| Item | Why | When |
|---|---|---|
| PR #16 merged | PR B extends `activate-reviewed.py`, `common.sh`, `11-downloads.sh` and `set-ready.sh`, as PR #16 left them. Today this branch is based on `93517d14`. | before the PR B merge; then rebase on `main` |
| PR #17 merged and installed (`12-rollback-helper.sh install`) | the guard on `rollback.py` (F7) is part of the rollback path of §4 of the spec | before the first engine window |
| PR #15 (gateway) | It uses the PR #16 path, not PR B. If PR B (with the B3 enforcement) is merged first, the #15 window also gets the 15-minute observation. This matches decision 2. | owner's choice; either order works |
| `VIDFETCH_DEPLOY_ENABLED=false` | no CI deployment during the work | throughout |

## 1. Bring the tests to v2 (red), before any code

1. **`engine-upgrade-systemd.test.sh`**:
   - **egress (F9):** a stand-in egress unit whose `ExecStop` deletes the nft table. Check that the table and the unit's `ActiveEnterTimestamp` survive `upgrade`, `rollback` and automatic rollbacks.
   - **gateway (F1):** started through `vidfetch-gateway.service.d/20-gateway-release.conf` (bundle `gateway-<16>/`), as on the VPS.
   - **start limit (F10):** upgrade, then automatic rollback, then a new upgrade within 5 minutes. All succeed, and no unit is left `failed`.
   - **`observe`** (`VM_OBSERVE_MIN=20` in the test):
     - `OBSERVED OK` with its record;
     - `OBSERVATION FAILED` in four cases: a gateway restart (`kill`), a warning in the journal (`systemd-cat -p warning`), a drift (bundle rewritten), a stopped egress unit;
     - `observe 899` refused without the override;
     - in each failure case, nothing is changed by `observe`.
   - **E11:** previous and new directories present after every operation.
   - **disk:** `check` refuses when less than 1 GiB is free.
2. **`test_engine_upgrade_systemd.py` (source checks):**
   - the `observe` branch contains no `stop`, `start`, `restart`, `daemon-reload` or `take_lock`;
   - no command touches `vidfetch-egress.service` except `is-active` and `show`;
   - no `rm` under `/opt/vidfetch/releases`;
   - `reset-failed` precedes every `start`.
3. **`public-downloads.test.sh` (B3 enforcement):** `open` and `set-ready.sh 1` refuse in each of these cases:
   - no observation record;
   - a record naming other PIDs;
   - a record shorter than 900 s;
   - a record with `failed`.

   Meanwhile `close` and `set-ready.sh 0` keep working, and a valid record allows the opening.
4. **`test_activate_reviewed_engine.py`:** the next steps printed include `13-engine.sh observe`, before `11-downloads.sh open`.
5. Expected result: the new tests are red for the right reason; the existing suites (PR #16: 44 + 86 + 74 + 44) stay green.

## 2. B1: `activate-reviewed.py` (about 60 lines)

- `arguments()` accepts 4 or 5 arguments. The fifth must match `[a-f0-9]{64}`, and the usage message names `ENGINE_SHA256`.
- `reviewed_release()`:
  - **with 4 arguments:** today's rule, plus a message naming the five-argument form;
  - **with 5 arguments:** each bundle = its fingerprint = the extracted file; at least one changed; otherwise refused.
- Record fields: `engine_sha256`, `engine_in_service`, `engine_changed`, `gateway_changed`.
- Next steps printed according to what changed (spec §3 B1).
- **Done when:** `test_activate_reviewed_engine.py` (16) and `test_activate_reviewed.py` (44) are green.

## 3. B2: `13-engine.sh check | upgrade | rollback` (about 300 lines of shell)

- **Model:** `08-gateway.sh`. **`08-gateway.sh` is not modified in PR B.** Its helpers (`probe`, `idle`, `root_owned`, `unit_bundle`) are copied rather than factored out, so the gateway path that PR #16 tested and reviewed does not change. Factoring them into `common.sh` is a later, separate change.
- **What differs from `08-gateway.sh`:**
  - preconditions 3 (gateway of the active or the previous release) and 6 (isolation of the process);
  - restart sequence gateway → engine → `reset-failed` → engine → gateway;
  - the egress unit is never touched;
  - process checks (uid, `NoNewPrivs`, `CapEff`);
  - `SETTLE=60`;
  - the gateway-order check in `rollback`.
- **Traps:** `ERR INT TERM HUP` during the settling period lead to the automatic rollback. Recommendation: run it inside `tmux`, so a dropped SSH connection does not interrupt it.
- **Done when:** sections 1–6 of `engine-upgrade-systemd.test.sh` are green, together with the path tests (empty and invalid paths, as in `path-safety.test.sh`).

## 4. B3: `observe` and the enforcement on reopening (about 150 lines)

- **`13-engine.sh observe [SECONDS]`:**
  - checks O1–O8 every 30 s;
  - minimum 900 s, with the `VM_OBSERVE_MIN` override for the tests only;
  - writes a root-only `0600` JSON record: PIDs, start, end, duration, `result`;
  - no action on failure: it prints the rollback sequence for the current state.
- **`common.sh`:** `observation_problem()` returns the reason when the latest record does not name the current `MainPID`s, lasted less than 900 s, or failed.
  - It is called by `11-downloads.sh open` and by `set-ready.sh 1`, after `release_drift`.
  - It is never called by `close` or `set-ready.sh 0`.
- **Done when:** the `observe` cases of the systemd test and the new `public-downloads.test.sh` cases are green.

## 5. Mutations, slow tests and real bundles

**Mutations, target all caught:**

| Tool | Mutations |
|---|---|
| `activate-reviewed.py` | 1. engine fingerprint vs manifest<br>2. vs extracted file<br>3. "at least one changes"<br>4. engine drift<br>5. engine accepted with four arguments |
| `13-engine.sh` | 6. `ready=0`<br>7. idle<br>8. uid / `NoNewPrivs` / `CapEff`<br>9. isolation proof<br>10. gateway restarted on another bundle<br>11. file comparison<br>12. rollback on SIGTERM<br>13. gateway-order check in `rollback`<br>14. overwrite of an existing bundle<br>15. `stop` of the egress unit<br>16. `reset-failed` removed |
| `observe` and `common.sh` | 17. `NRestarts` ignored<br>18. journal ignored<br>19. minimum duration<br>20. `open` without a record |

**Slow tests, run locally under Docker:**
- `engine-upgrade-systemd`;
- `gateway-upgrade-systemd`, to show that `08-gateway.sh` is unchanged;
- `caddy-window-systemd`;
- `public-downloads`.

**Real bundles (one extra test):** the same systemd scenario with the **real engine bundles**, `fa0d3d4e` (production) and one built from the branch.
- Inside the container: a real `isolation.json`, the rules file and its hash, the worker uid. The engine's own isolation check (F3) then passes or fails for real.
- No network media request: health only.

## 6. Documentation

- `docs/VIDFETCH-MOTEUR-REVUE-SPEC.md`: from v2 to "implemented", with the test results.
- `docs/VIDFETCH-ACTIVATION-REVUE.md`: §5 points to the engine procedure.
- An engine window runbook: W0–W9 with expected outputs and the rollback table.

## 7. Delivery (each item needs its own authorization)

1. Push the branch and open the PR, not merged.
2. One CI `validate` run (`gh workflow run deploy.yml --ref <branch> -f operation=validate`). Its bundles must be **identical to production**: PR B touches only admin tooling.
3. Owner review, then merge after PR #16, rebased on `main`.
4. `send-to-vps.sh` from `main` to `~/media-test-stage/admin`: no installation, no restart.
5. **First production use, read-only:** `13-engine.sh check <production engine>`, which must report "already is the expected bundle", then `13-engine.sh observe` (15 min, downloads open, read-only). This validates O1–O8 on real values before any window.
6. **First real engine window:** a PR that changes the engine (for example #7), once its own PR, CI and review are done, with the W0–W9 window.

## 8. Estimate and risks

**Estimate:**

| Work | Duration |
|---|---|
| step 1 (tests) | about 1 day |
| B1 | ½ day |
| B2 | 1½ days |
| B3 | 1 day |
| mutations, slow tests and real bundles | 1 day |
| documentation | ½ day |
| **total** | **about 5½ days**, spread over several sessions |

| Risk | Mitigation |
|---|---|
| The egress unit stopped by mistake: the worker's egress policy is removed (F9) | never named except in `is-active` and `show` (source test); systemd test with an `ExecStop` that deletes the table; check of `ActiveEnterTimestamp` |
| Start limit reached: unit stopped (F10) | `reset-failed` before every start (source test plus systemd case) |
| False "not idle" because of keep-alive | 10 s retry; a held connection is still refused (test) |
| False `OBSERVATION FAILED` (a benign warning in the journal) | read the message; a known warning is explained in the runbook, never filtered silently |
| Disk growth (E11) | `check` refuses below 1 GiB free; pruning stays manual and separate |
| Longer window (about 30 min closed) | the site and the SEO pages stay online; the closing is announced in the plan of the window |
