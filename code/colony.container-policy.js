const retiredRooms = new Set(['E22S37', 'E22S38']);

// Existing containers can still be emptied while awaiting manual removal.
exports.allows = (room, type) => type !== STRUCTURE_CONTAINER || !retiredRooms.has(room.name);
exports.buildSites = room => room.find(FIND_MY_CONSTRUCTION_SITES)
  .filter(site => exports.allows(room, site.structureType));
