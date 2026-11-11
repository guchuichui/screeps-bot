const assert = require('assert');
const { world } = require('./world');

module.exports = function () {
  let passed = 0;
  function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
  function fixture(targetRooms, index = 0) {
    const w = world({ autoBootstrap: true, ...(targetRooms ? { targetRooms } : {}) });
    w.manager.run();
    const room = w.target(index, { my: true, level: 1 });
    room.energyAvailable = 300;
    room.energyCapacityAvailable = 300;
    room.structures = [{ my: true, structureType: 'spawn', pos: { x: 20, y: 20 },
      store: { getFreeCapacity: () => 0 } }];
    room.findPath = () => [];
    return { w, room };
  }

  for (const index of [0, 1]) {
    test('Container retirement preserves normal work in ' + ['E22S37', 'E22S38'][index], () => {
      const { w, room } = fixture(null, index);
      const container = { structureType: 'container', my: true, pos: { x: 9, y: 9 },
        hits: 10, hitsMax: 100, store: { getFreeCapacity: () => 100 } };
      const containerSite = { structureType: 'container', pos: { x: 8, y: 8 } };
      room.structures.push(container);
      room.sites = [containerSite, { ...containerSite, pos: { x: 8, y: 9 } }];
      w.load('colony.planner').run(room, {});
      assert.equal(w.calls.length, 0);
      const colony = w.load('colony.manager');
      colony.register(room, w.task(index));
      colony.run();
      assert.equal(w.Memory.colonies[room.name].targets.colonyBuilder, 0);
      const creep = { room, ticksToLive: 200, name: 'retirement-worker',
        memory: { colony: room.name, role: 'colonyHarvester', working: true },
        store: { energy: 50, getFreeCapacity: () => 0 },
        pos: { roomName: room.name, x: 10, y: 9, findClosestByPath: a => a[0], getRangeTo: () => 1 } };
      const actions = [];
      for (const method of ['build', 'repair', 'transfer', 'upgradeController']) {
        creep[method] = target => { actions.push([method, target]); return 0; };
      }
      const worker = w.load('colony.worker');
      worker.run(creep);
      assert.deepEqual(actions.pop(), ['upgradeController', room.controller]);
      const extension = { structureType: 'extension', pos: { x: 19, y: 20 } };
      room.sites.push(extension);
      worker.run(creep);
      assert.deepEqual(actions.pop(), ['build', extension]);
      room.sites.pop();
      const road = { structureType: 'road', hits: 10, hitsMax: 100 };
      room.structures.push(road);
      worker.run(creep);
      assert.deepEqual(actions.pop(), ['repair', road]);
      assert.equal(actions.length, 0);
    });
  }

  test('Pioneer skips pending Container work and builds an Extension instead', () => {
    const { w, room } = fixture();
    const extension = { structureType: 'extension', pos: { x: 19, y: 20 }, progress: 0, progressTotal: 3000 };
    room.sites = [{ ...extension, structureType: 'container' }, extension];
    const built = [];
    const creep = { room, ticksToLive: 200, name: 'retirement-pioneer',
      memory: { role: 'expansionPioneer', working: true }, store: { energy: 50, getFreeCapacity: () => 0 },
      pos: { roomName: room.name, x: 19, y: 19, getRangeTo: () => 1 },
      build(site) { built.push(site); return 0; } };
    w.load('expansion.pioneer').run(creep, w.task());
    assert.deepEqual(built, [extension]);
  });

  test('Tower skips a retiring Container but still repairs a Road', () => {
    const { w, room } = fixture();
    const repaired = [];
    room.structures.push({ my: true, structureType: 'tower', hits: 100, hitsMax: 100,
      pos: { getRangeTo: () => 1 }, store: { getUsedCapacity: () => 10 },
      repair: obj => repaired.push(obj) });
    room.structures.push({ my: true, structureType: 'container', hits: 10, hitsMax: 100 });
    const find = room.find.bind(room);
    room.find = (kind, options) => options?.filter ? find(kind).filter(options.filter) : find(kind);
    w.load('starter.colony').run();
    assert.deepEqual(repaired, []);
    const road = { structureType: 'road', hits: 10, hitsMax: 100 };
    room.structures.push(road);
    w.load('starter.colony').run();
    assert.deepEqual(repaired, [road]);
  });

  test('Another expansion room can still plan a Container', () => {
    const { w, room } = fixture(['E22S39']);
    w.load('colony.planner').run(room, {});
    assert.equal(w.calls[0].site, 'container');
  });
  return passed;
};
