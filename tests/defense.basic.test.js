const assert = require('assert');
const { world } = require('./world');

module.exports = function () {
  let passed = 0;
  function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
  const enemy = parts => ({ getActiveBodyparts: part => parts.includes(part) ? 1 : 0 });

  test('native Defender is demand-only and deduplicated across two Spawns and live units', () => {
    const w = world({ enabled: false });
    w.loadReal('starter.defender');
    const colony = w.load('starter.colony');
    w.Game.spawns.second = { ...w.spawn, name: 'second' };
    colony.run();
    assert.equal(w.calls.length, 0);
    w.home.hostiles = [enemy(['move'])];
    w.Game.time++; colony.run();
    assert.equal(w.calls.length, 0);
    w.home.hostiles = [enemy(['attack'])];
    w.Game.time++; colony.run();
    assert.deepEqual(w.calls.map(call => call.options.memory.role), ['defender']);
    w.Game.creeps[w.calls[0].name] = {
      spawning: true, room: w.home, memory: w.calls[0].options.memory, getActiveBodyparts: () => 0
    };
    w.Game.time++; colony.run();
    assert.equal(w.calls.length, 1);
    w.home.hostiles = [];
    delete w.Game.creeps[w.calls[0].name];
    w.Game.time++; colony.run();
    assert.equal(w.calls.length, 1);
  });

  test('local colony reserves at most one Defender and ignores peaceful scouts for production', () => {
    const w = world({ autoBootstrap: true });
    w.loadReal('starter.defender');
    const colony = w.load('colony.manager');
    w.manager.run();
    const room = w.target(0, { my: true, level: 2 });
    room.energyAvailable = 800;
    colony.register(room, w.task());
    const makeSpawn = name => ({ ...w.spawn, room, name });
    w.Game.creeps.harvester = {
      memory: { role: 'colonyHarvester', colony: room.name, home: room.name }, ticksToLive: 1000,
      getActiveBodyparts: () => 1
    };
    room.hostiles = [enemy(['move'])];
    colony.trySpawn(makeSpawn('one'));
    assert.notEqual(w.calls[0].options.memory.role, 'colonyDefender');
    w.calls.length = 0;
    w.Game.time++;
    room.hostiles = [enemy(['ranged_attack'])];
    colony.trySpawn(makeSpawn('one'));
    colony.trySpawn(makeSpawn('two'));
    assert.equal(w.calls.filter(call => call.options.memory.role === 'colonyDefender').length, 1);
  });

  test('Tower attacks first, then heals and repairs, with no automatic Safe Mode', () => {
    const w = world({ enabled: false });
    w.loadReal('starter.defender');
    const actions = [];
    const tower = { structureType: 'tower', my: true, store: { getUsedCapacity: () => 10 },
      pos: { findClosestByRange: targets => targets[0], getRangeTo: () => 1 },
      attack: t => actions.push(['attack', t]), heal: c => actions.push(['heal', c]),
      repair: s => actions.push(['repair', s]) };
    const wounded = { hits: 50, hitsMax: 100 };
    const road = { structureType: 'road', hits: 20, hitsMax: 100 };
    let towers = [tower], patients = [wounded];
    w.home.controller.safeModeAvailable = 1;
    w.home.controller.activateSafeMode = () => actions.push(['safeMode']);
    w.home.find = (kind, opts) => {
      const list = ({ 102: patients, 103: w.home.hostiles, 107: [road], 108: towers })[kind] || [];
      return opts?.filter ? list.filter(opts.filter) : list;
    };
    const hostile = enemy(['attack']);
    hostile.pos = { getRangeTo: () => 1 };
    const colony = w.load('starter.colony');
    w.home.hostiles = [hostile];
    colony.run();
    w.home.hostiles = [];
    colony.run();
    patients = [];
    colony.run();
    tower.store.getUsedCapacity = () => 0;
    colony.run();
    delete tower.store;
    colony.run();
    towers = [];
    colony.run();
    assert.deepEqual(actions, [['attack', hostile], ['heal', wounded], ['repair', road]]);
  });
  return passed;
};
