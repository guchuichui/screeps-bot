const PARTS = [TOUGH, MOVE, ATTACK, MOVE, RANGED_ATTACK, MOVE, HEAL, MOVE];
module.exports.body = function (energy) {
  let body = [];
  let cost = 0;
  for (const part of PARTS) {
    const p = BODYPART_COST[part];
    if (cost + p > energy || body.length >= 12) break;
    body.push(part); cost += p;
  }
  return body.includes(ATTACK) || body.includes(RANGED_ATTACK) ? body : [];
};
module.exports.run = function (creep) {
  const enemies = creep.room.find(FIND_HOSTILE_CREEPS);
  const target = creep.pos.findClosestByPath(enemies);
  if (!target) {
    const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
    if (spawn && creep.pos.getRangeTo(spawn) > 3) creep.moveTo(spawn);
    return;
  }
  if (creep.getActiveBodyparts(HEAL) && creep.hits < creep.hitsMax) creep.heal(creep);
  const range = creep.pos.getRangeTo(target);
  if (range <= 1 && creep.getActiveBodyparts(ATTACK)) creep.attack(target);
  if (range <= 3 && creep.getActiveBodyparts(RANGED_ATTACK)) creep.rangedAttack(target);
  if (range > 1 && (creep.getActiveBodyparts(ATTACK) || range > 3)) creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' } });
};
