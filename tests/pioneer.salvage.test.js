const assert = require('assert');
const { world } = require('./world');

module.exports = function () {
  let passed = 0;
  function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
  function fixture() {
    const w = world({ autoBootstrap: true, autoBuildSpawn: true });
    w.manager.run();
    const room = w.target(0, { my: true, level: 2 });
    const data = { drops: [], ruins: [], tombs: [] };
    const previousFind = room.find.bind(room);
    room.find = kind => ({ 106: data.drops, 118: data.tombs, 123: data.ruins })[kind] || previousFind(kind);
    function unit(name) {
      const creep = { name, room, ticksToLive: 1000, memory: { role: 'expansionPioneer' },
        pos: { x: 13, y: 22, roomName: room.name, getRangeTo(target) {
          const p = target.pos || target;
          return Math.max(Math.abs(this.x - p.x), Math.abs(this.y - p.y));
        }, findPathTo: pos => [{ x: pos.x, y: pos.y }], findClosestByPath: arr => arr[0] },
        store: { energy: 0, getFreeCapacity() { return 50 - this.energy; } },
        getActiveBodyparts: () => 1,
      };
      creep.actions = [];
      for (const method of ['pickup', 'withdraw', 'moveTo', 'build', 'upgradeController']) {
        creep[method] = (...args) => { creep.actions.push([method, ...args]); return 0; };
      }
      w.Game.creeps[name] = creep;
      return creep;
    }
    const ruin = (id, energy) => ({ id, pos: { x: 13, y: 23 }, store: { energy } });
    const run = creep => w.load('expansion.pioneer').run(creep, w.task());
    return { w, room, data, unit, ruin, run };
  }
  test('Pioneer withdraws a bounded amount from a live ruin, then builds after partial salvage', () => {
    const f = fixture(), c = f.unit('p');
    f.data.ruins = [f.ruin('cache', 12)];
    f.room.energyAvailable = 200;
    f.room.structures.push({ my: true, structureType: 'spawn', pos: { x: 5, y: 13 } });
    const site = { structureType: 'extension', pos: { x: 14, y: 22 }, progress: 0, progressTotal: 3000 };
    f.room.sites = [site];
    f.run(c);
    assert.deepEqual(c.actions[0], ['withdraw', f.data.ruins[0], 'energy', 12]);
    f.w.Game.time++; c.store.energy = 12;
    f.run(c);
    assert.deepEqual(c.actions[1], ['build', site]);
    f.room.sites = [];
    f.w.Game.time++; f.run(c);
    assert.equal(c.actions[2][0], 'upgradeController');
  });
  test('Pioneer uses pickup only on dropped energy and ignores empty stores and minerals', () => {
    const f = fixture(), c = f.unit('p');
    const drop = { id: 'energy', pos: { x: 13, y: 23 }, amount: 21, resourceType: 'energy' };
    f.data.drops = [{ ...drop, id: 'mineral', resourceType: 'K' }, drop];
    f.data.ruins = [f.ruin('empty', 0)];
    f.run(c);
    assert.deepEqual(c.actions, [['pickup', drop]]);
  });
  test('Pioneer falls back when a reserved ruin disappears and does not revisit the empty area', () => {
    const f = fixture(), c = f.unit('p');
    c.pos.y = 19;
    const fallback = { structureType: 'container', pos: { x: 13, y: 18 }, store: { energy: 200 } };
    f.room.structures = [fallback];
    f.data.ruins = [f.ruin('vanishing', 100)];
    f.run(c);
    assert.equal(c.actions[0][0], 'moveTo');
    f.w.Game.time++; f.data.ruins = []; f.run(c);
    assert.deepEqual(c.actions[1], ['withdraw', fallback, 'energy']);
    assert.equal(c.memory.pioneerSalvage, undefined);
    f.w.Game.time++; f.run(c);
    assert.deepEqual(c.actions[2], ['withdraw', fallback, 'energy']);
  });
  test('Pioneers reserve scarce energy and can share a sufficiently large ruin', () => {
    const f = fixture(), a = f.unit('a'), b = f.unit('b');
    const fallback = { structureType: 'container', pos: { x: 13, y: 21 }, store: { energy: 200 } };
    f.room.structures = [fallback];
    f.data.ruins = [f.ruin('small', 55)];
    f.run(a); f.run(b);
    assert.equal(a.actions[0][1].id, 'small');
    assert.deepEqual(b.actions[0], ['withdraw', fallback, 'energy']);
    f.w.Game.time += 25;
    f.data.ruins = [f.ruin('large', 100)];
    f.run(a); f.run(b);
    assert.equal(a.actions[1][3], 50);
    assert.equal(b.actions[1][3], 50);
  });
  test('Pioneer rejects incomplete paths and falls back to normal energy collection', () => {
    const f = fixture(), c = f.unit('p');
    c.pos.y = 19;
    c.pos.findPathTo = () => [{ x: 13, y: 20 }];
    const fallback = { structureType: 'container', pos: { x: 13, y: 18 }, store: { energy: 200 } };
    f.room.structures = [fallback];
    f.data.tombs = [f.ruin('blocked', 100)];
    f.run(c);
    assert.deepEqual(c.actions, [['withdraw', fallback, 'energy']]);
  });
  test('Pioneer preserves emergency local recovery after scavenging', () => {
    const f = fixture(), c = f.unit('p');
    f.room.energyAvailable = 0;
    f.room.structures.push({ my: true, structureType: 'spawn', pos: { x: 5, y: 13 } });
    f.data.ruins = [f.ruin('cache', 50)];
    f.run(c);
    assert.equal(c.actions[0][0], 'withdraw');
    f.w.Game.time++; c.store.energy = 50; f.run(c);
    assert.equal(c.memory.role, 'colonyHarvester');
    assert.equal(c.memory.colony, 'E22S37');
  });
  return passed;
};
