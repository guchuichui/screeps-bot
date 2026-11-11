const config = require('expansion.config');
const pos = o => o && o.pos ? { x: o.pos.x, y: o.pos.y } : null;
const distance = (a, b) => a && b ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) : null;
function energy(o) { return o && o.store && typeof o.store[RESOURCE_ENERGY] === 'number' ? o.store[RESOURCE_ENERGY] : null; }
function capacity(o) { return o && o.store && typeof o.store.getCapacity === 'function' ? o.store.getCapacity(RESOURCE_ENERGY) : null; }
function hash(text) { let n = 2166136261; for (let i = 0; i < text.length; i++) { n ^= text.charCodeAt(i); n = Math.imul(n, 16777619); } return (n >>> 0).toString(16); }
function slots(room, source, structures) {
  let count = 0;
  const natural = room.find(FIND_SOURCES).concat(room.find(FIND_MINERALS), room.controller || []).filter(o => o && o.pos);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const x = source.pos.x + dx, y = source.pos.y + dy;
    if ((!dx && !dy) || x < 1 || x > 48 || y < 1 || y > 48 || (room.getTerrain().get(x, y) & TERRAIN_MASK_WALL)) continue;
    if (natural.some(o => o.pos.x === x && o.pos.y === y)) continue;
    if (structures.some(s => s.pos && s.pos.x === x && s.pos.y === y && !['road', 'container'].includes(s.structureType) && !(s.structureType === 'rampart' && (s.my || s.isPublic)))) continue;
    count++;
  }
  return count;
}
exports.snapshot = function () {
  const dynamic = { available: true, schema: 2, tick: Game.time, rooms: {}, counters: Memory.expansion && Memory.expansion.telemetryCounters || null,
    errorCountKind: 'Unique persisted error records, not every exception throw',
    eventMetricSemantics: { harvest: 'EVENT_HARVEST amounts for Source targets, all actors; owned amounts separate',
      energyMovement: 'Gross EVENT_TRANSFER amounts including transfer/withdraw/Link; not net delivery',
      upgrade: 'Event control points and energySpent when provided', link: 'Event-reported sent amount; no inferred post-loss receipt' },
    unavailable: { unobservedTicks: 'Cannot reconstruct event logs skipped by CPU, lost visibility or missing ticks',
      netDeliveryBySnapshots: 'Hourly snapshots cannot establish exact per-tick net delivery' } };
  const updates = {};
  const cache = Memory.expansion && Memory.expansion.telemetryStatic || {};
  for (const name of [config.homeRoom, ...config.targetRooms]) {
    const room = Game.rooms[name];
    if (!room) { dynamic.rooms[name] = { visible: false, unavailable: 'NO_VISION' }; continue; }
    const structures = room.find(FIND_STRUCTURES), sources = room.find(FIND_SOURCES), sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const creeps = Object.values(Game.creeps).filter(c => c.room && c.room.name === name);
    const controller = room.controller;
    const storage = structures.find(s => s.structureType === 'storage');
    const units = creeps.map(c => ({ name: c.name, role: c.memory.role, ttl: c.ticksToLive, spawning: Boolean(c.spawning), ...pos(c),
      room: name, work: c.getActiveBodyparts(WORK), carry: c.getActiveBodyparts(CARRY), move: c.getActiveBodyparts(MOVE),
      energy: energy(c), energyCapacity: capacity(c), fatigue: c.fatigue === undefined ? null : c.fatigue,
      working: c.memory.working === undefined ? null : c.memory.working,
      assignment: { sourceId: c.memory.sourceId || null, sourceSlot: c.memory.sourceSlot || null,
        targetRoom: c.memory.targetRoom || null, colony: c.memory.colony || null, task: c.memory.expansionTask || null },
      lastAction: c.memory.lastAction || null,
      movementObservations: Memory.expansion && Memory.expansion.telemetryCounters && Memory.expansion.telemetryCounters.creepState && Memory.expansion.telemetryCounters.creepState[c.name] || null,
      logisticsStatus: c.memory.lastAction && ['NO_PATH', 'NO_PROGRESS', 'REPATH_EXHAUSTED'].includes(c.memory.lastAction.code) ? 'recorded_blockage' : 'unavailable_without_action_counter' }));
    const limits = {};
    for (const type of ['spawn','extension','storage','container','terminal','tower','link','road']) {
      limits[type] = controller && typeof CONTROLLER_STRUCTURES !== 'undefined' && CONTROLLER_STRUCTURES[type] ? CONTROLLER_STRUCTURES[type][controller.level] : null;
    }
    const count = type => structures.filter(s => s.structureType === type).length;
    const stock = type => structures.filter(s => s.structureType === type).reduce((sum, s) => sum + (energy(s) || 0), 0);
    const row = { visible: true, energyAvailable: room.energyAvailable, energyCapacityAvailable: room.energyCapacityAvailable,
      energy: Object.fromEntries(['spawn','extension','storage','container','terminal'].map(t => [t, stock(t)])),
      structureCounts: Object.fromEntries(['spawn','extension','storage','container','terminal','tower','link','road'].map(t => [t, count(t)])),
      controller: controller ? { id: controller.id, ...pos(controller), my: controller.my, level: controller.level,
        progress: controller.progress === undefined ? null : controller.progress, progressTotal: controller.progressTotal === undefined ? null : controller.progressTotal,
        ticksToDowngrade: controller.ticksToDowngrade === undefined ? null : controller.ticksToDowngrade } : null,
      structures: structures.map(s => ({ id: s.id, type: s.structureType, ...pos(s), my: Boolean(s.my), energy: energy(s), capacity: capacity(s), hits: s.hits, hitsMax: s.hitsMax })),
      sites: sites.map(s => ({ id: s.id, type: s.structureType, ...pos(s), progress: s.progress, total: s.progressTotal })), units, rclLimits: limits,
      sources: sources.map(s => ({ id: s.id, ...pos(s), tick: Game.time, energy: s.energy, capacity: s.energyCapacity === undefined ? null : s.energyCapacity,
        ticksToRegeneration: s.ticksToRegeneration === undefined ? null : s.ticksToRegeneration,
        regenerationPeriod: typeof ENERGY_REGEN_TIME === 'undefined' ? null : ENERGY_REGEN_TIME,
        baseHarvestPower: typeof HARVEST_POWER === 'undefined' ? null : HARVEST_POWER,
        walkableAdjacentSlots: slots(room, s, structures),
        assignedByMemory: units.filter(c => c.assignment.sourceId === s.id),
        adjacentCandidates: units.filter(c => !c.spawning && c.work && distance(c, pos(s)) <= 1),
        recentConfirmedHarvesters: Object.values(dynamic.counters && dynamic.counters.harvestActors || {}).filter(h => h.sourceId === s.id && Game.time - h.tick <= 25),
        assignmentCaveat: 'Adjacent WORK is potential capacity, not proof of a harvest action' })),
      links: structures.filter(s => s.structureType === 'link').map(s => ({ id: s.id, ...pos(s), my: Boolean(s.my),
        active: typeof s.isActive === 'function' ? s.isActive() : null,
        energy: energy(s), capacity: capacity(s), cooldown: s.cooldown === undefined ? null : s.cooldown,
        nearSources: sources.filter(source => distance(pos(s), pos(source)) <= 2).map(source => source.id),
        nearController: distance(pos(s), pos(controller)) !== null && distance(pos(s), pos(controller)) <= 3,
        nearStorage: distance(pos(s), pos(storage)) !== null && distance(pos(s), pos(storage)) <= 2,
        transferStatus: { available: typeof EVENT_TRANSFER !== 'undefined' && Boolean(dynamic.counters && dynamic.counters.rooms[name] && dynamic.counters.rooms[name].eventLogStatus === 'covered'),
          observed: dynamic.counters && dynamic.counters.links[s.id] || null,
          reason: 'Only covered EVENT_TRANSFER sender amounts; no inferred received energy or game writes' } })) };
    row.roleCounts = { harvester: units.filter(c => /harvest/i.test(c.role || '')).length,
      hauler: units.filter(c => /haul|carry|transport/i.test(c.role || '')).length, worker: units.filter(c => c.role === 'worker').length };
    const colony = Memory.colonies && Memory.colonies[name];
    if (colony && colony.targets && colony.counts) row.productionDemand = { needed: Object.keys(colony.targets).some(r => colony.counts[r] < colony.targets[r]), source: 'colony persisted counts/targets', tick: colony.lastRunAt };
    else if (name === config.homeRoom && controller) {
      const useful = creeps.filter(c => c.memory.home === name && c.memory.role === 'worker' && c.getActiveBodyparts(WORK) && c.getActiveBodyparts(CARRY) && c.getActiveBodyparts(MOVE));
      const target = Math.min(10, 6 + (sites.length >= 3 ? 2 : 0) + Math.max(0, controller.level - 3));
      row.productionDemand = { needed: useful.length < target, workerCount: useful.length, workerTarget: target, source: 'current native worker policy', tick: Game.time };
    } else row.productionDemand = { available: false };
    const geometry = { room: name, sources: sources.map(s => ({ id: s.id, ...pos(s) })), controller: pos(controller),
      minerals: room.find(FIND_MINERALS).map(mineral => ({ id: mineral.id, ...pos(mineral) })),
      structures: row.structures.map(s => ({ id: s.id, type: s.type, x: s.x, y: s.y })), sites: row.sites.map(s => ({ id: s.id, type: s.type, x: s.x, y: s.y })) };
    for (const key of ['sources', 'structures', 'sites', 'minerals']) geometry[key].sort((a, b) => String(a.id).localeCompare(String(b.id)) || a.x - b.x || a.y - b.y);
    const signature = hash(JSON.stringify(geometry)); row.layoutKey = signature;
    if (!cache[name] || cache[name].layoutKey !== signature) {
      // Static work has a CPU guard. Missing data stays explicit and retries later.
      if (Game.cpu.getUsed() < Game.cpu.limit * 0.7) {
        let terrain = cache[name] && cache[name].terrain;
        if (!terrain) { terrain = ''; for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) terrain += room.getTerrain().get(x,y); }
        const anchors = structures.filter(s => ['spawn','storage','link'].includes(s.structureType)).concat(sources, controller || []).filter(s => s && s.pos);
        const distances = [];
        for (let a = 0; a < Math.min(anchors.length, 16); a++) for (let b = a + 1; b < Math.min(anchors.length, 16); b++) distances.push({ a: anchors[a].id, b: anchors[b].id, chebyshevLowerBound: distance(pos(anchors[a]), pos(anchors[b])) });
        const spawn = structures.find(s => s.structureType === 'spawn' && s.my);
        const routes = [];
        if (spawn && typeof room.findPath === 'function') for (const target of sources.concat(controller || [])) {
          if (Game.cpu.getUsed() >= Game.cpu.limit * 0.7) break;
          const range = target === controller ? 3 : 1;
          const path = room.findPath(spawn.pos, target.pos, { range, ignoreCreeps: true, maxRooms: 1, maxOps: 2000 });
          routes.push({ fromId: spawn.id, targetId: target.id, length: path.length || (distance(pos(spawn),pos(target)) <= range ? 0 : null),
            status: path.length ? 'static_path' : 'no_path_within_search_budget', chebyshevLowerBound: distance(pos(spawn),pos(target)) });
        }
        updates[name] = { ...geometry, layoutKey: signature, terrain, encoding: 'y*50+x;0=plain,1=wall,2=swamp', distances, routes,
          distanceCoverage: { anchors: Math.min(anchors.length, 16), totalAnchors: anchors.length, kind: 'chebyshev_lower_bound' },
          routeCoverage: { expected: sources.length + (controller ? 1 : 0), measured: routes.length,
            status: !spawn ? 'unavailable_no_spawn' : typeof room.findPath !== 'function' ? 'unavailable_path_api' : routes.length < sources.length + (controller ? 1 : 0) ? 'partial_cpu_budget' : 'covered' } };
      } else row.staticStatus = 'unavailable_cpu_budget';
    }
    dynamic.rooms[name] = row;
  }
  return { dynamic, updates };
};
