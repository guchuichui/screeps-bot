const worker = require('starter.worker');
const defender = require('starter.defender');
const planner = require('starter.planner');

const roleModules = { worker, defender };

module.exports.run = function () {
  if (!Memory.creeps) Memory.creeps = {};
  for (const name in Memory.creeps) if (!Game.creeps[name]) delete Memory.creeps[name];

  const counts = {};
  for (const creep of Object.values(Game.creeps)) {
    // Preserve expansion roles even while disabled, stopped, completed or quarantined.
    if (creep.memory.expansionTask || creep.memory.colony) continue;
    if (!creep.memory.home) creep.memory.home = creep.room.name;
    const roomName = creep.memory.home;
    if (!counts[roomName]) counts[roomName] = emptyCounts();
    const role = normalizeRole(creep);
    // Count every living or spawning Defender against the emergency cap.
    // Broken legacy workers must not block economic replacements.
    if (role === 'defender' || isUsefulWorker(creep)) counts[roomName][role]++;
    const mod = roleModules[role];
    if (mod) {
      try { mod.run(creep); }
      catch (error) { console.log(`Role error ${creep.name} (${role}): ${error}`); }
    }
  }

  const rooms = {};
  for (const spawn of Object.values(Game.spawns)) {
    const room = spawn.room;
    if (!room || !room.controller || !room.controller.my) continue;
    rooms[room.name] = room;
  }
  // Include claimed rooms before their first Spawn exists.
  for (const room of Object.values(Game.rooms)) if (room.controller && room.controller.my) rooms[room.name] = room;
  for (const room of Object.values(rooms)) {
    try {
      if (!runColony('manages', room.name)) planner.run(room);
      runDefense(room);
    }
    catch (error) { console.log(`Colony error ${room.name}: ${error}`); }
  }

  runExpansion('run');
  runColony('run');

  for (const spawn of Object.values(Game.spawns)) {
    const room = spawn.room;
    if (!room || !rooms[room.name] || spawn.spawning) continue;
    if (runColony('manages', room.name)) { runColony('trySpawn', spawn); continue; }
    const c = counts[room.name] || (counts[room.name] = emptyCounts());
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    const siteCount = room.find(FIND_MY_CONSTRUCTION_SITES).length;
    const targets = {
      // Unified workers harvest, fuel the room, build, repair and upgrade.
      worker: Math.min(10, 6 + (siteCount >= 3 ? 2 : 0) + Math.max(0, room.controller.level - 3)),
      defender: defender.needsDefense(hostiles) ? 1 : 0,
    };
    const total = c.worker + c.defender;
    const cap = Math.min(18, 5 + room.controller.level * 2);
    // Necessary support gets a separate safety gate, before optional full staffing.
    if (runExpansion('trySupport', spawn, c, targets)) continue;
    if (total >= cap) continue;

    const priority = targets.defender ? ['defender', 'worker'] : ['worker'];
    const role = priority.find(r => c[r] < targets[r]);
    if (!role) { runExpansion('trySpawn', spawn, c, targets); continue; }
    // Wait for a useful worker body instead of spending energy on weak partial bodies.
    if (role !== 'defender' && room.energyAvailable < 250) continue;
    const body = role === 'defender' ? defender.body(room.energyAvailable) : workerBody(room.energyAvailable);
    if (!body.length) continue;
    const name = `${role}-${room.name}-${Game.time}`;
    const result = spawn.spawnCreep(body, name, { memory: { role, home: room.name } });
    try { require('telemetry.metrics').spawn(spawn, result, role, body); } catch (error) { if (Game.time % 25 === 0) console.log(`Spawn telemetry error: ${error}`); }
    if (result === OK) { c[role]++; console.log(`Spawning ${role} (${body.length} parts) in ${room.name}`); }
    else if (result !== ERR_NOT_ENOUGH_ENERGY && result !== ERR_BUSY) console.log(`Spawn error ${spawn.name}: ${result}`);
  }
};

function runExpansion(method, ...args) {
  try { return require('expansion.manager')[method](...args); }
  catch (error) {
    // Module loading and expansion execution must not stop the established colony.
    if (Game.time % 25 === 0) console.log(`Expansion error: ${error}`);
    if (!Memory.expansion) Memory.expansion = { tasks: {} };
    Memory.expansion.lastError = { tick: Game.time, scope: `expansion.${method}`, reason: String(error.stack || error) };
  }
}
function runColony(method, ...args) {
  try { return require('colony.manager')[method](...args); }
  catch (error) { if (Game.time % 25 === 0) console.log(`New colony error: ${error.stack || error}`); }
}

function emptyCounts() { return { worker: 0, defender: 0 }; }
function normalizeRole(creep) {
  let role = String(creep.memory.role || '').toLowerCase();
  if (roleModules[role]) return role;
  if (role.includes('defend') || role.includes('guard') || creep.getActiveBodyparts(ATTACK) + creep.getActiveBodyparts(RANGED_ATTACK) > 0) role = 'defender';
  else role = 'worker';
  creep.memory.role = role;
  return role;
}
function isUsefulWorker(creep) {
  return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0 && creep.getActiveBodyparts(MOVE) > 0;
}
function workerBody(energy) {
  const pattern = [WORK, WORK, CARRY, MOVE];
  const basic = [WORK, CARRY, MOVE];
  if (energy < 200) return [];
  const patternCost = pattern.reduce((sum, part) => sum + BODYPART_COST[part], 0);
  const body = energy >= patternCost ? pattern.slice() : basic.slice();
  let cost = body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
  while (body.length + pattern.length <= 50) {
    if (cost + patternCost > energy) break;
    body.push(...pattern); cost += patternCost;
  }
  const fillers = [MOVE, WORK, CARRY];
  for (const part of fillers) {
    const partCost = BODYPART_COST[part];
    if (body.length < 50 && cost + partCost <= energy) { body.push(part); cost += partCost; }
  }
  return body;
}
function runDefense(room) {
  const hostiles = room.find(FIND_HOSTILE_CREEPS);
  const towers = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER });
  for (const tower of towers) {
    if (!(tower.store?.getUsedCapacity(RESOURCE_ENERGY) >= 10)) continue;
    const target = hostiles.length ? tower.pos.findClosestByRange(hostiles) : null;
    if (target) { tower.attack(target); continue; }
    const wounded = room.find(FIND_MY_CREEPS, { filter: creep => creep.hits < creep.hitsMax });
    const patient = wounded.length ? tower.pos.findClosestByRange(wounded) : null;
    if (patient) { tower.heal(patient); continue; }
    // Roads are neutral structures, so include all room roads explicitly;
    // other repair targets must belong to us. Towers attack first above.
    const damaged = room.find(FIND_STRUCTURES, {
      filter: s => (s.structureType === STRUCTURE_ROAD || s.my) &&
        s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART &&
        s.hits < s.hitsMax * (s.structureType === STRUCTURE_ROAD ? 0.8 : 0.7),
    }).sort((a, b) => repairPriority(a) - repairPriority(b) ||
      (a.hits / a.hitsMax) - (b.hits / b.hitsMax) || tower.pos.getRangeTo(a) - tower.pos.getRangeTo(b))[0];
    const rampart = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_RAMPART && s.hits < rampartTarget(room),
    }).sort((a, b) => a.hits - b.hits)[0];
    if (damaged) tower.repair(damaged);
    else if (rampart) tower.repair(rampart);
  }
}
function rampartTarget(room) { return room.controller.level >= 6 ? 100000 : 10000; }
function repairPriority(s) { return s.structureType === STRUCTURE_ROAD ? 0 : 1; }
