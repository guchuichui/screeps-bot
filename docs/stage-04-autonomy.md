# Stage 04 construction and recovery

The executor runs on shard3 only. GitHub Actions for `codex/stage04-autonomy` runs the offline suites and uploads the branch to the configured Screeps `agent-test` destination. A successful upload and a fresh `stage04-autonomy-v2` runtime observation are independently checked.

## E22S36

1. Construct the ten approved Extension coordinates from `docs/stage-03-revision/`, checking live terrain, quotas, occupancy and reachable infrastructure for each site. Safe coordinates can proceed while another is blocked.
2. Require all ten owned active Extensions, observed recent harvesting and Spawn refill, at least three healthy Workers with six WORK parts, and a continuous healthy window of 50 ticks. Before each old Extension retirement, retain at least 1,800 Spawn capacity and at least 55% of available capacity in energy after subtracting the retired Extension's charge.
3. Retire only the listed owned Extensions and the two listed empty idle Links. Recheck owned Controller, threats, layout and economy before each removal. Observe each completed removal before starting another.
4. Construct the approved roads. Infill open RCL Extension slots without occupying Source stations, reserved corridors or future Link tiles. Build two Source Links and the Storage Link.
5. Source Links at (29,24) and (38,26) send to the Storage Link at (37,14) when the sender is ready and the receiver has capacity. The room retains existing workers and Spawn refill priority. The Screeps engine applies the 3% transfer loss. A missing or inactive endpoint leaves Workers on the existing fallback.

In the recorded Stage 03 geometry, building (37,13) while all old structures remain cuts access to five existing Extensions. The executor blocks that tile and holds all home demolition if that geometry persists. It records the conflicting tile so the layout or construction sequence can be revised explicitly.

## E22S37 and E22S38

Cancel owned obsolete Container sites. Local units can withdraw remaining energy from a reachable retiring Container. Empty Containers are destroyed in owned safe rooms. A Container holding other resources is recorded as waiting for drain.

E22S38's narrowly scoped recovery verifies the historical `ERR_RCL_NOT_ENOUGH`, known foreign Spawn at (15,31), local ownership, no hostile units, and home energy, population and support budgets. It never destroys an owned Spawn. After the stale quota blocker is observed gone, it resets only the exhausted Spawn-site attempt state once. If E22S38 remains without an owned Spawn and approaches downgrade, the confirmed recovery is eligible for aid while E22S37 replaces its local workers. The mother-base reserves, support budgets and normal Claimer ordering still apply.

## Observation and controls

`Memory.expansion.stage04` persists the phases, safety reasons, bounded intent history, confirmed results and Link outcomes. Runtime telemetry also reports the GCL. A successful intent alone does not prove completion. Existing `Memory.expansion.emergencyStop` stops Stage 04 and expansion. `Memory.expansion.stage04Paused = true` stops Stage 04 while allowing the existing economy and expansion managers to continue. Restoring the prior code stops new Stage 04 intents. Completed construction and demolition are persistent game changes.

Run `node tests/check-syntax.js`, `node tests/expansion.test.js` and `python -m unittest discover -s tests -p 'test_*.py'` from the repository root.
