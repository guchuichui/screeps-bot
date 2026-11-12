const config = require('expansion.config');
const control = require('expansion.control');
const plan = require('stage04.plan');
const planB = require('stage04.plan-b');
const layout = require('stage04.layout');
const network = require('stage04.links');
const recovery = require('stage04.recovery');

function workers(room) {
  const ready = Object.values(Game.creeps).filter(c => c.room?.name === room.name &&
    c.memory.home === room.name && c.memory.role === 'worker' && !c.spawning && c.ticksToLive >= 150 &&
    c.getActiveBodyparts(WORK) && c.getActiveBodyparts(CARRY) && c.getActiveBodyparts(MOVE));
  return { workers: ready.length, work: ready.reduce((sum, c) => sum + c.getActiveBodyparts(WORK), 0) };
}

function quiet(room) {
  return room.controller?.my && !room.find(FIND_HOSTILE_CREEPS).length &&
    !room.find(FIND_HOSTILE_POWER_CREEPS).length;
}

function note(state, action, type, tile, code, id) {
  const event = { tick: Game.time, action, type, x: tile[0], y: tile[1], code, id };
  state.lastAction = event;
  (state.events ||= []).push(event);
  if (state.events.length > 16) state.events.shift();
  state.nextAt = Game.time + (code === OK && action === 'create' ? 5 : 25);
  if (code !== OK) state.reason = 'API_REJECTED';
  if (code === OK) state.pending = event;
}

function reconcile(state, data) {
  const pending = state.pending;
  if (!pending || Game.time <= pending.tick) return;
  const tile = [pending.x, pending.y];
  const found = pending.action === 'create' ?
    layout.at(data.structures, tile, pending.type) || layout.at(data.sites, tile, pending.type) :
    [...data.structures, ...data.sites].some(o => o.id === pending.id);
  if (pending.action === 'create' ? found : !found) {
    state.lastConfirmed = { ...pending, observedAt: Game.time };
    delete state.pending;
  } else if (Game.time >= pending.tick + 25) {
    state.lastError = { ...pending, reason: 'INTENT_NOT_OBSERVED', observedAt: Game.time };
    delete state.pending;
    state.nextAt = Game.time + 25;
  }
}

function actionReady(state) {
  return !state.pending && Game.time >= (state.nextAt || 0);
}

function ownedAt(data, tile, type) {
  const object = layout.at(data.structures, tile, type);
  return type === STRUCTURE_ROAD ? object : layout.active(object) ? object : null;
}

function build(data, state, type, tiles) {
  if (tiles.every(tile => ownedAt(data, tile, type))) return true;
  state.reason = 'WAIT_CONSTRUCTION';
  if (!actionReady(state)) return false;
  const candidates = tiles.filter(p => !ownedAt(data, p, type) && !layout.at(data.sites, p, type));
  const workingSites = data.sites.filter(s => s.my && (!config.homePlanB || !obsoleteSite(s)));
  if (!candidates.length || workingSites.length >= 2) return false;
  if (Object.keys(Game.constructionSites).length >= 90) { state.reason = 'SITE_CAP'; return false; }
  const cap = CONTROLLER_STRUCTURES[type]?.[data.room.controller.level] || 0;
  const used = data.structures.concat(data.sites).filter(o => o.structureType === type).length;
  if (used >= cap) { state.reason = 'RCL_OR_ROOM_CAP'; return false; }
  let tile;
  for (const candidate of candidates) {
    if (!layout.legal(data, candidate)) {
      state.reason = 'BUILD_TILE_CONFLICT';
      state.blockedTile = candidate;
    } else if (type !== STRUCTURE_ROAD && !layout.connected(data, [candidate], layout.component(data), Boolean(state.storageMigrationAt))) {
      state.reason = 'BUILD_PATH_BLOCKED';
      state.blockedTile = candidate;
    } else { tile = candidate; break; }
    if (!control.hasCpu()) break;
  }
  if (!tile) return false;
  delete state.blockedTile;
  const code = type === STRUCTURE_SPAWN ?
    data.room.createConstructionSite(...tile, type, `${data.room.name}-South-${tile.join('-')}`) :
    data.room.createConstructionSite(...tile, type);
  note(state, 'create', type, tile, code);
  return false;
}

