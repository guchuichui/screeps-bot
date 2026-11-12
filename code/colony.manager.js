const containerPolicy = require('colony.container-policy');
const config = require('expansion.config');
const control = require('expansion.control');
const worker = require('colony.worker');
const defender = require('starter.defender');
const planner = require('colony.planner');
const work = require('colony.work');
const economicRoles = ['colonyHarvester', 'colonyBuilder', 'colonyUpgrader'];
const roles = [...economicRoles, 'colonyDefender', 'colonyHauler'];

exports.register = function (room, task) {
  if (!Memory.colonies) Memory.colonies = {};
  if (!Memory.colonies[room.name]) Memory.colonies[room.name] = {
    roomName: room.name, originTask: task.id, state: 'BOOTSTRAP', createdAt: Game.time, localSpawns: 0
  };
  for (const creep of Object.values(Game.creeps)) if (creep.memory.home === room.name &&
      creep.memory.role === 'worker' && !creep.memory.expansionTask && !creep.memory.colony) {
    creep.memory.colony = room.name;
    creep.memory.role = 'colonyHarvester';
  }
  return Memory.colonies[room.name];
};
exports.manages = roomName => Boolean(Memory.colonies && Memory.colonies[roomName]) ||
  config.targetRooms.includes(roomName) && roomName !== config.homeRoom;
exports.run = function () {
  if (control.stopped() || !control.flag('autoBootstrap')) return;
  for (const colony of Object.values(Memory.colonies || {})) {
    try {
      const room = Game.rooms[colony.roomName];
      const task = Memory.expansion && Memory.expansion.tasks[colony.originTask];
      if (task && task.paused) continue;
      if (!room || !room.controller || !room.controller.my) { colony.waitReason = 'OWNERSHIP_OR_VISION_WAIT'; continue; }
      if (!control.hasCpu()) { colony.waitReason = 'CPU_WAIT'; continue; }
      const creeps = members(room.name);
      const demand = population(room);
      const count = counts(creeps, config.localReplacementTtl);
      // Adopted Pioneers start as harvesters; surplus workers can fill other roles.
      if (compactEconomy(room)) rebalance(creeps, demand, count);
      else for (const c of creeps) {
        if (c.memory.role !== 'colonyHarvester' || count.colonyHarvester <= demand.colonyHarvester || c.spawning) continue;
        const role = ['colonyUpgrader', 'colonyBuilder'].find(r => count[r] < demand[r]);
        if (role) { count.colonyHarvester--; count[role]++; c.memory.role = role; delete c.memory.sourceId; delete c.memory.sourceSlot; }
      }
      for (const creep of creeps) {
        try {
          if (creep.memory.role === 'colonyDefender') defender.run(creep);
          else worker.run(creep);
        } catch (error) { colony.lastError = { tick: Game.time, creep: creep.name, reason: String(error.stack || error) }; }
      }
      colony.counts = counts(creeps, config.localReplacementTtl);
      colony.targets = demand;
      colony.lastRunAt = Game.time;
      colony.waitReason = null;
      const support = Object.values(Game.creeps).some(c => c.memory.role === 'expansionPioneer' && c.memory.targetRoom === room.name);
      const healthy = room.find(FIND_MY_SPAWNS).length && room.controller.level >= 2 && !support &&
        !room.find(FIND_HOSTILE_CREEPS).length && colony.counts.colonyHarvester >= demand.colonyHarvester &&
        colony.counts.colonyUpgrader >= 1 && room.energyAvailable >= Math.min(300, room.energyCapacityAvailable * 0.6);
      if (!healthy) { delete colony.healthySince; colony.state = 'BOOTSTRAP'; }
      else {
        if (!colony.healthySince) colony.healthySince = Game.time;
        if (Game.time - colony.healthySince >= config.stableWindow && colony.localSpawns >= 2) colony.state = 'STABLE';
      }
      if (task && room.find(FIND_MY_SPAWNS).length) control.transition(task, colony.state, 'LOCAL_ECONOMY_CHECK');
      planner.run(room, colony);
    } catch (error) { colony.lastError = { tick: Game.time, reason: String(error.stack || error) }; }
  }
};
exports.trySpawn = function (spawn) {
  const colony = Memory.colonies && Memory.colonies[spawn.room.name];
  if (!colony) return false;
  if (control.stopped() || !control.flag('autoBootstrap') || !control.hasCpu() || spawn.spawning) return true;
  const task = Memory.expansion && Memory.expansion.tasks[colony.originTask];
  if (task && task.paused) return true;
  if (!spawn.room.controller || !spawn.room.controller.my) return true;
  const creeps = members(spawn.room.name);
  const pendingPopulation = (colony.spawnIntents || []).filter(i => i.tick === Game.time && !Game.creeps[i.name]).length;
  if (creeps.length + pendingPopulation >= config.maxLocalPopulation) {
    colony.waitReason = 'LOCAL_POPULATION_CAP'; return true;
  }
  if (Game.time < (colony.nextSpawnAt || 0) || (colony.spawnErrors || 0) >= config.maxSpawnErrors) return true;
  const count = counts(creeps, config.localReplacementTtl);
  colony.spawnIntents = (colony.spawnIntents || []).filter(intent => intent.tick === Game.time);
  for (const intent of colony.spawnIntents) if (!Game.creeps[intent.name]) count[intent.role]++;
  const demand = population(spawn.room);
  const priority = count.colonyHarvester === 0 ? roles :
    demand.colonyDefender ? ['colonyDefender', ...economicRoles] : economicRoles;
  const role = priority.find(r => count[r] < demand[r]);
  if (!role) return true;
  if (compactEconomy(spawn.room) && role !== 'colonyDefender' &&
      !(role === 'colonyHarvester' && count.colonyHarvester === 0)) {
    const target = economicRoles.reduce((n, r) => n + demand[r], 0);
    const living = creeps.filter(c => economicRoles.includes(c.memory.role)).length +
      colony.spawnIntents.filter(i => i.role !== 'colonyDefender' && !Game.creeps[i.name]).length;
    if (living >= target) { colony.waitReason = 'LOCAL_ECONOMY_DOWNSIZING'; return true; }
  }
  let body;
  if (role === 'colonyDefender') body = defender.body(spawn.room.energyAvailable);
  else {
    const budget = count.colonyHarvester === 0 ? 200 : Math.min(config.maxLocalBodyCost, spawn.room.energyAvailable);
    const units = Math.min(5, Math.floor(budget / 200));
    body = [];
    for (let n = 0; n < units; n++) body.push(WORK, CARRY, MOVE);
  }
  if (!body.length || spawn.room.energyAvailable < 200 && role !== 'colonyDefender') {
    colony.waitReason = 'LOCAL_ENERGY_WAIT'; return true;
  }
  const name = `${role}-${spawn.name}-${Game.time}`;
  const result = spawn.spawnCreep(body, name, { memory: {
    role, colony: spawn.room.name, home: spawn.room.name
  } });
  colony.lastSpawn = { tick: Game.time, role, code: result, bodyCost: body.reduce((n, p) => n + BODYPART_COST[p], 0) };
  try { require('telemetry.metrics').spawn(spawn, result, role, body); } catch (error) { colony.telemetryError = String(error); }
  if (result === OK) {
    colony.localSpawns++;
    colony.spawnIntents.push({ tick: Game.time, role, name });
    colony.spawnErrors = 0;
  } else {
    colony.nextSpawnAt = Game.time + config.spawnRetryCooldown;
    if (![ERR_BUSY, ERR_NOT_ENOUGH_ENERGY].includes(result)) colony.spawnErrors = (colony.spawnErrors || 0) + 1;
  }
  return true;
};
function members(roomName) {
  return Object.values(Game.creeps).filter(c => c.memory.colony === roomName && c.memory.home === roomName && roles.includes(c.memory.role));
}
function counts(creeps, ttl) {
  const count = Object.fromEntries(roles.map(r => [r, 0]));
  for (const c of creeps) {
    if (c.memory.role === 'colonyDefender') {
      count.colonyDefender++;
      continue;
    }
    const useful = (c.memory.role === 'colonyHauler' || c.getActiveBodyparts(WORK)) &&
      c.getActiveBodyparts(CARRY) && c.getActiveBodyparts(MOVE);
    if (useful && (c.spawning || c.ticksToLive > ttl)) count[c.memory.role]++;
  }
  return count;
}
function compactEconomy(room) {
  return config.e22s37Growth && room.name === 'E22S37';
}

