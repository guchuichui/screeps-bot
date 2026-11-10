const config = require('expansion.config');
const control = require('expansion.control');
const travel = require('expansion.travel');
const work = require('colony.work');

exports.run = function (creep, task) {
  if (control.stopped() || !control.flag('autoBootstrap') || task.paused || creep.spawning) return;
  if (!control.hasCpu()) { travel.record(creep, 'CPU_WAIT'); return; }
  if (task.status === 'blocked') { travel.record(creep, 'TASK_BLOCKED'); return; }
  if (creep.room.find(FIND_HOSTILE_CREEPS).length) { travel.record(creep, 'HOSTILE_WAIT'); return; }
  if (creep.room.name !== task.targetRoom) {
    if (!creep.memory.departed && creep.room.name === task.homeRoom) {
      const supply = creep.room.find(FIND_STRUCTURES).filter(s =>
        (s.my && s.structureType === STRUCTURE_STORAGE || s.structureType === STRUCTURE_CONTAINER) && s.store &&
        s.store[RESOURCE_ENERGY] > config.homeSupportStorageReserve + creep.store.getFreeCapacity(RESOURCE_ENERGY));
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && supply.length) {
        work.action(creep, 'withdraw', supply[0], 1, RESOURCE_ENERGY); return;
      }
      creep.memory.departed = true;
      if (!supply.length) travel.record(creep, 'HOME_LOAD_SKIPPED_RESERVE');
    }
    travel.go(creep, task.targetRoom); return;
  }
  if (travel.go(creep, task.targetRoom).code !== 'ARRIVED') return;
  if (!creep.room.controller || !creep.room.controller.my) { travel.record(creep, 'TARGET_NOT_OWNED'); return; }
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  if (spawn) {
    creep.memory.colony = task.targetRoom;
    creep.memory.home = task.targetRoom;
    creep.memory.role = 'colonyHarvester';
    delete creep.memory.sourceId; delete creep.memory.sourceSlot;
    travel.record(creep, 'ADOPTED_LOCAL_ECONOMY');
    return;
  }
  if (!creep.store[RESOURCE_ENERGY]) { creep.memory.working = false; work.collect(creep); return; }
  if (work.urgentUpgrade(creep)) return;
  if (!creep.memory.working && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) { work.collect(creep); return; }
  creep.memory.working = true;
  const site = creep.room.find(FIND_MY_CONSTRUCTION_SITES).find(s => s.structureType === STRUCTURE_SPAWN);
  if (site && control.flag('autoBuildSpawn')) work.action(creep, 'build', site, 3);
  else work.action(creep, 'upgradeController', creep.room.controller, 3);
};

exports.trySpawn = function (spawn, tasks) {
  if (!control.flag('autoBootstrap')) return false;
  for (const task of tasks) {
    const room = Game.rooms[task.targetRoom];
    if (task.paused || task.status === 'blocked' || !room || !room.controller || !room.controller.my) continue;
    const localSpawns = room.find(FIND_MY_SPAWNS);
    const locals = Object.values(Game.creeps).filter(c => c.memory.colony === room.name);
    if (localSpawns.length && (locals.some(c => c.getActiveBodyparts(WORK) && c.ticksToLive > 100) || room.energyAvailable >= 200)) continue;
    const site = room.find(FIND_MY_CONSTRUCTION_SITES).find(s => s.structureType === STRUCTURE_SPAWN);
    const desired = Math.min(config.maxPioneers, room.find(FIND_SOURCES).length + 1, site && site.progressTotal - site.progress > 10000 ? 3 : 1);
    const support = Object.values(Game.creeps).filter(c => c.memory.role === 'expansionPioneer' && c.memory.expansionTask === task.id);
    const healthy = support.filter(c => c.spawning || c.ticksToLive > config.pioneerReplaceTtl);
    const pending = task.pioneerIntentAt === Game.time ? 1 : 0;
    if (healthy.length + pending >= desired || support.length + pending >= config.maxPioneers + 1) continue;
    if (Game.time < (task.nextSupportAt || 0)) continue;
    if ((task.supportLaunches || 0) >= config.maxSupportLaunches || (task.supportEnergySpent || 0) >= config.maxSupportEnergy) {
      task.supportResult = 'SUPPORT_BUDGET_EXHAUSTED'; continue;
    }
    const budget = Math.min(config.maxPioneerBodyCost, spawn.room.energyAvailable - config.minHomeEnergyReserve,
      config.maxSupportEnergy - (task.supportEnergySpent || 0));
    let swamp = 0, sampled = 0;
    // Sample known room terrain, not hypothetical live routes. Unknown terrain
    // falls back to the conservative plain-travel body and a TTL replacement margin.
    for (const terrainRoom of [spawn.room, room]) for (let x = 5; x < 45; x += 5) for (let y = 5; y < 45; y += 5) {
      const tile = terrainRoom.getTerrain().get(x, y);
      if (tile !== TERRAIN_MASK_WALL) { sampled++; if (tile === TERRAIN_MASK_SWAMP) swamp++; }
    }
    const moves = sampled && swamp / sampled > 0.2 ? 5 : 2;
    const unitCost = 150 + moves * 50;
    const units = Math.min(4, Math.floor(budget / unitCost));
    if (units < 1) { task.supportResult = 'HOME_SUPPORT_ENERGY_WAIT'; return false; }
    // Extra MOVE trades build throughput for travel speed on swamp-heavy maps.
    const body = [];
    for (let n = 0; n < units; n++) body.push(WORK, CARRY, ...Array(moves).fill(MOVE));
    const name = `pioneer-${task.targetRoom}-${Game.time}`;
    const result = spawn.spawnCreep(body, name, { memory: {
      role: 'expansionPioneer', home: task.homeRoom, targetRoom: task.targetRoom, expansionTask: task.id
    } });
    task.supportResult = `SPAWN_${result}`;
    task.nextSupportAt = Game.time + config.supportSpawnCooldown;
    if (result === OK) {
      task.supportLaunches = (task.supportLaunches || 0) + 1;
      task.supportEnergySpent = (task.supportEnergySpent || 0) + units * unitCost;
      task.pioneerIntentAt = Game.time;
      return true;
    }
    return false;
  }
  return false;
};