function recentEconomy(room, state, population) {
  const counters = Memory.expansion?.telemetryCounters?.rooms?.[room.name];
  const harvest = counters?.ownedHarvestAmountEvents;
  const refill = counters?.economyRoleEvents?.worker?.spawnRefillEnergy;
  const previous = state.economy;
  const fresh = counters?.eventLogStatus === 'covered' && counters.lastEventTick >= Game.time - 3;
  const healthy = population.workers >= 3 && population.work >= 6 && room.energyAvailable >= 300;
  const comparable = fresh && previous && previous.epoch === counters.epoch && previous.tick >= Game.time - 15 &&
    Number.isFinite(harvest) && Number.isFinite(refill) && harvest >= previous.harvest && refill >= previous.refill;
  state.economy = {
    tick: Game.time, ...population, energy: room.energyAvailable, capacity: room.energyCapacityAvailable,
    epoch: counters?.epoch, harvest, refill,
    since: healthy ? (comparable && previous.since != null ? previous.since : Game.time) : null,
    harvestedAt: comparable ? (harvest > previous.harvest ? Game.time : previous.harvestedAt) : null,
    refilledAt: comparable ? (refill > previous.refill ? Game.time : previous.refilledAt) : null,
  };
  const e = state.economy;
  return healthy && fresh && e.since != null && Game.time - e.since >= 50 &&
    e.harvestedAt >= Math.max(state.verifySince, Game.time - 150) &&
    e.refilledAt >= Math.max(state.verifySince, Game.time - 150) &&
    room.energyAvailable >= Math.max(500, room.energyCapacityAvailable * 0.55);
}

function retire(data, state, type, tiles, healthy) {
  const tile = tiles.find(p => layout.at(data.structures, p, type) || layout.at(data.sites, p, type));
  if (!tile) return true;
  state.reason = healthy ? 'WAIT_RETIREMENT' : 'ECONOMY_VERIFICATION';
  if (!healthy || !actionReady(state)) return false;
  const structure = layout.at(data.structures, tile, type);
  const site = layout.at(data.sites, tile, type);
  const target = structure || site;
  if (!target.my || target.pos.roomName !== data.room.name ||
      (structure && type === STRUCTURE_LINK && (structure.store.getUsedCapacity() !== 0 || structure.cooldown > 0))) {
    state.reason = 'RETIRE_TARGET_UNSAFE';
    return false;
  }
  if (structure && type === STRUCTURE_EXTENSION && data.room.energyAvailable - structure.store.getUsedCapacity(RESOURCE_ENERGY) <
      Math.max(500, data.room.energyCapacityAvailable * 0.55)) {
    state.reason = 'RETIRE_ENERGY_FLOOR';
    return false;
  }
  if (structure && type === STRUCTURE_EXTENSION && data.room.energyCapacityAvailable - structure.store.getCapacity(RESOURCE_ENERGY) < 1800) {
    state.reason = 'RETIRE_CAPACITY_FLOOR';
    return false;
  }
  note(state, structure ? 'destroy' : 'remove', type, tile, structure ? structure.destroy() : site.remove(), target.id);
  return false;
}

