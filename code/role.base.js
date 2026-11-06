var roleBase = {

    /** @param {Creep} creep **/
    run: function(creep) {

        const roomName = creep.name.substring(0,creep.name.indexOf('-')-1);
        creep.stateChange()
        //console.log('creep房间名'+ roomName)
        const sources = Game.rooms[roomName].find(FIND_SOURCES)

        //判断有无能量采集
        if(sources[1]){
            if(sources[0].energy == 0 && sources[1].energy == 0){
                creep.memory.source = false
            }else{
                creep.memory.source = true
            }
            //console.log(1)
        }else{
            if(sources[0].energy == 0){
                creep.memory.source = false
            }else{
                creep.memory.source = true
            }
        }


        const buildTargets = creep.room.find(FIND_CONSTRUCTION_SITES);
        if(buildTargets.length){
            creep.memory.build = true
        }else{
            creep.memory.build = false
        }
        


        if(Game.rooms[roomName].controller.ticksToDowngrade < 100000){
            creep.room.memory.upgrade = true
        }
        if(Game.rooms[roomName].controller.ticksToDowngrade > 190000){
            creep.room.memory.upgrade = false
        }
        


            const minerals = creep.room.find(FIND_MINERALS);
            if(minerals[0].mineralAmount > 0){
                creep.memory.mineral = true
            }else{
                creep.memory.mineral = false
            }
        

 
            const walls = Game.rooms[roomName].find(FIND_STRUCTURES, {
					filter: (structure) => {
						return (
								//structure.structureType == STRUCTURE_WALL ||
								structure.structureType == STRUCTURE_RAMPART
								) &&
								structure.hits < structure.hitsMax*0.8 && structure.hits < creep.memory.number                               
					}    
			});
            if(walls.length){
                creep.memory.repair = true
            }else{
                creep.memory.repair = false
            }
        



        if(creep.memory.source){
            if(creep.store.getUsedCapacity(minerals[0].mineralType) > 0){
                if(creep.transfer(Game.rooms[roomName].storage,minerals[0].mineralType) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(Game.rooms[roomName].storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
                }
            }
			else if(creep.memory.state) {
                var targets = creep.pos.findInRange(FIND_STRUCTURES,1,{
                    filter: (structure) => {
                        return ( structure.structureType == STRUCTURE_LINK && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 )
                    }
                });
                if(targets.length > 0) {
                    creep.transfer(targets[0],RESOURCE_ENERGY);
                }else if(creep.transfer(Game.rooms[roomName].storage,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(Game.rooms[roomName].storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
                }
            }
            else{
                if(creep.harvest(sources[1]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});               
                }else if(sources[1].energy == 0 || !sources[1]){
                    if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});               
                    }
                }
            }
        }

        else if(creep.memory.build){
            if(creep.memory.state) {
                if(creep.build(buildTargets[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(buildTargets[0], {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }else{
                if(creep.withdraw(Game.rooms[roomName].storage,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(Game.rooms[roomName].storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
                }
            }
        }

        else if(creep.room.memory.upgrade){
            if(creep.memory.state) {
                if(creep.upgradeController(Game.rooms[roomName].controller) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(Game.rooms[roomName].controller, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }else{
                if(creep.withdraw(Game.rooms[roomName].storage,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(Game.rooms[roomName].storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
                }
            }
        }

        else if(creep.memory.mineral){
            if(creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0){
                if(creep.transfer(Game.rooms[roomName].storage,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(Game.rooms[roomName].storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
                }
            }else if(creep.memory.state) {

                var targets = creep.room.find(FIND_STRUCTURES,{
                    filter: (structure) => {
                        return ( structure.structureType == STRUCTURE_FACTORY )
                    }
                });
                if(creep.transfer(targets[0],minerals[0].mineralType) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffaa00'}});  
                }
            }
            else{
                if(creep.harvest(minerals[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(minerals[0], {visualizePathStyle: {stroke: '#ffaa00'}});
                }
            }

        }
        else if(creep.memory.repair){
            if(creep.store.getUsedCapacity(minerals[0].mineralType) > 0){
                if(creep.transfer(Game.rooms[roomName].storage,minerals[0].mineralType) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(Game.rooms[roomName].storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
                }
            }else if(creep.memory.state) {
                if(creep.repair(walls[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(walls[0], {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }else{
                if(creep.withdraw(Game.rooms[roomName].storage,RESOURCE_ENERGY) ==ERR_NOT_IN_RANGE){
                    creep.moveTo(Game.rooms[roomName].storage, {visualizePathStyle: {stroke: '#ffaa00'}});  
                }
            }
        }
		
	    

	},
  
};

module.exports = roleBase;