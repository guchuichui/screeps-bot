const config = require('expansion.config');
const control = require('expansion.control');
const version = require('expansion.version');

// Read-only Console entry point: returns current Game data without issuing intents.
exports.snapshot = function () {
  const root = Memory.expansion || {};
  const rooms = {};
  for (const name of [config.homeRoom, ...config.targetRooms]) {
    const room = Game.rooms[name];
    rooms[name] = room ? { visible: true, owned: Boolean(room.controller && room.controller.my),
      rcl: room.controller && room.controller.level, energy: room.energyAvailable, capacity: room.energyCapacityAvailable,
      hostiles: room.find(FIND_HOSTILE_CREEPS).length, spawnCount: room.find(FIND_MY_SPAWNS).length,
      sites: room.find(FIND_MY_CONSTRUCTION_SITES).map(s => ({ id: s.id, type: s.structureType,
        x: s.pos && s.pos.x, y: s.pos && s.pos.y, progress: s.progress, total: s.progressTotal })) } : { visible: false };
  }
  const creeps = Object.values(Game.creeps).filter(c => c.memory.home === config.homeRoom ||
    config.targetRooms.includes(c.memory.targetRoom) || config.targetRooms.includes(c.memory.colony)).map(c => ({
    name: c.name, role: c.memory.role, home: c.memory.home, target: c.memory.targetRoom,
    task: c.memory.expansionTask, colony: c.memory.colony, room: c.room && c.room.name,
    x: c.pos && c.pos.x, y: c.pos && c.pos.y, ttl: c.ticksToLive, spawning: Boolean(c.spawning),
    work: c.getActiveBodyparts(WORK), carry: c.getActiveBodyparts(CARRY), move: c.getActiveBodyparts(MOVE),
    lastAction: c.memory.lastAction
  }));
  const spawns = Object.values(Game.spawns).map(s => ({ name: s.name, room: s.room.name,
    spawning: s.spawning ? { name: s.spawning.name, remainingTime: s.spawning.remainingTime, needTime: s.spawning.needTime } : null }));
  const tasks = {};
  for (const [id, task] of Object.entries(root.tasks || {})) tasks[id] = {
    state: task.state, status: task.status, paused: task.paused, claimedAt: task.claimedAt,
    lastSeenAt: task.lastSeenAt, failureReason: task.failureReason, lastResult: task.lastResult,
    supportResult: task.supportResult, supportCheck: task.supportCheck, supportLaunches: task.supportLaunches || 0,
    supportEnergySpent: task.supportEnergySpent || 0, supportErrors: task.supportErrors || 0,
    nextSupportAt: task.nextSupportAt, visionRecoveryLaunches: task.visionRecoveryLaunches || 0, lastError: task.lastError
  };
  const detail = config.telemetryEnabled && Game.cpu.getUsed() < Game.cpu.limit * 0.85 ? require('telemetry.detail').snapshot() : null;
  return { schema: 1, buildId: version.buildId, tick: Game.time, shard: Game.shard && Game.shard.name,
    details: detail ? detail.dynamic : { available: false, reason: config.telemetryEnabled ? 'CPU_BUDGET' : 'DISABLED' }, staticUpdates: detail ? detail.updates : {},
    homeRoom: config.homeRoom, targetRooms: config.targetRooms,
    flags: Object.fromEntries(['enabled', 'emergencyStop', 'autoClaim', 'autoBuildSpawn', 'autoBootstrap'].map(k => [k, control.flag(k)])),
    cpu: { bucket: Game.cpu.bucket, used: Game.cpu.getUsed(), limit: Game.cpu.limit, tickLimit: Game.cpu.tickLimit },
    rooms, creeps, spawns, tasks, supportWait: root.supportWait, lastError: root.lastError,
    limits: { minEmergencyHomeWorkers: config.minEmergencyHomeWorkers, minEmergencyWorkParts: config.minEmergencyWorkParts,
      minHomeEnergyReserve: config.minHomeEnergyReserve, minHomeWorkerTtl: config.minHomeWorkerTtl,
      maxSupportEnergy: config.maxSupportEnergy, maxSupportLaunches: config.maxSupportLaunches,
      minCpuBucket: config.minCpuBucket, maxCpuFraction: config.maxCpuFraction },
    logScope: 'Persisted diagnostics only; historical Console output is not collected' };
};
// Game-side instrumentation only: bounded Memory telemetry, no game operations.
exports.run = function () {
  if (!config.observabilityEnabled) return;
  const root = Memory.expansion || (Memory.expansion = { tasks: {} });
  const previous = root.observation;
  if (previous && previous.buildId === version.buildId && Game.time - previous.tick < config.observationInterval) return;
  const snapshot = exports.snapshot();
  if (Object.keys(snapshot.staticUpdates).length) root.telemetryStatic = { ...(root.telemetryStatic || {}), ...snapshot.staticUpdates };
  delete snapshot.staticUpdates;
  root.observation = snapshot;
};
