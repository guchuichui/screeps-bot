// Switching the game to this code branch enables claim-only expansion.
// Runtime kill switch: Memory.expansion.emergencyStop = true
module.exports = {
  enabled: true,
  emergencyStop: false,
  homeRoom: 'E22S36',
  targetRooms: ['E22S37', 'E22S38'],
  mode: 'emergency',
  autoClaim: true,
  autoBuildSpawn: false,
  maxConcurrentClaimers: 1,
  maxAttempts: 2,
  retryCooldown: 200,
  spawnRetryCooldown: 25,
  maxSpawnErrors: 3,
  minHomeEnergyReserve: 300,
  minHomeWorkerTtl: 150,
  minCpuBucket: 1000,
  maxCpuFraction: 0.75,
  routeCacheTicks: 100,
  noProgressTimeout: 75,
  missionTimeout: 650,
  lifetimeMargin: 50,
  maxRouteRooms: 5,
  avoidRooms: []
};
