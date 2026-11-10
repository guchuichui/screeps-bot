const config = require('expansion.config');
const claimer = require('expansion.claimer');
const control = require('expansion.control');
const spawnPlanner = require('expansion.planner');

// Reserved later phases: BUILD_SPAWN -> BOOTSTRAP -> STABLE.
// This release stops at CLAIMED and never creates or destroys structures.
module.exports.run = function () {
  const memory = initialize();
  if (!memory || stopped(memory)) return;
  for (const task of Object.values(memory.tasks)) {
    if (!configured(task)) continue;
    try {
      recoverBinding(task);
      if (task.paused) { task.lastProgressAt = Game.time; report(task, 'TASK_PAUSED'); continue; }
      if (observe(task)) {
        const owned = Game.rooms[task.targetRoom];
        if (owned && owned.controller && owned.controller.my && task.status !== 'blocked') {
          const result = spawnPlanner.run(owned, task);
          if (result.state) control.transition(task, result.state, result.code);
          if (result.blocked) block(task, result.code);
          else report(task, result.code);
        }
        continue;
      }
      if (task.status === 'blocked' || task.status === 'failed') {
        const live = task.creepName && Game.creeps[task.creepName];
        const oldGclWait = task.failureReason === 'CLAIM_REJECTED' && task.lastResult && task.lastResult.apiCode === ERR_GCL_NOT_ENOUGH;
        if (live && task.recoveryExhaustedFor !== live.name && (recoverable(task.failureReason) || oldGclWait)) {
          task.status = 'running'; task.lastProgressAt = Game.time;
        } else { if (live) diagnose(task, live); continue; }
      }
      const creep = task.creepName && Game.creeps[task.creepName];
      if (!creep) {
        if (task.creepName && !isSpawning(task.creepName)) fail(task, 'CLAIMER_LOST');
        continue;
      }
      if (!control.flag('autoClaim')) { task.lastProgressAt = Game.time; report(task, 'CLAIM_PAUSED'); continue; }
      if (task.paused) { task.lastProgressAt = Game.time; report(task, 'TASK_PAUSED'); continue; }
      if (!hasCpu()) { task.lastProgressAt = Game.time; report(task, 'CPU_WAIT'); diagnose(task, creep); continue; }
      if (Game.time < (task.nextPathRetryAt || 0)) { diagnose(task, creep); continue; }
      const route = getRoute(task, creep.room.name);
      if (!route) continue;
      const result = claimer.run(creep, task, config, route, hasGcl());
      report(task, result.code, result.apiCode);
      diagnose(task, creep);
      if (result.blocked) block(task, result.code);
      else if (result.failed) fail(task, result.code);
      else if (result.claimed) markClaimed(task);
      else task.status = 'running';
    } catch (error) { block(task, `EXCEPTION: ${error.message || error}`); }
  }
};

// Called only when colony's existing population policy has no pending local role.
module.exports.trySpawn = function (spawn, counts, targets) {
  const memory = initialize();
  if (!memory || stopped(memory) || !control.flag('autoClaim') || !hasCpu() || spawn.spawning) return;
  const room = spawn.room;
  if (room.name !== config.homeRoom || !room.controller || !room.controller.my) return;
  if (room.find(FIND_HOSTILE_CREEPS).length || counts.worker < targets.worker || counts.defender < targets.defender) return;
  const healthyWorkers = Object.values(Game.creeps).filter(c => c.memory.home === room.name &&
    c.memory.role === 'worker' && !c.memory.expansionTask && !c.spawning &&
    c.ticksToLive >= config.minHomeWorkerTtl && c.getActiveBodyparts(WORK) &&
    c.getActiveBodyparts(CARRY) && c.getActiveBodyparts(MOVE)).length;
  if (healthyWorkers < targets.worker) return;
  // Count all expansion units, including retired/disabled missions and in-flight spawn intents.
  const names = new Set(Object.values(Game.creeps).filter(c => c.memory.expansionTask).map(c => c.name));
  for (const s of Object.values(Game.spawns)) if (s.spawning && isManagedName(s.spawning.name, memory)) names.add(s.spawning.name);
  for (const task of Object.values(memory.tasks)) if (task.spawnIntentAt === Game.time) names.add(task.creepName);
  if (names.size >= config.maxConcurrentClaimers) return;

  for (const targetRoom of config.targetRooms) {
    const task = memory.tasks[taskId(targetRoom)];
    if (task.paused || !eligible(task)) continue;
    if (observe(task) || task.status === 'blocked' || task.status === 'failed' || task.creepName) continue;
    if (Game.time < (task.nextRetryAt || 0)) continue;
    if (task.attempts >= config.maxAttempts) { task.status = 'failed'; report(task, 'ATTEMPTS_EXHAUSTED'); continue; }
    if (!hasGcl()) { task.status = 'waiting'; report(task, 'GCL_WAIT'); return; }
    const route = getRoute(task, room.name);
    if (!route) continue;
    const body = chooseBody(room, route.length);
    if (!body) { task.status = 'waiting'; report(task, 'HOME_ENERGY_WAIT'); return; }
    const name = `expansion-${room.name}-${targetRoom}-${Game.time}`;
    const result = spawn.spawnCreep(body, name, { memory: {
      role: 'expansionClaimer', home: room.name, targetRoom, expansionTask: task.id
    } });
    report(task, 'SPAWN_RESULT', result);
    if (result === OK) {
      task.creepName = name;
      task.attempts++;
      task.launchedAt = Game.time;
      task.lastProgressAt = Game.time;
      task.spawnIntentAt = Game.time;
      task.status = 'running';
      delete task.lastPosition;
      task.spawnErrors = 0;
    } else {
      task.nextRetryAt = Game.time + config.spawnRetryCooldown;
      if (result !== ERR_BUSY && result !== ERR_NOT_ENOUGH_ENERGY) {
        task.spawnErrors = (task.spawnErrors || 0) + 1;
        if (task.spawnErrors >= config.maxSpawnErrors) block(task, 'SPAWN_ERRORS_EXHAUSTED');
      }
    }
    return;
  }
};

