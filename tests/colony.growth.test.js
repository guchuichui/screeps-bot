const assert = require('assert/strict');
const { world } = require('./world');

module.exports = function () {
  const w = world({ autoBootstrap: true, e22s37Growth: true });
  const room = w.target(0, { my: true, level: 2, ticksToDowngrade: 10000 });
  const store = (energy, free) => ({ energy, getFreeCapacity: () => free, getUsedCapacity: () => energy });
  const pos = (x, y) => ({ x, y, roomName: room.name });
  const spawn = { name: 'local', room, my: true, pos: pos(8, 15), structureType: 'spawn',
    spawnCreep: (body, name, { memory }) => {
      w.calls.push({ body, memory });
      w.Game.creeps[name] = { name, memory, room, spawning: true, getActiveBodyparts: part => body.filter(p => p === part).length };
      return 0;
    }
  };
  room.structures.push(spawn);
  room.energyAvailable = 550;
  room.energyCapacityAvailable = 550;
  const manager = w.load('colony.manager');
  const colony = manager.register(room, { id: 'room-growth' });
  for (let i = 0; i < 12; i++) { w.Game.time++; manager.trySpawn(spawn); }
  assert.equal(w.calls.length, 4);
  assert.equal(w.calls.filter(call => call.memory.role === 'colonyUpgrader').length, 2);
  assert.equal(w.calls.filter(call => call.memory.role === 'colonyHauler').length, 0);

  room.controller.level = 4;
  room.sites.push({ my: true, structureType: 'road', pos: pos(6, 16) },
    { my: true, structureType: 'extension', pos: pos(5, 16) });
  const planner = w.load('colony.planner');
  planner.run(room, colony);
  assert.equal(w.calls.at(-1).site, 'storage');
  room.sites.push({ my: true, structureType: 'storage', pos: pos(w.calls.at(-1).x, w.calls.at(-1).y) });
  w.Game.time += 25;
  planner.run(room, colony);
  assert.equal(colony.planResult, 'STORAGE_SITE_PRESENT_OR_QUOTA_USED');

  room.sites = [];
  room.storage = { my: true, structureType: 'storage', pos: pos(10, 20), store: store(0, 5000) };
  const ruin = { id: 'legacy', pos: pos(13, 23), store: store(1000, 0) };
  const find = room.find.bind(room);
  room.find = kind => kind === w.constants.FIND_RUINS ? [ruin] : find(kind);
  const retiringUpgrader = Object.values(w.Game.creeps).find(c => c.memory.role === 'colonyUpgrader');
  delete w.Game.creeps[retiringUpgrader.name];
  for (let i = 0; i < 3; i++) { w.Game.time++; manager.trySpawn(spawn); }
  assert.equal(w.calls.at(-1).memory.role, 'colonyUpgrader');
  assert.equal(w.calls.filter(call => call.memory?.role === 'colonyHauler').length, 0);

  const hauler = { name: 'legacy-hauler', room, memory: { home: room.name, colony: room.name, role: 'colonyHauler' },
    ticksToLive: 100, pos: { ...pos(13, 22), getRangeTo: () => 1 }, store: store(150, 0),
    transfer(target) { assert.equal(target, room.storage); return 0; },
    withdraw() { assert.fail('retiring hauler must not withdraw from a ruin'); }
  };
  const worker = w.load('colony.worker');
  worker.run(hauler);
  assert.equal(hauler.memory.lastAction.code, 'TRANSFER');
  hauler.store = store(0, 150);
  w.Game.time++;
  worker.run(hauler);
  assert.equal(hauler.memory.lastAction.code, 'HAUL_REFILL_WAIT');

  // A legacy nine-creep population with only upgraders should reuse its workers.
  for (const [name, creep] of Object.entries(w.Game.creeps)) if (creep.memory.colony === room.name) delete w.Game.creeps[name];
  for (let i = 0; i < 9; i++) {
    const name = `legacy-${i}`;
    w.Game.creeps[name] = { name, room, ticksToLive: 500 + i,
      memory: { role: 'colonyUpgrader', home: room.name, colony: room.name },
      getActiveBodyparts: () => 1 };
  }
  room.sites.push({ my: true, structureType: 'extension', pos: pos(7, 16) });
  w.Game.time++;
  colony.nextPlanAt = w.Game.time + 25;
  manager.run();
  assert.equal(colony.targets.colonyHarvester, 2);
  assert.equal(colony.targets.colonyBuilder, 1);
  assert.equal(colony.targets.colonyUpgrader, 1);
  assert.equal(colony.targets.colonyHauler, undefined);
  assert.equal(colony.counts.colonyHarvester, 2);
  assert.equal(colony.counts.colonyBuilder, 1);
  const spawnCalls = w.calls.length;
  manager.trySpawn(spawn);
  assert.equal(w.calls.length, spawnCalls);
  assert.equal(Object.values(w.Game.creeps).filter(c => c.memory.colony === room.name).length, 9);

  console.log('PASS E22S37 runs a four-creep base economy, builds Storage first and does not spawn obsolete haulers');
  return 4;
};
