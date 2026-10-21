# Reviewed engine change (PR B): implementation plan v3

**Status, 21/10/2026: plan only.**
- It implements `docs/VIDFETCH-MOTEUR-REVUE-SPEC.md` v3. The tests are written and red.
- **No implementation is authorized.**
- Every step that touches GitHub (PR, CI) or the VPS needs its own authorization.

## 0. Prerequisites

| Item | Why | When |
|---|---|---|
| PR #16 merged | PR B extends what it introduced: `activate-reviewed.py`, `release_drift`, the refusals in `open` and `set-ready.sh 1`. The branch is based on `93517d14`. | before the PR B merge; then rebase on `main` |
| PR #17 merged and installed | the `rollback.py` guard is part of the rollback procedure | before the first engine window |
| PR #15 (gateway) | It goes through PR #16. If PR B is merged first, its window also gets the enforced observation (decision 1: any gateway change). | owner's choice |
| `VIDFETCH_DEPLOY_ENABLED=false` | — | throughout |

## 1. Commit split

**Order principle:** every existing suite stays green at every commit. The gate is wired into the opening paths **last**, once `observe` exists to satisfy it, so that no intermediate commit makes reopening impossible.

| # | Commit | Files | Tests that turn green | Suites that must stay green |
|---|---|---|---|---|
| **C0** | **done:** spec v3, plan, red tests | `docs/…`, `deploy/ovh/tests/{test_activate_reviewed_engine.py, engine-upgrade-systemd.test.sh, test_engine_upgrade_systemd.py, observation-gate.test.sh, test_observation_gate.py}` | — | all |
| C1 | **B1:** five-argument form of `activate-reviewed.py` | `activate-reviewed.py` | `test_activate_reviewed_engine.py` (16) | `test_activate_reviewed.py` (44) |
| C2 | **B2, read-only:** `13-engine.sh check`, probes (with `egress_probe`), preconditions 1–9 | `13-engine.sh` (new) | systemd §1–§2; source checks: conventions, egress unit only read, CI out of reach | all |
| C3 | **B2:** `upgrade`, automatic rollback (60 s, TERM, INT, HUP), `rollback`, `reset_and_start`, markers | `13-engine.sh` | systemd §3, §5, §6, §7; source checks: `reset-failed`, order, bundles kept | all |
| C4 | **B3:** `observe` (O1–O8, records, report) | `13-engine.sh` | systemd §4; source check: `observe` read-only | all |
| C5 | **B4, function only:** `observation_problem` in `common.sh`, **called nowhere** | `common.sh` | gate cases 1–15 | all (unchanged behaviour) |
| C6 | **B4, enforcement:** calls in `set-ready.sh` (branch `V=1`, after `release_drift`) and `11-downloads.sh open` (after `release_drift`). **Test fixtures** for the existing suites that reopen downloads: they gain a valid observation record, and **a new case** "`open` refused without an observation". | `set-ready.sh`, `11-downloads.sh`; `public-downloads.test.sh` (13 openings), `caddy-window-systemd.test.sh` (5), `admin-scripts.test.sh` (2) | gate cases 16–20; source checks on the opening paths | all, with the updated fixtures. The **closing** cases are untouched. |
| C7 | docs and evidence: spec moved to "implemented", engine window runbook (W0–W9), mutation report, `ACTIVATION-REVUE.md` §5 updated | `docs/…` | — | all |

