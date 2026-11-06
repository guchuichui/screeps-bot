var roleBuilder = {

    /** @param {Creep} creep **/
    run: function(creep) {

	    if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.building = false;
            creep.say('🔄 harvest');
	    }
	    if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
	        creep.memory.building = true;
	        creep.say('🚧 build');
	    }
		if(creep.body[0].boost == null){
            //creep.memory.boost = false;
			creep.memory.boost = true;
        }else{
            creep.memory.boost = true;
        }

        //const transferStation = Game.rooms['W53N12']
		const transferStation = Game.rooms['W57N13']
        if(creep.room == transferStation){
            creep.memory.transfer =true;
        }

		// const finnally = Game.rooms['W54N8']
		// if(creep.room == finnally){
        //     creep.memory.finnally =true;
        // }
        //console.log(creep.memory.transfer)

		if(!creep.memory.boost){
			var pos =  new RoomPosition(20, 44,'W58N12')
            creep.moveTo(pos, {visualizePathStyle: {stroke: '#ffffff'}})
		}else
		if(!creep.memory.transfer){
            //var pos =  new RoomPosition(3, 24,'W53N12')
			var pos =  new RoomPosition(3, 24,'W57N13')
            creep.moveTo(pos, {visualizePathStyle: {stroke: '#ffffff'}})
        }
		// else if(!creep.memory.finnally){
		// 	var pos = new RoomPosition(15, 21,'W54N8')
		// 		creep.moveTo(pos, {visualizePathStyle: {stroke: '#ffffff'}})
		// }
		//else if(creep.memory.transfer && creep.memory.finnally){
		else if(creep.memory.transfer){
			if(creep.memory.building) {
				var walls = Game.rooms['W57N13'].find(FIND_STRUCTURES, {
				//var walls = creep.room.find(FIND_STRUCTURES, {
					filter: (structure) => {
						return (
								structure.structureType == STRUCTURE_WALL ||
								structure.structureType == STRUCTURE_RAMPART
								) &&
								structure.hits < structure.hitsMax*0.8 && structure.hits < 600000                               
					}    
				});



					var targets = creep.room.find(FIND_CONSTRUCTION_SITES);
					//console.log(creep.build(targets[0]))
					if(targets.length) {
						if(creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
							creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
						}
					}else
					 if(walls.length){
						//console.log('length'+walls.length)
						//console.log(creep.repair(walls[0]))
						if(creep.repair(walls[0]) == ERR_NOT_IN_RANGE) {
							creep.moveTo(walls[0], {visualizePathStyle: {stroke: '#ffffff'}});
						}
					}else{
						//console.log('wsm')
						var walls = Game.rooms['W57N13'].find(FIND_STRUCTURES, {
							filter: (structure) => {
								return (
										//structure.structureType == STRUCTURE_WALL ||
										structure.structureType == STRUCTURE_RAMPART
										) &&
										structure.hits < structure.hitsMax*0.8 && structure.hits < 1000000                               
							}    
						});
						if(walls.length){
							if(creep.repair(walls[0]) == ERR_NOT_IN_RANGE) {
								creep.moveTo(walls[0], {visualizePathStyle: {stroke: '#ffffff'}});
							}
						}else{
							if(creep.upgradeController(Game.rooms['W57N13'].controller) == ERR_NOT_IN_RANGE){
							creep.moveTo(Game.rooms['W57N13'].controller)
							}
						}
		
					}
					
					
					
					// else {
					// 	if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE){
					// 		creep.moveTo(creep.room.controller)
					// 	}
					// }

					// var pos = new RoomPosition(15, 21,'W54N8')
					// creep.moveTo(pos)

					// var wall = creep.room.find(FIND_STRUCTURES, {
					//     filter: (structure) => {
					//         return (
					//                 //structure.structureType == STRUCTURE_WALL ||
					//                 structure.structureType == STRUCTURE_RAMPART
					//                 ) &&
					//                 structure.hits < structure.hitsMax*0.8 && structure.hits < 1000000                               
					//     }    
					// });
					// if(wall){
					//     if(creep.repair(wall[0]) == ERR_NOT_IN_RANGE) {
					//         creep.moveTo(wall[0], {visualizePathStyle: {stroke: '#ffffff'}});
					//     }
					// 	//console.log(creep.name+creep.repair(wall[0])+wall[0])

					// }

					// if(creep.upgradeController(Game.rooms['W54N8'].controller) == ERR_NOT_IN_RANGE){
					// 	creep.moveTo(Game.rooms['W54N8'].controller)
					// }
					// var terminal = Game.getObjectById('62f1937058d9be36fc173f90');
					// if(terminal.store.getFreeCapacity() > 0){
					// 	if(creep.transfer(terminal, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE){
					// 		creep.moveTo(terminal);
					// 	}
					// }




				}
				else {
					// const a = Game.getObjectById('62f1937058d9be36fc173f90');
					// if(creep.withdraw(a,RESOURCE_ENERGY)== ERR_NOT_IN_RANGE){
					// 	creep.moveTo(a);
					// }  
					// var pos = new RoomPosition(13, 16,'W54N8')
					// creep.moveTo(pos)
				var sources = creep.room.find(FIND_SOURCES);
					if(creep.harvest(sources[1]) == ERR_NOT_IN_RANGE) {
						creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});               
					}
					if(sources[1].energy == 0 || !sources[1]){
						if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
							creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});               
						}
					}
				}
		}
	    

	}, /** @param {Creep} creep **/
    build: function(creep) {

	    if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.building = false;
            creep.say('🔄 harvest');
	    }
	    if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
	        creep.memory.building = true;
	        creep.say('🚧 build');
	    }

			if(creep.memory.building) {

				var pos = new RoomPosition(39, 37,'W51N9')
				//creep.moveTo(pos);
				var targets = creep.room.find(FIND_CONSTRUCTION_SITES);
				//console.log(creep.build(targets[0]))
				if(targets.length) {
					if(creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
						creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
					}
				 }
				// if(creep.room == room){
					// if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
					// 	creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
					// }
				// }


			}
			else {
				// const a = Game.getObjectById('630a6644fa0c7fa90271c276');
				// if(creep.withdraw(a,RESOURCE_ENERGY )== ERR_NOT_IN_RANGE){
				// 	creep.moveTo(a);
				// }  
				// var pos = new RoomPosition(39, 35,'W51N9')
				// creep.moveTo(pos);
				var sources = creep.room.find(FIND_SOURCES);
				if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
				    creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
				}
				// var targets = creep.room.find(FIND_STRUCTURES, {
				// 	filter: (structure) => {
				// 		return (structure.structureType == STRUCTURE_STORAGE)
				// 	}
				// 	});
				// if(creep.withdraw(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
				// 	creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
				// }
			}
	    

	}
};

module.exports = roleBuilder;