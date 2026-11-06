var roleLab = {

    lab: function (){

        this.boostCreep('W58N12')
        this.boostCreep('W55N13')
     
    },

    boostCreep : function(roomname){

        var labs =  Game.rooms[roomname].find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType == STRUCTURE_LAB) && 
                        structure.store.getUsedCapacity(RESOURCE_CATALYZED_LEMERGIUM_ACID) > 0;
            }
        });
        for (const lab of labs) {
            const boost = lab.pos.findInRange(FIND_CREEPS,1);
            if(boost.length){
                lab.boostCreep(boost[0])
            }
        }
    }

};
module.exports = roleLab;
