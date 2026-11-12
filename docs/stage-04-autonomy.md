# Stage 04 construction and recovery

The executor runs on shard3 only. GitHub Actions for `codex/stage04-autonomy` runs the offline suites and uploads the branch to the configured Screeps `agent-test` destination. A successful upload and a fresh `stage04-autonomy-v2` runtime observation are independently checked.

## E22S36 (historical Plan A)

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

## Plan B review hold (historical) and E22S37 growth

`homeConstructionHold` suspends the E22S36 executor and the home workers' Stage 04 site building while the plan B construction map is pending confirmation. Existing sites and their progress are retained. The E22S37 and E22S38 executors continue separately.

The initial E22S37 growth policy targeted nine local economic creeps. The majority of available positions go to upgraders before RCL4, with harvesting, Spawn refill and a site builder kept available. At RCL4, Storage gets first construction priority and two builders are requested during construction. Once owned Storage is online and stored energy remains at (13,23), two population slots go to CARRY/MOVE haulers. Haulers share the existing salvage reservations and deliver to Storage. Tower and Extension planning resume after Storage. The RCL4 and hauling milestones require live confirmation.

## Active E22S36 plan B, approved revision 03

`code/stage04.plan-b.js` fixes the approved coordinates for the 58 Extension, three Spawn and four Link end state. Keep (27,34) and (28,33) open, keep Extension (34,27), and preserve both roads in Y27¨CY32. The north Spawn stays. Build the first south Spawn at RCL7 and the second at RCL8. Only the two obsolete Plan A sites are eligible for early cancellation, after an approved replacement is observed built.

At RCL6, fill to 40 completed Extensions and build the approved roads. The old Extensions stay while RCL6 is limited to 2,300 Spawn energy capacity. At RCL7+, finish each available replacement before retiring the next old Extension. Each demolition checks continuous economic observations, no scheduled or ongoing production, and at least the native 50-part Worker cost (3,750) in **both** projected available Spawn/Extension energy and active capacity after subtracting the target's energy and capacity. Observe the result before proceeding. Later stages preserve the same floor.

The old Storage at (36,16) is drained first. Both the original and the first south Spawn must be active and charged, and the new Storage tile and its routes must pass validation before removal. Rebuild at (30,33). The two exact obsolete empty Links are retired after the migration, then the four approved Links are built. The source pair feeds the Storage hub by default, prioritizing the Controller receiver during downgrade risk. All phases keep the existing Worker and Spawn management.

## E22S37 compact economy

At RCL3, the live colony had one Source, three walkable harvest stations and twelve local creeps, including ten Upgraders. The new target is four economic creeps in normal operation: two Harvesters and two Upgraders. Construction trades one Upgrader position for a Builder. After Storage is built, one Hauler is requested only while the (13,23) stash remains and Storage can accept energy. If hauling and construction overlap, five economic creeps can be useful. A Defender remains threat-driven.

Healthy existing workers can be reassigned into vacant critical roles. Surplus creeps age out, and regular production waits for a free population slot. A missing healthy Harvester still permits emergency recovery. Other rooms keep their existing policies.
