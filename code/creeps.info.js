const creepsInfo = [



    //房间W58N12
    {
        role: 'W58N12B-EnergyCarry',
        bodys: [CARRY,CARRY,CARRY,MOVE,MOVE,MOVE],
        //bodys: [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE],
        number: 1,
        directions:[BOTTOM]
    },
    {
        role: 'W58N12T-BaseAllAround',
        bodys: [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE],
        number: 1000000,
        directions:[TOP]
    },

    //房间W54N9
    {
        role: 'W54N9Upgrader',
        bodys: [WORK,CARRY,MOVE,WORK,CARRY,MOVE],
        number: 1,
        directions:[BOTTOM]
    },
    {
        role: 'W54N9TUpgrader',
        bodys: [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,MOVE,CARRY,MOVE],
        number: 1,
        directions:[BOTTOM]
    },

    {
        role: 'W54N9THarvester',
        bodys: [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE],
        number: 1,
        directions:[RIGHT]
    },
    {
        role: 'W54N9TEnergyCarry',
        bodys: [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE],
        number: 1,
        directions:[BOTTOM]
    },
    {
        role: 'W54N9TEnergyTransfer',
        bodys: [CARRY,CARRY,CARRY,CARRY,MOVE],
        number: 1,
        directions:[RIGHT]
    },
    //房间W54N8
    {
        role: 'W54N8L-AllAround',
        bodys: [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE],
        number: 1,
        directions:[BOTTOM]
    },
    {
        role: 'W54N8TUpgrader',
        bodys: [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,,WORK,WORK,CARRY,MOVE,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE],
        number: 1,
        directions:[BOTTOM]
    },

    {
        role: 'W54N8THarvester',
        bodys: [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE],
        number: 1,
        directions:[BOTTOM]
    },
    {
        role: 'W54N8TEnergyCarry',
        //bodys: [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE],
        bodys: [CARRY,CARRY,CARRY,MOVE,MOVE,MOVE],
        number: 1,
        directions:[BOTTOM]
    },
    {
        role: 'W54N8TEnergyTransfer',
        bodys: [CARRY,CARRY,CARRY,CARRY,MOVE],
        number: 1,
        directions:[BOTTOM]
    },
    //房间W51N9
    {
        role: 'W51N9Upgrader',
        bodys: [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,MOVE,CARRY,MOVE],
        number: 1,
        directions:[BOTTOM]
    },

    {
        role: 'W51N9THarvester',
        bodys: [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE],
        number: 1,
        directions:[TOP]
    },
    {
        role: 'W51N9TEnergyCarry',
        bodys: [CARRY,CARRY,CARRY,MOVE,MOVE,MOVE],
        number: 1,
        directions:[BOTTOM]
    },
    {
        role: 'W51N9TEnergyTransfer',
        bodys: [CARRY,CARRY,CARRY,CARRY,MOVE],
        number: 1,
        directions:[RIGHT]
    },
    //房间W57N13

    {
        role: 'W57N13LEnergyCarry',
        bodys: [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE],
        //bodys: [CARRY,CARRY,CARRY,MOVE,MOVE,MOVE],
        number: 1,
        directions:[BOTTOM]
    },
    {
        role: 'W57N13R-BaseAllAround',
        bodys: [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE],
        number: 2000000,
        directions:[BOTTOM_RIGHT]
    },
    {
        role: 'W57N13L-ResourcesTransfer',
        bodys: [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE],
        number: 1,
        directions:[BOTTOM]
    },
    
    //房间W55N13

    {
        role: 'W55N13R-BaseAllAround',
        bodys: [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE],
        number: 4000000,
        directions:[BOTTOM]
    },

    {
        role: 'W55N13THarvester',
        bodys: [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE],
        number: 1,
        directions:[TOP]
    },
    {
        role: 'W55N13LEnergyCarry',
        bodys: [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE],
        //bodys: [CARRY,CARRY,CARRY,MOVE,MOVE,MOVE],
        number: 1,
        directions:[BOTTOM]
    },
    {
        role: 'W55N13LEnergyTransfer',
        bodys: [CARRY,CARRY],
        number: 1,
        directions:[RIGHT]
    },
    {
        role: 'W55N13LResourcesTransfer',
        bodys: [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE],
        number: 1,
        directions:[BOTTOM]
    },
    {
        role: 'W55N13LResourceTransfer',
        bodys: [CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE],
        number: 1,
        directions:[LEFT]
    },
    {
        role: 'W55N13LATTACK',
        bodys: [CARRY,CARRY,CARRY,CARRY,CARRY,WORK,WORK,WORK,WORK,WORK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE],
        number: 1,
        directions:[LEFT]
    },
    {
        role: 'W55N13LDefend',
        bodys: [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,],
        number: 1,
        directions:[LEFT]
    },

    //房间W57N13
    {
        role: 'W57N13TResourceTransfer',
        bodys: [CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE],
        number: 1,
        directions:[LEFT]
    },


    // 更多角色 ...
]

module.exports = creepsInfo;