# Screeps colony controller

The controller dynamically strengthens WORK/CARRY/MOVE workers up to the energy currently available, up to the 50-part game limit. It keeps a multi-purpose workforce (scaled with controller level and active construction sites). Existing harvester, builder and upgrader creeps are automatically migrated to the unified worker role.

The planner follows the official RCL building limits. It constructs the five Extensions allowed at RCL2 before road work, prioritizes the first Tower and next Extensions at RCL3, then continues the higher-level building queue. Workers harvest until their personal energy stores are full, then stay in work mode until empty: refill Spawns/Extensions when room energy is below capacity, assign one worker at a time to refill Towers below 80%, build, repair roads and other damaged structures, then upgrade the Controller. Workers choose reachable targets by path; an unreachable Tower target releases its refill lock so other work can continue.

Towers attack hostiles first and otherwise repair damaged structures or reinforce Ramparts. Safe Mode activates when an available charge detects a hostile threat. Defenders spawn when needed. Layout placement adapts to terrain and room occupancy, but does not claim neighboring rooms or calculate a sealed perimeter.

## Emergency claim-only expansion

`expansion.config.js` enables a separate, bounded expansion manager. It is configured for home `E22S36`, with targets `E22S37`, then `E22S38`. Room names are specified only in configuration. The current release stops at `CLAIMED`: it does not create construction sites, dismantle buildings, deploy Pioneers, or maintain the new controllers. Arrange builders and controller maintenance promptly after claiming; claiming alone does not establish a sustainable colony.

The existing colony runs its workers, planning and defense first. Expansion roles are excluded from legacy role normalization, including while disabled or retired. A Claimer is spawned only when the native population targets are met, all required workers have at least 150 ticks remaining, no hostiles are present at home, CPU is available, and the selected body leaves 300 spawn/extension energy in reserve. The preferred body is one CLAIM and five MOVE (850 energy), requiring 1,150 available energy with the default reserve. Smaller bodies are allowed only when the conservative route/lifetime estimate fits. A longer route or inadequate energy causes waiting rather than changing native population policy.

There is at most one expansion unit globally, including spawning, returning, and quarantined units. Each target permits two successful launches total, separated by at least 200 ticks after failure. Failed living units remain isolated until they expire. A successfully claimed unit returns to the home Spawn for recycling before the next unit can launch. Repeated permanent spawn errors are separately limited to three per target. GCL shortage waits without creating another unit; a rejected claim, foreign ownership/reservation, hostile contact, or unsafe route latches a blocked status for inspection. No controller attack or fallback reservation is performed.

`SCOUT` means target ownership is not yet visible; the Claimer itself supplies vision. A visible neutral controller advances to `CLAIM`. `claimController() === OK` is recorded as `CLAIM_SCHEDULED`; only observed `controller.my` confirms `CLAIMED`. `BUILD_SPAWN`, `BOOTSTRAP`, and `STABLE` are reserved future phases. Losing sight after confirmation does not restart spawning; observed loss of ownership blocks the task.

Inspect in the game console:

```javascript
JSON.stringify(Memory.expansion, null, 2)
// Each task key is "homeRoom:targetRoom" and includes state, status,
// attempts, failureReason, lastResult, lastSeenAt and creepName.
```

Immediate stop, including existing units:

```javascript
Memory.expansion.emergencyStop = true
```

Resume existing eligible tasks with `Memory.expansion.emergencyStop = false`. This does not reset exhausted or blocked tasks. Setting configuration `enabled: false`, `emergencyStop: true`, or `autoClaim: false` also stops expansion. Keep task-tag isolation in place while any managed units are alive.

After diagnosing and resolving a blocker, an operator may explicitly rearm a task. First stop expansion and ensure no expansion units are alive or spawning. Then delete only the selected task and resume; this resets that task's attempt budget and is intentionally a manual action:

```javascript
// Example for the configured first target, only after the checks above:
delete Memory.expansion.tasks['E22S36:E22S37']
Memory.expansion.emergencyStop = false
```

Route, GCL, ownership, reservation, lifetime and CPU decisions depend on live game state. Local owned-room counts are a GCL preflight check; the claim API result is authoritative, including restrictions not visible from this shard. Routes are cached for 100 ticks, limited to five rooms, and avoid known enemies, closed rooms and configured `avoidRooms`. Unknown rooms cannot be guaranteed safe. Terrain-based travel time is an estimate; movement failures, no progress for 75 ticks, damaged parts, and low remaining lifetime trigger bounded failure handling.

Validation: run `node tests/expansion.test.js` from the repository root, and syntax-check project JavaScript with `node --check`. Tests use an isolated mock world and never connect to Screeps. Tests reside outside `code/` so `upload.py` does not upload them.

Deployment: the existing GitHub Actions workflow uploads changes pushed to Git `main` into Screeps branch `agent-test`. It does not select the active game branch. Switch the game branch manually only when ready; this configuration is enabled on activation. Roll back by first stopping expansion, then reverting the expansion commit or switching to the previous game code branch. Code rollback does not refund energy or undo claims, and no automatic `unclaim` is provided.
