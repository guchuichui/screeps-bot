const assert = require('assert');
const { world } = require('./world');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

test('normal inter-room movement retains task association', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); let moves = 0;
  c.moveTo = () => { moves++; return 0; }; w.Game.time++; w.manager.run();
  assert.equal(moves, 1); assert.equal(w.task().creepName, c.name);
});
test('EXIT_UNREACHABLE retries the same living Claimer then recovers', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); c.pos.x = 34; c.pos.y = 21; c.ticksToLive = 450;
  c.pos.findClosestByPath = () => null; w.Game.time++; w.manager.run();
  assert.equal(w.task().failureReason, 'EXIT_UNREACHABLE'); assert.equal(w.task().creepName, c.name);
  c.pos.findClosestByPath = () => ({ x: 24, y: 49 }); let moved = false;
  c.moveTo = () => { moved = true; return 0; }; w.Game.time += 5; w.manager.run(); w.spawnNext();
  assert(moved); assert.equal(w.task().status, 'running'); assert.equal(w.calls.length, 1);
});
test('legacy orphan is safely rebound without spawning a replacement', () => {
  const w = world(); w.spawnNext(); const c = w.unit();
  delete w.task().creepName; w.task().status = 'waiting'; w.task().failureReason = 'EXIT_UNREACHABLE';
  w.Game.time++; w.manager.run(); w.spawnNext();
  assert.equal(w.task().creepName, c.name); assert.equal(w.task().attempts, 1); assert.equal(w.calls.length, 1);
});
test('foreign task tag cannot be rebound', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); delete w.task().creepName;
  c.memory.targetRoom = 'E99S99'; w.manager.run(); assert.equal(w.task().creepName, undefined);
});
test('path retries are bounded and keep the live association', () => {
  const w = world({ maxPathRetries: 2 }); w.spawnNext(); const c = w.unit(); c.pos.findClosestByPath = () => null;
  for (let i = 0; i < 5; i++) { w.Game.time += 30; w.manager.run(); }
  assert.equal(w.task().status, 'blocked'); assert.equal(w.task().pathRetries, 3);
  assert.equal(w.task().creepName, c.name); w.spawnNext(); assert.equal(w.calls.length, 1);
});
test('border movement crosses even when pathfinder returns null', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); c.pos.y = 49;
  c.pos.findClosestByPath = () => null; let direction;
  c.move = d => { direction = d; return 0; }; w.Game.time++; w.manager.run(); assert.equal(direction, 5);
});
test('GCL shortage allows travel but waits at controller', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); w.Game.gcl.level = 1; let moves = 0;
  c.moveTo = () => { moves++; return 0; }; w.Game.time++; w.manager.run(); assert.equal(moves, 1);
  c.room = w.target(); c.pos.roomName = c.room.name;
  c.claimController = () => { throw Error('must wait for GCL'); };
  w.Game.time++; w.manager.run(); assert.equal(w.task().lastResult.code, 'GCL_WAIT');
});
test('CPU wait does not abandon or age out a living task', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); w.Game.cpu.bucket = 0;
  w.Game.time += 700; w.manager.run(); assert.equal(w.task().creepName, c.name);
  w.Game.cpu.bucket = 10000; w.manager.run(); assert.equal(w.task().status, 'running');
});
test('moving old mission is not terminated by wall clock age', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); w.Game.time += 700; c.pos.x++;
  w.manager.run(); assert.equal(w.task().status, 'running');
});
test('no progress performs bounded repathing without deleting binding', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); w.manager.run();
  for (let n = 0; n < 76; n++) { w.Game.time++; w.manager.run(); }
  assert.equal(w.task().failureReason, 'NO_PROGRESS');
  assert.equal(w.task().creepName, c.name);
});
test('enemy ownership stops all claim intents', () => {
  const w = world(); w.spawnNext(); const c = w.unit(w.target(0, { owner: { username: 'enemy' } }));
  c.claimController = () => { throw Error('must not claim'); }; w.manager.run(); assert.equal(w.task().status, 'blocked');
});
test('temporary hostile contact waits then resumes the same living unit', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); w.home.hostiles = [{}]; w.Game.time++; w.manager.run();
  assert.equal(w.task().lastResult.code, 'HOSTILE_WAIT'); assert.equal(w.task().creepName, c.name);
  w.home.hostiles = []; w.Game.time++; w.manager.run(); assert.equal(w.task().status, 'running');
  assert.equal(w.calls.length, 1);
});
test('claim intent is confirmed only by later ownership observation', () => {
  const w = world(); w.spawnNext(); const r = w.target(); w.unit(r); w.manager.run();
  assert.equal(w.task().lastResult.code, 'CLAIM_SCHEDULED'); r.controller.my = true; w.Game.time++; w.manager.run();
  assert(['CLAIMED', 'SPAWN_PLANNING'].includes(w.task().state));
});
test('death has finite replacement budget', () => {
  const w = world({ maxAttempts: 1 }); w.spawnNext(); w.Game.time++; w.manager.run();
  w.task(1).status = 'blocked'; w.Game.time += 1000; w.spawnNext();
  assert.equal(w.task().status, 'failed'); assert.equal(w.calls.length, 1);
});
test('runtime emergency stop freezes live units', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); c.moveTo = () => { throw Error('must stop'); };
  w.Memory.expansion.emergencyStop = true; w.Game.time++; w.manager.run(); w.spawnNext(); assert.equal(w.calls.length, 1);
});
function plan(w, room, task) {
  let result;
  for (let i = 0; i < 30; i++) {
    result = w.load('expansion.planner').run(room, task); w.Game.time++;
    if (task.spawnPlan || result.blocked) break;
  }
  return result;
}
test('deterministic terrain planning creates a legal Spawn site once', () => {
  const w = world({ autoBuildSpawn: true }); w.manager.run(); const r = w.target(0, { my: true });
  const result = plan(w, r, w.task()); assert.equal(result.code, 'SPAWN_SITE_SCHEDULED');
  assert(w.task().spawnPlan.x >= 5 && w.task().spawnPlan.x <= 44);
  assert.equal(w.calls.filter(c => c.site === 'spawn').length, 1);
  w.load('expansion.planner').run(r, w.task()); assert.equal(w.calls.filter(c => c.site).length, 1);
  const v = world(); v.manager.run(); plan(v, v.target(0, { my: true }), v.task());
  assert.equal(v.task().spawnPlan.x, w.task().spawnPlan.x); assert.equal(v.task().spawnPlan.y, w.task().spawnPlan.y);
});
test('existing Spawn site is reused without new requests', () => {
  const w = world({ autoBuildSpawn: true }); w.manager.run(); const r = w.target(0, { my: true });
  r.sites = [{ id: 'site', pos: { x: 20, y: 20 }, structureType: 'spawn', my: true }];
  assert.equal(w.load('expansion.planner').run(r, w.task()).state, 'BUILD_SPAWN'); assert.equal(w.calls.length, 0);
});
test('wall-only terrain blocks instead of selecting random coordinates', () => {
  const w = world({ planningBatchSize: 2500 }); w.manager.run(); const r = w.target(0, { my: true });
  r.getTerrain = () => ({ get: () => 1 });
  assert(w.load('expansion.planner').run(r, w.task()).blocked); assert.equal(w.calls.length, 0);
});
test('Spawn construction errors are throttled and bounded', () => {
  const w = world({ autoBuildSpawn: true, planningBatchSize: 2500 }); w.manager.run();
  const r = w.target(0, { my: true }); let requests = 0; r.createConstructionSite = () => { requests++; return -8; };
  for (let i = 0; i < 10; i++) { w.load('expansion.planner').run(r, w.task()); w.Game.time += 100; }
  assert.equal(requests, 5);
});
test('runtime autoBuildSpawn flag prevents site creation but preserves plan', () => {
  const w = world({ autoBuildSpawn: true, planningBatchSize: 2500 }); w.manager.run();
  w.Memory.expansion.autoBuildSpawn = false; const r = w.target(0, { my: true });
  assert.equal(plan(w, r, w.task()).code, 'SPAWN_PLAN_READY'); assert.equal(w.calls.length, 0);
});
test('second target waits until first colony is stable', () => {
  const w = world(); w.target(0, { my: true }); w.spawnNext(); assert.equal(w.calls.length, 0);
  w.task().state = 'STABLE'; w.spawnNext(); assert.equal(w.calls[0].options.memory.targetRoom, 'E22S38');
});
test('owned task enters planning and a completed Spawn enters bootstrap', () => {
  const w = world(); w.manager.run(); const r = w.target(0, { my: true });
  w.manager.run(); assert.equal(w.task().state, 'SPAWN_PLANNING');
  r.structures = [{ my: true, structureType: 'spawn', pos: { x: 20, y: 20 } }];
  w.manager.run(); assert.equal(w.task().state, 'BOOTSTRAP');
});
test('Pioneer travels across rooms and prioritizes first Spawn construction', () => {
  const w = world({ autoBootstrap: true, autoBuildSpawn: true }); w.spawnNext(); const c = w.unit();
  c.memory.role = 'expansionPioneer'; let moved = 0, built = 0;
  c.moveTo = () => { moved++; return 0; }; w.load('expansion.pioneer').run(c, w.task()); assert.equal(moved, 1);
  c.room = w.target(0, { my: true, ticksToDowngrade: 10000 }); c.pos.roomName = c.room.name;
  c.room.sites = [{ structureType: 'spawn', pos: { x: 20, y: 20 } }]; c.build = () => { built++; return 0; };
  w.load('expansion.pioneer').run(c, w.task()); assert.equal(built, 1);
});
test('Pioneer prevents downgrade before building and adopts completed room', () => {
  const w = world({ autoBootstrap: true, autoBuildSpawn: true }); w.spawnNext();
  const r = w.target(0, { my: true, ticksToDowngrade: 1000 }); const c = w.unit(r); c.memory.role = 'expansionPioneer';
  let upgraded = 0; c.upgradeController = () => { upgraded++; return 0; };
  w.load('expansion.pioneer').run(c, w.task()); assert.equal(upgraded, 1);
  r.structures = [{ my: true, structureType: 'spawn', pos: { x: 20, y: 20 } }];
  w.load('expansion.pioneer').run(c, w.task()); assert.equal(c.memory.colony, r.name); assert.equal(c.memory.role, 'colonyHarvester');
});
test('support population is dynamic, budgeted and same-tick deduplicated', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); const r = w.target(0, { my: true });
  r.sites = [{ structureType: 'spawn', progress: 0, progressTotal: 15000 }];
  w.spawnNext(); w.spawnNext(); assert.equal(w.calls.length, 1); assert.equal(w.calls[0].options.memory.role, 'expansionPioneer');
  w.task().supportLaunches = 12; w.Game.time += 100; w.spawnNext(); assert.equal(w.calls.length, 1);
});
test('weak mother base never funds Pioneer', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); w.target(0, { my: true });
  w.counts.worker = 0; w.spawnNext(); assert.equal(w.calls.length, 0);
  w.counts.worker = 6; w.home.energyAvailable = 400; w.spawnNext();
  assert.equal(w.calls.length, 0); assert.equal(w.task().supportResult, 'HOME_SUPPORT_ENERGY_WAIT');
});
test('autoBootstrap off freezes Pioneer work', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); c.memory.role = 'expansionPioneer';
  c.moveTo = () => { throw Error('must stop'); }; w.load('expansion.pioneer').run(c, w.task());
  assert.equal(c.memory.lastAction, undefined);
});
function economicSpawn(w, room) {
  const s = { ...w.spawn, name: `spawn-${room.name}`, room, pos: { x: 20, y: 20 } };
  room.energyAvailable = 300; room.energyCapacityAvailable = 300;
  room.structures = [{ ...s, my: true, structureType: 'spawn' }];
  w.Game.spawns[s.name] = s;
  return s;
}
test('completed Spawn registers colony and produces a 200-energy recovery worker', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); const r = w.target(0, { my: true });
  const s = economicSpawn(w, r); r.energyAvailable = 200; w.manager.run();
  w.load('colony.manager').trySpawn(s); const call = w.calls.find(c => c.body);
  assert.equal(call.options.memory.role, 'colonyHarvester'); assert.equal(call.body.length, 3);
  assert.equal(call.options.memory.home, r.name); assert.equal(call.options.memory.colony, r.name);
});
test('local multiple Spawns deduplicate same-tick last population deficit', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); const r = w.target(0, { my: true });
  const s = economicSpawn(w, r); w.manager.run();
  // One existing worker for two local harvester slots leaves one deficit.
  w.Game.creeps.local = { memory: { role: 'colonyHarvester', colony: r.name, home: r.name },
    ticksToLive: 1000, getActiveBodyparts: () => 1 };
  w.load('colony.manager').trySpawn(s); w.load('colony.manager').trySpawn(s);
  assert.equal(w.calls[0].options.memory.role, 'colonyHarvester');
  assert.equal(w.calls[1].options.memory.role, 'colonyUpgrader');
});
test('foreign-room workers are not counted in local economy', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); const r = w.target(0, { my: true });
  const s = economicSpawn(w, r); w.manager.run();
  w.Game.creeps.foreign = { memory: { role: 'colonyHarvester', colony: 'E22S38', home: 'E22S38' },
    ticksToLive: 1000, getActiveBodyparts: () => 1 };
  w.load('colony.manager').trySpawn(s); assert.equal(w.calls[0].options.memory.role, 'colonyHarvester');
});
test('local energy starvation requests mother aid rather than an invalid tiny body', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); const r = w.target(0, { my: true });
  const s = economicSpawn(w, r); r.energyAvailable = 0; w.manager.run(); w.load('colony.manager').trySpawn(s);
  assert.equal(w.calls.length, 0); w.spawnNext(); assert.equal(w.calls[0].options.memory.role, 'expansionPioneer');
});
test('local role tags remain isolated when automation is stopped', () => {
  const w = world({ enabled: false }); w.Game.creeps = {
    local: { memory: { role: 'colonyHarvester', home: 'E22S37', colony: 'E22S37' } }
  };
  w.load('starter.colony').run(); assert.equal(w.Game.creeps.local.memory.role, 'colonyHarvester');
  assert.equal(w.calls[0].options.memory.role, 'worker');
});
test('full cargo harvesters refill Spawn before optional construction', () => {
  const w = world({ autoBootstrap: true }); w.spawnNext(); const r = w.target(0, { my: true });
  const c = w.unit(r); c.memory.role = 'colonyHarvester'; c.memory.colony = r.name; c.memory.home = r.name;
  r.structures = [{ my: true, structureType: 'spawn', store: { getFreeCapacity: () => 300 } }];
  c.pos.findClosestByPath = values => Array.isArray(values) ? values[0] : null;
  let transfers = 0; c.transfer = () => { transfers++; return 0; };
  w.load('colony.worker').run(c); assert.equal(transfers, 1);
});
test('distinct harvesting stations avoid Pioneer and local worker overlap', () => {
  const w = world(); w.spawnNext(); const r = w.target(0, { my: true }); const a = w.unit(r);
  a.memory.colony = r.name; a.pos.findClosestByPath = list => list[0]; a.pos.getRangeTo = () => 1;
  w.load('colony.work').harvest(a);
  const b = { ...a, name: 'second', memory: { colony: r.name }, pos: { ...a.pos } };
  w.Game.creeps[b.name] = b; w.load('colony.work').harvest(b);
  assert.notDeepEqual(a.memory.sourceSlot, b.memory.sourceSlot);
});
test('global reset reloads managers without replacing a live Claimer', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); w.Game.time++; w.manager.run();
  const name = w.task().creepName; w.resetModules(); w.Game.time++; w.load('expansion.manager').run();
  assert.equal(w.task().creepName, name); assert.equal(w.task().attempts, 1); assert.equal(w.calls.length, 1);
  assert.equal(w.task().diagnostic.ttl, c.ticksToLive);
});
test('global reset preserves partial terrain scan and site attempt budget', () => {
  const w = world(); w.manager.run(); const r = w.target(0, { my: true }); w.manager.run();
  const cursor = w.task().planning.cursor; w.task().siteAttempts = 2; w.resetModules(); w.Game.time++;
  w.load('expansion.manager').run(); assert(w.task().planning.cursor > cursor); assert.equal(w.task().siteAttempts, 2);
});
test('paused task resumes same Claimer without a no-progress failure', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); w.manager.run(); w.task().paused = true;
  w.Game.time += 100; w.manager.run(); w.task().paused = false; w.Game.time++; w.manager.run();
  assert.equal(w.task().creepName, c.name); assert.equal(w.task().status, 'running');
});
test('runtime enabled and autoClaim switches stop then resume existing unit', () => {
  for (const key of ['enabled', 'autoClaim']) {
    const w = world(); w.spawnNext(); const c = w.unit(); let moves = 0; c.moveTo = () => { moves++; return 0; };
    w.manager.run(); const before = moves; w.Memory.expansion[key] = false;
    for (let i = 0; i < 100; i++) { w.Game.time++; w.manager.run(); }
    assert.equal(moves, before); w.Memory.expansion[key] = true; w.Game.time++; w.manager.run();
    assert(moves > before); assert.equal(w.task().attempts, 1);
  }
});
test('bounded repath exhaustion does not remain stuck after the unit actually dies', () => {
  const w = world({ maxPathRetries: 1 }); w.spawnNext(); const c = w.unit(); c.pos.findClosestByPath = () => null;
  w.Game.time++; w.manager.run(); w.Game.time += 10; w.manager.run(); assert.equal(w.task().state, 'BLOCKED');
  delete w.Game.creeps[c.name]; w.Game.time++; w.manager.run(); assert.equal(w.task().status, 'waiting');
  w.Game.time += 200; w.spawnNext(); assert.equal(w.calls.length, 2);
});
test('damage blocks live unit and death allows budgeted replacement', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); c.getActiveBodyparts = () => 0;
  w.Game.time++; w.manager.run(); assert.equal(w.task().state, 'BLOCKED'); assert.equal(w.task().creepName, c.name);
  delete w.Game.creeps[c.name]; w.Game.time++; w.manager.run(); assert.equal(w.task().status, 'waiting');
});
test('one target exception does not stop other owned-room planning', () => {
  const w = world(); w.manager.run(); const a = w.target(0, { my: true }); w.target(1, { my: true });
  a.getTerrain = () => { throw Error('bad snapshot'); }; w.manager.run();
  assert.equal(w.task().state, 'BLOCKED'); assert.equal(w.task(1).state, 'SPAWN_PLANNING');
});
test('low CPU defers construction and local economy without unsafe calls', () => {
  const w = world({ autoBootstrap: true, autoBuildSpawn: true }); w.manager.run(); const r = w.target(0, { my: true });
  const s = economicSpawn(w, r); w.Game.cpu.bucket = 0; w.manager.run(); w.load('colony.manager').run();
  w.load('colony.manager').trySpawn(s); assert.equal(w.calls.length, 0); assert.equal(w.Memory.colonies[r.name].waitReason, 'CPU_WAIT');
});
test('post-bootstrap ownership loss blocks instead of claiming again', () => {
  const w = world(); w.manager.run(); const r = w.target(0, { my: true }); economicSpawn(w, r); w.manager.run();
  r.controller.my = false; w.Game.time++; w.manager.run(); assert.equal(w.task().failureReason, 'OWNERSHIP_LOST');
});
test('three local Spawns account for all same-tick pending roles', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); const r = w.target(0, { my: true });
  const s = economicSpawn(w, r); w.manager.run();
  for (let n = 0; n < 4; n++) w.load('colony.manager').trySpawn({ ...s, name: `local-${n}` });
  assert.equal(w.calls.length, 3); assert.equal(new Set(w.calls.map(c => c.name)).size, 3);
  assert.deepEqual(w.calls.map(c => c.options.memory.role), ['colonyHarvester', 'colonyHarvester', 'colonyUpgrader']);
});
test('RCL2 core planning uses legal unlocked Extensions and obeys cooldown', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); const r = w.target(0, { my: true, level: 2 });
  economicSpawn(w, r); w.manager.run(); const cm = w.Memory.colonies[r.name];
  w.load('colony.planner').run(r, cm); w.load('colony.planner').run(r, cm);
  assert.equal(w.calls.filter(c => c.site).length, 1); assert.equal(w.calls[0].site, 'extension');
});
test('invalid configuration fails closed and default feature flags are explicit', () => {
  const w = world({ maxPathRetries: NaN }); w.manager.run(); assert.equal(w.Memory.expansion.configError, 'INVALID_CONFIG');
  const cfg = require('../code/expansion.config');
  assert(cfg.enabled && cfg.autoClaim && cfg.autoBuildSpawn && cfg.autoBootstrap); assert.equal(cfg.emergencyStop, false);
});
test('Spawn plan preserves resource buffers and future expansion space', () => {
  const w = world({ planningBatchSize: 2500 }); w.manager.run(); const r = w.target(0, { my: true });
  plan(w, r, w.task()); const p = w.task().spawnPlan;
  assert(Math.max(Math.abs(p.x - 10), Math.abs(p.y - 10)) > 3);
  assert(Math.max(Math.abs(p.x - 40), Math.abs(p.y - 40)) > 4);
  assert(p.reserved.extensions.length > 10 && p.reserved.futureCore.length === 3);
});
test('room snapshot requires vision and captures terrain explicitly', () => {
  const w = world(); assert.equal(w.load('expansion.planner').snapshot('E22S37').error, 'NO_VISION');
  w.target(); const snapshot = w.load('expansion.planner').snapshot('E22S37');
  assert.equal(snapshot.terrain.length, 2500); assert.equal(snapshot.sources.length, 1);
});
test('Pioneer entry step moves inward instead of bouncing back across border', () => {
  const w = world({ autoBootstrap: true }); w.spawnNext(); const c = w.unit(w.target(0, { my: true }));
  c.memory.role = 'expansionPioneer'; c.pos.y = 0; let direction;
  c.move = d => { direction = d; return 0; }; w.load('expansion.pioneer').run(c, w.task()); assert.equal(direction, 5);
});
test('support permanent spawn errors are bounded independently of launch budget', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); w.target(0, { my: true }); let attempts = 0;
  w.spawn.spawnCreep = () => { attempts++; return -10; };
  for (let i = 0; i < 8; i++) { w.spawnNext(); w.Game.time += 100; }
  assert.equal(attempts, 3); assert.equal(w.task().supportResult, 'SUPPORT_SPAWN_ERRORS_EXHAUSTED');
});
test('runtime autoBootstrap flag pauses local production without native takeover', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); const r = w.target(0, { my: true });
  const s = economicSpawn(w, r); w.manager.run(); w.Memory.expansion.autoBootstrap = false;
  w.load('colony.manager').trySpawn(s); assert.equal(w.calls.length, 0);
  w.Memory.expansion.autoBootstrap = true; w.load('colony.manager').trySpawn(s); assert.equal(w.calls.length, 1);
});
test('local raw population cap bounds repeated replacement of damaged units', () => {
  const w = world({ autoBootstrap: true, maxLocalPopulation: 2 }); w.manager.run(); const r = w.target(0, { my: true });
  const s = economicSpawn(w, r); w.manager.run();
  for (let i = 0; i < 2; i++) w.Game.creeps[`broken${i}`] = { memory: { colony: r.name, home: r.name, role: 'colonyHarvester' },
    ticksToLive: 10, getActiveBodyparts: () => 0 };
  w.load('colony.manager').trySpawn(s); assert.equal(w.calls.length, 0);
  assert.equal(w.Memory.colonies[r.name].waitReason, 'LOCAL_POPULATION_CAP');
});
test('bootstrap registration adopts only destination workers and preserves mother', () => {
  const w = world(); w.manager.run(); const r = w.target(0, { my: true });
  w.Game.creeps.existingLocal = { memory: { home: r.name, role: 'worker' } }; w.manager.run();
  assert.equal(w.Game.creeps.existingLocal.memory.colony, r.name);
  assert.equal(w.Game.creeps.worker0.memory.role, 'worker'); assert.equal(w.Game.creeps.worker0.memory.colony, undefined);
});
test('PR1 live snapshot: critical mother recovery remains protected', () => {
  const captured = require('./fixtures/pioneer-console-84190469.json');
  const w = world({ autoBootstrap: true }); w.manager.run(); w.target(0, { my: true });
  w.Game.time = captured.tick; w.home.controller.level = captured.home.rcl; w.home.energyAvailable = captured.home.energy;
  w.Game.creeps = {};
  for (const row of captured.population) w.Game.creeps[row.name] = {
    name: row.name, memory: { role: row.role, home: 'E22S36' }, ticksToLive: row.ttl, spawning: row.spawning,
    getActiveBodyparts: part => row[part] || 0
  };
  w.spawn.spawning = captured.spawns[0].spawning;
  w.load('main').loop(); assert.equal(w.calls.length, 0);
  const snapshot = w.load('expansion.observe').snapshot();
  assert.equal(snapshot.spawns[0].spawning.remainingTime, 11); assert.equal(snapshot.rooms.E22S36.energy, 104);
  w.spawn.spawning = null; w.Game.time++;
  assert.equal(w.load('expansion.manager').trySupport(w.spawn, { worker: 7, defender: 1 }, { worker: 9, defender: 1 }), false);
  assert.equal(w.Memory.expansion.supportWait.reason, 'HOME_CRITICAL_WORKFORCE_WAIT');
});
test('Pioneer gets priority below optional RCL6 worker target once core is safe', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); w.target(0, { my: true });
  w.home.controller.level = 6; w.home.energyAvailable = 800;
  for (let i = 0; i < 6; i++) w.Game.creeps[`worker${i}`].getActiveBodyparts = part => part === 'work' ? 3 : ['carry', 'move'].includes(part) ? 1 : 0;
  w.load('starter.colony').run();
  assert.equal(w.calls[0].options.memory.role, 'expansionPioneer');
  const cost = w.calls[0].body.reduce((n, p) => n + w.constants.BODYPART_COST[p], 0);
  assert(cost <= 500 && w.home.energyAvailable - cost >= 300);
});
test('noncritical idle defender deficit does not veto necessary Pioneer', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); w.target(0, { my: true });
  w.counts.defender = 0; w.spawnNext(); assert.equal(w.calls[0].options.memory.role, 'expansionPioneer');
});
test('energy reservation yields to home production after its finite window', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); w.target(0, { my: true }); w.home.energyAvailable = 494;
  assert(w.manager.trySupport(w.spawn, w.counts, w.targets)); assert.equal(w.calls.length, 0);
  assert.equal(w.Memory.expansion.supportWait.reason, 'RESERVING_SUPPORT_ENERGY');
  w.Game.time += 51;
  assert.equal(w.manager.trySupport(w.spawn, w.counts, w.targets), false);
  assert.equal(w.Memory.expansion.supportWait.reason, 'SUPPORT_ENERGY_WINDOW_EXPIRED');
  w.resetModules(); w.Game.time++; assert.equal(w.load('expansion.manager').trySupport(w.spawn, w.counts, w.targets), false);
});
test('support energy reservation releases immediately when home is attacked', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); w.target(0, { my: true }); w.home.energyAvailable = 494;
  assert(w.manager.trySupport(w.spawn, w.counts, w.targets)); w.home.hostiles = [{}]; w.Game.time++;
  assert.equal(w.manager.trySupport(w.spawn, w.counts, w.targets), false); assert.equal(w.Memory.expansion.supportWait.reason, 'HOME_HOSTILES');
});
test('confirmed claimed room without vision gets finite Pioneer recovery dispatch', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); w.task().claimedAt = 1; w.task().state = 'BUILD_SPAWN';
  for (let i = 0; i < 5; i++) { w.spawnNext(); w.Game.time += 501; }
  assert.equal(w.calls.length, 2); assert.equal(w.task().visionRecoveryLaunches, 2);
  assert(w.calls.every(c => c.options.memory.role === 'expansionPioneer'));
});
test('unconfirmed unseen target cannot consume a Pioneer recovery budget', () => {
  const w = world({ autoBootstrap: true, autoClaim: false }); w.manager.run(); w.spawnNext();
  assert.equal(w.calls.length, 0); assert.equal(w.task().supportResult, 'NO_CONFIRMED_BOOTSTRAP_TARGET');
});
test('live Pioneer movement diagnostics and observer do not execute game operations', () => {
  const w = world({ autoBootstrap: true }); w.manager.run(); w.target(0, { my: true }); w.spawnNext();
  const c = { name: 'pioneer', memory: { ...w.calls[0].options.memory, lastAction: { code: 'NO_PATH', tick: w.Game.time } },
    getActiveBodyparts: () => 1, room: w.home, pos: { x: 34, y: 21 }, ticksToLive: 1400 };
  w.Game.creeps.pioneer = c; const before = JSON.stringify(w.Memory); const callCount = w.calls.length;
  const snapshot = w.load('expansion.observe').snapshot();
  assert.equal(JSON.stringify(w.Memory), before); assert.equal(w.calls.length, callCount);
  assert.equal(snapshot.creeps.find(row => row.name === 'pioneer').lastAction.code, 'NO_PATH');
  w.load('expansion.observe').run(); const observedAt = w.Memory.expansion.observation.tick;
  w.Game.time++; w.load('expansion.observe').run(); assert.equal(w.Memory.expansion.observation.tick, observedAt);
});
test('scenario: claim to stable local economy survives global reset with bounded aid', () => {
  const result = require('./scenario')();
  assert(result.trace.includes('BUILD_SPAWN') && result.trace.includes('BOOTSTRAP') && result.trace.includes('STABLE'));
  console.log(`SCENARIO ${JSON.stringify(result)}`);
});
console.log(`${passed} tests passed`);
