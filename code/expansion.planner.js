const config = require('expansion.config');
const control = require('expansion.control');
const index = (x, y) => y * 50 + x;
const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const neighbors = (x, y, fn) => {
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if ((!dx && !dy) || x + dx < 0 || y + dy < 0 || x + dx > 49 || y + dy > 49) continue;
    fn(x + dx, y + dy);
  }
};

exports.run = function (room, task) {
  if (control.stopped() || task.paused || !room.controller || !room.controller.my) return { code: 'PLANNING_PAUSED' };
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (spawn) return { state: task.state === 'STABLE' ? 'STABLE' : 'BOOTSTRAP', code: 'SPAWN_PRESENT' };
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
  const site = sites.find(s => s.structureType === STRUCTURE_SPAWN);
  if (site) {
    task.spawnPlan = Object.assign(task.spawnPlan || {}, { x: site.pos.x, y: site.pos.y, siteId: site.id });
    return { state: 'BUILD_SPAWN', code: 'SPAWN_SITE_PRESENT' };
  }
  if (!control.hasCpu()) return { code: 'PLANNER_CPU_WAIT' };
  if (Game.time < (task.nextSiteAt || 0)) return { code: 'SITE_COOLDOWN' };
  if ((task.siteAttempts || 0) >= config.maxSiteAttempts) return { blocked: true, code: 'SITE_ATTEMPTS_EXHAUSTED' };
  const data = grid(room);
  if (!data.sources.length) return { blocked: true, code: 'NO_SOURCES' };
  if (!task.spawnPlan || !legal(task.spawnPlan, room, data)) {
    if (!task.planning) task.planning = { cursor: 0, best: null };
    const scan = task.planning;
    const distances = data.sources.concat([room.controller]).map(object => distancesTo(object.pos, data.walk));
    for (let n = 0; n < config.planningBatchSize && scan.cursor < 2500; n++, scan.cursor++) {
      if (n % 20 === 0 && !control.hasCpu()) break;
      const p = { x: scan.cursor % 50, y: Math.floor(scan.cursor / 50) };
      if (!legal(p, room, data) || (task.rejectedPositions || []).includes(index(p.x, p.y))) continue;
      const costs = distances.map(d => d[index(p.x, p.y)]);
      if (costs.some(c => c < 0)) continue;
      let open = 0, adjacent = 0;
      for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) {
        if (data.walk[index(p.x + dx, p.y + dy)]) open++;
        if (Math.max(Math.abs(dx), Math.abs(dy)) === 1 && data.walk[index(p.x + dx, p.y + dy)]) adjacent++;
      }
      if (open < 45 || adjacent < 5) continue;
      const score = costs.reduce((sum, d) => sum + d, 0) * 4 - open + (data.terrain.get(p.x, p.y) === TERRAIN_MASK_SWAMP ? 30 : 0);
      if (!scan.best || score < scan.best.score || score === scan.best.score && index(p.x, p.y) < index(scan.best.x, scan.best.y)) {
        scan.best = { ...p, score };
      }
    }
    if (scan.cursor < 2500) return { state: 'SPAWN_PLANNING', code: 'SCANNING_TERRAIN' };
    if (!scan.best) return { blocked: true, code: `NO_LEGAL_SPAWN_POSITION: hostileStructures=${data.hostileCount}` };
    if (!connected(scan.best, room, data)) {
      // Exclude a cut vertex and continue a bounded rescan instead of sealing a corridor.
      if (!task.rejectedPositions) task.rejectedPositions = [];
      task.rejectedPositions.push(index(scan.best.x, scan.best.y));
      if (task.rejectedPositions.length >= config.maxPlanRejections) return { blocked: true, code: 'SPAWN_CONNECTIVITY_FAILED' };
      task.planning = { cursor: 0, best: null };
      return { code: 'REPLAN_CONNECTIVITY' };
    }
    task.spawnPlan = { ...scan.best, plannedAt: Game.time, reserved: reserved(scan.best, data) };
    delete task.planning;
  }
  if ((task.rejectedPositions || []).includes(index(task.spawnPlan.x, task.spawnPlan.y))) {
    delete task.spawnPlan; return { code: 'REPLAN_REJECTED' };
  }
  if (!control.flag('autoBuildSpawn')) return { state: 'SPAWN_PLANNING', code: 'SPAWN_PLAN_READY' };
  if (Object.keys(Game.constructionSites).length >= 90) {
    task.nextSiteAt = Game.time + config.siteRetryCooldown;
    return { code: 'GLOBAL_SITE_LIMIT' };
  }
  const result = room.createConstructionSite(task.spawnPlan.x, task.spawnPlan.y, STRUCTURE_SPAWN, `Colony-${room.name}`);
  task.siteAttempts = (task.siteAttempts || 0) + 1;
  task.nextSiteAt = Game.time + config.siteRetryCooldown;
  task.siteResult = { tick: Game.time, code: result };
  if (result === OK) return { state: 'BUILD_SPAWN', code: 'SPAWN_SITE_SCHEDULED' };
  if (result === ERR_INVALID_TARGET) {
    if (!task.rejectedPositions) task.rejectedPositions = [];
    task.rejectedPositions.push(index(task.spawnPlan.x, task.spawnPlan.y));
    delete task.spawnPlan;
  }
  return { code: `SPAWN_SITE_ERROR_${result}` };
};

