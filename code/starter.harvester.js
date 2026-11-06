module.exports.run = function (creep) {
  if (creep.memory.harvesting === undefined) creep.memory.harvesting = true;
  if (creep.store.getFreeCapacity() === 0) creep.memory.harvesting = false;
  if (creep.store.getUsedCapacity() === 0) creep.memory.harvesting = true;

  if (creep.memory.harvesting) {
    const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (source) {
      const result = creep.harvest(source);
      if (result === ERR_NOT_IN_RANGE) creep.moveTo(source);
    }
    return;
  }

  // Keep spawning and extensions fueled first; tower energy is the next priority.
  const targets = creep.room.find(FIND_MY_STRUCTURES, {
    filter: s => [STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_TOWER].includes(s.structureType) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
  });
  targets.sort((a, b) => energyPriority(a) - energyPriority(b) || creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b));
  const target = targets[0];
  if (target) {
    const result = creep.transfer(target, RESOURCE_ENERGY);
    if (result === ERR_NOT_IN_RANGE) creep.moveTo(target);
    return;
  }

  const controller = creep.room.controller;
  if (controller) {
    const result = creep.upgradeController(controller);
    if (result === ERR_NOT_IN_RANGE) creep.moveTo(controller);
  }
};
function energyPriority(s) {
  if (s.structureType === STRUCTURE_SPAWN) return 0;
  if (s.structureType === STRUCTURE_EXTENSION) return 1;
  return 2;
}
