module.exports.run = function (creep) {
  if (creep.memory.working === undefined) creep.memory.working = false;
  if (creep.store.getFreeCapacity() === 0) creep.memory.working = true;
  if (creep.store.getUsedCapacity() === 0) creep.memory.working = false;

  if (!creep.memory.working) {
    const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (source) {
      const result = creep.harvest(source);
      if (result === ERR_NOT_IN_RANGE) creep.moveTo(source);
    }
    return;
  }

  const sites = creep.room.find(FIND_CONSTRUCTION_SITES);
  const priority = site => {
    if (site.structureType === STRUCTURE_TOWER) return 0;
    if (site.structureType === STRUCTURE_EXTENSION) return 1;
    if (site.structureType === STRUCTURE_SPAWN) return 2;
    if (site.structureType === STRUCTURE_ROAD) return 4;
    return 3;
  };
  sites.sort((a, b) => priority(a) - priority(b) || creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b));
  const site = sites[0];
  if (site) {
    const result = creep.build(site);
    if (result === ERR_NOT_IN_RANGE) creep.moveTo(site);
    return;
  }

  const damaged = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
    filter: s => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.hits < s.hitsMax * 0.7,
  });
  if (damaged) {
    const result = creep.repair(damaged);
    if (result === ERR_NOT_IN_RANGE) creep.moveTo(damaged);
    return;
  }

  const controller = creep.room.controller;
  if (controller) {
    const result = creep.upgradeController(controller);
    if (result === ERR_NOT_IN_RANGE) creep.moveTo(controller);
  }
};
