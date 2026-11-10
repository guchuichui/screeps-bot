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
  assert.equal(w.task().state, 'CLAIMED');
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
console.log(`${passed} tests passed`);
