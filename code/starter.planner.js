const IMPORTANT = [STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_LAB, STRUCTURE_NUKER, STRUCTURE_POWER_SPAWN];
// Official RCL structure limits. Array index is controller level.
const LIMITS = {
  [STRUCTURE_EXTENSION]: [0,0,5,10,20,30,40,50,60],
  [STRUCTURE_TOWER]: [0,0,0,1,1,2,3,6,6],
  [STRUCTURE_STORAGE]: [0,0,0,0,1,1,1,1,1],
  [STRUCTURE_LINK]: [0,0,0,0,0,2,3,4,6],
  [STRUCTURE_TERMINAL]: [0,0,0,0,0,0,1,1,1],
  [STRUCTURE_LAB]: [0,0,0,0,0,0,3,6,10],
  [STRUCTURE_FACTORY]: [0,0,0,0,0,0,0,1,1],
  [STRUCTURE_OBSERVER]: [0,0,0,0,0,0,0,0,1],
  [STRUCTURE_POWER_SPAWN]: [0,0,0,0,0,0,0,0,1],
  [STRUCTURE_NUKER]: [0,0,0,0,0,0,0,0,1]
};
const LATE_ORDER = [STRUCTURE_STORAGE, STRUCTURE_LINK, STRUCTURE_TERMINAL, STRUCTURE_LAB, STRUCTURE_FACTORY, STRUCTURE_OBSERVER, STRUCTURE_POWER_SPAWN, STRUCTURE_NUKER];

module.exports.run = function (room) {
  // E22S36 construction is placed manually from the reviewed layout, so the
  // ten Extension slots and passing lanes are not consumed by radius planning.
  if (room.name === 'E22S36') return;
  if (!room.controller || !room.controller.my) return;
  if (Object.keys(Game.constructionSites).length >= 90) return;
  const localSites = room.find(FIND_MY_CONSTRUCTION_SITES);
  // Limit active sites so the available builders finish them quickly.
  if (localSites.length < 4 && planNextStructure(room, localSites)) return;
  // Do not dilute builder effort with roads while a Tower/Extension wave is incomplete.
  if (needsCoreStructures(room, localSites)) return;
  if (room.controller.level >= 4 && localSites.length < 4 && planRamparts(room)) return;
  if (localSites.length < 8) planRoads(room);
};

function needsCoreStructures(room, sites) {
  const structures = room.find(FIND_MY_STRUCTURES);
  const count = type => structures.filter(s => s.structureType === type).length;
  const siteCount = type => sites.filter(s => s.structureType === type).length;
  const level = room.controller.level;
  if (level >= 2 && count(STRUCTURE_EXTENSION) < (LIMITS[STRUCTURE_EXTENSION][level] || 0)) return true;
  if (level >= 3 && count(STRUCTURE_TOWER) < (LIMITS[STRUCTURE_TOWER][level] || 0)) return true;
  return (level >= 2 && siteCount(STRUCTURE_EXTENSION) > 0) || (level >= 3 && siteCount(STRUCTURE_TOWER) > 0);
}

function planNextStructure(room, sites) {
  const structures = room.find(FIND_MY_STRUCTURES);
  const level = room.controller.level;
  const built = type => structures.filter(s => s.structureType === type).length + sites.filter(s => s.structureType === type).length;
  const order = [];
  // Fill all five RCL2 extensions early. At RCL3, get the first tower up before the next extension wave.
  if (level === 2) order.push(STRUCTURE_EXTENSION);
  if (level >= 3) order.push(STRUCTURE_TOWER, STRUCTURE_EXTENSION);
  order.push(...LATE_ORDER);
  for (const type of order) {
    const limit = LIMITS[type] ? (LIMITS[type][level] || 0) : 0;
    if (built(type) >= limit) continue;
    const pos = findPlacement(room, type);
    if (!pos) continue;
    const result = room.createConstructionSite(pos.x, pos.y, type);
    if (result === OK) console.log(`Planning ${type} at ${room.name} ${pos.x},${pos.y}`);
    else if (result !== ERR_FULL && result !== ERR_RCL_NOT_ENOUGH) console.log(`Site error ${type} in ${room.name}: ${result}`);
    return true;
  }
  return false;
}

function findPlacement(room, type) {
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return null;
  const candidates = [];
  for (let r = 2; r <= 8; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = spawn.pos.x + dx, y = spawn.pos.y + dy;
      if (x < 2 || x > 47 || y < 2 || y > 47) continue;
      const terrain = room.getTerrain().get(x, y);
      if (terrain === TERRAIN_MASK_WALL) continue;
      const structures = room.lookForAt(LOOK_STRUCTURES, x, y);
      const existingSites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
      if (structures.some(s => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD) || existingSites.length) continue;
      if (structures.some(s => s.structureType === STRUCTURE_ROAD)) continue;
      if (room.lookForAt(LOOK_SOURCES, x, y).length || room.lookForAt(LOOK_MINERALS, x, y).length) continue;
      if (room.controller && room.controller.pos.x === x && room.controller.pos.y === y) continue;
      if (room.find(FIND_SOURCES).some(s => s.pos.getRangeTo(x, y) <= 1)) continue;
      candidates.push({ x, y, score: r * 10 + (terrain === TERRAIN_MASK_SWAMP ? 20 : 0) + Math.random() });
    }
    if (candidates.length >= 8) break;
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates.length ? new RoomPosition(candidates[0].x, candidates[0].y, room.name) : null;
}

function planRoads(room) {
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;
  const targets = room.find(FIND_SOURCES).concat([room.controller]);
  for (const target of targets) {
    const path = PathFinder.search(spawn.pos, { pos: target.pos, range: target === room.controller ? 2 : 1 }, { plainCost: 2, swampCost: 4, roomCallback: name => name === room.name ? undefined : false }).path;
    for (const pos of path) {
      if (Object.keys(Game.constructionSites).length >= 90) return;
      if (room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y).some(s => s.structureType === STRUCTURE_ROAD) || room.lookForAt(LOOK_CONSTRUCTION_SITES, pos.x, pos.y).length) continue;
      const result = room.createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD);
      if (result === OK) return;
      if (result === ERR_FULL) return;
    }
  }
}

function planRamparts(room) {
  const structures = room.find(FIND_MY_STRUCTURES, { filter: s => IMPORTANT.includes(s.structureType) });
  const ramparts = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_RAMPART });
  for (const s of structures) {
    if (ramparts.some(r => r.pos.x === s.pos.x && r.pos.y === s.pos.y)) continue;
    if (room.lookForAt(LOOK_CONSTRUCTION_SITES, s.pos.x, s.pos.y).length) continue;
    return room.createConstructionSite(s.pos.x, s.pos.y, STRUCTURE_RAMPART) === OK;
  }
  return false;
}
