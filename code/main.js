// Starter controller for the Screeps World account.
// It discovers owned spawns and rooms at runtime; no room names are hard-coded.
const colony = require('starter.colony');

module.exports.loop = function () {
  const startedAt = Game.cpu.getUsed();
  try { colony.run(); }
  catch (error) {
    if (!Memory.expansion) Memory.expansion = { tasks: {} };
    Memory.expansion.lastError = { tick: Game.time, scope: 'main', reason: String(error.stack || error) };
    throw error;
  } finally {
    try { require('stage04.autonomy').run(); }
    catch (error) {
      (Memory.expansion ||= { tasks: {} }).stage04Error = { tick: Game.time, reason: String(error.stack || error) };
    }
    try {
      const metrics = require('telemetry.metrics');
      metrics.timing('colonyLoop', Game.cpu.getUsed() - startedAt);
      const telemetryAt = Game.cpu.getUsed();
      metrics.tick();
      require('expansion.observe').run();
      metrics.timing('telemetry', Game.cpu.getUsed() - telemetryAt);
    }
    catch (error) { if (Game.time % 25 === 0) console.log(`Observation error: ${error.stack || error}`); }
  }
};