function initialize() {
  // Disabled-by-config must not mutate unrelated Memory or revive old missions.
  if (!control.flag('enabled')) return null;
  if (!Memory.expansion) Memory.expansion = { emergencyStop: false, tasks: {} };
  const memory = Memory.expansion;
  if (!memory.tasks) memory.tasks = {};
  if (!validConfig()) {
    if (memory.configError !== 'INVALID_CONFIG') console.log('[expansion] INVALID_CONFIG');
    memory.configError = 'INVALID_CONFIG';
    return null;
  }
  delete memory.configError;
  if (stopped(memory)) return memory;
  for (const target of config.targetRooms) {
    const id = taskId(target);
    if (!memory.tasks[id]) memory.tasks[id] = {
      id, homeRoom: config.homeRoom, targetRoom: target,
      state: 'SCOUT', status: 'waiting', attempts: 0, createdAt: Game.time
    };
  }
  return memory;
}
function validConfig() {
  const roomPattern = /^[WE]\d+[NS]\d+$/;
  return roomPattern.test(config.homeRoom) && Array.isArray(config.targetRooms) && config.targetRooms.length > 0 &&
    config.targetRooms.every(r => roomPattern.test(r) && r !== config.homeRoom) &&
    new Set(config.targetRooms).size === config.targetRooms.length && config.mode === 'emergency' &&
    Number.isInteger(config.maxAttempts) && config.maxAttempts > 0 &&
    Number.isInteger(config.maxConcurrentClaimers) && config.maxConcurrentClaimers > 0 &&
    ['retryCooldown', 'spawnRetryCooldown', 'maxSpawnErrors', 'minHomeEnergyReserve', 'minHomeWorkerTtl',
      'minCpuBucket', 'routeCacheTicks', 'noProgressTimeout', 'missionTimeout', 'lifetimeMargin', 'maxRouteRooms']
      .every(key => Number.isFinite(config[key]) && config[key] >= 0) &&
    config.maxSpawnErrors > 0 && config.maxRouteRooms > 0 && config.maxCpuFraction > 0 && config.maxCpuFraction < 1 &&
    Array.isArray(config.avoidRooms);
}
function stopped() { return control.stopped(); }
function taskId(target) { return `${config.homeRoom}:${target}`; }
function configured(task) { return task.homeRoom === config.homeRoom && config.targetRooms.includes(task.targetRoom); }
function hasCpu() {
  return Game.cpu.bucket >= config.minCpuBucket && Game.cpu.getUsed() < Math.min(Game.cpu.limit, Game.cpu.tickLimit) * config.maxCpuFraction;
}
function hasGcl() { return Object.values(Game.rooms).filter(r => r.controller && r.controller.my).length < Game.gcl.level; }
function isSpawning(name) { return Object.values(Game.spawns).some(s => s.spawning && s.spawning.name === name); }
function isManagedName(name, memory) {
  return Boolean(Memory.creeps && Memory.creeps[name] && Memory.creeps[name].expansionTask) ||
    Object.values(memory.tasks).some(t => t.creepName === name);
}
function observe(task) {
  const room = Game.rooms[task.targetRoom];
  if (!room) return task.state === 'CLAIMED';
  task.lastSeenAt = Game.time;
  const controller = room.controller;
  if (!controller) { block(task, 'NO_CONTROLLER'); return true; }
  if (controller.my) { markClaimed(task); return true; }
  if (controller.owner) { block(task, `TARGET_OWNED_BY_OTHER: ${controller.owner.username}`); return true; }
  if (task.state === 'CLAIMED') { block(task, 'OWNERSHIP_LOST'); return true; }
  const home = Object.values(Game.spawns).find(s => s.room.name === config.homeRoom);
  const username = home && home.owner && home.owner.username;
  if (controller.reservation && (!username || controller.reservation.username !== username)) {
    block(task, `FOREIGN_RESERVATION: ${controller.reservation.username}`); return true;
  }
  if (room.find(FIND_HOSTILE_CREEPS).length) { block(task, 'TARGET_HOSTILES'); return true; }
  task.state = 'CLAIM';
  return false;
}
function markClaimed(task) {
  if (task.status === 'blocked') return;
  if (!task.claimedAt) task.claimedAt = Game.time;
  if (['SCOUT', 'CLAIM', 'BLOCKED'].includes(task.state)) control.transition(task, 'CLAIMED', 'CLAIM_CONFIRMED');
  task.status = 'running';
  delete task.failureReason;
  report(task, 'CLAIM_CONFIRMED');
}
function block(task, reason) {
  task.status = 'blocked';
  task.failureReason = reason;
  control.transition(task, 'BLOCKED', reason);
  report(task, reason);
}
function eligible(task) {
  const i = config.targetRooms.indexOf(task.targetRoom);
  return i <= 0 || config.targetRooms.slice(0, i).every(r => Memory.expansion.tasks[taskId(r)].state === 'STABLE');
}
function fail(task, reason) {
  task.failureReason = reason;
  const live = task.creepName && Game.creeps[task.creepName];
  if (live) {
    if (recoverable(reason)) {
      task.pathRetries = (task.pathRetries || 0) + 1;
      delete task.route;
      delete live.memory._move;
      task.lastProgressAt = Game.time;
      task.nextPathRetryAt = Game.time + config.pathRetryCooldown * Math.min(task.pathRetries, 5);
      task.status = task.pathRetries <= config.maxPathRetries ? 'waiting' : 'blocked';
      if (task.status === 'blocked') task.recoveryExhaustedFor = live.name;
    } else task.status = 'blocked';
    report(task, reason);
    diagnose(task, live);
    return;
  }
  delete task.creepName;
  task.status = task.attempts >= config.maxAttempts ? 'failed' : 'waiting';
  task.nextRetryAt = Game.time + config.retryCooldown;
  report(task, reason);
}
function recoverable(reason) {
  return /^(EXIT_UNREACHABLE|NO_PATH|NO_PROGRESS|MISSION_TIMEOUT|MOVE_REJECTED|NO_SAFE_SHORT_ROUTE|EXCEPTION)/.test(reason || '');
}
function recoverBinding(task) {
  if (task.creepName && (Game.creeps[task.creepName] || isSpawning(task.creepName))) return;
  const candidates = Object.values(Game.creeps).filter(c => c.memory.expansionTask === task.id &&
    c.memory.role === 'expansionClaimer' && c.memory.home === task.homeRoom && c.memory.targetRoom === task.targetRoom &&
    c.getActiveBodyparts(CLAIM) && c.getActiveBodyparts(MOVE))
    .sort((a, b) => (b.ticksToLive || 0) - (a.ticksToLive || 0) || a.name.localeCompare(b.name));
  if (!candidates.length) return;
  const creep = candidates[0];
  task.creepName = creep.name;
  task.attempts = Math.max(1, task.attempts || 0);
  task.launchedAt = task.launchedAt || Game.time;
  if (recoverable(task.failureReason) && task.recoveryExhaustedFor !== creep.name || !task.failureReason) {
    task.status = 'running';
    task.lastProgressAt = Game.time;
    task.pathRetries = 0;
    delete task.nextRetryAt;
    delete task.route;
    delete creep.memory._move;
  }
  report(task, 'RECOVERED_BINDING');
  diagnose(task, creep);
}
function diagnose(task, creep) {
  task.diagnostic = { tick: Game.time, task: task.id, state: task.state, status: task.status,
    creep: creep.name, room: creep.room.name, x: creep.pos.x, y: creep.pos.y,
    ttl: creep.ticksToLive, moveResult: task.lastResult && task.lastResult.apiCode,
    reason: task.lastResult && task.lastResult.code, pathRetries: task.pathRetries || 0 };
  if (!task.lastDiagnosticAt || Game.time - task.lastDiagnosticAt >= config.diagnosticInterval) {
    console.log(`[expansion diagnostic] ${JSON.stringify(task.diagnostic)}`);
    task.lastDiagnosticAt = Game.time;
  }
}
function report(task, code, apiCode) {
  const previous = task.lastResult;
  task.lastResult = { tick: Game.time, code };
  if (apiCode !== undefined) task.lastResult.apiCode = apiCode;
  if (!previous || previous.code !== code || previous.apiCode !== apiCode) {
    console.log(`[expansion ${task.targetRoom}] ${code}${apiCode === undefined ? '' : ` (${apiCode})`}`);
  }
}
function getRoute(task, from) {
  if (from === task.targetRoom) return [];
  if (task.route && task.route.from === from && task.route.expires > Game.time) return task.route.steps;
  if (!hasCpu()) { report(task, 'CPU_WAIT'); return null; }
  const steps = Game.map.findRoute(from, task.targetRoom, { routeCallback: name => {
    if (config.avoidRooms.includes(name)) return Infinity;
    const status = Game.map.getRoomStatus(name);
    if (!status || status.status === 'closed') return Infinity;
    const visible = Game.rooms[name];
    if (visible && visible.controller && visible.controller.owner && !visible.controller.my) return Infinity;
    if (visible && visible.find(FIND_HOSTILE_CREEPS).length) return Infinity;
    return 1;
  } });
  if (!Array.isArray(steps) || !steps.length || steps.length > config.maxRouteRooms) {
    if (task.creepName && Game.creeps[task.creepName]) fail(task, 'NO_SAFE_SHORT_ROUTE');
    else { task.nextRetryAt = Game.time + config.retryCooldown; report(task, 'NO_SAFE_SHORT_ROUTE'); }
    return null;
  }
  task.route = { from, expires: Game.time + config.routeCacheTicks, steps };
  return steps;
}
function chooseBody(room, routeLength) {
  // CLAIM needs 5 MOVE to traverse swamp at one tile/tick; fewer suffice on plain routes.
  // One CLAIM is sufficient; extra CLAIM parts increase cost without improving claim success.
  const budget = room.energyAvailable - config.minHomeEnergyReserve;
  const moves = Math.min(5, Math.floor((budget - BODYPART_COST[CLAIM]) / BODYPART_COST[MOVE]));
  if (moves < 1) return null;
  // Unknown paths assume up to 100 steps/room and worst-case swamp fatigue.
  const estimate = routeLength * 100 * Math.ceil(5 / moves);
  if (estimate + config.lifetimeMargin >= CREEP_CLAIM_LIFE_TIME) return null;
  return [CLAIM].concat(Array(moves).fill(MOVE));
}

