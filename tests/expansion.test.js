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
  w.Game.time += 76; w.manager.run(); assert.equal(w.task().failureReason, 'NO_PROGRESS');
  assert.equal(w.task().creepName, c.name);
});
test('enemy ownership stops all claim intents', () => {
  const w = world(); w.spawnNext(); const c = w.unit(w.target(0, { owner: { username: 'enemy' } }));
  c.claimController = () => { throw Error('must not claim'); }; w.manager.run(); assert.equal(w.task().status, 'blocked');
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
console.log(`${passed} tests passed`);
