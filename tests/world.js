// Offline tests only: no Screeps API, network, credentials or upload script.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function world(overrides = {}) {
  const constants = {
    OK: 0, ERR_NOT_OWNER: -1, ERR_NO_PATH: -2, ERR_NAME_EXISTS: -3, ERR_BUSY: -4,
    ERR_NOT_ENOUGH_ENERGY: -6, ERR_INVALID_TARGET: -7, ERR_FULL: -8, ERR_NOT_IN_RANGE: -9,
    ERR_TIRED: -11, ERR_NO_BODYPART: -12, ERR_GCL_NOT_ENOUGH: -15,
    CLAIM: 'claim', MOVE: 'move', WORK: 'work', CARRY: 'carry', ATTACK: 'attack', RANGED_ATTACK: 'ranged_attack',
    FIND_HOSTILE_CREEPS: 103, FIND_MY_CONSTRUCTION_SITES: 114, FIND_MY_STRUCTURES: 108,
    FIND_MY_SPAWNS: 112, FIND_SOURCES: 105, FIND_SOURCES_ACTIVE: 104, FIND_MINERALS: 116,
    FIND_CONSTRUCTION_SITES: 111, LOOK_STRUCTURES: 'structures', LOOK_CONSTRUCTION_SITES: 'sites',
    RESOURCE_ENERGY: 'energy',
    ERR_RCL_NOT_ENOUGH: -14,
    CONTROLLER_STRUCTURES: { extension: [0,0,5,10,20,30,40,50,60], tower: [0,0,0,1,1,2,2,3,6] },
    TERRAIN_MASK_WALL: 1, TERRAIN_MASK_SWAMP: 2, STRUCTURE_CONTAINER: 'container', STRUCTURE_EXTENSION: 'extension',
    FIND_STRUCTURES: 107, STRUCTURE_SPAWN: 'spawn', STRUCTURE_TOWER: 'tower', STRUCTURE_STORAGE: 'storage',
    STRUCTURE_TERMINAL: 'terminal', STRUCTURE_ROAD: 'road', STRUCTURE_WALL: 'wall', STRUCTURE_RAMPART: 'rampart',
    BODYPART_COST: { claim: 600, move: 50, work: 100, carry: 50 }, CREEP_CLAIM_LIFE_TIME: 600
  };
  // Unit fixtures opt into each stage independently; production defaults enable all stages.
  const config = Object.assign({}, require('../code/expansion.config'), { autoBuildSpawn: false, autoBootstrap: false }, overrides);
  const Memory = { creeps: {} };
  const home = { name: config.homeRoom, energyAvailable: 2000, controller: { my: true, level: 3 },
    getTerrain: () => ({ get: () => 0 }),
    hostiles: [], find(kind) { return kind === 103 ? this.hostiles : []; } };
  const Game = { time: 100, rooms: { [home.name]: home }, creeps: {}, spawns: {}, constructionSites: {}, gcl: { level: 3 },
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
  class RoomPosition {
    constructor(x, y, roomName) { Object.assign(this, { x, y, roomName }); }
    getRangeTo(object) { const p = object.pos || object; return Math.max(Math.abs(this.x - p.x), Math.abs(this.y - p.y)); }
    isEqualTo(object) { const p = object.pos || object; return this.x === p.x && this.y === p.y; }
  }
  const context = vm.createContext({ ...constants, Game, Memory, console: { log() {} }, Set, RoomPosition });
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
    const name = config.targetRooms[index];
    if (controller && !controller.pos) controller.pos = { x: 40, y: 40, roomName: name };
    const source = { id: `${name}-source`, pos: { x: 10, y: 10, roomName: name }, energy: 3000 };
    const room = { name, controller, memory: {}, sources: [source], structures: [], sites: [], hostiles: [],
      getTerrain: () => ({ get: () => 0 }),
      find(kind) {
        if (kind === 105 || kind === 104) return this.sources;
        if (kind === 107) return this.structures;
        if (kind === 108) return this.structures.filter(s => s.my);
        if (kind === 112) return this.structures.filter(s => s.my && s.structureType === 'spawn');
        if (kind === 111 || kind === 114) return this.sites;
        if (kind === 103) return this.hostiles;
        return [];
      },
      createConstructionSite(x, y, type) { calls.push({ site: type, x, y }); return 0; }
    };
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
    c.store = { energy: 50, getFreeCapacity: () => 0, getUsedCapacity: () => c.store.energy };
    c.harvest = () => 0; c.build = () => 0; c.upgradeController = () => 0; c.withdraw = () => 0; c.transfer = () => 0;
    Game.creeps[c.name] = c;
    return c;
  }
  const counts = { worker: 6, defender: 1 }, targets = { worker: 6, defender: 1 };
  const spawnNext = () => manager.trySpawn(spawn, counts, targets);
  function resetModules() { for (const name of Object.keys(modules)) if (!name.startsWith('starter.') && name !== 'expansion.config') delete modules[name]; }
  return { config, Memory, Game, home, spawn, calls, load, manager, task, target, unit, spawnNext, counts, targets, constants, resetModules };
}


module.exports = { world };
