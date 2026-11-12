const containerPolicy = require('colony.container-policy');
const config = require('expansion.config');
const control = require('expansion.control');
const work = require('colony.work');
const legacyPlanner = require('starter.planner');
const layout = require('stage04.layout');

exports.run = function (room, colony) {
  if (control.stopped() || !control.flag('autoBootstrap') || !control.hasCpu() || Game.time < (colony.nextPlanAt || 0)) return;
  if (!room.controller.my || room.find(FIND_HOSTILE_CREEPS).length) return;
  colony.nextPlanAt = Game.time + config.localPlanningInterval;
  const storageFirst = config.e22s37Growth && room.name === 'E22S37' && room.controller.level >= 4 && !room.storage?.my;
  if ((!storageFirst && containerPolicy.buildSites(room).length >= 2) || Object.keys(Game.constructionSites).length >= 90) return;
  if (!storageFirst && (colony.planErrors || 0) >= config.maxSiteAttempts) { colony.planResult = 'LOCAL_PLAN_ERRORS_EXHAUSTED'; return; }
  const spawn = room.find(FIND_MY_SPAWNS)[0]; if (!spawn) return;
  const structures = room.find(FIND_STRUCTURES), sites = room.find(FIND_CONSTRUCTION_SITES);
  const level = room.controller.level;
  const count = type => structures.concat(sites).filter(s => s.structureType === type).length;
  const free = (x, y, allowRoad = false) => x > 1 && x < 48 && y > 1 && y < 48 &&
    room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL && !sites.some(s => s.pos.x === x && s.pos.y === y) &&
    !structures.some(s => s.pos.x === x && s.pos.y === y && !(s.structureType === STRUCTURE_RAMPART && s.my) && !(allowRoad && s.structureType === STRUCTURE_ROAD)) &&
    !room.find(FIND_SOURCES).concat(room.find(FIND_MINERALS), [room.controller]).some(o => Math.max(Math.abs(o.pos.x - x), Math.abs(o.pos.y - y)) <= 1);
  const create = (x, y, type) => {
    const code = room.createConstructionSite(x, y, type);
    colony.planResult = { tick: Game.time, type, x, y, code };
    if (code === OK) colony.planErrors = 0;
    else if (![ERR_FULL, ERR_RCL_NOT_ENOUGH].includes(code)) colony.planErrors = (colony.planErrors || 0) + 1;
  };
  if (storageFirst) {
    if (count(STRUCTURE_STORAGE)) { colony.planResult = 'STORAGE_SITE_PRESENT_OR_QUOTA_USED'; return; }
    if ((colony.storageErrors || 0) >= config.maxSiteAttempts) { colony.planResult = 'STORAGE_PLAN_ERRORS_EXHAUSTED'; return; }
    const tile = storageTile(room, spawn, free);
    if (!tile) { colony.planResult = 'NO_SAFE_STORAGE_TILE'; return; }
    create(...tile, STRUCTURE_STORAGE);
    const code = colony.planResult.code;
    if (code === OK) colony.storageErrors = 0;
    else if (![ERR_FULL, ERR_RCL_NOT_ENOUGH].includes(code)) colony.storageErrors = (colony.storageErrors || 0) + 1;
    return;
  }
  const extensionLimit = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][level] || 0;
  const towerLimit = Math.min(1, CONTROLLER_STRUCTURES[STRUCTURE_TOWER][level] || 0);
  const type = level >= 3 && count(STRUCTURE_TOWER) < towerLimit ? STRUCTURE_TOWER :
    count(STRUCTURE_EXTENSION) < extensionLimit ? STRUCTURE_EXTENSION : null;
  if (type) {
    for (let r = 2; r <= 6; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || (dx + dy) % 2 !== 0) continue;
      const x = spawn.pos.x + dx, y = spawn.pos.y + dy;
      if (free(x, y)) { create(x, y, type); return; }
    }
    colony.planResult = 'NO_LEGAL_CORE_POSITION'; return;
  }
  if (containerPolicy.allows(room, STRUCTURE_CONTAINER) &&
      structures.concat(sites).filter(s => s.structureType === STRUCTURE_CONTAINER).length < 5) {
    for (const { source, slots } of work.sources(room)) {
      if (structures.concat(sites).some(s => s.structureType === STRUCTURE_CONTAINER && s.pos.getRangeTo(source) <= 1)) continue;
      const slot = slots.find(p => !structures.concat(sites).some(s => s.pos.x === p.x && s.pos.y === p.y));
      if (slot) { create(slot.x, slot.y, STRUCTURE_CONTAINER); return; }
    }
  }
  if (colony.state === 'STABLE' && level >= 4 && control.hasCpu()) {
    // Reuse the existing higher-RCL planner only after the bootstrap economy is healthy.
    legacyPlanner.run(room); return;
  }
  if (level < 2 || room.energyAvailable < 200) return;
  for (const target of room.find(FIND_SOURCES).concat([room.controller])) {
    const path = room.findPath(spawn.pos, target.pos, { range: target === room.controller ? 3 : 1, ignoreCreeps: true, maxRooms: 1 });
    const tile = path.find(p => free(p.x, p.y));
    if (tile) { create(tile.x, tile.y, STRUCTURE_ROAD); return; }
  }
};

function storageTile(room, spawn, free) {
  const data = layout.snapshot(room);
  if (!data.spawn) return null;
  const base = layout.component(data);
  const candidates = [];
  const { x: sx, y: sy } = spawn.pos;
  const distance = (a, b, x, y) => Math.max(Math.abs(a - x), Math.abs(b - y));
  for (let y = sy - 6; y <= sy + 6; y++) for (let x = sx - 6; x <= sx + 6; x++) {
    if (!base[y * 50 + x] || distance(sx, sy, x, y) < 2 || !free(x, y) || distance(13, 23, x, y) <= 1) continue;
    candidates.push({ tile: [x, y], score: 2 * distance(13, 23, x, y) + distance(sx, sy, x, y) +
      (data.terrain.get(x, y) & TERRAIN_MASK_SWAMP ? 4 : 0) });
  }
  candidates.sort((a, b) => a.score - b.score || a.tile[1] - b.tile[1] || a.tile[0] - b.tile[0]);
  const protectedTiles = work.sources(room).flatMap(source => source.slots).filter(pos => base[pos.y * 50 + pos.x]);
  for (let y = 22; y <= 24; y++) for (let x = 12; x <= 14; x++) if ((x !== 13 || y !== 23) && base[y * 50 + x]) protectedTiles.push({ x, y });
  const controllerSlots = [];
  for (let y = Math.max(0, room.controller.pos.y - 3); y <= Math.min(49, room.controller.pos.y + 3); y++) {
    for (let x = Math.max(0, room.controller.pos.x - 3); x <= Math.min(49, room.controller.pos.x + 3); x++) {
      if (base[y * 50 + x]) controllerSlots.push(y * 50 + x);
    }
  }
  for (const { tile } of candidates) {
    if (!control.hasCpu()) break;
    const reach = layout.component(data, [tile]);
    if (controllerSlots.some(i => reach[i]) && protectedTiles.every(pos => reach[pos.y * 50 + pos.x]) && !base.some((value, i) => value && !reach[i] &&
      (i < 50 || i >= 2450 || i % 50 === 0 || i % 50 === 49))) return tile;
  }
  return null;
}