function rebalance(creeps, demand, count) {
  const candidates = creeps.filter(c => !c.spawning && c.ticksToLive > config.localReplacementTtl &&
    c.getActiveBodyparts(WORK) && c.getActiveBodyparts(CARRY) && c.getActiveBodyparts(MOVE))
    .sort((a, b) => b.ticksToLive - a.ticksToLive);
  for (const role of ['colonyHarvester', 'colonyBuilder', 'colonyUpgrader']) {
    while (count[role] < demand[role]) {
      const creep = candidates.find(c => c.memory.role !== 'colonyDefender' && c.memory.role !== 'colonyHauler' &&
        count[c.memory.role] > demand[c.memory.role]);
      if (!creep) break;
      count[creep.memory.role]--;
      creep.memory.role = role;
      count[role]++;
      work.releaseHarvest(creep);
    }
  }
}

function population(room) {
  const sources = work.sources(room);
  const harvesters = Math.max(1, Math.min(4, sources.reduce((n, s) => n + Math.min(2, s.slots.length), 0)));
  const sites = containerPolicy.buildSites(room);
  const compact = compactEconomy(room);
  const builders = sites.length ? 1 : 0;
  const localHarvesters = compact ? Math.min(2, harvesters) : harvesters;
  return {
    colonyHarvester: localHarvesters,
    colonyBuilder: builders,
    colonyUpgrader: compact ? Math.max(1, 4 - localHarvesters - builders) : 1,
    colonyDefender: defender.needsDefense(room.find(FIND_HOSTILE_CREEPS)) ? 1 : 0
  };
}
