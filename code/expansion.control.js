const config = require('expansion.config');
exports.flag = function (key) {
  const memory = Memory.expansion;
  return memory && typeof memory[key] === 'boolean' ? memory[key] : config[key];
};
exports.stopped = function () { return !exports.flag('enabled') || exports.flag('emergencyStop'); };
exports.hasCpu = function () {
  return Game.cpu.bucket >= config.minCpuBucket &&
    Game.cpu.getUsed() < Math.min(Game.cpu.limit, Game.cpu.tickLimit) * config.maxCpuFraction;
};
exports.transition = function (task, state, reason) {
  if (task.state !== state) {
    console.log(`[expansion ${task.targetRoom}] ${task.state} -> ${state}: ${reason}`);
    task.previousState = task.state;
    task.state = state;
    task.stateChangedAt = Game.time;
    if (!task.stateHistory) task.stateHistory = [];
    task.stateHistory.push({ tick: Game.time, state, reason });
    if (task.stateHistory.length > 16) task.stateHistory.shift();
  }
};
