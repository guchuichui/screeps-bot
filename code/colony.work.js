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
exports.harvest = function (creep) {
  const room = creep.room;
  const peers = Object.values(Game.creeps).filter(c => c.name !== creep.name &&
    (c.memory.colony === room.name || c.memory.targetRoom === room.name));
  const data = exports.sources(room).filter(s => s.slots.length);
  let assigned = data.find(s => s.source.id === creep.memory.sourceId && s.slots.some(p =>
    creep.memory.sourceSlot && p.x === creep.memory.sourceSlot.x && p.y === creep.memory.sourceSlot.y));
  if (!assigned || !creep.memory.sourceSlot) {
    const choices = [];
    for (const s of data) {
      const used = peers.filter(c => c.memory.sourceId === s.source.id);
      for (const p of s.slots) {
        if (used.some(c => c.memory.sourceSlot && c.memory.sourceSlot.x === p.x && c.memory.sourceSlot.y === p.y)) continue;
        const position = new RoomPosition(p.x, p.y, room.name);
        choices.push({ source: s.source, slot: p, pos: position, load: used.reduce((n, c) => n + c.getActiveBodyparts(WORK), 0) });
      }
    }
    choices.sort((a, b) => a.load - b.load || creep.pos.getRangeTo(a.pos) - creep.pos.getRangeTo(b.pos) || a.source.id.localeCompare(b.source.id));
    for (const choice of choices) {
      if (creep.memory.sourceAvoid && creep.memory.sourceAvoid.until > Game.time &&
          creep.memory.sourceAvoid.x === choice.slot.x && creep.memory.sourceAvoid.y === choice.slot.y) continue;
      // Resolve reachability before reserving a station; ignore temporary creep occupancy.
      if (!creep.pos.isEqualTo(choice.pos) && !creep.pos.findClosestByPath([choice.pos], { ignoreCreeps: true, maxRooms: 1 })) continue;
      creep.memory.sourceId = choice.source.id;
      creep.memory.sourceSlot = choice.slot;
      assigned = { source: choice.source, slots: [choice.slot] };
      break;
    }
  }
  if (!assigned) return travel.record(creep, 'NO_REACHABLE_HARVEST_SLOT');
  const p = creep.memory.sourceSlot;
  const pos = new RoomPosition(p.x, p.y, room.name);
  if (!creep.pos.isEqualTo(pos)) {
    const result = travel.to(creep, pos, 0);
    if (['NO_PATH', 'REPATH_EXHAUSTED'].includes(result.code)) {
      creep.memory.sourceAvoid = { ...p, until: Game.time + 50 };
      delete creep.memory.sourceId; delete creep.memory.sourceSlot;
    }
    return result;
  }
  return travel.record(creep, assigned.source.energy ? 'HARVEST' : 'SOURCE_REGEN_WAIT', creep.harvest(assigned.source));
};
exports.collect = function (creep) {
  const structures = creep.room.find(FIND_STRUCTURES).filter(s =>
    (s.structureType === STRUCTURE_CONTAINER || s.my && s.structureType === STRUCTURE_STORAGE) && s.store && s.store[RESOURCE_ENERGY] > 0);
  const target = creep.pos.findClosestByPath(structures);
  if (target) return exports.action(creep, 'withdraw', target, 1, RESOURCE_ENERGY);
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
