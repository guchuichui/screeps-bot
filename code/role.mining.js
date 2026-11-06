  
  
var roleMining = {
  
  
    mining: function(creep) {
        if(creep) {
            var sources = creep.room.find(FIND_MINERALS);
            if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
    },
    carry: function (creep){

    //采集能量
    var continal_mineral = Game.getObjectById('633553d235a761345e2fd718');
    var container_mid = Game.getObjectById('63352cf79171af246fdd1ae1');
    var container_top = Game.getObjectById('63352f3de49929a07653e904');
    var container_bot = Game.getObjectById('6335308f0d3f3c2f65752434');

    var storage = Game.getObjectById('62e6e7cbcc1631245f7a0b01'); 


    creep.stateChange()
    var targets = creep.room.find(FIND_STRUCTURES, {
        filter: (structure) => {
            
            return ( structure.structureType == STRUCTURE_LAB ||
                    structure.structureType == STRUCTURE_EXTENSION ||
                    structure.structureType == STRUCTURE_POWER_SPAWN
                    ) && 
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > structure.store.getCapacity(RESOURCE_ENERGY)*0.2 ;
        }
    });
    if(!creep.memory.state){

        // if(creep.store.getFreeCapacity() > 0 && continal_mineral.store.getUsedCapacity() > 400) {
        //     if(creep.withdraw(continal_mineral, RESOURCE_ZYNTHIUM) == ERR_NOT_IN_RANGE) {
        //         creep.moveTo(continal_mineral);
        //     }                
        // }else{
             if(targets){
                    const terminal = Game.getObjectById('62e6e7cbcc1631245f7a0b01');
                    if(creep.withdraw(terminal,RESOURCE_ENERGY) == ERR_NOT_IN_RANGE){
                        creep.moveTo(terminal)
                    }
                }else{
                    creep.moveTo(31,44);
                }
        //}



    }else{


        var terminal = Game.getObjectById('62e6e7cbcc1631245f7a0b01');
        if(creep.store[RESOURCE_ZYNTHIUM] > 1){
            if(creep.transfer(terminal, RESOURCE_ZYNTHIUM) == ERR_NOT_IN_RANGE) {
                creep.moveTo(terminal);
             }
        }else{

            
                if(targets){
                    if(creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE){
                        creep.moveTo(targets[0]);
                    }
                    
                }else
                if(creep.transfer(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE){
                    creep.moveTo(storage);
                }else{
                    creep.moveTo(31,44);
                }
            
        }






            // if(creep.transfer(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
            //     creep.moveTo(storage);
            //  }       

            // else{
            //     creep.moveTo(31,44);
            // }               
        }
    }

}

module.exports = roleMining;