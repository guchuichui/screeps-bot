var W58N12 = {

    harvester: function (creep){
        creep.stateChange();

        if(creep.memory.state){
            const storage = Game.getObjectById('62e6e7cbcc1631245f7a0b01');
            if(creep.transfer(storage,RESOURCE_ENERGY)== ERR_NOT_IN_RANGE){
                creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffaa00'}});
            }  
            // if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
            //         creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            // }
        }else{
            var sources = creep.room.find(FIND_SOURCES);
                if(creep.harvest(sources[1]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});               
                }
                if(sources[1].energy == 0){
                    if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});               
                    }
                }
        }


            
    },
    resourceCarry: function(creep) {


    },
    energyCarry: function(creep){
        const terminal = Game.getObjectById('62f1937058d9be36fc173f90')
        const storage = Game.getObjectById('62e6e7cbcc1631245f7a0b01')
        var targets = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType == STRUCTURE_LAB) && 
                        structure.store.getFreeCapacity(RESOURCE_CATALYZED_LEMERGIUM_ACID) > 800;
            }
        });
        creep.stateChange();
        if(creep.memory.state){
            
            const link = Game.getObjectById('633287250eda730faf5ae081')
            if(terminal.store.getFreeCapacity() > 50000){
                if(creep.transfer(terminal,RESOURCE_ENERGY)== ERR_NOT_IN_RANGE){
                    creep.moveTo(terminal, {visualizePathStyle: {stroke: '#ffaa00'}});
                } 
            }


            if(targets.length>10){
                if(creep.store.energy > 0){
                    if(creep.transfer(terminal,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                        creep.moveTo(terminal, {visualizePathStyle: {stroke: '#ffaa00'}});  
                    }
                }else
                if(creep.transfer(targets[0],RESOURCE_CATALYZED_LEMERGIUM_ACID) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffaa00'}});  
                }
            }else
            if(creep.transfer(link,RESOURCE_ENERGY)== ERR_NOT_IN_RANGE){
                creep.moveTo(link, {visualizePathStyle: {stroke: '#ffaa00'}});
            } 

        }else{
            
            if(targets.length>10){
                if(creep.withdraw(terminal,RESOURCE_CATALYZED_LEMERGIUM_ACID) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(terminal, {visualizePathStyle: {stroke: '#ffaa00'}});  
                }
            }else
            if(creep.withdraw(storage,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }
        }

    },
    A: function (creep){

        var linkA =  Game.getObjectById('6300714617f6372a986ec083');

        if(creep.store.getFreeCapacity() > 0) {
            const tombstones = creep.pos.findInRange(FIND_TOMBSTONES,1)    
            if(tombstones.length > 0){
                var a = creep.withdraw(tombstones[0],RESOURCE_ENERGY)
                //console.log(a)
            }else{
                  creep.withdraw(linkA, RESOURCE_ENERGY); 
            }
                      
        }else{
            var targets = creep.pos.findInRange(FIND_STRUCTURES,1,{
                filter: (structure) => {
                    return ( structure.structureType == STRUCTURE_SPAWN ||
                            structure.structureType == STRUCTURE_EXTENSION ||
                            structure.structureType == STRUCTURE_TOWER
                            ) && 
                            structure.store.getFreeCapacity(RESOURCE_ENERGY) > structure.store.getCapacity(RESOURCE_ENERGY)*0.1 ;
                }
            });
    
            if(targets.length > 0) {
                creep.transfer(targets[0],RESOURCE_ENERGY);
            }
        }       
    },

};
module.exports = W58N12;