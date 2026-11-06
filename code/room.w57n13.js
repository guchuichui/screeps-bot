var W57N13 = {

    /** @param {Creep} creep **/
    resourceTransfer:function(creep) {
        creep.stateChange();
        if(creep.memory.state){
            const Terminal = Game.getObjectById('6386711b64ce221fb9d79091')
            const Storage = Game.getObjectById('6386bcb2d63e3f3aefe75662')
            if(creep.transfer(Terminal,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                creep.moveTo(Terminal, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }else
            if(creep.transfer(Storage,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                creep.moveTo(Storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }
        }else{
            const Link = Game.getObjectById('638738af6a3846a2c93a2a6f')
            if(creep.withdraw(Link,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                creep.moveTo(Link, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }
        }
    },


    // 
        /** @param {Creep} creep **/
    energyTransfer: function(creep) {
        if(creep.ticksToLive > 1495){
            creep.pickupTombstones()
        }
        
        creep.stateChange();
        if(creep.memory.state){
            creep.energyTransfer()
        }else{
            const linkC = Game.getObjectById('63846b3bce2d171a6ad99b8d')
            if(creep.withdraw(linkC,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                creep.moveTo(linkC, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }
        }
    },

    /** @param {Creep} creep **/
    energyCarry: function(creep) {
        creep.stateChange();
        const Terminal = Game.getObjectById('6386bcb2d63e3f3aefe75662')
        var targets = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType == STRUCTURE_LAB) && 
                        structure.store.getFreeCapacity(RESOURCE_CATALYZED_LEMERGIUM_ACID) > 800;
            }
        });
        if(creep.memory.state){


            if(targets.length>10){
                if(creep.store.energy > 0){
                    if(creep.transfer(Terminal,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                        creep.moveTo(Terminal, {visualizePathStyle: {stroke: '#ffaa00'}});  
                    }
                }else
                if(creep.transfer(targets[0],RESOURCE_CATALYZED_LEMERGIUM_ACID) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffaa00'}});  
                }
            }else{
                creep.fillAllStructures()
            }
            creep.fillExtensionEngry()
            
        }else{
            if(targets.length>10){
                if(creep.withdraw(Terminal,RESOURCE_CATALYZED_LEMERGIUM_ACID) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(Terminal, {visualizePathStyle: {stroke: '#ffaa00'}});  
                }
            }else
            if(creep.withdraw(Terminal,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                creep.moveTo(Terminal, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }
        }

        // if(creep.memory.state){
        //     const Terminal = Game.getObjectById('6351acc5f1b4e36a6e8b3efe')
        //     if(creep.transfer(Terminal,RESOURCE_GHODIUM) ==ERR_NOT_IN_RANGE){
        //         creep.moveTo(Terminal, {visualizePathStyle: {stroke: '#ffaa00'}});  
        //     }
        // }else{
        //     const Storage = Game.getObjectById('63149398f169257d3c3d6a47')
        //     if(creep.withdraw(Storage,RESOURCE_GHODIUM) ==ERR_NOT_IN_RANGE){
        //         creep.moveTo(Storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
        //     }
        // }


	},
 
    
};


module.exports = W57N13;