const config = require('expansion.config');
const control = require('expansion.control');
const claimer = require('expansion.claimer');

exports.go = function (creep, destination) {
  if (creep.room.name === destination) {
    const p = creep.pos;
    const inward = p.x === 0 ? 3 : p.x === 49 ? 7 : p.y === 0 ? 5 : p.y === 49 ? 1 : 0;
    if (inward) return record(creep, 'ENTER_ROOM', creep.move(inward));
    return { code: 'ARRIVED' };
  }
  return perform(creep, () => {
    const nav = creep.memory.navigation;
    if (!nav.route || nav.from !== creep.room.name || nav.destination !== destination || nav.expires <= Game.time) {
      if (!control.hasCpu()) return { code: 'CPU_WAIT' };
      const route = Game.map.findRoute(creep.room.name, destination, { routeCallback: name => {
        if (config.avoidRooms.includes(name)) return Infinity;
        const room = Game.rooms[name], status = Game.map.getRoomStatus(name);
        if (!status || status.status === 'closed' || room && room.find(FIND_HOSTILE_CREEPS).length) return Infinity;
        if (room && room.controller && room.controller.owner && !room.controller.my) return Infinity;
        return 1;
      } });
      if (!Array.isArray(route) || !route.length || route.length > config.maxRouteRooms) return { failed: true, code: 'NO_ROUTE' };
      Object.assign(nav, { route, from: creep.room.name, destination, expires: Game.time + config.routeCacheTicks });
    }
    return claimer.travel(creep, config, nav.route);
  });
};
exports.to = function (creep, target, range = 1) {
  return perform(creep, () => {
    const code = creep.moveTo(target, { range, maxRooms: 1, reusePath: 5, maxOps: 3000 });
    return { code: code === ERR_NO_PATH ? 'NO_PATH' : 'MOVING', apiCode: code, failed: code === ERR_NO_PATH };
  });
};
function perform(creep, action) {
  const nav = creep.memory.navigation || (creep.memory.navigation = {});
  const position = `${creep.room.name}:${creep.pos.x}:${creep.pos.y}`;
  if (nav.position !== position) { nav.position = position; nav.progressAt = Game.time; nav.retries = 0; }
  if (Game.time < (nav.nextAt || 0)) return record(creep, 'REPATH_COOLDOWN');
  if ((nav.retries || 0) > config.maxPathRetries) return record(creep, 'REPATH_EXHAUSTED');
  let result;
  if (Game.time - nav.progressAt > config.noProgressTimeout) result = { failed: true, code: 'NO_PROGRESS' };
  else result = action();
  if (result.failed || result.blocked) {
    nav.retries = (nav.retries || 0) + 1;
    nav.nextAt = Game.time + config.pathRetryCooldown * nav.retries;
    nav.progressAt = Game.time;
    delete nav.route;
    delete creep.memory._move;
  }
  return record(creep, result.code, result.apiCode);
}
function record(creep, code, apiCode) {
  const previous = creep.memory.lastAction;
  creep.memory.lastAction = { tick: Game.time, code, apiCode, room: creep.room.name,
    x: creep.pos.x, y: creep.pos.y, ttl: creep.ticksToLive };
  if (creep.memory.navigation && (apiCode === OK && code !== 'MOVING' || code === 'SOURCE_REGEN_WAIT')) {
    creep.memory.navigation.progressAt = Game.time;
    creep.memory.navigation.retries = 0;
  }
  if (!previous || previous.code !== code && Game.time - (creep.memory.lastLogAt || 0) >= config.diagnosticInterval) {
    console.log(`[colony ${creep.name}] ${JSON.stringify(creep.memory.lastAction)}`);
    creep.memory.lastLogAt = Game.time;
  }
  return { code, apiCode };
}
exports.record = record;