**Not modified in any commit (checked by the tests):**
- `08-gateway.sh` (hash pinned to PR #16's);
- `04-cancel.sh`, `05-cancel.sh`, `07-restore-full.sh`, `10-dl-cancel.sh`, `restore-*.sh`;
- `close` and `close_now` in `11-downloads.sh`, `set-ready.sh 0`;
- `promote.py`, `rollback.py`, `install.py`, `dispatch.py`, `sudoers`;
- the units.

## 2. Verification of each commit

- **Fast suites:** `python3 -m unittest discover deploy/ovh/tests`, plus the Docker container suites (`admin-scripts`, `admin-hardening`, `path-safety`, `caddy-window`, `public-launch`, `public-downloads`, `observation-gate`).
- **Slow suites**, from C2 on: `engine-upgrade-systemd`, `gateway-upgrade-systemd` (to show the gateway path did not change), `caddy-window-systemd`.
- **Mutations**, from C3 to C6. Target: all 22 caught.

| Tool | Mutations |
|---|---|
| `activate-reviewed.py` | 1. engine fingerprint vs manifest<br>2. vs extracted file<br>3. "at least one bundle changes"<br>4. engine drift<br>5. engine accepted with four arguments |
| `13-engine.sh` | 6. `ready=0`<br>7. idle<br>8. uid / `NoNewPrivs` / `CapEff`<br>9. isolation proof<br>10. **egress probe ignored**<br>11. **egress unit stopped**<br>12. gateway restarted on another bundle<br>13. file comparison<br>14. TERM/HUP rollback<br>15. gateway-order check in `rollback`<br>16. bundle overwritten<br>17. `reset-failed` removed (start limit)<br>18. **`reset-failed` on an already failed unit** |
| `observe` and the gate | 19. `NRestarts` ignored by `observe`<br>20. journal ignored<br>21. 900 s minimum<br>22. gate: markers ignored (an operation after the observation lets reopening through) |

- **Real bundles:** the systemd scenario run once with the real engines (`fa0d3d4e` from production, and one built from the branch) and a real `isolation.json`, so the engine's own isolation check runs for real. Health only, no network media request.

## 3. Delivery (each item needs its own authorization)

1. Push and open the PR, not merged.
2. One CI `validate` run on the branch. Its bundles must be **identical to production**: PR B touches only admin tooling and tests.
3. Owner review, then merge after PR #16.
4. `send-to-vps.sh` from `main` to `~/media-test-stage/admin`. No installation, no restart.
   - **Bootstrap of the gate:** right after the transfer, and before any closing, `13-engine.sh observe` (15 min, read-only, downloads open) writes the first record. Without it, the next reopening would be refused. Closing, however, always stays possible.
5. Read-only check: `13-engine.sh check <production engine>` must report "already is the expected bundle" and `egress_probe=dropped`.
6. First real engine window (for example PR #7), W0–W9, each step authorized.

## 4. Estimate

| Commits | Duration |
|---|---|
| C1 | ½ day |
| C2 | 1 day |
| C3 | 1½ days |
| C4 | 1 day |
| C5 and C6 (with the fixtures of the existing suites) | 1 day |
| mutations and real bundles | 1 day |
| C7 | ½ day |
| **Total** | **about 6½ days**, over several sessions |

## 5. Residual risks

Risks that remain after implementation, for the owner to accept or reduce:

| # | Risk | Probability / impact | Mitigation in place | What remains |
|---|---|---|---|---|
| R1 | **A crash restart on the same bundle** is not gated (decision 1); a flapping engine or gateway on unchanged code can be reopened without observation | low / medium | `release_drift`; the existing monitoring (`NRestarts`, journal); `close` is never blocked | owner's choice; a later "close if `NRestarts` rises" alert is possible |
| R2 | **A manual change outside the tools** (a drop-in edited by hand while keeping the same bundle, a change to `worker.env`) is not seen by the gate | low / high | `release_drift` (bundle, process, ctime); the CI guard (`guard-update.py list`) on the guarded files; the CI promoter refuses while a guarded file differs | the procedure stays: only the tools, every operation recorded |
| R3 | **Records trusted only when root-owned `0600` in a `0700` directory:** root can write a false record | very low / high | same trust model as the whole toolkit (root administrator) | accepted |
| R4 | **Clock:** markers and records use UTC wall time; a large clock jump could mis-order them | very low / medium | NTP on the VPS; the bundle comparison does not depend on the clock | accepted; check `timedatectl` at W0 |
| R5 | **Egress probe:** one packet from the worker uid to `10.255.255.1:9`. If the rule were absent, that packet would leave once toward a private address. The cloud metadata address (`169.254.169.254`) is never used. | very low / low | dropped locally by nft (the counter moves); a probe not dropped means `OBSERVATION FAILED` or a refused `check` | accepted |
| R6 | **15 minutes do not exercise the media paths** (no real download during the observation): a bug on a rare path only shows at W9 | medium / medium | W9 real tests right after opening; close in seconds (never blocked) | inherent; an observation has no traffic |
| R7 | **HUP during the 60 s settling period** (dropped SSH connection) triggers the rollback | medium / low (safe: downloads closed) | run inside `tmux`; the rollback is verified | at worst one window to redo |
| R8 | **Window of about 30 minutes** with downloads closed | certain / low | the site and SEO stay online; announced in the plan of the window | accepted |
| R9 | **Disk growth:** bundles are never removed | certain / low | `check` refuses below 1 GiB free | manual pruning, separate and named |
| R10 | **Bootstrap forgotten:** without a first observation, the next reopening is refused | medium / low (closing still possible) | delivery step 4; the refusal message gives the command | 15 minutes of waiting at worst |
| R11 | **Updating the existing tests (C6):** their opening fixtures change | certain / low | the closing cases are untouched; a new "`open` refused without observation" case is added; review of the fixtures in the PR | review |
| R12 | **The units stay as they are** (`Requires=`): an engine restart always cuts the gateway | certain / low (downloads closed) | E5, E6, verification of the gateway on the same bundle | accepted (decision 1 of 20/10) |
