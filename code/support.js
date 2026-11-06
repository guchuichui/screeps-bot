var support = {

    /** @param {Creep} creep **/
    W51N9build: function(creep) {

	    if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.building = false;
            creep.say('🔄 harvest');
            creep.say('🔄 harvest');
            
	    }
	    if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
	        creep.memory.building = true;
	        creep.say('🚧 build');
	    }

			if(creep.memory.building) {

				var targets = creep.room.find(FIND_CONSTRUCTION_SITES);
				if(targets.length) {
					if(creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
						creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
					}
				}

                if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
                }

			}
			else {
                const startnRoom = Game.rooms['W57N13']
                const transferStation = Game.rooms['W53N12']
                const destinationRoom = Game.rooms['W51N9']
                if(creep.room == startnRoom){
                    creep.memory.transfer = true;
                }               
				if(creep.room == transferStation){
					creep.memory.transfer = false;
				}
                if(creep.room == destinationRoom){
					creep.memory.transfer = null;
				}

                var transferPos = new RoomPosition(5,23,'W53N12')
                var destination = new RoomPosition(45,10,'W51N9')

                if(creep.memory.transfer == true){
                    creep.moveTo(transferPos)
                }else if(creep.memory.transfer == false){
                    creep.moveTo(destination)
                }else if(creep.memory.transfer == null){
                    var sources = creep.room.find(FIND_SOURCES);
                    if(creep.harvest(sources[1]) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});
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

				var targets = creep.room.find(FIND_CONSTRUCTION_SITES);
				if(targets.length) {
					if(creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
						creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
					}
				}

                if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
                }


			}
			else {
                const startnRoom = Game.rooms['W57N13']
                const transferStation = Game.rooms['W53N12']
                const destinationRoom = Game.rooms['W51N9']
                if(creep.room == startnRoom){
                    creep.memory.transfer = true;
                }               
				if(creep.room == transferStation){
					creep.memory.transfer = false;
				}
                if(creep.room == destinationRoom){
					creep.memory.transfer = null;
				}

                var transferPos = new RoomPosition(5,23,'W53N12')
                var destination = new RoomPosition(45,10,'W51N9')

                if(creep.memory.transfer == true){
                    creep.moveTo(transferPos)
                }else if(creep.memory.transfer == false){
                    creep.moveTo(destination)
                }else if(creep.memory.transfer == null){
                    var sources = creep.room.find(FIND_SOURCES);
                    if(creep.harvest(sources[1]) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                }
			}
	    

	}
};

module.exports = support;