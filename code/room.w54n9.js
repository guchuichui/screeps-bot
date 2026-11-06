var W54N9 = {

    /** @param {Creep} creep **/
    harvester: function(creep) {



        var pos = new RoomPosition(11,27,'W54N8')
        creep.moveTo(pos)
        var room = Game.rooms['W54N8']
        //console.log(room)
        
        //console.log( creep.attackController(room.controller))

        if(room){
            if(creep.attackController(room.controller) == ERR_NOT_IN_RANGE){
                creep.moveTo(room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }




        // Game.market.deal('6347898ad90872e4da20a3a4', 1870, "W58N12");
	    // if(creep.store.getFreeCapacity() > 0) {
        //     var sources = creep.room.find(FIND_SOURCES);
        //     if(creep.harvest(sources[1]) == ERR_NOT_IN_RANGE) {
        //         creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});
        //     }

        // }
        // else {
        //     var targets = creep.room.find(FIND_STRUCTURES, {
        //             filter: (structure) => {
        //                 return (structure.structureType == STRUCTURE_EXTENSION ||
        //                         structure.structureType == STRUCTURE_SPAWN ||
        //                         structure.structureType == STRUCTURE_TOWER) && 
        //                         structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
        //             }
        //     });
        //     if(targets.length > 0) {
        //         if(creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        //             creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
        //         }
        //     }
        // }

	},
     /** @param {Creep} creep **/
     run: function(creep) {




        // var terminal = Game.getObjectById('62f1937058d9be36fc173f90')
        // if(terminal.cooldown<1){
        //     // var orders = Game.market.getAllOrders(order => order.resourceType == RESOURCE_ENERGY &&
        //     //     order.type == ORDER_BUY && order.price >= 12);

        //     var orders = Game.market.getAllOrders(order => order.resourceType == RESOURCE_ZYNTHIUM &&
        //         order.type == ORDER_BUY && order.price >= 30);

        //         // Game.market.deal(order.id, order.amount, "W58N12");
        //         for (const order of orders) {
        //             var a = Game.market.deal(order.id, order.amount, "W58N12")
        //             console.log(a)
        //             //Game.market.deal(order.id, order.amount, "W57N13")
        //         }

        // }

        // var orders = Game.market.getAllOrders(order => order.resourceType == RESOURCE_LEMERGIUM &&
        //     order.type == ORDER_BUY && order.price >= 25);

        //     // Game.market.deal(order.id, order.amount, "W58N12");
        //     for (const order of orders) {
        //         var a = Game.market.deal(order.id, order.amount, "W55N13")
        //         console.log(a)
        //         //Game.market.deal(order.id, order.amount, "W57N13")
        //     }

        // for (const spawn in Game.spawns) {
        //     Game.spawns[spawn].memory.spawnList = new Array()
        // }


        if(creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.upgrading = false;
            creep.say('🔄 harvest');
	    }
	    if(!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) {
	        creep.memory.upgrading = true;
	        creep.say('⚡ upgrade');
	    }


	    if(creep.memory.upgrading) {

            var pos = new RoomPosition(16, 22,'W54N8')
            //creep.moveTo(pos)

            var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (
                            structure.structureType == STRUCTURE_EXTENSION ||
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
            }
            else if(sites.length) {
                if(creep.build(sites[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(sites[0], {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
            else if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
        else {
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
            const Storage = Game.getObjectById('635c5b6d533df46873c151c5')
            if(creep.withdraw(Storage,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                creep.moveTo(Storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }
        }
	},
    /** @param {Creep} creep **/
    harvester: function(creep) {

        creep.stateChange();

        if(creep.name == 'W54N9THarvester0'){

            if(creep.memory.state){
                const LinkA = Game.getObjectById('635c0c83cee5ab2173256047')
                 creep.transfer(LinkA,RESOURCE_ENERGY)                                       
            }else{
                creep.harvestEnergy('5bbcaa1c9099fc012e630d32')
            }
            

        }
        if(creep.name == 'W54N9THarvester1'){
            if(creep.memory.state){
                const linkB = Game.getObjectById('635c140bfb9c96997305d1db')
                if(creep.transfer(linkB,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(linkB);  
                }
                                                      
            }else{
                creep.harvestEnergy('5bbcaa1c9099fc012e630d33')
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
            const Terminal = Game.getObjectById('635c5b6d533df46873c151c5')
            if(creep.withdraw(Terminal,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                creep.moveTo(Terminal, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }
        }
    },
    energyTransfer: function(creep){
        creep.stateChange();
        //console.log(creep.memory.state)
        if(creep.memory.state){
            const Storage = Game.getObjectById('635c5b6d533df46873c151c5')
            if(creep.transfer(Storage,RESOURCE_ENERGY)){
                creep.moveTo(Storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
            }
        }else{
            const linkB = Game.getObjectById('635c68bbc0516c863a8deceb')
            if(linkB.store.getUsedCapacity(RESOURCE_ENERGY) > 0){
                if(creep.withdraw(linkB,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(linkB, {visualizePathStyle: {stroke: '#ffaa00'}});  
                }
            }
        }
        
    }
};

module.exports = W54N9;