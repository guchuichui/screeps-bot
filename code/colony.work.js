// Shared harvesting, transport and work actions for Pioneers and new-room roles.
// Existing starter.worker behavior at established bases is deliberately unchanged.
const travel = require('expansion.travel');
exports.sources = function (room) {
  const terrain = room.getTerrain();
  const structures = room.find(FIND_STRUCTURES);
  return room.find(FIND_SOURCES).map(source => {
    const slots = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = source.pos.x + dx, y = source.pos.y + dy;
      if ((!dx && !dy) || x < 1 || x > 48 || y < 1 || y > 48 || terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
      if (structures.some(s => s.pos.x === x && s.pos.y === y && ![STRUCTURE_ROAD, STRUCTURE_CONTAINER].includes(s.structureType) &&
          !(s.structureType === STRUCTURE_RAMPART && (s.my || s.isPublic)))) continue;
      slots.push({ x, y, roomName: room.name });
    }
    return { source, slots };
  });
};
const SLOT_LEASE = 3;
const sameTile = (a, b) => a && b && a.x === b.x && a.y === b.y;

exports.releaseHarvest = function (creep) {
  // Keep the last station as a preference, but stop reserving it.
  if (creep.memory.harvestSlotUntil === undefined) return;
  delete creep.memory.harvestSlotUntil;
  delete creep.memory.navigation;
  delete creep.memory._move;
};

function reachableStation(creep, position) {
  if (sameTile(creep.pos, position)) return true;
  const path = creep.pos.findPathTo(position, { range: 0, ignoreCreeps: false, maxRooms: 1, maxOps: 1500 });
  return sameTile(path[path.length - 1], position);
}

exports.harvest = function (creep) {
  const { room, memory } = creep;
  const peers = Object.values(Game.creeps).filter(c => c.name !== creep.name && c.room?.name === room.name);
  const leases = peers.filter(peer => !peer.memory.working && peer.memory.harvestSlotUntil > Game.time &&
    peer.memory.sourceSlot?.roomName === room.name);
  const available = slot => sameTile(creep.pos, slot) ||
    !peers.some(peer => sameTile(peer.pos, slot)) && !leases.some(peer => sameTile(peer.memory.sourceSlot, slot));
  const choices = [];
  for (const { source, slots } of exports.sources(room)) {
    const load = leases.filter(peer => peer.memory.sourceId === source.id)
      .reduce((count, peer) => count + peer.getActiveBodyparts(WORK), 0);
    for (const slot of slots) {
      if (!available(slot)) continue;
      if (!sameTile(creep.pos, slot) && memory.harvestRetry?.until > Game.time && sameTile(memory.harvestRetry, slot)) continue;
      const position = new RoomPosition(slot.x, slot.y, room.name);
      choices.push({ source, slot, position, preferred: source.id === memory.sourceId && sameTile(slot, memory.sourceSlot),
        atStation: sameTile(creep.pos, slot), load, distance: creep.pos.getRangeTo(position) });
    }
  }
  choices.sort((a, b) => Number(b.atStation) - Number(a.atStation) ||
    Number(b.preferred) - Number(a.preferred) || a.load - b.load || a.distance - b.distance ||
    a.source.id.localeCompare(b.source.id));
  const continuing = choice => choice.preferred && memory.harvestSlotUntil > Game.time;
  const choice = choices.find(candidate => continuing(candidate) || reachableStation(creep, candidate.position));
  if (!choice) {
    exports.releaseHarvest(creep);
    return travel.record(creep, 'NO_REACHABLE_HARVEST_SLOT');
  }
  if (!continuing(choice)) {
    // A failed navigation from a previous target must not poison a new route.
    delete memory.navigation;
    delete memory._move;
  }
  memory.sourceId = choice.source.id;
  memory.sourceSlot = choice.slot;
  memory.harvestSlotUntil = Game.time + SLOT_LEASE;
  if (!choice.atStation) {
    const result = travel.to(creep, choice.position, 0);
    if (['NO_PATH', 'NO_PROGRESS', 'REPATH_EXHAUSTED'].includes(result.code)) {
      memory.harvestRetry = { ...choice.slot, until: Game.time + SLOT_LEASE };
      exports.releaseHarvest(creep);
    }
    return result;
  }
  delete memory.harvestRetry;
  return travel.record(creep, choice.source.energy ? 'HARVEST' : 'SOURCE_REGEN_WAIT', creep.harvest(choice.source));
};
exports.collect = function (creep) {
  const structures = creep.room.find(FIND_STRUCTURES).filter(s =>
    (s.structureType === STRUCTURE_CONTAINER || s.my && s.structureType === STRUCTURE_STORAGE) && s.store && s.store[RESOURCE_ENERGY] > 0);
  const target = creep.pos.findClosestByPath(structures);
  if (target) {
    exports.releaseHarvest(creep);
    return exports.action(creep, 'withdraw', target, 1, RESOURCE_ENERGY);
  }
  return exports.harvest(creep);
};
exports.action = function (creep, method, target, range, argument) {
  const code = argument === undefined ? creep[method](target) : creep[method](target, argument);
  if (code === ERR_NOT_IN_RANGE) return travel.to(creep, target, range);
  return travel.record(creep, method.toUpperCase(), code);
};
exports.urgentUpgrade = function (creep) {
  const controller = creep.room.controller;
  if (controller && controller.my && controller.ticksToDowngrade < 3000 && creep.store[RESOURCE_ENERGY] > 0) {
    exports.action(creep, 'upgradeController', controller, 3); return true;
  }
  return false;
};
exports.deliver = function (creep) {
  const targets = creep.room.find(FIND_MY_STRUCTURES).filter(s =>
    [STRUCTURE_SPAWN, STRUCTURE_EXTENSION].includes(s.structureType) && s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
  targets.sort((a, b) => (a.structureType === STRUCTURE_SPAWN ? 0 : 1) - (b.structureType === STRUCTURE_SPAWN ? 0 : 1));
  const target = targets.length && creep.pos.findClosestByPath(targets.filter(t => t.structureType === targets[0].structureType));
  if (!target) return false;
  exports.action(creep, 'transfer', target, 1, RESOURCE_ENERGY); return true;
};