function home(room, state, population) {
  if (!quiet(room)) { state.reason = 'HOME_NOT_SAFE'; delete state.economy; return; }
  if (room.controller.level < 6) { state.reason = 'HOME_RCL_BELOW_6'; return; }
  const data = layout.snapshot(room);
  reconcile(state, data);
  if (!data.spawn || !layout.same(data.spawn.pos, [35, 19]) || !data.storage || !layout.same(data.storage.pos, [36, 16]) ||
      !layout.connected(data)) {
    state.reason = 'HOME_LAYOUT_OR_PATH_BLOCKED'; delete state.economy; return;
  }
  if (!plan.extensions.every(p => ownedAt(data, p, STRUCTURE_EXTENSION))) {
    state.phase = 'BUILD_TEN_EXTENSIONS';
    delete state.verifySince;
    delete state.economy;
    if (population.workers < 2 || population.work < 6 || room.energyAvailable < 300) {
      state.reason = 'HOME_BUILD_RESERVE'; return;
    }
    build(data, state, STRUCTURE_EXTENSION, plan.extensions);
    return;
  }
  state.verifySince ??= Game.time;
  const healthy = recentEconomy(room, state, population);
  state.phase = 'RETIRE_OLD_EXTENSIONS';
  if (!retire(data, state, STRUCTURE_EXTENSION, plan.retireExtensions, healthy)) return;
  state.phase = 'RETIRE_OLD_LINKS';
  if (!retire(data, state, STRUCTURE_LINK, plan.retireLinks, healthy)) return;
  if (population.workers < 2 || population.work < 6 || room.energyAvailable < 300) {
    state.reason = 'HOME_BUILD_RESERVE'; return;
  }
  state.phase = 'BUILD_ROADS';
  if (!build(data, state, STRUCTURE_ROAD, plan.roads)) return;
  state.phase = 'BUILD_REMAINING_EXTENSIONS';
  const cap = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level];
  const ext = data.structures.concat(data.sites).filter(o => o.structureType === STRUCTURE_EXTENSION);
  if (ext.length < cap) {
    const missing = cap - ext.length;
    if (!actionReady(state) || data.sites.filter(s => s.my).length >= 2) { state.reason = 'WAIT_CONSTRUCTION'; return; }
    const tiles = layout.planInfill(data, Math.min(missing, 1));
    state.infill = tiles;
    if (!tiles.length) { state.reason = 'NO_SAFE_INFILL_POSITION'; return; }
    build(data, state, STRUCTURE_EXTENSION, tiles);
    return;
  }
  if (data.sites.some(o => o.structureType === STRUCTURE_EXTENSION)) { state.reason = 'WAIT_EXTENSION_COMPLETION'; return; }
  state.phase = 'BUILD_NEW_LINKS';
  if (!build(data, state, STRUCTURE_LINK, plan.links)) return;
  state.phase = 'OPERATING';
  state.reason = 'LINK_NETWORK_READY';
}

function obsoleteSite(site) {
  return site.structureType === STRUCTURE_EXTENSION && planB.obsoleteSites.some(tile => layout.same(site.pos, tile));
}

function productionReserve(room, state, spawns, removed) {
  const level = room.controller.level;
  // The RCL6 full grid is the floor until it can fund the same 50-part Worker
  // as the later stages. Derive the body price from native production.
  const fullWorker = require('starter.colony').workerBody(Infinity)
    .reduce((cost, part) => cost + BODYPART_COST[part], 0);
  const floor = level === 6 ? 2300 : fullWorker;
  const charged = removed?.store.getUsedCapacity(RESOURCE_ENERGY) || 0;
  const capacity = removed?.store.getCapacity(RESOURCE_ENERGY) || 0;
  state.productionReserve = { tick: Game.time, floor, fullWorker, available: room.energyAvailable,
    capacity: room.energyCapacityAvailable, projectedAvailable: room.energyAvailable - charged,
    projectedCapacity: room.energyCapacityAvailable - capacity };
  const events = Memory.expansion?.telemetryCounters?.spawnEvents || [];
  if (spawns.some(spawn => spawn.spawning) || events.some(event =>
    event.tick === Game.time && event.room === room.name && event.scheduled)) {
    state.reason = 'PRODUCTION_IN_PROGRESS'; return false;
  }
  if (state.productionReserve.projectedCapacity < floor) {
    state.reason = 'MAX_WORKER_CAPACITY_WAIT'; return false;
  }
  if (state.productionReserve.projectedAvailable < floor) {
    state.reason = 'MAX_WORKER_ENERGY_WAIT'; return false;
  }
  return true;
}

