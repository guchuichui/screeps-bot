const containerPolicy = require('colony.container-policy');
const config = require('expansion.config');
const work = require('colony.work');
const travel = require('expansion.travel');
const salvage = require('expansion.salvage');
exports.run = function (creep) {
  const home = creep.memory.colony;
  if (creep.spawning) return;
  if (creep.room.find(FIND_HOSTILE_CREEPS).length) { travel.record(creep, 'HOSTILE_WAIT'); return; }
  if (travel.go(creep, home).code !== 'ARRIVED') return;
  if (!creep.room.controller || !creep.room.controller.my) { travel.record(creep, 'OWNERSHIP_WAIT'); return; }
  if (creep.memory.role === 'colonyHauler') { haul(creep); return; }
  if (creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) creep.memory.working = true;
  if (creep.memory.working) work.releaseHarvest(creep);
  if (work.urgentUpgrade(creep)) {
    delete creep.memory.harvestSlotUntil;
    return;
  }
  if (!creep.memory.working) {
    if (salvage.collect(creep, { withdrawOnly: true })) {
      delete creep.memory.harvestSlotUntil;
      return;
    }
    if (require('stage04.recovery').drain(creep)) {
      work.releaseHarvest(creep);
      return;
    }
    if (creep.memory.role === 'colonyHarvester') work.harvest(creep);
    else work.collect(creep);
    return;
  }
  if (work.deliver(creep)) return;
  const sites = containerPolicy.buildSites(creep.room);
  const order = [STRUCTURE_SPAWN, STRUCTURE_STORAGE, STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_CONTAINER, STRUCTURE_ROAD];
  const priority = type => order.includes(type) ? order.indexOf(type) : order.length;
  sites.sort((a, b) => priority(a.structureType) - priority(b.structureType));
  const pushRcl = config.e22s37Growth && creep.room.name === 'E22S37' && creep.room.controller.level < 4;
  const mayBuild = creep.memory.role !== 'colonyUpgrader' && (!pushRcl || creep.memory.role === 'colonyBuilder');
  if (mayBuild && sites.length) {
    work.action(creep, 'build', sites[0], 3); return;
  }
  if (creep.memory.role === 'colonyHarvester') {
    const storage = creep.room.find(FIND_STRUCTURES).filter(s =>
      (s.structureType === STRUCTURE_CONTAINER || s.my && s.structureType === STRUCTURE_STORAGE) &&
      containerPolicy.allows(creep.room, s.structureType) && s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
    const target = creep.pos.findClosestByPath(storage);
    if (target) { work.action(creep, 'transfer', target, 1, RESOURCE_ENERGY); return; }
  }
  const towers = creep.room.find(FIND_MY_STRUCTURES).filter(s => s.structureType === STRUCTURE_TOWER &&
    s.store.getUsedCapacity(RESOURCE_ENERGY) < s.store.getCapacity(RESOURCE_ENERGY) * 0.8);
  if (towers.length) { work.action(creep, 'transfer', towers[0], 1, RESOURCE_ENERGY); return; }
  if (pushRcl) {
    work.action(creep, 'upgradeController', creep.room.controller, 3); return;
  }
  const damaged = creep.room.find(FIND_STRUCTURES).find(s => [STRUCTURE_CONTAINER, STRUCTURE_ROAD].includes(s.structureType) &&
    containerPolicy.allows(creep.room, s.structureType) && s.hits < s.hitsMax * 0.5);
  if (damaged && creep.memory.role !== 'colonyUpgrader') { work.action(creep, 'repair', damaged, 3); return; }
  work.action(creep, 'upgradeController', creep.room.controller, 3);
};

function haul(creep) {
  const storage = creep.room.storage;
  if (!storage?.my || creep.room.controller.level < 4) { travel.record(creep, 'HAUL_STORAGE_WAIT'); return; }
  const energy = creep.store[RESOURCE_ENERGY];
  if (energy > 0) {
    if (creep.memory.haulRefill && work.deliver(creep)) return;
    if (storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      work.action(creep, 'transfer', storage, 1, RESOURCE_ENERGY); return;
    }
    if (!work.deliver(creep)) travel.record(creep, 'HAUL_STORAGE_FULL');
    return;
  }
  delete creep.memory.haulRefill;
  if (storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
      salvage.collect(creep, { withdrawOnly: true, exactTile: true })) return;
  if (creep.room.energyAvailable < creep.room.energyCapacityAvailable && storage.store[RESOURCE_ENERGY] > 0) {
    const result = work.action(creep, 'withdraw', storage, 1, RESOURCE_ENERGY);
    if (result.code === 'WITHDRAW' && result.apiCode === OK) creep.memory.haulRefill = true;
    return;
  }
  travel.record(creep, 'HAUL_SALVAGE_WAIT');
}
