const assert = require('assert');
const { world } = require('./world');

module.exports = function () {
  let passed = 0;
  function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
  function fixture() {
    const w = world({ autoBootstrap: true });
    const room = w.target(0, { my: true, level: 2, ticksToDowngrade: 10000 });
    const source = room.sources[0];
    const slot = { x: 11, y: 10, roomName: room.name };
    room.getTerrain = () => ({ get(x, y) {
      return Math.max(Math.abs(x - 10), Math.abs(y - 10)) === 1 && (x !== slot.x || y !== slot.y) ? 1 : 0;
    } });
    const resources = { 106: [], 118: [], 123: [] };
    const find = room.find.bind(room);
    room.find = kind => resources[kind] || find(kind);
    function unit(name, role = 'colonyHarvester') {
      const pos = { x: 12, y: 10, roomName: room.name,
        getRangeTo(obj) { const p = obj.pos || obj; return Math.max(Math.abs(p.x - this.x), Math.abs(p.y - this.y)); },
        findPathTo: target => [target], findClosestByPath: list => list[0] };
      const creep = { name, pos, room, memory: { role, colony: room.name },
        store: { energy: 0, getFreeCapacity() { return 50 - this.energy; } },
        ticksToLive: 1000, getActiveBodyparts: () => 1, actions: [] };
      for (const method of ['moveTo', 'harvest', 'withdraw']) {
        creep[method] = (...args) => { creep.actions.push([method, ...args]); return 0; };
      }
      creep.pickup = () => { throw Error('local worker must not call pickup'); };
      w.Game.creeps[name] = creep;
      return creep;
    }
    return { w, room, source, slot, resources, unit, work: w.load('colony.work'), worker: w.load('colony.worker'),
      ruin: energy => ({ id: 'ruin', pos: { x: 13, y: 23 }, store: { energy } }) };
  }

  test('occupied station becomes usable as soon as a working Creep steps away', () => {
    const f = fixture(), harvester = f.unit('waiting'), blocker = f.unit('builder', 'colonyBuilder');
    Object.assign(blocker.pos, f.slot);
    Object.assign(blocker.memory, { sourceId: f.source.id, sourceSlot: f.slot, harvestSlotUntil: f.w.Game.time + 3 });
    assert.equal(f.work.harvest(harvester).code, 'NO_REACHABLE_HARVEST_SLOT');
    blocker.memory.working = true;
    blocker.pos.x = 13;
    f.w.Game.time++;
    assert.equal(f.work.harvest(harvester).code, 'MOVING');
    Object.assign(harvester.pos, f.slot);
    f.w.Game.time++;
    assert.equal(f.work.harvest(harvester).code, 'HARVEST');
  });

  test('active harvest reservations prevent overlap and expired or legacy assignments are reusable', () => {
    const f = fixture(), first = f.unit('first'), second = f.unit('second');
    assert.equal(f.work.harvest(first).code, 'MOVING');
    assert.equal(f.work.harvest(second).code, 'NO_REACHABLE_HARVEST_SLOT');
    f.w.Game.time += 3;
    assert.equal(f.work.harvest(second).code, 'MOVING');
    assert.equal(second.memory.sourceSlot.x, f.slot.x);
    delete second.memory.harvestSlotUntil;
    assert.equal(f.work.harvest(first).code, 'MOVING');
  });

  test('harvester clears a failed route and retries an exact reachable station', () => {
    const f = fixture(), c = f.unit('waiting');
    c.memory.navigation = { retries: 100, nextAt: f.w.Game.time + 100 };
    c.pos.findPathTo = () => [{ x: 12, y: 11 }];
    assert.equal(f.work.harvest(c).code, 'NO_REACHABLE_HARVEST_SLOT');
    c.pos.findPathTo = pos => [pos];
    c.moveTo = () => -2;
    f.w.Game.time++;
    assert.equal(f.work.harvest(c).code, 'NO_PATH');
    assert.equal(c.memory.harvestSlotUntil, undefined);
    assert.equal(c.memory.navigation, undefined);
    c.moveTo = () => 0;
    f.w.Game.time += 3;
    assert.equal(f.work.harvest(c).code, 'MOVING');
  });

  test('local Harvester and Builder use withdraw first and ignore dropped energy', () => {
    const f = fixture(), a = f.unit('miner'), b = f.unit('builder', 'colonyBuilder');
    a.pos.y = 22; b.pos.y = 22;
    const ruin = f.ruin(100);
    f.resources[123] = [ruin];
    f.resources[106] = [{ id: 'drop', pos: ruin.pos, resourceType: 'energy', amount: 300 }];
    f.worker.run(a); f.worker.run(b);
    assert.deepEqual(a.actions, [['withdraw', ruin, 'energy', 50]]);
    assert.deepEqual(b.actions, [['withdraw', ruin, 'energy', 50]]);
  });

  test('local worker and Pioneer share reservations for scarce salvage', () => {
    const f = fixture(), local = f.unit('local'), pioneer = f.unit('pioneer', 'expansionPioneer');
    local.pos.y = 22; pioneer.pos.y = 22;
    const ruin = f.ruin(55);
    f.resources[123] = [ruin];
    assert.equal(f.w.load('expansion.salvage').collect(pioneer), true);
    f.worker.run(local);
    assert.equal(local.actions[0][0], 'moveTo');
    assert.equal(local.actions[0][1].x, f.slot.x);
    assert.equal(local.actions[0][1].y, f.slot.y);
  });

  test('empty, vanished and unreachable salvage falls back without returning to the ruin', () => {
    const f = fixture(), c = f.unit('builder', 'colonyBuilder');
    const storage = { structureType: 'storage', my: true, pos: { x: 11, y: 9 }, store: { energy: 500 } };
    f.room.structures = [storage];
    f.resources[123] = [f.ruin(100)];
    f.worker.run(c);
    assert.equal(c.actions[0][0], 'moveTo');
    f.w.Game.time++;
    f.resources[123] = [];
    f.worker.run(c);
    assert.deepEqual(c.actions[1], ['withdraw', storage, 'energy']);
    f.w.Game.time += 25;
    f.resources[123] = [f.ruin(0)];
    f.worker.run(c);
    assert.deepEqual(c.actions[2], ['withdraw', storage, 'energy']);
    f.w.Game.time += 25;
    f.resources[123] = [f.ruin(100)];
    c.pos.findPathTo = () => [];
    f.worker.run(c);
    assert.deepEqual(c.actions[3], ['withdraw', storage, 'energy']);
  });

  return passed;
};