function homeB(room, state, population) {
  state.plan = 'B_REVISION_03';
  if (!quiet(room)) { state.reason = 'HOME_NOT_SAFE'; delete state.economy; return; }
  const level = room.controller.level;
  if (level < 6) { state.reason = 'HOME_RCL_BELOW_6'; return; }
  const data = layout.snapshot(room);
  reconcile(state, data);
  const original = ownedAt(data, planB.originalSpawn, STRUCTURE_SPAWN);
  const oldStorage = ownedAt(data, planB.oldStorage, STRUCTURE_STORAGE);
  const storage = ownedAt(data, planB.storage, STRUCTURE_STORAGE);
  const spawns = data.structures.filter(o => o.structureType === STRUCTURE_SPAWN && layout.active(o));
  if (!original || (!oldStorage && !storage && !state.storageMigrationAt) ||
      !layout.connected(data, [], undefined, Boolean(state.storageMigrationAt))) {
    state.reason = 'HOME_LAYOUT_OR_PATH_BLOCKED'; delete state.economy; return;
  }
  if (population.workers < 2 || population.work < 6 || room.energyAvailable < 300) {
    state.reason = 'HOME_BUILD_RESERVE'; delete state.economy; return;
  }
  const extensions = [...planB.extensions, ...planB.retainedExtensions];
  const built = planB.extensions.filter(tile => ownedAt(data, tile, STRUCTURE_EXTENSION)).length;
  const approvedSites = data.sites.filter(s => s.my && s.structureType === STRUCTURE_EXTENSION && !obsoleteSite(s));
  const obsolete = data.sites.find(s => s.my && s.pos.roomName === room.name && obsoleteSite(s));
  state.approvedExtensions = built;
  const cap = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][level];
  const count = data.structures.filter(o => o.structureType === STRUCTURE_EXTENSION).length;
  const pendingExtensions = data.sites.filter(o => o.structureType === STRUCTURE_EXTENSION).length;

  if (obsolete && built > 0 && actionReady(state)) {
    state.phase = 'REPLACE_OBSOLETE_SITES';
    note(state, 'remove', STRUCTURE_EXTENSION, [obsolete.pos.x, obsolete.pos.y], obsolete.remove(), obsolete.id);
    return;
  }
  // Once the old Storage has been removed, recovering it takes priority over
  // every other construction action and survives a Global Reset.
  if (!oldStorage && !storage && state.storageMigrationAt) {
    state.phase = 'REBUILD_STORAGE';
    build(data, state, STRUCTURE_STORAGE, [planB.storage]);
    return;
  }
  const plannedSpawns = planB.spawns.slice(0, level - 6);
  if (plannedSpawns.some(tile => !ownedAt(data, tile, STRUCTURE_SPAWN))) {
    state.phase = 'BUILD_SOUTH_SPAWNS';
    build(data, state, STRUCTURE_SPAWN, plannedSpawns);
    return;
  }
  if (count + pendingExtensions < cap && extensions.some(tile => !ownedAt(data, tile, STRUCTURE_EXTENSION) &&
      !layout.at(data.sites, tile, STRUCTURE_EXTENSION))) {
    state.phase = 'BUILD_APPROVED_EXTENSIONS';
    build(data, state, STRUCTURE_EXTENSION, extensions);
    return;
  }
  state.phase = 'BUILD_APPROVED_ROADS';
  if (!build(data, state, STRUCTURE_ROAD, planB.roads)) return;
  if (approvedSites.length || obsolete) { state.reason = 'WAIT_EXTENSION_COMPLETION'; return; }
  if (level < 7) { state.reason = 'RCL7_REQUIRED_FOR_RETIREMENT'; return; }

  state.verifySince ??= Game.time;
  const healthy = recentEconomy(room, state, population);
  const oldTile = planB.retireExtensions.find(tile => layout.at(data.structures, tile, STRUCTURE_EXTENSION));
  if (oldTile) {
    state.phase = 'RETIRE_OLD_EXTENSIONS';
    const target = ownedAt(data, oldTile, STRUCTURE_EXTENSION);
    const retired = planB.retireExtensions.filter(tile =>
      !planB.obsoleteSites.some(p => p[0] === tile[0] && p[1] === tile[1]) &&
      !layout.at(data.structures, tile, STRUCTURE_EXTENSION)).length;
    if (!target || target.pos.roomName !== room.name) { state.reason = 'RETIRE_TARGET_UNSAFE'; return; }
    if (built <= retired) { state.reason = 'BUILD_REPLACEMENT_FIRST'; return; }
    if (!healthy || !actionReady(state)) { state.reason = 'ECONOMY_VERIFICATION'; return; }
    if (!productionReserve(room, state, spawns, target)) return;
    note(state, 'destroy', STRUCTURE_EXTENSION, oldTile, target.destroy(), target.id);
    return;
  }
  if (oldStorage) {
    state.phase = 'MIGRATE_STORAGE';
    if (!healthy || !actionReady(state)) { state.reason = 'ECONOMY_VERIFICATION'; return; }
    const south = ownedAt(data, planB.spawns[0], STRUCTURE_SPAWN);
    if (!south || south.store.getFreeCapacity(RESOURCE_ENERGY) !== 0 ||
        original.store.getFreeCapacity(RESOURCE_ENERGY) !== 0) {
      state.reason = 'VERIFY_BOTH_SPAWN_REFILLS'; return;
    }
    if (!productionReserve(room, state, spawns)) return;
    if (oldStorage.store.getUsedCapacity() !== 0) { state.reason = 'DRAIN_OLD_STORAGE'; return; }
    const after = { ...data, structures: data.structures.filter(o => o !== oldStorage), storage: null };
    if (!layout.legal(after, planB.storage) || !layout.connected(after, [planB.storage], layout.component(data), true)) {
      state.reason = 'STORAGE_DESTINATION_BLOCKED'; return;
    }
    const code = oldStorage.destroy();
    if (code === OK) state.storageMigrationAt = Game.time;
    note(state, 'destroy', STRUCTURE_STORAGE, planB.oldStorage, code, oldStorage.id);
    return;
  }
  state.phase = 'RETIRE_OLD_LINKS';
  if (!retire(data, state, STRUCTURE_LINK, planB.retireLinks, healthy)) return;
  state.phase = 'BUILD_APPROVED_LINKS';
  if (!build(data, state, STRUCTURE_LINK, planB.links)) return;
  state.phase = 'OPERATING';
  state.linksReady = true;
  state.reason = level < 8 ? 'LINK_NETWORK_READY_RCL8_WAIT' : 'LINK_NETWORK_READY';
}

