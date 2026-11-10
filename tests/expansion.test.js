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
console.log(`${passed} tests passed`);
