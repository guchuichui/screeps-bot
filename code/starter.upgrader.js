module.exports.run = function (creep) {
  if (creep.memory.upgrading === undefined) creep.memory.upgrading = false;
  if (creep.store.getFreeCapacity() === 0) creep.memory.upgrading = true;
  if (creep.store.getUsedCapacity() === 0) creep.memory.upgrading = false;

  if (!creep.memory.upgrading) {
    const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (source) {
      const result = creep.harvest(source);
      if (result === ERR_NOT_IN_RANGE) creep.moveTo(source);
    }
    return;
  }

  const controller = creep.room.controller;
  if (controller) {
    const result = creep.upgradeController(controller);
    if (result === ERR_NOT_IN_RANGE) creep.moveTo(controller);
  }
};