function recycleCompleted(task) {
  const creep = task.creepName && Game.creeps[task.creepName];
  if (!creep || creep.spawning || !hasCpu() || creep.room.find(FIND_HOSTILE_CREEPS).length) return;
  const spawn = Object.values(Game.spawns).find(s => s.room.name === task.homeRoom);
  if (!spawn) return;
  if (creep.room.name === task.homeRoom) {
    if (creep.pos.isNearTo(spawn)) spawn.recycleCreep(creep);
    else creep.moveTo(spawn, { range: 1, maxRooms: 1, reusePath: 10, maxOps: 2000 });
    return;
  }
  // Keep retirement routing separate from the outbound route and task status.
  if (task.returnRoute && task.returnRoute.from === creep.room.name && task.returnRoute.expires > Game.time) {
    claimer.travel(creep, config, task.returnRoute.steps);
    return;
  }
  const route = Game.map.findRoute(creep.room.name, task.homeRoom, { routeCallback: name => {
    if (config.avoidRooms.includes(name)) return Infinity;
    const visible = Game.rooms[name];
    if (visible && visible.controller && visible.controller.owner && !visible.controller.my) return Infinity;
    if (visible && visible.find(FIND_HOSTILE_CREEPS).length) return Infinity;
    const status = Game.map.getRoomStatus(name);
    return status && status.status !== 'closed' ? 1 : Infinity;
  } });
  if (Array.isArray(route) && route.length && route.length <= config.maxRouteRooms) {
    task.returnRoute = { from: creep.room.name, expires: Game.time + config.routeCacheTicks, steps: route };
    claimer.travel(creep, config, route);
  } else {
    task.returnRoute = { from: creep.room.name, expires: Game.time + config.routeCacheTicks, steps: [] };
  }
}
