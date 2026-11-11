const plan = require('stage04.plan');
const layout = require('stage04.layout');
const control = require('expansion.control');

let cacheTick, cached;
function objects(room) {
  if (cacheTick === Game.time) return cached;
  cacheTick = Game.time;
  const links = room.find(FIND_MY_STRUCTURES).filter(o => o.structureType === STRUCTURE_LINK && layout.active(o));
  const endpoints = plan.links.map(tile => layout.at(links, tile, STRUCTURE_LINK));
  cached = endpoints.every(Boolean) && layout.active(room.storage) && layout.same(room.storage.pos, [36, 16]) ? { senders: endpoints.slice(0, 2), hub: endpoints[2] } : null;
  return cached;
}

exports.run = function (room, state) {
  const network = objects(room);
  if (!network) return;
  let free = network.hub.store.getFreeCapacity(RESOURCE_ENERGY);
  for (const source of network.senders) {
    const amount = Math.min(source.store[RESOURCE_ENERGY], free);
    if (source.cooldown !== 0 || amount < 200) continue;
    const code = source.transferEnergy(network.hub, amount);
    if (code === OK) free -= amount;
    state.lastLinkIntent = { tick: Game.time, from: source.id, to: network.hub.id, amount, code };
    if (code !== OK) state.lastLinkError = state.lastLinkIntent;
  }
};

function use(creep, method, target) {
  const code = creep[method](target, RESOURCE_ENERGY);
  if (code === OK) return true;
  return code === ERR_NOT_IN_RANGE && creep.moveTo(target, { range: 1, maxRooms: 1, reusePath: 5 }) !== ERR_NO_PATH;
}

exports.work = function (creep) {
  if (creep.room.name !== 'E22S36' || Game.shard?.name !== 'shard3' || control.stopped() ||
      Memory.expansion?.stage04Paused === true) return false;
  const state = Memory.expansion?.stage04?.home;
  if (state?.phase !== 'OPERATING' || state.reason !== 'LINK_NETWORK_READY') return false;
  const room = creep.room;
  if (!room.controller?.my || room.find(FIND_HOSTILE_CREEPS).length || room.find(FIND_HOSTILE_POWER_CREEPS).length) return false;
  const network = objects(room);
  if (!network) return false;
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] >= 50 && room.energyAvailable >= 300) {
    const sender = network.senders.find((link, i) => layout.same(creep.pos, plan.stations[i]) &&
      link.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
    if (sender && use(creep, 'transfer', sender)) return true;
  }
  const assigned = Game.creeps[state.hubWorker];
  if (!assigned || assigned.room?.name !== room.name || assigned.ticksToLive < 25) {
    state.hubWorker = Object.values(Game.creeps).filter(c => c.room?.name === room.name && c.memory.role === 'worker' &&
      !c.spawning && c.ticksToLive >= 25 && c.getActiveBodyparts(CARRY) && c.getActiveBodyparts(MOVE))
      .sort((a, b) => a.pos.getRangeTo(network.hub) - b.pos.getRangeTo(network.hub) || a.name.localeCompare(b.name))[0]?.name;
  }
  if (creep.name !== state.hubWorker) return false;
  const energy = creep.store[RESOURCE_ENERGY];
  if (energy === 0 && !creep.memory.working) {
    const target = network.hub.store[RESOURCE_ENERGY] >= 50 ? network.hub :
      room.energyAvailable < room.energyCapacityAvailable && room.storage.store[RESOURCE_ENERGY] >= 50 ? room.storage : null;
    if (!target) return false;
    if (use(creep, 'withdraw', target)) {
      creep.memory.stage04LinkDelivery = true;
      return true;
    }
  }
  if (energy > 0 && creep.memory.stage04LinkDelivery) {
    creep.memory.working = true;
    // The native worker refills spawn energy first. When full, buffer into Storage.
    if (room.energyAvailable >= room.energyCapacityAvailable && use(creep, 'transfer', room.storage)) return true;
  }
  if (!energy) delete creep.memory.stage04LinkDelivery;
  return false;
};
