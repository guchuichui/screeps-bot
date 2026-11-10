const config = require('expansion.config');
const control = require('expansion.control');
const work = require('colony.work');
const legacyPlanner = require('starter.planner');

exports.run = function (room, colony) {
  if (control.stopped() || !control.flag('autoBootstrap') || !control.hasCpu() || Game.time < (colony.nextPlanAt || 0)) return;
  if (!room.controller.my || room.find(FIND_HOSTILE_CREEPS).length) return;
  colony.nextPlanAt = Game.time + config.localPlanningInterval;
  if (room.find(FIND_MY_CONSTRUCTION_SITES).length >= 2 || Object.keys(Game.constructionSites).length >= 90) return;
  if ((colony.planErrors || 0) >= config.maxSiteAttempts) { colony.planResult = 'LOCAL_PLAN_ERRORS_EXHAUSTED'; return; }
  const spawn = room.find(FIND_MY_SPAWNS)[0]; if (!spawn) return;
  const structures = room.find(FIND_STRUCTURES), sites = room.find(FIND_CONSTRUCTION_SITES);
  const level = room.controller.level;
  const count = type => structures.filter(s => s.structureType === type && s.my).length + sites.filter(s => s.structureType === type && s.my).length;
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
  if (structures.filter(s => s.structureType === STRUCTURE_CONTAINER).length + sites.filter(s => s.structureType === STRUCTURE_CONTAINER).length < 5) {
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
