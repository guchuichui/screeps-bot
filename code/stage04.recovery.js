const layout = require('stage04.layout');
const control = require('expansion.control');
const config = require('expansion.config');
const work = require('colony.work');

exports.run = function (data, state, population, home, act, ready) {
  const room = data.room;
  if (!ready) return;
  const site = data.sites.find(o => o.my && o.structureType === STRUCTURE_CONTAINER);
  if (site && site.pos.roomName === room.name) {
    state.reason = 'RETIRE_CONTAINER_SITE';
    act('remove', STRUCTURE_CONTAINER, [site.pos.x, site.pos.y], site.remove(), site.id);
    return;
  }
  const container = data.structures.find(o => o.structureType === STRUCTURE_CONTAINER &&
    o.pos.roomName === room.name && o.store.getUsedCapacity() === 0);
  if (container) {
    state.reason = 'RETIRE_EMPTY_CONTAINER';
    act('destroy', STRUCTURE_CONTAINER, [container.pos.x, container.pos.y], container.destroy(), container.id);
    return;
  }
  if (data.structures.some(o => o.structureType === STRUCTURE_CONTAINER)) state.reason = 'DRAIN_CONTAINER_FIRST';
  else state.reason = 'NO_CONTAINERS';

  if (room.name !== 'E22S38' || !control.flag('autoBootstrap') || !control.flag('autoBuildSpawn')) return;
  const task = Memory.expansion.tasks?.['E22S36:E22S38'];
  if (!task || task.paused || task.failureReason !== 'SITE_ATTEMPTS_EXHAUSTED' ||
      task.siteResult?.code !== ERR_RCL_NOT_ENOUGH || state.recoveryResetAt) return;
  const spawns = data.structures.filter(o => o.structureType === STRUCTURE_SPAWN);
  if (spawns.some(o => o.my) || !spawns.length) {
    // Release only the proven stale construction failure. Do not revive other errors.
    task.siteAttempts = 0;
    delete task.nextSiteAt;
    delete task.spawnPlan;
    delete task.planning;
    delete task.rejectedPositions;
    delete task.failureReason;
    task.status = 'running';
    control.transition(task, 'SPAWN_PLANNING', 'STAGE04_SPAWN_QUOTA_CLEARED');
    state.recoveryResetAt = Game.time;
    state.reason = 'BOOTSTRAP_RESUMED';
    return;
  }
  const old = spawns.length === 1 && spawns[0];
  if (!old || old.my !== false || !old.owner || old.pos.roomName !== 'E22S38' || !layout.same(old.pos, [15, 31]) ||
      data.sites.some(o => o.my && o.structureType === STRUCTURE_SPAWN)) {
    state.reason = 'UNEXPECTED_SPAWN_QUOTA_BLOCKER';
    return;
  }
  if (!population || population.workers < 3 || population.work < 6 || home.energyAvailable < 800 ||
      (task.supportLaunches || 0) >= config.maxSupportLaunches ||
      config.maxSupportEnergy - (task.supportEnergySpent || 0) < config.maxEmergencyPioneerBodyCost) {
    state.reason = 'HOME_RECOVERY_RESERVE';
    return;
  }
  state.reason = 'CLEAR_VERIFIED_FOREIGN_SPAWN';
  act('destroy', STRUCTURE_SPAWN, [15, 31], old.destroy(), old.id);
};

exports.drain = function (creep) {
  const room = creep.room;
  if (Game.shard?.name !== 'shard3' || (room.name !== 'E22S37' && room.name !== 'E22S38') ||
      control.stopped() || Memory.expansion?.stage04Paused === true) return false;
  const containers = room.find(FIND_STRUCTURES).filter(o => o.structureType === STRUCTURE_CONTAINER &&
    o.store[RESOURCE_ENERGY] > 0);
  if (!containers.length) return false;
  const target = creep.pos.findClosestByPath(containers, { range: 1, maxRooms: 1, maxOps: 1000 });
  if (!target) return false;
  const result = work.action(creep, 'withdraw', target, 1, RESOURCE_ENERGY);
  return result.code === 'WITHDRAW' && result.apiCode === OK ||
    ['MOVING', 'ARRIVED', 'TIRED'].includes(result.code);
};
