// Starter controller for the Screeps World account.
// It discovers owned spawns and rooms at runtime; no room names are hard-coded.
const colony = require('starter.colony');

module.exports.loop = function () {
  try { colony.run(); }
  catch (error) {
    if (!Memory.expansion) Memory.expansion = { tasks: {} };
    Memory.expansion.lastError = { tick: Game.time, scope: 'main', reason: String(error.stack || error) };
    throw error;
  } finally {
    try { require('expansion.observe').run(); }
    catch (error) { if (Game.time % 25 === 0) console.log(`Observation error: ${error.stack || error}`); }
  }
};
