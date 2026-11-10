// Offline tests only: no Screeps API, network, credentials or upload script.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
function test(name, fn) {
  fn(); passed++;
  console.log(`PASS ${name}`);
}
function world(overrides = {}) {
  const constants = {
    OK: 0, ERR_NOT_OWNER: -1, ERR_NO_PATH: -2, ERR_NAME_EXISTS: -3, ERR_BUSY: -4,
    ERR_NOT_ENOUGH_ENERGY: -6, ERR_INVALID_TARGET: -7, ERR_FULL: -8, ERR_NOT_IN_RANGE: -9,
    ERR_TIRED: -11, ERR_NO_BODYPART: -12, ERR_GCL_NOT_ENOUGH: -15,
    CLAIM: 'claim', MOVE: 'move', WORK: 'work', CARRY: 'carry', ATTACK: 'attack', RANGED_ATTACK: 'ranged_attack',
    FIND_HOSTILE_CREEPS: 103, FIND_MY_CONSTRUCTION_SITES: 114, FIND_MY_STRUCTURES: 108,
    FIND_STRUCTURES: 107, STRUCTURE_SPAWN: 'spawn', STRUCTURE_TOWER: 'tower', STRUCTURE_STORAGE: 'storage',
    STRUCTURE_TERMINAL: 'terminal', STRUCTURE_ROAD: 'road', STRUCTURE_WALL: 'wall', STRUCTURE_RAMPART: 'rampart',
    BODYPART_COST: { claim: 600, move: 50, work: 100, carry: 50 }, CREEP_CLAIM_LIFE_TIME: 600
  };
  const config = Object.assign({}, require('../code/expansion.config'), overrides);
  const Memory = { creeps: {} };
  const home = { name: config.homeRoom, energyAvailable: 2000, controller: { my: true, level: 3 },
    hostiles: [], find(kind) { return kind === 103 ? this.hostiles : []; } };
  const Game = { time: 100, rooms: { [home.name]: home }, creeps: {}, spawns: {}, gcl: { level: 3 },
    cpu: { bucket: 10000, limit: 100, tickLimit: 500, getUsed: () => 0 },
    map: { findRoute: () => [{ exit: 5, room: config.targetRooms[0] }], getRoomStatus: () => ({ status: 'normal' }) } };
  const calls = [];
  const spawn = { name: 'homeSpawn', room: home, owner: { username: 'me' },
    spawnCreep(body, name, options) { calls.push({ body, name, options }); Memory.creeps[name] = options.memory; return 0; },
    recycleCreep() { calls.push({ recycle: true }); return 0; } };
  Game.spawns[spawn.name] = spawn;
  for (let i = 0; i < 6; i++) Game.creeps[`worker${i}`] = {
    name: `worker${i}`, memory: { home: home.name, role: 'worker' }, ticksToLive: 1000,
    getActiveBodyparts: part => ['work', 'carry', 'move'].includes(part) ? 1 : 0
  };
  const modules = { 'expansion.config': config, 'starter.worker': { run() {} },
    'starter.defender': { run() {}, body: () => [] }, 'starter.planner': { run() {} } };
  const context = vm.createContext({ ...constants, Game, Memory, console: { log() {} }, Set });
  function load(name) {
    if (modules[name]) return modules[name];
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, '../code', `${name}.js`), 'utf8');
    vm.runInContext(`(function(require,module,exports){${source}\n})`, context)(load, module, module.exports);
    return modules[name] = module.exports;
  }
  const manager = load('expansion.manager');
  const task = (index = 0) => Memory.expansion.tasks[`${home.name}:${config.targetRooms[index]}`];
  function target(index = 0, controller = {}) {
    const room = { name: config.targetRooms[index], controller, find: () => [] };
    Game.rooms[room.name] = room;
    return room;
  }
  function unit(room = home) {
    const t = task();
    const c = { name: t.creepName, room, memory: Memory.creeps[t.creepName], owner: { username: 'me' },
      ticksToLive: 550, getActiveBodyparts: () => 1,
      pos: { roomName: room.name, x: 25, y: 25, isNearTo: () => true, getRangeTo: () => 1,
        findClosestByPath: () => ({ x: 25, y: 49 }), isEqualTo: () => false },
      moveTo: () => 0, move: () => 0, claimController: () => 0 };
    Game.creeps[c.name] = c;
    return c;
  }
  const counts = { worker: 6, defender: 1 }, targets = { worker: 6, defender: 1 };
  const spawnNext = () => manager.trySpawn(spawn, counts, targets);
  return { config, Memory, Game, home, spawn, calls, load, manager, task, target, unit, spawnNext, counts, targets, constants };
}

