const travel = require('expansion.travel');

const AREA = { x: 13, y: 23, range: 2 };
const RETRY_AFTER = 20;
let scanTick;
let candidates;

function scan(room) {
  if (scanTick === Game.time) return candidates;
  scanTick = Game.time;
  const nearby = obj => Math.max(Math.abs(obj.pos.x - AREA.x), Math.abs(obj.pos.y - AREA.y)) <= AREA.range;
  candidates = [];
  for (const obj of room.find(FIND_DROPPED_RESOURCES)) {
    if (nearby(obj) && obj.resourceType === RESOURCE_ENERGY && obj.amount > 0) {
      candidates.push({ obj, method: 'pickup', energy: obj.amount });
    }
  }
  for (const obj of room.find(FIND_RUINS).concat(room.find(FIND_TOMBSTONES))) {
    if (nearby(obj) && obj.store && obj.store[RESOURCE_ENERGY] > 0) {
      candidates.push({ obj, method: 'withdraw', energy: obj.store[RESOURCE_ENERGY] });
    }
  }
  return candidates;
}

function reachable(creep, target) {
  if (creep.pos.getRangeTo(target) <= 1) return true;
  const path = creep.pos.findPathTo(target.pos, { range: 1, maxRooms: 1, ignoreCreeps: true, maxOps: 1500 });
  const last = path[path.length - 1];
  return last && Math.max(Math.abs(last.x - target.pos.x), Math.abs(last.y - target.pos.y)) <= 1;
}

exports.applies = room => room.name === 'E22S37';

exports.hasStoredEnergy = room => exports.applies(room) &&
  scan(room).some(entry => entry.method === 'withdraw' && entry.obj.pos.x === AREA.x && entry.obj.pos.y === AREA.y);

exports.collect = function (creep, { withdrawOnly = false, exactTile = false } = {}) {
  const memory = creep.memory;
  if (!exports.applies(creep.room) || memory.pioneerSalvageRetryAt > Game.time) return false;
  const free = creep.store.getFreeCapacity(RESOURCE_ENERGY);
  if (free <= 0) return false;
  const claims = new Map();
  for (const peer of Object.values(Game.creeps)) {
    if (peer.name === creep.name || peer.room?.name !== creep.room.name) continue;
    const claim = peer.memory.pioneerSalvage;
    if (claim && claim.until > Game.time) claims.set(claim.id, (claims.get(claim.id) || 0) + claim.amount);
  }
  const previous = memory.pioneerSalvage;
  const options = scan(creep.room).filter(entry => (!withdrawOnly || entry.method === 'withdraw') &&
    (!exactTile || entry.obj.pos.x === AREA.x && entry.obj.pos.y === AREA.y)).sort((a, b) =>
    Number(b.obj.id === previous?.id) - Number(a.obj.id === previous?.id) ||
    Math.min(free, b.energy) - Math.min(free, a.energy) ||
    creep.pos.getRangeTo(a.obj) - creep.pos.getRangeTo(b.obj) || a.obj.id.localeCompare(b.obj.id));
  for (const { obj, method, energy } of options) {
    const reserved = claims.get(obj.id) || 0;
    const remaining = energy - reserved;
    if (remaining <= 0 || reserved > 0 && (method === 'pickup' || remaining < free)) continue;
    if (previous?.id !== obj.id) {
      if (!reachable(creep, obj)) continue;
      delete memory.navigation;
      delete memory._move;
    }
    const amount = Math.min(free, remaining);
    memory.pioneerSalvage = { id: obj.id, amount, until: Game.time + 5 };
    if (creep.pos.getRangeTo(obj) > 1) {
      const result = travel.to(creep, obj, 1);
      if (!['NO_PATH', 'NO_PROGRESS', 'REPATH_EXHAUSTED'].includes(result.code)) return true;
      // Release the failed salvage route before using the normal resource path.
      delete memory.navigation;
      delete memory._move;
      break;
    }
    const code = method === 'pickup' ? creep.pickup(obj) : creep.withdraw(obj, RESOURCE_ENERGY, amount);
    travel.record(creep, method === 'pickup' ? 'SALVAGE_PICKUP' : 'SALVAGE_WITHDRAW', code);
    if (code === OK) {
      memory.pioneerSalvage.until = Game.time + 1;
      memory.pioneerSalvageTakenAt = Game.time;
      return true;
    }
    delete memory.pioneerSalvage;
  }
  delete memory.pioneerSalvage;
  memory.pioneerSalvageRetryAt = Game.time + RETRY_AFTER;
  return false;
};
