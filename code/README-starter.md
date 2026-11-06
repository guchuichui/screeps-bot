# Screeps colony controller

The controller dynamically strengthens WORK/CARRY/MOVE workers up to the energy currently available, up to the 50-part game limit. It keeps a multi-purpose workforce (scaled with controller level and active construction sites). Existing harvester, builder and upgrader creeps are automatically migrated to the unified worker role.

The planner follows the official RCL building limits. It constructs the five Extensions allowed at RCL2 before road work, prioritizes the first Tower and next Extensions at RCL3, then continues the higher-level building queue. Workers harvest until their personal energy stores are full, then stay in work mode until empty: refill Spawns/Extensions when room energy is below capacity, assign one worker at a time to refill Towers below 80%, build, repair roads and other damaged structures, then upgrade the Controller. Workers choose reachable targets by path; an unreachable Tower target releases its refill lock so other work can continue.

Towers attack hostiles first and otherwise repair damaged structures or reinforce Ramparts. Safe Mode activates when an available charge detects a hostile threat. Defenders spawn when needed. Layout placement adapts to terrain and room occupancy, but does not claim neighboring rooms or calculate a sealed perimeter.
