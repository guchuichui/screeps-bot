var W54N8 = {

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

	    if(creep.memory.upgrading) {

            var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_EXTENSION ||
                            structure.structureType == STRUCTURE_SPAWN ||
                            structure.structureType == STRUCTURE_TOWER) && 
                            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });
            var sites = creep.room.find(FIND_CONSTRUCTION_SITES);

            if(targets.length > 0) {
                if(creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }else if(sites.length) {
                if(creep.build(sites[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(sites[0], {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }else if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
        else {
            // var sources = creep.room.find(FIND_SOURCES);
            //     if(creep.harvest(sources[1]) == ERR_NOT_IN_RANGE) {
            //         creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});               
            //     }
            //     if(sources[1].energy == 0){
            //         if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
            //             creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});               
            //         }
            //     }
            const Storage = Game.getObjectById('63939f089ab55f1c8351d116')
            if(creep.withdraw(Storage,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                creep.moveTo(Storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }


        }
	}
    ,
     /** @param {Creep} creep **/
     upgrader: function(creep) {
        if(creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.upgrading = false;
            creep.say('🔄 harvest');
	    }
	    if(!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) {
	        creep.memory.upgrading = true;
	        creep.say('⚡ upgrade');
	    }

	    if(creep.memory.upgrading) {
            // var targets = creep.room.find(FIND_STRUCTURES, {
            //     filter: (structure) => {
            //         return (
            //                 structure.structureType == STRUCTURE_EXTENSION ||
            //                 structure.structureType == STRUCTURE_SPAWN ||
            //                 structure.structureType == STRUCTURE_TOWER) && 
            //                 structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            //     }
            // });

            // if(targets.length > 0) {
            //     if(creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
            //         creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
            //     }
            // }
            if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
        else {
            const Terminal = Game.getObjectById('63939f089ab55f1c8351d116')
            if(creep.withdraw(Terminal,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                creep.moveTo(Terminal, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }
        }
	},
    /** @param {Creep} creep **/
    harvester: function(creep) {

        creep.stateChange();

        if(creep.name == 'W54N8THarvester0'){

            if(creep.memory.state){
                const LinkA = Game.getObjectById('63946f1505a1704b37dff39d')
                 creep.transfer(LinkA,RESOURCE_ENERGY)                                       
            }else{
                creep.harvestEnergy('5bbcaa1c9099fc012e630d35')
            }
            

        }
        if(creep.name == 'W54N8THarvester1'){
            if(creep.memory.state){
                const linkB = Game.getObjectById('639478909361365bb498efbf')
                 if(creep.transfer(linkB,RESOURCE_ENERGY) ==  ERR_NOT_IN_RANGE){
                    creep.moveTo(linkB)
                 }                                      
            }else{
                creep.harvestEnergy('5bbcaa1c9099fc012e630d36')
            }

        }
    },
    /** @param {Creep} creep **/
    energyCarry: function(creep) {
        creep.stateChange();
        if(creep.memory.state){
            // creep.fillSpawn()
            // if(creep.fillSpawn()){
            //     //creep.fillExtensionEngry()
            //     if(creep.fillExtensionEngry()){
            //         creep.fillTower()
            //     }               
            // }
            creep.fillAllStructures()

            
        }else{
            const Storage = Game.getObjectById('63939f089ab55f1c8351d116')
            if(creep.withdraw(Storage,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                creep.moveTo(Storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }
        }
    },
    energyTransfer: function(creep){
        creep.stateChange();
        //console.log(creep.memory.state)
        if(creep.memory.state){
            const Storage = Game.getObjectById('63939f089ab55f1c8351d116')
            if(creep.transfer(Storage,RESOURCE_ENERGY)){
                creep.moveTo(Storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }
        }else{
            const linkB = Game.getObjectById('63947f96602ae52725f188cb')
            if(linkB.store.getUsedCapacity(RESOURCE_ENERGY) > 0){
                if(creep.withdraw(linkB,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(linkB, {visualizePathStyle: {stroke: '#ffaa00'}});  
                }
            }
        }
        
    }
};


module.exports = W54N8;