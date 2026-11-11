const assert = require('assert/strict');
const { world } = require('./world');
const plan = require('../code/stage04.plan');
const fixture = require('../docs/stage-03/snapshot.json');

module.exports = function () {
  function setup(homeConstructionHold = false) {
    const w = world({ autoBuildSpawn: true, autoBootstrap: true, homeConstructionHold });
    w.Game.shard = { name: 'shard3' };
    w.setGlobal('STRUCTURE_LINK', 'link');
    w.setGlobal('FIND_HOSTILE_POWER_CREEPS', 120);
    w.constants.CONTROLLER_STRUCTURES.link = [0, 0, 0, 0, 0, 2, 3, 4, 6];
    w.constants.CONTROLLER_STRUCTURES.road = Array(9).fill(2500);
    w.Memory.expansion = { tasks: {}, telemetryCounters: { rooms: {} } };
    const home = w.home;
    const log = [];
    const position = (x, y, roomName = home.name) => ({ x, y, roomName });
    let counter = 0;
    const asset = (structureType, x, y, room = home, my = true, energy = 0) => {
      const capacity = structureType === 'extension' ? 50 : 800;
      const id = `asset-${++counter}`;
      return { id, structureType, pos: position(x, y, room.name), my, cooldown: 0,
        store: { energy, getUsedCapacity() { return this.energy; }, getFreeCapacity() { return capacity - this.energy; },
          getCapacity() { return capacity; } },
        destroy() { log.push({ action: 'destroy', type: structureType, x, y }); return room.destroyCode ?? 0; },
        remove() { log.push({ action: 'remove', type: structureType, x, y }); return 0; } };
    };
    Object.assign(home, {
      controller: { my: true, level: 6, pos: position(fixture.controller.x, fixture.controller.y) },
      energyAvailable: 1700, energyCapacityAvailable: 1800,
      getTerrain: () => ({ get: (x, y) => Number(fixture.terrain[y * 50 + x]) }),
      structures: fixture.structures.map(s => asset(s.type, s.x, s.y, home, s.my)),
      sites: [], sources: fixture.sources.map(s => ({ id: s.id, pos: position(s.x, s.y) })),
      find(kind) {
        if (kind === 105) return this.sources;
        if (kind === 107) return this.structures;
        if (kind === 108) return this.structures.filter(s => s.my);
        if (kind === 111) return this.sites;
        if (kind === 103) return this.hostiles;
        if (kind === 120) return this.powerHostiles || [];
        if (kind === 116) return fixture.minerals.map(s => ({ pos: position(s.x, s.y) }));
        return [];
      },
      createConstructionSite(x, y, type) { log.push({ action: 'create', type, x, y }); return this.siteCode ?? 0; },
    });
    home.storage = home.structures.find(s => s.structureType === 'storage');
    for (const unit of Object.values(w.Game.creeps)) unit.room = home;
    const at = (objects, [x, y], type) => objects.find(o => o.structureType === type && o.pos.x === x && o.pos.y === y);
    const tick = time => {
      w.Game.time = time;
      w.load('stage04.autonomy').run();
      return w.Memory.expansion.stage04;
    };
    const feed = time => {
      w.Memory.expansion.telemetryCounters.rooms[home.name] = {
        epoch: 'same', lastEventTick: time - 1, eventLogStatus: 'covered', ownedHarvestAmountEvents: time * 10,
        economyRoleEvents: { worker: { spawnRefillEnergy: time * 10 } },
      };
      return tick(time);
    };
    return { ...w, home, asset, at, log, tick, feed };
  }

  {
    const f = setup();
    const first = plan.extensions[0];
    assert.equal(f.tick(100).home.phase, 'BUILD_TEN_EXTENSIONS');
    assert.deepEqual(f.log, [{ action: 'create', type: 'extension', x: first[0], y: first[1] }]);
    f.tick(100);
    f.tick(105); // The intent has yet to appear. Retrying now would be premature.
    assert.equal(f.log.length, 1);
    f.home.sites.push(f.asset('extension', ...first));
    f.resetModules(); // Observe the same intent across a Global Reset.
    assert.equal(f.tick(110).home.lastConfirmed.observedAt, 110);
    assert.equal(f.log.length, 2);
    assert(f.log.every(o => o.action === 'create'));
  }

  {
    const f = setup();
    f.home.siteCode = -8;
    assert.equal(f.tick(100).home.reason, 'API_REJECTED');
    f.tick(110);
    assert.equal(f.log.length, 1);
    f.home.siteCode = 0;
    f.tick(125);
    assert.equal(f.log.length, 2);
    f.Memory.expansion.stage04Paused = true;
    f.tick(150);
    assert.equal(f.log.length, 2);
  }

  {
    const f = setup();
    const layout = f.load('stage04.layout');
    const runtimePlan = f.load('stage04.plan');
    const safeNine = plan.extensions.filter(([x, y]) => x !== 37 || y !== 13);
    f.home.structures.push(...safeNine.map(p => f.asset('extension', ...p)));
    assert.equal(f.tick(95).home.reason, 'BUILD_PATH_BLOCKED');
    assert.deepEqual(Array.from(f.Memory.expansion.stage04.home.blockedTile), [37, 13]);
    assert.equal(f.log.length, 0);
    // Exercise the retirement gate on a synthetic safe layout.
    const replacement = layout.planInfill(layout.snapshot(f.home), 1)[0];
    assert(replacement);
    runtimePlan.extensions = [...safeNine, replacement];
    f.home.structures.push(f.asset('extension', ...replacement));
    f.home.energyCapacityAvailable = 2300;
    f.home.energyAvailable = 2100;
    const old = f.at(f.home.structures, plan.retireExtensions[0], 'extension');
    old.store.energy = 50;
    for (let time = 100; time < 150; time += 5) f.feed(time);
    assert.equal(f.log.length, 0);
    f.home.powerHostiles = [{}];
    assert.equal(f.feed(150).home.reason, 'HOME_NOT_SAFE');
    f.home.powerHostiles = [];
    for (let time = 155; time < 205; time += 5) f.feed(time);
    f.home.destroyCode = -1;
    assert.equal(f.feed(205).home.reason, 'API_REJECTED');
    assert.equal(f.log.length, 1);
    f.feed(210);
    assert.equal(f.log.length, 1);
    f.home.destroyCode = 0;
    for (let time = 215; time <= 230; time += 5) f.feed(time);
    assert.deepEqual(f.log.at(-1), { action: 'destroy', type: 'extension', x: old.pos.x, y: old.pos.y });
    f.home.structures = f.home.structures.filter(o => o !== old);
    assert.equal(f.feed(235).home.lastConfirmed.observedAt, 235);
    assert.equal(f.log.length, 2);
  }

  {
    const f = setup();
    const a = f.target(0, { my: true, level: 2 });
    const b = f.target(1, { my: true, level: 2 });
    const obsolete = f.asset('container', 11, 29, a);
    const charged = f.asset('container', 11, 30, a, false, 30);
    a.sites.push(obsolete);
    a.structures.push(charged);
    const foreign = f.asset('spawn', 15, 31, b, false);
    foreign.owner = { username: 'former-owner' };
    b.structures.push(foreign);
    const task = f.Memory.expansion.tasks['E22S36:E22S38'] = { targetRoom: b.name, state: 'BLOCKED',
      failureReason: 'SITE_ATTEMPTS_EXHAUSTED', siteResult: { code: -14 }, siteAttempts: 5 };
    assert.equal(f.tick(100).rooms[a.name].reason, 'RETIRE_CONTAINER_SITE');
    assert.equal(task.state, 'BLOCKED');
    assert.equal(f.log.filter(o => o.action === 'destroy').length, 1);
    a.sites = [];
    b.structures = [];
    f.tick(105);
    assert.equal(task.state, 'BLOCKED');
    f.tick(125);
    assert.equal(task.state, 'SPAWN_PLANNING');
    assert.equal(task.siteAttempts, 0);
    assert.equal(f.Memory.expansion.stage04.rooms[a.name].reason, 'DRAIN_CONTAINER_FIRST');
    charged.store.energy = 0;
    assert.equal(f.tick(130).rooms[a.name].reason, 'RETIRE_EMPTY_CONTAINER');
    assert.equal(f.log.filter(o => o.action === 'destroy' && o.type === 'container').length, 1);
  }

  {
    const f = setup();
    const layout = f.load('stage04.layout');
    const data = layout.snapshot(f.home);
    assert(layout.connected(data));
    assert(!layout.connected(data, [plan.stations[0]], layout.component(data)));
    const state = {};
    const network = f.load('stage04.links');
    network.run(f.home, state);
    assert.equal(state.lastLinkIntent, undefined);
    const links = plan.links.map((p, i) => f.asset('link', ...p, f.home, true, i === 2 ? 350 : 300));
    const amounts = [];
    for (const source of links.slice(0, 2)) source.transferEnergy = (target, amount) => {
      assert.equal(target, links[2]);
      amounts.push(amount);
      return 0;
    };
    f.home.structures.push(...links);
    f.Game.time++;
    network.run(f.home, state);
    assert.deepEqual(amounts, [300]);
    f.Game.time++;
    links[0].cooldown = 1;
    network.run(f.home, state);
    assert.deepEqual(amounts, [300, 300]);
  }

  {
    const f = setup(true);
    const state = f.tick(100);
    assert.equal(state.home.reason, 'HOME_LAYOUT_CONFIRMATION_WAIT');
    assert.equal(f.log.length, 0);
  }
  return 6;
};
