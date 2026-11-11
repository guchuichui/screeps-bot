const assert = require('assert');
const { world } = require('./world');

module.exports = function () {
  let passed = 0;
  for (const [label, linkCount, hasSite] of [
    ['zero Links', 0, false], ['one Link', 1, false], ['two Links', 2, false], ['Link site only', 0, true],
  ]) {
    const w = world();
    for (const name of ['LAB', 'NUKER', 'POWER_SPAWN', 'LINK', 'FACTORY', 'OBSERVER']) {
      w.setGlobal('STRUCTURE_' + name, name.toLowerCase());
    }
    const room = w.home;
    const spawn = { structureType: 'spawn', my: true, pos: { x: 35, y: 19 }, store: { getFreeCapacity: () => 300 } };
    const links = Array.from({ length: linkCount }, (_, index) => ({
      id: 'link' + index, structureType: 'link', my: true, pos: { x: 31 + index, y: 18 },
      store: { energy: 0 }, transferEnergy() { throw Error('inactive network issued a send'); }
    }));
    const structures = [spawn, ...links];
    const sites = hasSite ? [{ structureType: 'link', pos: { x: 29, y: 24 } }] : [];
    const source = { id: 'source', pos: { x: 30, y: 22 }, energy: 100 };
    room.energyAvailable = 0; room.energyCapacityAvailable = 300;
    room.memory = { towerRefill: { towerId: 'missing', creepName: 'test' } };
    room.find = (kind, options) => {
      const found = ({ 104: [source], 105: [source], 107: structures, 108: structures, 112: [spawn], 114: sites })[kind] || [];
      return options?.filter ? found.filter(options.filter) : found;
    };
    room.createConstructionSite = () => { throw Error('E22S36 automatic placement'); };
    w.Game.getObjectById = () => null;
    let harvested, delivered;
    const creep = { room, name: 'test', memory: {}, pos: { findClosestByPath(targets) {
      return targets === 104 ? source : targets[0];
    } }, store: { energy: 0, getFreeCapacity() { return 50 - this.energy; }, getUsedCapacity() { return this.energy; } },
    harvest(target) { harvested = target; return 0; }, transfer(target) { delivered = target; return 0; } };
    const worker = w.loadReal('starter.worker');
    w.loadReal('starter.planner').run(room);
    worker.run(creep);
    creep.store.energy = 50;
    worker.run(creep);
    assert.strictEqual(harvested, source);
    assert.strictEqual(delivered, spawn);
    console.log('PASS worker harvesting and Spawn refill with ' + label + ' and manual layout');
    passed++;
  }
  return passed;
};
