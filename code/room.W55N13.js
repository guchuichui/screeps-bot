var W55N13 = {


    attack:function(creep){
        // var pos = new RoomPosition(29, 15,'W54N12')
        // creep.moveTo(pos)
        // creep.claimController(room.controller)
        // target = Game.getObjectById('')
        // if(creep.attack(target) == ERR_NOT_IN_RANGE) {
        //     creep.moveTo(target);
        // }

        creep.stateChange();
        if(creep.memory.state){
        //var pos = new RoomPosition(31, 7,'W53N12')
        //creep.moveTo(pos)
         creep.claimController(creep.room.controller)
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
            }
            else if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }                                       
        }else{

            
            creep.harvestEnergy('5bbcaa279099fc012e630f23')
            // const sources = Game.getObjectById('6377bfcb8f90a455c65ff094');
            // if(creep.pickup(sources, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE){
            //     creep.moveTo(sources);
            // }
        }





    },
    defend:function(creep){


        const ob =  Game.getObjectById('6352bcddc3ee41644f62005f');
        ob.observeRoom('W54N13')
        var hscreep = Game.rooms['W54N13'].find(FIND_HOSTILE_CREEPS)
        console.log(hscreep[0])
        if(hscreep){
            console.log(creep.attack(hscreep[0]))
             if(creep.attack(hscreep[0]) == ERR_NOT_IN_RANGE) {
                 creep.moveTo(hscreep[0]);
             }
        }
    },


    resourceTransfer:function(creep) {
        creep.stateChange();
        if(creep.memory.state){
            const Terminal = Game.getObjectById('63852c770dd31c61426bea9b')
            //const Terminal = Game.getObjectById('6350cd6ad46b3082ee441215')
            //const Terminal = Game.getObjectById('63522a9cb0485de7883e5040')
            if(creep.transfer(Terminal,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                creep.moveTo(Terminal, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }

            // const Terminal = Game.getObjectById('6350a232c4d4043a107b4a90')
            // if(creep.transfer(Terminal,RESOURCE_CATALYZED_LEMERGIUM_ACID) ==ERR_NOT_IN_RANGE){
            //     creep.moveTo(Terminal, {visualizePathStyle: {stroke: '#ffaa00'}});  
            // }

            //creep.fillLab();
        }else{
            //const Terminal = Game.getObjectById('63522a9cb0485de7883e5040')
            const Storage = Game.getObjectById('63852f5b3d2699013b813de6')
            if(creep.withdraw(Storage,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                creep.moveTo(Storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }
            // const Storage = Game.getObjectById('6377a7e03a51eaa6adcfe6e0')
            // if(creep.pickup(Storage,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
            //     creep.moveTo(Storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
            // }
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
        const Terminal = Game.getObjectById('63852c770dd31c61426bea9b')
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
      /** @param {Creep} creep **/
    harvester: function(creep) {

        creep.stateChange();

        if(creep.name == 'W55N13THarvester0'){

            if(creep.memory.state){

                const TowerA = Game.getObjectById('635c9feab58e722add3d8894')
                const TowerB = Game.getObjectById('635ca36973e10a1f6f80ab4b')
                const LinkA = Game.getObjectById('635ca23e7a86a47212c29e8f')
                var position = new RoomPosition(26,16,'W55N13')
                if(creep.pos != position){
                    creep.moveTo(position)
                }

                creep.upgradeController(creep.room.controller)

                if(TowerA.store.getFreeCapacity(RESOURCE_ENERGY) >= 100){ 
                    if(creep.transfer(TowerA,RESOURCE_ENERGY)) {
                        creep.moveTo(sources0, {visualizePathStyle: {stroke: '#ffaa00'}});               
                    }
                }
                else if(TowerB.store.getFreeCapacity(RESOURCE_ENERGY) >= 100){ 
                    creep.transfer(TowerB,RESOURCE_ENERGY) }
                else{ 
                    creep.transfer(LinkA,RESOURCE_ENERGY) }
                
               
                //creep.buildStructure()
            
            
            
            }else{
                // const sources0 = Game.getObjectById('5bbcaa099099fc012e630af7')
                // if(creep.harvest(sources0) == ERR_NOT_IN_RANGE) {
                //     creep.moveTo(sources0, {visualizePathStyle: {stroke: '#ffaa00'}});               
                // }
                creep.harvestEnergy('5bbcaa099099fc012e630af7')
            }
            

        }
        if(creep.name == 'W55N13THarvester1'){

            if(creep.memory.state){
                const linkB = Game.getObjectById('6352af0e80f0ef8e7303da8a')
                const SpawnTop = Game.getObjectById('635c1620496d4fd39e3f81a1')
                if(SpawnTop.store.getFreeCapacity(RESOURCE_ENERGY) >= 100){ 
                    creep.transfer(SpawnTop,RESOURCE_ENERGY) }
                else{
                    creep.transfer(linkB,RESOURCE_ENERGY) }
                
                //creep.buildStructure()
            }else{
                // const sources1 = Game.getObjectById('5bbcaa099099fc012e630af8')
                // if(creep.harvest(sources1) == ERR_NOT_IN_RANGE) {
                //     creep.moveTo(sources1, {visualizePathStyle: {stroke: '#ffaa00'}});               
                // }
                creep.harvestEnergy('5bbcaa099099fc012e630af8')
            }

        }
      


	},
    
};


module.exports = W55N13;