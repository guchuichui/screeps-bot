// Starter controller for the Screeps World account.
// It discovers owned spawns and rooms at runtime; no room names are hard-coded.
const colony = require('starter.colony');

module.exports.loop = function () {
  colony.run();
};
