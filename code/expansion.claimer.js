// No game objects are cached across ticks. The manager owns retries and status.
module.exports.run = function (creep, task, config, route, canClaim = true) {
  if (creep.spawning) return { code: 'SPAWNING' };
  if (!creep.getActiveBodyparts(CLAIM) || !creep.getActiveBodyparts(MOVE)) {
    return { failed: true, code: 'BODY_DAMAGED' };
  }
  const position = `${creep.pos.roomName}:${creep.pos.x}:${creep.pos.y}`;
  if (task.lastPosition !== position) {
    task.lastPosition = position;
    task.lastProgressAt = Game.time;
    task.pathRetries = 0;
  }
  if (Game.time - task.lastProgressAt >= config.noProgressTimeout) {
    return { failed: true, code: 'NO_PROGRESS' };
  }
  // Wall-clock mission age includes spawning, CPU waits and pauses. TTL, actual
  // movement progress and bounded repathing are the authoritative liveness checks.
  if (creep.room.find(FIND_HOSTILE_CREEPS).length) {
    return { blocked: true, code: 'HOSTILES_ON_ROUTE' };
  }
  const controller = creep.room.name === task.targetRoom && creep.room.controller;
  if (controller) {
    if (controller.my) return { claimed: true, code: 'ALREADY_OWNED' };
    if (controller.owner) return { blocked: true, code: 'TARGET_OWNED_BY_OTHER' };
    if (controller.reservation && controller.reservation.username !== creep.owner.username) {
      return { blocked: true, code: 'FOREIGN_RESERVATION' };
    }
    if (creep.ticksToLive <= config.lifetimeMargin + creep.pos.getRangeTo(controller)) {
      return { failed: true, code: 'INSUFFICIENT_LIFETIME' };
    }
    if (!creep.pos.isNearTo(controller)) {
      return movement(creep.moveTo(controller, { range: 1, maxRooms: 1, reusePath: 10, maxOps: 2000 }));
    }
    if (!canClaim) { task.lastProgressAt = Game.time; return { code: 'GCL_WAIT' }; }
    const result = creep.claimController(controller);
    if (result === OK) return { code: 'CLAIM_SCHEDULED', apiCode: result };
    if (result === ERR_NOT_IN_RANGE || result === ERR_BUSY) return { code: 'CLAIM_WAIT', apiCode: result };
    if (result === ERR_NO_BODYPART) return { failed: true, code: 'BODY_DAMAGED', apiCode: result };
    if (result === ERR_GCL_NOT_ENOUGH) return { code: 'GCL_WAIT', apiCode: result };
    return { blocked: true, code: 'CLAIM_REJECTED', apiCode: result };
  }
  if (creep.room.name === task.targetRoom) return { blocked: true, code: 'NO_CONTROLLER' };
  return travel(creep, config, route);
};

module.exports.travel = travel;
function travel(creep, config, route) {
  if (!route.length) return { blocked: true, code: 'NO_ROUTE' };
  // Route is recalculated from the creep's current room, so the next exit is always local.
  // Use a route-based estimate until the actual local path becomes visible.
  if (creep.ticksToLive <= Math.max(0, route.length - 1) * 50 + config.lifetimeMargin) {
    return { failed: true, code: 'INSUFFICIENT_LIFETIME' };
  }
  const direction = route[0].exit;
  // A unit already on the requested border must cross even if local pathfinding
  // returns null (e.g. a transient congestion or zero-length path).
  if ((direction === 1 && creep.pos.y === 0) || (direction === 3 && creep.pos.x === 49) ||
      (direction === 5 && creep.pos.y === 49) || (direction === 7 && creep.pos.x === 0)) {
    return movement(creep.move(direction));
  }
  let exit = creep.pos.findClosestByPath(direction, { ignoreCreeps: true, maxRooms: 1 });
  if (!exit) {
    const exits = creep.room.find(direction);
    if (exits.length) exit = creep.pos.findClosestByPath(exits, { ignoreCreeps: true, maxRooms: 1, maxOps: 4000 });
  }
  if (!exit) return { failed: true, code: 'EXIT_UNREACHABLE' };
  // An explicit step crosses the border; moveTo on our current exit tile would stand still.
  if (creep.pos.isEqualTo(exit)) return movement(creep.move(route[0].exit));
  return movement(creep.moveTo(exit, { range: 0, maxRooms: 1, reusePath: 10, maxOps: 2000 }));
}

function movement(result) {
  if (result === ERR_NO_PATH) return { failed: true, code: 'NO_PATH', apiCode: result };
  if (result === OK || result === ERR_TIRED || result === ERR_BUSY) return { code: 'MOVING', apiCode: result };
  return { failed: true, code: 'MOVE_REJECTED', apiCode: result };
}
