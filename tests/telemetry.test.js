const assert = require('assert');
const { world } = require('./world');
module.exports = function () {
  let passed = 0;
  function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
  function fixture() {
    const w = world({ telemetryEnabled: true }); w.manager.run();
    const room = w.target(0, { my: true, level: 6, progress: 0, progressTotal: 1000, ticksToDowngrade: 15000 });
    room.sources[0].energyCapacity = 3000; room.sources[0].ticksToRegeneration = 200;
    return { w, room };
  }
  test('rich snapshot is read-only and does not invent absent throughput', () => {
    const { w, room } = fixture(); const before = JSON.stringify(w.Memory);
    const s = w.load('telemetry.detail').snapshot();
    assert.equal(JSON.stringify(w.Memory), before); assert.equal(w.calls.length, 0);
    assert.equal(s.dynamic.rooms[room.name].sources[0].energy, 3000);
    assert.equal(s.dynamic.rooms[room.name].sources[0].ticksToRegeneration, 200);
    assert.equal(s.dynamic.rooms[room.name].sources[0].walkableAdjacentSlots, 8);
    assert(s.dynamic.unavailable.unobservedTicks); assert.equal(s.dynamic.rooms.E22S38.unavailable, 'NO_VISION');
  });
  test('Link geometry reports capacity/cooldown and never transfers energy', () => {
    const { w, room } = fixture();
    room.structures = [{ id: 'link', structureType: 'link', my: true, pos: { x: 11, y: 11 }, cooldown: 3,
      store: { energy: 400, getCapacity: () => 800 }, transferEnergy() { throw Error('forbidden'); } }];
    const row = w.load('telemetry.detail').snapshot().dynamic.rooms[room.name].links[0];
    assert.equal(row.energy, 400); assert.equal(row.capacity, 800); assert.equal(row.cooldown, 3);
    assert.equal(row.nearSources[0], room.sources[0].id); assert.equal(row.transferStatus.available, false);
  });
  test('unchanged layout and changing energy do not duplicate static terrain', () => {
    const { w, room } = fixture(); w.load('expansion.observe').run();
    const first = w.Memory.expansion.telemetryStatic[room.name]; assert.equal(first.terrain.length, 2500);
    room.sources[0].energy = 2000;
    assert.equal(Object.keys(w.load('telemetry.detail').snapshot().updates).length, 0);
    room.structures.push({ id: 'road', structureType: 'road', pos: { x: 20, y: 20 } });
    assert(w.load('telemetry.detail').snapshot().updates[room.name]);
  });
  test('counters deduplicate ticks and track missing coverage across global reset', () => {
    const { w, room } = fixture(); const metrics = w.load('telemetry.metrics');
    metrics.tick(); metrics.tick(); assert.equal(w.Memory.expansion.telemetryCounters.coveredTicks, 1);
    room.controller.progress = 5; w.Game.time++; metrics.tick();
    assert.equal(w.Memory.expansion.telemetryCounters.rooms[room.name].controllerProgressObserved, 5);
    w.resetModules(); w.Game.time += 5; w.load('telemetry.metrics').tick();
    assert.equal(w.Memory.expansion.telemetryCounters.missingTicks, 4);
    assert.equal(w.Memory.expansion.telemetryCounters.coveredTicks, 3);
  });
  test('spawn telemetry records scheduled/rejected rather than claiming completed births', () => {
    const { w } = fixture(); const metrics = w.load('telemetry.metrics');
    metrics.spawn(w.spawn, 0, 'worker', ['work', 'carry', 'move']);
    metrics.spawn(w.spawn, -6, 'worker', ['work', 'carry', 'move']);
    const c = w.Memory.expansion.telemetryCounters;
    assert.equal(c.rooms.E22S36.spawnScheduled, 1); assert.equal(c.rooms.E22S36.spawnRejected, 1);
    assert.equal(c.spawnEvents[0].bodyCost, 200); assert.equal(w.calls.length, 0);
  });
  test('low CPU defers static scans and telemetry can be fully disabled', () => {
    const { w, room } = fixture(); w.Game.cpu.getUsed = () => 80;
    const result = w.load('telemetry.detail').snapshot();
    assert.equal(result.dynamic.rooms[room.name].staticStatus, 'unavailable_cpu_budget');
    assert.equal(Object.keys(result.updates).length, 0);
    w.config.telemetryEnabled = false; const before = JSON.stringify(w.Memory);
    w.load('telemetry.metrics').tick(); assert.equal(JSON.stringify(w.Memory), before);
  });
  test('confirmed previous-tick events count amounts once without assuming receipts', () => {
    const { w, room } = fixture();
    // Constants are exposed to the isolated game fixture explicitly, as in World.
    w.setGlobal('EVENT_HARVEST', 5); w.setGlobal('EVENT_TRANSFER', 12); w.setGlobal('EVENT_UPGRADE_CONTROLLER', 9);
    const link = { id: 'link', my: true, structureType: 'link' };
    w.Game.getObjectById = id => id === 'link' || id === 'other' ? link : null;
    room.getEventLog = () => [
      { event: 5, objectId: 'creep', data: { targetId: room.sources[0].id, amount: 4 } },
      { event: 12, objectId: 'link', data: { targetId: 'other', resourceType: 'energy', amount: 100 } },
      { event: 9, objectId: 'creep', data: { amount: 2, energySpent: 1 } }
    ];
    const metrics = w.load('telemetry.metrics'); metrics.tick(); metrics.tick();
    const data = w.Memory.expansion.telemetryCounters;
    assert.equal(data.sources[room.sources[0].id].harvestAmountEvents, 4);
    assert.equal(data.links.link.eventAmountSent, 100); assert.equal(data.links.link.receivedEnergy, undefined);
    assert.equal(data.rooms[room.name].upgradeEnergyEvents, 1); assert.equal(data.rooms[room.name].eventTicksRead, 1);
  });
  test('home telemetry counts delivered energy and excludes Link withdrawals from Link sends', () => {
    const { w } = fixture();
    const home = w.Game.rooms.E22S36;
    w.setGlobal('EVENT_HARVEST', 5); w.setGlobal('EVENT_TRANSFER', 12);
    w.setGlobal('EVENT_BUILD', 4); w.setGlobal('EVENT_UPGRADE_CONTROLLER', 9);
    const objects = {
      miner: { my: true, memory: { role: 'miner' } },
      worker: { my: true, memory: { role: 'worker' } },
      link: { my: true, structureType: 'link', id: 'link', cooldown: 0, isActive: () => true, pos: { x: 10, y: 12 } },
      sink: { my: true, structureType: 'link' },
      spawn: { my: true, structureType: 'spawn' }
    };
    home.sources = [{ id: 'source', energy: 3000, energyCapacity: 3000 }];
    home.find = kind => kind === 105 ? home.sources : kind === 108 ? [objects.link] : [];
    w.Game.getObjectById = id => objects[id] || null;
    home.getEventLog = () => [
      { event: 5, objectId: 'miner', data: { targetId: home.sources[0].id, amount: 10 } },
      { event: 12, objectId: 'worker', data: { targetId: 'spawn', resourceType: 'energy', amount: 40 } },
      { event: 12, objectId: 'link', data: { targetId: 'worker', resourceType: 'energy', amount: 30 } },
      { event: 12, objectId: 'link', data: { targetId: 'sink', resourceType: 'energy', amount: 200 } },
      { event: 4, objectId: 'worker', data: { amount: 3 } },
      { event: 9, objectId: 'worker', data: { amount: 1, energySpent: 1 } }
    ];
    w.load('telemetry.metrics').tick();
    const counters = w.Memory.expansion.telemetryCounters;
    const roles = counters.rooms.E22S36.economyRoleEvents;
    assert.equal(roles.worker.deliveredEnergy, 40);
    assert.equal(roles.worker.spawnRefillEnergy, 40);
    assert.equal(roles.worker.buildEvents, 1);
    assert.equal(roles.worker.upgradeEvents, 1);
    assert.equal(roles.miner.harvestEnergy, 10);
    assert.equal(counters.links.link.verifiedSentEnergy, 200);
    assert.equal(counters.links.link.verifiedSendEvents, 1);
    assert.equal(counters.links.link.cooldownReadyTicks, 1);
  });
  test('counter sampling never reads expensive event logs after CPU guard trips', () => {
    const { w, room } = fixture(); w.Game.cpu.getUsed = () => 95;
    room.getEventLog = () => { throw Error('must not read'); };
    w.load('telemetry.metrics').tick();
    assert.equal(w.Memory.expansion.telemetryCounters.skippedCpuTicks, 1);
    assert.equal(w.Memory.expansion.telemetryCounters.coveredTicks, 0);
  });
  return passed;
};