test('disabled leaves Memory untouched', () => {
  const w = world({ enabled: false }); w.manager.run(); w.spawnNext();
  assert.equal(w.Memory.expansion, undefined); assert.equal(w.calls.length, 0);
});
test('valid config produces first target with CLAIM and MOVE, reserve retained', () => {
  const w = world(); w.spawnNext();
  assert.equal(w.calls.length, 1); assert.equal(w.task().attempts, 1);
  assert.equal(w.calls[0].options.memory.targetRoom, 'E22S37');
  assert.equal(w.calls[0].body.filter(p => p === 'claim').length, 1);
  assert(w.calls[0].body.includes('move'));
  assert(w.calls[0].body.reduce((n, p) => n + w.constants.BODYPART_COST[p], 0) <= w.home.energyAvailable - 300);
});
test('uppercase validation rejects malformed rooms', () => {
  const w = world({ homeRoom: 'e22s36' }); w.spawnNext(); assert.equal(w.calls.length, 0);
  assert.equal(w.Memory.expansion.configError, 'INVALID_CONFIG');
});
test('same-tick multiple spawn intents are deduplicated globally', () => {
  const w = world(); w.spawnNext(); w.spawnNext(); assert.equal(w.calls.length, 1);
});
test('spawning name locks dispatch across ticks', () => {
  const w = world(); w.spawnNext(); w.spawn.spawning = { name: w.task().creepName };
  w.Game.time++; w.manager.run(); w.spawnNext(); assert.equal(w.calls.length, 1); assert.equal(w.task().attempts, 1);
});
test('live unit locks dispatch', () => {
  const w = world(); w.spawnNext(); w.unit(); w.Game.time++; w.spawnNext(); assert.equal(w.calls.length, 1);
});
test('native replacement demand prevents expansion', () => {
  const w = world(); w.counts.worker = 5; w.spawnNext(); assert.equal(w.calls.length, 0);
});
test('near-death workers do not qualify as a healthy home economy', () => {
  const w = world(); w.Game.creeps.worker0.ticksToLive = 50; w.spawnNext(); assert.equal(w.calls.length, 0);
});
test('home hostiles prevent dispatch', () => {
  const w = world(); w.home.hostiles = [{}]; w.spawnNext(); assert.equal(w.calls.length, 0);
});
test('energy reserve and impossible body prevent dispatch', () => {
  const w = world(); w.home.energyAvailable = 900; w.spawnNext(); assert.equal(w.calls.length, 0);
});
test('GCL shortage waits without consuming attempts', () => {
  const w = world(); w.Game.gcl.level = 1; w.spawnNext();
  assert.equal(w.task().lastResult.code, 'GCL_WAIT'); assert.equal(w.task().attempts, 0);
});
test('low CPU skips routing and dispatch', () => {
  const w = world(); w.Game.cpu.bucket = 0;
  w.Game.map.findRoute = () => { throw Error('must not scan'); };
  w.spawnNext(); assert.equal(w.calls.length, 0);
});
test('owned target is skipped and second target dispatched', () => {
  const w = world(); w.target(0, { my: true }); w.spawnNext();
  assert.equal(w.task().state, 'CLAIMED'); assert.equal(w.calls[0].options.memory.targetRoom, 'E22S38');
});
test('enemy owner blocks only that target', () => {
  const w = world(); w.target(0, { owner: { username: 'enemy' } }); w.spawnNext();
  assert.equal(w.task().status, 'blocked'); assert.equal(w.calls[0].options.memory.targetRoom, 'E22S38');
});
test('foreign reservation and absent controller block', () => {
  const w = world(); w.target(0, { reservation: { username: 'enemy' } }); w.target(1, null); w.spawnNext();
  assert.equal(w.task().status, 'blocked'); assert.equal(w.task(1).failureReason, 'NO_CONTROLLER');
  assert.equal(w.calls.length, 0);
});
test('route failure is latched with no repeated scan', () => {
  const w = world(); let scans = 0; w.Game.map.findRoute = () => { scans++; return -2; };
  w.spawnNext(); w.Game.time++; w.spawnNext(); assert.equal(scans, 2); assert.equal(w.calls.length, 0);
});
test('death retries once after cooldown then stops permanently', () => {
  const w = world(); w.spawnNext(); w.Game.time++; w.manager.run();
  assert.equal(w.task().failureReason, 'CLAIMER_LOST');
  // Isolate first task while exercising cooldown; the second is independently claimable.
  w.task(1).status = 'blocked'; w.spawnNext(); assert.equal(w.calls.length, 1);
  w.Game.time += w.config.retryCooldown; w.spawnNext(); assert.equal(w.calls.length, 2);
  w.Game.time++; w.manager.run(); assert.equal(w.task().status, 'failed');
  w.Game.time += 1000; w.spawnNext(); assert.equal(w.calls.length, 2);
});
test('permanent spawn error is bounded without counting successful launches', () => {
  const w = world(); let attempts = 0; w.spawn.spawnCreep = () => { attempts++; return -10; };
  for (let i = 0; i < 8; i++) { w.spawnNext(); w.Game.time += 25; }
  assert.equal(attempts, 6); assert.equal(w.task().attempts, 0); assert.equal(w.task().status, 'blocked');
});
test('claim OK waits for next-tick ownership confirmation', () => {
  const w = world(); w.spawnNext(); const room = w.target(); w.unit(room); w.Game.time++; w.manager.run();
  assert.equal(w.task().lastResult.code, 'CLAIM_SCHEDULED'); assert.equal(w.task().state, 'CLAIM');
  room.controller.my = true; w.Game.time++; w.manager.run(); assert.equal(w.task().state, 'CLAIMED');
  delete w.Game.rooms[room.name]; w.Game.time++; w.manager.run(); assert.equal(w.task().state, 'CLAIMED');
});
test('claim GCL error blocks repeated dangerous calls', () => {
  const w = world(); w.spawnNext(); const c = w.unit(w.target()); let intents = 0;
  c.claimController = () => { intents++; return -15; };
  w.Game.time++; w.manager.run(); w.Game.time++; w.manager.run();
  assert.equal(intents, 1); assert.equal(w.task().status, 'blocked');
});
test('runtime emergency stop freezes existing unit and dispatch', () => {
  const w = world(); w.spawnNext(); const c = w.unit(w.target());
  c.claimController = () => { throw Error('must not claim'); };
  w.Memory.expansion.emergencyStop = true; w.Game.time++; w.manager.run(); w.spawnNext();
  assert.equal(w.calls.length, 1);
});
test('configuration stop and autoClaim off freeze existing unit', () => {
  for (const key of ['emergencyStop', 'autoClaim']) {
    const w = world(); w.spawnNext(); const c = w.unit(w.target());
    c.claimController = () => { throw Error('must not claim'); };
    w.config[key] = key === 'emergencyStop'; w.Game.time++; w.manager.run(); w.spawnNext();
    assert.equal(w.calls.length, 1);
  }
});
test('reoccupied target stops existing unit without attack', () => {
  const w = world(); w.spawnNext(); const c = w.unit(w.target(0, { owner: { username: 'enemy' } }));
  c.claimController = () => { throw Error('must not claim'); };
  w.Game.time++; w.manager.run(); assert.equal(w.task().status, 'blocked');
});
test('remaining lifetime and no path produce controlled failures', () => {
  const w = world(); w.spawnNext(); const c = w.unit(w.target()); c.ticksToLive = 20;
  w.Game.time++; w.manager.run(); assert.equal(w.task().failureReason, 'INSUFFICIENT_LIFETIME');
  const v = world(); v.spawnNext(); const d = v.unit(); d.moveTo = () => -2;
  v.Game.time++; v.manager.run(); assert.equal(v.task().failureReason, 'NO_PATH');
});
test('exit tile is crossed with explicit direction', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); let direction;
  c.pos.isEqualTo = () => true; c.move = d => { direction = d; return 0; };
  w.Game.time++; w.manager.run(); assert.equal(direction, 5);
});
test('completed unit returns for recycling before global slot is released', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); w.target(0, { my: true });
  w.Game.time++; w.manager.run(); assert(w.calls.some(call => call.recycle));
  w.spawnNext(); assert.equal(w.calls.filter(call => call.body).length, 1);
  delete w.Game.creeps[c.name]; w.Game.time++; w.spawnNext();
  assert.equal(w.calls.filter(call => call.body).length, 2);
});
test('no spawning or construction after claiming both targets', () => {
  const w = world(); w.target(0, { my: true }); w.target(1, { my: true }); w.spawnNext();
  assert.equal(w.calls.length, 0); assert.equal(w.task().state, 'CLAIMED'); assert.equal(w.task(1).state, 'CLAIMED');
});
test('colony preserves disabled expansion roles and native worker production', () => {
  const w = world({ enabled: false });
  const c = { name: 'managed', memory: { role: 'expansionClaimer', expansionTask: 'old' } };
  w.Game.creeps = { managed: c }; w.Memory.creeps.managed = c.memory;
  w.constants.BODYPART_COST.work = 100; w.constants.BODYPART_COST.carry = 50;
  w.load('starter.colony').run();
  assert.equal(c.memory.role, 'expansionClaimer'); assert.equal(w.calls[0].options.memory.role, 'worker');
});
test('expansion exception does not stop native spawning', () => {
  const w = world(); w.Game.creeps = {}; w.Game.cpu.getUsed = () => { throw Error('simulated'); };
  w.load('starter.colony').run(); assert.equal(w.calls[0].options.memory.role, 'worker');
});
test('stationary claimer times out and a living failed unit retains the global slot', () => {
  const w = world(); w.spawnNext(); w.unit(); w.Game.time++; w.manager.run();
  w.Game.time += w.config.noProgressTimeout; w.manager.run();
  assert.equal(w.task().failureReason, 'NO_PROGRESS');
  w.Game.time += w.config.retryCooldown; w.spawnNext(); assert.equal(w.calls.length, 1);
});
test('cached route avoids repeated scans and respects avoidRooms', () => {
  const w = world({ avoidRooms: ['E23S36'] }); let scans = 0;
  w.Game.map.findRoute = (from, to, options) => {
    scans++; assert.equal(options.routeCallback('E23S36'), Infinity);
    return [{ exit: 5, room: to }];
  };
  w.spawnNext(); w.unit(); w.Game.time++; w.manager.run(); w.Game.time++; w.manager.run();
  assert.equal(scans, 1);
});
test('damaged CLAIM and hostile route halt unit actions', () => {
  const w = world(); w.spawnNext(); const c = w.unit(); c.getActiveBodyparts = part => part === 'claim' ? 0 : 1;
  w.Game.time++; w.manager.run(); assert.equal(w.task().failureReason, 'BODY_DAMAGED');
  const v = world(); v.spawnNext(); v.unit(); v.home.hostiles = [{}];
  v.Game.time++; v.manager.run(); assert.equal(v.task().status, 'blocked');
});
test('neutralization after successful claim does not trigger a new claim campaign', () => {
  const w = world(); const room = w.target(0, { my: true }); w.manager.run();
  room.controller.my = false; w.Game.time++; w.manager.run();
  assert.equal(w.task().failureReason, 'OWNERSHIP_LOST');
});
test('disabling and re-enabling does not reset exhausted attempts', () => {
  const w = world({ maxAttempts: 1 }); w.spawnNext(); w.Game.time++; w.manager.run();
  w.config.enabled = false; w.manager.run(); w.config.enabled = true;
  w.Game.time += 1000; w.manager.run(); assert.equal(w.task().status, 'failed'); assert.equal(w.task().attempts, 1);
});
console.log(`${passed} tests passed`);
