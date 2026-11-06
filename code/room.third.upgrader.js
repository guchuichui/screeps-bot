var thirdRoomUpgrader = {

    /** @param {Creep} creep **/
    run: function(creep) {
        if(creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.upgrading = false;
            creep.say('🔄 harvest');
	    }
	    if(!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) {
	        creep.memory.upgrading = true;
	        creep.say('⚡ upgrade');
	    }
        if(creep.body[0].boost == null){
            creep.memory.boost = false;
        }else{
            creep.memory.boost = true;
        }

        // if(!creep.memory.boost){
        //       creep.moveTo(17,35)
        // }else

	    //if(creep.memory.upgrading && creep.memory.boost) {
        if(creep.memory.upgrading) {
            //console.log(creep.body[0].boost == null)
            // var targets = creep.room.find(FIND_STRUCTURES, {
            //     filter: (structure) => {
            //         return (structure.structureType == STRUCTURE_EXTENSION ||
            //                 structure.structureType == STRUCTURE_SPAWN ||
            //                 structure.structureType == STRUCTURE_TOWER) && 
            //                 structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            //     }
            // });

            // let eventLog = creep.room.getEventLog();
            // let attackEvents = _.filter(eventLog, {event: EVENT_ATTACK});
            // attackEvents.forEach(event => {
            //     let target = Game.getObjectById(event.data.targetId);
            //     if(target && target.my) {
            //         console.log(target);
            //     }
            // });

            var walls = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (
                            structure.structureType == STRUCTURE_WALL ||
                            structure.structureType == STRUCTURE_RAMPART
                            ) &&
                            structure.hits < structure.hitsMax*0.8 && structure.hits < 400000                              
                }    
            });
            //console.log('length'+walls.length)
            
            var sites = creep.room.find(FIND_CONSTRUCTION_SITES);
            if(sites.length) {
                if(creep.build(sites[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(sites[0], {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }else if(walls.length){
                //console.log('length'+walls.length)
                //console.log(creep.repair(walls[0]))
                if(creep.repair(walls[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(walls[0], {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }else{
                //console.log('wsm')
                var wall = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return (
                                //structure.structureType == STRUCTURE_WALL ||
                                structure.structureType == STRUCTURE_RAMPART
                                ) &&
                                structure.hits < structure.hitsMax*0.8 && structure.hits < 4000000                               
                    }    
                });
                if(wall.length){
                    if(creep.repair(wall[0]) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(wall[0], {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                }else{
                    creep.moveTo(15,30)
                }

            }
            // else if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
            //     creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            // }
            
            // var terminal = Game.getObjectById('63522a9cb0485de7883e5040')
            // if(creep.transfer(terminal, RESOURCE_LEMERGIUM) == ERR_NOT_IN_RANGE) {
            //     creep.moveTo(terminal);
            //  }
        }
        else {
            // var sources = creep.room.find(FIND_SOURCES);
            // if(creep.memory.role == 'thirdRoomUpgraderA'){
            //     if(creep.harvest(sources[1]) == ERR_NOT_IN_RANGE) {
            //         creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});               
            //     }
            // }else{
            //     if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
            //         creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});               
            //     }
            // }
            var sources = creep.room.find(FIND_SOURCES);
            if(creep.harvest(sources[1]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});               
            }
            if(sources[1].energy == 0 || !sources[1]){
                if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});               
                }
            }
            if(sources[1].energy == 0 && sources[0].energy == 0){
                const container_top = Game.getObjectById('63852c770dd31c61426bea9b');

                //console.log(container_top)
                if(container_top.store.getFreeCapacity() > 150000){
                    //Game.rooms['W57N13'].terminal.send(RESOURCE_ENERGY, 20000, 'W55N13');
                   
                    // Game.rooms['W54N9'].terminal.send(RESOURCE_ENERGY, 10000, 'W55N13');
                    // Game.rooms['W54N8'].terminal.send(RESOURCE_ENERGY, 10000, 'W55N13');
                    // Game.rooms['W51N9'].terminal.send(RESOURCE_ENERGY, 10000, 'W55N13');
                }
                if(creep.withdraw(container_top, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE){
                    creep.moveTo(container_top);
                }

            }
           


            // const sources = Game.getObjectById('63784a8e8d866b46abcca86c');
            // if(creep.pickup(sources, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE){
            //     creep.moveTo(sources);
            // }

            // var mineral = Game.getObjectById('5bbcb11e40062e4259e92b4a')
            // if(mineral.mineralAmount > 0){
            //     if(creep.harvest(mineral) == ERR_NOT_IN_RANGE) {
            //         creep.moveTo(mineral, {visualizePathStyle: {stroke: '#ffaa00'}});
            //     }
            // }
        }
	}
};


module.exports = thirdRoomUpgrader;