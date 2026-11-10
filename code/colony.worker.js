const work = require('colony.work');
const travel = require('expansion.travel');
exports.run = function (creep) {
  const home = creep.memory.colony;
  if (creep.spawning) return;
  if (creep.room.find(FIND_HOSTILE_CREEPS).length) { travel.record(creep, 'HOSTILE_WAIT'); return; }
  if (travel.go(creep, home).code !== 'ARRIVED') return;
  if (!creep.room.controller || !creep.room.controller.my) { travel.record(creep, 'OWNERSHIP_WAIT'); return; }
  if (creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) creep.memory.working = true;
  if (work.urgentUpgrade(creep)) return;
  // Save stored energy for economic recovery; harvesters always collect at their stations.
  if (!creep.memory.working) {
    if (creep.memory.role === 'colonyHarvester') work.harvest(creep);
    else work.collect(creep);
    return;
  }
  if (work.deliver(creep)) return;
  const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
  const priority = type => [STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_CONTAINER, STRUCTURE_ROAD].indexOf(type);
  sites.sort((a, b) => priority(a.structureType) - priority(b.structureType));
  if (creep.memory.role !== 'colonyUpgrader' && sites.length) {
    work.action(creep, 'build', sites[0], 3); return;
  }
  if (creep.memory.role === 'colonyHarvester') {
    const storage = creep.room.find(FIND_STRUCTURES).filter(s =>
      (s.structureType === STRUCTURE_CONTAINER || s.my && s.structureType === STRUCTURE_STORAGE) &&
      s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
    const target = creep.pos.findClosestByPath(storage);
    if (target) { work.action(creep, 'transfer', target, 1, RESOURCE_ENERGY); return; }
  }
  const towers = creep.room.find(FIND_MY_STRUCTURES).filter(s => s.structureType === STRUCTURE_TOWER &&
    s.store.getUsedCapacity(RESOURCE_ENERGY) < s.store.getCapacity(RESOURCE_ENERGY) * 0.8);
  if (towers.length) { work.action(creep, 'transfer', towers[0], 1, RESOURCE_ENERGY); return; }
  const damaged = creep.room.find(FIND_STRUCTURES).find(s => [STRUCTURE_CONTAINER, STRUCTURE_ROAD].includes(s.structureType) && s.hits < s.hitsMax * 0.5);
  if (damaged && creep.memory.role !== 'colonyUpgrader') { work.action(creep, 'repair', damaged, 3); return; }
  work.action(creep, 'upgradeController', creep.room.controller, 3);
};