exports.run = function () {
  if (!exports.enabled() || !control.hasCpu()) return;
  const root = Memory.expansion || (Memory.expansion = { tasks: {} });
  const state = root.stage04 ||= { home: {}, rooms: {} };
  const room = Game.rooms[config.homeRoom];
  if (room) {
    try {
      if (Game.time % 5 === 0) {
        if (config.homeConstructionHold) {
          reconcile(state.home, layout.snapshot(room));
          state.home.reason = 'HOME_LAYOUT_CONFIRMATION_WAIT';
        } else if (config.homePlanB) homeB(room, state.home, workers(room));
        else home(room, state.home, workers(room));
      }
      if (!config.homeConstructionHold && (config.homePlanB ? state.home.linksReady :
          state.home.phase === 'OPERATING' && state.home.reason === 'LINK_NETWORK_READY') && quiet(room)) network.run(room, state.home);
    } catch (error) { state.home.lastError = { tick: Game.time, reason: String(error.stack || error) }; }
  }
  if (Game.time % 5 !== 0) return;
  for (const name of ['E22S37', 'E22S38']) {
    const target = Game.rooms[name];
    if (!target) continue;
    const status = state.rooms[name] ||= {};
    if (!quiet(target)) { status.reason = 'TARGET_NOT_SAFE'; continue; }
    try {
      const data = layout.snapshot(target);
      reconcile(status, data);
      recovery.run(data, status, room && quiet(room) ? workers(room) : null, room,
        (action, type, tile, code, id) => note(status, action, type, tile, code, id), actionReady(status));
    } catch (error) { status.lastError = { tick: Game.time, reason: String(error.stack || error) }; }
  }
};

exports.enabled = () => Game.shard?.name === 'shard3' && config.homeRoom === 'E22S36' &&
  !control.stopped() && Memory.expansion?.stage04Paused !== true;
