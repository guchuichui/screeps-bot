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


module.exports = { world };