function grid(room) {
  const terrain = room.getTerrain();
  const walk = new Uint8Array(2500);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) walk[index(x, y)] = terrain.get(x, y) === TERRAIN_MASK_WALL ? 0 : 1;
  const structures = room.find(FIND_STRUCTURES);
  const sites = room.find(FIND_CONSTRUCTION_SITES);
  const sources = room.find(FIND_SOURCES);
  const minerals = room.find(FIND_MINERALS);
  for (const s of structures) if (![STRUCTURE_ROAD, STRUCTURE_CONTAINER].includes(s.structureType) &&
      !(s.structureType === STRUCTURE_RAMPART && (s.my || s.isPublic))) walk[index(s.pos.x, s.pos.y)] = 0;
  for (const s of sources.concat(minerals, [room.controller])) walk[index(s.pos.x, s.pos.y)] = 0;
  return { terrain, walk, structures, sites, sources, minerals, hostileCount: structures.filter(s => s.owner && !s.my).length };
}
function legal(p, room, data) {
  if (p.x < 5 || p.x > 44 || p.y < 5 || p.y > 44 || !data.walk[index(p.x, p.y)]) return false;
  if ((room.memory && room.memory.expansionRejected || []).includes(index(p.x, p.y))) return false;
  if (range(p, room.controller.pos) <= 4 || data.sources.some(s => range(p, s.pos) <= 3) || data.minerals.some(s => range(p, s.pos) <= 2)) return false;
  if (data.structures.some(s => range(p, s.pos) === 0 && !(s.structureType === STRUCTURE_RAMPART && s.my))) return false;
  return !data.sites.some(s => range(p, s.pos) === 0);
}
function distancesTo(pos, walk) {
  const d = new Int16Array(2500).fill(-1), queue = [];
  neighbors(pos.x, pos.y, (x, y) => { if (walk[index(x, y)]) { d[index(x, y)] = 0; queue.push(index(x, y)); } });
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    neighbors(current % 50, Math.floor(current / 50), (x, y) => {
      const at = index(x, y);
      if (walk[at] && d[at] < 0) { d[at] = d[current] + 1; queue.push(at); }
    });
  }
  return d;
}
function connected(p, room, data) {
  const walk = data.walk.slice(); walk[index(p.x, p.y)] = 0;
  const d = distancesTo(p, walk);
  // Verify a single adjacent component, not the union of disconnected sides.
  const adjacent = [];
  neighbors(p.x, p.y, (x, y) => { if (walk[index(x, y)]) adjacent.push({ x, y }); });
  if (!adjacent.length) return false;
  const anchor = adjacent[0];
  const component = distancesTo(anchor, walk);
  return adjacent.every(a => a === anchor || component[index(a.x, a.y)] >= 0) &&
    data.sources.concat([room.controller]).every(s => {
      let reachable = false;
      neighbors(s.pos.x, s.pos.y, (x, y) => { if (component[index(x, y)] >= 0) reachable = true; });
      return reachable;
    }) && Array.from(d).some((value, i) => value >= 0 && (i % 50 === 0 || i % 50 === 49 || i < 50 || i >= 2450));
}
function reserved(p, data) {
  const cells = [];
  for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) {
    const x = p.x + dx, y = p.y + dy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 2 || !data.walk[index(x, y)]) continue;
    if ((dx + dy) % 2 === 0) cells.push({ x, y });
  }
  return { futureCore: cells.slice(0, 3), extensions: cells.slice(3), roads: 'Preserve adjacent ring and alternating lanes' };
}
exports.snapshot = function (roomName) {
  const room = Game.rooms[roomName];
  if (!room) return { error: 'NO_VISION', roomName };
  const pos = o => ({ id: o.id, x: o.pos.x, y: o.pos.y, type: o.structureType, my: o.my, owner: o.owner && o.owner.username });
  let terrain = '';
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) terrain += room.getTerrain().get(x, y);
  return { tick: Game.time, roomName, terrain, controller: room.controller && pos(room.controller),
    sources: room.find(FIND_SOURCES).map(pos), minerals: room.find(FIND_MINERALS).map(pos),
    structures: room.find(FIND_STRUCTURES).map(pos), sites: room.find(FIND_CONSTRUCTION_SITES).map(pos) };
};
