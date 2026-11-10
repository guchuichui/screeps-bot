const config = require('expansion.config');
function root() {
  if (!config.telemetryEnabled || !config.observabilityEnabled) return null;
  if (!Memory.expansion) Memory.expansion = { tasks: {} };
  if (!Memory.expansion.telemetryCounters) Memory.expansion.telemetryCounters = {
    epoch: `${Game.shard && Game.shard.name}:${Game.time}`, lastTick: null,
    coveredTicks: 0, missingTicks: 0, rooms: {}, sources: {}, links: {}, harvestActors: {}, creepState: {}, timings: {}, errors: 0, errorKeys: [], spawnEvents: []
  };
  return Memory.expansion.telemetryCounters;
}
function roomCounter(data, name) {
  return data.rooms[name] || (data.rooms[name] = { epoch: data.epoch, observedTicks: 0,
    spawnBusyTicks: 0, workerObservedTicks: 0, emptyWorkerTicks: 0, fatiguedWorkerTicks: 0,
    controllerProgressObserved: 0, controllerTransitionGaps: 0, spawnScheduled: 0, spawnRejected: 0,
    eventTicksRead: 0, harvestAmountEvents: 0, ownedHarvestAmountEvents: 0, energyMovementEventAmount: 0,
    upgradeControlPointEvents: 0, upgradeEnergyEvents: 0 });
}
function eventLog(data, row, room, sources) {
  if (typeof room.getEventLog !== 'function' || typeof EVENT_HARVEST === 'undefined') { row.eventLogStatus = 'unavailable_api'; return; }
  if (Game.cpu.getUsed() >= Game.cpu.limit * 0.85) { row.eventLogStatus = 'unavailable_cpu_budget'; return; }
  try {
    const events = room.getEventLog();
    if (!Array.isArray(events)) { row.eventLogStatus = 'unavailable_format'; return; }
    row.eventLogStatus = 'covered'; row.lastEventTick = Game.time - 1;
    row.eventTicksRead = (row.eventTicksRead || 0) + 1;
    for (const source of sources) data.sources[source.id].eventTicksRead = (data.sources[source.id].eventTicksRead || 0) + 1;
    for (const event of events) {
      const value = event.data || {};
      if (!Number.isFinite(value.amount) || value.amount < 0) continue;
      const actor = typeof Game.getObjectById === 'function' ? Game.getObjectById(event.objectId) : null;
      if (event.event === EVENT_HARVEST && sources.some(s => s.id === value.targetId)) {
        const source = data.sources[value.targetId];
        source.harvestAmountEvents = (source.harvestAmountEvents || 0) + value.amount;
        row.harvestAmountEvents = (row.harvestAmountEvents || 0) + value.amount;
        if (actor && actor.my) row.ownedHarvestAmountEvents = (row.ownedHarvestAmountEvents || 0) + value.amount;
        data.harvestActors[event.objectId] = { objectId: event.objectId, name: actor && actor.name || null,
          sourceId: value.targetId, room: room.name, tick: Game.time - 1,
          work: actor && typeof actor.getActiveBodyparts === 'function' ? actor.getActiveBodyparts(WORK) : null,
          ttl: actor && actor.ticksToLive || null, ownerConfirmed: Boolean(actor && actor.my) };
      } else if (typeof EVENT_TRANSFER !== 'undefined' && event.event === EVENT_TRANSFER && value.resourceType === RESOURCE_ENERGY) {
        row.energyMovementEventAmount = (row.energyMovementEventAmount || 0) + value.amount;
        if (actor && actor.structureType === 'link') {
          const link = data.links[event.objectId] || (data.links[event.objectId] = { eventAmountSent: 0, events: 0 });
          link.eventAmountSent += value.amount; link.events++;
          link.lastEvent = { tick: Game.time - 1, targetId: value.targetId, amount: value.amount };
        }
      } else if (typeof EVENT_UPGRADE_CONTROLLER !== 'undefined' && event.event === EVENT_UPGRADE_CONTROLLER) {
        row.upgradeControlPointEvents = (row.upgradeControlPointEvents || 0) + value.amount;
        if (Number.isFinite(value.energySpent)) row.upgradeEnergyEvents = (row.upgradeEnergyEvents || 0) + value.energySpent;
        else row.upgradeEnergyFieldsMissing = (row.upgradeEnergyFieldsMissing || 0) + 1;
      }
    }
  } catch (error) { row.eventLogStatus = 'unavailable_error'; row.eventReadErrors = (row.eventReadErrors || 0) + 1; }
}
exports.tick = function () {
  const data = root(); if (!data || data.lastTick === Game.time) return;
  if (data.lastAttemptTick === Game.time) return;
  data.lastAttemptTick = Game.time;
  if (Game.cpu.getUsed() >= Game.cpu.limit * 0.9) { data.skippedCpuTicks = (data.skippedCpuTicks || 0) + 1; return; }
  if (data.lastTick !== null && Game.time > data.lastTick + 1) data.missingTicks += Game.time - data.lastTick - 1;
  data.coveredTicks++; data.lastTick = Game.time;
  for (const name of [config.homeRoom, ...config.targetRooms]) {
    const room = Game.rooms[name]; if (!room) continue;
    const row = roomCounter(data, name);
    row.observedTicks++;
    if (Object.values(Game.spawns).some(s => s.room.name === name && s.spawning)) row.spawnBusyTicks++;
    const creeps = Object.values(Game.creeps).filter(c => c.room && c.room.name === name && !c.spawning);
    for (const c of creeps) if (c.getActiveBodyparts(CARRY) && c.store && typeof c.store[RESOURCE_ENERGY] === 'number') {
      row.workerObservedTicks++;
      if (c.store[RESOURCE_ENERGY] === 0) row.emptyWorkerTicks++;
      if (c.fatigue > 0) row.fatiguedWorkerTicks++;
      const state = data.creepState[c.name] || { observedTicks: 0, stationaryTicks: 0, emptyTicks: 0, stationaryEmptyTicks: 0, consecutiveEmptyTicks: 0, consecutiveUnmovedTicks: 0 };
      const consecutive = state.tick === Game.time - 1;
      const stationary = consecutive && state.x === c.pos.x && state.y === c.pos.y && state.room === name;
      const empty = c.store[RESOURCE_ENERGY] === 0;
      state.observedTicks++;
      state.stationaryTicks += stationary ? 1 : 0;
      state.emptyTicks += empty ? 1 : 0;
      state.stationaryEmptyTicks += stationary && empty ? 1 : 0;
      state.consecutiveEmptyTicks = empty ? (consecutive ? state.consecutiveEmptyTicks : 0) + 1 : 0;
      state.consecutiveUnmovedTicks = stationary ? state.consecutiveUnmovedTicks + 1 : 0;
      Object.assign(state, { tick: Game.time, x: c.pos.x, y: c.pos.y, room: name });
      data.creepState[c.name] = state;
    }
    const sources = room.find(FIND_SOURCES);
    for (const source of sources) {
      const s = data.sources[source.id] || (data.sources[source.id] = { epoch: data.epoch, room: name, observedTicks: 0,
        fullTicks: 0, withAdjacentWorkTicks: 0, eventTicksRead: 0, harvestAmountEvents: 0 });
      s.observedTicks++;
      if (typeof source.energyCapacity === 'number' && source.energy === source.energyCapacity) s.fullTicks++;
      if (creeps.some(c => c.getActiveBodyparts(WORK) && c.pos.getRangeTo(source) <= 1)) s.withAdjacentWorkTicks++;
    }
    eventLog(data, row, room, sources);
    const c = room.controller;
    if (c && typeof c.progress === 'number') {
      const previous = row.previousController;
      if (previous && previous.tick === Game.time - 1) {
        if (previous.level === c.level && c.progress >= previous.progress) row.controllerProgressObserved += c.progress - previous.progress;
        else if (c.level > previous.level && typeof previous.total === 'number') row.controllerProgressObserved += previous.total - previous.progress + c.progress;
        else row.controllerTransitionGaps++;
      }
      row.previousController = { tick: Game.time, level: c.level, progress: c.progress, total: c.progressTotal };
    }
  }
  for (const name of Object.keys(data.creepState)) if (!Game.creeps[name]) delete data.creepState[name];
  for (const id of Object.keys(data.harvestActors)) if (Game.time - data.harvestActors[id].tick > 100) delete data.harvestActors[id];
  const errors = [Memory.expansion.lastError, ...Object.values(Memory.expansion.tasks || {}).map(t => t.lastError),
    ...Object.values(Memory.colonies || {}).map(c => c.lastError)].filter(Boolean);
  for (const error of errors) {
    const key = JSON.stringify(error).slice(0, 512);
    if (!data.errorKeys.includes(key)) { data.errors++; data.errorKeys.push(key); if (data.errorKeys.length > 32) data.errorKeys.shift(); }
  }
};
exports.timing = function (name, cost) {
  const data = root(); if (!data || !Number.isFinite(cost) || cost < 0) return;
  const row = data.timings[name] || (data.timings[name] = { samples: 0, totalCpu: 0, maxCpu: 0, latestCpu: 0 });
  row.samples++; row.totalCpu += cost; row.maxCpu = Math.max(row.maxCpu, cost); row.latestCpu = cost;
};
exports.spawn = function (spawn, result, role, body) {
  const data = root(); if (!data) return;
  const event = { tick: Game.time, room: spawn.room.name, spawn: spawn.name, role, apiCode: result,
    scheduled: result === OK, bodyCost: body.reduce((n, p) => n + BODYPART_COST[p], 0) };
  data.spawnEvents.push(event); if (data.spawnEvents.length > 32) data.spawnEvents.shift();
  roomCounter(data, spawn.room.name)[result === OK ? 'spawnScheduled' : 'spawnRejected']++;
};
