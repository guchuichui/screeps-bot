
var creepProduce = {

    /** creep make
     * 提示：消耗同等能量下，位置越靠后越先生产
     * 
     * **/
    run: function() {



        // var energyCarry = _.filter(Game.creeps, (creep) => creep.memory.role == 'energyCarry');
        // if(energyCarry.length < 1) {
        //     var newName = 'energyCarry' + Game.time;
        //     Game.spawns['SpawnBot'].spawnCreep([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE], newName, 
        //         {memory: {role: 'energyCarry'}});
            
        // }
        var energyHarvester = _.filter(Game.creeps, (creep) => creep.memory.role == 'energyHarvester');
        if(energyHarvester.length < 1) {
            var newName = 'energyHarvester' + Game.time;
            Game.spawns['SpawnBot'].spawnCreep([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY], newName, 
                {memory: {role: 'energyHarvester'}});
            
        }
        
        
        var builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');
        if(builders.length < 2) {
            var newName = 'Builder' + Game.time;
            Game.spawns['SpawnTop'].spawnCreep([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, 
                {memory: {role: 'builder'}});
        }

        // var builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder1');
        // if(builders.length < 2) {
        //     var newName = 'Builder' + Game.time;
        //     Game.spawns['Spawn2-2'].spawnCreep([WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, 
        //         {memory: {role: 'builder1'}});
        // }

        var mineral =  Game.getObjectById('5bbcb10740062e4259e92a3a');
        var minings = _.filter(Game.creeps, (creep) => creep.memory.role == 'mining');
        if(minings.length < 1 && mineral.mineralAmount > 0) {
            var newName = 'minings' + Game.time;
            Game.spawns['SpawnSupport'].spawnCreep([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, 
                {memory: {role: 'mining'}});
        }

        var miningCarrys = _.filter(Game.creeps, (creep) => creep.memory.role == 'miningCarry');
        if(miningCarrys.length < 1) {           
            var newName = 'miningCarrys' + Game.time;
            Game.spawns['SpawnTop'].spawnCreep([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], newName, 
                {memory: {role: 'miningCarry'}});
        }

        // var repair = _.filter(Game.creeps, (creep) => creep.memory.role == 'repair');
        // if(repair.length < 1) {
        //     var newName = 'repair' + Game.time;
        //     Game.spawns['SpawnTop'].spawnCreep([WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, 
        //         {memory: {role: 'repair'}});
            
        // }

        // var attack = _.filter(Game.creeps, (creep) => creep.memory.role == 'attack');
        // if(attack.length < 1){
        //     var newName = 'attack' + Game.time;
        //     Game.spawns['SpawnSupport'].spawnCreep([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,
        //         CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,
        //         MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, 
        //         {memory: {role: 'attack'}});
        // }


	},
    firstRoomCreep: function(){
        
        var firstRoomCarry = _.filter(Game.creeps, (creep) => creep.memory.role == 'firstRoomCarry');
        if(firstRoomCarry.length < 1) {
            var newName = 'firstRoomCarry' + Game.time;
            Game.spawns['SpawnTop'].spawnCreep([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, 
                {memory: {role: 'firstRoomCarry'}});
            
        }

        var firstRoomHarvester = _.filter(Game.creeps, (creep) => creep.memory.role == 'firstRoomHarvester');
        if(firstRoomHarvester.length < 1) {
            var newName = 'firstRoomHarvester' + Game.time;
            Game.spawns['SpawnTop'].spawnCreep([WORK,WORK,WORK,ATTACK,CARRY,MOVE], newName, 
                {memory: {role: 'firstRoomHarvester'}});
        }


    },
    secondRoomCreep : function() {

        var harvesters = _.filter(Game.creeps, (creep) => creep.memory.role == 'secondRoomHarvester');
        if(harvesters.length < 1){
            var newName = 'secondRoomHarvester' + Game.time;
            Game.spawns['Spawn2'].spawnCreep([WORK,WORK,WORK,WORK,WORK,WORK,MOVE], newName, 
                {memory: {role: 'secondRoomHarvester'}});
        }
        var secondRoomHarvesterBot = _.filter(Game.creeps, (creep) => creep.memory.role == 'secondRoomHarvesterBot');
        if(secondRoomHarvesterBot.length < 1){
            var newName = 'secondRoomHarvesterBot' + Game.time;
            Game.spawns['Spawn2'].spawnCreep([WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,MOVE,MOVE], newName, 
                {memory: {role: 'secondRoomHarvesterBot'}});
        }


        var secondRoomCarry = _.filter(Game.creeps, (creep) => creep.memory.role == 'secondRoomCarry');
        if(secondRoomCarry.length < 1){
            var newName = 'secondRoomCarry' + Game.time;
            Game.spawns['Spawn2'].spawnCreep([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, 
                {memory: {role: 'secondRoomCarry',carry: false}});
        }


        // var secondRoomBuilder = _.filter(Game.creeps, (creep) => creep.memory.role == 'secondRoomBuilder');
        // if(secondRoomBuilder.length < 2) {
        //     var newName = 'secondRoomBuilder' + Game.time;
        //     Game.spawns['Spawn2'].spawnCreep([WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, 
        //         {memory: {role: 'secondRoomBuilder'}});
        // }

        var secondRoomUpgrader = _.filter(Game.creeps, (creep) => creep.memory.role == 'secondRoomUpgrader');
        if(secondRoomUpgrader.length < 2){
            var newName = 'secondRoomUpgrader' + Game.time;
            Game.spawns['Spawn2'].spawnCreep([WORK,WORK,WORK,WORK,WORK,WORK,CARRY,MOVE,CARRY,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,MOVE,CARRY,MOVE,MOVE,MOVE], newName, 
                {memory: {role: 'secondRoomUpgrader'}});
        }



    },
    thirdRoomCreep: function(){

        var thirdRoomUpgrader = _.filter(Game.creeps, (creep) => creep.memory.role == 'thirdRoomUpgrader');
        if(thirdRoomUpgrader.length < 1) {
            var newName = 'thirdRoomUpgrader' + Game.time;
            Game.spawns['SpawnW55N13-R'].spawnCreep([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, 
                {memory: {role: 'thirdRoomUpgrader'},directions: [BOTTOM]});
        }
        // console.log()
        // var closestHostile = Game.spawns['SpawnW55N13-L'].pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        // //console.log(closestHostile)
        // if(closestHostile){
        //     var thirdRoomUpgrader = _.filter(Game.creeps, (creep) => creep.memory.role == 'thirdRoomUpgrader');
        //     if(thirdRoomUpgrader.length < 5) {
        //         var newName = 'thirdRoomUpgrader' + Game.time;
        //         Game.spawns['SpawnW55N13-R'].spawnCreep([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, 
        //             {memory: {role: 'thirdRoomUpgrader'},directions: [RIGHT]});
        //     }
        // }


        // var thirdRoomUpgraderA = _.filter(Game.creeps, (creep) => creep.memory.role == 'thirdRoomUpgraderA');
        // if(thirdRoomUpgraderA.length < 2) {
        //     var newName = 'thirdRoomUpgraderA' + Game.time;
        //     Game.spawns['SpawnW55N13-L'].spawnCreep([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, 
        //         {memory: {role: 'thirdRoomUpgraderA'},directions: [LEFT]});
        // }

    },
    W54N9Creep: function(){

        // var W54N9Harvester = _.filter(Game.creeps, (creep) => creep.memory.role == 'W54N9Harvester');
        // if(W54N9Harvester.length < 1) {
        //     var newName = 'W54N9Harvester' + Game.time;
        //     Game.spawns['W54N9-A'].spawnCreep([CLAIM,MOVE], newName, 
        //         {memory: {role: 'W54N9Harvester'}});
        // }
        
        
        // var W54N9Upgrader = _.filter(Game.creeps, (creep) => creep.memory.role == 'W54N9Upgrader');
        // if(W54N9Upgrader.length < 10) {
        //     var newName = 'W54N9Upgrader' + Game.time;
        //     Game.spawns['W54N9-A'].spawnCreep([WORK,CARRY,MOVE,WORK,CARRY,MOVE], newName, 
        //         {memory: {role: 'W54N9Upgrader'}});
        // }
    },
    cliam: function(){

        console.log('claim')
    },


    W51N9Creep: function(){
        // var W51N9Harvester = _.filter(Game.creeps, (creep) => creep.memory.role == 'W51N9Harvester');
        // if(W51N9Harvester.length < 2) {
        //     var newName = 'W51N9Harvester' + Game.time;
        //     Game.spawns['W51N9-A'].spawnCreep([WORK,CARRY,MOVE], newName, 
        //         {memory: {role: 'W51N9Harvester'}});
        // }
        
        
        // var W51N9Upgrader = _.filter(Game.creeps, (creep) => creep.memory.role == 'W51N9Upgrader');
        // if(W51N9Upgrader.length < 8) {
        //     var newName = 'W51N9Upgrader' + Game.time;
        //     Game.spawns['W51N9-A'].spawnCreep([WORK,WORK,CARRY,CARRY,MOVE,MOVE], newName, 
        //         {memory: {role: 'W51N9Upgrader'}});
        // }


        // var W54N8allAround = _.filter(Game.creeps, (creep) => creep.memory.role == 'W54N8allAround');
        // if(W54N8allAround.length < 6) {
        //     var newName = 'W54N8allAround' + Game.time;
        //     console.log('Spawning new W54N8allAround: ' + newName);
        //     Game.spawns['SpawnW54N8A'].spawnCreep([WORK,WORK,CARRY,CARRY,MOVE,MOVE], newName, 
        //         {memory: {role: 'W54N8allAround'}});
            
        // }
    },

    transferCreep:function(){


        //A区转移creep
        var transferA_TOP_LEFT = _.filter(Game.creeps, (creep) => creep.memory.role == 'transferA_TOP_LEFT');
        if(transferA_TOP_LEFT.length < 1) {
            var newName = 'transferA_TOP_LEFT' + Game.time;
            Game.spawns['SpawnTop'].spawnCreep([CARRY,CARRY], newName, 
                {memory: {role: 'transferA_TOP_LEFT'},directions: [LEFT] });            
        }

        var transferA_TOP_RIGHT = _.filter(Game.creeps, (creep) => creep.memory.role == 'transferA_TOP_RIGHT');
        if(transferA_TOP_RIGHT.length < 1) {
            var newName = 'transferA_TOP_RIGHT' + Game.time;
            Game.spawns['SpawnTop'].spawnCreep([CARRY,CARRY], newName, 
                {memory: {role: 'transferA_TOP_RIGHT'},directions: [RIGHT] });            
        }

        var transferA_BOTTOM_LEFT = _.filter(Game.creeps, (creep) => creep.memory.role == 'transferA_BOTTOM_LEFT');
        if(transferA_BOTTOM_LEFT.length < 1) {
            var newName = 'transferA_BOTTOM_LEFT' + Game.time;
            Game.spawns['SpawnBot'].spawnCreep([CARRY,CARRY], newName, 
                {memory: {role: 'transferA_BOTTOM_LEFT'},directions: [LEFT] });            
        }

        var transferA_BOTTOM_RIGHT = _.filter(Game.creeps, (creep) => creep.memory.role == 'transferA_BOTTOM_RIGHT');
        if(transferA_BOTTOM_RIGHT.length < 1) {
            var newName = 'transferA_BOTTOM_RIGHT' + Game.time;
            Game.spawns['SpawnBot'].spawnCreep([CARRY,CARRY], newName, 
                {memory: {role: 'transferA_BOTTOM_RIGHT'},directions: [RIGHT] });            
        }
        //B区转移creep
        // var transferB_TOP_LEFT = _.filter(Game.creeps, (creep) => creep.memory.role == 'transferB_TOP_LEFT');
        // if(transferB_TOP_LEFT.length < 1) {
        //     var newName = 'transferB_TOP_LEFT' + Game.time;
        //     Game.spawns['SpawnTop'].spawnCreep([CARRY,CARRY,MOVE], newName, 
        //         {memory: {role: 'transferB_TOP_LEFT'},directions: [TOP] });            
        // }

        // var transferB_TOP_RIGHT = _.filter(Game.creeps, (creep) => creep.memory.role == 'transferB_TOP_RIGHT');
        // if(transferB_TOP_RIGHT.length < 1) {
        //     var newName = 'transferB_TOP_RIGHT' + Game.time;
        //     Game.spawns['SpawnTop'].spawnCreep([CARRY,CARRY,MOVE], newName, 
        //         {memory: {role: 'transferB_TOP_RIGHT'},directions: [TOP] });            
        // }

        // var transferB_BOTTOM_LEFT = _.filter(Game.creeps, (creep) => creep.memory.role == 'transferB_BOTTOM_LEFT');
        // if(transferB_BOTTOM_LEFT.length < 1) {
        //     var newName = 'transferB_BOTTOM_LEFT' + Game.time;
        //     Game.spawns['SpawnBot'].spawnCreep([CARRY,CARRY,MOVE], newName, 
        //         {memory: {role: 'transferB_BOTTOM_LEFT'},directions: [BOTTOM] });            
        // }

        // var transferB_BOTTOM_RIGHT = _.filter(Game.creeps, (creep) => creep.memory.role == 'transferB_BOTTOM_RIGHT');
        // if(transferB_BOTTOM_RIGHT.length < 1) {
        //     var newName = 'transferB_BOTTOM_RIGHT' + Game.time;
        //     Game.spawns['SpawnBot'].spawnCreep([CARRY,CARRY,MOVE], newName, 
        //         {memory: {role: 'transferB_BOTTOM_RIGHT'},directions: [BOTTOM] });            
        // }

        //C区转移creep
        // var transferC_TOP_LEFT = _.filter(Game.creeps, (creep) => creep.memory.role == 'transferC_TOP_LEFT');
        // if(transferC_TOP_LEFT.length < 1) {
        //     var newName = 'transferC_TOP_LEFT' + Game.time;
        //     Game.spawns['SpawnTop'].spawnCreep([CARRY,CARRY,MOVE], newName, 
        //         {memory: {role: 'transferC_TOP_LEFT'},directions: [TOP] });            
        // }

        // var transferC_TOP_RIGHT = _.filter(Game.creeps, (creep) => creep.memory.role == 'transferC_TOP_RIGHT');
        // if(transferC_TOP_RIGHT.length < 1) {
        //     var newName = 'transferC_TOP_RIGHT' + Game.time;
        //     Game.spawns['SpawnTop'].spawnCreep([CARRY,CARRY,MOVE], newName, 
        //         {memory: {role: 'transferC_TOP_RIGHT'},directions: [TOP] });            
        // }

        // var transferC_BOTTOM_LEFT = _.filter(Game.creeps, (creep) => creep.memory.role == 'transferC_BOTTOM_LEFT');
        // if(transferC_BOTTOM_LEFT.length < 1) {
        //     var newName = 'transferC_BOTTOM_LEFT' + Game.time;
        //     Game.spawns['SpawnBot'].spawnCreep([CARRY,CARRY,MOVE], newName, 
        //         {memory: {role: 'transferC_BOTTOM_LEFT'},directions: [BOTTOM] });            
        // }

        // var transferC_BOTTOM_RIGHT = _.filter(Game.creeps, (creep) => creep.memory.role == 'transferC_BOTTOM_RIGHT');
        // if(transferC_BOTTOM_RIGHT.length < 1) {
        //     var newName = 'transferC_BOTTOM_RIGHT' + Game.time;
        //     Game.spawns['SpawnBot'].spawnCreep([CARRY,CARRY,MOVE], newName, 
        //         {memory: {role: 'transferC_BOTTOM_RIGHT'},directions: [BOTTOM] });            
        // }

        //D区
        // var transferD_TOP_LEFT = _.filter(Game.creeps, (creep) => creep.memory.role == 'transferD_TOP_LEFT');
        // if(transferD_TOP_LEFT.length < 1) {
        //     var newName = 'transferD_TOP_LEFT' + Game.time;
        //     Game.spawns['SpawnTop'].spawnCreep([CARRY,CARRY,MOVE], newName, 
        //         {memory: {role: 'transferD_TOP_LEFT'},directions: [TOP] });            
        // }

        // var transferD_TOP_RIGHT = _.filter(Game.creeps, (creep) => creep.memory.role == 'transferD_TOP_RIGHT');
        // if(transferD_TOP_RIGHT.length < 1) {
        //     var newName = 'transferD_TOP_RIGHT' + Game.time;
        //     Game.spawns['SpawnTop'].spawnCreep([CARRY,CARRY,MOVE], newName, 
        //         {memory: {role: 'transferD_TOP_RIGHT'},directions: [TOP] });            
        // }

        // var transferD_BOTTOM_RIGHT = _.filter(Game.creeps, (creep) => creep.memory.role == 'transferD_BOTTOM_RIGHT');
        // if(transferD_BOTTOM_RIGHT.length < 1) {
        //     var newName = 'transferD_BOTTOM_RIGHT' + Game.time;
        //     Game.spawns['SpawnBot'].spawnCreep([CARRY,CARRY,MOVE], newName, 
        //         {memory: {role: 'transferD_BOTTOM_RIGHT'},directions: [BOTTOM] });            
        // }


    },

    creepUtil: function(){

        for(var name in Memory.creeps) {
            if(!Game.creeps[name]) {  
                    delete Memory.creeps[name];
                    console.log('Clearing non-existing creep memory:', name);

            }
        }

        // if(Game.spawns['SpawnTop'].spawning) { 
        //     //var a = Game.spawns['SpawnTop'].spawning.setDirections([LEFT]);
        //     //console.log(a);
        //     var spawningCreep = Game.creeps[Game.spawns['SpawnTop'].spawning.name];
        //     Game.spawns['SpawnTop'].room.visual.text(
        //         '🛠️' + spawningCreep.memory.role,
        //         Game.spawns['SpawnTop'].pos.x + 1, 
        //         Game.spawns['SpawnTop'].pos.y, 
        //         {align: 'left', opacity: 0.8});
        // }

        // if(Game.spawns['SpawnBot'].spawning) { 
        //     //var a = Game.spawns['SpawnBot'].spawning.setDirections([LEFT]);
        //     //console.log(a);
        //     var spawningCreep = Game.creeps[Game.spawns['SpawnBot'].spawning.name];
        //     Game.spawns['SpawnBot'].room.visual.text(
        //         '🛠️' + spawningCreep.memory.role,
        //         Game.spawns['SpawnBot'].pos.x + 1, 
        //         Game.spawns['SpawnBot'].pos.y, 
        //         {align: 'left', opacity: 0.8});
        // }

        // if(Game.spawns['Spawn2'].spawning) { 
        //     var a = Game.spawns['Spawn2'].spawning.setDirections([BOTTOM]);
        //     //console.log(a);
        //     var spawningCreep = Game.creeps[Game.spawns['Spawn2'].spawning.name];
        //     Game.spawns['Spawn2'].room.visual.text(
        //         '🛠️' + spawningCreep.memory.role,
        //         Game.spawns['Spawn2'].pos.x + 1, 
        //         Game.spawns['Spawn2'].pos.y, 
        //         {align: 'left', opacity: 0.8});
        // }
    }





    
    
};

module.exports = creepProduce;