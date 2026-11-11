const containerPolicy = require('colony.container-policy');
const config = require('expansion.config');
const plan = require('stage04.plan');
// All-purpose colony worker. Old harvester/builder/upgrader creeps are
// automatically migrated to this role by starter.colony.
module.exports.run = function (creep) {
  // Switch to work only when full, and stay in work mode until all energy is
  // spent. This prevents a creep from harvesting again after every work action.
  if (creep.memory.working === undefined) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
    creep.memory.working = true;
  } else if (creep.memory.working && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    creep.memory.working = false;
  }

  if (require('stage04.links').work(creep)) return;

  // If sources are temporarily empty, wait and retry while in collection mode.
  if (!creep.memory.working) {
    const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (source) {
      const result = creep.harvest(source);
      if (result === ERR_NOT_IN_RANGE) moveToTarget(creep, source);
    }
    return;
  }

  // Refill Spawn/Extensions whenever room spawn energy is below capacity.
  if (creep.room.energyAvailable < creep.room.energyCapacityAvailable) {
    const targets = creep.room.find(FIND_MY_STRUCTURES, {
      filter: s => [STRUCTURE_SPAWN, STRUCTURE_EXTENSION].includes(s.structureType) &&
        s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    });
    const target = closestByPriority(creep, targets, energyPriority);
    if (target && transferEnergy(creep, target)) return;
  }

  // Tower energy is not part of room spawn energy. A room-memory lock assigns
  // one worker to one low-energy Tower until it reaches 80%.
  const tower = getTowerToRefill(creep);
  if (tower) {
    if (transferEnergy(creep, tower)) return;
    releaseTowerLock(creep, tower, true);
  }

  const sites = containerPolicy.buildSites(creep.room).filter(site => {
    if (!config.homeConstructionHold || creep.room.name !== config.homeRoom || Game.shard?.name !== 'shard3') return true;
    const tiles = site.structureType === STRUCTURE_EXTENSION ? [...plan.extensions, ...(Memory.expansion?.stage04?.home?.infill || [])] :
      site.structureType === STRUCTURE_ROAD ? plan.roads : site.structureType === STRUCTURE_LINK ? plan.links : [];
    return !tiles.some(([x, y]) => site.pos.x === x && site.pos.y === y);
  });
  const site = closestByPriority(creep, sites, sitePriority);
  if (site) {
    const result = creep.build(site);
    if (result === OK) return;
    if (result === ERR_NOT_IN_RANGE && moveToTarget(creep, site) !== ERR_NO_PATH) return;
  }

  // Keep towers operational first, then repair traffic-worn roads and other
  // useful structures. Walls and ramparts use the separate defense policy.
  const damaged = creep.room.find(FIND_STRUCTURES, {
    // Roads are neutral structures and are omitted by FIND_MY_STRUCTURES.
    filter: s => (s.structureType === STRUCTURE_ROAD || s.my) &&
      containerPolicy.allows(creep.room, s.structureType) &&
      s.hits < s.hitsMax * repairThreshold(s) &&
      s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART,
  });
  const repairTarget = closestByPriority(creep, damaged, repairPriority);
  if (repairTarget) {
    const result = creep.repair(repairTarget);
    if (result === OK) return;
    if (result === ERR_NOT_IN_RANGE && moveToTarget(creep, repairTarget) !== ERR_NO_PATH) return;
  }

  const controller = creep.room.controller;
  if (controller) {
    const result = creep.upgradeController(controller);
    if (result === ERR_NOT_IN_RANGE) moveToTarget(creep, controller);
  }
};

function transferEnergy(creep, target) {
  const result = creep.transfer(target, RESOURCE_ENERGY);
  if (result === OK) return true;
  if (result === ERR_NOT_IN_RANGE) return moveToTarget(creep, target) !== ERR_NO_PATH;
  return false;
}

function moveToTarget(creep, target) {
  return creep.moveTo(target, { reusePath: 5, maxRooms: 1 });
}

function closestByPriority(creep, targets, priorityOf) {
  const priorities = [...new Set(targets.map(priorityOf))].sort((a, b) => a - b);
  for (const priority of priorities) {
    const group = targets.filter(target => priorityOf(target) === priority);
    const target = creep.pos.findClosestByPath(group);
    if (target) return target;
  }
  return null;
}

function energyPriority(s) {
  if (s.structureType === STRUCTURE_SPAWN) return 0;
  if (s.structureType === STRUCTURE_EXTENSION) return 1;
  return 2;
}
function sitePriority(s) {
  if (s.structureType === STRUCTURE_TOWER) return 0;
  if (s.structureType === STRUCTURE_EXTENSION) return 1;
  if (s.structureType === STRUCTURE_SPAWN) return 2;
  if (s.structureType === STRUCTURE_ROAD) return 4;
  return 3;
}
function repairThreshold(s) {
  if (s.structureType === STRUCTURE_TOWER) return 0.9;
  if (s.structureType === STRUCTURE_ROAD) return 0.8;
  return 0.7;
}
function repairPriority(s) {
  if (s.structureType === STRUCTURE_TOWER) return 0;
  if (s.structureType === STRUCTURE_ROAD) return 1;
  return 2;
}

function getTowerToRefill(creep) {
  const room = creep.room;
  let lock = room.memory.towerRefill;

  if (lock) {
    const tower = Game.getObjectById(lock.towerId);
    const owner = Game.creeps[lock.creepName];
    const threshold = tower && tower.store.getCapacity(RESOURCE_ENERGY) * 0.8;
    if (!tower || !owner || tower.store.getUsedCapacity(RESOURCE_ENERGY) >= threshold) {
      delete room.memory.towerRefill;
      lock = null;
    } else {
      // Keep all other creeps away from this Tower while its assigned worker
      // harvests another load or transfers energy to it.
      if (lock.creepName !== creep.name) return null;
      if (creep.pos.getRangeTo(tower) <= 1 || creep.pos.findPathTo(tower.pos, { range: 1, maxRooms: 1 }).length) return tower;
      releaseTowerLock(creep, tower, true);
    }
  }

  const towers = room.find(FIND_MY_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_TOWER &&
      s.store.getUsedCapacity(RESOURCE_ENERGY) < s.store.getCapacity(RESOURCE_ENERGY) * 0.8 &&
      !isTowerTemporarilyBlocked(creep, s.id),
  });
  const target = creep.pos.findClosestByPath(towers);
  if (!target) return null;

  room.memory.towerRefill = { creepName: creep.name, towerId: target.id };
  return target;
}

function releaseTowerLock(creep, tower, temporarilyBlock) {
  const lock = creep.room.memory.towerRefill;
  if (lock && lock.creepName === creep.name && lock.towerId === tower.id) {
    delete creep.room.memory.towerRefill;
  }
  if (temporarilyBlock) {
    if (!creep.memory.unreachableTowers) creep.memory.unreachableTowers = {};
    creep.memory.unreachableTowers[tower.id] = Game.time + 25;
  }
}

function isTowerTemporarilyBlocked(creep, towerId) {
  const blocked = creep.memory.unreachableTowers;
  if (!blocked || !blocked[towerId]) return false;
  if (blocked[towerId] < Game.time) {
    delete blocked[towerId];
    return false;
  }
  return true;
}
