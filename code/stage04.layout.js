const plan = require('stage04.plan');

const key = (x, y) => y * 50 + x;
const same = (p, [x, y]) => p.x === x && p.y === y;
const range = (p, q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
function nearby(p, radius = 1) {
  const tiles = [];
  for (let y = Math.max(0, p.y - radius); y <= Math.min(49, p.y + radius); y++) {
    for (let x = Math.max(0, p.x - radius); x <= Math.min(49, p.x + radius); x++) {
      if (x !== p.x || y !== p.y) tiles.push(key(x, y));
    }
  }
  return tiles;
}
const asPos = ([x, y]) => ({ x, y });
const tileKey = p => key(p.x, p.y);
const at = (objects, tile, type) => objects.find(o => o.structureType === type && same(o.pos, tile));
const walkable = o => o.structureType === STRUCTURE_ROAD || o.structureType === STRUCTURE_CONTAINER ||
  o.structureType === STRUCTURE_RAMPART && (o.my || o.isPublic);
const active = o => o && o.my && (typeof o.isActive !== 'function' || o.isActive());

function snapshot(room) {
  const structures = room.find(FIND_STRUCTURES);
  const sites = room.find(FIND_CONSTRUCTION_SITES);
  const sources = room.find(FIND_SOURCES);
  const natural = [...sources, ...room.find(FIND_MINERALS), room.controller];
  return { room, structures, sites, sources, natural, terrain: room.getTerrain(),
    spawn: structures.find(o => o.structureType === STRUCTURE_SPAWN && active(o)),
    storage: structures.find(o => o.structureType === STRUCTURE_STORAGE && active(o)) };
}

function occupied(data, tile) {
  return [...data.structures, ...data.sites, ...data.natural].some(o => same(o.pos, tile));
}

function component(data, additions = []) {
  const pass = new Uint8Array(2500);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) {
    pass[key(x, y)] = data.terrain.get(x, y) & TERRAIN_MASK_WALL ? 0 : 1;
  }
  for (const o of [...data.natural, ...data.structures.filter(o => !walkable(o)),
    ...data.sites.filter(o => o.structureType !== STRUCTURE_ROAD && o.structureType !== STRUCTURE_RAMPART &&
      o.structureType !== STRUCTURE_CONTAINER)]) pass[tileKey(o.pos)] = 0;
  for (const tile of additions) pass[tileKey(asPos(tile))] = 0;
  const root = nearby(data.spawn.pos).find(i => pass[i]);
  const seen = new Uint8Array(2500);
  if (root === undefined) return seen;
  const queue = [root];
  seen[root] = 1;
  for (let i = 0; i < queue.length; i++) {
    const pos = { x: queue[i] % 50, y: Math.floor(queue[i] / 50) };
    for (const j of nearby(pos)) if (pass[j] && !seen[j]) {
      seen[j] = 1;
      queue.push(j);
    }
  }
  return seen;
}

function connected(data, additions = [], baseline, storageMigration = false) {
  if (!data.spawn || (!data.storage && !storageMigration) || data.sources.length !== plan.stations.length) return false;
  const seen = component(data, additions);
  if (baseline && baseline.some((value, i) => value && !seen[i] &&
    (i < 50 || i >= 2450 || i % 50 === 0 || i % 50 === 49))) return false;
  if (!plan.stations.every(tile => seen[tileKey(asPos(tile))] &&
    data.sources.some(source => range(source.pos, asPos(tile)) === 1))) return false;
  if (!nearby(data.room.controller.pos, 3).some(i => seen[i])) return false;
  const served = [...data.structures, ...data.sites].filter(o => o.my &&
    [STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_STORAGE, STRUCTURE_LINK, STRUCTURE_TOWER].includes(o.structureType));
  return served.every(o => nearby(o.pos).some(i => seen[i])) &&
    additions.every(tile => nearby(asPos(tile)).some(i => seen[i]));
}

function legal(data, tile) {
  const [x, y] = tile;
  return x >= 2 && x <= 47 && y >= 2 && y <= 47 &&
    !(data.terrain.get(x, y) & TERRAIN_MASK_WALL) && !occupied(data, tile);
}

function planInfill(data, count) {
  const reserved = new Set([...plan.stations, ...plan.corridors, ...plan.roads, ...plan.links, [37, 15]]
    .map(tile => tileKey(asPos(tile))));
  const selected = [];
  const candidates = [];
  const start = data.spawn.pos;
  for (let y = start.y - 8; y <= start.y + 8; y++) for (let x = start.x - 8; x <= start.x + 8; x++) {
    if (reserved.has(key(x, y)) || !legal(data, [x, y])) continue;
    const p = { x, y };
    if (data.sources.some(s => range(s.pos, p) <= 2) || range(data.room.controller.pos, p) <= 3) continue;
    candidates.push({ tile: [x, y], score: range(start, p) + range(data.storage.pos, p) +
      (data.terrain.get(x, y) & TERRAIN_MASK_SWAMP ? 3 : 0) });
  }
  candidates.sort((a, b) => a.score - b.score || tileKey(asPos(a.tile)) - tileKey(asPos(b.tile)));
  const futureLinks = plan.links.filter(tile => !at(data.structures, tile, STRUCTURE_LINK) &&
    !at(data.sites, tile, STRUCTURE_LINK));
  const base = component(data);
  for (const { tile } of candidates) {
    if (selected.length >= count) break;
    if (connected(data, [...futureLinks, ...selected, tile], base)) selected.push(tile);
  }
  return selected;
}

module.exports = { at, active, same, snapshot, component, connected, legal, planInfill };
