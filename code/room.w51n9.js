var W51N9 = {

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
            const Terminal = Game.getObjectById('635c3f64dea2b7a2d19470dc')
            if(creep.withdraw(Terminal,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                creep.moveTo(Terminal, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }


        }
	},
    /** @param {Creep} creep **/
    harvester: function(creep) {

        creep.stateChange();

        if(creep.name == 'W51N9THarvester0'){

            if(creep.memory.state){
                const LinkA = Game.getObjectById('635bfd95fed71f27c0b962d0')
                 creep.transfer(LinkA,RESOURCE_ENERGY)                                       
            }else{
                creep.harvestEnergy('5bbcaa4e9099fc012e63123b')
            }
            

        }
        if(creep.name == 'W51N9THarvester1'){
            if(creep.memory.state){
                const linkB = Game.getObjectById('635bf71793fe9f0dbe300bc4')
                 creep.transfer(linkB,RESOURCE_ENERGY)                                        
            }else{
                creep.harvestEnergy('5bbcaa4e9099fc012e63123c')
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
            const Storage = Game.getObjectById('635c3f64dea2b7a2d19470dc')
            if(creep.withdraw(Storage,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                creep.moveTo(Storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }
        }
    },
    energyTransfer: function(creep){
        creep.stateChange();
        //console.log(creep.memory.state)
        if(creep.memory.state){
            const Storage = Game.getObjectById('635c3f64dea2b7a2d19470dc')
            if(creep.transfer(Storage,RESOURCE_ENERGY)){
                creep.moveTo(Storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }
        }else{
            const linkB = Game.getObjectById('635c4ac037e8d987467a0778')
            if(linkB.store.getUsedCapacity(RESOURCE_ENERGY) > 0){
                if(creep.withdraw(linkB,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(linkB, {visualizePathStyle: {stroke: '#ffaa00'}});  
                }
            }
        }
        
    }

};


module.exports = W51N9;