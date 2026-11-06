
var roleTower = {


    run : function(){

        this.towerUtil('W57N13',1000000,900000,50000)
        this.towerUtil('W58N12',600000,0,100000)
        this.towerUtil('W55N13',4000000,3900000,3000000)
        //this.towerUtil('W54N8',10000,0,0)
    },
    towerUtil : function(roomName,rampartMaxHits,rampartMinHits,rampartOtherHits){
        const towers = Game.rooms[roomName].find(FIND_STRUCTURES, {
            filter: { structureType: STRUCTURE_TOWER }
        });

        const hostileCreeps = Game.rooms[roomName].find(FIND_HOSTILE_CREEPS);

        const damagedStructure = Game.rooms[roomName].find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType != STRUCTURE_WALL 
                        && structure.structureType != STRUCTURE_RAMPART )
                        && structure.hits < structure.hitsMax*0.8
            }    
        });

        if(hostileCreeps.length){
            for (const tower of towers) {
                if(tower.store.getUsedCapacity(RESOURCE_ENERGY) > 500){
                    tower.attack(hostileCreeps[0])
                }
            }
        }else if(damagedStructure.length){
            for (const tower of towers) {
                if(tower.store.getUsedCapacity(RESOURCE_ENERGY) > 0){
                    tower.repair(damagedStructure[0])
                }
            }
        }else{
            const rampartStructure = Game.rooms[roomName].find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (  structure.structureType == STRUCTURE_RAMPART )
                            &&(     structure.hits < rampartOtherHits
                                || (structure.hits < rampartMaxHits  && structure.hits > rampartMinHits)
                              )            
                }    
            });
            if(rampartStructure.length){
                for (const tower of towers) {
                    if(tower.store.getUsedCapacity(RESOURCE_ENERGY) > 0){
                         var a = tower.repair(rampartStructure[0])
                    }
                }
            }
        }
        
    },

}

module.exports = roleTower;

