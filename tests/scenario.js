// A bounded tick simulation: open terrain, actual resource balances, action ranges,
// spawn duration, source regeneration, TTL, controller levels and construction.
// It is intentionally not an implementation of the Screeps engine or live validation.
const assert = require('assert');
const { world } = require('./world');

module.exports = function () {
  const w = world({ autoBuildSpawn: true, autoBootstrap: true });
  const { Game, Memory } = w;
  const allRooms = { [w.home.name]: w.home };
  const first = w.target(0, { my: false, level: 0, ticksToDowngrade: 20000, progress: 0 });
  const second = w.target(1, { my: false, level: 0, ticksToDowngrade: 20000, progress: 0 });
  allRooms[first.name] = first; allRooms[second.name] = second;
  let serial = 0;
  const intents = [], trace = [], economyRoles = new Set();
  const statistics = { spawned: 0, harvested: 0, built: 0, delivered: 0, upgraded: 0, crossed: 0 };
  const row = name => Number(name.split('S')[1]);
  class Position {
    constructor(x, y, roomName) { Object.assign(this, { x, y, roomName }); }
    getRangeTo(target) { const p = target.pos || target; return Math.max(Math.abs(this.x - p.x), Math.abs(this.y - p.y)); }
    isNearTo(target) { return this.getRangeTo(target) <= 1; }
    isEqualTo(target) { return this.getRangeTo(target) === 0; }
    findPathTo(target, options) { return this.getRangeTo(target) <= options.range ? [] : [target]; }
    findClosestByPath(targets) {
      if (typeof targets === 'number') return new Position(Math.max(1, Math.min(48, this.x)), targets === 1 ? 0 : 49, this.roomName);
      return targets.slice().sort((a, b) => this.getRangeTo(a) - this.getRangeTo(b))[0] || null;
    }
  }
  const store = capacity => ({ energy: 0, getCapacity: () => capacity,
    getUsedCapacity() { return this.energy; }, getFreeCapacity() { return capacity - this.energy; } });
  function structure(room, type, x, y) {
    const s = { id: `structure-${++serial}`, name: `sim-${serial}`, my: true, owner: { username: 'me' },
      structureType: type, room, pos: new Position(x, y, room.name), hits: 10000, hitsMax: 10000,
      store: store(type === 'spawn' ? 300 : type === 'extension' ? 50 : 2000) };
    if (type === 'spawn') {
      s.spawnCreep = function (body, name, options) {
        if (this.spawning) return -4;
        if (Game.creeps[name]) return -3;
        const cost = body.reduce((sum, part) => sum + w.constants.BODYPART_COST[part], 0);
        if (room.energyAvailable < cost) return -6;
        if (room === w.home) room.energyAvailable -= cost;
        else {
          let remaining = cost;
          for (const source of room.structures.filter(o => ['spawn', 'extension'].includes(o.structureType))) {
            const taken = Math.min(remaining, source.store.energy); source.store.energy -= taken; remaining -= taken;
          }
          room.energyAvailable -= cost;
        }
        const c = creep(name, body, options.memory, room, this.pos.x, this.pos.y);
        c.spawning = true; c.spawnRemaining = body.length * 3;
        this.spawning = { name }; Game.creeps[name] = c; Memory.creeps[name] = c.memory;
        statistics.spawned++; economyRoles.add(c.memory.role);
        return 0;
      };
      s.recycleCreep = c => { if (!c.pos.isNearTo(s)) return -9; intents.push(() => { delete Game.creeps[c.name]; }); return 0; };
      Game.spawns[s.name] = s;
    }
    return s;
  }
  function creep(name, body, memory, room, x, y) {
    const c = { name, memory, room, owner: { username: 'me' }, pos: new Position(x, y, room.name),
      ticksToLive: body.includes('claim') ? 600 : 1500, store: store(body.filter(p => p === 'carry').length * 50),
      getActiveBodyparts: part => body.filter(p => p === part).length };
    c.move = direction => {
      const delta = { 1: [0,-1], 3: [1,0], 5: [0,1], 7: [-1,0] }[direction];
      if (!delta) return -10;
      intents.push(() => relocate(c, c.pos.x + delta[0], c.pos.y + delta[1])); return 0;
    };
    c.moveTo = (object, options = {}) => {
      const p = object.pos || object;
      if (c.pos.getRangeTo(p) <= (options.range === undefined ? 1 : options.range)) return 0;
      intents.push(() => relocate(c, c.pos.x + Math.sign(p.x - c.pos.x), c.pos.y + Math.sign(p.y - c.pos.y))); return 0;
    };
    c.claimController = controller => {
      if (!c.pos.isNearTo(controller)) return -9;
      if (Object.values(allRooms).filter(r => r.controller.my).length >= Game.gcl.level) return -15;
      intents.push(() => Object.assign(controller, { my: true, owner: { username: 'me' }, level: 1 })); return 0;
    };
    c.harvest = source => {
      if (!c.pos.isNearTo(source)) return -9;
      if (!source.energy) return -6;
      intents.push(() => {
        const n = Math.min(source.energy, c.store.getFreeCapacity(), c.getActiveBodyparts('work') * 2);
        source.energy -= n; c.store.energy += n; statistics.harvested += n;
      }); return 0;
    };
    c.transfer = target => {
      if (!c.pos.isNearTo(target)) return -9;
      intents.push(() => {
        const n = Math.min(c.store.energy, target.store.getFreeCapacity());
        c.store.energy -= n; target.store.energy += n; statistics.delivered += n;
      }); return 0;
    };
    c.withdraw = target => {
      if (!c.pos.isNearTo(target)) return -9;
      intents.push(() => {
        const n = Math.min(c.store.getFreeCapacity(), target.store.energy); c.store.energy += n; target.store.energy -= n;
      }); return 0;
    };
    c.build = site => {
      if (c.pos.getRangeTo(site) > 3) return -9;
      intents.push(() => {
        if (!Game.constructionSites[site.id]) return;
        const n = Math.min(c.store.energy, c.getActiveBodyparts('work'), Math.ceil((site.progressTotal - site.progress) / 5));
        c.store.energy -= n; site.progress += n * 5; statistics.built += n * 5;
        if (site.progress >= site.progressTotal) {
          c.room.structures.push(structure(c.room, site.structureType, site.pos.x, site.pos.y));
          c.room.sites = c.room.sites.filter(s => s.id !== site.id); delete Game.constructionSites[site.id];
        }
      }); return 0;
    };
    c.upgradeController = controller => {
      if (c.pos.getRangeTo(controller) > 3) return -9;
      intents.push(() => {
        const n = Math.min(c.store.energy, c.getActiveBodyparts('work')); c.store.energy -= n;
        controller.progress += n; controller.ticksToDowngrade = Math.min(20000, controller.ticksToDowngrade + n * 100);
        statistics.upgraded += n;
        if (controller.level === 1 && controller.progress >= 200) { controller.level = 2; controller.progress = 0; }
      }); return 0;
    };
    c.repair = () => 0;
    return c;
  }
  function relocate(c, x, y) {
    let destination = c.room.name;
    if (y <= 0) { destination = `E22S${row(destination) - 1}`; y = 48; statistics.crossed++; }
    if (y >= 49) { destination = `E22S${row(destination) + 1}`; y = 1; statistics.crossed++; }
    if (!allRooms[destination]) return;
    c.room = allRooms[destination]; c.pos = new Position(x, y, destination);
  }
  for (const r of [first, second]) {
    r.controller.pos = new Position(40, 40, r.name); r.sources[0].pos = new Position(10, 10, r.name);
    r.energyAvailable = 0; r.energyCapacityAvailable = 0;
    r.findPath = (a, b, options) => {
      const path = []; let p = new Position(a.x, a.y, r.name);
      while (p.getRangeTo(b) > options.range && path.length < 100) {
        p = new Position(p.x + Math.sign(b.x - p.x), p.y + Math.sign(b.y - p.y), r.name); path.push(p);
      }
      return path;
    };
    r.createConstructionSite = (x, y, type) => {
      if (!r.controller.my) return -1;
      if (r.sites.some(s => s.pos.x === x && s.pos.y === y) || r.structures.some(s => s.pos.x === x && s.pos.y === y)) return -7;
      const site = { id: `site-${++serial}`, my: true, structureType: type, pos: new Position(x, y, r.name),
        progress: 0, progressTotal: type === 'spawn' ? 15000 : type === 'extension' ? 3000 : type === 'container' ? 5000 : 300 };
      intents.push(() => { r.sites.push(site); Game.constructionSites[site.id] = site; }); return 0;
    };
  }
  // Mother economy is supplied externally in this scenario; its old worker logic is
  // separately guarded by unit regression tests and is not simulated here.
  w.home.structures = []; w.home.find = kind => kind === 103 ? [] : kind === 107 ? w.home.structures : [];
  const motherSpawn = structure(w.home, 'spawn', 34, 21); w.home.structures.push(motherSpawn);
  delete Game.spawns.homeSpawn;
  Game.creeps.motherGuard = { name: 'motherGuard', memory: { role: 'defender', home: w.home.name },
    ticksToLive: 1000, getActiveBodyparts: part => part === 'attack' ? 1 : 0 };
  Game.map.findRoute = (from, to) => {
    const steps = []; let current = row(from);
    while (current !== row(to)) { const exit = current < row(to) ? 5 : 1; current += exit === 5 ? 1 : -1; steps.push({ exit, room: `E22S${current}` }); }
    return steps;
  };
  delete Game.rooms[first.name]; delete Game.rooms[second.name];
  let stable = false;
  for (let tick = 0; tick < 4500; tick++) {
    Game.time++;
    w.home.energyAvailable = 2000;
    for (const room of [first, second]) {
      if (room.controller.my || Object.values(Game.creeps).some(c => c.room === room)) Game.rooms[room.name] = room;
      else delete Game.rooms[room.name];
      room.energyCapacityAvailable = room.structures.reduce((n, s) => n + (s.structureType === 'spawn' ? 300 : s.structureType === 'extension' ? 50 : 0), 0);
      room.energyAvailable = room.structures.filter(s => ['spawn', 'extension'].includes(s.structureType)).reduce((n, s) => n + s.store.energy, 0);
      if (Game.time % 300 === 0) room.sources[0].energy = 3000;
      room.controller.ticksToDowngrade--;
    }
    for (const s of Object.values(Game.spawns)) {
      if (s.spawning && !Game.creeps[s.spawning.name]) s.spawning = null;
      if (s.room !== w.home && s.room.energyAvailable < 300 && s.store.energy < 300) s.store.energy++;
    }
    // Simulate a Global Reset halfway through the bootstrap, retaining only Memory/Game.
    if (tick === 600) w.resetModules();
    w.load('main').loop();
    while (intents.length) intents.shift()();
    for (const c of Object.values(Game.creeps)) {
      if (!c.room) continue; // fixed mother-worker fixtures
      if (c.spawning) {
        if (--c.spawnRemaining <= 0) {
          c.spawning = false;
          for (const s of Object.values(Game.spawns)) if (s.spawning && s.spawning.name === c.name) s.spawning = null;
        }
      } else if (--c.ticksToLive <= 0) delete Game.creeps[c.name];
    }
    const task = Memory.expansion && Memory.expansion.tasks['E22S36:E22S37'];
    const next = Memory.expansion && Memory.expansion.tasks['E22S36:E22S38'];
    if (task && task.state !== 'STABLE') assert.equal(next.attempts, 0, 'second claim must wait for first STABLE');
    if (task && trace[trace.length - 1] !== task.state) trace.push(task.state);
    if (task && task.state === 'STABLE') { stable = true; break; }
  }
  const task = Memory.expansion.tasks['E22S36:E22S37'];
  const colony = Memory.colonies && Memory.colonies[first.name];
  assert(first.controller.my, `simulation must claim first target: ${JSON.stringify({ task, statistics })}`);
  assert(first.structures.some(s => s.structureType === 'spawn'), `Spawn unfinished: ${JSON.stringify({ task, statistics })}`);
  assert(colony && !colony.lastError, `local error: ${JSON.stringify(colony && colony.lastError)}`);
  assert(stable, `stable criteria not reached: ${JSON.stringify({ trace, colony, task, statistics })}`);
  assert(economyRoles.has('colonyUpgrader') && economyRoles.has('colonyBuilder'), 'must produce local roles');
  assert(statistics.harvested > 3000 && statistics.delivered > 500 && statistics.upgraded >= 200);
  assert(task.supportEnergySpent <= w.config.maxSupportEnergy);
  return { trace, ticks: Game.time - 100, statistics, supportEnergySpent: task.supportEnergySpent };
};
